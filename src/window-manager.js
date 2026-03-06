import { InputManager } from './input-manager.js';
import { UI } from './ui-components.js';

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
            <div class="window-scale-bar" title="Zoom Window"></div>
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

        // Focus + touch-grab Handler.
        // Capture pointerdown on the ENTIRE window so any touch that lands
        // inside (even on an empty area, or the content scroll region) is
        // owned by us.  This stops Safari from interpreting an accidental
        // swipe that starts inside the window as a page back/forward gesture.
        win.addEventListener('pointerdown', (e) => {
            this.focusWindow(windowData);
            // Don't stopPropagation — let inner elements still receive the event —
            // but DO call preventDefault to block the browser's overscroll /
            // swipe-navigation gesture detection.
            // We guard against inputs/buttons/textareas so they can still
            // receive touch focus normally.
            const tag = e.target.tagName;
            const isInteractive = tag === 'INPUT' || tag === 'TEXTAREA' ||
                tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' ||
                e.target.isContentEditable;
            if (!isInteractive) {
                e.preventDefault();
            }
        }, { passive: false });

        // Block Safari's horizontal-swipe (back/forward) gesture when the user
        // drags a range slider. Safari detects a swipe and steals the gesture
        // from the slider if the pointer moves horizontally near the edge.
        // We catch touchstart (non-passive so preventDefault is effective) on
        // any <input type="range"> inside this window and suppress the default
        // browser gesture — pointer events for the slider still fire normally.
        win.addEventListener('touchstart', (e) => {
            const isRangeInput = e.target.tagName === 'INPUT' && e.target.type === 'range';
            if (isRangeInput) {
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

        return windowData;
    }

    setupScaleSlider(windowData) {
        const win = windowData.element;
        const bar = win.querySelector('.window-scale-bar');

        const MIN_SCALE = 0.5;
        const MAX_SCALE = 1.0;
        const initialScale = windowData.scale || 1.0;
        let isHorizontal = false;

        // ── Build both slider variants up-front; only one is shown at a time ──
        const vSlider = UI.createVerticalSlider(MIN_SCALE, MAX_SCALE, initialScale, (val) => {
            this.setWindowScale(windowData, val);
        });

        const hSlider = UI.createHorizontalZoomSlider(MIN_SCALE, MAX_SCALE, initialScale, (val) => {
            this.setWindowScale(windowData, val);
        });

        // Keep both in sync when scale changes programmatically
        windowData.updateZoomSliders = (scale) => {
            vSlider.setValue(scale);
            hSlider.setValue(scale);
        };

        // While a slider is being dragged, suppress the window's CSS
        // transition AND the scale-bar's position transition so the bar
        // stays perfectly stable — no jitter when the window is partially
        // off-screen and the clamping math recalculates on every frame.
        const startZoom = () => {
            windowData.element.classList.add('window-zooming');
            // Also freeze the bar's own left/top transition so it snaps
            // instantly rather than lagging behind during the drag.
            bar.style.transition = 'none';
        };
        const endZoom = () => {
            windowData.element.classList.remove('window-zooming');
            // Restore the bar's smooth transition only after the drag ends.
            bar.style.transition = '';
        };

        [vSlider, hSlider].forEach(wrapper => {
            const input = wrapper.querySelector('input[type="range"]');
            input.addEventListener('pointerdown', startZoom);
            // pointerup fires even if the pointer leaves the element
            input.addEventListener('pointerup', endZoom);
            input.addEventListener('pointercancel', endZoom);
        });

        bar.appendChild(vSlider);
        bar.appendChild(hSlider);
        hSlider.style.display = 'none'; // start vertical

        // Called by checkScaleBarOrientation to flip the bar's layout.
        windowData.setScaleBarHorizontal = (horizontal) => {
            if (isHorizontal === horizontal) return;
            isHorizontal = horizontal;
            bar.classList.toggle('window-scale-bar--horizontal', horizontal);
            vSlider.style.display = horizontal ? 'none' : '';
            hSlider.style.display = horizontal ? '' : 'none';
        };
    }

    /**
     * Repositions the scale bar every time the window moves so it always stays
     * inside the visible desktop area.
     *
     * Two modes:
     *   Vertical   – bar sits to the LEFT of the window (default)
     *   Horizontal – bar sits ABOVE the window (when the window's left side is
     *                close to or past the desktop's left edge)
     *
     * In both modes we compute a clamped CSS offset (window-local coordinates,
     * accounting for the window's own CSS scale) and write it to CSS custom
     * properties so the bar follows the desktop edge smoothly.
     */
    checkScaleBarOrientation(windowData) {
        if (!windowData.setScaleBarHorizontal) return;

        const bar = windowData.element.querySelector('.window-scale-bar');
        if (!bar) return;

        const desktopRect = this.desktop.getBoundingClientRect();
        const winRect = windowData.element.getBoundingClientRect();
        const winScale = windowData.scale || 1;

        // The global --ui-scale is applied as a CSS transform: scale() on #app,
        // so getBoundingClientRect() values are in SCREEN pixels (logical × globalScale).
        // We need globalScale to convert screen-space offsets back to window-local logical px.
        const globalScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
        // Combined divisor: screen px → window-local logical px
        const toLocal = winScale * globalScale;

        // How much screen-space is available to the left of the window?
        const spaceLeftScreen = winRect.left - desktopRect.left;

        // Bar dimensions in screen space (bar counter-scales so it is always 40×170px on screen)
        const BAR_W = 40;   // screen px
        const BAR_H = 170;  // screen px
        const H_BAR_W = 180; // horizontal bar width in screen px
        const H_BAR_H = 40;  // horizontal bar height in screen px
        const GAP = 6;       // gap from window edge in screen px

        // Switch to horizontal mode if there isn't enough room on the left.
        const useHorizontal = spaceLeftScreen < (BAR_W + GAP);
        windowData.setScaleBarHorizontal(useHorizontal);

        if (useHorizontal) {
            // ── Horizontal bar (above window) ──
            // Ideal: left edge of bar aligns with left edge of window (window-local 0).
            // In screen space the bar's ideal left is winRect.left.
            // Clamp so the bar's left never goes past the desktop's left edge.
            const idealScreenLeft = winRect.left;
            const clampedScreenLeft = Math.max(desktopRect.left, idealScreenLeft);

            // Convert screen-space offset back to window-local logical px.
            // Must divide by both winScale (per-window CSS transform) and globalScale
            // (the #app CSS transform(scale)) so the CSS custom property lands correctly.
            const localLeft = (clampedScreenLeft - winRect.left) / toLocal;
            const localTop = -(H_BAR_H + GAP) / toLocal;

            bar.style.setProperty('--scale-bar-left', `${localLeft}px`);
            bar.style.setProperty('--scale-bar-top', `${localTop}px`);
        } else {
            // ── Vertical bar (left of window) ──
            // Ideal: right edge of bar is flush against the window's left edge with a tiny gap.
            // In local coords: -(BAR_W + GAP) / toLocal
            const idealLocalLeft = -(BAR_W + GAP) / toLocal;

            // Clamp: bar's screen left must not go past desktop left.
            // Bar's screen left = winRect.left + idealLocalLeft * toLocal
            const barScreenLeft = winRect.left + idealLocalLeft * toLocal;
            const clampedBarScreenLeft = Math.max(desktopRect.left, barScreenLeft);
            const clampedLocalLeft = (clampedBarScreenLeft - winRect.left) / toLocal;

            bar.style.setProperty('--scale-bar-left', `${clampedLocalLeft}px`);
            bar.style.setProperty('--scale-bar-top', `${GAP / toLocal}px`);
        }
    }

    setWindowScale(windowData, scale) {
        // Clamp scale to reasonable values (0.5x to 1.0x)
        const clampedScale = Math.max(0.5, Math.min(scale, 1.0));
        windowData.scale = clampedScale;

        // Apply transform directly using origin consistent with viewport conservation
        windowData.element.style.setProperty('--win-scale', clampedScale);
        windowData.element.style.transform = `scale(${clampedScale})`;
        windowData.element.style.transformOrigin = '0 0';

        // Keep the UI sliders in sync (e.g. when pinch-to-zoom drives the scale)
        if (windowData.updateZoomSliders) {
            windowData.updateZoomSliders(clampedScale);
        }

        // Re-run bar orientation after scale changes (bar counter-scale shifts its effective position)
        this.checkScaleBarOrientation(windowData);

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

            // Allow dragging past desktop edges, but keep a minimum "grip strip"
            // so the user can always pull the window back.
            const minVisible = 80; // px of window that must remain on-screen
            const desktopWidth = this.desktop.clientWidth;
            const desktopHeight = this.desktop.clientHeight;
            const winScale = this.activeWindow.scale || 1;

            const visualWidth = this.activeWindow.element.offsetWidth * winScale;
            const visualHeight = this.activeWindow.element.offsetHeight * winScale;

            const maxLeft = desktopWidth - minVisible;       // slide off right
            const minLeft = -(visualWidth - minVisible);      // slide off left
            const maxTop = desktopHeight - minVisible;       // slide off bottom
            const minTop = 0;                                  // keep title bar reachable

            left = Math.max(minLeft, Math.min(left, maxLeft));
            top = Math.max(minTop, Math.min(top, maxTop));

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
