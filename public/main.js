const telegramApp = window.Telegram.WebApp;
telegramApp.expand();

const state = {
  menuItems: [],
  cartItems: [],
  groupCart: null, // Holds group cart data
  socket: io(), // Connect to the socket server
  API_BASE_URL: "", // Relative paths
  currentUser: {
      id: telegramApp.initDataUnsafe.user?.id.toString() || 'unknown',
      name: telegramApp.initDataUnsafe.user?.username || 'Anonymous'
  }
};

// --- Group Cart Functions ---
function handleGroupCartURL() {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('groupCart');
    if (inviteCode) {
        state.socket.emit('join_group_cart', {
            inviteCode,
            userId: state.currentUser.id,
            userName: state.currentUser.name
        });
        // Remove the query param to avoid re-joining on refresh
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function createGroupCart() {
    state.socket.emit('create_group_cart', {
        ownerId: state.currentUser.id,
        ownerName: state.currentUser.name
    });
}

function showGroupCartInviteModal(inviteCode) {
    const inviteLink = `https://t.me/${telegramApp.initData.bot_username}?start=groupCart_${inviteCode}`;
    $('#groupCartInviteLink').val(inviteLink);
    $('#groupCartModalOverlay').css('display', 'flex');
}

function updateGroupCartView(data) {
    state.groupCart = data;
    state.cartItems = data.items; // Sync local cart with group cart

    $('#cartTitle').text('Спільне замовлення');
    $('#groupCartInfo').show();
    $('#groupCartOwner').text(data.participants.find(p => p.id === data.ownerId)?.name || 'N/A');
    $('#groupCartParticipants').text(data.participants.map(p => p.name).join(', '));
    
    // Disable checkout button if not the owner
    if(state.currentUser.id !== state.groupCart.ownerId) {
        $('#checkoutBtn').prop('disabled', true).text('Очікування власника');
    } else {
        $('#checkoutBtn').prop('disabled', false).text('Оформити спільне замовлення');
    }

    updateCartCount();
    updateCartItems();
    updateTotal();
}

// --- Regular Cart & Menu Functions ---

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

function addToCart(itemId) {
  const item = state.menuItems.find((i) => i.id === itemId);
  if (!item) return;

  if (state.groupCart) {
      state.socket.emit('add_to_group_cart', {
          inviteCode: state.groupCart.inviteCode,
          item: { id: item.id, name: item.name, price: item.price },
          userName: state.currentUser.name
      });
  } else {
      const existingItem = state.cartItems.find((i) => i.id === itemId);
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

function animateAddToCartButton(itemId) {
  const $button = $(`.add-to-cart[data-id="${itemId}"]`);
  $button.css("transform", "scale(1.2)");
  setTimeout(() => $button.css("transform", "scale(1)"), 200);
}

function updateCartCount() {
  const totalCount = state.cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  $("#cartCount").text(totalCount);
}

function updateCartItems() {
  const $cartItemsContainer = $("#cartItems").empty();

  if (!state.cartItems.length) {
    $cartItemsContainer.html(
      '<div class="no-items">Ваш кошик порожній</div>'
    );
  } else {
    state.cartItems.forEach((item) => {
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
        const item = state.cartItems.find((i) => i.id === itemId);
        if (!item) return;

        item.quantity += increment;
        if (item.quantity <= 0) {
            state.cartItems = state.cartItems.filter((i) => i.id !== itemId);
        }
        updateCartItems();
        updateCartCount();
    }
}

function updateTotal() {
  const totalSum = state.cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  $("#cartTotal").text(`Разом: ${totalSum} грн`);
}

function checkout() {
  if (!state.cartItems.length) {
    alert("Кошик порожній!");
    return;
  }
  
  if (state.groupCart) {
      if(state.currentUser.id !== state.groupCart.ownerId) {
          alert("Тільки власник кошика може оформити замовлення.");
          return;
      }
      // Use a direct API call for group checkout to trigger backend logic
      axios.post(`${state.API_BASE_URL}/api/group-cart/checkout`, {
          inviteCode: state.groupCart.inviteCode
      }).then(() => {
          showSuccess();
          resetCartState();
      }).catch(error => {
          console.error("❌ Помилка оформлення спільного замовлення:", error);
          alert("Помилка при оформленні спільного замовлення.");
      });

  } else {
      // Regular checkout
      const totalSum = state.cartItems.reduce(
        (sum, item) => sum + item.price * item.quantity, 0
      );
      const orderData = {
        chatId: state.currentUser.id,
        userName: state.currentUser.name,
        items: state.cartItems.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
        total: totalSum,
        status: "Очікується",
        dateTime: new Date().toISOString(),
      };

      try {
        telegramApp.sendData(JSON.stringify(orderData));
        showSuccess();
        resetCartState();
      } catch (error) {
        console.error("❌ Помилка відправки даних:", error);
        alert("Помилка при оформленні замовлення. Спробуйте ще раз.");
      }
  }
}

function showSuccess() {
    $("#cartOverlay").hide();
    $("#cartContainer").removeClass("active");
    $("#successModal").css("display", "flex");
    setTimeout(() => $("#successModal").css("display", "none"), 3000);
}

function resetCartState() {
    state.cartItems = [];
    state.groupCart = null;
    $('#groupCartInfo').hide();
    $('#cartTitle').text('Ваше замовлення');
    $('#checkoutBtn').prop('disabled', false).text('Оформити замовлення');
    updateCartItems();
    updateCartCount();
}

function showDishModal(itemId) {
  const item = state.menuItems.find((i) => i.id === itemId);
  if (!item) return;

  $("#modalDishImage").attr("src", item.image);
  $("#modalDishName").text(item.name);
  $("#modalDishDescription").text(item.description);
  $("#modalDishPrice").text(`${item.price} грн`);
  $("#modalAddToCartBtn").data("id", item.id);
  $("#dishModalOverlay").css("display", "flex");
}

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

// --- Event Listeners & Initialization ---
$(document).ready(() => {
  loadMenu();
  handleGroupCartURL();

  // Socket.IO Listeners
  state.socket.on('connect', () => {
    console.log('Socket connected:', state.socket.id);
    state.socket.emit('register', state.currentUser.id);
  });

  state.socket.on('group_cart_created', ({ inviteCode }) => {
    showGroupCartInviteModal(inviteCode);
    state.socket.emit('join_group_cart', { // The creator also joins
        inviteCode,
        userId: state.currentUser.id,
        userName: state.currentUser.name
    });
  });

  state.socket.on('group_cart_updated', (data) => {
    updateGroupCartView(data);
    if (!$('#cartContainer').hasClass('active')) {
        $('#openCart').click(); // Open cart to show updates
    }
  });

  state.socket.on('error', (data) => {
      alert(`Помилка: ${data.message}`);
  });
  
  // Group Cart Buttons
  $('#createGroupOrderBtn').on('click', createGroupCart);
  
  $('#closeGroupCartModal').on('click', () => $('#groupCartModalOverlay').hide());

  $('#copyInviteLinkBtn').on('click', function() {
      const linkInput = $('#groupCartInviteLink');
      linkInput.select();
      document.execCommand('copy');
      $(this).text('Скопійовано!');
      setTimeout(() => $(this).text('Копіювати посилання'), 2000);
  });

  // Category selection
  $(".categories").on("click", ".category", function () {
    $(".category").removeClass("active");
    $(this).addClass("active");
    displayMenu($(this).data("category"));
  });

  // Cart open/close
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

  // Quantity change
  $("#cartItems").on("click", ".quantity-btn", function () {
    const isIncrease = $(this).hasClass("increase");
    changeQuantity(parseInt($(this).data("id")), isIncrease ? 1 : -1);
  });

  // Checkout
  $("#checkoutBtn").on("click", checkout);

  // Add to cart from card
  $("#menuContainer").on("click", ".add-to-cart", (e) => {
    e.stopPropagation();
    addToCart(parseInt($(e.currentTarget).data("id")));
  });

  // Dish modal
  $("#menuContainer").on("click", ".dish-card", function () {
    showDishModal(parseInt($(this).data("item-id")));
  });

  $("#closeDishModal, #dishModalOverlay").on("click", function (e) {
    if (e.target === this) $("#dishModalOverlay").hide();
  });
  $("#dishModalContainer").on("click", (e) => e.stopPropagation());

  // Add to cart from modal
  $("#modalAddToCartBtn").on("click", function () {
    addToCart(parseInt($(this).data("id")));
    $("#dishModalOverlay").hide();
  });

  // Search
  $("#searchInput").on("input", function () {
    const query = $(this).val().toLowerCase().trim();
    $(".dish-card").each(function () {
      $(this).toggle(
        $(this).find(".dish-name").text().toLowerCase().includes(query)
      );
    });
  });
});