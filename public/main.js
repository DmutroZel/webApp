let telegramApp = window.Telegram.WebApp;
telegramApp.expand();

let menuItems = [];
let cartItems = [];

function loadMenu() {
    let request = axios.get("/menu");
    request.then(function(response) {
        menuItems = response.data;
        displayMenu("all");
    });
    request.catch(function(error) {
        console.error("Помилка завантаження меню:", error);
    });
}

function displayMenu(category) {
    let menuContainer = $("#menuContainer");
    menuContainer.empty();
    
    let menuGrid = $("<div>");
    menuGrid.addClass("menu-grid");
    
    let itemsToShow = [];
    if (category === "all") {
        for (let i = 0; i < menuItems.length; i++) {
            itemsToShow.push(menuItems[i]);
        }
    } else {
        for (let i = 0; i < menuItems.length; i++) {
            if (menuItems[i].category === category) {
                itemsToShow.push(menuItems[i]);
            }
        }
    }
    
    for (let i = 0; i < itemsToShow.length; i++) {
        let item = itemsToShow[i];
        let card = $("<div>");
        card.addClass("dish-card");
        card.html(
            '<img src="' + item.image + '" alt="' + item.name + '" class="dish-image">' +
            '<div class="dish-info">' +
                '<h3 class="dish-name">' + item.name + '</h3>' +
                '<p class="dish-description">' + item.description + '</p>' +
                '<div class="dish-price-add">' +
                    '<span class="dish-price">' + item.price + ' грн</span>' +
                    '<button class="add-to-cart" data-id="' + item.id + '">+</button>' +
                '</div>' +
            '</div>'
        );
        menuGrid.append(card);
    }
    
    menuContainer.append(menuGrid);
    
    let addToCartButtons = $(".add-to-cart");
    addToCartButtons.on("click", function() {
        let itemId = parseInt($(this).data("id"));
        addToCart(itemId);
    });
}

function addToCart(itemId) {
    let item = null;
    for (let i = 0; i < menuItems.length; i++) {
        if (menuItems[i].id === itemId) {
            item = menuItems[i];
            break;
        }
    }
    if (item === null) {
        return;
    }
    
    let existingItem = null;
    for (let i = 0; i < cartItems.length; i++) {
        if (cartItems[i].id === itemId) {
            existingItem = cartItems[i];
            break;
        }
    }
    
    if (existingItem) {
        existingItem.quantity = existingItem.quantity + 1;
    } else {
        let newItem = {
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1
        };
        cartItems.push(newItem);
    }
    
    updateCartCount();
}

function updateCartCount() {
    let totalCount = 0;
    for (let i = 0; i < cartItems.length; i++) {
        totalCount = totalCount + cartItems[i].quantity;
    }
    $("#cartCount").text(totalCount);
}

function updateCartItems() {
    let cartItemsContainer = $("#cartItems");
    cartItemsContainer.empty();
    
    if (cartItems.length === 0) {
        cartItemsContainer.html('<div class="no-items">Ваш кошик порожній</div>');
        return;
    }
    
    for (let i = 0; i < cartItems.length; i++) {
        let item = cartItems[i];
        let cartItem = $("<div>");
        cartItem.addClass("cart-item");
        cartItem.html(
            '<div class="cart-item-info">' +
                '<h3 class="cart-item-name">' + item.name + '</h3>' +
                '<div class="cart-item-price">' + item.price + ' грн</div>' +
            '</div>' +
            '<div class="cart-item-quantity">' +
                '<button class="quantity-btn decrease" data-id="' + item.id + '">-</button>' +
                '<span>' + item.quantity + '</span>' +
                '<button class="quantity-btn increase" data-id="' + item.id + '">+</button>' +
            '</div>'
        );
        cartItemsContainer.append(cartItem);
    }
    
    let decreaseButtons = $(".decrease");
    decreaseButtons.on("click", function() {
        let itemId = parseInt($(this).data("id"));
        decreaseQuantity(itemId);
    });
    
    let increaseButtons = $(".increase");
    increaseButtons.on("click", function() {
        let itemId = parseInt($(this).data("id"));
        increaseQuantity(itemId);
    });
    
    updateTotal();
}

function increaseQuantity(itemId) {
    let item = null;
    for (let i = 0; i < cartItems.length; i++) {
        if (cartItems[i].id === itemId) {
            item = cartItems[i];
            break;
        }
    }
    
    if (item) {
        item.quantity = item.quantity + 1;
        updateCartItems();
        updateCartCount();
    }
}

function decreaseQuantity(itemId) {
    let item = null;
    for (let i = 0; i < cartItems.length; i++) {
        if (cartItems[i].id === itemId) {
            item = cartItems[i];
            break;
        }
    }
    
    if (item) {
        item.quantity = item.quantity - 1;
        if (item.quantity <= 0) {
            let newCart = [];
            for (let i = 0; i < cartItems.length; i++) {
                if (cartItems[i].id !== itemId) {
                    newCart.push(cartItems[i]);
                }
            }
            cartItems = newCart;
        }
        updateCartItems();
        updateCartCount();
    }
}

function updateTotal() {
    let totalSum = 0;
    for (let i = 0; i < cartItems.length; i++) {
        totalSum = totalSum + (cartItems[i].price * cartItems[i].quantity);
    }
    $("#cartTotal").text("Разом: " + totalSum + " грн");
}

function checkout() {
    if (cartItems.length === 0) {
        return;
    }
    
    console.log("Telegram WebApp Data:", telegramApp.initDataUnsafe);
    
    let totalSum = 0;
    for (let i = 0; i < cartItems.length; i++) {
        totalSum = totalSum + (cartItems[i].price * cartItems[i].quantity);
    }
    
    let orderData = {
        chatId: telegramApp.initDataUnsafe.user ? telegramApp.initDataUnsafe.user.id : "unknown",
        userName: telegramApp.initDataUnsafe.user ? telegramApp.initDataUnsafe.user.username : "unknown",
        items: cartItems,
        total: totalSum,
        status: "Очікується",
        dateTime: new Date().toISOString()
    };
    
    let request = axios.post("/orders", orderData, {
        headers: { "Content-Type": "application/json" }
    });
    
    request.then(function(response) {
        if (response.data.success) {
            $("#successModal").css("display", "block");
            cartItems = [];
            updateCartItems();
            updateCartCount();
            
            setTimeout(function() {
                $("#successModal").css("display", "none");
                $("#cartOverlay").css("display", "none");
                $("#cartContainer").removeClass("active");
                telegramApp.sendData(JSON.stringify(orderData));
            }, 1000);
        }
    });
    
    request.catch(function(error) {
        console.error("Помилка при оформленні замовлення:", error);
    });
}

$(document).ready(function() {
    loadMenu();
    
    let categoryButtons = $(".category");
    categoryButtons.on("click", function() {
        categoryButtons.removeClass("active");
        $(this).addClass("active");
        let category = $(this).data("category");
        displayMenu(category);
    });
    
    let openCartButton = $("#openCart");
    openCartButton.on("click", function() {
        $("#cartOverlay").css("display", "block");
        updateCartItems();
        setTimeout(function() {
            $("#cartContainer").addClass("active");
        }, 10);
    });
    
    let closeCartButton = $("#closeCart");
    closeCartButton.on("click", function() {
        $("#cartContainer").removeClass("active");
        setTimeout(function() {
            $("#cartOverlay").css("display", "none");
        }, 300);
    });
    
    let cartOverlay = $("#cartOverlay");
    cartOverlay.on("click", function(event) {
        if (event.target === this) {
            $("#cartContainer").removeClass("active");
            setTimeout(function() {
                $("#cartOverlay").css("display", "none");
            }, 300);
        }
    });
    
    let checkoutButton = $("#checkoutBtn");
    checkoutButton.on("click", checkout);
});
