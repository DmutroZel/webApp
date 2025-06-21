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
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require("@google/generative-ai");
dotenv.config();


const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

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
  items: [{ id: Number, name: String, price: Number, quantity: Number, addedBy: String }],
  total: Number,
  status: { type: String, default: "Очікується" },
  dateTime: { type: Date, default: Date.now },
});

const groupCartSchema = new mongoose.Schema({
    inviteCode: { type: String, unique: true, required: true },
    ownerId: { type: String, required: true },
    participants: [{ id: String, name: String }],
    items: [{
        id: Number,
        name: String,
        price: Number,
        quantity: Number,
        addedBy: String // userName of the user who added the item
    }],
    createdAt: { type: Date, default: Date.now, expires: '2h' } // Automatically delete after 2 hours
});


const Menu = mongoose.model("Menu", menuSchema);
const Order = mongoose.model("Order", orderSchema);
const GroupCart = mongoose.model('GroupCart', groupCartSchema);


// WebSocket логіка
const userSockets = {};
io.on("connection", (socket) => {
  console.log(`🔗 Користувач підключився: ${socket.id}`);

  socket.on("register", (userId) => {
    userSockets[userId] = socket.id;
    console.log(`👤 Користувач ${userId} зареєстрований`);
  });

  // Group Cart Logic
  socket.on('create_group_cart', async (data) => {
      const { ownerId, ownerName } = data;
      const inviteCode = uuidv4().slice(0, 8); // Unique 8-char code
      const groupCart = new GroupCart({
          inviteCode,
          ownerId,
          participants: [{ id: ownerId, name: ownerName }],
          items: []
      });
      await groupCart.save();
      socket.join(inviteCode);
      socket.emit('group_cart_created', { inviteCode });
  });

  socket.on('join_group_cart', async (data) => {
      const { inviteCode, userId, userName } = data;
      const groupCart = await GroupCart.findOne({ inviteCode });
      if (groupCart) {
          if (!groupCart.participants.some(p => p.id === userId)) {
              groupCart.participants.push({ id: userId, name: userName });
              await groupCart.save();
          }
          socket.join(inviteCode);
          io.to(inviteCode).emit('group_cart_updated', groupCart);
      } else {
          socket.emit('error', { message: 'Group cart not found' });
      }
  });

  socket.on('add_to_group_cart', async (data) => {
      const { inviteCode, item, userName } = data;
      const groupCart = await GroupCart.findOne({ inviteCode });
      if (groupCart) {
          const existingItem = groupCart.items.find(i => i.id === item.id && i.addedBy === userName);
          if (existingItem) {
              existingItem.quantity++;
          } else {
              groupCart.items.push({ ...item, quantity: 1, addedBy: userName });
          }
          await groupCart.save();
          io.to(inviteCode).emit('group_cart_updated', groupCart);
      }
  });

  socket.on('update_group_cart_item', async ({ inviteCode, itemId, quantity, userName }) => {
      const groupCart = await GroupCart.findOne({ inviteCode });
      if (groupCart) {
          const item = groupCart.items.find(i => i.id === itemId && i.addedBy === userName);
          if (item) {
              item.quantity = quantity;
              if (item.quantity <= 0) {
                  groupCart.items = groupCart.items.filter(i => !(i.id === itemId && i.addedBy === userName));
              }
              await groupCart.save();
              io.to(inviteCode).emit('group_cart_updated', groupCart);
          }
      }
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
  const deepLinkPayload = msg.text.split(' ')[1];
  let webAppUrl = config.WEBAPP_URL;

  if (deepLinkPayload && deepLinkPayload.startsWith('groupCart_')) {
      const inviteCode = deepLinkPayload.replace('groupCart_', '');
      webAppUrl = `${config.WEBAPP_URL}/index.html?groupCart=${inviteCode}`;
  }

  bot.sendMessage(msg.chat.id, "👋 Вітаємо у FoodNow! Оберіть дію:", {
    reply_markup: {
      keyboard: [
        [{ text: "🛒 Замовити їжу", web_app: { url: webAppUrl } }],
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
    const chatId = data.chatId && data.chatId !== "unknown" ? data.chatId.toString() : msg.chat.id.toString();
    const userName = data.userName && data.userName !== "unknown" ? data.userName : msg.from.username || "Анонім";

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

    // Notify all participants of the group order if it was a group order
    if (data.isGroupOrder && data.participants) {
        const creatorName = data.participants.find(p => p.id === chatId)?.name || userName;
        for (const participant of data.participants) {
            await bot.sendMessage(
                participant.id,
                `✅ Спільне замовлення №${orderIdShort} від ${creatorName} було успішно оформлено!\nСтатус: Очікується\nЗагальна сума: ${data.total} грн`
            );
        }
    } else {
        await bot.sendMessage(
            chatId,
            `✅ Ваше замовлення №${orderIdShort} прийнято.\nСтатус: Очікується\nСума: ${data.total} грн`
        );
    }


    const orderDetails = data.items
      .map((item) => `• ${item.name} x${item.quantity} (додав/ла ${item.addedBy || 'власник'}) - ${item.price * item.quantity} грн`)
      .join("\n");

    for (const adminId of config.ADMIN_IDS) {
      await bot.sendMessage(
        adminId,
        `🔔 *Нове ${data.isGroupOrder ? 'спільне ' : ''}замовлення №${orderIdShort}*\n\n` +
          `*Від:* @${userName} (ID: \`${chatId}\`)\n` +
          `*Склад:*\n${orderDetails}\n` +
          `*Сума:* ${data.total} грн\n` +
          `*Час:* ${new Date().toLocaleString("uk-UA")}`,
        { parse_mode: "Markdown" }
      );
    }

    setTimeout(async () => {
        // Create a unique list of items to rate to avoid duplicates from multiple users in a group order
        const uniqueItemsToRate = data.items.reduce((acc, current) => {
            if (!acc.find(item => item.id === current.id)) {
                acc.push(current);
            }
            return acc;
        }, []);

        for (const item of uniqueItemsToRate) {
            const ratingKeyboard = {
                inline_keyboard: [
                    [
                        { text: "1 ⭐", callback_data: `rate_${order._id}_${item.id}_1` },
                        { text: "2 ⭐", callback_data: `rate_${order._id}_${item.id}_2` },
                        { text: "3 ⭐", callback_data: `rate_${order._id}_${item.id}_3` },
                        { text: "4 ⭐", callback_data: `rate_${order._id}_${item.id}_4` },
                        { text: "5 ⭐", callback_data: `rate_${order._id}_${item.id}_5` },
                    ],
                ],
            };
            // Send rating request to all participants
            if (data.isGroupOrder && data.participants) {
                for (const participant of data.participants) {
                    await bot.sendMessage(
                        participant.id,
                        `Будь ласка, оцініть "${item.name}" зі спільного замовлення №${orderIdShort}:`,
                        { reply_markup: ratingKeyboard }
                    );
                }
            } else {
                 await bot.sendMessage(
                    chatId,
                    `Будь ласка, оцініть "${item.name}" з вашого замовлення №${orderIdShort}:`,
                    { reply_markup: ratingKeyboard }
                );
            }
        }
    }, 10000); // 10 seconds delay
  } catch (error) {
    console.error("❌ Помилка обробки замовлення:", error);
  }
});


bot.on("callback_query", async (query) => {
  const [action, orderId, itemId, rating] = query.data.split("_");
  if (action === "rate") {
    try {
      const item = await Menu.findOne({ id: parseInt(itemId) });
      if (!item) {
        await bot.answerCallbackQuery(query.id, { text: "Товар не знайдено" });
        return;
      }
      
      // Check if this user has already rated this item for this order to prevent multiple ratings
      // This is a simplified check. A more robust solution would involve a separate Rating model.
      const order = await Order.findById(orderId);
      // For this example, we'll just add the rating without a duplicate check to keep it simple.

      item.ratings.push(parseInt(rating));
      item.averageRating = Number(
        (item.ratings.reduce((acc, r) => acc + r, 0) / item.ratings.length).toFixed(1)
      );
      await item.save();

      await bot.answerCallbackQuery(query.id, { text: `Дякуємо за оцінку ${rating} ⭐!` });
      await bot.deleteMessage(query.message.chat.id, query.message.message_id); // Видаляємо повідомлення після оцінки
    } catch (error) {
      console.error("❌ Помилка обробки оцінки:", error);
      await bot.answerCallbackQuery(query.id, { text: "Помилка при збереженні оцінки" });
    }
  }
});

// API маршрути
app.post(`/bot${process.env.TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    // 1. Отримуємо актуальне меню з бази даних
    const menuItems = await Menu.find({}, 'name description category price');
    const menuContext = menuItems.map(item =>
      `- ${item.name} (Категорія: ${item.category}, Ціна: ${item.price} грн): ${item.description}`
    ).join("\n");

    // 2. Створюємо системний промпт (мозок нашого асистента)
    const systemPrompt = `
      Ви — доброзичливий AI-помічник у сервісі доставки їжі "FoodNow".
      Ваше завдання — допомагати користувачам обирати страви з нашого меню.
      Завжди відповідайте українською мовою. Будьте коротким, ввічливим і корисним.

      Ось АКТУАЛЬНЕ МЕНЮ, на яке ви повинні спиратися:
      --- МЕНЮ ---
      ${menuContext}
      --- КІНЕЦЬ МЕНЮ ---

      Правила спілкування:
      - Ніколи не вигадуйте страви, яких немає в меню.
      - Якщо користувач просить щось, чого немає (наприклад, "хочу рибу"), запропонуйте найкращу альтернативу з меню (наприклад, "У нас немає риби, але можу запропонувати смачні суші з лососем").
      - Якщо користувач не знає, що обрати, ставте уточнюючі питання (наприклад, "Чому б ви надали перевагу: чомусь м'ясному, як бургер, чи легшому, як суші?").
      - На пряме питання "що порадиш?" можна запропонувати 2-3 популярні страви з різних категорій.
      - Не використовуйте Markdown у відповідях.
    `;
    
    // 3. Формуємо історію чату для контексту
    const chatHistory = history.map(h => ({
        role: h.role,
        parts: [{ text: h.parts[0].text }]
    }));

    // 4. Створюємо чат з Gemini
    const chat = model.startChat({
      history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Звісно, я готовий допомогти вам з вибором!' }] },
          ...chatHistory
      ]
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();

    res.json({ reply: text });

  } catch (error) {
    console.error("❌ Помилка AI чату:", error);
    res.status(500).json({ error: "Вибачте, мій AI-помічник зараз не в гуморі. Спробуйте пізніше." });
  }
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

// Group Cart API
app.get('/api/group-cart/:inviteCode', async (req, res) => {
    try {
        const { inviteCode } = req.params;
        const groupCart = await GroupCart.findOne({ inviteCode });
        if (!groupCart) {
            return res.status(404).json({ error: 'Спільний кошик не знайдено.' });
        }
        res.json(groupCart);
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.post('/api/group-cart/checkout', async (req, res) => {
    const { inviteCode } = req.body;
    const groupCart = await GroupCart.findOne({ inviteCode });

    if (!groupCart) {
        return res.status(404).json({ error: 'Кошик не знайдено' });
    }

    const totalSum = groupCart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const orderData = {
        chatId: groupCart.ownerId,
        userName: groupCart.participants.find(p => p.id === groupCart.ownerId)?.name || 'Власник кошика',
        items: groupCart.items,
        total: totalSum,
        status: "Очікується",
        dateTime: new Date().toISOString(),
        isGroupOrder: true,
        participants: groupCart.participants,
    };
    
    // Simulate sending data via Telegram bot
    const fakeMsg = {
        chat: { id: groupCart.ownerId },
        from: { username: orderData.userName },
        web_app_data: { data: JSON.stringify(orderData) }
    };
    
    // Process the message as if it came from the bot to trigger notifications
    bot.emit('message', fakeMsg);
    
    // Clean up the group cart
    await GroupCart.deleteOne({ inviteCode });

    res.json({ success: true, message: "Замовлення оформлено!" });
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
    
    // Notify all participants if it's a group order
    if (order.isGroupOrder && order.participants) {
        for (const participant of order.participants) {
             await bot.sendMessage(
                participant.id,
                `🔔 Статус спільного замовлення №*${orderIdShort}*: *${status}*`,
                { parse_mode: "Markdown" }
            );
        }
    } else {
        await bot.sendMessage(
          order.chatId,
          `🔔 Статус замовлення №*${orderIdShort}*: *${status}*`,
          { parse_mode: "Markdown" }
        );
    }


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