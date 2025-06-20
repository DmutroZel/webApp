const userId = new URLSearchParams(window.location.search).get('userId');
const API_BASE_URL = "";

const STATUS_STEPS = ["Очікується", "Готується", "В дорозі", "Доставлено"];

function renderOrderStatus(status) {
    const currentStepIndex = STATUS_STEPS.indexOf(status);
    let html = '<ul class="status-tracker">';
    STATUS_STEPS.forEach((step, index) => {
        const completedClass = index <= currentStepIndex ? 'completed' : '';
        html += `<li class="status-step ${completedClass}">${step}</li>`;
    });
    html += '</ul>';
    return html;
}

function loadOrders() {
    if (!userId) {
        $('#ordersList').html('<p>Не вдалося завантажити замовлення: невідомий користувач.</p>');
        return;
    }

    axios.get(`${API_BASE_URL}/api/orders?userId=${userId}`)
        .then(response => {
            const orders = response.data;
            const ordersList = $('#ordersList');
            ordersList.empty();

            if (orders.length === 0) {
                ordersList.html('<p>У вас ще немає замовлень.</p>');
                return;
            }

            orders.forEach(order => {
                const itemsHtml = order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('');
                const orderCard = `
                    <div class="order-tracking-card" id="order-${order._id}">
                        <h3>Замовлення №${order._id.toString().slice(-6)}</h3>
                        <p><strong>Дата:</strong> ${new Date(order.dateTime).toLocaleString('uk-UA')}</p>
                        <p><strong>Сума:</strong> ${order.total} грн</p>
                        <ul>${itemsHtml}</ul>
                        <div class="status-container">
                           ${renderOrderStatus(order.status)}
                        </div>
                    </div>
                `;
                ordersList.append(orderCard);
            });
        })
        .catch(error => console.error("Error loading orders:", error));
}


$(document).ready(function() {
    loadOrders();

    // --- WebSocket Connection ---
    const socket = io();

    socket.on('connect', () => {
        console.log('Connected to WebSocket server!');
        if (userId) {
            socket.emit('register', userId);
        }
    });

    socket.on('status_updated', (data) => {
        // data contains { orderId, status }
        console.log(`Received status update for order ${data.orderId}: ${data.status}`);
        const orderCard = $(`#order-${data.orderId}`);
        if (orderCard.length) {
            orderCard.find('.status-container').html(renderOrderStatus(data.status));
            orderCard.css('background-color', 'var(--light-orange)');
            setTimeout(() => orderCard.css('background-color', ''), 2000);
        }
    });
});