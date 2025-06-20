const telegramApp = window.Telegram.WebApp;
const adminId = new URLSearchParams(window.location.search).get('adminId');

const API_BASE_URL = ""; // Relative path is fine

function loadMenuItems() {
    axios.get(`${API_BASE_URL}/api/menu`)
        .then(response => {
            const items = response.data;
            const menuList = $('#adminMenuList');
            menuList.empty();
            items.forEach(item => {
                const itemHtml = `
                    <div class="admin-menu-item" data-id="${item.id}">
                        <img src="${item.image}" alt="${item.name}">
                        <div class="admin-menu-info">
                            <h4>${item.name}</h4>
                            <p>${item.price} грн - ${item.category}</p>
                        </div>
                        <div class="admin-menu-actions">
                            <button class="edit-btn">✏️</button>
                            <button class="delete-btn">🗑️</button>
                        </div>
                    </div>
                `;
                menuList.append(itemHtml);
            });
        })
        .catch(error => console.error("Error loading menu items:", error));
}

function resetForm() {
    $('#menuItemForm')[0].reset();
    $('#itemId').val('');
    $('#itemFormContainer h2').text('Додати нову страву');
    $('#formSubmitBtn').text('Додати страву');
    $('#cancelEditBtn').hide();
}

$(document).ready(function() {
    telegramApp.expand();
    if (!adminId) {
        $('body').html('<h1>Доступ заборонено: відсутній ID адміна.</h1>');
        return;
    }

    loadMenuItems();

    $('#menuItemForm').on('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        const itemId = $('#itemId').val();
        formData.append('adminId', adminId);
        formData.append('name', $('#itemName').val());
        formData.append('description', $('#itemDescription').val());
        formData.append('price', $('#itemPrice').val());
        formData.append('category', $('#itemCategory').val());
        
        const imageFile = $('#itemImage')[0].files[0];
        if (imageFile) {
            formData.append('image', imageFile);
        }

        const url = itemId ? `${API_BASE_URL}/api/menu/${itemId}` : `${API_BASE_URL}/api/menu`;
        const method = itemId ? 'put' : 'post';

        axios({ method, url, data: formData, headers: { 'Content-Type': 'multipart/form-data' }})
            .then(() => {
                loadMenuItems();
                resetForm();
            })
            .catch(error => console.error("Error saving item:", error));
    });

    $('#adminMenuList').on('click', '.edit-btn', function() {
        const itemDiv = $(this).closest('.admin-menu-item');
        const itemId = itemDiv.data('id');
        
        axios.get(`${API_BASE_URL}/api/menu`).then(res => {
            const item = res.data.find(i => i.id === itemId);
            if(item) {
                $('#itemId').val(item.id);
                $('#itemName').val(item.name);
                $('#itemDescription').val(item.description);
                $('#itemPrice').val(item.price);
                $('#itemCategory').val(item.category);

                $('#itemFormContainer h2').text('Редагувати страву');
                $('#formSubmitBtn').text('Зберегти зміни');
                $('#cancelEditBtn').show();
                window.scrollTo(0, 0);
            }
        });
    });

    $('#cancelEditBtn').on('click', resetForm);

    $('#adminMenuList').on('click', '.delete-btn', function() {
        if (!confirm('Ви впевнені, що хочете видалити цю страву?')) return;

        const itemDiv = $(this).closest('.admin-menu-item');
        const itemId = itemDiv.data('id');

        axios.delete(`${API_BASE_URL}/api/menu/${itemId}`, { data: { adminId } })
            .then(() => {
                loadMenuItems();
            })
            .catch(error => console.error("Error deleting item:", error));
    });
});