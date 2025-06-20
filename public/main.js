// Налаштування Telegram WebApp
    const telegramApp = window.Telegram.WebApp;
    telegramApp.expand();

    // Стан додатку
    const state = {
      menuItems: [], // Список страв у меню
      cartItems: [], // Елементи у кошику
      groupCart: null, // Дані спільного кошика
      socket: io(), // Підключення до сокет-сервера
      API_BASE_URL: "", // Базовий URL для API
      currentUser: {
        id: telegramApp.initDataUnsafe.user?.id.toString() || 'unknown', // ID користувача
        name: telegramApp.initDataUnsafe.user?.username || 'Анонім' // Ім'я користувача
      }
    };

    // --- ФУНКЦІЇ ДЛЯ МЕНЮ ---

    // Завантаження меню з сервера
    function loadMenu() {
      axios.get(`${state.API_BASE_URL}/api/menu`)
        .then(({ data }) => {
          state.menuItems = data;
          displayMenu("all");
        })
        .catch(error => {
          console.error("Помилка завантаження меню:", error);
          $("#menuContainer").html('<p style="color: red;">Не вдалося завантажити меню. Спробуйте оновити.</p>');
        });
    }

    // Відображення страв у меню
    function displayMenu(category) {
      const $menuContainer = $("#menuContainer").empty();
      const $menuGrid = $("<div>").addClass("menu-grid");
      const itemsToShow = category === "all" ? state.menuItems : state.menuItems.filter(item => item.category === category);

      if (!itemsToShow.length) {
        $menuGrid.html('<p class="no-items">У цій категорії поки що немає страв.</p>');
      } else {
        itemsToShow.forEach(item => {
          const $card = $("<div>")
            .addClass("dish-card")
            .data("item-id", item.id)
            .html(`
              <img src="${item.image}" alt="${item.name}" class="dish-image">
              <div class="dish-info">
                <h3 class="dish-name">${item.name}</h3>
                ${getStarRatingHTML(item.averageRating)}
                <p class="dish-description">${item.description}</p>
                <div class="dish-price-add">
                  <span class="dish-price">${item.price} грн</span>
                  <button class="add-to-cart" data-id="${item.id}">+</button>
                </div>
              </div>
            `);
          $menuGrid.append($card);
        });
      }
      $menuContainer.append($menuGrid);
    }

    // Генерація зірок для рейтингу
    function getStarRatingHTML(rating) {
      if (!rating || rating === 0) {
        return '<div class="star-rating no-rating">Ще немає оцінок</div>';
      }
      let starsHTML = "";
      for (let i = 1; i <= 5; i++) {
        starsHTML += i <= rating ? "⭐" : i - 0.5 <= rating ? "🌟" : "☆";
      }
      return `<div class="star-rating">${starsHTML} (${rating.toFixed(1)})</div>`;
    }

    // --- ФУНКЦІЇ ДЛЯ КОШИКА ---

    // Додавання страви до кошика
    function addToCart(itemId) {
      const item = state.menuItems.find(i => i.id === itemId);
      if (!item) return;

      if (state.groupCart) {
        state.socket.emit('add_to_group_cart', {
          inviteCode: state.groupCart.inviteCode,
          item: { id: item.id, name: item.name, price: item.price },
          userName: state.currentUser.name
        });
      } else {
        const existingItem = state.cartItems.find(i => i.id === itemId);
        if (existingItem) {
          existingItem.quantity++;
        } else {
          state.cartItems.push({ ...item, quantity: 1 });
        }
        updateCartItems();
        updateCartCount();
      }
      animateAddToCartButton(itemId);
    }

    // Анімація кнопки додавання до кошика
    function animateAddToCartButton(itemId) {
      const $button = $(`.add-to-cart[data-id="${itemId}"]`);
      $button.css("transform", "scale(1.2)");
      setTimeout(() => $button.css("transform", "scale(1)"), 200);
    }

    // Оновлення кількості страв у кошику
    function updateCartCount() {
      const totalCount = state.cartItems.reduce((sum, item) => sum + item.quantity, 0);
      $("#cartCount").text(totalCount);
    }

    // Оновлення відображення кошика
    function updateCartItems() {
      const $cartItemsContainer = $("#cartItems").empty();
      if (!state.cartItems.length) {
        $cartItemsContainer.html('<div class="no-items">Ваш кошик порожній</div>');
      } else {
        state.cartItems.forEach(item => {
          const isGroupItem = state.groupCart && item.addedBy;
          const canEdit = !isGroupItem || item.addedBy === state.currentUser.name;
          const $cartItem = $("<div>")
            .addClass("cart-item")
            .html(`
              <div class="cart-item-info">
                <h3 class="cart-item-name">${item.name}</h3>
                <div class="cart-item-price">${item.price} грн</div>
                ${isGroupItem ? `<div class="cart-item-added-by">Додав: ${item.addedBy}</div>` : ''}
              </div>
              <div class="cart-item-quantity">
                <button class="quantity-btn decrease" data-id="${item.id}" ${!canEdit ? 'disabled' : ''}>-</button>
                <span>${item.quantity}</span>
                <button class="quantity-btn increase" data-id="${item.id}" ${!canEdit ? 'disabled' : ''}>+</button>
              </div>
            `);
          $cartItemsContainer.append($cartItem);
        });
      }
      updateTotal();
    }

    // Зміна кількості страви у кошику
    function changeQuantity(itemId, increment) {
      if (state.groupCart) {
        const item = state.cartItems.find(i => i.id === itemId && i.addedBy === state.currentUser.name);
        if (item) {
          state.socket.emit('update_group_cart_item', {
            inviteCode: state.groupCart.inviteCode,
            itemId,
            quantity: item.quantity + increment,
            userName: state.currentUser.name
          });
        }
      } else {
        const item = state.cartItems.find(i => i.id === itemId);
        if (!item) return;
        item.quantity += increment;
        if (item.quantity <= 0) {
          state.cartItems = state.cartItems.filter(i => i.id !== itemId);
        }
        updateCartItems();
        updateCartCount();
      }
    }

    // Оновлення загальної суми
    function updateTotal() {
      const totalSum = state.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      $("#cartTotal").text(`Разом: ${totalSum} грн`);
    }

    // Оформлення замовлення
    function checkout() {
      if (!state.cartItems.length) {
        alert("Кошик порожній!");
        return;
      }
      if (state.groupCart && state.currentUser.id !== state.groupCart.ownerId) {
        alert("Тільки власник кошика може оформити замовлення.");
        return;
      }
      if (state.groupCart) {
        axios.post(`${state.API_BASE_URL}/api/group-cart/checkout`, {
          inviteCode: state.groupCart.inviteCode
        }).then(() => {
          showSuccess();
          resetCartState();
        }).catch(error => {
          console.error("Помилка оформлення спільного замовлення:", error);
          alert("Помилка при оформленні спільного замовлення.");
        });
      } else {
        const totalSum = state.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderData = {
          chatId: state.currentUser.id,
          userName: state.currentUser.name,
          items: state.cartItems.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
          total: totalSum,
          status: "Очікується",
          dateTime: new Date().toISOString()
        };
        try {
          telegramApp.sendData(JSON.stringify(orderData));
          showSuccess();
          resetCartState();
        } catch (error) {
          console.error("Помилка відправки даних:", error);
          alert("Помилка при оформленні замовлення. Спробуйте ще раз.");
        }
      }
    }

    // Показ повідомлення про успішне замовлення
    function showSuccess() {
      $("#cartOverlay").hide();
      $("#cartContainer").removeClass("active");
      $("#successModal").css("display", "flex");
      setTimeout(() => $("#successModal").css("display", "none"), 3000);
    }

    // Скидання стану кошика
    function resetCartState() {
      state.cartItems = [];
      state.groupCart = null;
      $('#groupCartInfo').hide();
      $('#cartTitle').text('Ваше замовлення');
      $('#checkoutBtn').prop('disabled', false).text('Оформити замовлення');
      updateCartItems();
      updateCartCount();
    }

    // --- ФУНКЦІЇ ДЛЯ СПІЛЬНОГО КОШИКА ---

    // Обробка URL для приєднання до спільного кошика
    function handleGroupCartURL() {
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get('groupCart');
      if (inviteCode) {
        state.socket.emit('join_group_cart', {
          inviteCode,
          userId: state.currentUser.id,
          userName: state.currentUser.name
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Створення спільного кошика
    function createGroupCart() {
      state.socket.emit('create_group_cart', {
        ownerId: state.currentUser.id,
        ownerName: state.currentUser.name
      });
    }

    // Показ модального вікна з посиланням для запрошення
    function showGroupCartInviteModal(inviteCode) {
      const inviteLink = `https://t.me/${telegramApp.initData.bot_username}?start=groupCart_${inviteCode}`;
      $('#groupCartInviteLink').val(inviteLink);
      $('#groupCartModalOverlay').css('display', 'flex');
    }

    // Оновлення відображення спільного кошика
    function updateGroupCartView(data) {
      state.groupCart = data;
      state.cartItems = data.items;
      $('#cartTitle').text('Спільне замовлення');
      $('#groupCartInfo').show();
      $('#groupCartOwner').text(data.participants.find(p => p.id === data.ownerId)?.name || 'N/A');
      $('#groupCartParticipants').text(data.participants.map(p => p.name).join(', '));
      if (state.currentUser.id !== state.groupCart.ownerId) {
        $('#checkoutBtn').prop('disabled', true).text('Очікування власника');
      } else {
        $('#checkoutBtn').prop('disabled', false).text('Оформити спільне замовлення');
      }
      updateCartCount();
      updateCartItems();
      updateTotal();
    }

    // --- ФУНКЦІЇ ДЛЯ МОДАЛЬНОГО ВІКНА СТРАВИ ---

    // Показ деталей страви у модальному вікні
    function showDishModal(itemId) {
      const item = state.menuItems.find(i => i.id === itemId);
      if (!item) return;
      $("#modalDishImage").attr("src", item.image);
      $("#modalDishName").text(item.name);
      $("#modalDishDescription").text(item.description);
      $("#modalDishPrice").text(`${item.price} грн`);
      $("#modalAddToCartBtn").data("id", item.id);
      $("#dishModalOverlay").css("display", "flex");
    }

    // --- ФУНКЦІЇ ДЛЯ ЧАТУ ---

    // Ініціалізація елементів чату
    const chatFab = $('#chatFab');
    const chatWindow = $('#chatWindow');
    const closeChatBtn = $('#closeChatBtn');
    const chatBody = $('#chatBody');
    const chatInput = $('#chatInput');
    const sendChatBtn = $('#sendChatBtn');
    let chatHistory = []; // Історія повідомлень

    // Відкриття/закриття чату
    const toggleChat = () => {
      chatWindow.toggleClass('open');
    };

    // Додавання повідомлення до інтерфейсу
    const addMessageToUI = (message, sender) => {
      const messageEl = $('<div>').addClass('chat-message').addClass(sender).text(message);
      chatBody.append(messageEl);
      chatBody.scrollTop(chatBody.prop("scrollHeight"));
    };

    // Показ індикатора набору тексту
    const showTypingIndicator = show => {
      $('.chat-message.typing').remove();
      if (show) {
        const typingEl = $('<div>').addClass('chat-message bot typing').text('Асистент друкує...');
        chatBody.append(typingEl);
        chatBody.scrollTop(chatBody.prop("scrollHeight"));
      }
    };

    // Відправка повідомлення у чат
    const handleSendMessage = async () => {
      const message = chatInput.val().trim();
      if (!message) return;
      addMessageToUI(message, 'user');
      chatHistory.push({ role: 'user', parts: [{ text: message }] });
      chatInput.val('');
      showTypingIndicator(true);
      try {
        const response = await axios.post(`${state.API_BASE_URL}/api/chat`, {
          message,
          history: chatHistory.slice(0, -1)
        });
        const reply = response.data.reply;
        showTypingIndicator(false);
        addMessageToUI(reply, 'bot');
        chatHistory.push({ role: 'model', parts: [{ text: reply }] });
      } catch (error) {
        console.error('Помилка чату:', error);
        showTypingIndicator(false);
        addMessageToUI(error.response?.data?.error || 'Щось пішло не так. Спробуйте пізніше.', 'bot');
      }
    };

    // --- ОБРОБНИКИ ПОДІЙ ---

    $(document).ready(() => {
      // Початкове завантаження
      loadMenu();
      handleGroupCartURL();

      // Налаштування сокетів
      state.socket.on('connect', () => {
        console.log('Socket connected:', state.socket.id);
        state.socket.emit('register', state.currentUser.id);
      });

      state.socket.on('group_cart_created', ({ inviteCode }) => {
        showGroupCartInviteModal(inviteCode);
        state.socket.emit('join_group_cart', {
          inviteCode,
          userId: state.currentUser.id,
          userName: state.currentUser.name
        });
      });

      state.socket.on('group_cart_updated', data => {
        updateGroupCartView(data);
        if (!$('#cartContainer').hasClass('active')) {
          $('#openCart').click();
        }
      });

      state.socket.on('error', data => {
        alert(`Помилка: ${data.message}`);
      });

      // Обробка кнопок спільного кошика
      $('#createGroupOrderBtn').on('click', createGroupCart);
      $('#closeGroupCartModal').on('click', () => $('#groupCartModalOverlay').hide());
      $('#copyInviteLinkBtn').on('click', function() {
        const linkInput = $('#groupCartInviteLink');
        linkInput.select();
        document.execCommand('copy');
        $(this).text('Скопійовано!');
        setTimeout(() => $(this).text('Копіювати посилання'), 2000);
      });

      // Вибір категорії меню
      $(".categories").on("click", ".category", function() {
        $(".category").removeClass("active");
        $(this).addClass("active");
        displayMenu($(this).data("category"));
      });

      // Відкриття/закриття кошика
      $("#openCart").on("click", () => {
        $("#cartOverlay").show();
        updateCartItems();
        setTimeout(() => $("#cartContainer").addClass("active"), 10);
      });

      $("#closeCart, #cartOverlay").on("click", function(e) {
        if (e.target === this) {
          $("#cartContainer").removeClass("active");
          setTimeout(() => $("#cartOverlay").hide(), 300);
        }
      });

      // Зміна кількості у кошику
      $("#cartItems").on("click", ".quantity-btn", function() {
        const isIncrease = $(this).hasClass("increase");
        changeQuantity(parseInt($(this).data("id")), isIncrease ? 1 : -1);
      });

      // Оформлення замовлення
      $("#checkoutBtn").on("click", checkout);

      // Додавання до кошика з картки страви
      $("#menuContainer").on("click", ".add-to-cart", e => {
        e.stopPropagation();
        addToCart(parseInt($(e.currentTarget).data("id")));
      });

      // Відкриття модального вікна страви
      $("#menuContainer").on("click", ".dish-card", function() {
        showDishModal(parseInt($(this).data("item-id")));
      });

      // Закриття модального вікна страви
      $("#closeDishModal, #dishModalOverlay").on("click", function(e) {
        if (e.target === this) $("#dishModalOverlay").hide();
      });

      $("#dishModalContainer").on("click", e => e.stopPropagation());

      // Додавання до кошика з модального вікна
      $("#modalAddToCartBtn").on("click", function() {
        addToCart(parseInt($(this).data("id")));
        $("#dishModalOverlay").hide();
      });

      // Пошук страв
      $("#searchInput").on("input", function() {
        const query = $(this).val().toLowerCase().trim();
        $(".dish-card").each(function() {
          $(this).toggle($(this).find(".dish-name").text().toLowerCase().includes(query));
        });
      });

      // Обробка подій чату
      chatFab.on('click', toggleChat);
      closeChatBtn.on('click', toggleChat);
      sendChatBtn.on('click', handleSendMessage);
      chatInput.on('keypress', e => {
        if (e.key === 'Enter') {
          handleSendMessage();
        }
      });
    });