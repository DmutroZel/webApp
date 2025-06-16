const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(id => parseInt(id));
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(cors());

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  maxPoolSize: 10,
  minPoolSize: 5,
}).then(() => console.log("✅ Підключено до MongoDB")).catch(err => {
  console.error("❌ Помилка підключення до MongoDB:", err);
  process.exit(1);
});

mongoose.connection.on('error', err => console.error('❌ MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.log('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('📋 MongoDB connection closed');
  process.exit(0);
});

const categorySchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String
});

const menuSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  description: String,
  price: Number,
  image: String,
  category: String
});

const orderSchema = new mongoose.Schema({
  chatId: String,
  userName: String,
  items: [{ id: Number, name: String, price: Number, quantity: Number }],
  total: Number,
  status: { type: String, default: "Очікується" },
  dateTime: { type: Date, default: Date.now }
});

const Category = mongoose.model("Category", categorySchema);
const Menu = mongoose.model("Menu", menuSchema);
const Order = mongoose.model("Order", orderSchema);

async function initData() {
  if (await Category.countDocuments() === 0) {
    const initialCategories = [
      { id: "all", name: "Всі" },
      { id: "pizza", name: "Піца" },
      { id: "burger", name: "Бургери" },
      { id: "sushi", name: "Суші" },
      { id: "dessert", name: "Десерти" },
      { id: "drink", name: "Напої" }
    ];
    await Category.insertMany(initialCategories);
    console.log("📋 Категорії ініціалізовано");
  }

  if (await Menu.countDocuments() === 0) {
    const initialMenu = [
      { id: 1, name: "Маргарита", description: "Класична піца...", price: 180, image: "/api/placeholder/200/120", category: "pizza" },
      { id: 2, name: "Пепероні", description: "Піца з гострою...", price: 200, image: "/api/placeholder/200/120", category: "pizza" },
      { id: 3, name: "Класичний бургер", description: "Соковитий бургер...", price: 160, image: "/api/placeholder/200/120", category: "burger" }
    ];
    await Menu.insertMany(initialMenu);
    console.log("📋 Меню ініціалізовано");
  }
}
initData();

bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, "👋 Відкрий WebApp", {
    reply_markup: {
      keyboard: [[{ text: "🛒 Замовити їжу", web_app: { url: process.env.WEBAPP_URL } }]],
      resize_keyboard: true
    }
  });
});

bot.on("message", async msg => {
  if (msg.web_app_data) {
    const data = JSON.parse(msg.web_app_data.data);
    const chatId = data.chatId && data.chatId !== "unknown" ? data.chatId : msg.chat.id.toString();
    const userName = data.userName && data.userName !== "unknown" ? data.userName : (msg.from.username || "Анонім");
    const order = new Order({
      chatId,
      userName,
      items: data.items,
      total: data.total,
      status: "Очікується",
      dateTime: new Date(data.dateTime)
    });
    await order.save();
    try {
      await bot.sendMessage(chatId, `Дякуємо за замовлення! Статус: Очікується.`);
    } catch (err) {
      console.error(`Помилка надсилання клієнту (${chatId}):`, err.message);
    }
    const orderDetails = data.items.map(item => `${item.name} x${item.quantity} - ${item.price * item.quantity} грн`).join("\n");
    ADMIN_IDS.forEach(adminId => {
      try {
        bot.sendMessage(adminId, `Нове замовлення від @${userName} (ID: ${chatId}):\n${orderDetails}\nСума: ${data.total} грн`);
      } catch (err) {
        console.error(`Помилка надсилання адміну (${adminId}):`, err.message);
      }
    });
  }
});

app.get("/categories", async (req, res) => {
  const categories = await Category.find();
  res.json(categories);
});

app.post("/categories", async (req, res) => {
  const { adminId, id, name } = req.body;
  if (!ADMIN_IDS.includes(parseInt(adminId))) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  try {
    const category = new Category({ id, name });
    await category.save();
    res.json({ success: true, category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/categories/:id", async (req, res) => {
  const { adminId } = req.body;
  if (!ADMIN_IDS.includes(parseInt(adminId))) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  await Category.findOneAndDelete({ id: req.params.id });
  res.json({ success: true });
});

app.get("/menu", async (req, res) => {
  const menu = await Menu.find();
  res.json(menu);
});

app.post("/menu", async (req, res) => {
  const { adminId, name, description, price, image, category } = req.body;
  if (!ADMIN_IDS.includes(parseInt(adminId))) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  const lastItem = await Menu.findOne().sort({ id: -1 });
  const newId = lastItem ? lastItem.id + 1 : 1;
  const newItem = new Menu({ id: newId, name, description, price, image: image || "/api/placeholder/200/120", category });
  await newItem.save();
  res.json({ success: true, item: newItem });
});

app.delete("/menu/:id", async (req, res) => {
  const { adminId } = req.body;
  if (!ADMIN_IDS.includes(parseInt(adminId))) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  await Menu.findOneAndDelete({ id: parseInt(req.params.id) });
  res.json({ success: true });
});

app.get("/orders", async (req, res) => {
  const { adminId } = req.query;
  if (!ADMIN_IDS.includes(parseInt(adminId))) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  const orders = await Order.find().sort({ dateTime: -1 });
  res.json(orders);
});

app.post("/orders/update-status/:id", async (req, res) => {
  const { adminId, status } = req.body;
  if (!ADMIN_IDS.includes(parseInt(adminId))) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Замовлення не знайдено" });
  }
  order.status = status;
  await order.save();
  bot.sendMessage(order.chatId, `Статус замовлення: ${status}`);
  res.json({ success: true });
});

app.get("/admin", (req, res) => {
  const adminId = parseInt(req.query.adminId);
  if (!ADMIN_IDS.includes(adminId)) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

bot.onText(/\/admin/, msg => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "❌ Доступ заборонено");
  }
  bot.sendMessage(chatId, "👨‍💼 Панель адміна", {
    reply_markup: {
      inline_keyboard: [[{ text: "📋 Замовлення", web_app: { url: `${process.env.WEBAPP_URL}/admin?adminId=${chatId}` } }]]
    }
  });
});

app.listen(PORT, () => console.log(`🌐 Сервер запущено на http://localhost:${PORT}`));