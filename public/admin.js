const tg = window.Telegram.WebApp;
tg.expand();

const adminId = new URLSearchParams(window.location.search).get("adminId");

function loadOrders() {
  $.get(`/orders?adminId=${adminId}`, orders => {
    const container = $("#ordersContainer");
    container.empty();
    orders.forEach(order => {
      const itemsList = order.items.map(item => `${item.name} x${item.quantity} - ${item.price * item.quantity} грн`).join("<br>");
      const card = `
        <div class="order-card">
          <h3>Замовлення від @${order.userName} (ID: ${order.chatId})</h3>
          <p><strong>Час:</strong> ${new Date(order.dateTime).toLocaleString()}</p>
          <p><strong>Товари:</strong><br>${itemsList}</p>
          <p><strong>Сума:</strong> ${order.total} грн</p>
          <p><strong>Статус:</strong>
            <select class="status-select" data-id="${order._id}">
              <option value="Очікується" ${order.status === "Очікується" ? "selected" : ""}>Очікується</option>
              <option value="Опрацьовується" ${order.status === "Опрацьовується" ? "selected" : ""}>Опрацьовується</option>
              <option value="Виконано" ${order.status === "Виконано" ? "selected" : ""}>Виконано</option>
            </select>
          </p>
        </div>
      `;
      container.append(card);
    });

    $(".status-select").change(function() {
      const orderId = $(this).data("id");
      const newStatus = $(this).val();
      $.ajax({
        url: `/orders/update-status/${orderId}`,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ adminId, status: newStatus }),
        success: () => alert("Статус оновлено!"),
        error: err => alert("Помилка: " + err.responseJSON.error)
      });
    });
  });
}

function loadMenuItems() {
  $.get("/menu", items => {
    const container = $("#menuItemsList");
    container.empty();
    items.forEach(item => {
      const card = `
        <div class="dish-card">
          <img src="${item.image}" alt="${item.name}" class="dish-image">
          <div class="dish-info">
            <h3 class="dish-name">${item.name}</h3>
            <p class="dish-description">${item.description}</p>
            <p><strong>Ціна:</strong> ${item.price} грн</p>
            <p><strong>Категорія:</strong> ${item.category}</p>
            <button class="delete-btn" data-id="${item.id}">Видалити</button>
          </div>
        </div>
      `;
      container.append(card);
    });
    $(".delete-btn").on("click", function() {
      const itemId = $(this).data("id");
      if (confirm("Видалити цю страву?")) {
        $.ajax({
          url: `/menu/${itemId}`,
          method: "DELETE",
          contentType: "application/json",
          data: JSON.stringify({ adminId }),
          success: () => {
            alert("Страву видалено!");
            loadMenuItems();
          },
          error: err => alert("Помилка: " + err.responseJSON.error)
        });
      }
    });
  });
}

function loadCategories() {
  $.get("/categories", categories => {
    const select = $("#itemCategory");
    select.empty();
    const list = $("#categoriesList");
    list.empty();
    categories.forEach(cat => {
      if (cat.id !== "all") {
        select.append(`<option value="${cat.id}">${cat.name}</option>`);
        const card = `
          <div class="category-card">
            <p><strong>ID:</strong> ${cat.id}</p>
            <p><strong>Назва:</strong> ${cat.name}</p>
            <button class="delete-btn" data-id="${cat.id}">Видалити</button>
          </div>
        `;
        list.append(card);
      }
    });
    $(".delete-btn").on("click", function() {
      const catId = $(this).data("id");
      if (confirm("Видалити цю категорію?")) {
        $.ajax({
          url: `/categories/${catId}`,
          method: "DELETE",
          contentType: "application/json",
          data: JSON.stringify({ adminId }),
          success: () => {
            alert("Категорію видалено!");
            loadCategories();
          },
          error: err => alert("Помилка: " + err.responseJSON.error)
        });
      }
    });
  });
}

$(document).ready(() => {
  loadOrders();
  loadMenuItems();
  loadCategories();
  setInterval(loadOrders, 30000);

  $(".admin-tab").on("click", function() {
    $(".admin-tab").removeClass("active");
    $(this).addClass("active");
    $(".tab-content").hide();
    $(`#${$(this).data("tab")}Container`).show();
  });

  $("#addMenuItemForm").submit(e => {
    e.preventDefault();
    const newItem = {
      adminId,
      name: $("#itemName").val(),
      description: $("#itemDescription").val(),
      price: parseInt($("#itemPrice").val()),
      image: $("#itemImage").val(),
      category: $("#itemCategory").val()
    };
    $.ajax({
      url: "/menu",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(newItem),
      success: () => {
        alert("Страву додано!");
        $("#addMenuItemForm")[0].reset();
        loadMenuItems();
      },
      error: err => alert("Помилка: " + err.responseJSON.error)
    });
  });

  $("#addCategoryForm").submit(e => {
    e.preventDefault();
    const newCategory = {
      adminId,
      id: $("#categoryId").val().toLowerCase().replace(/\s/g, ""),
      name: $("#categoryName").val()
    };
    $.ajax({
      url: "/categories",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(newCategory),
      success: () => {
        alert("Категорію додано!");
        $("#addCategoryForm")[0].reset();
        loadCategories();
      },
      error: err => alert("Помилка: " + err.responseJSON.error)
    });
  });
});