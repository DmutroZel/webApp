const telegramApp = window.Telegram.WebApp;
const adminId = new URLSearchParams(window.location.search).get("adminId");
const API_BASE_URL = "";
let salesChart = null;

const state = {
  menuItems: [],
  orders: [], // Стан для замовлень
};

// Оновлення статистики на дашборді
function updateDashboardStats() {
  axios
    .get(`${API_BASE_URL}/api/menu`)
    .then(({ data }) => {
      $("#totalDishes").text(data.length || 0);
      state.menuItems = data;
    })
    .catch((err) => console.error("Помилка завантаження меню:", err));
}

// Завантаження аналітики
function loadAnalytics() {
  axios
    .get(`${API_BASE_URL}/api/analytics/summary`, { params: { adminId } })
    .then(({ data: { salesByCategory, topSellingItems } }) => {
      const ctx = document.getElementById("salesByCategoryChart").getContext("2d");
      if (salesChart) salesChart.destroy();
      // Примітка: Chart.js не завантажений у вашому HTML, тому цей код може викликати помилку.
      // Щоб він запрацював, потрібно додати Chart.js до <head>
      /*
      salesChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: salesByCategory.map((item) => item._id),
          datasets: [{
            label: "Продажі",
            data: salesByCategory.map((item) => item.totalSales),
            backgroundColor: ["#ff6b35", "#2c3e50", "#f39c12", "#27ae60", "#8e44ad"],
            borderColor: "#ffffff",
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "top" },
            title: { display: false },
          },
        },
      });
      */

      const $topItemsList = $("#topSellingItemsList").empty();
      topSellingItems.length
        ? topSellingItems.forEach(({ _id, totalQuantity }) =>
            $topItemsList.append(`<li><span>${_id}</span> <span>Продано: ${totalQuantity}</span></li>`)
          )
        : $topItemsList.append('<li class="no-items">Немає даних про продажі.</li>');
    })
    .catch((error) => console.error("Помилка завантаження аналітики:", error));
}

// Нова функція для завантаження замовлень
function loadOrders() {
    const $ordersList = $("#adminOrdersList").html(
        '<div class="loading"><div class="spinner"></div></div>'
    );

    axios.get(`${API_BASE_URL}/api/orders`, { params: { adminId } })
        .then(({ data }) => {
            state.orders = data;
            $ordersList.empty();
            if (!data.length) {
                $ordersList.html('<p class="no-items">Немає активних замовлень</p>');
                return;
            }

            data.forEach(order => {
                const orderItemsHtml = order.items.map(item =>
                    `<li>• ${item.name} x ${item.quantity} (додав/ла ${item.addedBy || 'власник'})</li>`
                ).join('');

                const orderCard = `
                    <div class="admin-order-item" data-id="${order._id}">
                        <div class="order-header">
                            <h4>Замовлення №${order._id.slice(-6).toUpperCase()}</h4>
                            <span>${new Date(order.dateTime).toLocaleString('uk-UA')}</span>
                        </div>
                        <div class="order-details">
                            <p><strong>Клієнт:</strong> @${order.userName || 'Анонім'} ${order.isGroupOrder ? '<strong>(Спільне)</strong>' : ''}</p>
                            <ul>${orderItemsHtml}</ul>
                        </div>
                        <div class="order-footer">
                            <span class="order-total">Всього: ${order.total} грн</span>
                            <button class="btn btn-accept" data-id="${order._id}">
                                <span>✅</span> Прийняти
                            </button>
                        </div>
                    </div>
                `;
                $ordersList.append(orderCard);
            });
        })
        .catch((error) => {
            console.error("Помилка завантаження замовлень:", error);
            $ordersList.html('<p class="error">Помилка завантаження замовлень</p>');
        });
}


// Завантаження списку страв
function loadMenuItems() {
  const $menuList = $("#adminMenuList").html(
    '<div class="loading"><div class="spinner"></div></div>'
  );

  axios
    .get(`${API_BASE_URL}/api/menu`)
    .then(({ data }) => {
      state.menuItems = data;
      $menuList.empty();
      if (!data.length) {
        $menuList.html('<p class="no-items">Немає страв у меню</p>');
        return;
      }
      data.forEach(({ id, image, name, price, category, description }) => { // Додав description до деструктуризації
        $menuList.append(`
          <div class="admin-menu-item" data-id="${id}" data-description="${description}" data-category="${category}">
            <img src="${image || './placeholder.jpg'}" alt="${name}" onerror="this.onerror=null;this.src='./placeholder.jpg';">
            <div class="admin-menu-info">
              <h4>${name}</h4>
              <p>${price} грн - ${category}</p>
            </div>
            <div class="admin-menu-actions">
              <button class="btn-icon btn-edit">✏️</button>
              <button class="btn-icon btn-delete">🗑️</button>
            </div>
          </div>
        `);
      });
    })
    .catch((error) => {
      console.error("Помилка завантаження страв:", error);
      $menuList.html('<p class="error">Помилка завантаження меню</p>');
    });
}

// Скидання форми
function resetForm() {
  $("#menuItemForm")[0].reset();
  $("#itemId").val("");
  $("#formIcon").text("➕");
  $("#formTitle").text("Додати нову страву");
  $("#formSubmitBtn").html("<span>➕</span> Додати страву").prop("disabled", false);
  $("#cancelEditBtn").hide();
  $("#fileLabel").text("📷 Оберіть зображення");
}

// Показ повідомлення про помилку або успіх
function showToast(message, isError = false) {
  const $toast = $('<div class="toast"></div>').text(message);
  if (isError) {
      $toast.addClass('error');
  }
  $("body").append($toast);
  setTimeout(() => {
    $toast.addClass("show");
    setTimeout(() => $toast.removeClass("show").delay(300).remove(), 3000);
  }, 100);
}

// Ініціалізація подій
$(document).ready(() => {
  telegramApp.expand();
  updateDashboardStats();
  loadAnalytics();
  loadMenuItems();
  loadOrders(); // Завантажуємо замовлення при старті

  // Зміна назви файлу при виборі зображення
  $("#itemImage").on("change", (e) => {
    const file = e.target.files[0];
    $("#fileLabel").text(file ? file.name : "📷 Оберіть зображення");
  });

  // Відправка форми
  $("#menuItemForm").on("submit", (e) => {
    e.preventDefault();
    const itemId = $("#itemId").val();
    const formData = new FormData();
    formData.append("adminId", adminId);
    formData.append("name", $("#itemName").val());
    formData.append("description", $("#itemDescription").val());
    formData.append("price", $("#itemPrice").val());
    formData.append("category", $("#itemCategory").val());
    const imageFile = $("#itemImage")[0].files[0];
    if (imageFile) formData.append("image", imageFile);

    const url = itemId ? `${API_BASE_URL}/api/menu/${itemId}` : `${API_BASE_URL}/api/menu`;
    const method = itemId ? "put" : "post";

    $("#formSubmitBtn")
      .prop("disabled", true)
      .html('<span>🔄</span> Обробка...');

    axios({
      method,
      url,
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
    })
      .then(() => {
        loadMenuItems();
        updateDashboardStats();
        resetForm();
        showToast(`Страву успішно ${itemId ? "оновлено" : "додано"}!`);
      })
      .catch((error) => {
        showToast(`Помилка: ${error.response?.data?.error || "Не вдалося зберегти страву"}`, true);
      })
      .finally(() => {
        // Кнопка скидається у функції resetForm()
      });
  });

  // Редагування страви
  $("#adminMenuList").on("click", ".btn-edit", function () {
    const $itemElement = $(this).closest(".admin-menu-item");
    const itemId = $itemElement.data("id");
    
    // Шукаємо елемент в стані, щоб отримати повні дані
    const item = state.menuItems.find(i => i.id === itemId);

    if (item) {
      $("#itemId").val(item.id);
      $("#itemName").val(item.name);
      $("#itemDescription").val(item.description);
      $("#itemPrice").val(item.price);
      $("#itemCategory").val(item.category);
      $("#fileLabel").text("📷 Змінити зображення");
      $("#formIcon").text("✏️");
      $("#formTitle").text("Редагувати страву");
      $("#formSubmitBtn").html("<span>💾</span> Зберегти зміни").prop('disabled', false);
      $("#cancelEditBtn").show();
      $('html, body').animate({ scrollTop: 0 }, 'smooth');
    } else {
      showToast("Помилка: не вдалося завантажити дані страви.", true);
    }
  });

  // Скасування редагування
  $("#cancelEditBtn").on("click", resetForm);

  // Видалення страви
  $("#adminMenuList").on("click", ".btn-delete", function () {
    if (!confirm("Ви впевнені, що хочете видалити цю страву?")) return;

    const itemId = $(this).closest(".admin-menu-item").data("id");
    axios
      .delete(`${API_BASE_URL}/api/menu/${itemId}`, { data: { adminId } })
      .then(() => {
        loadMenuItems();
        updateDashboardStats();
        showToast("Страву успішно видалено!");
      })
      .catch((error) => {
        showToast(`Помилка: ${error.response?.data?.error || "Не вдалося видалити страву"}`, true);
      });
  });
  
  // Новий обробник для прийняття замовлення
  $("#adminOrdersList").on("click", ".btn-accept", function () {
      if (!confirm("Ви впевнені, що хочете прийняти це замовлення? Клієнту буде надіслано сповіщення.")) return;

      const orderId = $(this).data("id");
      const $button = $(this);

      $button.prop("disabled", true).html('<span>🔄</span> Обробка...');

      axios.post(`${API_BASE_URL}/api/orders/update-status/${orderId}`, {
          adminId,
          status: "Прийнято",
      })
      .then(() => {
          showToast("Замовлення прийнято! Клієнт отримав сповіщення.");
          // Плавне видалення картки замовлення з інтерфейсу
          $button.closest('.admin-order-item').fadeOut(500, function() { 
              $(this).remove();
              if ($("#adminOrdersList").children().length === 0) {
                  loadOrders(); // Перезавантажуємо, щоб показати повідомлення "Немає активних замовлень"
              }
          });
      })
      .catch((error) => {
          showToast(`Помилка: ${error.response?.data?.error || "Не вдалося прийняти замовлення"}`, true);
          $button.prop("disabled", false).html('<span>✅</span> Прийняти');
      });
  });

});
