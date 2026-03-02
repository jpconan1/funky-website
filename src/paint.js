import { saveMessage, MEDIA_STAMP } from './supabase.js';

export class Paint {
    constructor(windowManager, onSaveSuccess = null) {
        this.wm = windowManager;
        this.onSaveSuccess = onSaveSuccess;
    }

    open(file = null) {
        const content = document.createElement('div');
        content.className = 'paint-container';
        content.style.width = '100%';
        content.style.height = '100%';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';

        const isNew = !file || (!file.id && !file.path);

        // Header for New drawings (Save to Cloud UI)
        if (isNew) {
            const header = document.createElement('div');
            header.innerHTML = `
                <div class="editor-toolbar">
                    <input type="text" id="paint-file-name" placeholder="drawing.png" class="editor-filename-input" />
                    <button id="paint-save-btn" class="editor-save-btn">Save to Cloud</button>
                </div>
            `;
            content.appendChild(header);
        } else {
            // Read-only header
            const header = document.createElement('div');
            header.innerHTML = `
                <div class="editor-toolbar" style="justify-content: space-between;">
                    <div class="editor-filename-display" style="font-family: var(--bios-font); color: var(--bios-text);">${file.name}</div>
                    <div class="editor-status" style="opacity: 0.5;">Read Only View</div>
                </div>
            `;
            content.appendChild(header);
        }

        const iframe = document.createElement('iframe');
        // JS Paint supports hash-based loading: #load:DATA_URL
        iframe.src = `./apps/paint/index.html${file ? '#load:' + encodeURIComponent(file.url || '') : ''}`;
        iframe.style.flex = '1';
        iframe.style.border = 'none';
        iframe.style.backgroundColor = '#c0c0c0';

        content.appendChild(iframe);

        // Footer for Privacy Policy (matches other apps)
        if (isNew) {
            const footer = document.createElement('div');
            footer.className = 'editor-footer';
            footer.style.padding = '5px 10px';
            footer.innerHTML = `
                <div class="privacy-notice">
                    <input type="checkbox" id="paint-privacy-agreement" />
                    <label for="paint-privacy-agreement">Public Artwork: <a href="#" id="view-paint-privacy">Privacy Policy</a></label>
                </div>
                <div class="editor-status" id="paint-status">Ready</div>
            `;
            content.appendChild(footer);

            const privacyLink = footer.querySelector('#view-paint-privacy');
            privacyLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.wm.createWindow('Privacy Policy', `
                    <div class="privacy-policy-content">
                        <h2>Privacy Policy</h2>
                        <p>This website allows you to post public messages and pictures.</p>
                        <p><strong>What we collect:</strong> We collect the content of your message, the filename you provide, and the timestamp of your post.</p>
                        <p><strong>Visibility:</strong> Your message will be visible to ALL visitors of this website. Do not post sensitive or personal information.</p>
                        <p><strong>Removing your information:</strong> Eventually items go in the bin. If you need something removed urgently, email jeanpaulconan at gmail dot com.</p>
                    </div>
                `);
            });
        }

        const title = file ? `Viewing: ${file.name}` : 'JP Paint (New)';
        const win = this.wm.createWindow(title, content);
        win.element.style.width = '800px';
        win.element.style.height = '600px';

        // Setup the Bridge and Save Button
        if (isNew) {
            const saveBtn = content.querySelector('#paint-save-btn');
            const fileNameInput = content.querySelector('#paint-file-name');
            const privacyCheckbox = content.querySelector('#paint-privacy-agreement');
            const status = content.querySelector('#paint-status');

            saveBtn.addEventListener('click', async () => {
                if (!privacyCheckbox.checked) {
                    status.textContent = 'Please check the public box.';
                    status.style.color = '#ffaa00';
                    return;
                }

                status.textContent = 'Rendering...';

                try {
                    const childWindow = iframe.contentWindow;
                    if (!childWindow) throw new Error("Paint window not found.");

                    // We'll use a hidden canvas to force exact 256x256 output
                    // even if the user somehow bypassed the constraints
                    const exportCanvas = document.createElement('canvas');
                    exportCanvas.width = 256;
                    exportCanvas.height = 256;
                    const eCtx = exportCanvas.getContext('2d');

                    // Access the internal canvas of JS Paint
                    // It can be childWindow.main_canvas or we can find it in the DOM
                    const sourceCanvas = childWindow.main_canvas || childWindow.document.querySelector('.main-canvas');

                    if (!sourceCanvas) {
                        throw new Error("Could not find the drawing canvas.");
                    }

                    // Draw to our forced 256x256 canvas (centered/scaled or just cropped)
                    // The user wants to FORCE it, so we'll just draw the source directly.
                    // If they changed the size, this will at least ensure the DB gets 256x256.
                    eCtx.drawImage(sourceCanvas, 0, 0, 256, 256);

                    const dataUrl = exportCanvas.toDataURL('image/png');
                    const body = MEDIA_STAMP + dataUrl;

                    let fileName = fileNameInput.value.trim() || 'drawing.png';
                    if (!fileName.toLowerCase().endsWith('.png')) fileName += '.png';

                    status.textContent = 'Saving to Paper...';
                    await saveMessage(fileName, body);

                    status.textContent = 'Saved to Cloud!';
                    status.style.color = '#44ff44';

                    setTimeout(() => {
                        this.wm.closeWindow(win);
                        if (this.onSaveSuccess) this.onSaveSuccess();
                    }, 1500);

                } catch (error) {
                    console.error('Failed to save from Paint:', error);
                    status.textContent = 'Error: ' + error.message;
                    status.style.color = '#ff4444';
                }
            });
        }

        // JP-OS: Ensure the iframe gets focus when the window is clicked.
        // This is necessary because clicking the title bar or the toolbar 
        // would otherwise take focus away from the drawing app, 
        // preventing keyboard shortcuts like Ctrl+Z from working.
        win.element.addEventListener('pointerdown', (e) => {
            const isInput = e.target.closest('input') || e.target.closest('button');
            if (!isInput) {
                // Wait a tiny bit for the window manager's own focus logic to settle
                setTimeout(() => {
                    iframe.focus();
                }, 10);
            }
        });

        this.setupBridge(iframe, win, file);

        return win;
    }

    setupBridge(iframe, win, file) {
        const self = this;

        // Wait for iframe to load its initial window object
        iframe.addEventListener('load', () => {
            try {
                const childWindow = iframe.contentWindow;
                if (!childWindow) return;

                // Step 1: Persist JP-OS theme for all future loads via localStorage
                try {
                    childWindow.localStorage.setItem('jspaint theme', 'jp-os.css');
                    // Disable seasonal override so our theme sticks
                    childWindow.localStorage.setItem('jspaint disable seasonal theme', 'true');
                } catch (e) { /* cross-origin or private browsing - ignore */ }

                // Step 2: Apply the theme to the current session by polling for set_theme.
                // set_theme is exposed via window.api_for_cypress_tests after app init.
                const JP_OS_THEME = 'jp-os.css';
                let themeAttempts = 0;
                const applyTheme = () => {
                    try {
                        const api = childWindow.api_for_cypress_tests;
                        if (api && api.set_theme) {
                            api.set_theme(JP_OS_THEME);
                            return; // done
                        }
                    } catch (e) { /* ignore */ }
                    if (++themeAttempts < 30) { // try for up to ~3 seconds
                        setTimeout(applyTheme, 100);
                    }
                };
                setTimeout(applyTheme, 200); // slight delay for app to initialize

                // 3. Force 256x256 early and persistently
                const forceSize = () => {
                    if (childWindow.resize_canvas_and_save_dimensions) {
                        childWindow.resize_canvas_and_save_dimensions(256, 256);
                    } else if (childWindow.main_canvas) {
                        childWindow.main_canvas.width = 256;
                        childWindow.main_canvas.height = 256;
                    }
                };

                // Try now and also when the internal app says it's ready
                forceSize();
                setTimeout(forceSize, 500);
                setTimeout(forceSize, 2000); // Super-persistence check

                // Define the hooks
                childWindow.systemHooks = childWindow.systemHooks || {};

                // Intercept the Save dialog
                childWindow.systemHooks.showSaveFileDialog = async ({ formats, defaultFileName, getBlob, savedCallbackUnreliable }) => {
                    const fileNameInput = win.element.querySelector('#paint-file-name');
                    if (fileNameInput) {
                        // If we have our own UI, just click our own save button!
                        win.element.querySelector('#paint-save-btn').click();
                    } else {
                        // Fallback to the old prompt-based way if no UI exists
                        const fileName = await self.wm.prompt("Enter filename to save to Cloud:", defaultFileName || "artwork.png");
                        if (!fileName) return;
                        const blob = await getBlob("image/png");
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = async () => {
                            await saveMessage(fileName, MEDIA_STAMP + reader.result);
                            if (self.onSaveSuccess) self.onSaveSuccess();
                        };
                    }
                };

                // Optional: Override setWallpaper to do something cool in JP-OS
                childWindow.systemHooks.setWallpaperCentered = (canvas) => {
                    const dataUrl = canvas.toDataURL('image/png');
                    document.body.style.backgroundImage = `url(${dataUrl})`;
                    document.body.style.backgroundSize = 'cover';
                    document.body.style.backgroundPosition = 'center';
                    self.wm.alert("Wallpaper updated!", "System");
                };

            } catch (e) {
                console.error("Bridge setup failed (likely cross-origin or timing):", e);
            }
        });
    }

    openNewFile() {
        return this.open();
    }
}
