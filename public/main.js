const tg = window.Telegram.WebApp;
tg.expand();

let menuItems = [];
let cart = [];

function loadMenu() {
  axios.get("/menu")
    .then(response => {
      menuItems = response.data;
      displayMenu();
    })
    .catch(err => console.error("Помилка завантаження меню:", err));
}

function displayMenu(category = 'all') {
  const $menuContainer = $('#menuContainer');
  $menuContainer.empty();
  
  const $menuGrid = $('<div>').addClass('menu-grid');
  
  const filteredItems = category === 'all' 
    ? menuItems 
    : menuItems.filter(item => item.category === category);
  
  filteredItems.forEach(item => {
    const $card = $('<div>').addClass('dish-card').html(`
      <img src="${item.image}" alt="${item.name}" class="dish-image">
      <div class="dish-info">
        <h3 class="dish-name">${item.name}</h3>
        <p class="dish-description">${item.description}</p>
        <div class="dish-price-add">
          <span class="dish-price">${item.price} грн</span>
          <button class="add-to-cart" data-id="${item.id}">+</button>
        </div>
      </div>
    `);
    $menuGrid.append($card);
  });
  
  $menuContainer.append($menuGrid);
  
  $('.add-to-cart').on('click', function() {
    addToCart(parseInt($(this).data('id')));
  });
}

function addToCart(itemId) {
  const item = menuItems.find(item => item.id === itemId);
  if (!item) return;
  
  const existingItem = cart.find(cartItem => cartItem.id === itemId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ id: item.id, name: item.name, price: item.price, quantity: 1 });
  }
  
  updateCartCount();
}

function updateCartCount() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  $('#cartCount').text(count);
}

function updateCartItems() {
  const $cartItems = $('#cartItems');
  $cartItems.empty();
  
  if (cart.length === 0) {
    $cartItems.html('<div class="no-items">Ваш кошик порожній</div>');
    return;
  }
  
  cart.forEach(item => {
    const $cartItem = $('<div>').addClass('cart-item').html(`
      <div class="cart-item-info">
        <h3 class="cart-item-name">${item.name}</h3>
        <div class="cart-item-price">${item.price} грн</div>
      </div>
      <div class="cart-item-quantity">
        <button class="quantity-btn decrease" data-id="${item.id}">-</button>
        <span>${item.quantity}</span>
        <button class="quantity-btn increase" data-id="${item.id}">+</button>
      </div>
    `);
    $cartItems.append($cartItem);
  });
  
  $('.decrease').on('click', function() {
    decreaseQuantity(parseInt($(this).data('id')));
  });
  
  $('.increase').on('click', function() {
    increaseQuantity(parseInt($(this).data('id')));
  });
  
  updateTotal();
}

function increaseQuantity(itemId) {
  const item = cart.find(item => item.id === itemId);
  if (item) {
    item.quantity += 1;
    updateCartItems();
    updateCartCount();
  }
}

function decreaseQuantity(itemId) {
  const item = cart.find(item => item.id === itemId);
  if (item) {
    item.quantity -= 1;
    if (item.quantity <= 0) {
      cart = cart.filter(cartItem => cartItem.id !== itemId);
    }
    updateCartItems();
    updateCartCount();
  }
}

function updateTotal() {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  $('#cartTotal').text(`Разом: ${total} грн`);
}

function checkout() {
  if (cart.length === 0) return;
  console.log("Telegram WebApp Data:", tg.initDataUnsafe);
  const orderData = {
    chatId: tg.initDataUnsafe.user?.id || "unknown",
    userName: tg.initDataUnsafe.user?.username || "unknown",
    items: cart,
    total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    status: "Очікується",
    dateTime: new Date().toISOString(),
  };

  axios.post("/orders", orderData, {
    headers: { "Content-Type": "application/json" }
  })
    .then(response => {
      if (response.data.success) {
        $("#successModal").css("display", "block");
        cart = [];
        updateCartItems();
        updateCartCount();

        setTimeout(() => {
          $("#successModal").css("display", "none");
          $("#cartOverlay").css("display", "none");
          $("#cartContainer").removeClass("active");
          tg.sendData(JSON.stringify(orderData));
        }, 3000);
      }
    })
    .catch(err => console.error("Помилка при оформленні замовлення:", err));
}

$(document).ready(() => {
  loadMenu();
  
  $('.category').on('click', function() {
    $('.category').removeClass('active');
    $(this).addClass('active');
    displayMenu($(this).data('category'));
  });
  
  $('#openCart').on('click', () => {
    $('#cartOverlay').css('display', 'block');
    updateCartItems();
    setTimeout(() => $('#cartContainer').addClass('active'), 10);
  });
  
  $('#closeCart').on('click', () => {
    $('#cartContainer').removeClass('active');
    setTimeout(() => $('#cartOverlay').css('display', 'none'), 300);
  });
  
  $('#cartOverlay').on('click', function(e) {
    if (e.target === this) {
      $('#cartContainer').removeClass('active');
      setTimeout(() => $('#cartOverlay').css('display', 'none'), 300);
    }
  });
  
  $('#checkoutBtn').on('click', checkout);
});