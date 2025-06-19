const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const PORT = process.env.PORT || 3000;

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(id => parseInt(id));

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(cors());


mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 30000, // 30 секунд для підключення
  socketTimeoutMS: 45000, // 45 секунд для операцій
  connectTimeoutMS: 30000, // 30 секунд для initial connection
  maxPoolSize: 10, // Максимум 10 з'єднань в пулі
  minPoolSize: 5, // Мінімум 5 з'єднань в пулі
})
.then(() => console.log("✅ Підключено до MongoDB"))
.catch(err => {
  console.error("❌ Помилка підключення до MongoDB:", err);
  process.exit(1); // Завершити процес при критичній помилці
});

// Також додай обробку помилок з'єднання:
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});
bot.on('message', (msg) => {
  console.log('📨 Отримано повідомлення:', {
    chat_id: msg.chat.id,
    from: msg.from?.username || 'Анонім',
    text: msg.text,
    web_app_data: !!msg.web_app_data
  });
});
// Додай graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('📋 MongoDB connection closed');
  process.exit(0);
});

const menuSchema = new mongoose.Schema({
  id: Number,
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


async function initMenu() {
  if (await Menu.countDocuments() === 0) {
    const initialMenu = [
      { id: 1, name: "Маргарита", description: "Класична піца...", price: 180, image: "/api/placeholder/200/120", category: "pizza" },
      { id: 2, name: "Пепероні", description: "Піца з гострою...", price: 200, image: "/api/placeholder/200/120", category: "pizza" },
      { id: 3, name: "Класичний бургер", description: "Соковитий бургер...", price: 160, image: "/api/placeholder/200/120", category: "burger" },
    ];
    await Menu.insertMany(initialMenu);
    console.log("📋 Меню ініціалізовано");
  }
}
initMenu();


bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Відкрий WebApp", {
    reply_markup: {
      keyboard: [[{ text: "🛒 Замовити їжу", web_app: { url: process.env.WEBAPP_URL } }]],
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
      
      // Надсилання повідомлення клієнту
      try {
        await bot.sendMessage(chatId, `✅ Дякуємо за замовлення!\n📋 Номер замовлення: ${order._id}\n⏰ Статус: Очікується\n💰 Сума: ${data.total} грн`);
        console.log(`Повідомлення надіслано клієнту: ${chatId}`);
      } catch (err) {
        console.error(`❌ Помилка надсилання клієнту (${chatId}):`, err.message);
      }
      
      // Надсилання повідомлення адмінам
      const orderDetails = data.items.map(item => `• ${item.name} x${item.quantity} - ${item.price * item.quantity} грн`).join("\n");
      
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.sendMessage(adminId, 
            `🔔 Нове замовлення!\n` +
            `👤 Від: @${userName}\n` +
            `🆔 Chat ID: ${chatId}\n` +
            `📋 Замовлення:\n${orderDetails}\n` +
            `💰 Загальна сума: ${data.total} грн\n` +
            `⏰ Час: ${new Date().toLocaleString('uk-UA')}`
          );
          console.log(`Повідомлення надіслано адміну: ${adminId}`);
        } catch (err) {
          console.error(`❌ Помилка надсилання адміну (${adminId}):`, err.message);
        }
      }
      
    } catch (error) {
      console.error("❌ Помилка обробки замовлення:", error);
    }
  }
});


app.get("/menu", async (req, res) => {
  const menu = await Menu.find();
  res.json(menu);
});

// app.post("/orders", async (req, res) => {
//   const order = new Order(req.body);
//   await order.save();
//   res.json({ success: true, orderId: order._id });
// });

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


bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "❌ Доступ заборонено");
  }
  bot.sendMessage(chatId, "👨‍💼 Панель адміна", {
    reply_markup: {
      inline_keyboard: [[{ text: "📋 Замовлення", web_app: { url: `${process.env.WEBAPP_URL}/admin?adminId=${chatId}` } }]],
    },
  });
});


app.listen(PORT, () => console.log(`🌐 Сервер запущено на http://localhost:${PORT}`));