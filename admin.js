const telegramApp = window.Telegram.WebApp;
const adminId = new URLSearchParams(window.location.search).get("adminId");
const API_BASE_URL = "";
let salesChart = null;

const state = {
  menuItems: [],
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
      // Оновлення графіка
      const ctx = document.getElementById("salesByCategoryChart").getContext("2d");
      if (salesChart) salesChart.destroy();
      salesChart = {
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
      };

      // Оновлення списку топ-товарів
      const $topItemsList = $("#topSellingItemsList").empty();
      topSellingItems.length
        ? topSellingItems.forEach(({ _id, totalQuantity }) =>
            $topItemsList.append(`<li><span>${_id}</span> <span>Продано: ${totalQuantity}</span></li>`)
          )
        : $topItemsList.append('<li class="no-items">Немає даних про продажі.</li>');
    })
    .catch((error) => console.error("Помилка завантаження аналітики:", error));
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
      data.forEach(({ id, image, name, price, category }) => {
        $menuList.append(`
          <div class="admin-menu-item" data-id="${id}">
            <img src="${image}" alt="${name}" onerror="this.src='placeholder.jpg'">
            <div class="admin-menu-info">
              <h4>${name}</h4>
              <p>${price} грн - ${category}</p>
            </div>
            <div class="admin-menu-actions">
              <button class="edit-btn">✏️</button>
              <button class="delete-btn">🗑️</button>
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
  $("#formSubmitBtn").html("<span>➕</span> Додати страву");
  $("#cancelEditBtn").hide();
  $("#fileLabel").text("📷 Оберіть зображення");
}

// Показ повідомлення про помилку або успіх
function showToast(message) {
  const $toast = $('<div class="toast"></div>').text(message);
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
        loadAnalytics();
        resetForm();
        showToast(`Страву успішно ${itemId ? "оновлено" : "додано"}!`);
      })
      .catch((error) => {
        showToast(`Помилка: ${error.response?.data?.error || "Не вдалося зберегти страву"}`);
      })
      .finally(() => {
        $("#formSubmitBtn")
          .prop("disabled", false)
          .html(`<span>${itemId ? "💾" : "➕"}</span> ${itemId ? "Зберегти зміни" : "Додати страву"}`);
      });
  });

  // Редагування страви
  $("#adminMenuList").on("click", ".edit-btn", function () {
    const itemId = $(this).closest(".admin-menu-item").data("id");
    const item = state.menuItems.find((i) => i.id === itemId);
    if (item) {
      $("#itemId").val(item.id);
      $("#itemName").val(item.name);
      $("#itemDescription").val(item.description);
      $("#itemPrice").val(item.price);
      $("#itemCategory").val(item.category);
      $("#fileLabel").text("📷 Змінити зображення");
      $("#formIcon").text("✏️");
      $("#formTitle").text("Редагувати страву");
      $("#formSubmitBtn").html("<span>💾</span> Зберегти зміни");
      $("#cancelEditBtn").show();
      window.scrollTo(0, 0);
    } else {
      showToast("Помилка завантаження даних страви");
    }
  });

  // Скасування редагування
  $("#cancelEditBtn").on("click", resetForm);

  // Видалення страви
  $("#adminMenuList").on("click", ".delete-btn", function () {
    if (!confirm("Ви впевнені, що хочете видалити цю страву?")) return;

    const itemId = $(this).closest(".admin-menu-item").data("id");
    axios
      .delete(`${API_BASE_URL}/api/menu/${itemId}`, { data: { adminId } })
      .then(() => {
        loadMenuItems();
        updateDashboardStats();
        loadAnalytics();
        showToast("Страву успішно видалено!");
      })
      .catch((error) => {
        showToast(`Помилка: ${error.response?.data?.error || "Не вдалося видалити страву"}`);
      });
  });
});

