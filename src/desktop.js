import { WindowManager } from './window-manager.js';

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
        './assets/bg-waves.mp4',
        './assets/blank-idle.png',
        './assets/close.png',
        './assets/file-boilsheet.png',
        './assets/img-boilsheet.png',
        './assets/img-idle.png',
        './assets/pdf-boilsheet.png',
        './assets/pdf-idle.png',
        './assets/txt-boilsheet.png',
        './assets/txt-idle.png',
        './assets/start-menu/start-box.png',
        './assets/start-menu/start-hovered.png',
        './assets/start-menu/start-idle.png',
        './assets/start-menu/start-selected.png'
    ];

    // Start preloading immediately
    const preloading = preloadAssets(assetsToPreload);

    const wm = new WindowManager();
    document.title = "Retro Desktop";

    // Wait for critical assets before starting sequence
    await preloading;

    // Transition to desktop
    app.innerHTML = `
    <div id="desktop">
      <video class="desktop-bg-video" autoplay muted loop playsinline style="opacity: 0; transition: opacity 1s ease-in">
        <source src="./assets/bg-waves.mp4" type="video/mp4">
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
                      <img src="./assets/start-menu/portrait.jpg" class="submenu-portrait" />
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

    // Close menu when clicking elsewhere
    document.addEventListener('click', () => {
        startButton.classList.remove('active');
        startMenu.classList.remove('visible');
    });

    // Start loading icons immediately in background
    const loadIcons = (async () => {
        try {
            const response = await fetch(`./desktop-manifest.json?t=${Date.now()}`);
            const files = await response.json();

            files.forEach(file => {
                const icon = document.createElement('div');
                icon.className = 'icon';
                icon.innerHTML = `
            <div class="icon-image">${getIconSymbol(file)}</div>
            <div class="icon-label">${file.name}</div>
          `;
                icon.addEventListener('click', async () => {
                    console.log(`Opening ${file.name}`);
                    const ext = (file.extension || '').toLowerCase();

                    if (ext === '.txt') {
                        try {
                            const response = await fetch(`./desktop/${encodeURIComponent(file.name)}`);
                            if (response.ok) {
                                const text = await response.text();
                                const content = `<div class="txt-content">${text}</div>`;
                                wm.createWindow(file.name, content);
                            } else {
                                wm.createWindow(file.name, `<p>Error loading file: ${file.name}</p>`);
                            }
                        } catch (error) {
                            console.error('Error opening text file:', error);
                            wm.createWindow(file.name, `<p>Error opening file: ${file.name}</p>`);
                        }
                    } else {
                        const content = `<p>This is the content of <strong>${file.name}</strong>.</p><p>Type: ${file.type}</p><p>Window manager is now active!</p>`;
                        wm.createWindow(file.name, content);
                    }
                });
                iconGrid.appendChild(icon);
            });
        } catch (error) {
            console.error('Failed to load desktop manifest:', error);
        }
    })();

    // Staggered sequence
    // 1. BG is already visible (0 beats)

    // 2. Wait 2 beats then show taskbar
    await new Promise(r => setTimeout(r, beat * 2));
    taskbar.style.visibility = 'visible';

    // 3. Wait 1 beat then show icons
    await new Promise(r => setTimeout(r, beat * 1));
    await loadIcons; // Ensure icons are fetched before showing grid
    iconGrid.style.visibility = 'visible';

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

function getSpriteHTML(className, frames = 3) {
    return `<div class="sprite ${className}" style="--frames: ${frames}"></div>`;
}

function getIconSymbol(file) {
    const ext = (file.extension || '').toLowerCase();

    if (ext === '.pdf') {
        return getSpriteHTML('icon-pdf');
    }
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        return getSpriteHTML('icon-img');
    }
    if (ext === '.txt') {
        return getSpriteHTML('icon-txt');
    }

    // Default or other types
    return getSpriteHTML('icon-file');
}

