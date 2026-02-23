export class WindowManager {
    constructor() {
        this.windows = [];
        this.highestZIndex = 100;
        this._desktop = null;

        // Handle global mouse events for dragging and resizing
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());

        this.activeWindow = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragOffset = { x: 0, y: 0 };
        this.resizeStart = { width: 0, height: 0, x: 0, y: 0 };
    }

    get desktop() {
        if (!this._desktop) {
            this._desktop = document.querySelector('#desktop');
        }
        return this._desktop;
    }

    createWindow(title, contentHTML) {
        const id = `window-${Date.now()}`;
        const win = document.createElement('div');
        win.id = id;
        win.className = 'window glassmorphism';
        win.style.zIndex = ++this.highestZIndex;

        // Default position and size
        const defaultWidth = 400;
        const defaultHeight = 300;
        const x = 100 + (this.windows.length * 30);
        const y = 100 + (this.windows.length * 30);

        win.style.width = `${defaultWidth}px`;
        win.style.height = `${defaultHeight}px`;
        win.style.left = `${x}px`;
        win.style.top = `${y}px`;

        win.innerHTML = `
            <div class="window-header">
                <div class="window-title-bar">
                    <div class="window-controls">
                        <button class="window-close-btn" title="Close"></button>
                    </div>
                    <span class="window-title">${title}</span>
                </div>
            </div>
            <div class="window-content"></div>
            <div class="window-resize-handle"></div>
        `;

        const contentArea = win.querySelector('.window-content');
        if (typeof contentHTML === 'string') {
            contentArea.innerHTML = contentHTML;
        } else if (contentHTML instanceof HTMLElement) {
            contentArea.appendChild(contentHTML);
        }

        this.desktop.appendChild(win);

        const windowData = {
            id,
            element: win,
            title
        };

        this.windows.push(windowData);

        // Event Listeners
        const header = win.querySelector('.window-header');
        const closeBtn = win.querySelector('.window-close-btn');
        const resizeHandle = win.querySelector('.window-resize-handle');

        header.addEventListener('mousedown', (e) => {
            this.focusWindow(windowData);
            this.startDragging(e, windowData);
        });

        win.addEventListener('mousedown', () => {
            this.focusWindow(windowData);
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeWindow(windowData);
        });

        resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startResizing(e, windowData);
        });

        return windowData;
    }

    focusWindow(windowData) {
        if (parseInt(windowData.element.style.zIndex) < this.highestZIndex) {
            windowData.element.style.zIndex = ++this.highestZIndex;
        }
    }

    closeWindow(windowData) {
        windowData.element.classList.add('window-closing');
        setTimeout(() => {
            windowData.element.remove();
            this.windows = this.windows.filter(w => w.id !== windowData.id);
        }, 200);
    }

    startDragging(e, windowData) {
        this.activeWindow = windowData;
        this.isDragging = true;
        const rect = windowData.element.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        windowData.element.classList.add('window-moving');
    }

    startResizing(e, windowData) {
        this.activeWindow = windowData;
        this.isResizing = true;
        this.resizeStart = {
            width: windowData.element.offsetWidth,
            height: windowData.element.offsetHeight,
            x: e.clientX,
            y: e.clientY
        };
        windowData.element.classList.add('window-resizing');
    }

    handleMouseMove(e) {
        if (!this.activeWindow) return;

        if (this.isDragging) {
            let left = e.clientX - this.dragOffset.x;
            let top = e.clientY - this.dragOffset.y;

            // Constrain to viewport (optional, but usually good)
            const padding = 10;
            left = Math.max(padding, Math.min(left, window.innerWidth - this.activeWindow.element.offsetWidth - padding));
            top = Math.max(padding, Math.min(top, window.innerHeight - this.activeWindow.element.offsetHeight - padding));

            this.activeWindow.element.style.left = `${left}px`;
            this.activeWindow.element.style.top = `${top}px`;
        }

        if (this.isResizing) {
            const deltaX = e.clientX - this.resizeStart.x;
            const deltaY = e.clientY - this.resizeStart.y;

            const newWidth = Math.max(200, this.resizeStart.width + deltaX);
            const newHeight = Math.max(150, this.resizeStart.height + deltaY);

            this.activeWindow.element.style.width = `${newWidth}px`;
            this.activeWindow.element.style.height = `${newHeight}px`;
        }
    }

    handleMouseUp() {
        if (this.activeWindow) {
            this.activeWindow.element.classList.remove('window-moving');
            this.activeWindow.element.classList.remove('window-resizing');
        }
        this.activeWindow = null;
        this.isDragging = false;
        this.isResizing = false;
    }
}
