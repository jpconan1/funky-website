import Matter from 'matter-js';

export class SpriteRenderer {
    constructor(defaultFrameSize = 128) {
        this.frameSize = defaultFrameSize;
        this.imageCache = new Map();
    }

    async loadSheet(src, customFrameSize) {
        const frameSize = customFrameSize || this.frameSize;
        if (this.imageCache.has(src)) {
            return this.imageCache.get(src);
        }

        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const cols = Math.floor(image.width / frameSize);
                const rows = Math.floor(image.height / frameSize);
                const rawFrameCount = cols * rows;

                // Create a temporary canvas for pixel inspection (THE HACK)
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = frameSize;
                tempCanvas.height = frameSize;
                const tempCtx = tempCanvas.getContext('2d');

                // Detect Empty Frames at the End
                let lastValidFrame = -1;
                for (let i = 0; i < rawFrameCount; i++) {
                    if (!this.isFrameEmpty(image, i, cols, tempCtx, frameSize)) {
                        lastValidFrame = i;
                    }
                }
                const frameCount = lastValidFrame + 1;

                const sheetData = {
                    image,
                    cols,
                    rows,
                    frameCount,
                    frameSize,
                    startFrameIndex: 0 // Defaulting to 0, VirusMan will still override if needed
                };

                this.imageCache.set(src, sheetData);
                resolve(sheetData);
            };
            image.onerror = reject;
            image.src = src;
        });
    }

    isFrameEmpty(image, index, cols, tempCtx, frameSize) {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const sx = col * frameSize;
        const sy = row * frameSize;

        tempCtx.clearRect(0, 0, frameSize, frameSize);
        tempCtx.drawImage(image, sx, sy, frameSize, frameSize, 0, 0, frameSize, frameSize);

        const imageData = tempCtx.getImageData(0, 0, frameSize, frameSize).data;
        for (let i = 3; i < imageData.length; i += 4) {
            if (imageData[i] > 5) return false;
        }
        return true;
    }

    drawFrame(ctx, sheet, frameIndex, x, y, width, height, flipX = false) {
        const frameSize = sheet.frameSize || this.frameSize;
        const col = frameIndex % sheet.cols;
        const row = Math.floor(frameIndex / sheet.cols);

        const sx = col * frameSize;
        const sy = row * frameSize;

        if (flipX) {
            ctx.save();
            ctx.translate(x + width, y);
            ctx.scale(-1, 1);
            ctx.drawImage(
                sheet.image,
                sx, sy, frameSize, frameSize,
                0, 0, width, height
            );
            ctx.restore();
        } else {
            ctx.drawImage(
                sheet.image,
                sx, sy, frameSize, frameSize,
                x, y, width, height
            );
        }
    }
}

export class VirusManInput {
    constructor() {
        this.keys = new Set();
        window.addEventListener('keydown', (e) => {
            // Prevent scrolling with arrows
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
            this.keys.add(e.key.toLowerCase());
        });
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.key.toLowerCase());
        });
    }

    isPressed(key) {
        return this.keys.has(key.toLowerCase());
    }

    get horizontal() {
        let h = 0;
        if (this.isPressed('arrowright')) h += 1;
        if (this.isPressed('arrowleft')) h -= 1;
        return h;
    }
}

export class VirusMan {
    constructor(engine, x, y) {
        this.engine = engine;
        this.x = x;
        this.y = y;
        this.width = 64; // Smaller physical hit box than sprite
        this.height = 80;
        this.spriteWidth = 128;
        this.spriteHeight = 128;
        this.vx = 0;
        this.speed = 0.0015;

        this.animations = {};
        this.currentAnimation = null;
        this.frameIndex = 1;
        this.frameTimer = 0;
        this.fps = 45; // Faster, smoother animation
        this.flipX = false;

        this.element = document.createElement('div');
        this.element.className = 'virus-man-actor';
        this.element.style.position = 'absolute';
        this.element.style.width = `${this.spriteWidth}px`;
        this.element.style.height = `${this.spriteHeight}px`;
        this.element.style.pointerEvents = 'none';
        this.element.style.zIndex = '1000';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.spriteWidth;
        this.canvas.height = this.spriteHeight;
        this.ctx = this.canvas.getContext('2d');
        this.element.appendChild(this.canvas);

        this.renderer = new SpriteRenderer();
        this.input = new VirusManInput();

        // Matter.js Body
        const { Bodies, Composite } = Matter;
        this.body = Bodies.rectangle(x, y - this.height / 2, this.width, this.height, {
            friction: 0.02,
            frictionAir: 0.03, // Restored to 0.03 with fixed gravity logic
            restitution: 0.0,
            inertia: Infinity, // Prevent rotation
            label: 'virus-man'
        });
        Composite.add(this.engine.world, this.body);

        // Listen for collisions to reset jump count (only if landing on top of something)
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                if (pair.bodyA === this.body || pair.bodyB === this.body) {
                    const other = pair.bodyA === this.body ? pair.bodyB : pair.bodyA;
                    
                    // Reset jump if we are above the object we hit 
                    // or if it's the floor (which is a static wall at the bottom)
                    if (this.body.position.y < other.position.y || other.isStatic) {
                        this.jumpCount = 0;
                    }
                }
            });
        });

        this.jumpCount = 0;
        this.maxJumps = 2; // Ground jump + 1 air jump
        this.spacePressedLastFrame = false;
        this.hasHit = false; // Track if we've already "hit" this animation cycle
    }

    async init() {
        const assets = {
            idle: new URL('./assets/virus-man/Male_spritesheet_idle.png', import.meta.url).href,
            run: new URL('./assets/virus-man/Male_spritesheet_run.png', import.meta.url).href,
            crouch_idle: new URL('./assets/virus-man/Male_spritesheet_crouch_idle.png', import.meta.url).href,
            crouch_walk: new URL('./assets/virus-man/Male_spritesheet_crouch_walk_back.png', import.meta.url).href,
            crouch_to_stand: new URL('./assets/virus-man/Male_spritesheet_crouch_to_stand.png', import.meta.url).href,
            punch1: new URL('./assets/virus-man/Male_spritesheet_punch_1.png', import.meta.url).href,
            punch2: new URL('./assets/virus-man/Male_spritesheet_punch_2.png', import.meta.url).href,
            punch3: new URL('./assets/virus-man/Male_spritesheet_punch_3.png', import.meta.url).href,
        };

        for (const [name, url] of Object.entries(assets)) {
            const sheet = await this.renderer.loadSheet(url, 128); // Force VirusMan size
            sheet.startFrameIndex = 1; // Keep prototype skip rule
            this.animations[name] = sheet;
        }

        this.setAnimation('idle');
    }

    setAnimation(name) {
        if (this.currentAnimation === name) return;
        this.currentAnimation = name;
        this.frameIndex = this.animations[name].startFrameIndex;
        this.frameTimer = 0;
        this.hasHit = false; // Reset hit flag for new animation
    }

    get isHitFrame() {
        if (!this.currentAnimation || this.hasHit) return false;
        const sheet = this.animations[this.currentAnimation];
        if (!sheet) return false;

        const framesIn = this.frameIndex - sheet.startFrameIndex;

        let hit = false;
        if (this.currentAnimation === 'punch2') {
            hit = framesIn >= 15;
        } else if (this.currentAnimation === 'punch1' || this.currentAnimation === 'punch3') {
            hit = framesIn >= 3;
        }

        if (hit) {
            this.hasHit = true;
            return true;
        }

        return false;
    }

    update(deltaTime) {
        if (!this.currentAnimation) return;

        const horizontal = this.input.horizontal;
        const crouching = this.input.isPressed('arrowdown');
        const jumping = this.input.isPressed(' ');
        const punch1 = this.input.isPressed('z');
        const punch2 = this.input.isPressed('x');

        this.isPunching = this.currentAnimation === 'punch1' ||
            this.currentAnimation === 'punch2' ||
            this.currentAnimation === 'punch3';

        // Apply Movement via Matter.js Force
        let moveSpeed = this.speed;
        if (crouching) moveSpeed *= 0.4;
        if (this.isPunching) moveSpeed *= 0.2;

        if (horizontal !== 0) {
            Matter.Body.applyForce(this.body, this.body.position, {
                x: horizontal * moveSpeed * 16.6, // Use a baseline constant for force instead of variable dt
                y: 0
            });
        }

        // Cap horizontal velocity to prevent "crazy" air speed
        const maxVelX = 6;
        if (Math.abs(this.body.velocity.x) > maxVelX) {
            Matter.Body.setVelocity(this.body, {
                x: Math.sign(this.body.velocity.x) * maxVelX,
                y: this.body.velocity.y
            });
        }

        // Apply Gravity (manual since global gravity is 0)
        // Fixed: Removed deltaTime multiplier which was causing erratic heavy gravity
        Matter.Body.applyForce(this.body, this.body.position, {
            x: 0,
            y: 0.0012 * this.body.mass
        });

        // Jump Logic (Burst & Double Jump)
        const spaceJustPressed = jumping && !this.spacePressedLastFrame;
        this.spacePressedLastFrame = jumping;

        // Jump count is now strictly handled by collision events.
        // Removed the velocity check that was resetting jumps at the apex.

        if (spaceJustPressed && this.jumpCount < this.maxJumps) {
            // Apply upward burst
            Matter.Body.setVelocity(this.body, {
                x: this.body.velocity.x,
                y: -12
            });
            this.jumpCount++;
            this.setAnimation('run'); // Force an active state
        }

        if (horizontal !== 0 && !this.isPunching) {
            this.flipX = horizontal < 0;
        }

        // Animation State Logic
        if (punch1) {
            this.setAnimation('punch1');
        } else if (punch2) {
            this.setAnimation('punch2');
        } else if (this.isPunching) {
            const sheet = this.animations[this.currentAnimation];
            const totalVisibleFrames = Math.max(1, sheet.frameCount - sheet.startFrameIndex);
            if (this.frameIndex >= sheet.startFrameIndex + totalVisibleFrames - 1) {
                this.setAnimation(horizontal !== 0 ? 'run' : 'idle');
            }
        } else if (crouching) {
            if (horizontal !== 0) {
                this.setAnimation('crouch_walk');
            } else {
                this.setAnimation('crouch_idle');
            }
        } else {
            if (this.currentAnimation === 'crouch_idle' || this.currentAnimation === 'crouch_walk') {
                this.setAnimation('crouch_to_stand');
            } else if (this.currentAnimation === 'crouch_to_stand') {
                const sheet = this.animations[this.currentAnimation];
                const totalVisibleFrames = sheet.frameCount - sheet.startFrameIndex;
                if (this.frameIndex >= sheet.startFrameIndex + totalVisibleFrames - 1) {
                    this.setAnimation(horizontal !== 0 ? 'run' : 'idle');
                }
            } else if (horizontal !== 0 || Math.abs(this.body.velocity.y) > 0.1) {
                this.setAnimation('run');
            } else {
                this.setAnimation('idle');
            }
        }

        // Advance frames
        const sheet = this.animations[this.currentAnimation];
        const frameInterval = 1000 / this.fps;
        this.frameTimer += deltaTime;

        if (this.frameTimer >= frameInterval) {
            const totalVisibleFrames = Math.max(1, sheet.frameCount - sheet.startFrameIndex);
            const isNonLooping = ['crouch_to_stand', 'punch1', 'punch2', 'punch3'].includes(this.currentAnimation);

            if (isNonLooping) {
                if (this.frameIndex < sheet.startFrameIndex + totalVisibleFrames - 1) {
                    this.frameIndex++;
                }
            } else {
                this.frameIndex = sheet.startFrameIndex +
                    ((this.frameIndex - sheet.startFrameIndex + 1) % totalVisibleFrames);
            }
            this.frameTimer = 0;
        }

        // Sync with Physics Body
        this.x = this.body.position.x;
        this.y = this.body.position.y + this.height / 2;

        // Update DOM position
        this.element.style.left = `${this.x - this.spriteWidth / 2}px`;
        this.element.style.top = `${this.y - this.spriteHeight}px`;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.spriteWidth, this.spriteHeight);

        const sheet = this.animations[this.currentAnimation];
        if (!sheet) {
            // Debug Fallback
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(this.spriteWidth/2 - 20, this.spriteHeight - 40, 40, 40);
            return;
        }

        this.renderer.drawFrame(
            this.ctx,
            sheet,
            this.frameIndex,
            0, 0,
            this.spriteWidth, this.spriteHeight,
            this.flipX
        );
    }
}
