import Matter from 'matter-js';
import { WindowManager } from './window-manager.js';
import { initContextMenu } from './context-menu.js';
import { TextEditor } from './text-editor.js';
import { requireAdmin, isAdminSession } from './admin-auth.js';
import { InputManager } from './input-manager.js';

import { getMessages, binMessage, getBinnedMessages, deleteMessagePermanently, restoreMessage, subscribeToMessages, MEDIA_STAMP, stripStamp, getWallpaper, clearWallpaper, subscribeToWallpaper, formatDate } from './supabase.js';
import { Sailor } from './sailor.js';
import { FunkMaker3000 } from './funk-maker-3000.js';
import { Paint } from './paint.js';
import { ChessApp } from './chess.js';
import { Settings } from './settings.js';
import { StartMenu } from './start-menu.js';
import { applyWallpaperToDesktop } from './paint.js';
import { VirusMan, SpriteRenderer } from './virus-man.js';
import { HitCounter } from './hit-counter.js';


async function preloadAssets(paths) {
    const promises = paths.map(path => {
        if (path.endsWith('.mp4')) {
            return new Promise((resolve) => {
                const video = document.createElement('video');
                video.src = path;
                video.preload = 'auto';
                video.oncanplaythrough = resolve;
                video.onerror = resolve;
                setTimeout(resolve, 3000); // 3s timeout fallback
            });
        } else if (path.endsWith('.wav')) {
            return new Promise((resolve) => {
                const audio = new Audio();
                audio.src = path;
                audio.oncanplaythrough = resolve;
                audio.onerror = resolve;
                setTimeout(resolve, 2000); // 2s timeout fallback
            });
        } else {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = path;
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 2000); // 2s timeout fallback
            });
        }
    });
    return Promise.all(promises);
}

export async function initDesktop() {
    const app = document.querySelector('#app');
    const beat = 150;

    const assetsToPreload = [
        new URL('./assets/bg-waves.mp4', import.meta.url).href,
        new URL('./assets/blank-idle.png', import.meta.url).href,
        new URL('./assets/close.png', import.meta.url).href,
        new URL('./assets/file-boilsheet.png', import.meta.url).href,
        new URL('./assets/folder-boilsheet.png', import.meta.url).href,
        new URL('./assets/folder-idle.png', import.meta.url).href,
        new URL('./assets/img-boilsheet.png', import.meta.url).href,
        new URL('./assets/img-idle.png', import.meta.url).href,
        new URL('./assets/pdf-boilsheet.png', import.meta.url).href,
        new URL('./assets/pdf-idle.png', import.meta.url).href,
        new URL('./assets/txt-boilsheet.png', import.meta.url).href,
        new URL('./assets/txt-idle.png', import.meta.url).href,
        new URL('./assets/song-boilsheet.png', import.meta.url).href,
        new URL('./assets/song-idle.png', import.meta.url).href,
        new URL('./assets/start-menu/start-box.png', import.meta.url).href,
        new URL('./assets/start-menu/start-hovered.png', import.meta.url).href,
        new URL('./assets/start-menu/start-idle.png', import.meta.url).href,
        new URL('./assets/start-menu/start-selected.png', import.meta.url).href,
        new URL('./assets/bin-icon.png', import.meta.url).href,
        new URL('./assets/start-menu/portrait.jpg', import.meta.url).href,
        new URL('./assets/burger-joint.png', import.meta.url).href,
        new URL('./assets/working-draft-icon.png', import.meta.url).href,
        new URL('./assets/chess-icon.png', import.meta.url).href,
        new URL('./assets/settings.png', import.meta.url).href,
        new URL('./assets/funk-maker-3000.png', import.meta.url).href,
        new URL('./assets/virus-man/icon.png', import.meta.url).href,
        new URL('./assets/hit-counter-sheet.png', import.meta.url).href,
        new URL('./assets/counter-idle.png', import.meta.url).href,
        '/chime.wav'
    ];

    // Start preloading immediately
    const preloading = preloadAssets(assetsToPreload);

    const wm = new WindowManager();
    const textEditor = new TextEditor(wm, () => loadGuestbookMessages(true));

    const paint = new Paint(wm, () => loadGuestbookMessages(true));
    const funkMaker = new FunkMaker3000(wm);
    const sailor = new Sailor(wm);
    const chess = new ChessApp(wm, () => loadGuestbookMessages(true));
    const settings = new Settings(wm);
    const startMenu = new StartMenu(wm);

    document.title = "Retro Desktop";

    // Wait for critical assets before starting sequence
    await preloading;

    const hitCounter = new HitCounter();

    // Transition to desktop
    app.innerHTML = `
    <div id="desktop">
      <video class="desktop-bg-video" autoplay muted loop playsinline style="opacity: 0; transition: opacity 1s ease-in">
        <source src="${new URL('./assets/bg-waves.mp4', import.meta.url).href}" type="video/mp4">
      </video>
      <div class="desktop-overlay"></div>
      <div id="icon-grid" style="visibility: hidden"></div>
    </div>
    <div id="taskbar" style="visibility: hidden">
      <div class="start-button"></div>
      <div id="hit-counter"></div>
      <div class="clock"></div>
    </div>
    </div>
  `;

    const taskbar = document.querySelector('#taskbar');
    const startButton = document.querySelector('.start-button');
    taskbar.insertBefore(startMenu.render(), startButton.nextSibling);

    const iconGrid = document.querySelector('#icon-grid');
    const bgVideo = document.querySelector('.desktop-bg-video');
    const desktop = document.querySelector('#desktop');

    initContextMenu(desktop, {
        newTextFile: () => textEditor.openNewFile(),
        newPaint: () => paint.openNewFile(),
        newFunkMaker: () => funkMaker.open()
    });

    // Fade in background video immediately since it's preloaded
    if (bgVideo) bgVideo.style.opacity = '0.6';

    // Start Menu
    startMenu.attach(startButton);

    // Physics Engine Setup
    const Engine = Matter.Engine,
        Bodies = Matter.Bodies,
        Composite = Matter.Composite,
        Mouse = Matter.Mouse,
        MouseConstraint = Matter.MouseConstraint,
        Events = Matter.Events,
        Runner = Matter.Runner;

    // Collision Categories
    const WALL_CATEGORY = 0x0001;
    const ICON_CATEGORY = 0x0002;
    const BIN_CATEGORY = 0x0004;
    const WINDOW_CATEGORY = 0x0008;
    const VIRUS_MAN_CATEGORY = 0x0010;

    const engine = Engine.create();
    engine.gravity.y = 0; // Keep global gravity 0, we'll apply it selectively
    engine.gravity.x = 0;

    let virusMan = null;
    let virusManSpawned = false;

    const virusManInitializer = (async () => {
        // Create off-screen initially
        virusMan = new VirusMan(engine, -1000, -1000);
        await virusMan.init();
        // Remove from world immediately - will add back when spawned
        Matter.Composite.remove(engine.world, virusMan.body);
    })();

    async function spawnVirusManAt(x, y) {
        await virusManInitializer;
        
        Matter.Body.setPosition(virusMan.body, { x, y });
        Matter.Body.setVelocity(virusMan.body, { x: 0, y: 0 });
        Matter.Composite.add(engine.world, virusMan.body);

        virusMan.body.collisionFilter = {
            category: VIRUS_MAN_CATEGORY,
            mask: WALL_CATEGORY | ICON_CATEGORY | BIN_CATEGORY | WINDOW_CATEGORY | VIRUS_MAN_CATEGORY
        };
        
        if (!virusManSpawned) {
            iconGrid.appendChild(virusMan.element);
            virusManSpawned = true;
        }
    }

    const runner = Runner.create();
    Runner.run(runner, engine);

    // Admin state — re-evaluated each time it's read so that logging in mid-session
    // (via Ctrl+Shift+A) is reflected immediately without a page reload.
    const getIsAdmin = () => isAdminSession();
    let isAdmin = getIsAdmin();

    // Secret shortcut: Ctrl+Shift+A → show admin login prompt
    document.addEventListener('keydown', async (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            const granted = await requireAdmin();
            if (granted) {
                isAdmin = true;
                console.log('[Admin] Session granted.');
            }
        }
    });

    const iconPairs = [];
    const walls = [];

    // "The Bin" Physics Body & State
    let binBody = null;
    let binnedRegistry = {};
    let binRenderer = new SpriteRenderer(64);
    let binSheet = null;
    let binFrameIndex = 0;
    let binTumbleTimer = 0;
    let binIsTumbling = false;

    async function refreshBinnedRegistry() {
        const binned = await getBinnedMessages();
        const newRegistry = {};
        binned.forEach(msg => {
            newRegistry[msg.id] = {
                id: msg.id,
                name: msg.filename,
                hp: msg.bin_count || 1,
                data: msg
            };
        });
        binnedRegistry = newRegistry;
    }

    function updateWalls() {
        const width = iconGrid.clientWidth;
        const height = iconGrid.clientHeight;
        const thickness = 1000;

        Composite.remove(engine.world, walls);
        walls.length = 0;

        const wallTable = [
            Bodies.rectangle(width / 2, -thickness / 2, width + thickness * 2, thickness, {
                isStatic: true,
                collisionFilter: { category: WALL_CATEGORY }
            }), // Top
            Bodies.rectangle(width / 2, height + thickness / 2, width + thickness * 2, thickness, {
                isStatic: true,
                collisionFilter: { category: WALL_CATEGORY }
            }), // Bottom
            Bodies.rectangle(-thickness / 2, height / 2, thickness, height + thickness * 2, {
                isStatic: true,
                collisionFilter: { category: WALL_CATEGORY }
            }), // Left
            Bodies.rectangle(width + thickness / 2, height / 2, thickness, height + thickness * 2, {
                isStatic: true,
                collisionFilter: { category: WALL_CATEGORY }
            }) // Right
        ];

        walls.push(...wallTable);
        walls.forEach(wall => wall.restitution = 0.5);
        Composite.add(engine.world, walls);
    }

    // Mouse constraints for dragging
    const mouse = Mouse.create(iconGrid);

    // Scaling helper for Matter.js mouse
    const updateMouseScale = () => {
        const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
        Mouse.setScale(mouse, { x: 1 / scale, y: 1 / scale });
    };

    window.addEventListener('ui-scale-changed', () => {
        updateMouseScale();
        requestAnimationFrame(updateWalls);
    });
    updateMouseScale(); // Init
    updateWalls(); // Init

    const mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.2,
            render: { visible: false }
        }
    });
    Composite.add(engine.world, mouseConstraint);

    // Update cursor during drag
    Events.on(mouseConstraint, 'startdrag', (event) => {
        if (event.body) {
            event.body.element.classList.add('dragging');
        }
    });
    Events.on(mouseConstraint, 'enddrag', (event) => {
        if (event.body) {
            event.body.element.classList.remove('dragging');
        }
    });

    // Window Physics Bodies Sync
    const windowBodies = new Map();

    // Sync physics bodies with DOM elements
    Events.on(engine, 'afterUpdate', () => {
        const width = iconGrid.clientWidth;
        const height = iconGrid.clientHeight;
        const margin = 200;

        // Sync Window Bodies
        const gridRect = iconGrid.getBoundingClientRect();
        const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;

        wm.windows.forEach(win => {
            let body = windowBodies.get(win.id);
            const winRect = win.element.getBoundingClientRect();
            
            // Convert rect to logical grid coordinates
            const winW = winRect.width / uiScale;
            const winH = winRect.height / uiScale;
            const winX = (winRect.left - gridRect.left) / uiScale + winW / 2;
            const winY = (winRect.top - gridRect.top) / uiScale + winH / 2;

            if (!body) {
                body = Bodies.rectangle(winX, winY, winW, winH, {
                    isStatic: true,
                    friction: 0.1,
                    restitution: 0.2,
                    collisionFilter: { 
                        category: WINDOW_CATEGORY,
                        mask: WALL_CATEGORY | WINDOW_CATEGORY | VIRUS_MAN_CATEGORY
                    }
                });
                windowBodies.set(win.id, body);
                Composite.add(engine.world, body);
            } else {
                Matter.Body.setPosition(body, { x: winX, y: winY });
                
                // If size changed (e.g. window resized), recreate the body
                if (Math.abs(body.bounds.max.x - body.bounds.min.x - winW) > 5 ||
                    Math.abs(body.bounds.max.y - body.bounds.min.y - winH) > 5) {
                    Composite.remove(engine.world, body);
                    body = Bodies.rectangle(winX, winY, winW, winH, {
                        isStatic: true,
                        friction: 0.1,
                        restitution: 0.2,
                        collisionFilter: { 
                            category: WINDOW_CATEGORY,
                            mask: WALL_CATEGORY | WINDOW_CATEGORY | VIRUS_MAN_CATEGORY
                        }
                    });
                    windowBodies.set(win.id, body);
                    Composite.add(engine.world, body);
                }
            }
        });

        // Remove bodies for closed windows
        for (const [id, body] of windowBodies.entries()) {
            if (!wm.windows.find(w => w.id === id)) {
                Composite.remove(engine.world, body);
                windowBodies.delete(id);
            }
        }

        // OOB check for Virus-Man
        if (virusMan && virusManSpawned) {
            if (virusMan.x < -margin || virusMan.x > width + margin || virusMan.y < -margin || virusMan.y > height + margin) {
                Matter.Body.setPosition(virusMan.body, {
                    x: width / 2,
                    y: height / 2
                });
                Matter.Body.setVelocity(virusMan.body, { x: 0, y: 0 });
            }
        }

        iconPairs.forEach(({ element, body, file }) => {
            const { x, y } = body.position;

            // OOB check - respawn if somehow escaped the thick walls
            if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
                Matter.Body.setPosition(body, {
                    x: Math.random() * width,
                    y: Math.random() * height
                });
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
            }

            // Suction Effect logic
            const now = Date.now();
            const immunityUntil = parseInt(element.dataset.binImmunityUntil || "0");
            const isImmune = now < immunityUntil;

            if (binBody && file && file.isCloud && !body.isStatic && !element.classList.contains('dragging') && !isImmune) {
                const dx = binBody.position.x - x;
                const dy = binBody.position.y - y;
                const distSq = dx * dx + dy * dy;
                const suctionRadiusSq = 150 * 150;

                if (distSq < suctionRadiusSq) {
                    const dist = Math.sqrt(distSq);
                    const forceMagnitude = (1 - dist / 150) * 0.005;
                    Matter.Body.applyForce(body, body.position, {
                        x: (dx / dist) * forceMagnitude,
                        y: (dy / dist) * forceMagnitude
                    });

                    // Overlap Detection -> Binning Sequence
                    if (dist < 40 && !element.dataset.binning) {
                        element.dataset.binning = "true";
                        startBinningSequence(element, body, file);
                    }
                }
            }

            // Apply gravity to the bin icon
            if (binBody && body === binBody && !body.isStatic) {
                Matter.Body.applyForce(body, body.position, {
                    x: 0,
                    y: 0.002 * body.mass // Gravity force
                });
            }

            // Subtract half width/height to center the element on the body
            element.style.left = `${x - 50}px`;
            element.style.top = `${y - 60}px`; // Icons are roughly 100x120
            element.style.transform = `rotate(${body.angle}rad) scale(${element.dataset.scale || 1})`;
        });

        // Update Virus-Man
        if (virusMan && virusManSpawned) {
            const now = performance.now();
            const dt = virusMan.lastTimestamp ? now - virusMan.lastTimestamp : 16.6;
            virusMan.lastTimestamp = now;
            virusMan.update(dt);
            virusMan.draw();
        }

        // Punch Effect
        if (virusMan && virusManSpawned && virusMan.isHitFrame) { 
            const punchRange = 100;
            const punchForce = 0.05;
            
            // 1. Hit regular icons
            iconPairs.forEach(({ body }) => {
                if (body === binBody) return;
                const dx = body.position.x - virusMan.body.position.x;
                const dy = body.position.y - virusMan.body.position.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < punchRange * punchRange) {
                    const dist = Math.sqrt(distSq);
                    Matter.Body.applyForce(body, body.position, {
                        x: (dx / dist) * punchForce,
                        y: (dy / dist) * punchForce
                    });
                }
            });

            // 2. Hit the Bin (The Combat!)
            if (binBody) {
                const dx = binBody.position.x - virusMan.body.position.x;
                const dy = binBody.position.y - virusMan.body.position.y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq < punchRange * punchRange) {
                    // Trigger Tumble Animation
                    binIsTumbling = true;
                    binFrameIndex = 1; // Start tumble sequence
                    
                    // Knockback the bin
                    const dist = Math.sqrt(distSq);
                    Matter.Body.applyForce(binBody, binBody.position, {
                        x: (dx / dist) * 0.35, // Pushes into the wall
                        y: -0.5 // Launches high
                    });

                    // Combat Logic: Release 3-5 files
                    const keys = Object.keys(binnedRegistry);
                    if (keys.length > 0) {
                        const count = Math.min(keys.length, Math.floor(Math.random() * 3) + 3); // 3 to 5
                        console.log(`[Bin Combat] IMPACT! Dumping ${count} files.`);
                        
                        // Shuffle or just pick first few random ones
                        const shuffled = keys.sort(() => 0.5 - Math.random());
                        const targets = shuffled.slice(0, count);
                        
                        targets.forEach(key => {
                            handleFileExplosion(binnedRegistry[key]);
                        });
                    }
                }
            }
        }

        // Update Bin Animation
        if (binIsTumbling && binSheet) {
            binTumbleTimer += dt;
            const fps = 24;
            const interval = 1000 / fps;
            if (binTumbleTimer >= interval) {
                binFrameIndex++;
                if (binFrameIndex >= binSheet.frameCount) {
                    binFrameIndex = 0; // Back to idle
                    binIsTumbling = false;
                }
                binTumbleTimer = 0;

                // Draw to canvas
                const canvas = binBody.element.querySelector('canvas');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, 64, 64);
                    binRenderer.drawFrame(ctx, binSheet, binFrameIndex, 0, 0, 64, 64);
                }
            }
        }
    });

    async function handleFileExplosion(file) {
        console.log(`[Bin Combat] EXPLOSION! Restoring ${file.name}`);
        
        // 1. Supabase Restoration
        try {
            await restoreMessage(file.id);
            delete binnedRegistry[file.id];
            
            // 2. Create Desktop Icon at Bin Position
            const cloudFile = {
                id: file.id,
                name: file.name,
                extension: file.data.filename.includes('.') ? file.data.filename.substring(file.data.filename.lastIndexOf('.')).toLowerCase() : '.txt',
                type: 'cloud_file',
                content: file.data.content,
                fromName: file.data.from_name,
                createdAt: file.data.created_at,
                isCloud: true
            };

            const icon = createIcon(cloudFile, binBody.position.x, binBody.position.y);
            icon.dataset.newlyRestored = "true"; // Flag to protect from clearing during refresh
            icon.dataset.binImmunityUntil = Date.now() + 3000; // 3 seconds of suction immunity
            iconGrid.appendChild(icon);

            // 3. High-Velocity Impulse (The Scatter)
            const angle = Math.random() * Math.PI * 2;
            const force = 15;
            Matter.Body.setVelocity(icon.body, {
                x: Math.cos(angle) * force,
                y: -10 - Math.random() * 10 // Guaranteed upward pop
            });

            // 4. Flash Effect on the Bin
            const element = binBody.element;
            element.style.filter = "brightness(3) contrast(1.5)";
            setTimeout(() => element.style.filter = "", 200);

        } catch (err) {
            console.error("Failed to restore file during explosion:", err);
        }
    }

    async function startBinningSequence(element, body, file) {
        // 1. Visual Feedack: Shrink animation
        let scale = 1;
        const shrinkInterval = setInterval(() => {
            scale -= 0.1;
            element.dataset.scale = scale;
            if (scale <= 0) {
                clearInterval(shrinkInterval);
                finishBinning(element, body, file);
            }
        }, 30);

        // 2. The Clink - Visual Feedback via CSS or Flash
        element.style.transition = "filter 0.2s";
        element.style.filter = "brightness(2) contrast(2)";
    }

    async function finishBinning(element, body, file) {
        // Remove from physics and DOM
        Composite.remove(engine.world, body);
        element.remove();
        const index = iconPairs.findIndex(p => p.element === element);
        if (index > -1) iconPairs.splice(index, 1);

        // Update Supabase
        try {
            await binMessage(file.id);
            console.log(`Binned: ${file.name}`);
            
            // Refresh local registry so we know it's there for combat
            await refreshBinnedRegistry();

            // If this icon was the wallpaper source, clear the global wallpaper
            const current = await getWallpaper();
            if (current && current.metadata && current.metadata.source_message_id === file.id) {
                console.log('[Wallpaper] Source icon binned — clearing global wallpaper');
                await clearWallpaper();
                // applyWallpaperToDesktop(null) will fire via the realtime subscription
            }
        } catch (err) {
            console.error("Failed to bin file:", err);
        }
    }

    window.addEventListener('resize', updateWalls);
    setTimeout(updateWalls, 0); // Initial walls setup

    // Close menu and deselect icons when clicking elsewhere
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.icon')) {
            document.querySelectorAll('.icon.selected').forEach(icon => icon.classList.remove('selected'));
        }
        if (!e.target.closest('.start-button') && !e.target.closest('#start-menu')) {
            startMenu.close();
        }
    });



    function createIcon(file, initialX, initialY) {
        console.log(`[DEBUG] Creating Icon: "${file.name}" | Ext: "${file.extension}" | isCloud: ${!!file.isCloud}`);
        const icon = document.createElement('div');
        icon.className = 'icon';
        icon.innerHTML = `
            ${file.isCloud ? '<div class="cloud-badge">CLOUD</div>' : ''}
            <div class="icon-image">${getIconSymbol(file)}</div>
            <div class="icon-label">${formatFileName(file.name)}</div>
        `;

        // Physics Body (25% smaller than the 100x120 visual size)
        const width = 75;
        const height = 90;

        // Use provided position or fallback to random
        const x = initialX !== undefined ? initialX : (Math.random() * (iconGrid.clientWidth - width) + width / 2);
        const y = initialY !== undefined ? initialY : (Math.random() * (iconGrid.clientHeight - height) + height / 2);

        const body = Bodies.rectangle(x, y, width, height, {
            frictionAir: 0.1,
            restitution: 0.3,
            inertia: Infinity, // Prevent rotation for icons
            collisionFilter: {
                category: ICON_CATEGORY,
                mask: WALL_CATEGORY | ICON_CATEGORY | VIRUS_MAN_CATEGORY // Don't collide with bin or windows
            }
        });

        // Actually, let's keep rotation but maybe slow it down
        body.friction = 0.1;
        body.element = icon; // Store reference for events

        Composite.add(engine.world, body);
        iconPairs.push({ element: icon, body, file });

        icon.body = body; // Store reference for events

        InputManager.attach(icon, {
            owner: 'desktop-icon',
            capture: false,
            onDown: (e) => {
                // Deselect others and select this one immediately
                document.querySelectorAll('.icon.selected').forEach(el => {
                    if (el !== icon) el.classList.remove('selected');
                });
                icon.classList.add('selected');
                return true;
            },
            onDoubleTap: (e) => {
                openFile(file);
            },
            onDragStart: () => {
                // If we're dragging an icon, lock the system
                InputManager.lock('desktop-icon');
            },
            onDragEnd: () => {
                InputManager.unlock('desktop-icon');
            }
        });

        return icon;
    }

    function encodePath(path) {
        return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    }

    async function openFile(file) {
        if (file.type === 'url') {
            window.open(file.url, '_blank');
            return;
        }

        if (file.type === 'video') {
            const content = `
                <div class="youtube-container">
                    <iframe class="youtube-iframe" src="https://www.youtube.com/embed/${file.videoId}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            `;
            const win = wm.createWindow(file.name, content);
            win.element.style.width = '640px';
            win.element.style.height = '400px';
            win.element.querySelector('.window-content').style.padding = '0';
            return;
        }

        // Chess app — has no path or cloud content, handle before the path guard
        if (file.type === 'chess') {
            return chess.open();
        }

        if (file.type === 'funk_maker') {
            return funkMaker.open();
        }

        if (file.type === 'settings') {
            return settings.open();
        }

        if (file.type === 'virus_man_exe') {
            const pair = iconPairs.find(p => p.file === file);
            if (pair) {
                const { element, body } = pair;
                const { x, y } = body.position;
                
                // 1. Hide/Remove icon
                Matter.Composite.remove(engine.world, body);
                element.remove();
                const index = iconPairs.indexOf(pair);
                if (index > -1) iconPairs.splice(index, 1);
                
                // 2. Spawn Virus Man
                spawnVirusManAt(x, y);
                
                // 3. System Alert
                const glitchStyle = `font-family: 'IBM VGA', monospace; font-size: 16px; white-space: nowrap; margin-bottom: 10px; display: block; filter: drop-shadow(2px 2px 0px rgba(255,0,0,0.5));`;
                const instructionStyle = `font-family: 'Inter', sans-serif; font-size: 12px; text-transform: lowercase; color: var(--color-orange); line-height: 1.4; display: block;`;
                
                wm.alert(
                    `<span style="${glitchStyle}">WARNGIN: sysJP'''''''$OVERRIDE0x999999{security_breach}</span>
                     <span style="${instructionStyle}">arrow keys, xz controls virus-man</span>`, 
                    "SYSTEM CRITICAL ERROR"
                );
            }
            return;
        }

        if (!file.path && !file.isCloud && file.type !== 'directory') {
            console.warn('File has no path and is not cloud/dir:', file);
            return;
        }

        const ext = (file.extension || '').toLowerCase();
        console.log(`[DEBUG] Opening File: "${file.name}" | Ext: "${ext}" | isCloud: ${file.isCloud}`);

        // 1. Directory handling (Sailor)
        if (file.type === 'directory' || (file.contents && Array.isArray(file.contents))) {
            console.log(`[DEBUG] -> Branch: Directory (Sailor)`);
            return sailor.openDirectory(file);
        }

        // 2. Image handling (Internal Viewer) — .draw cloud files are DataURL images
        if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.draw') {
            console.log(`[DEBUG] -> Branch: Image Viewer`);

            let imgSrc;
            if (file.isCloud) {
                imgSrc = stripStamp(file.content);
            } else {
                const encodedPath = encodePath(file.path);
                imgSrc = `./desktop/${encodedPath}`;
            }

            const fromInfo = file.fromName ? `From: ${file.fromName}` : `From: <i>A mysterious stranger</i>`;

            const content = `
                <div class="img-content" style="display: flex; flex-direction: column; height: 100%;">
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <img src="${imgSrc}" alt="${file.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                    </div>
                    <div class="editor-footer" style="padding: 10px 10px 5px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: flex-start; margin-top: 15px;">
                        <div style="font-family: var(--bios-font); font-size: 12px; color: var(--bios-text); opacity: 0.8;">
                            ${fromInfo}
                        </div>
                        <div style="font-family: var(--bios-font); font-size: 11px; color: var(--bios-text); opacity: 0.5; margin-top: 4px;">
                            ${formatDate(file.createdAt)}
                        </div>
                    </div>
                </div>
            `;
            wm.createWindow(file.name, content);
            return;
        }

        if (ext === '.loop' || ext === '.song') {
            console.log(`[DEBUG] -> Branch: Funk Maker (${ext})`);

            // 1. Fetch local content if needed
            if (!file.isCloud && file.path && !file.content) {
                try {
                    const encodedPath = encodePath(file.path);
                    const response = await fetch(`./desktop/${encodedPath}`);
                    if (response.ok) {
                        file.content = await response.text();
                    }
                } catch (error) {
                    console.error('Error fetching song content:', error);
                }
            }

            // 2. Parse song data
            let songData = null;
            if (file.content) {
                try {
                    songData = JSON.parse(stripStamp(file.content));
                } catch (e) {
                    console.error("Failed to parse song data:", e);
                }
            }
            return funkMaker.open(songData, { fromName: file.fromName });
        }

        // 4. Text / Cloud File fallback (TextEditor)
        if (ext === '.txt' || file.isCloud) {
            console.log(`[DEBUG] -> Branch: Text Editor`);
            // If it's a local text file, we might need to fetch the content first
            if (ext === '.txt' && !file.isCloud && !file.content) {
                try {
                    const encodedPath = encodePath(file.path);
                    const response = await fetch(`./desktop/${encodedPath}`);
                    if (response.ok) {
                        file.content = await response.text();
                    }
                } catch (error) {
                    console.error('Error fetching text content:', error);
                }
            }
            return textEditor.open(file);
        }

        // 5. Generic Fallback
        console.log(`[DEBUG] -> Branch: Generic Fallback`);
        const content = `
            <div style="padding: 20px;">
                <p>This is the content of <strong>${file.name}</strong>.</p>
                <p>Type: ${file.type || 'Unknown'}</p>
                <p>Path: ${file.path || 'Cloud'}</p>
                <hr/>
                <p>No associated app found for this file type.</p>
            </div>
        `;
        wm.createWindow(file.name, content);
    }

    // Global listener for Sailor to open files
    window.addEventListener('sailor-open-file', (e) => {
        openFile(e.detail);
    });

    async function createBinIcon(initialX, initialY) {
        const bin = document.createElement('div');
        bin.className = 'icon';
        bin.innerHTML = `
            <div class="icon-image"><canvas width="64" height="64"></canvas></div>
            <div class="icon-label">The Bin</div>
        `;

        // Preload tumble sheet
        const tumbleSheetUrl = new URL('./assets/virus-man/bin-tumble-sheet.png', import.meta.url).href;
        binSheet = await binRenderer.loadSheet(tumbleSheetUrl, 64);
        
        // Draw initial frame
        const canvas = bin.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        binRenderer.drawFrame(ctx, binSheet, 0, 0, 0, 64, 64);

        const width = 75;
        const height = 90;
        const x = initialX !== undefined ? initialX : (iconGrid.clientWidth - 80);
        // Start higher up if no initialY provided, so it falls on load
        const y = initialY !== undefined ? initialY : 100;

        binBody = Bodies.rectangle(x, y, width, height, {
            isStatic: false,
            isSensor: false,
            friction: 0.5,
            restitution: 0.8, // High bounciness for wall bounces
            inertia: Infinity, // Keep it upright
            collisionFilter: {
                category: BIN_CATEGORY,
                mask: WALL_CATEGORY | VIRUS_MAN_CATEGORY // Only collide with walls/floor and Virus-Man
            }
        });
        binBody.element = bin;

        Composite.add(engine.world, binBody);
        iconPairs.push({ element: bin, body: binBody });

        InputManager.attach(bin, {
            owner: 'desktop-icon',
            capture: false,
            onDown: (e) => {
                // Deselect others and select this one immediately
                document.querySelectorAll('.icon.selected').forEach(el => {
                    if (el !== bin) el.classList.remove('selected');
                });
                bin.classList.add('selected');
                return true;
            },
            onDoubleTap: (e) => {
                openBinWindow();
            },
            onDragStart: () => {
                InputManager.lock('desktop-icon');
            },
            onDragEnd: () => {
                InputManager.unlock('desktop-icon');
            }
        });

        iconGrid.appendChild(bin);
        return bin;
    }

    async function openBinWindow() {
        const binnedFiles = await getBinnedMessages();
        const grid = document.createElement('div');
        grid.className = 'window-icon-grid';

        if (binnedFiles.length === 0) {
            grid.innerHTML = '<p style="padding: 20px; opacity: 0.5;">The Bin is empty.</p>';
        } else {
            binnedFiles.forEach(msg => {
                const subIcon = document.createElement('div');
                subIcon.className = 'icon trashed-file';
                subIcon.innerHTML = `
                    <div class="icon-image">${getIconSymbol({ extension: '.txt' })}</div>
                    <div class="icon-label">${formatFileName(msg.filename)}</div>
                    ${isAdmin ? '<div class="admin-delete" style="color: red; font-size: 10px; cursor: pointer;">DELETE PERMANENTLY</div>' : ''}
                `;

                if (isAdmin) {
                    const deleteBtn = subIcon.querySelector('.admin-delete');
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`True Delete ${msg.filename}?`)) {
                            await deleteMessagePermanently(msg.id);
                            subIcon.remove();
                            if (grid.children.length === 0) grid.innerHTML = '<p style="padding: 20px; opacity: 0.5;">The Bin is empty.</p>';
                        }
                    });
                }

                subIcon.addEventListener('dblclick', async (e) => {
                    e.stopPropagation();

                    const confirmed = await wm.confirm(`Are you sure you want to restore ${msg.filename}? Someone probably binned it for a reason.`, {
                        title: 'Restore File',
                        confirmText: 'Restore',
                        cancelText: 'Nevermind'
                    });

                    if (!confirmed) return;

                    try {
                        subIcon.style.opacity = '0.5';
                        subIcon.style.pointerEvents = 'none';
                        await restoreMessage(msg.id);
                        subIcon.remove();
                        if (grid.children.length === 0) {
                            grid.innerHTML = '<p style="padding: 20px; opacity: 0.5;">The Bin is empty.</p>';
                        }
                        // Refresh the desktop to show the restored file
                        await loadGuestbookMessages(true);
                    } catch (error) {
                        console.error('Failed to restore message:', error);
                        subIcon.style.opacity = '1';
                        subIcon.style.pointerEvents = 'auto';
                        wm.alert('Failed to restore: ' + error.message, 'Error');
                    }
                });

                grid.appendChild(subIcon);
            });
        }

        wm.createWindow("The Bin", grid);
    }

    function getGridPosition(index) {
        const colWidth = 110;
        const rowHeight = 130;
        const paddingX = 20;
        const paddingY = 20;
        const cols = Math.max(1, Math.floor((iconGrid.clientWidth - paddingX * 2) / colWidth));

        const col = index % cols;
        const row = Math.floor(index / cols);

        return {
            x: paddingX + col * colWidth + 50,
            y: paddingY + row * rowHeight + 60
        };
    }

    // Start loading icons immediately in background
    const loadIcons = (async () => {
        try {
            const response = await fetch(`./desktop-manifest.json?t=${Date.now()}`);
            const files = await response.json();

            files.forEach((file, index) => {
                const pos = getGridPosition(index);
                iconGrid.appendChild(createIcon(file, pos.x, pos.y));
            });

            // Add The Bin to the desktop
            await createBinIcon();
            await refreshBinnedRegistry();

            // Add Burger Joint icon
            const burgerFile = {
                name: 'Burger Joint',
                type: 'url',
                url: 'http://burger-joint-chi.vercel.app'
            };
            const burgerPos = getGridPosition(iconPairs.length); // Place after binned icons and other files
            iconGrid.appendChild(createIcon(burgerFile, burgerPos.x, burgerPos.y));

            // Add Settings icon
            const settingsFile = {
                name: 'Settings',
                type: 'settings',
                extension: '.settings' // dummy extension for icon matching if needed
            };
            const settingsPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(settingsFile, settingsPos.x, settingsPos.y));

            // Add Working Draft icon
            const draftFile = {
                name: 'Yellow Deli article',
                type: 'url',
                url: 'https://workingdraftmagazine.com/the-people-of-the-yellow-deli/'
            };
            const draftPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(draftFile, draftPos.x, draftPos.y));

            // Add Classmate Profile icon
            const ytFile = {
                name: 'Classmate Profile',
                type: 'video',
                videoId: 'tTOXMh1kq68'
            };
            const ytPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(ytFile, ytPos.x, ytPos.y));

            // Add Meatballs icon
            const meatballsFile = {
                name: 'Meatballs',
                type: 'video',
                videoId: '_5UjgyFE7Rw'
            };
            const meatballsPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(meatballsFile, meatballsPos.x, meatballsPos.y));

            // Add Train Robbery icon
            const trainFile = {
                name: 'Train Robbery',
                type: 'video',
                videoId: 'lxh54-1y60A'
            };
            const trainPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(trainFile, trainPos.x, trainPos.y));

            // Add Chess icon
            const chessFile = {
                name: 'Chess VS Admin',
                type: 'chess'
            };
            const chessPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(chessFile, chessPos.x, chessPos.y));

            // Add Funk Maker 3000 icon
            const fmFile = {
                name: 'Funk Maker 3000',
                extension: '.loop',
                type: 'funk_maker'
            };
            const fmPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(fmFile, fmPos.x, fmPos.y));

            // Add Virus Man icon
            const virusManFile = {
                name: 'virus-man.exe',
                type: 'virus_man_exe',
                extension: '.exe'
            };
            const virusManPos = getGridPosition(iconPairs.length);
            iconGrid.appendChild(createIcon(virusManFile, virusManPos.x, virusManPos.y));
        } catch (error) {
            console.error('Failed to load desktop manifest:', error);
        }
    })();

    const loadGuestbookMessages = async (isRefresh = false) => {
        try {
            const messages = await getMessages();
            console.log(`[DEBUG] Loaded ${messages.length} messages from Cloud`);

            // If refreshing, we only want to add NEW messages
            // For now, let's keep it simple: if refresh, clear all cloud icons and reload
            if (isRefresh) {
                // Remove physics bodies and DOM elements for cloud icons
                // BUT SKIP icons that were just exploded and are in motion
                const cloudPairs = iconPairs.filter(p => 
                    p.element.querySelector('.cloud-badge') && 
                    !p.element.dataset.newlyRestored
                );
                cloudPairs.forEach(p => {
                    Composite.remove(engine.world, p.body);
                    p.element.remove();
                });
                // Update iconPairs array
                const remainingPairs = iconPairs.filter(p => 
                    !p.element.querySelector('.cloud-badge') || 
                    p.element.dataset.newlyRestored
                );
                iconPairs.length = 0;
                iconPairs.push(...remainingPairs);
            }

            messages.forEach((msg) => {
                // Skip if this icon was recently exploded and is already physical
                if (iconPairs.find(p => p.file && p.file.id === msg.id)) return;

                const filename = (msg.filename || 'message.txt').trim();
                let msgExt = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')).toLowerCase() : '.txt';

                // Content-based fallback: if it looks like a DataURL image, it's likely a .draw file
                const isImgContent = msg.content && (msg.content.startsWith('data:image/') || msg.content.startsWith(MEDIA_STAMP + 'data:image/'));
                if (isImgContent) {
                    if (msgExt !== '.draw' && msgExt !== '.png' && msgExt !== '.jpg' && msgExt !== '.jpeg') {
                        msgExt = '.draw';
                    }
                }

                console.log(`[DEBUG] Cloud File: "${filename}" | Detected Ext: "${msgExt}"`);

                const file = {
                    id: msg.id,
                    name: filename,
                    extension: msgExt,
                    type: 'cloud_file',
                    content: msg.content,
                    fromName: msg.from_name,
                    createdAt: msg.created_at,
                    isCloud: true
                };

                const pos = getGridPosition(iconPairs.length);
                iconGrid.appendChild(createIcon(file, pos.x, pos.y));
            });
        } catch (error) {
            console.warn('Failed to load guestbook messages:', error);
        }
    };

    // Staggered sequence
    // 1. BG is already visible (0 beats)

    // 2. Wait 2 beats then show taskbar
    await new Promise(r => setTimeout(r, beat * 2));
    taskbar.style.visibility = 'visible';
    hitCounter.init();

    // 3. Wait 1 beat then show icons
    await new Promise(r => setTimeout(r, beat * 1));
    await loadIcons; // Ensure icons are fetched before showing grid
    await loadGuestbookMessages(); // Fetch cloud messages
    iconGrid.style.visibility = 'visible';

    // Play startup chime
    const chime = new Audio('/chime.wav');
    chime.volume = 0.5;
    chime.play().catch(e => console.log('Startup chime blocked:', e));

    // --- Global Wallpaper: load current + subscribe to realtime changes ---
    try {
        const wallpaperRow = await getWallpaper();
        if (wallpaperRow && wallpaperRow.value) {
            applyWallpaperToDesktop(wallpaperRow.value);
            console.log('[Wallpaper] Loaded from Supabase');
        }
    } catch (err) {
        console.warn('[Wallpaper] Could not load wallpaper:', err);
    }

    // Subscribe so wallpaper changes / clears propagate live to all visitors
    subscribeToWallpaper(({ value }) => {
        console.log('[Wallpaper] Realtime update received');
        applyWallpaperToDesktop(value || null);
    });

    // Subscribe to cloud file changes (new songs, deletions, etc.)
    subscribeToMessages((payload) => {
        console.log('[Cloud Files] Change detected:', payload.eventType);
        loadGuestbookMessages(true);
    });

    // Show welcome alert
    wm.alert("Welcome to my website! Please take a look around. I don't have a guestbook, but you can right click the desktop and leave a note or draw a picture! It'll show up for everyone else! And if things get too cluttered, can you bin some old stuff? Thanks!");

    // Simple clock
    function updateClock() {
        const clock = document.querySelector('.clock');
        if (clock) {
            const now = new Date();
            clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    setInterval(updateClock, 1000);
    updateClock();
}

export function formatFileName(name) {
    if (!name) return '';
    const MAX_FILENAME_LENGTH = 64;
    let displayName = name;
    if (name.length > MAX_FILENAME_LENGTH) {
        displayName = name.substring(0, MAX_FILENAME_LENGTH - 3) + '...';
    }
    return displayName.replace(/([ \-._])/g, '$1<wbr>');
}

export function getSpriteHTML(className, frames = 3) {
    return `<div class="sprite ${className}" style="--frames: ${frames}"></div>`;
}

export function getIconSymbol(file) {
    if (file.name === 'Burger Joint') {
        return `<div class="sprite" style="background-image: url('${new URL('./assets/burger-joint.png', import.meta.url).href}'); --frames: 1;"></div>`;
    }
    if (file.name === 'Yellow Deli article') {
        return `<div class="sprite" style="background-image: url('${new URL('./assets/working-draft-icon.png', import.meta.url).href}'); --frames: 1;"></div>`;
    }
    if (file.type === 'chess') {
        return `<div class="sprite" style="background-image: url('${new URL('./assets/chess-icon.png', import.meta.url).href}'); --frames: 1;"></div>`;
    }
    if (file.type === 'settings') {
        return `<div class="sprite" style="background-image: url('${new URL('./assets/settings.png', import.meta.url).href}'); --frames: 1;"></div>`;
    }
    if (file.type === 'funk_maker') {
        return `<div class="sprite" style="background-image: url('${new URL('./assets/funk-maker-3000.png', import.meta.url).href}'); --frames: 1;"></div>`;
    }
    if (file.type === 'virus_man_exe') {
        return `<div class="sprite" style="background-image: url('${new URL('./assets/virus-man/icon.png', import.meta.url).href}'); --frames: 1;"></div>`;
    }
    if (file.type === 'video') {
        return `<div class="sprite" style="background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSI0IiB5PSIxMiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iI0ZGMDAwMCIgLz48cGF0aCBkPSJNMjYgMjJMIDQyIDMyTDI2IDQyVjIyWiIgZmlsbD0id2hpdGUiIC8+PC9zdmc+'); --frames: 1;"></div>`;
    }
    const ext = (file.extension || '').toLowerCase();
    if (file.type === 'directory' || file.contents) return getSpriteHTML('icon-folder');
    if (ext === '.pdf') return getSpriteHTML('icon-pdf');
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.draw') return getSpriteHTML('icon-img');
    if (ext === '.txt') return getSpriteHTML('icon-txt');
    if (ext === '.loop' || ext === '.song') return getSpriteHTML('icon-song');
    return getSpriteHTML('icon-file');
}
