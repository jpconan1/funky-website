import { InputManager } from './input-manager.js';

export function initContextMenu(desktopElement, actions) {
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.className = 'glassmorphism';
    menu.style.display = 'none';
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999';
    menu.innerHTML = `
        <div class="context-menu-item" id="menu-new-file">
            <span class="menu-icon">📄</span>
            <span>New text file...</span>
        </div>
        <div class="context-menu-item" id="menu-new-paint">
            <span class="menu-icon">🖌️</span>
            <span>New drawing (Paint)...</span>
        </div>

        <div class="context-menu-item" id="menu-new-synth">
            <span class="menu-icon">🎹</span>
            <span>New song (broken)</span>
        </div>
    `;

    document.body.appendChild(menu);
    desktopElement.addEventListener('contextmenu', (e) => {
        // Prevent default only if clicking on desktop or icon-grid
        if (e.target.id === 'desktop' || e.target.id === 'icon-grid' || e.target.classList.contains('desktop-overlay')) {
            e.preventDefault();
            showMenu(e.clientX, e.clientY);
        } else {
            menu.style.display = 'none';
        }
    });

    // Mobile Hold support
    InputManager.attach(desktopElement, {
        onHold: (e) => {
            // Only trigger if we're clicking the desktop itself, not a child icon
            if (e.target.id === 'desktop' || e.target.id === 'icon-grid' || e.target.classList.contains('desktop-overlay')) {
                showMenu(e.clientX, e.clientY);
            }
        }
    });

    function showMenu(x, y) {
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        // Adjust if out of bounds
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 5}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 5}px`;
        }
    }

    document.addEventListener('click', () => {
        menu.style.display = 'none';
    });

    menu.querySelector('#menu-new-file').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        if (actions.newTextFile) actions.newTextFile();
    });

    menu.querySelector('#menu-new-paint').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        if (actions.newPaint) actions.newPaint();
    });

    menu.querySelector('#menu-new-synth').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        if (actions.newSynth) actions.newSynth();
    });
}
