const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");

// NEW: Additional modules
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer');
const fs = require('fs');

dotenv.config();

const app = express();
// NEW: Create HTTP server for Socket.IO
const server = http.createServer(app); 
// NEW: Initialize Socket.IO
const io = new Server(server, {
    cors: {
      origin: "*", // Allow all origins for simplicity, restrict in production
      methods: ["GET", "POST"]
    }
}); 

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(id => parseInt(id));
const WEBAPP_URL = process.env.WEBAPP_URL;

const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`${WEBAPP_URL}/bot${TELEGRAM_TOKEN}`);

// --- Middleware ---
app.use(cors());
app.use(express.static(path.join(__dirname, "public"))); // Serve ALL static files from 'public'
app.use(bodyParser.json());

// --- Multer Setup for Image Uploads ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'public/images/menu');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// --- MongoDB Connection & Schema (Unchanged from your code) ---
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 5,
})
.then(() => console.log("✅ Підключено до MongoDB"))
.catch(err => {
    console.error("❌ Помилка підключення до MongoDB:", err);
    process.exit(1);
});

mongoose.connection.on('error', (err) => console.error('❌ MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.log('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));

const menuSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
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
    bot.sendMessage(msg.chat.id, "👋 Вітаємо у FoodNow! Оберіть дію:", {
      reply_markup: {
        keyboard: [
          [{ text: "🛒 Замовити їжу", web_app: { url: WEBAPP_URL } }],
          // NEW: Button to see own orders
          [{ text: "📊 Мої замовлення", web_app: { url: `${WEBAPP_URL}/orders.html?userId=${msg.chat.id}` } }]
        ],
        resize_keyboard: true,
      },
    });
  });

bot.on("message", async (msg) => {
  if (msg.web_app_data) {
    try {
        const data = JSON.parse(msg.web_app_data.data);
        console.log("Отримано дані з WebApp:", data);
        
        const chatId = data.chatId && data.chatId !== "unknown" ? data.chatId.toString() : msg.chat.id.toString();
        const userName = data.userName && data.userName !== "unknown" ? data.userName : (msg.from.username || "Анонім");
        
        const order = new Order({
          chatId,
          userName,
          items: data.items,
          total: data.total,
          status: "Очікується",
          dateTime: new Date(data.dateTime),
        });
        
        await order.save();
        console.log("Замовлення збережено:", order._id);
        
        const orderIdShort = order._id.toString().slice(-6).toUpperCase();
        await bot.sendMessage(chatId, `✅ Дякуємо! Ваше замовлення №${orderIdShort} прийнято.\nСтатус: Очікується\nСума: ${data.total} грн`);
        
        const orderDetails = data.items.map(item => `• ${item.name} x${item.quantity} - ${item.price * item.quantity} грн`).join("\n");
        
        for (const adminId of ADMIN_IDS) {
            await bot.sendMessage(adminId, 
                `🔔 *Нове замовлення №${orderIdShort}*\n\n` +
                `*Від:* @${userName} (ID: \`${chatId}\`)\n` +
                `*Склад:*\n${orderDetails}\n` +
                `*Загальна сума:* ${data.total} грн\n` +
                `*Час:* ${new Date().toLocaleString('uk-UA')}`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error("❌ Помилка обробки замовлення:", error);
    }
  }
});

// NEW: Handler for /admin command
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    if (!ADMIN_IDS.includes(chatId)) {
      return bot.sendMessage(chatId, "❌ Вибачте, у вас немає доступу до цієї команди.");
    }
    bot.sendMessage(chatId, "👨‍💼 Панель адміністратора. Натисніть, щоб увійти:", {
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

// --- MENU API (CRUD) ---
app.get("/api/menu", async (req, res) => {
  const menu = await Menu.find().sort({ id: 1 });
  res.json(menu);
});

app.post("/api/menu", upload.single('image'), async (req, res) => {
    const { adminId, name, description, price, category } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });
    
    const lastItem = await Menu.findOne().sort({ id: -1 });
    const newId = lastItem ? lastItem.id + 1 : 1;
    
    const imageUrl = req.file ? `/images/menu/${req.file.filename}` : "/images/logoFoodNow.png"; // Default image

    const newItem = new Menu({ id: newId, name, description, price, category, image: imageUrl });
    await newItem.save();
    res.status(201).json({ success: true, item: newItem });
});

app.put("/api/menu/:id", upload.single('image'), async (req, res) => {
    const { adminId, name, description, price, category } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });

    let updateData = { name, description, price, category };
    if (req.file) {
        // Optionally delete old image
        const oldItem = await Menu.findOne({id: req.params.id});
        if (oldItem && oldItem.image && oldItem.image.startsWith('/images/menu/')) {
            fs.unlink(path.join(__dirname, 'public', oldItem.image), err => { if(err) console.error("Error deleting old image:", err); });
        }
        updateData.image = `/images/menu/${req.file.filename}`;
    }

    const updatedItem = await Menu.findOneAndUpdate({id: req.params.id}, updateData, { new: true });
    if (!updatedItem) return res.status(404).json({error: "Товар не знайдено"});
    res.json({ success: true, item: updatedItem });
});

app.delete("/api/menu/:id", async (req, res) => {
    // Note: adminId should be sent in the request body for DELETE
    const { adminId } = req.body;
    if (!ADMIN_IDS.includes(parseInt(adminId))) return res.status(403).json({ error: "Доступ заборонено" });

    const deletedItem = await Menu.findOneAndDelete({id: req.params.id});
    if (!deletedItem) return res.status(404).json({error: "Товар не знайдено"});
    
    if (deletedItem.image && deletedItem.image.startsWith('/images/menu/')) {
        fs.unlink(path.join(__dirname, 'public', deletedItem.image), err => { if(err) console.error("Error deleting image file:", err); });
    }
    res.json({ success: true, message: "Товар видалено" });
});


// --- ORDERS API ---
app.get("/api/orders", async (req, res) => {
  const { adminId, userId } = req.query;
  let query = {};
  if (adminId && ADMIN_IDS.includes(parseInt(adminId))) {
      query = {}; // Admin gets all orders
  } else if (userId) {
      query = { chatId: userId }; // User gets only their orders
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
    
    const orderIdShort = order._id.toString().slice(-6).toUpperCase();
    bot.sendMessage(order.chatId, `🔔 Статус вашого замовлення №*${orderIdShort}* оновлено: *${status}*`, {parse_mode: 'Markdown'});
    
    const userSocketId = userSockets[order.chatId];
    if (userSocketId) {
      io.to(userSocketId).emit('status_updated', { orderId: order._id, status: order.status });
    }

    res.json({ success: true, order });
});


// Start server
server.listen(PORT, () => console.log(`🚀 Сервер запущено на http://localhost:${PORT}`));