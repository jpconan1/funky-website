import { InputManager } from './input-manager.js';
import { UI } from './ui-components.js';

// ─── Shared Zoom Bar ──────────────────────────────────────────────────────────
// One overlay element lives on #desktop (same coord space as window left/top).
// It tracks whichever window is currently focused, so positioning only ever
// needs window.offsetLeft / window.offsetTop — no scale-space conversion at all.
class ZoomBar {
    constructor(desktop) {
        this.desktop = desktop;
        this.targetWindow = null; // windowData currently being tracked

        const MIN = 0.5;
        const MAX = 1.0;

        // ── Build one vertical and one horizontal slider ──────────────────────
        this.vSlider = UI.createVerticalSlider(MIN, MAX, 1.0, (val) => {
            if (this.targetWindow) this._applyScale(val);
        });
        this.hSlider = UI.createHorizontalZoomSlider(MIN, MAX, 1.0, (val) => {
            if (this.targetWindow) this._applyScale(val);
        });

        // ── Overlay shell ─────────────────────────────────────────────────────
        this.el = document.createElement('div');
        this.el.className = 'zoom-bar-overlay zoom-bar-overlay--vertical';
        this.el.appendChild(this.vSlider);
        this.el.appendChild(this.hSlider);
        this.hSlider.style.display = 'none';

        // Suppress pointer events bubbling to the desktop physics layer
        this.el.addEventListener('pointerdown', e => e.stopPropagation());

        // Freeze window transition while dragging a slider
        [this.vSlider, this.hSlider].forEach(wrapper => {
            const input = wrapper.querySelector('input[type="range"]');
            input.addEventListener('pointerdown', () => {
                if (this.targetWindow) this.targetWindow.element.classList.add('window-zooming');
            });
            input.addEventListener('pointerup', () => {
                if (this.targetWindow) this.targetWindow.element.classList.remove('window-zooming');
            });
            input.addEventListener('pointercancel', () => {
                if (this.targetWindow) this.targetWindow.element.classList.remove('window-zooming');
            });
        });

        desktop.appendChild(this.el);
        this.el.style.display = 'none'; // hidden until a window is focused
    }

    // Called by WindowManager whenever a window is focused / moved / scaled.
    track(windowData) {
        this.targetWindow = windowData;
        const scale = windowData.scale || 1.0;
        this.vSlider.setValue(scale);
        this.hSlider.setValue(scale);
        this.el.style.display = '';
        this.reposition();
    }

    hide() {
        this.targetWindow = null;
        this.el.style.display = 'none';
    }

    // Call whenever the tracked window moves or the desktop resizes.
    reposition() {
        if (!this.targetWindow) return;

        const win = this.targetWindow.element;
        const winScale = this.targetWindow.scale || 1;

        // Window logical position (already in desktop-local pixels — no BoundingClientRect needed)
        const winLeft = win.offsetLeft;
        const winTop = win.offsetTop;
        // Visual size = logical size × per-window scale
        const winW = win.offsetWidth * winScale;
        const winH = win.offsetHeight * winScale;

        // Desktop logical size (no global scale involved — offsetWidth is in CSS px)
        const deskW = this.desktop.offsetWidth;
        const deskH = this.desktop.offsetHeight;

        // ── Decide orientation ────────────────────────────────────────────────
        // Vertical bar: 46 px wide × 170 px tall, sits to the left of the window.
        // Horizontal bar: 180 px wide × 40 px tall, sits above the window.
        const BAR_VERT_W = 46;
        const BAR_VERT_H = 170;
        const BAR_HORIZ_W = 180;
        const BAR_HORIZ_H = 40;
        const GAP = 6; // px gap from window edge

        const useHorizontal = winLeft < (BAR_VERT_W + GAP);

        if (useHorizontal !== this._isHorizontal) {
            this._isHorizontal = useHorizontal;
            this.el.classList.toggle('zoom-bar-overlay--horizontal', useHorizontal);
            this.el.classList.toggle('zoom-bar-overlay--vertical', !useHorizontal);
            this.vSlider.style.display = useHorizontal ? 'none' : '';
            this.hSlider.style.display = useHorizontal ? '' : 'none';
        }

        let left, top;

        if (useHorizontal) {
            // Ideal: left-align with window's left edge.
            // Clamp: don't let bar go past the desktop's left edge.
            left = Math.max(0, winLeft);
            // Also clamp right so bar doesn't overflow desktop
            left = Math.min(left, deskW - BAR_HORIZ_W);
            // Sit above the window, with a small gap.
            // When the window is at the very top (y=0) nudge it below instead.
            top = winTop - BAR_HORIZ_H - GAP;
            if (top < 0) top = winTop + winH + GAP; // flip below
        } else {
            // Vertical bar flush-left of the window.
            left = winLeft - BAR_VERT_W - GAP;
            // Clamp: never go past desktop left edge.
            left = Math.max(0, left);
            // Vertically: align with window top, clamped within desktop.
            top = Math.max(0, Math.min(winTop + GAP, deskH - BAR_VERT_H));
        }

        this.el.style.left = `${left}px`;
        this.el.style.top = `${top}px`;
    }

    _applyScale(val) {
        // Delegate back to WindowManager via the windowData reference.
        if (this.targetWindow && this.targetWindow._wmSetScale) {
            this.targetWindow._wmSetScale(val);
        }
    }
}

// ─── WindowManager ────────────────────────────────────────────────────────────
export class WindowManager {
    constructor() {
        this.windows = [];
        this.highestZIndex = 100;
        this._desktop = null;
        this._zoomBar = null; // lazily created after desktop mounts

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

    get zoomBar() {
        if (!this._zoomBar) {
            this._zoomBar = new ZoomBar(this.desktop);
        }
        return this._zoomBar;
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
            scale: 1.0,
            setTitle: (newTitle) => {
                windowData.title = newTitle;
                const titleSpan = win.querySelector('.window-title');
                if (titleSpan) titleSpan.textContent = newTitle;
            },
            // Hook so the ZoomBar can call back into setWindowScale
            _wmSetScale: (val) => this.setWindowScale(windowData, val)
        };

        this.windows.push(windowData);

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

        // Focus + touch-grab Handler
        win.addEventListener('pointerdown', (e) => {
            this.focusWindow(windowData);
            const tag = e.target.tagName;
            const isInteractive = tag === 'INPUT' || tag === 'TEXTAREA' ||
                tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' ||
                e.target.isContentEditable;
            if (!isInteractive) {
                e.preventDefault();
            }
        }, { passive: false });

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

        // Show zoom bar for this window on focus
        this.focusWindow(windowData);

        return windowData;
    }

    focusWindow(windowData) {
        if (parseInt(windowData.element.style.zIndex) < this.highestZIndex) {
            windowData.element.style.zIndex = ++this.highestZIndex;
        }
        // Point the shared zoom bar at the newly-focused window
        this.zoomBar.track(windowData);
    }

    setWindowScale(windowData, scale) {
        const clamped = Math.max(0.5, Math.min(scale, 1.0));
        windowData.scale = clamped;

        windowData.element.style.setProperty('--win-scale', clamped);
        windowData.element.style.transform = `scale(${clamped})`;
        windowData.element.style.transformOrigin = '0 0';

        // Sync sliders if this window is the one currently tracked
        if (this.zoomBar.targetWindow === windowData) {
            this.zoomBar.vSlider.setValue(clamped);
            this.zoomBar.hSlider.setValue(clamped);
            this.zoomBar.reposition();
        }

        windowData.element.dispatchEvent(new CustomEvent('window-scaled', { detail: { scale: clamped } }));
    }

    closeWindow(windowData) {
        // If the zoom bar was tracking this window, hide it
        if (this.zoomBar.targetWindow === windowData) {
            this.zoomBar.hide();
        }
        windowData.element.classList.add('window-closing');
        setTimeout(() => {
            windowData.element.remove();
            this.windows = this.windows.filter(w => w.id !== windowData.id);
        }, 200);
    }

    handlePointerMove(e, coords) {
        if (!this.activeWindow) return;

        if (this.isDragging) {
            let left = coords.x - this.dragOffset.x;
            let top = coords.y - this.dragOffset.y;

            const minVisible = 80;
            const desktopWidth = this.desktop.clientWidth;
            const desktopHeight = this.desktop.clientHeight;
            const winScale = this.activeWindow.scale || 1;

            const visualWidth = this.activeWindow.element.offsetWidth * winScale;
            const visualHeight = this.activeWindow.element.offsetHeight * winScale;

            const maxLeft = desktopWidth - minVisible;
            const minLeft = -(visualWidth - minVisible);
            const maxTop = desktopHeight - minVisible;
            const minTop = 0;

            left = Math.max(minLeft, Math.min(left, maxLeft));
            top = Math.max(minTop, Math.min(top, maxTop));

            this.activeWindow.element.style.left = `${left}px`;
            this.activeWindow.element.style.top = `${top}px`;

            // Reposition zoom bar in the same coordinate space — no maths needed
            this.zoomBar.reposition();
        }

        if (this.isResizing) {
            const deltaX = coords.x - this.resizeStart.x;
            const deltaY = coords.y - this.resizeStart.y;

            const newWidth = Math.max(200, this.resizeStart.width + deltaX);
            const newHeight = Math.max(150, this.resizeStart.height + deltaY);

            this.activeWindow.element.style.width = `${newWidth}px`;
            this.activeWindow.element.style.height = `${newHeight}px`;
            this.zoomBar.reposition();
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

    // ── Dialogs ───────────────────────────────────────────────────────────────

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

        win.element.style.width = '320px';
        win.element.style.height = 'auto';
        win.element.style.minHeight = '140px';

        const desktopWidth = this.desktop.clientWidth;
        const desktopHeight = this.desktop.clientHeight;
        win.element.style.left = `${(desktopWidth - 320) / 2}px`;
        win.element.style.top = `${(desktopHeight - 200) / 2}px`;

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

        win.element.style.width = '320px';
        win.element.style.height = 'auto';
        win.element.style.minHeight = '140px';

        const desktopWidth = this.desktop.clientWidth;
        const desktopHeight = this.desktop.clientHeight;
        win.element.style.left = `${(desktopWidth - 320) / 2}px`;
        win.element.style.top = `${(desktopHeight - 200) / 2}px`;

        const resizeHandle = win.element.querySelector('.window-resize-handle');
        if (resizeHandle) resizeHandle.style.display = 'none';

        const confirmBtn = content.querySelector('.alert-confirm-btn');
        const cancelBtn = content.querySelector('.alert-cancel-btn');
        confirmBtn.focus();

        return new Promise((resolve) => {
            confirmBtn.addEventListener('click', () => { this.closeWindow(win); resolve(true); });
            cancelBtn.addEventListener('click', () => { this.closeWindow(win); resolve(false); });
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
        win.element.style.left = `${(desktopWidth - 350) / 2}px`;
        win.element.style.top = `${(desktopHeight - 200) / 2}px`;

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
                if (e.key === 'Escape') { this.closeWindow(win); resolve(null); }
            });
            cancelBtn.addEventListener('click', () => {
                this.closeWindow(win);
                resolve(null);
            });
        });
    }
}
