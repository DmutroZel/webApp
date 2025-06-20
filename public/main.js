let telegramApp = window.Telegram.WebApp;
telegramApp.expand();

let menuItems = [];
let cartItems = [];

const API_BASE_URL = "https://webapp-hayk.onrender.com"; // Ваша URL

function loadMenu() {
    axios.get(`${API_BASE_URL}/menu`)
        .then(function(response) {
            menuItems = response.data;
            displayMenu("all");
        })
        .catch(function(error) {
            console.error("Помилка завантаження меню:", error);
            $("#menuContainer").html('<p class="error-message">Не вдалося завантажити меню. Спробуйте пізніше.</p>');
        });
}

function displayMenu(category) {
    let menuContainer = $("#menuContainer");
    menuContainer.empty();
    
    let menuGrid = $("<div>").addClass("menu-grid");
    
    let itemsToShow = menuItems.filter(item => category === "all" || item.category === category);
    
    if (itemsToShow.length === 0) {
        menuGrid.html('<p class="no-items">У цій категорії поки що немає страв.</p>');
    } else {
        itemsToShow.forEach(item => {
            let card = $("<div>").addClass("dish-card").data("item-id", item.id);
            card.html(
                `<img src="${item.image}" alt="${item.name}" class="dish-image">` +
                '<div class="dish-info">' +
                    `<h3 class="dish-name">${item.name}</h3>` +
                    `<p class="dish-description">${item.description}</p>` +
                    '<div class="dish-price-add">' +
                        `<span class="dish-price">${item.price} грн</span>` +
                        `<button class="add-to-cart" data-id="${item.id}">+</button>` +
                    '</div>' +
                '</div>'
            );
            menuGrid.append(card);
        });
    }
    
    menuContainer.append(menuGrid);
}

function addToCart(itemId) {
    let itemToAdd = menuItems.find(item => item.id === itemId);
    if (!itemToAdd) return;

    let existingItem = cartItems.find(item => item.id === itemId);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cartItems.push({ ...itemToAdd, quantity: 1 });
    }
    
    updateCartCount();
    // NEW: Add a visual feedback
    const targetCard = $(`.dish-card[data-item-id="${itemId}"]`);
    targetCard.css('transform', 'scale(0.95)');
    setTimeout(() => targetCard.css('transform', 'scale(1)'), 200);
}

// ... (Ваші функції updateCartCount, updateCartItems, increase/decreaseQuantity, updateTotal) ...
// (Код цих функцій залишається майже без змін, тому я його тут пропущу для стислості)
// Переконайтесь, що ви скопіювали їх зі свого старого main.js

function checkout() {
    if (cartItems.length === 0) {
        alert("Кошик порожній!");
        return;
    }
    
    let totalSum = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    let orderData = {
        chatId: telegramApp.initDataUnsafe.user?.id || "unknown",
        userName: telegramApp.initDataUnsafe.user?.username || "unknown",
        items: cartItems.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
        total: totalSum,
        status: "Очікується",
        dateTime: new Date().toISOString()
    };
    
    try {
        telegramApp.sendData(JSON.stringify(orderData));
        
        $("#successModal").css("display", "block");
        cartItems = [];
        updateCartItems();
        updateCartCount();
        
        setTimeout(() => {
            $("#successModal").css("display", "none");
            $("#cartOverlay").css("display", "none");
            $("#cartContainer").removeClass("active");
        }, 2500);
        
    } catch (error) {
        console.error("❌ Помилка відправки даних:", error);
        alert("Помилка при оформленні замовлення. Спробуйте ще раз.");
    }
}


// NEW: Show Dish Detail Modal
function showDishModal(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;

    $('#modalDishImage').attr('src', item.image);
    $('#modalDishName').text(item.name);
    $('#modalDishDescription').text(item.description);
    $('#modalDishPrice').text(`${item.price} грн`);
    $('#modalAddToCartBtn').data('id', item.id);

    $('#dishModalOverlay').css('display', 'flex');
}

$(document).ready(function() {
    loadMenu();
    
    // Category filter
    $('.categories').on('click', '.category', function() {
        $('.category').removeClass('active');
        $(this).addClass('active');
        let category = $(this).data('category');
        displayMenu(category);
    });
    
    // Add to cart from main page
    $('#menuContainer').on('click', '.add-to-cart', function(e) {
        e.stopPropagation(); // Prevent modal from opening
        let itemId = parseInt($(this).data("id"));
        addToCart(itemId);
    });

    // Open dish modal
    $('#menuContainer').on('click', '.dish-card', function() {
        let itemId = parseInt($(this).data("item-id"));
        showDishModal(itemId);
    });
    
    // Close dish modal
    $('#closeDishModal, #dishModalOverlay').on('click', function(e) {
        if (e.target === this) {
            $('#dishModalOverlay').hide();
        }
    });
    $('#dishModalContainer').on('click', e => e.stopPropagation());

    // Add to cart from modal
    $('#modalAddToCartBtn').on('click', function() {
        let itemId = parseInt($(this).data('id'));
        addToCart(itemId);
        $('#dishModalOverlay').hide();
    });

    // Search functionality
    $('#searchInput').on('input', function() {
        let query = $(this).val().toLowerCase().trim();
        $('.dish-card').each(function() {
            const dishName = $(this).find('.dish-name').text().toLowerCase();
            $(this).toggle(dishName.includes(query));
        });
    });

    // Navigate to My Orders page
    $('#myOrdersBtn').on('click', function() {
        const userId = telegramApp.initDataUnsafe.user?.id;
        if(userId) {
            window.location.href = `/orders.html?userId=${userId}`;
        } else {
            alert("Не вдалося ідентифікувати користувача.");
        }
    });

    // ... (Ваш існуючий код для відкриття/закриття кошика та checkout) ...
    // Переконайтесь, що ви скопіювали його зі свого старого main.js
     let openCartButton = $("#openCart");
    openCartButton.on("click", function() {
        $("#cartOverlay").css("display", "block");
        updateCartItems();
        setTimeout(function() {
            $("#cartContainer").addClass("active");
        }, 10);
    });
});
// Функції, які не були включені вище, але потрібні
function updateCartCount() { let totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0); $("#cartCount").text(totalCount); }
function updateCartItems() { let cartItemsContainer = $("#cartItems"); cartItemsContainer.empty(); if (cartItems.length === 0) { cartItemsContainer.html('<div class="no-items">Ваш кошик порожній</div>'); updateTotal(); return; } cartItems.forEach(item => { let cartItem = $("<div>").addClass("cart-item"); cartItem.html(`<div class="cart-item-info"><h3 class="cart-item-name">${item.name}</h3><div class="cart-item-price">${item.price} грн</div></div><div class="cart-item-quantity"><button class="quantity-btn decrease" data-id="${item.id}">-</button><span>${item.quantity}</span><button class="quantity-btn increase" data-id="${item.id}">+</button></div>`); cartItemsContainer.append(cartItem); }); updateTotal(); }
function increaseQuantity(itemId) { let item = cartItems.find(i => i.id === itemId); if (item) { item.quantity++; updateCartItems(); updateCartCount(); } }
function decreaseQuantity(itemId) { let item = cartItems.find(i => i.id === itemId); if (item) { item.quantity--; if (item.quantity <= 0) { cartItems = cartItems.filter(i => i.id !== itemId); } updateCartItems(); updateCartCount(); } }
function updateTotal() { let totalSum = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0); $("#cartTotal").text(`Разом: ${totalSum} грн`); }
// Обробники для кнопок +/- в кошику
$('#cartItems').on('click', '.increase', function() { increaseQuantity(parseInt($(this).data('id'))); });
$('#cartItems').on('click', '.decrease', function() { decreaseQuantity(parseInt($(this).data('id'))); });

// Інші обробники
$("#checkoutBtn").on("click", checkout);
let closeCartButton = $("#closeCart");
closeCartButton.on("click", function() { $("#cartContainer").removeClass("active"); setTimeout(() => { $("#cartOverlay").css("display", "none"); }, 300); });
let cartOverlay = $("#cartOverlay");
cartOverlay.on("click", function(event) { if (event.target === this) { $("#cartContainer").removeClass("active"); setTimeout(() => { $("#cartOverlay").css("display", "none"); }, 300); } });