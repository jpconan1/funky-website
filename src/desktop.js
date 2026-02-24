import Matter from 'matter-js';
import { WindowManager } from './window-manager.js';
import { initContextMenu } from './context-menu.js';
import { TextEditor } from './text-editor.js';
import { PixelArt } from './pixel-art.js';
import { getMessages, binMessage, getBinnedMessages, deleteMessagePermanently, restoreMessage } from './supabase.js';
import { Sailor } from './sailor.js';

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
        new URL('./assets/start-menu/start-box.png', import.meta.url).href,
        new URL('./assets/start-menu/start-hovered.png', import.meta.url).href,
        new URL('./assets/start-menu/start-idle.png', import.meta.url).href,
        new URL('./assets/start-menu/start-selected.png', import.meta.url).href,
        new URL('./assets/bin-icon.png', import.meta.url).href,
        new URL('./assets/start-menu/portrait.jpg', import.meta.url).href,
        new URL('./assets/burger-joint.png', import.meta.url).href,
        new URL('./assets/working-draft-icon.png', import.meta.url).href,
        '/chime.wav'
    ];

    // Start preloading immediately
    const preloading = preloadAssets(assetsToPreload);

    const wm = new WindowManager();
    const textEditor = new TextEditor(wm, () => loadGuestbookMessages(true));
    const pixelArt = new PixelArt(wm, () => loadGuestbookMessages(true));
    const sailor = new Sailor(wm);

    document.title = "Retro Desktop";

    // Wait for critical assets before starting sequence
    await preloading;

    // Transition to desktop
    app.innerHTML = `
    <div id="desktop">
      <video class="desktop-bg-video" autoplay muted loop playsinline style="opacity: 0; transition: opacity 1s ease-in">
        <source src="${new URL('./assets/bg-waves.mp4', import.meta.url).href}" type="video/mp4">
      </video>
      <div class="desktop-overlay"></div>
      <div id="icon-grid" style="visibility: hidden"></div>
      <div id="taskbar" style="visibility: hidden">
        <div class="start-button"></div>
        <div id="start-menu">
          <div class="start-menu-content">
            <h1 class="start-menu-welcome">Hi.</h1>
            <div class="start-menu-main">
              <div class="start-menu-left">
                <p class="start-menu-intro">I’m JP Conan, and this is my website.</p>
                <p class="start-menu-info">The files on the desktop are populated from a real folder on my computer, so you can see what I'm working on.</p>
                <p class="start-menu-action">If you right click and press "New text file..." you can leave me (and any other visitors) a note! Please say hello!</p>
              </div>
              <div class="start-menu-right">
                <div class="start-menu-item has-submenu" id="about-me-item">
                  <span>about me</span>
                  <span class="menu-arrow">▶</span>
                  <div class="submenu" id="about-submenu">
                    <div class="submenu-content">
                      <h2 class="submenu-header">What I Do</h2>
                      <p>I write, design, draw (badly), make videos, produce audio, make indie games, cook and sing to my dog. I'm a creative generalist.</p>
                      <p>During my 20s, I hiked across the US and traveled around my home country of Canada. I worked in kitchens, planted trees, and generally avoided growing up as long as possible. That got old, so now I’m back home, building a family and starting my career. I got married to the love of my life in December of 2025.</p>
                      <p>I graduated from Red River College’s Creative Communications program, also in 2025, specializing in Advertising.</p>
                      <p>I’m currently chasing down a new dream: Releasing a game on Steam. You can play an in-development version of my game Burger Joint right now - just click the icon on the desktop. and leave me some feedback, will you??</p>
                      <img src="${new URL('./assets/start-menu/portrait.jpg', import.meta.url).href}" class="submenu-portrait" />
                    </div>
                  </div>
                </div>
                <div class="start-menu-item has-submenu" id="client-work-item">
                  <span>client work</span>
                  <span class="menu-arrow">▶</span>
                  <div class="submenu" id="client-submenu">
                    <div class="submenu-content">
                      <h2 class="submenu-header">Client Work</h2>
                      
                      <div class="client-section">
                        <h3 class="client-title">The Gates on Roblin</h3>
                        <h4 class="client-subtitle">I work there as a Social Media Marketing Expert/dishwasher.</h4>
                        <p class="client-copy">I conceived, shot and edited these videos in between my reguler dishie duties. The Gates puts on gorgeous events all the time, but doesn't have an in-house marketing team to show off our hard work. Everything falls to the GM, and he's a busy man, so I pitched this funky dual role and we've been making videos since.</p>
                        <div class="instagram-container">
                          <blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/DPY2RwFESa8/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14"></blockquote>
                          <blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/DKp_LP2gCtz/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14"></blockquote>
                        </div>
                      </div>

                      <div class="client-section">
                        <h3 class="client-title">Geller's Design Build Landscape</h3>
                        <h4 class="client-subtitle">My CreComm work placement</h4>
                        <p class="client-copy">This is some of the work I did for Geller's during my last semester of school. I learned a lot there; I wrote SOPs, made videos and flew drones.</p>
                        <p class="client-copy">I'm most proud of a small detail. My manager asked me to create a logo build for Geller's, something better than the simple wipe they were using before. I'd never opened After Effects, but I knew that's where I needed to go. I taught myself the basics in an hour and made a concept that worked in the next.</p>
                        <p class="client-copy">You can see the logo build at the end of the power broom video and plenty of subsequent posts; they still use it to this day.</p>
                        <div class="instagram-container">
                          <blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/DIe4Dtuooj3/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14"></blockquote>
                          <blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/DI4huYnik7E/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14"></blockquote>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="clock"></div>
      </div>
    </div>
  `;

    const iconGrid = document.querySelector('#icon-grid');
    const taskbar = document.querySelector('#taskbar');
    const startButton = document.querySelector('.start-button');
    const startMenu = document.querySelector('#start-menu');
    const bgVideo = document.querySelector('.desktop-bg-video');
    const desktop = document.querySelector('#desktop');

    initContextMenu(desktop, {
        newTextFile: () => textEditor.openNewFile(),
        newPixelArt: () => pixelArt.openNewFile()
    });

    // Fade in background video immediately since it's preloaded
    if (bgVideo) bgVideo.style.opacity = '0.6';

    // Start Menu Logic
    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = startMenu.classList.toggle('visible');
        startButton.classList.toggle('active');

        if (isVisible && window.instgrm) {
            window.instgrm.Embeds.process();
        }
    });

    // Load Instagram embed script
    if (!document.getElementById('instagram-embed-script')) {
        const script = document.createElement('script');
        script.id = 'instagram-embed-script';
        script.src = "//www.instagram.com/embed.js";
        script.async = true;
        document.body.appendChild(script);
    }

    // Submenu Positioning Clamping
    const setupSubmenuClamping = () => {
        const submenus = document.querySelectorAll('.has-submenu');
        submenus.forEach(item => {
            const submenu = item.querySelector('.submenu');
            if (!submenu) return;

            item.addEventListener('mouseenter', () => {
                // Determine the taskbar edge
                const taskbarHeight = 45;
                const buffer = 10;
                const bottomLimit = window.innerHeight - taskbarHeight - buffer;

                // Reset position to measure
                submenu.style.top = '';

                // Set to block/hidden to measure size before it's visually shown by CSS :hover
                submenu.style.display = 'block';
                submenu.style.visibility = 'hidden';

                const rect = submenu.getBoundingClientRect();

                if (rect.bottom > bottomLimit) {
                    const diff = rect.bottom - bottomLimit;
                    // Current CSS top is -48px. We subtract the difference to "climb" up.
                    submenu.style.top = `calc(-48px - ${diff}px)`;
                }

                // Restore display/visibility so CSS transitions/hovers take over
                submenu.style.display = '';
                submenu.style.visibility = '';
            });
        });
    };

    setupSubmenuClamping();

    startMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Physics Engine Setup
    const Engine = Matter.Engine,
        Bodies = Matter.Bodies,
        Composite = Matter.Composite,
        Mouse = Matter.Mouse,
        MouseConstraint = Matter.MouseConstraint,
        Events = Matter.Events,
        Runner = Matter.Runner;

    const engine = Engine.create();
    engine.gravity.y = 0; // Keep global gravity 0, we'll apply it selectively
    engine.gravity.x = 0;

    // Collision Categories
    const WALL_CATEGORY = 0x0001;
    const ICON_CATEGORY = 0x0002;
    const BIN_CATEGORY = 0x0004;

    const runner = Runner.create();
    Runner.run(runner, engine);

    const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

    const iconPairs = [];
    const walls = [];

    // "The Bin" Physics Body & State
    let binBody = null;
    let isBinning = false;

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

    // Sync physics bodies with DOM elements
    Events.on(engine, 'afterUpdate', () => {
        const width = iconGrid.clientWidth;
        const height = iconGrid.clientHeight;
        const margin = 200;

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
            if (binBody && file && file.isCloud && !body.isStatic && !element.classList.contains('dragging')) {
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
    });

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
        } catch (err) {
            console.error("Failed to bin file:", err);
        }
    }

    window.addEventListener('resize', updateWalls);
    setTimeout(updateWalls, 0); // Initial walls setup

    // Close menu and deselect icons when clicking elsewhere
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.icon')) {
            document.querySelectorAll('.icon.selected').forEach(icon => icon.classList.remove('selected'));
        }
        if (!e.target.closest('.start-button') && !e.target.closest('#start-menu')) {
            startButton.classList.remove('active');
            startMenu.classList.remove('visible');
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

        // Physics Body
        const width = 100;
        const height = 120;

        // Use provided position or fallback to random
        const x = initialX !== undefined ? initialX : (Math.random() * (iconGrid.clientWidth - width) + width / 2);
        const y = initialY !== undefined ? initialY : (Math.random() * (iconGrid.clientHeight - height) + height / 2);

        const body = Bodies.rectangle(x, y, width, height, {
            frictionAir: 0.1,
            restitution: 0.3,
            inertia: Infinity, // Prevent rotation for icons
            collisionFilter: {
                category: ICON_CATEGORY,
                mask: WALL_CATEGORY | ICON_CATEGORY // Don't collide with bin so they can be binned
            }
        });

        // Actually, let's keep rotation but maybe slow it down
        body.friction = 0.1;
        body.element = icon; // Store reference for events

        Composite.add(engine.world, body);
        iconPairs.push({ element: icon, body, file });

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            // Deselect others
            document.querySelectorAll('.icon.selected').forEach(el => {
                if (el !== icon) el.classList.remove('selected');
            });
            icon.classList.add('selected');
        });

        icon.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            openFile(file);
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

        // 2. Pixel Art handling
        if (ext === '.draw') {
            console.log(`[DEBUG] -> Branch: Pixel Art`);
            return pixelArt.open(file);
        }

        // 3. Image handling (Internal Viewer)
        if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
            console.log(`[DEBUG] -> Branch: Image Viewer`);
            const encodedPath = encodePath(file.path);
            const content = `
                <div class="img-content">
                    <img src="./desktop/${encodedPath}" alt="${file.name}" />
                </div>
            `;
            wm.createWindow(file.name, content);
            return;
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

        if (ext === '.loop') {
            // return synthApp.open(file);
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

    function createBinIcon(initialX, initialY) {
        const bin = document.createElement('div');
        bin.className = 'icon';
        bin.innerHTML = `
            <div class="icon-image"><div class="sprite icon-bin" style="--frames: 1"></div></div>
            <div class="icon-label">The Bin</div>
        `;

        const width = 100;
        const height = 120;
        const x = initialX !== undefined ? initialX : (iconGrid.clientWidth - 80);
        // Start higher up if no initialY provided, so it falls on load
        const y = initialY !== undefined ? initialY : 100;

        binBody = Bodies.rectangle(x, y, width, height, {
            isStatic: false,
            isSensor: false,
            friction: 0.5,
            restitution: 0.4,
            inertia: Infinity, // Keep it upright
            collisionFilter: {
                category: BIN_CATEGORY,
                mask: WALL_CATEGORY // Only collide with walls/floor
            }
        });
        binBody.element = bin;

        Composite.add(engine.world, binBody);
        iconPairs.push({ element: bin, body: binBody });

        bin.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            openBinWindow();
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
            createBinIcon();

            // Add Burger Joint icon
            const burgerFile = {
                name: 'Burger Joint',
                type: 'url',
                url: 'http://burger-joint-chi.vercel.app'
            };
            const burgerPos = getGridPosition(iconPairs.length); // Place after binned icons and other files
            iconGrid.appendChild(createIcon(burgerFile, burgerPos.x, burgerPos.y));

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
                const cloudPairs = iconPairs.filter(p => p.element.querySelector('.cloud-badge'));
                cloudPairs.forEach(p => {
                    Composite.remove(engine.world, p.body);
                    p.element.remove();
                });
                // Update iconPairs array
                const remainingPairs = iconPairs.filter(p => !p.element.querySelector('.cloud-badge'));
                iconPairs.length = 0;
                iconPairs.push(...remainingPairs);
            }

            messages.forEach((msg) => {
                const filename = (msg.filename || 'message.txt').trim();
                let msgExt = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')).toLowerCase() : '.txt';

                // Content-based fallback: if it looks like a DataURL image, it's likely a .draw file
                if (msg.content && msg.content.startsWith('data:image/')) {
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

    // 3. Wait 1 beat then show icons
    await new Promise(r => setTimeout(r, beat * 1));
    await loadIcons; // Ensure icons are fetched before showing grid
    await loadGuestbookMessages(); // Fetch cloud messages
    iconGrid.style.visibility = 'visible';

    // Play startup chime
    const chime = new Audio('/chime.wav');
    chime.play().catch(e => console.log('Startup chime blocked:', e));

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
    if (file.type === 'video') {
        return `<div class="sprite" style="background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSI0IiB5PSIxMiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iI0ZGMDAwMCIgLz48cGF0aCBkPSJNMjYgMjJMIDQyIDMyTDI2IDQyVjIyWiIgZmlsbD0id2hpdGUiIC8+PC9zdmc+'); --frames: 1;"></div>`;
    }
    const ext = (file.extension || '').toLowerCase();
    if (file.type === 'directory' || file.contents) return getSpriteHTML('icon-folder');
    if (ext === '.pdf') return getSpriteHTML('icon-pdf');
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.draw') return getSpriteHTML('icon-img');
    if (ext === '.txt') return getSpriteHTML('icon-txt');
    return getSpriteHTML('icon-file');
}
