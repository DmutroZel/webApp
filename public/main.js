const telegramApp = window.Telegram.WebApp;
telegramApp.expand();

const state = {
  menuItems: [],
  cartItems: [],
  API_BASE_URL: "", // Relative paths
};

// Завантаження меню
function loadMenu() {
  axios
    .get(`${state.API_BASE_URL}/api/menu`)
    .then(({ data }) => {
      state.menuItems = data;
      displayMenu("all");
    })
    .catch((error) => {
      console.error("Помилка завантаження меню:", error);
      $("#menuContainer").html(
        '<p class="no-items" style="color: red;">Не вдалося завантажити меню. Спробуйте оновити.</p>'
      );
    });
}

// Відображення меню
function displayMenu(category) {
  const $menuContainer = $("#menuContainer").empty();
  const $menuGrid = $("<div>").addClass("menu-grid");
  const itemsToShow =
    category === "all"
      ? state.menuItems
      : state.menuItems.filter((item) => item.category === category);

  if (!itemsToShow.length) {
    $menuGrid.html('<p class="no-items">У цій категорії поки що немає страв.</p>');
  } else {
    itemsToShow.forEach((item) => {
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

// Додавання до кошика
function addToCart(itemId) {
  const item = state.menuItems.find((i) => i.id === itemId);
  if (!item) return;

  const existingItem = state.cartItems.find((i) => i.id === itemId);
  if (existingItem) {
    existingItem.quantity++;
  } else {
    state.cartItems.push({ ...item, quantity: 1 });
  }

  updateCartCount();
  animateAddToCartButton(itemId);
}

// Анімація кнопки додавання до кошика
function animateAddToCartButton(itemId) {
  const $button = $(`.add-to-cart[data-id="${itemId}"]`);
  $button.css("transform", "scale(1.2)");
  setTimeout(() => $button.css("transform", "scale(1)"), 200);
}

// Оновлення лічильника кошика
function updateCartCount() {
  const totalCount = state.cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  $("#cartCount").text(totalCount);
}

// Оновлення вмісту кошика
function updateCartItems() {
  const $cartItemsContainer = $("#cartItems").empty();

  if (!state.cartItems.length) {
    $cartItemsContainer.html(
      '<div class="no-items">Ваш кошик порожній</div>'
    );
  } else {
    state.cartItems.forEach((item) => {
      const $cartItem = $("<div>")
        .addClass("cart-item")
        .html(`
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
      $cartItemsContainer.append($cartItem);
    });
  }

  updateTotal();
}

// Зміна кількості товару
function changeQuantity(itemId, increment) {
  const item = state.cartItems.find((i) => i.id === itemId);
  if (!item) return;

  item.quantity += increment;
  if (item.quantity <= 0) {
    state.cartItems = state.cartItems.filter((i) => i.id !== itemId);
  }
  updateCartItems();
  updateCartCount();
}

// Оновлення загальної суми
function updateTotal() {
  const totalSum = state.cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  $("#cartTotal").text(`Разом: ${totalSum} грн`);
}

// Оформлення замовлення
function checkout() {
  if (!state.cartItems.length) {
    alert("Кошик порожній!");
    return;
  }

  const totalSum = state.cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const orderData = {
    chatId: telegramApp.initDataUnsafe.user?.id || "unknown",
    userName: telegramApp.initDataUnsafe.user?.username || "unknown",
    items: state.cartItems.map(({ id, name, price, quantity }) => ({
      id,
      name,
      price,
      quantity,
    })),
    total: totalSum,
    status: "Очікується",
    dateTime: new Date().toISOString(),
  };

  try {
    telegramApp.sendData(JSON.stringify(orderData));
    showRatingModal(orderData.items);
    state.cartItems = [];
    updateCartItems();
    updateCartCount();
    $("#cartOverlay").hide();
    $("#cartContainer").removeClass("active");
  } catch (error) {
    console.error("❌ Помилка відправки даних:", error);
    alert("Помилка при оформленні замовлення. Спробуйте ще раз.");
  }
}

// Відображення деталей страви
function showDishModal(itemId) {
  const item = state.menuItems.find((i) => i.id === itemId);
  if (!item) return;

  $("#modalDishImage").attr("src", item.image);
  $("#modalDishName").text(item.name);
  $("#modalDishDescription").text(item.description);
  $("#modalDishPrice").text(`${item.price} грн`);
  $("#modalAddToCartBtn").data("id", item.id);

  const $recommendationsList = $("#recommendationsList").html(
    '<div class="spinner"></div>'
  );

  axios
    .get(`${state.API_BASE_URL}/api/menu/recommendations/${itemId}`)
    .then(({ data }) => {
      $recommendationsList.empty();
      if (data?.length) {
        data.forEach(({ id, image, name }) => {
          $recommendationsList.append(`
            <div class="rec-card" data-id="${id}">
              <img src="${image}" alt="${name}">
              <span>${name}</span>
            </div>
          `);
        });
      } else {
        $recommendationsList.html(
          '<p class="no-items" style="font-size:12px;">Немає схожих товарів.</p>'
        );
      }
    })
    .catch((error) => {
      console.error("Помилка завантаження рекомендацій:", error);
      $recommendationsList.html(
        '<p class="no-items" style="color:red; font-size:12px;">Помилка.</p>'
      );
    });

  $("#dishModalOverlay").css("display", "flex");
}

// Генерація HTML для рейтингу зірок
function getStarRatingHTML(rating) {
  if (!rating || rating === 0) {
    return '<div class="star-rating no-rating">Ще немає оцінок</div>';
  }

  let starsHTML = "";
  for (let i = 1; i <= 5; i++) {
    starsHTML += i <= rating ? "⭐" : i - 0.5 <= rating ? "🌟" : "☆";
  }
  return `<div class="star-rating">${starsHTML} (${rating})</div>`;
}

// Модальне вікно для оцінки
function showRatingModal(orderedItems) {
  let $ratingModal = $("#ratingModal");
  if (!$ratingModal.length) {
    $("body").append(`
      <div class="modal-overlay" id="ratingModalOverlay" style="display:none;">
        <div class="modal-container" id="ratingModalContainer">
          <button class="close-modal" id="closeRatingModal">×</button>
          <h2>Оцініть ваше замовлення</h2>
          <p>Ваш відгук допоможе нам стати кращими!</p>
          <div id="ratingItemsList"></div>
          <button class="checkout-btn" id="submitRatingsBtn">Відправити оцінки</button>
        </div>
      </div>
    `);
  }

  const $ratingItemsList = $("#ratingItemsList").empty();
  orderedItems.forEach(({ id, name }) => {
    $ratingItemsList.append(`
      <div class="rating-item" data-id="${id}">
        <span class="rating-item-name">${name}</span>
        <div class="rating-stars-input">
          ${[5, 4, 3, 2, 1]
            .map(
              (star) => `
            <input type="radio" id="star-${id}-${star}" name="rating-${id}" value="${star}" />
            <label for="star-${id}-${star}">★</label>
          `
            )
            .join("")}
        </div>
      </div>
    `);
  });

  $("#ratingModalOverlay").css("display", "flex");
}

// Ініціалізація подій
$(document).ready(() => {
  loadMenu();

  // Вибір категорії
  $(".categories").on("click", ".category", function () {
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

  $("#closeCart, #cartOverlay").on("click", function (e) {
    if (e.target === this) {
      $("#cartContainer").removeClass("active");
      setTimeout(() => $("#cartOverlay").hide(), 300);
    }
  });

  // Керування кількістю
  $("#cartItems").on("click", ".quantity-btn", function () {
    const isIncrease = $(this).hasClass("increase");
    changeQuantity(parseInt($(this).data("id")), isIncrease ? 1 : -1);
  });

  // Оформлення замовлення
  $("#checkoutBtn").on("click", checkout);

  // Додавання до кошика з картки
  $("#menuContainer").on("click", ".add-to-cart", (e) => {
    e.stopPropagation();
    addToCart(parseInt($(e.currentTarget).data("id")));
  });

  // Відкриття модального вікна страви
  $("#menuContainer").on("click", ".dish-card", function () {
    showDishModal(parseInt($(this).data("item-id")));
  });

  // Закриття модального вікна страви
  $("#closeDishModal, #dishModalOverlay").on("click", function (e) {
    if (e.target === this) $("#dishModalOverlay").hide();
  });
  $("#dishModalContainer").on("click", (e) => e.stopPropagation());

  // Додавання до кошика з модального вікна
  $("#modalAddToCartBtn").on("click", function () {
    addToCart(parseInt($(this).data("id")));
    $("#dishModalOverlay").hide();
  });

  // Пошук
  $("#searchInput").on("input", function () {
    const query = $(this).val().toLowerCase().trim();
    $(".dish-card").each(function () {
      $(this).toggle(
        $(this).find(".dish-name").text().toLowerCase().includes(query)
      );
    });
  });

  // Перехід до сторінки замовлень
  $("#myOrdersBtn").on("click", () => {
    const userId = telegramApp.initDataUnsafe.user?.id;
    if (userId) {
      window.location.href = `/orders.html?userId=${userId}`;
    } else {
      alert("Не вдалося ідентифікувати користувача для перегляду замовлень.");
    }
  });

  // Закриття модального вікна оцінки
  $("body").on("click", "#closeRatingModal, #ratingModalOverlay", function (e) {
    if (e.target === this) $("#ratingModalOverlay").hide();
  });

  // Відправка оцінок
  $("body").on("click", "#submitRatingsBtn", () => {
    $(".rating-item").each(function () {
      const itemId = $(this).data("id");
      const rating = $(this).find('input[type="radio"]:checked').val();
      if (rating) {
        axios
          .post(`${state.API_BASE_URL}/api/menu/${itemId}/rate`, {
            rating: parseInt(rating),
          })
          .catch((err) =>
            console.error(`Помилка відправки рейтингу для ${itemId}:`, err)
          );
      }
    });
    $("#ratingModalOverlay").hide();
  });

  // Навігація до рекомендацій
  $("body").on("click", ".rec-card", function () {
    $("#dishModalOverlay").hide();
    showDishModal($(this).data("id"));
  });
});