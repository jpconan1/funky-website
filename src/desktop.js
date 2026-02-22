export async function initDesktop() {
    const app = document.querySelector('#app');

    // Transition to desktop
    app.innerHTML = `
    <div id="desktop">
      <div id="icon-grid"></div>
      <div id="taskbar">
        <div class="start-button">START</div>
        <div class="clock"></div>
      </div>
    </div>
  `;

    document.title = "Retro Desktop";

    const iconGrid = document.querySelector('#icon-grid');

    try {
        const response = await fetch(`./desktop-manifest.json?t=${Date.now()}`);
        const files = await response.json();

        files.forEach(file => {
            const icon = document.createElement('div');
            icon.className = 'icon';
            icon.innerHTML = `
        <div class="icon-image">${getIconSymbol(file.type)}</div>
        <div class="icon-label">${file.name}</div>
      `;
            icon.addEventListener('dblclick', () => {
                console.log(`Opening ${file.name}`);
                alert(`Opening ${file.name} (File viewer coming soon!)`);
            });
            iconGrid.appendChild(icon);
        });
    } catch (error) {
        console.error('Failed to load desktop manifest:', error);
    }

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

function getIconSymbol(type) {
    switch (type) {
        case 'text': return '📄';
        case 'image': return '🖼️';
        case 'document': return '📕';
        case 'app': return '⚙️';
        default: return '📁';
    }
}
