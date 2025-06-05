let ws;
const stickRadius = 40;
const buttons = document.querySelectorAll('.button');

// 初始化WebSocket连接
function initWebSocket() {
    const pathPrefix = window.location.pathname.split('/')[1];
    ws = new WebSocket(`ws://${window.location.host}/${pathPrefix}/websocket`);
    ws.onmessage = (e) => {
        if (e.data.startsWith('vibrate')) {
            // 处理振动反馈
        }
    };
    ws.onerror = () => alert('连接失败，请刷新重试');
}

// 摇杆触摸处理
function initSticks() {
    document.querySelectorAll('.stick').forEach(stick => {
        let startX, startY;
        stick.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        });
        stick.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const dx = (touch.clientX - startX) / stickRadius;
            const dy = (startY - touch.clientY) / stickRadius;
            const type = stick.dataset.type;
            ws.send(`${type} ${Math.max(-1, Math.min(dx, 1))} ${Math.max(-1, Math.min(dy, 1))}`);
        });
        stick.addEventListener('touchend', () => {
            ws.send(`${stick.dataset.type} 0 0`);
        });
    });
}

// 按键事件处理
buttons.forEach(btn => {
    btn.addEventListener('touchstart', () => {
        ws.send(`bdown ${btn.dataset.btn}`);
    });
    btn.addEventListener('touchend', () => {
        ws.send(`bup ${btn.dataset.btn}`);
    });
    // 拖拽保存位置
    btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text', btn.dataset.btn);
    });
    btn.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    btn.addEventListener('drop', (e) => {
        e.preventDefault();
        const btnName = e.dataTransfer.getData('text');
        const target = document.querySelector(