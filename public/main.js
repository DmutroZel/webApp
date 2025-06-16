    let telegramApp = window.Telegram?.WebApp;
    if (telegramApp) {
      telegramApp.expand();
    }

    let menuItems = [];
    let cartItems = [];

    // Тестові дані меню для демонстрації
    const sampleMenu = [
      {
        id: 1,
        name: "Маргарита",
        description: "Класична піца з томатами та моцарелою",
        price: 150,
        image: "https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Маргарита",
        category: "pizza"
      },
      {
        id: 2,
        name: "Пепероні",
        description: "Піца з пепероні та сиром",
        price: 180,
        image: "https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Пепероні",
        category: "pizza"
      },
      {
        id: 3,
        name: "Класичний бургер",
        description: "Бургер з яловичиною, сиром та овочами",
        price: 120,
        image: "https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Бургер",
        category: "burger"
      },
      {
        id: 4,
        name: "Філадельфія",
        description: "Рол з лососем, огірком та сиром",
        price: 200,
        image: "https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Філадельфія",
        category: "sushi"
      },
      {
        id: 5,
        name: "Тірамісу",
        description: "Італійський десерт з маскарпоне",
        price: 85,
        image: "https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Тірамісу",
        category: "dessert"
      },
      {
        id: 6,
        name: "Кока-Кола",
        description: "Освіжаючий напій 0.33л",
        price: 30,
        image: "https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Кола",
        category: "drink"
      }
    ];

    function loadMenu() {
      // Імітуємо запит до сервера
      setTimeout(() => {
        menuItems = sampleMenu;
        displayMenu("all");
      }, 50000);
    }

    function displayMenu(category) {
      let menuContainer = $("#menuContainer");
      menuContainer.empty();
      
      let menuGrid = $("<div>");
      menuGrid.addClass("menu-grid");
      
      let itemsToShow = [];
      if (category === "all") {
        itemsToShow = [...menuItems];
      } else {
        itemsToShow = menuItems.filter(item => item.category === category);
      }
      
      if (itemsToShow.length === 0) {
        menuContainer.html('<div class="no-items">В цій категорії поки немає страв</div>');
        return;
      }
      
      itemsToShow.forEach(item => {
        let card = $(`
          <div class="dish-card">
            <img src="${item.image}" alt="${item.name}" class="dish-image" onerror="this.src='https://via.placeholder.com/200x120/FF8A50/FFFFFF?text=Зображення'">
            <div class="dish-info">
              <h3 class="dish-name">${item.name}</h3>
              <p class="dish-description">${item.description}</p>
              <div class="dish-price-add">
                <span class="dish-price">${item.price} грн</span>
                <button class="add-to-cart" data-id="${item.id}">+</button>
              </div>
            </div>
          </div>
        `);
        menuGrid.append(card);
      });
      
      menuContainer.append(menuGrid);
      
      $(".add-to-cart").on("click", function() {
        let itemId = parseInt($(this).data("id"));
        addToCart(itemId);
      });
    }

    function addToCart(itemId) {
      let item = menuItems.find(item => item.id === itemId);
      if (!item) return;
      
      let existingItem = cartItems.find(cartItem => cartItem.id === itemId);
      
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cartItems.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1
        });
      }
      
      updateCartCount();
      
      // Анімація додавання
      let button = $(`.add-to-cart[data-id="${itemId}"]`);
      button.text('✓').css('background', '#4CAF50');
      setTimeout(() => {
        button.text('+').css('background', '');
      }, 500);
    }

    function updateCartCount() {
      let totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      $("#cartCount").text(totalCount);
    }

    function updateCartItems() {
      let cartItemsContainer = $("#cartItems");
      cartItemsContainer.empty();
      
      if (cartItems.length === 0) {
        cartItemsContainer.html('<div class="no-items">Ваш кошик порожній</div>');
        updateTotal();
        return;
      }
      
      cartItems.forEach(item => {
        let cartItem = $(`
          <div class="cart-item">
            <div class="cart-item-info">
              <h3 class="cart-item-name">${item.name}</h3>
              <div class="cart-item-price">${item.price} грн</div>
            </div>
            <div class="cart-item-quantity">
              <button class="quantity-btn decrease" data-id="${item.id}">-</button>
              <span>${item.quantity}</span>
              <button class="quantity-btn increase" data-id="${item.id}">+</button>
            </div>
          </div>
        `);
        cartItemsContainer.append(cartItem);
      });
      
      $(".decrease").on("click", function() {
        let itemId = parseInt($(this).data("id"));
        decreaseQuantity(itemId);
      });
      
      $(".increase").on("click", function() {
        let itemId = parseInt($(this).data("id"));
        increaseQuantity(itemId);
      });
      
      updateTotal();
    }

    function increaseQuantity(itemId) {
      let item = cartItems.find(item => item.id === itemId);
      if (item) {
        item.quantity += 1;
        updateCartItems();
        updateCartCount();
      }
    }

    function decreaseQuantity(itemId) {
      let item = cartItems.find(item => item.id === itemId);
      if (item) {
        item.quantity -= 1;
        if (item.quantity <= 0) {
          cartItems = cartItems.filter(cartItem => cartItem.id !== itemId);
        }
        updateCartItems();
        updateCartCount();
      }
    }

    function updateTotal() {
      let totalSum = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      $("#cartTotal").text("Разом: " + totalSum + " грн");
    }

    function checkout() {
      if (cartItems.length === 0) {
        alert("Додайте товари до кошика");
        return;
      }
      
      let totalSum = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      let orderData = {
        chatId: telegramApp?.initDataUnsafe?.user?.id || "demo_user",
        userName: telegramApp?.initDataUnsafe?.user?.username || "demo_user",
        items: cartItems,
        total: totalSum,
        status: "Очікується",
        dateTime: new Date().toISOString()
      };
      
      // Імітуємо успішне оформлення замовлення
      setTimeout(() => {
        $("#successModal").css("display", "block");
        cartItems = [];
        updateCartItems();
        updateCartCount();
        
        setTimeout(() => {
          $("#successModal").css("display", "none");
          $("#cartOverlay").css("display", "none");
          $("#cartContainer").removeClass("active");
          
          if (telegramApp) {
            telegramApp.sendData(JSON.stringify(orderData));
          }
        }, 2000);
      }, 500);
    }

    $(document).ready(function() {
      loadMenu();
      
      $(".category").on("click", function() {
        $(".category").removeClass("active");
        $(this).addClass("active");
        let category = $(this).data("category");
        displayMenu(category);
      });
      
      $("#openCart").on("click", function() {
        $("#cartOverlay").css("display", "block");
        updateCartItems();
        setTimeout(() => {
          $("#cartContainer").addClass("active");
        }, 10);
      });
      
      $("#closeCart").on("click", function() {
        $("#cartContainer").removeClass("active");
        setTimeout(() => {
          $("#cartOverlay").css("display", "none");
        }, 300);
      });
      
      $("#cartOverlay").on("click", function(event) {
        if (event.target === this) {
          $("#cartContainer").removeClass("active");
          setTimeout(() => {
            $("#cartOverlay").css("display", "none");
          }, 300);
        }
      });
      
      $("#checkoutBtn").on("click", checkout);
    });
