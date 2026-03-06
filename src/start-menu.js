import menuConfig from './start-menu-config.json';

export class StartMenu {
    constructor(windowManager) {
        this.wm = windowManager;
        this.element = null;
        this.startButton = null;
        this.config = menuConfig;
    }

    render() {
        const menu = document.createElement('div');
        menu.id = 'start-menu';

        let itemsHtml = '';
        this.config.items.forEach(item => {
            let submenuHtml = '';
            if (item.submenu) {
                let contentHtml = '';
                item.submenu.content.forEach(node => {
                    if (node.type === 'paragraph') {
                        contentHtml += `<p>${node.text}</p>`;
                    } else if (node.type === 'image') {
                        const imgSrc = new URL(node.src, import.meta.url).href;
                        contentHtml += `<img src="${imgSrc}" class="${node.class || ''}" />`;
                    } else if (node.type === 'client-section') {
                        let instaHtml = '';
                        if (node.instagram) {
                            node.instagram.forEach(url => {
                                instaHtml += `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"></blockquote>`;
                            });
                        }
                        contentHtml += `
                            <div class="client-section">
                                <h3 class="client-title">${node.title}</h3>
                                <h4 class="client-subtitle">${node.subtitle}</h4>
                                <p class="client-copy">${node.copy}</p>
                                <div class="instagram-container">${instaHtml}</div>
                            </div>
                        `;
                    }
                });

                submenuHtml = `
                    <div class="submenu" id="${item.submenu.id}">
                        <div class="submenu-content">
                            <h2 class="submenu-header">${item.submenu.header}</h2>
                            ${contentHtml}
                        </div>
                    </div>
                `;
            }

            itemsHtml += `
                <div class="start-menu-item ${item.submenu ? 'has-submenu' : ''}" id="${item.id}">
                    <span>${item.label}</span>
                    ${item.submenu ? '<span class="menu-arrow">▶</span>' : ''}
                    ${submenuHtml}
                </div>
            `;
        });

        menu.innerHTML = `
        <div class="start-menu-content">
          <h1 class="start-menu-welcome">${this.config.welcome}</h1>
          <div class="start-menu-main">
            <div class="start-menu-left">
              <p class="start-menu-intro">${this.config.intro}</p>
              <p class="start-menu-info">${this.config.info}</p>
              <p class="start-menu-action">${this.config.action}</p>
            </div>
            <div class="start-menu-right">
                ${itemsHtml}
            </div>
          </div>
        </div>
        `;
        this.element = menu;
        return menu;
    }

    attach(startButton) {
        this.startButton = startButton;
        if (!this.element) this.render();

        // Start Menu Logic
        this.startButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = this.element.classList.toggle('visible');
            this.startButton.classList.toggle('active');

            if (isVisible && window.instgrm) {
                window.instgrm.Embeds.process();
            }
        });

        // Submenu Positioning Clamping
        this.setupSubmenuClamping();

        this.element.addEventListener('click', (e) => {
            const submenuItem = e.target.closest('.has-submenu');
            if (submenuItem) {
                // Toggle the submenu on click (for touch)
                const wasOpen = submenuItem.classList.contains('mobile-open');
                // Close others
                this.element.querySelectorAll('.has-submenu.mobile-open').forEach(el => el.classList.remove('mobile-open'));
                if (!wasOpen) submenuItem.classList.add('mobile-open');
            }
            e.stopPropagation();
        });

        // Load Instagram embed script if not already present
        if (!document.getElementById('instagram-embed-script')) {
            const script = document.createElement('script');
            script.id = 'instagram-embed-script';
            script.src = "//www.instagram.com/embed.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }

    setupSubmenuClamping() {
        const submenus = this.element.querySelectorAll('.has-submenu');
        submenus.forEach(item => {
            const submenu = item.querySelector('.submenu');
            if (!submenu) return;

            item.addEventListener('mouseenter', () => {
                // Determine the taskbar edge
                const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
                const taskbarHeight = 45;
                const buffer = 10;
                const bottomLimit = window.innerHeight - (taskbarHeight * scale) - (buffer * scale);

                // Reset position to measure
                submenu.style.top = '';

                // Set to block/hidden to measure size before it's visually shown by CSS :hover
                submenu.style.display = 'block';
                submenu.style.visibility = 'hidden';

                const rect = submenu.getBoundingClientRect();

                if (rect.bottom > bottomLimit) {
                    const diff = (rect.bottom - bottomLimit) / scale;
                    // Current CSS top is -48px. We subtract the difference to "climb" up.
                    submenu.style.top = `calc(-48px - ${diff}px)`;
                }

                // Restore display/visibility so CSS transitions/hovers take over
                submenu.style.display = '';
                submenu.style.visibility = '';
            });
        });
    }

    close() {
        if (this.startButton) this.startButton.classList.remove('active');
        if (this.element) this.element.classList.remove('visible');
        this.element.querySelectorAll('.has-submenu.mobile-open').forEach(el => el.classList.remove('mobile-open'));
    }
}
