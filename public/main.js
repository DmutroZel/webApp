let telegramApp = window.Telegram.WebApp;
telegramApp.expand();

let menuItems = [];
let cartItems = [];

const API_BASE_URL = ""; // Relative paths will work fine

function loadMenu() {
    let request = axios.get(`${API_BASE_URL}/api/menu`); // MODIFIED: API path
    request.then(function(response) {
        menuItems = response.data;
        displayMenu("all");
    });
    request.catch(function(error) {
        console.error("Помилка завантаження меню:", error);
        $("#menuContainer").html('<p class="no-items" style="color: red;">Не вдалося завантажити меню. Спробуйте оновити.</p>');
    });
}

function displayMenu(category) {
    let menuContainer = $("#menuContainer");
    menuContainer.empty();
    
    let menuGrid = $("<div>").addClass("menu-grid");
    
    let itemsToShow = menuItems.filter(item => category === 'all' || item.category === category);

    if (itemsToShow.length === 0) {
        menuGrid.html('<p class="no-items">У цій категорії поки що немає страв.</p>');
    } else {
        itemsToShow.forEach(item => {
            // MODIFIED: Added data-item-id to the card itself
            let card = $("<div>").addClass("dish-card").data("item-id", item.id);
            card.html(
                // MODIFIED: Use item.image from DB
                `<img src="${item.image}" alt="${item.name}" class="dish-image">` +
                '<div class="dish-info">' +
                    `<h3 class="dish-name">${item.name}</h3>` +
                    `<p class="dish-description">${item.description}</p>` +
                    '<div class="dish-price-add">' +
                        `<span class="dish-price">${item.price} грн</span>` +
                        // MODIFIED: data-id is now on the button
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
    let item = menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    let existingItem = cartItems.find(i => i.id === itemId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        // Create a copy to avoid modifying the original menuItems array
        const newItem = { ...item, quantity: 1 };
        cartItems.push(newItem);
    }
    
    updateCartCount();
    
    // NEW: Visual feedback on add
    const targetCard = $(`.add-to-cart[data-id="${itemId}"]`);
    targetCard.css('transform', 'scale(1.2)');
    setTimeout(() => targetCard.css('transform', 'scale(1)'), 200);
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
    } else {
        cartItems.forEach(item => {
            let cartItem = $("<div>").addClass("cart-item");
            cartItem.html(
                '<div class="cart-item-info">' +
                    `<h3 class="cart-item-name">${item.name}</h3>` +
                    `<div class="cart-item-price">${item.price} грн</div>` +
                '</div>' +
                '<div class="cart-item-quantity">' +
                    `<button class="quantity-btn decrease" data-id="${item.id}">-</button>` +
                    `<span>${item.quantity}</span>` +
                    `<button class="quantity-btn increase" data-id="${item.id}">+</button>` +
                '</div>'
            );
            cartItemsContainer.append(cartItem);
        });
    }
    
    updateTotal();
}

function increaseQuantity(itemId) {
    let item = cartItems.find(i => i.id === itemId);
    if (item) {
        item.quantity++;
        updateCartItems();
        updateCartCount();
    }
}

function decreaseQuantity(itemId) {
    let item = cartItems.find(i => i.id === itemId);
    if (item) {
        item.quantity--;
        if (item.quantity <= 0) {
            cartItems = cartItems.filter(i => i.id !== itemId);
        }
        updateCartItems();
        updateCartCount();
    }
}

function updateTotal() {
    let totalSum = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    $("#cartTotal").text(`Разом: ${totalSum} грн`);
}

function checkout() {
    if (cartItems.length === 0) {
        alert("Кошик порожній!");
        return;
    }
    
    let totalSum = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    let orderData = {
        chatId: telegramApp.initDataUnsafe.user?.id || "unknown",
        userName: telegramApp.initDataUnsafe.user?.username || "unknown",
        // Make sure to only send necessary data
        items: cartItems.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
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
        
        setTimeout(function() {
            $("#successModal").css("display", "none");
            $("#cartOverlay").css("display", "none");
            $("#cartContainer").removeClass("active");
        }, 2500);
        
    } catch (error) {
        console.error("❌ Помилка відправки даних:", error);
        alert("Помилка при оформленні замовлення. Спробуйте ще раз.");
    }
}

// NEW: Function to show the dish detail modal
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
    
    // --- ORIGINAL EVENT LISTENERS ---
    $('.categories').on('click', '.category', function() {
        $('.category').removeClass("active");
        $(this).addClass("active");
        let category = $(this).data("category");
        displayMenu(category);
    });
    
    $("#openCart").on("click", function() {
        $("#cartOverlay").css("display", "block");
        updateCartItems();
        setTimeout(function() {
            $("#cartContainer").addClass("active");
        }, 10);
    });
    
    $("#closeCart").on("click", function() {
        $("#cartContainer").removeClass("active");
        setTimeout(function() {
            $("#cartOverlay").css("display", "none");
        }, 300);
    });
    
    $("#cartOverlay").on("click", function(event) {
        if (event.target === this) {
            $("#cartContainer").removeClass("active");
            setTimeout(function() {
                $("#cartOverlay").css("display", "none");
            }, 300);
        }
    });

    // Delegated event listener for cart quantity buttons
    $('#cartItems').on('click', '.increase', function() {
        increaseQuantity(parseInt($(this).data('id')));
    });
    $('#cartItems').on('click', '.decrease', function() {
        decreaseQuantity(parseInt($(this).data('id')));
    });
    
    $("#checkoutBtn").on("click", checkout);

    // --- NEW & MODIFIED EVENT LISTENERS ---
    
    // Use event delegation for items loaded via AJAX
    $('#menuContainer').on('click', '.add-to-cart', function(e) {
        e.stopPropagation(); // Prevent modal from opening when clicking the '+'
        let itemId = parseInt($(this).data("id"));
        addToCart(itemId);
    });

    // NEW: Open dish modal on card click
    $('#menuContainer').on('click', '.dish-card', function() {
        let itemId = parseInt($(this).data("item-id"));
        showDishModal(itemId);
    });
    
    // NEW: Close dish modal
    $('#closeDishModal, #dishModalOverlay').on('click', function(e) {
        // Ensure we close only when clicking the overlay itself
        if (e.target === this) {
            $('#dishModalOverlay').hide();
        }
    });
    $('#dishModalContainer').on('click', e => e.stopPropagation()); // Prevent closing when clicking inside modal

    // NEW: Add to cart from modal
    $('#modalAddToCartBtn').on('click', function() {
        let itemId = parseInt($(this).data('id'));
        addToCart(itemId);
        $('#dishModalOverlay').hide();
    });

    // NEW: Search functionality
    $('#searchInput').on('input', function() {
        let query = $(this).val().toLowerCase().trim();
        $('.dish-card').each(function() {
            const dishName = $(this).find('.dish-name').text().toLowerCase();
            $(this).toggle(dishName.includes(query));
        });
    });

    // NEW: Navigate to My Orders page
    $('#myOrdersBtn').on('click', function() {
        const userId = telegramApp.initDataUnsafe.user?.id;
        if(userId) {
            // Use location.href for navigation
            window.location.href = `/orders.html?userId=${userId}`;
        } else {
            alert("Не вдалося ідентифікувати користувача для перегляду замовлень.");
        }
    });
});