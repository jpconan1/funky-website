import { UI } from './ui-components.js';

export class Settings {
    constructor(windowManager) {
        this.wm = windowManager;
    }

    open() {
        const content = document.createElement('div');
        content.className = 'settings-app';
        content.style.padding = '5px'; // Reduced padding as window-content has 15px

        // --- Display Settings ---
        content.appendChild(UI.createSection('Display Settings'));

        // CRT Filter Toggle
        const isCrtOff = document.body.classList.contains('crt-off');
        const crtToggle = UI.createCheckbox('Enable CRT Scanline Filter', !isCrtOff, (enabled) => {
            if (enabled) {
                document.body.classList.remove('crt-off');
            } else {
                document.body.classList.add('crt-off');
            }
        });
        content.appendChild(crtToggle);

        // UI Scaling
        const currentScale = localStorage.getItem('ui-scale') || '1';
        const scaleGroup = UI.createRadioGroup('UI Scale (Better for Mobile)', [
            { label: '1x (Default)', value: '1' },
            { label: '1.5x (Large)', value: '1.5' },
            { label: '2x (Enormous)', value: '2' }
        ], 'ui-scale', currentScale, (val) => {
            document.documentElement.style.setProperty('--ui-scale', val);
            localStorage.setItem('ui-scale', val);
            window.dispatchEvent(new CustomEvent('ui-scale-changed', { detail: parseFloat(val) }));
        });
        content.appendChild(scaleGroup);

        // --- Dummy Settings ---
        content.appendChild(UI.createSection('Dummy Settings'));

        // 1. Dropdown
        const dropdown = UI.createDropdown('System Theme', [
            { label: 'Retro Emerald', value: 'emerald', selected: true },
            { label: 'Cyber Sunset', value: 'sunset' },
            { label: 'Midnight Blue', value: 'blue' }
        ], (val) => console.log('Theme changed to:', val));

        // 2. Slider
        const slider = UI.createSlider('Display Brightness', 0, 100, 75, (val) => {
            console.log('Brightness set to:', val);
        });

        // 3. Checkbox
        const checkbox = UI.createCheckbox('Enable Sound Effects', true, (checked) => {
            console.log('Sound effects:', checked);
        });

        // 4. Radio Group
        const radioGroup = UI.createRadioGroup('Screen Resolution', [
            { label: '640 x 480', value: '640x480' },
            { label: '800 x 600', value: '800x600' },
            { label: '1024 x 768', value: '1024x768' }
        ], 'resolution', '800x600', (val) => console.log('Resolution set to:', val));

        // 5. Text Field
        const textField = UI.createTextField('Wallpaper Name', 'Default Waves', 'Enter wallpaper name...', (val) => {
            console.log('Wallpaper name changed to:', val);
        });

        // 6. Button
        const button = UI.createButton('Apply Changes', () => {
            this.wm.alert('Settings applied successfully!', 'System Message');
        });

        // Add some filler text to demonstrate scrolling
        const filler = document.createElement('div');
        filler.style.marginTop = '40px';
        filler.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        filler.style.paddingTop = '10px';
        filler.innerHTML = `<p style="opacity: 0.5; font-size: 0.8rem; font-family: var(--desktop-font);">JP-OS Settings v1.0.0<br>This menu allows you to configure various aspects of your retro desktop experience. Scroll down to see more options (not really, this is just a demo).</p>`;

        // Add more fields to force scroll
        const checkbox2 = UI.createCheckbox('Performance Mode', false, (checked) => {
            console.log('Performance mode:', checked);
        });

        content.appendChild(dropdown);
        content.appendChild(slider);
        content.appendChild(checkbox);
        content.appendChild(radioGroup);
        content.appendChild(textField);
        content.appendChild(checkbox2);
        content.appendChild(button);
        content.appendChild(filler);

        // Add even more content to ensure scrolling
        for (let i = 0; i < 5; i++) {
            const extra = document.createElement('p');
            extra.textContent = `Extra setting info line ${i + 1}...`;
            extra.style.opacity = '0.3';
            extra.style.fontSize = '0.7rem';
            content.appendChild(extra);
        }

        const win = this.wm.createWindow('System Settings', content);
        win.element.style.width = '450px';
        win.element.style.height = '500px';

        return win;
    }
}
