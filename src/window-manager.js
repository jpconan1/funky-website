import { InputManager } from './input-manager.js';

export class WindowManager {
    constructor() {
        this.windows = [];
        this.highestZIndex = 100;
        this._desktop = null;

        // No more global window listeners. InputManager handles this per-interaction.

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
            title,
            setTitle: (newTitle) => {
                windowData.title = newTitle;
                const titleSpan = win.querySelector('.window-title');
                if (titleSpan) titleSpan.textContent = newTitle;
            }
        };

        this.windows.push(windowData);

        // Pinch-to-zoom setup
        this.setupPinchToZoom(windowData);

        // Event Listeners
        const header = win.querySelector('.window-header');
        const closeBtn = win.querySelector('.window-close-btn');
        const resizeHandle = win.querySelector('.window-resize-handle');

        // Drag Handler
        InputManager.attach(header, {
            owner: 'window-drag',
            capture: true,
            onDown: (e) => {
                this.focusWindow(windowData);
                const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
                // rect is in screen space. e.clientX is in screen space.
                const rect = windowData.element.getBoundingClientRect();
                this.dragOffset = {
                    x: (e.clientX - rect.left) / scale,
                    y: (e.clientY - rect.top) / scale
                };
                return true;
            },
            onDragStart: (e, coords) => {
                if (InputManager.lock('window-drag')) {
                    this.activeWindow = windowData;
                    this.isDragging = true;
                    windowData.element.classList.add('window-moving');
                }
            },
            onDrag: (e, coords) => {
                this.handlePointerMove(e, coords);
            },
            onDragEnd: () => {
                this.handlePointerUp();
                InputManager.unlock('window-drag');
            }
        });

        // Focus Handler
        win.addEventListener('pointerdown', (e) => {
            this.focusWindow(windowData);
        }, { passive: true });

        closeBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeWindow(windowData);
        });

        // Resize Handler
        InputManager.attach(resizeHandle, {
            owner: 'window-resize',
            capture: true,
            onDown: (e) => {
                e.stopPropagation();
                this.focusWindow(windowData);

                this.activeWindow = windowData;
                const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
                this.resizeStart = {
                    width: windowData.element.offsetWidth,
                    height: windowData.element.offsetHeight,
                    x: e.clientX / scale,
                    y: e.clientY / scale
                };
                return true;
            },
            onDragStart: (e, coords) => {
                if (InputManager.lock('window-resize')) {
                    this.isResizing = true;
                    windowData.element.classList.add('window-resizing');
                }
            },
            onDrag: (e, coords) => {
                this.handlePointerMove(e, coords);
            },
            onDragEnd: () => {
                this.handlePointerUp();
                InputManager.unlock('window-resize');
            }
        });

        return windowData;
    }

    setupPinchToZoom(windowData) {
        let activePointers = new Map();
        let initialDistance = 0;
        let initialScale = 1;
        const win = windowData.element;

        const onPointerDown = (e) => {
            if (e.pointerType !== 'touch') return;

            // Start listening globally for this window's interaction
            if (activePointers.size === 0) {
                window.addEventListener('pointermove', onPointerMove, { passive: false });
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            }

            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.size === 2) {
                const pointers = Array.from(activePointers.values());
                initialDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
                initialScale = windowData.scale || 1;

                // Cancel any ongoing drag/resize on this window
                if (this.activeWindow === windowData) {
                    this.isDragging = false;
                    this.isResizing = false;
                    win.classList.remove('window-moving', 'window-resizing');
                    InputManager.unlock('window-drag');
                    InputManager.unlock('window-resize');
                }

                // Use top-left origin for predictable positioning while scaling
                win.style.transformOrigin = '0 0';
                win.classList.add('window-zooming');

                // Prevent scrolling while pinching
                if (e.cancelable) e.preventDefault();
            }
        };

        const onPointerMove = (e) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.size === 2) {
                const pointers = Array.from(activePointers.values());
                const currentDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);

                if (initialDistance > 0) {
                    const deltaScale = currentDistance / initialDistance;
                    this.setWindowScale(windowData, initialScale * deltaScale);
                }

                // Important to prevent platform zoom/scroll during our custom pinch
                if (e.cancelable) e.preventDefault();
            }
        };

        const onPointerUp = (e) => {
            if (activePointers.has(e.pointerId)) {
                activePointers.delete(e.pointerId);

                // Clean up global listeners when no fingers are touching this window
                if (activePointers.size === 0) {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    window.removeEventListener('pointercancel', onPointerUp);
                }

                if (activePointers.size < 2) {
                    win.classList.remove('window-zooming');
                }
            }
        };

        win.addEventListener('pointerdown', onPointerDown);

        // Extra layer for iOS Safari: explicitly block gestures on the window
        win.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
        win.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });

        // Also block touchstart for multi-touch to be extra sure
        win.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });

        // Prevent browser zoom via trackpad (Ctrl + Wheel)
        win.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });
    }

    setWindowScale(windowData, scale) {
        // Clamp scale to reasonable values (0.3x to 2.0x)
        const clampedScale = Math.max(0.3, Math.min(scale, 2.0));
        windowData.scale = clampedScale;

        // Apply transform directly. We use top-left origin set in setupPinchToZoom
        windowData.element.style.transform = `scale(${clampedScale})`;

        // Fire an event if other components need to know about the scale change
        windowData.element.dispatchEvent(new CustomEvent('window-scaled', { detail: { scale: clampedScale } }));
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

    handlePointerMove(e, coords) {
        if (!this.activeWindow) return;

        if (this.isDragging) {
            let left = coords.x - this.dragOffset.x;
            let top = coords.y - this.dragOffset.y;

            // Constrain to viewport (optional, but usually good)
            const padding = 10;
            const desktopWidth = this.desktop.clientWidth;
            const desktopHeight = this.desktop.clientHeight;
            left = Math.max(padding, Math.min(left, desktopWidth - this.activeWindow.element.offsetWidth - padding));
            top = Math.max(padding, Math.min(top, desktopHeight - this.activeWindow.element.offsetHeight - padding));

            this.activeWindow.element.style.left = `${left}px`;
            this.activeWindow.element.style.top = `${top}px`;
        }

        if (this.isResizing) {
            const deltaX = coords.x - this.resizeStart.x;
            const deltaY = coords.y - this.resizeStart.y;

            const newWidth = Math.max(200, this.resizeStart.width + deltaX);
            const newHeight = Math.max(150, this.resizeStart.height + deltaY);

            this.activeWindow.element.style.width = `${newWidth}px`;
            this.activeWindow.element.style.height = `${newHeight}px`;
        }
    }

    handlePointerUp() {
        if (this.activeWindow) {
            this.activeWindow.element.classList.remove('window-moving');
            this.activeWindow.element.classList.remove('window-resizing');
        }
        this.activeWindow = null;
        this.isDragging = false;
        this.isResizing = false;
    }

    alert(message, title = 'System Alert') {
        const content = document.createElement('div');
        content.className = 'alert-container';
        content.innerHTML = `
            <div class="alert-message">${message}</div>
            <div class="alert-actions">
                <button class="alert-ok-btn">OK</button>
            </div>
        `;

        const win = this.createWindow(title, content);

        // Custom size for alerts
        win.element.style.width = '320px';
        win.element.style.height = 'auto';
        win.element.style.minHeight = '140px';

        // Center the alert
        const desktopWidth = this.desktop.clientWidth;
        const desktopHeight = this.desktop.clientHeight;
        const x = (desktopWidth - 320) / 2;
        const y = (desktopHeight - 200) / 2;
        win.element.style.left = `${x}px`;
        win.element.style.top = `${y}px`;

        // Hide resize handle for alerts
        const resizeHandle = win.element.querySelector('.window-resize-handle');
        if (resizeHandle) resizeHandle.style.display = 'none';

        const okBtn = content.querySelector('.alert-ok-btn');
        okBtn.focus();

        return new Promise((resolve) => {
            okBtn.addEventListener('click', () => {
                this.closeWindow(win);
                resolve(true);
            });
        });
    }

    confirm(message, options = {}) {
        const {
            title = 'Confirm',
            confirmText = 'OK',
            cancelText = 'Cancel'
        } = options;

        const content = document.createElement('div');
        content.className = 'alert-container';
        content.innerHTML = `
            <div class="alert-message">${message}</div>
            <div class="alert-actions">
                <button class="alert-cancel-btn">${cancelText}</button>
                <button class="alert-confirm-btn">${confirmText}</button>
            </div>
        `;

        const win = this.createWindow(title, content);

        // Custom size for alerts
        win.element.style.width = '320px';
        win.element.style.height = 'auto';
        win.element.style.minHeight = '140px';

        // Center the alert
        const desktopWidth = this.desktop.clientWidth;
        const desktopHeight = this.desktop.clientHeight;
        const x = (desktopWidth - 320) / 2;
        const y = (desktopHeight - 200) / 2;
        win.element.style.left = `${x}px`;
        win.element.style.top = `${y}px`;

        // Hide resize handle for alerts
        const resizeHandle = win.element.querySelector('.window-resize-handle');
        if (resizeHandle) resizeHandle.style.display = 'none';

        const confirmBtn = content.querySelector('.alert-confirm-btn');
        const cancelBtn = content.querySelector('.alert-cancel-btn');

        confirmBtn.focus();

        return new Promise((resolve) => {
            confirmBtn.addEventListener('click', () => {
                this.closeWindow(win);
                resolve(true);
            });
            cancelBtn.addEventListener('click', () => {
                this.closeWindow(win);
                resolve(false);
            });
        });
    }

    prompt(message, defaultValue = '', options = {}) {
        const {
            title = 'Prompt',
            confirmText = 'OK',
            cancelText = 'Cancel'
        } = options;

        const content = document.createElement('div');
        content.className = 'alert-container prompt-container';
        content.innerHTML = `
            <div class="alert-message">${message}</div>
            <input type="text" class="prompt-input" value="${defaultValue}" />
            <div class="alert-actions">
                <button class="alert-cancel-btn">${cancelText}</button>
                <button class="alert-confirm-btn">${confirmText}</button>
            </div>
        `;

        const win = this.createWindow(title, content);
        win.element.style.width = '350px';
        win.element.style.height = 'auto';

        const desktopWidth = this.desktop.clientWidth;
        const desktopHeight = this.desktop.clientHeight;
        const x = (desktopWidth - 350) / 2;
        const y = (desktopHeight - 200) / 2;
        win.element.style.left = `${x}px`;
        win.element.style.top = `${y}px`;

        const input = content.querySelector('.prompt-input');
        const confirmBtn = content.querySelector('.alert-confirm-btn');
        const cancelBtn = content.querySelector('.alert-cancel-btn');

        setTimeout(() => input.focus(), 100);
        input.select();

        return new Promise((resolve) => {
            const handleConfirm = () => {
                const value = input.value;
                this.closeWindow(win);
                resolve(value);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') {
                    this.closeWindow(win);
                    resolve(null);
                }
            });
            cancelBtn.addEventListener('click', () => {
                this.closeWindow(win);
                resolve(null);
            });
        });
    }
}
