/**
 * InputManager
 * 
 * A unified interaction service that normalizes pointer events into 
 * high-level gestures (tap, double tap, hold, drag) and provides
 * an "Interaction Lock" to prevent multiple systems from fighting
 * over the same input stream.
 */
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
     * 
     * handlers: {
     *   owner: Object|String, // Optional: key for the locking system
     *   onTap: (e) => {},
     *   onDoubleTap: (e) => {},
     *   onHold: (e) => {},
     *   onDragStart: (e, { dx, dy }) => {},
     *   onDrag: (e, { dx, dy }) => {},
     *   onDragEnd: (e) => {},
     *   onDown: (e) => {}
     * }
     */
    static attach(element, handlers = {}) {
        let startPos = { x: 0, y: 0 };
        let startTime = 0;
        let isDragging = false;
        let holdTimer = null;
        let clickCount = 0;
        let clickTimer = null;

        const DRAG_THRESHOLD = 5;
        const HOLD_DURATION = 600; // Slightly longer than tap but responsive
        const DOUBLE_TAP_DELAY = 320;

        const onPointerDown = (e) => {
            // Only handle primary button (left click / touch)
            // Note: right click (button 2) should still trigger contextmenu normally
            if (e.button !== 0) return;

            // If someone else has a lock, ignore this input
            if (this.isLocked(handlers.owner)) return;

            startPos = { x: e.clientX, y: e.clientY };
            startTime = Date.now();
            isDragging = false;

            if (handlers.onHold) {
                holdTimer = setTimeout(() => {
                    if (!isDragging) {
                        handlers.onHold(e);
                        // Once we hold-trigger, we often want to prevent a tap on release
                        isDragging = true;
                    }
                }, HOLD_DURATION);
            }

            if (handlers.onDown) {
                // If onDown returns false, it means the component rejected the start
                if (handlers.onDown(e) === false) return;
            }

            element.setPointerCapture(e.pointerId);
            element.addEventListener('pointermove', onPointerMove);
            element.addEventListener('pointerup', onPointerUp);
            element.addEventListener('pointercancel', onPointerCancel);
        };

        const onPointerMove = (e) => {
            const dx = e.clientX - startPos.x;
            const dy = e.clientY - startPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (!isDragging && dist > DRAG_THRESHOLD) {
                isDragging = true;
                if (holdTimer) clearTimeout(holdTimer);

                if (handlers.onDragStart) {
                    handlers.onDragStart(e, { dx, dy });
                }
            }

            if (isDragging && handlers.onDrag) {
                handlers.onDrag(e, { dx, dy });
            }
        };

        const onPointerUp = (e) => {
            cleanup();

            if (holdTimer) clearTimeout(holdTimer);

            if (isDragging) {
                if (handlers.onDragEnd) handlers.onDragEnd(e);
            } else {
                // It's a candidate for a Tap or Double Tap
                clickCount++;
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        if (clickCount === 1) {
                            if (handlers.onTap) handlers.onTap(e);
                        }
                        clickCount = 0;
                    }, DOUBLE_TAP_DELAY);
                } else if (clickCount === 2) {
                    if (clickTimer) clearTimeout(clickTimer);
                    if (handlers.onDoubleTap) handlers.onDoubleTap(e);
                    clickCount = 0;
                }
            }
        };

        const onPointerCancel = () => {
            cleanup();
            if (holdTimer) clearTimeout(holdTimer);
            if (clickTimer) clearTimeout(clickTimer);
            if (isDragging && handlers.onDragEnd) handlers.onDragEnd();
            isDragging = false;
            clickCount = 0;
        };

        const cleanup = () => {
            element.removeEventListener('pointermove', onPointerMove);
            element.removeEventListener('pointerup', onPointerUp);
            element.removeEventListener('pointercancel', onPointerCancel);
        };

        element.addEventListener('pointerdown', onPointerDown);

        // Return a detacher
        return () => {
            element.removeEventListener('pointerdown', onPointerDown);
            cleanup();
            if (holdTimer) clearTimeout(holdTimer);
            if (clickTimer) clearTimeout(clickTimer);
        };
    }
}
