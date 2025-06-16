const tg = window.Telegram.WebApp;
tg.expand();

let menuItems = [];
let cartItems = [];
let categories = [];

function loadCategories() {
  axios.get("/categories").then(response => {
    categories = response.data;
    const categoriesContainer = $("#categories");
    categoriesContainer.empty();
    categories.forEach(cat => {
      const button = `<button class="category ${cat.id === 'all' ? 'active' : ''}" data-category="${cat.id}">${cat.name}</button>`;
      categoriesContainer.append(button);
    });
    bindCategoryButtons();
  }).catch(error => console.error("Помилка завантаження категорій:", error));
}

function bindCategoryButtons() {
  $(".category").on("click", function() {
    $(".category").removeClass("active");
    $(this).addClass("active");
    displayMenu($(this).data("category"));
  });
}

function loadMenu() {
  axios.get("/menu").then(response => {
    menuItems = response.data;
    displayMenu("all");
  }).catch(error => console.error("Помилка завантаження меню:", error));
}

function displayMenu(category) {
  const menuContainer = $("#menuContainer");
  menuContainer.empty();
  const menuGrid = $('<div class="menu-grid"></div>');
  const itemsToShow = category === "all" ? menuItems : menuItems.filter(item => item.category === category);
  
  itemsToShow.forEach(item => {
    const card = $(`
      <div class="dish-card">
        <img src="${item.image}" alt="${item.name}" class="dish-image">
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
    addToCart(parseInt($(this).data("id")));
  });
}

function addToCart(itemId) {
  const item = menuItems.find(i => i.id === itemId);
  if (!item) return;
  
  const existingItem = cartItems.find(i => i.id === itemId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cartItems.push({ id: item.id, name: item.name, price: item.price, quantity: 1 });
  }
  updateCartCount();
}

function updateCartCount() {
  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  $("#cartCount").text(totalCount);
}

function updateCartItems() {
  const cartItemsContainer = $("#cartItems");
  cartItemsContainer.empty();
  
  if (cartItems.length === 0) {
    cartItemsContainer.html('<div class="no-items">Ваш кошик порожній</div>');
    return;
  }
  
  cartItems.forEach(item => {
    const cartItem = $(`
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
  
  $(".decrease").on("click", function() { decreaseQuantity(parseInt($(this).data("id"))); });
  $(".increase").on("click", function() { increaseQuantity(parseInt($(this).data("id"))); });
  updateTotal();
}

function increaseQuantity(itemId) {
  const item = cartItems.find(i => i.id === itemId);
  if (item) {
    item.quantity += 1;
    updateCartItems();
    updateCartCount();
  }
}

function decreaseQuantity(itemId) {
  const item = cartItems.find(i => i.id === itemId);
  if (item) {
    item.quantity -= 1;
    if (item.quantity <= 0) {
      cartItems = cartItems.filter(i => i.id !== itemId);
    }
    updateCartItems();
    updateCartCount();
  }
}

function updateTotal() {
  const totalSum = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  $("#cartTotal").text(`Разом: ${totalSum} грн`);
}

function checkout() {
  if (cartItems.length === 0) return;
  
  const totalSum = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const orderData = {
    chatId: tg.initDataUnsafe.user?.id?.toString() || "unknown",
    userName: tg.initDataUnsafe.user?.username || "unknown",
    items: cartItems,
    total: totalSum,
    status: "Очікується",
    dateTime: new Date().toISOString()
  };
  
  axios.post("/orders", orderData, { headers: { "Content-Type": "application/json" } })
    .then(response => {
      if (response.data.success) {
        $("#successModal").show();
        cartItems = [];
        updateCartItems();
        updateCartCount();
        setTimeout(() => {
          $("#successModal").hide();
          $("#cartOverlay").hide();
          $("#cartContainer").removeClass("active");
          tg.sendData(JSON.stringify(orderData));
        }, 2000);
      }
    })
    .catch(error => console.error("Помилка при оформленні замовлення:", error));
}

$(document).ready(() => {
  loadCategories();
  loadMenu();
  
  $("#openCart").on("click", () => {
    $("#cartOverlay").show();
    updateCartItems();
    setTimeout(() => $("#cartContainer").addClass("active"), 10);
  });
  
  $("#closeCart").on("click", () => {
    $("#cartContainer").removeClass("active");
    setTimeout(() => $("#cartOverlay").hide(), 300);
  });
  
  $("#cartOverlay").on("click", event => {
    if (event.target === event.currentTarget) {
      $("#cartContainer").removeClass("active");
      setTimeout(() => $("#cartOverlay").hide(), 300);
    }
  });
  
  $("#checkoutBtn").on("click", checkout);
});