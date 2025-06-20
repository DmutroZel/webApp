const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer'); // NEW: For file uploads
const fs = require('fs'); // NEW: For file system operations

dotenv.config();

const app = express();
const server = http.createServer(app); // NEW: Create HTTP server for Socket.IO
const io = new Server(server); // NEW: Initialize Socket.IO

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(id => parseInt(id));
const WEBAPP_URL = process.env.WEBAPP_URL;

const bot = new (require("node-telegram-bot-api"))(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBAPP_URL}/bot${TELEGRAM_TOKEN}`);

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve static files from 'public'

// --- Multer Setup for Image Uploads ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/images/menu';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  }
});
const upload = multer({ storage: storage });

// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
.then(() => console.log("✅ Підключено до MongoDB"))
.catch(err => console.error("❌ Помилка підключення до MongoDB:", err));

// --- Mongoose Schemas ---
const menuSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  description: String,
  price: Number,
  image: String,
  category: String,
});
const orderSchema = new mongoose.Schema({
  chatId: String,
  userName: String,
  items: [{ id: Number, name: String, price: Number, quantity: Number }],
  total: Number,
  status: { type: String, default: "Очікується" },
  dateTime: { type: Date, default: Date.now },
});

const Menu = mongoose.model("Menu", menuSchema);
const Order = mongoose.model("Order", orderSchema);

// --- WebSocket Logic ---
const userSockets = {};
io.on('connection', (socket) => {
  console.log('🔗 Користувач підключився через WebSocket:', socket.id);
  socket.on('register', (userId) => {
    userSockets[userId] = socket.id;
    console.log(`👤 Користувач ${userId} зареєстрований з сокетом ${socket.id}`);
  });
  socket.on('disconnect', () => {
    for (const userId in userSockets) {
      if (userSockets[userId] === socket.id) {
        delete userSockets[userId];
        console.log(`👻 Користувач ${userId} відключився.`);
        break;
      }
    }
  });
});

// --- Telegram Bot Logic ---
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Вітаємо у FoodNow!", {
    reply_markup: {
      keyboard: [
        [{ text: "🛒 Замовити їжу", web_app: { url: WEBAPP_URL } }],
        [{ text: "📊 Мої замовлення", web_app: { url: `${WEBAPP_URL}/orders.html?userId=${msg.chat.id}` } }]
      ],
      resize_keyboard: true,
    },
  });
});

bot.on("message", async (msg) => {
  if (msg.web_app_data) {
    // ... (Ваша існуюча логіка обробки замовлення залишається тут)
    // Я додам тільки відправку оновлення через сокети
    try {
        const data = JSON.parse(msg.web_app_data.data);
        const order = new Order({
          
        })
        await order.save();
        
        // Повідомлення адмінам...
        const adminSocketId = userSockets['admin_panel']; // Припускаючи, що адмінка теж може реєструватися
        if(adminSocketId) {
            io.to(adminSocketId).emit('new_order', order);
        }

    } catch (error) {
        console.error("❌ Помилка обробки замовлення:", error);
    }
  }
});

bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    if (!ADMIN_IDS.includes(chatId)) {
      return bot.sendMessage(chatId, "❌ Доступ заборонено");
    }
    bot.sendMessage(chatId, "👨‍💼 Відкриття панелі адміна...", {
      reply_markup: {
        inline_keyboard: [[{ text: "🚀 Увійти в адмін-панель", web_app: { url: `${WEBAPP_URL}/admin.html?adminId=${chatId}` } }]],
      },
    });
  });

// --- API Routes ---
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Menu Routes
app.get("/api/menu", async (req, res) => {
  const menu = await Menu.find().sort({id: 1});
  res.json(menu);
});

app.post("/api/menu", upload.single('image'), async (req, res) => {
    const { adminId, name, description, price, category } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });
    
    const lastItem = await Menu.findOne().sort({ id: -1 });
    const newId = lastItem ? lastItem.id + 1 : 1;
    
    const imageUrl = req.file ? `/images/menu/${req.file.filename}` : "/images/placeholder.png";

    const newItem = new Menu({ id: newId, name, description, price, category, image: imageUrl });
    await newItem.save();
    res.json({ success: true, item: newItem });
});

app.put("/api/menu/:id", upload.single('image'), async (req, res) => {
    const { adminId, name, description, price, category } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });

    const updateData = { name, description, price, category };
    if (req.file) {
        updateData.image = `/images/menu/${req.file.filename}`;
    }

    const updatedItem = await Menu.findOneAndUpdate({id: req.params.id}, updateData, { new: true });
    if (!updatedItem) return res.status(404).json({error: "Товар не знайдено"});
    res.json({ success: true, item: updatedItem });
});

app.delete("/api/menu/:id", async (req, res) => {
    const { adminId } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });

    const deletedItem = await Menu.findOneAndDelete({id: req.params.id});
    if (!deletedItem) return res.status(404).json({error: "Товар не знайдено"});
    // Optionally delete the image file from storage
    if (deletedItem.image && deletedItem.image.includes('/images/menu/')) {
        fs.unlink(path.join(__dirname, 'public', deletedItem.image), err => {
            if(err) console.log("Помилка видалення файлу зображення:", err);
        });
    }
    res.json({ success: true });
});

// Order Routes
app.get("/api/orders", async (req, res) => {
  const { adminId, userId } = req.query;
  let query = {};

  if (adminId && ADMIN_IDS.includes(parseInt(adminId))) {
      // Admin gets all orders
      query = {};
  } else if (userId) {
      // User gets only their orders
      query = { chatId: userId };
  } else {
      return res.status(403).json({ error: "Доступ заборонено" });
  }

  const orders = await Order.find(query).sort({ dateTime: -1 });
  res.json(orders);
});

app.post("/api/orders/update-status/:id", async (req, res) => {
    const { adminId, status } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Замовлення не знайдено" });

    order.status = status;
    await order.save();
    
    // Notify user via Telegram Bot
    bot.sendMessage(order.chatId, `🔔 Статус вашого замовлення №${order._id.toString().slice(-6)} оновлено: *${status}*`, {parse_mode: 'Markdown'});
    
    // Notify user via WebSocket
    const userSocketId = userSockets[order.chatId];
    if (userSocketId) {
      io.to(userSocketId).emit('status_updated', { orderId: order._id, status: order.status });
    }

    res.json({ success: true, order });
});

// --- HTML file serving ---
// The static middleware already handles this, but you can define explicit routes if needed
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/orders.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

// Start server
server.listen(PORT, () => console.log(`🚀 Сервер запущено на http://localhost:${PORT}`));