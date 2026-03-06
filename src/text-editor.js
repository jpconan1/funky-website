import { saveMessage, formatDate } from './supabase.js';

export class TextEditor {
    constructor(windowManager, onSaveSuccess = null) {
        this.wm = windowManager;
        this.onSaveSuccess = onSaveSuccess;
    }


    /**
     * Entry point for opening a text file.
     * Enforces the "Ink on Paper" rule: New files get the editor, existing files get the viewer.
     */
    open(file = null) {
        if (file && (file.id || file.path)) {
            return this.view(file);
        }
        return this.openNewFile();
    }

    /**
     * Opens a read-only viewer for existing text files.
     */
    view(file) {
        const content = document.createElement('div');
        content.className = 'text-viewer-container';

        const bodyContent = file.content || 'No content.';

        const fromInfo = file.fromName ? `From: ${file.fromName}` : `From: <i>A mysterious stranger</i>`;

        content.innerHTML = `
            <div class="editor-toolbar" style="justify-content: space-between;">
                <div class="editor-filename-display" style="font-family: var(--bios-font); color: var(--bios-text);">${file.name}</div>
                <div class="editor-status" style="opacity: 0.5;">Read Only</div>
            </div>
            <div class="viewer-content-area" style="flex: 1; overflow-y: auto;">${bodyContent}</div>
            <div class="editor-footer" style="padding: 10px 10px 5px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: flex-start;">
                <div style="font-family: var(--bios-font); font-size: 12px; color: var(--bios-text); opacity: 0.8;">
                    ${fromInfo}
                </div>
                <div style="font-family: var(--bios-font); font-size: 11px; color: var(--bios-text); opacity: 0.5; margin-top: 4px;">
                    ${formatDate(file.createdAt)}
                </div>
            </div>
        `;

        return this.wm.createWindow(`Viewing: ${file.name}`, content);
    }

    /**
     * Opens the Rich Text Editor for creating NEW messages.
     */
    openNewFile() {
        const content = document.createElement('div');
        content.className = 'text-editor-container';

        content.innerHTML = `
            <div class="editor-toolbar">
                <div class="editor-toolbar-group">
                    <button class="editor-btn" data-command="bold" title="Bold"><b>B</b></button>
                    <button class="editor-btn" data-command="italic" title="Italic"><i>I</i></button>
                    <button class="editor-btn" data-command="underline" title="Underline"><u>U</u></button>
                </div>
                <div class="editor-toolbar-group">
                    <select class="editor-select" data-command="fontName" title="Font">
                        <option value="'IBM VGA'">BIOS</option>
                        <option value="Inter">Modern</option>
                        <option value="'Times New Roman'">Classic</option>
                        <option value="'Brush Script MT'">Handwriting</option>
                    </select>
                    <select class="editor-select" data-command="fontSize" title="Size">
                        <option value="3">Normal</option>
                        <option value="1">Small</option>
                        <option value="5">Large</option>
                        <option value="7">Huge</option>
                    </select>
                </div>
                <input type="text" id="file-name" placeholder="untitled.txt" class="editor-filename-input" />
                <button id="save-btn" class="editor-save-btn">Save to Cloud</button>
            </div>
            <div id="editor-content" class="editor-content-area" contenteditable="true" placeholder="Type your message here..."></div>
            <div class="editor-footer">
                <div class="privacy-notice">
                    <input type="checkbox" id="privacy-agreement" />
                    <label for="privacy-agreement">Public Note: <a href="#" id="view-privacy">Privacy Policy</a></label>
                    <input type="text" id="from-name" placeholder="From: (optional)" class="editor-filename-input" style="margin-left: 10px; flex: 1; min-width: 0;" />
                </div>
                <div class="char-count-container">
                    <span id="char-count">0</span>/5000
                </div>
                <div class="editor-status" id="editor-status">Ready</div>
            </div>
        `;

        const win = this.wm.createWindow('New Text Note', content);
        const editor = content.querySelector('#editor-content');
        const saveBtn = content.querySelector('#save-btn');
        const fileNameInput = content.querySelector('#file-name');
        const fromNameInput = content.querySelector('#from-name');
        const status = content.querySelector('#editor-status');
        const privacyCheckbox = content.querySelector('#privacy-agreement');
        const viewPrivacyLink = content.querySelector('#view-privacy');

        // Focus the editor
        setTimeout(() => editor.focus(), 100);

        // Toolbar Logic
        const charCountDisplay = content.querySelector('#char-count');
        const MAX_CHARS = 5000;

        const updateCharCount = () => {
            const length = editor.innerText.trim().length;
            charCountDisplay.textContent = length;
            if (length > MAX_CHARS) {
                charCountDisplay.style.color = '#ff4444';
            } else if (length > MAX_CHARS * 0.9) {
                charCountDisplay.style.color = '#ffaa00';
            } else {
                charCountDisplay.style.color = 'inherit';
            }
        };

        editor.addEventListener('input', updateCharCount);

        content.querySelectorAll('.editor-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.dataset.command;
                document.execCommand(command, false, null);
                btn.classList.toggle('active');
                editor.focus();
            });
        });

        content.querySelectorAll('.editor-select').forEach(select => {
            select.addEventListener('change', () => {
                const command = select.dataset.command;
                document.execCommand(command, false, select.value);
                editor.focus();
            });
        });

        viewPrivacyLink.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const res = await fetch('./privacy-policy.txt');
                const text = await res.text();
                const lines = text.trim().split('\n').map(l => `<p>${l || '&nbsp;'}</p>`).join('');
                this.wm.createWindow('Privacy Policy', `<div class="privacy-policy-content">${lines}</div>`);
            } catch {
                this.wm.createWindow('Privacy Policy', '<div class="privacy-policy-content"><p>Could not load Privacy Policy.</p></div>');
            }
        });

        saveBtn.addEventListener('click', async () => {
            const fileName = fileNameInput.value.trim() || 'untitled.txt';
            const body = editor.innerHTML.trim();
            const textLength = editor.innerText.trim().length;

            if (textLength > MAX_CHARS) {
                status.textContent = `Note too long! (${textLength}/${MAX_CHARS})`;
                status.style.color = '#ff4444';
                return;
            }

            if (!privacyCheckbox.checked) {
                status.textContent = 'Please check the public note box.';
                status.style.color = '#ffaa00';
                return;
            }

            if (!body || body === '<br>') {
                status.textContent = 'Cannot save empty note.';
                status.style.color = '#ff4444';
                return;
            }

            status.textContent = 'Saving to Paper...';
            status.style.color = '#fff';

            const fromName = fromNameInput ? fromNameInput.value.trim() : '';

            try {
                await saveMessage(fileName, body, { fromName: fromName || undefined });
                status.textContent = 'Saved to Cloud!';
                status.style.color = '#44ff44';

                setTimeout(() => {
                    this.wm.closeWindow(win);
                    if (this.onSaveSuccess) this.onSaveSuccess();
                }, 1500);

            } catch (error) {
                console.error('Failed to save:', error);
                status.textContent = 'Error: ' + error.message;
                status.style.color = '#ff4444';
            }
        });

        return win;
    }
}
