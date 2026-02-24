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
        <div class="context-menu-item" id="menu-new-pixel-art">
            <span class="menu-icon">🎨</span>
            <span>New pixel art...</span>
        </div>
    `;

    document.body.appendChild(menu);

    desktopElement.addEventListener('contextmenu', (e) => {
        // Prevent default only if clicking on desktop or icon-grid
        if (e.target.id === 'desktop' || e.target.id === 'icon-grid' || e.target.classList.contains('desktop-overlay')) {
            e.preventDefault();

            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;

            // Adjust if out of bounds
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = `${window.innerWidth - rect.width - 5}px`;
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = `${window.innerHeight - rect.height - 5}px`;
            }
        } else {
            menu.style.display = 'none';
        }
    });

    document.addEventListener('click', () => {
        menu.style.display = 'none';
    });

    menu.querySelector('#menu-new-file').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        if (actions.newTextFile) actions.newTextFile();
    });

    menu.querySelector('#menu-new-pixel-art').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        if (actions.newPixelArt) actions.newPixelArt();
    });
}
