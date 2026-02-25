import Matter from 'matter-js';
import { getIconSymbol, formatFileName } from './desktop.js';

export class Sailor {
    constructor(wm) {
        this.wm = wm;
    }

    openDirectory(file) {
        const title = `Sailor - ${file.name}`;
        const container = document.createElement('div');
        container.className = 'sailor-container';

        const win = this.wm.createWindow(title, container);
        win.element.classList.add('sailor-window');

        const contentArea = win.element.querySelector('.window-content');
        contentArea.style.background = '#0a283c'; // Dark deep water

        const canvas = document.createElement('canvas');
        canvas.className = 'sailor-water-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        container.appendChild(canvas);

        this.initPhysics(container, file, win, canvas);
    }

    initPhysics(container, file, win, canvas) {
        const { Engine, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

        const engine = Engine.create();
        engine.gravity.y = 0;
        engine.gravity.x = 0;

        const runner = Runner.create();
        Runner.run(runner, engine);

        const iconPairs = [];
        let walls = [];

        // --- Wave Simulation Setup ---
        const gridScale = 8; // Smaller scale for higher resolution
        let cols, rows;
        let buffer1, buffer2;
        const damping = 0.98; // Slightly less damping for longer ripples
        const speedSq = 0.07; // Slightly slower waves

        const setupSimulation = () => {
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;
            canvas.width = width;
            canvas.height = height;
            cols = Math.ceil(width / gridScale) + 1;
            rows = Math.ceil(height / gridScale) + 1;
            buffer1 = new Float32Array(cols * rows);
            buffer2 = new Float32Array(cols * rows);
        };

        const getIdx = (i, j) => i * rows + j;

        const updateWaves = () => {
            for (let i = 1; i < cols - 1; i++) {
                for (let j = 1; j < rows - 1; j++) {
                    const idx = getIdx(i, j);
                    const neighbors = (
                        buffer1[getIdx(i - 1, j)] +
                        buffer1[getIdx(i + 1, j)] +
                        buffer1[getIdx(i, j - 1)] +
                        buffer1[getIdx(i, j + 1)]
                    );
                    const current = buffer1[idx];
                    const previous = buffer2[idx];

                    buffer2[idx] = (2 * current - previous + speedSq * (neighbors - 4 * current)) * damping;
                }
            }
            // Swap buffers
            const temp = buffer1;
            buffer1 = buffer2;
            buffer2 = temp;
        };

        const sampleWave = (x, y) => {
            const gx = x / gridScale;
            const gy = y / gridScale;
            const i = Math.floor(gx);
            const j = Math.floor(gy);

            if (i < 1 || i >= cols - 2 || j < 1 || j >= rows - 2) return 0;

            const fx = gx - i;
            const fy = gy - j;

            // Bilinear interpolation
            const v00 = buffer1[getIdx(i, j)];
            const v10 = buffer1[getIdx(i + 1, j)];
            const v01 = buffer1[getIdx(i, j + 1)];
            const v11 = buffer1[getIdx(i + 1, j + 1)];

            return v00 * (1 - fx) * (1 - fy) +
                v10 * fx * (1 - fy) +
                v01 * (1 - fx) * fy +
                v11 * fx * fy;
        };

        const triggerRipple = (x, y, strength = 100) => {
            const i = Math.floor(x / gridScale);
            const j = Math.floor(y / gridScale);
            if (i > 0 && i < cols - 1 && j > 0 && j < rows - 1) {
                buffer1[getIdx(i, j)] += strength;
            }
        };

        const renderWaves = () => {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;

            // We use a high-performance approach: drawing to a pixel buffer
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            // Instead of per-pixel on CPU which is slow, we'll draw "blobs" for peaks
            // because a full pixel buffer for waves on CPU is usually too heavy in JS.
            // But let's try a simplified cell-based rendering with smoothing.
            ctx.clearRect(0, 0, width, height);

            ctx.shadowBlur = 15;
            for (let i = 1; i < cols - 1; i++) {
                for (let j = 1; j < rows - 1; j++) {
                    const h = buffer1[getIdx(i, j)];
                    if (Math.abs(h) > 0.5) {
                        const alpha = Math.min(Math.abs(h) / 80, 0.4);
                        ctx.fillStyle = h > 0 ? `rgba(160, 240, 255, ${alpha})` : `rgba(0, 10, 40, ${alpha})`;
                        ctx.fillRect(i * gridScale, j * gridScale, gridScale, gridScale);
                    }
                }
            }
        };

        const updateWalls = () => {
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;
            const thickness = 200;

            Composite.remove(engine.world, walls);
            walls = [
                Bodies.rectangle(width / 2, -thickness / 2, width + thickness * 2, thickness, { isStatic: true }),
                Bodies.rectangle(width / 2, height + thickness / 2, width + thickness * 2, thickness, { isStatic: true }),
                Bodies.rectangle(-thickness / 2, height / 2, thickness, height + thickness * 2, { isStatic: true }),
                Bodies.rectangle(width + thickness / 2, height / 2, thickness, height + thickness * 2, { isStatic: true })
            ];
            Composite.add(engine.world, walls);
            setupSimulation();
        };

        const ro = new ResizeObserver(() => updateWalls());
        ro.observe(container);

        // --- Interaction ---
        let grabbedBody = null;
        let lastMousePos = { x: 0, y: 0 };

        container.addEventListener('pointerdown', (e) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const iconElement = e.target.closest('.icon');
            const bodies = iconPairs.map(p => p.body);
            const clickedBodies = Matter.Query.point(bodies, { x, y });

            if (clickedBodies.length > 0 || iconElement) {
                const pair = iconElement
                    ? iconPairs.find(p => p.element === iconElement)
                    : iconPairs.find(p => p.body === clickedBodies[0]);

                if (pair) {
                    grabbedBody = pair.body;

                    // Deselect others in this container
                    container.querySelectorAll('.icon').forEach(el => el.classList.remove('selected'));
                    pair.element.classList.add('selected');

                    const now = Date.now();
                    if (now - (pair.lastClickTime || 0) < 300) {
                        // Defer window creation until after the event bubble finishes focusing this window
                        setTimeout(() => {
                            if (pair.file.type === 'directory' || pair.file.contents) this.openDirectory(pair.file);
                            else window.dispatchEvent(new CustomEvent('sailor-open-file', { detail: pair.file }));
                        }, 0);
                        grabbedBody = null;
                        pair.lastClickTime = 0;
                    } else {
                        pair.lastClickTime = now;
                    }
                    triggerRipple(x, y, 60);
                }
            } else {
                triggerRipple(x, y, 200);
                this.createVisualRipple(container, x, y);
                container.querySelectorAll('.icon').forEach(el => el.classList.remove('selected'));
            }
            lastMousePos = { x, y };
        });

        window.addEventListener('pointermove', (e) => {
            if (!container.isConnected) return;
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (grabbedBody) {
                // Calculate simple velocity based on mouse delta
                const vx = x - lastMousePos.x;
                const vy = y - lastMousePos.y;

                Body.setPosition(grabbedBody, { x, y });
                // We apply a bit of the velocity to the body so it 'carries' momentum when released
                Body.setVelocity(grabbedBody, { x: vx * 0.8, y: vy * 0.8 });

                // Continuous wake
                const dist = Math.sqrt(vx ** 2 + vy ** 2);
                if (dist > 5) {
                    triggerRipple(x, y, dist * 1.0); // Reduced from 1.5
                }
            }
            lastMousePos = { x, y };
        });

        window.addEventListener('pointerup', () => {
            if (grabbedBody) {
                // Add a little extra kick on release if moving fast
                const speed = grabbedBody.speed;
                if (speed > 5) {
                    Body.setVelocity(grabbedBody, {
                        x: grabbedBody.velocity.x * 1.2,
                        y: grabbedBody.velocity.y * 1.2
                    });
                }
            }
            grabbedBody = null;
        });

        // Create Icons
        const contents = file.contents || [];
        contents.forEach((child) => {
            const icon = document.createElement('div');
            icon.className = 'icon sailor-icon';
            icon.style.pointerEvents = 'auto';
            icon.innerHTML = `
                <div class="icon-image">${getIconSymbol(child)}</div>
                <div class="icon-label">${formatFileName(child.name)}</div>
            `;
            container.appendChild(icon);

            const body = Bodies.rectangle(
                Math.random() * container.clientWidth,
                Math.random() * container.clientHeight,
                70, 90,
                {
                    frictionAir: 0.01, // Extremely low air friction for high inertia
                    restitution: 0.4,
                    inertia: Infinity,
                    mass: 5 // Manually bumping mass to make them 'heavy'
                }
            );

            Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2,
                y: (Math.random() - 0.5) * 2
            });

            Composite.add(engine.world, body);
            iconPairs.push({ element: icon, body, file: child, angle: 0, lastClickTime: 0 });
        });

        // --- Simulation Hook ---
        Events.on(engine, 'beforeUpdate', () => {
            updateWaves();

            iconPairs.forEach(pair => {
                const { body, element } = pair;
                const { x, y } = body.position;

                // Sample water surface for gradient
                const h = sampleWave(x, y);
                const delta = 4; // Half of gridScale
                const hx = sampleWave(x + delta, y) - sampleWave(x - delta, y);
                const hy = sampleWave(x, y + delta) - sampleWave(x, y - delta);

                // Buoyancy force based on wave slope - REDUCED AGGRESSIVELY for heavy feel
                const sensitivity = 0.0002;
                Body.applyForce(body, body.position, {
                    x: -hx * sensitivity,
                    y: -hy * sensitivity
                });

                // Damping/Viscosity - Almost no damping to simulate heavy momentum
                Body.setVelocity(body, {
                    x: body.velocity.x * 0.998,
                    y: body.velocity.y * 0.998
                });

                // Create ripples when moving - only for significant movement
                if (body.speed > 3.0) {
                    triggerRipple(x, y, body.speed * 0.3);
                }

                // Tilt effect - subtle
                const targetTiltX = hy * 0.06;
                const targetTiltY = -hx * 0.06;

                element.style.setProperty('--tilt-x', `${targetTiltX}deg`);
                element.style.setProperty('--tilt-y', `${targetTiltY}deg`);
                element.style.setProperty('--wave-h', `${h * 0.15}px`);

                // Visual update - no transition needed as we update every frame
                element.style.left = `${x - 40}px`;
                element.style.top = `${y - 50}px`;
                element.style.transform = `
                    translateY(calc(-10px + var(--wave-h)))
                    rotateX(var(--tilt-x))
                    rotateY(var(--tilt-y))
                `;
            });
        });

        Events.on(engine, 'afterUpdate', () => {
            renderWaves();
        });

        // Cleanup
        const cleanupCheck = setInterval(() => {
            if (!container.isConnected) {
                Engine.clear(engine);
                Runner.stop(runner);
                ro.disconnect();
                clearInterval(cleanupCheck);
            }
        }, 1000);
    }

    createVisualRipple(container, x, y, size = 'large') {
        const ripple = document.createElement('div');
        ripple.className = `sailor-ripple ripple-${size}`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        container.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
        setTimeout(() => { if (ripple.parentNode) ripple.remove(); }, 1500);
    }
}

