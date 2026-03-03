export class InputManager {
    static activeLock = null;

    /**
     * Attempts to acquire a lock for a specific owner.
     * Returns true if successful or if owner already has the lock.
     */
    static lock(owner) {
        if (!owner) return false;
        if (this.activeLock && this.activeLock !== owner) return false;
        this.activeLock = owner;
        return true;
    }

    /**
     * Releases the lock if it belongs to the given owner.
     */
    static unlock(owner) {
        if (this.activeLock === owner) {
            this.activeLock = null;
        }
    }

    /**
     * Checks if the system is locked by someone other than the requester.
     */
    static isLocked(owner) {
        return this.activeLock !== null && this.activeLock !== owner;
    }

    /**
     * Utility to attach gesture handlers to an element.
     */
    static attach(element, handlers = {}) {
        let state = {
            pointerId: null,
            startPos: { x: 0, y: 0 },
            lastPos: { x: 0, y: 0 },
            startTime: 0,
            isDragging: false,
            clickCount: 0,
            clickTimer: null,
            holdTimer: null
        };

        const DRAG_THRESHOLD = handlers.dragThreshold !== undefined ? handlers.dragThreshold : 8; // Slightly more forgiving
        const HOLD_DURATION = 600;
        const DOUBLE_TAP_DELAY = 300;

        const onPointerDown = (e) => {
            if (e.button !== 0 || e.defaultPrevented) return;
            if (this.isLocked(handlers.owner)) return;

            // Clean up any previous state if it was somehow stuck
            cleanupGlobal();

            state.pointerId = e.pointerId;
            state.startPos = { x: e.clientX, y: e.clientY };
            state.lastPos = { x: e.clientX, y: e.clientY };
            state.startTime = Date.now();
            state.isDragging = false;

            if (handlers.onHold) {
                state.holdTimer = setTimeout(() => {
                    if (!state.isDragging) {
                        handlers.onHold(e);
                        state.isDragging = true;
                    }
                }, HOLD_DURATION);
            }

            if (handlers.onDown) {
                if (handlers.onDown(e) === false) {
                    state.pointerId = null;
                    return;
                }
            }

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
            // Catch capture loss which can break drags
            element.addEventListener('pointercapturelost', onCancel, { once: true });
        };

        const onMove = (e) => {
            if (state.pointerId === null || e.pointerId !== state.pointerId) return;

            const dx = e.clientX - state.startPos.x;
            const dy = e.clientY - state.startPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const deltaX = e.clientX - state.lastPos.x;
            const deltaY = e.clientY - state.lastPos.y;
            state.lastPos = { x: e.clientX, y: e.clientY };

            if (!state.isDragging && dist > DRAG_THRESHOLD) {
                state.isDragging = true;
                if (state.holdTimer) clearTimeout(state.holdTimer);

                // Acquire capture on the element being interacted with ONLY if requested.
                // For physics-based dragging (like desktop icons), capture breaks event bubbling to the parent grid!
                if (handlers.capture) {
                    try {
                        element.setPointerCapture(state.pointerId);
                    } catch (err) { }
                }

                if (handlers.onDragStart) {
                    handlers.onDragStart(e, { dx, dy, deltaX, deltaY });
                }
            }

            if (state.isDragging && handlers.onDrag) {
                handlers.onDrag(e, { dx, dy, deltaX, deltaY });
            }
        };

        const onUp = (e) => {
            if (state.pointerId === null || e.pointerId !== state.pointerId) return;

            const wasDragging = state.isDragging;
            const pid = state.pointerId;

            cleanupGlobal();

            if (wasDragging) {
                try {
                    element.releasePointerCapture(pid);
                } catch (err) { }
                if (handlers.onDragEnd) handlers.onDragEnd(e);
            } else {
                // Potential TAP or DOUBLE TAP
                state.clickCount++;

                if (!handlers.onDoubleTap) {
                    if (handlers.onTap) handlers.onTap(e);
                    state.clickCount = 0;
                } else {
                    if (state.clickCount === 1) {
                        state.clickTimer = setTimeout(() => {
                            if (state.clickCount === 1) {
                                if (handlers.onTap) handlers.onTap(e);
                            }
                            state.clickCount = 0;
                        }, DOUBLE_TAP_DELAY);
                    } else if (state.clickCount === 2) {
                        if (state.clickTimer) clearTimeout(state.clickTimer);
                        if (handlers.onDoubleTap) handlers.onDoubleTap(e);
                        state.clickCount = 0;
                    }
                }
            }
        };

        const onCancel = (e) => {
            if (state.pointerId === null || (e && e.pointerId !== state.pointerId)) return;

            const wasDragging = state.isDragging;
            cleanupGlobal();

            if (wasDragging && handlers.onDragEnd) handlers.onDragEnd();
            state.isDragging = false;
            state.clickCount = 0;
        };

        const cleanupGlobal = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            element.removeEventListener('pointercapturelost', onCancel);

            if (state.holdTimer) clearTimeout(state.holdTimer);
            state.pointerId = null;
        };

        element.addEventListener('pointerdown', onPointerDown);

        return () => {
            element.removeEventListener('pointerdown', onPointerDown);
            cleanupGlobal();
            if (state.clickTimer) clearTimeout(state.clickTimer);
        };
    }
}
