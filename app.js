const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");

dotenv.config();

// Ініціалізація додатку та сервера
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
const PORT = process.env.PORT || 3000;

// Конфігурація
const config = {
  MONGODB_URI: process.env.MONGODB_URI,
  WEBAPP_URL: process.env.WEBAPP_URL,
  ADMIN_IDS: process.env.ADMIN_IDS.split(",").map(Number),
};

// Налаштування WebHook
bot.setWebHook(`${config.WEBAPP_URL}/bot${process.env.TELEGRAM_TOKEN}`);

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// Налаштування Multer для завантаження зображень
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "public/images/menu");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// MongoDB підключення
mongoose
  .connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 5,
  })
  .then(() => console.log("✅ Підключено до MongoDB"))
  .catch((err) => {
    console.error("❌ Помилка підключення до MongoDB:", err);
    process.exit(1);
  });

mongoose.connection.on("error", (err) =>
  console.error("❌ MongoDB connection error:", err)
);
mongoose.connection.on("disconnected", () =>
  console.log("⚠️ MongoDB disconnected")
);
mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));

// Схеми MongoDB
const menuSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  name: String,
  description: String,
  price: Number,
  image: String,
  category: String,
  ratings: { type: [Number], default: [] },
  averageRating: { type: Number, default: 0 },
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

// WebSocket логіка
const userSockets = {};
io.on("connection", (socket) => {
  console.log(`🔗 Користувач підключився: ${socket.id}`);
  socket.on("register", (userId) => {
    userSockets[userId] = socket.id;
    console.log(`👤 Користувач ${userId} зареєстрований`);
  });
  socket.on("disconnect", () => {
    for (const [userId, socketId] of Object.entries(userSockets)) {
      if (socketId === socket.id) {
        delete userSockets[userId];
        console.log(`👻 Користувач ${userId} відключився`);
        break;
      }
    }
  });
});

// Telegram Bot логіка
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Вітаємо у FoodNow! Оберіть дію:", {
    reply_markup: {
      keyboard: [
        [{ text: "🛒 Замовити їжу", web_app: { url: config.WEBAPP_URL } }],
        [
          {
            text: "📊 Мої замовлення",
            web_app: { url: `${config.WEBAPP_URL}/orders.html?userId=${msg.chat.id}` },
          },
        ],
      ],
      resize_keyboard: true,
    },
  });
});

bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (!config.ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "❌ У вас немає доступу до цієї команди.");
  }
  bot.sendMessage(chatId, "👨‍💼 Панель адміністратора:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚀 Увійти в адмін-панель",
            web_app: { url: `${config.WEBAPP_URL}/admin.html?adminId=${chatId}` },
          },
        ],
      ],
    },
  });
});

bot.on("message", async (msg) => {
  if (!msg.web_app_data) return;

  try {
    const data = JSON.parse(msg.web_app_data.data);
    const chatId =
      data.chatId && data.chatId !== "unknown"
        ? data.chatId.toString()
        : msg.chat.id.toString();
    const userName =
      data.userName && data.userName !== "unknown"
        ? data.userName
        : msg.from.username || "Анонім";

    const order = new Order({
      chatId,
      userName,
      items: data.items,
      total: data.total,
      status: "Очікується",
      dateTime: new Date(data.dateTime),
    });

    await order.save();
    const orderIdShort = order._id.toString().slice(-6).toUpperCase();

    await bot.sendMessage(
      chatId,
      `✅ Замовлення №${orderIdShort} прийнято.\nСтатус: Очікується\nСума: ${data.total} грн`
    );

    const orderDetails = data.items
      .map((item) => `• ${item.name} x${item.quantity} - ${item.price * item.quantity} грн`)
      .join("\n");

    for (const adminId of config.ADMIN_IDS) {
      await bot.sendMessage(
        adminId,
        `🔔 *Нове замовлення №${orderIdShort}*\n\n` +
          `*Від:* @${userName} (ID: \`${chatId}\`)\n` +
          `*Склад:*\n${orderDetails}\n` +
          `*Сума:* ${data.total} грн\n` +
          `*Час:* ${new Date().toLocaleString("uk-UA")}`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("❌ Помилка обробки замовлення:", error);
  }
});

// API маршрути
app.post(`/bot${process.env.TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Menu API
app.get("/api/menu", async (req, res) => {
  try {
    const menu = await Menu.find().sort({ id: 1 });
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/menu/recommendations/:id", async (req, res) => {
  try {
    const currentItemId = parseInt(req.params.id);
    const currentItem = await Menu.findOne({ id: currentItemId });
    if (!currentItem) {
      return res.status(404).json({ error: "Товар не знайдено" });
    }

    const recommendations = await Menu.aggregate([
      { $match: { category: currentItem.category, id: { $ne: currentItemId } } },
      { $sample: { size: 3 } },
    ]);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/menu", upload.single("image"), async (req, res) => {
  try {
    const { adminId, name, description, price, category } = req.body;
    if (!config.ADMIN_IDS.includes(parseInt(adminId))) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }

    const lastItem = await Menu.findOne().sort({ id: -1 });
    const newId = lastItem ? lastItem.id + 1 : 1;
    const imageUrl = req.file ? `/images/menu/${req.file.filename}` : "/images/logoFoodNow.png";

    const newItem = new Menu({ id: newId, name, description, price, category, image: imageUrl });
    await newItem.save();
    res.status(201).json({ success: true, item: newItem });
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.put("/api/menu/:id", upload.single("image"), async (req, res) => {
  try {
    const { adminId, name, description, price, category } = req.body;
    if (!config.ADMIN_IDS.includes(parseInt(adminId))) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }

    const updateData = { name, description, price, category };
    if (req.file) {
      const oldItem = await Menu.findOne({ id: req.params.id });
      if (oldItem?.image?.startsWith("/images/menu/")) {
        fs.unlink(path.join(__dirname, "public", oldItem.image), (err) =>
          err && console.error("Помилка видалення старого зображення:", err)
        );
      }
      updateData.image = `/images/menu/${req.file.filename}`;
    }

    const updatedItem = await Menu.findOneAndUpdate(
      { id: req.params.id },
      updateData,
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).json({ error: "Товар не знайдено" });
    }
    res.json({ success: true, item: updatedItem });
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.delete("/api/menu/:id", async (req, res) => {
  try {
    const { adminId } = req.body;
    if (!config.ADMIN_IDS.includes(parseInt(adminId))) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }

    const deletedItem = await Menu.findOneAndDelete({ id: req.params.id });
    if (!deletedItem) {
      return res.status(404).json({ error: "Товар не знайдено" });
    }

    if (deletedItem.image?.startsWith("/images/menu/")) {
      fs.unlink(path.join(__dirname, "public", deletedItem.image), (err) =>
        err && console.error("Помилка видалення зображення:", err)
      );
    }
    res.json({ success: true, message: "Товар видалено" });
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/menu/:id/rate", async (req, res) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Неправильний рейтинг" });
    }

    const item = await Menu.findOne({ id: req.params.id });
    if (!item) {
      return res.status(404).json({ error: "Товар не знайдено" });
    }

    item.ratings.push(rating);
    item.averageRating = Number(
      (item.ratings.reduce((acc, r) => acc + r, 0) / item.ratings.length).toFixed(1)
    );

    await item.save();
    res.json({ success: true, averageRating: item.averageRating });
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// Orders API
app.get("/api/orders", async (req, res) => {
  try {
    const { adminId, userId } = req.query;
    const query = adminId && config.ADMIN_IDS.includes(parseInt(adminId))
      ? {}
      : userId ? { chatId: userId } : {};

    const orders = await Order.find(query).sort({ dateTime: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/orders/update-status/:id", async (req, res) => {
  try {
    const { adminId, status } = req.body;
    if (!config.ADMIN_IDS.includes(parseInt(adminId))) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Замовлення не знайдено" });
    }

    order.status = status;
    await order.save();

    const orderIdShort = order._id.toString().slice(-6).toUpperCase();
    await bot.sendMessage(
      order.chatId,
      `🔔 Статус замовлення №*${orderIdShort}*: *${status}*`,
      { parse_mode: "Markdown" }
    );

    const userSocketId = userSockets[order.chatId];
    if (userSocketId) {
      io.to(userSocketId).emit("status_updated", {
        orderId: order._id,
        status,
      });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/analytics/summary", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!config.ADMIN_IDS.includes(parseInt(adminId))) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }

    const salesByCategory = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "menus",
          localField: "items.id",
          foreignField: "id",
          as: "menuItem",
        },
      },
      { $unwind: "$menuItem" },
      {
        $group: {
          _id: "$menuItem.category",
          totalSales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { totalSales: -1 } },
    ]);

    const topSellingItems = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
    ]);

    res.json({ salesByCategory, topSellingItems });
  } catch (error) {
    console.error("Помилка отримання аналітики:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// Запуск сервера
server.listen(PORT, () => console.log(`🚀 Сервер запущено на http://localhost:${PORT}`));