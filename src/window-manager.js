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
            <div class="window-scale-bar" title="Zoom Window">
                <div class="window-scale-label">100%</div>
                <div class="window-scale-track">
                    <div class="window-scale-handle"></div>
                </div>
            </div>
            <div class="window-body">
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
            </div>
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

        // Scale Control Setup
        this.setupScaleSlider(windowData);
        // Set initial orientation based on spawn position
        requestAnimationFrame(() => this.checkScaleBarOrientation(windowData));

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

    setupScaleSlider(windowData) {
        const win = windowData.element;
        const bar = win.querySelector('.window-scale-bar');
        const track = win.querySelector('.window-scale-track');
        const handle = win.querySelector('.window-scale-handle');
        const label = win.querySelector('.window-scale-label');

        const MIN_SCALE = 0.5;
        const MAX_SCALE = 2.0;
        let isHorizontal = false;

        const updateUI = (scale) => {
            const percent = (scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE);
            label.textContent = `${Math.round(scale * 100)}%`;
            if (isHorizontal) {
                // Left = min scale, Right = max scale
                const xPercent = percent * 100;
                handle.style.left = `${xPercent}%`;
                handle.style.top = '';
            } else {
                // Top = max scale, Bottom = min scale
                const yPercent = (1 - percent) * 100;
                handle.style.top = `${yPercent}%`;
                handle.style.left = '';
            }
        };

        // updateFromEvent must be defined BEFORE InputManager.attach calls it.
        // Always compare raw clientX/Y against raw getBoundingClientRect values —
        // both are in the same screen-pixel space, no scale correction needed.
        const updateFromEvent = (e) => {
            const rect = track.getBoundingClientRect();
            let percent;
            if (isHorizontal) {
                if (rect.width === 0) return;
                const relativeX = e.clientX - rect.left;
                percent = Math.max(0, Math.min(1, relativeX / rect.width));
            } else {
                if (rect.height === 0) return;
                const relativeY = e.clientY - rect.top;
                percent = Math.max(0, Math.min(1, 1 - (relativeY / rect.height)));
            }
            const newScale = MIN_SCALE + percent * (MAX_SCALE - MIN_SCALE);
            this.setWindowScale(windowData, newScale);
            updateUI(newScale);
        };

        // Called by checkScaleBarOrientation to flip the bar's layout.
        windowData.setScaleBarHorizontal = (horizontal) => {
            if (isHorizontal === horizontal) return;
            isHorizontal = horizontal;
            bar.classList.toggle('window-scale-bar--horizontal', horizontal);
            // Re-draw handle at current scale
            updateUI(windowData.scale || 1);
        };

        InputManager.attach(track, {
            owner: 'window-scale',
            onDown: (e) => {
                this.focusWindow(windowData);
                // Do NOT snap scale on bare tap — only on intentional drag.
                return true;
            },
            onDragStart: (e) => {
                InputManager.lock('window-scale');
                windowData.element.classList.add('window-zooming');
                updateFromEvent(e);
            },
            onDrag: (e) => {
                updateFromEvent(e);
            },
            onDragEnd: () => {
                windowData.element.classList.remove('window-zooming');
                InputManager.unlock('window-scale');
            }
        });

        // Initialize
        updateUI(windowData.scale || 1);
    }

    /**
     * Checks whether the window's scale bar would clip off the left edge of the
     * desktop. If so, flips the bar to horizontal (above window); otherwise keeps
     * it vertical (left of window).
     */
    checkScaleBarOrientation(windowData) {
        if (!windowData.setScaleBarHorizontal) return;
        const desktopRect = this.desktop.getBoundingClientRect();
        const winRect = windowData.element.getBoundingClientRect();
        // Bar needs ~44px of clear space to the left of the window's screen edge.
        const spaceLeft = winRect.left - desktopRect.left;
        windowData.setScaleBarHorizontal(spaceLeft < 44);
    }

    setWindowScale(windowData, scale) {
        // Clamp scale to reasonable values (0.3x to 2.0x)
        const clampedScale = Math.max(0.3, Math.min(scale, 2.0));
        windowData.scale = clampedScale;

        // Apply transform directly using origin consistent with viewport conservation
        windowData.element.style.setProperty('--win-scale', clampedScale);
        windowData.element.style.transform = `scale(${clampedScale})`;
        windowData.element.style.transformOrigin = '0 0';

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
            const winScale = this.activeWindow.scale || 1;

            const visualWidth = this.activeWindow.element.offsetWidth * winScale;
            const visualHeight = this.activeWindow.element.offsetHeight * winScale;

            left = Math.max(padding, Math.min(left, desktopWidth - visualWidth - padding));
            top = Math.max(padding, Math.min(top, desktopHeight - visualHeight - padding));

            this.activeWindow.element.style.left = `${left}px`;
            this.activeWindow.element.style.top = `${top}px`;
            this.checkScaleBarOrientation(this.activeWindow);
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
