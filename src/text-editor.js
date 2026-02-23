import { saveMessage } from './supabase.js';

export class TextEditor {
    constructor(windowManager, onSaveSuccess = null) {
        this.wm = windowManager;
        this.onSaveSuccess = onSaveSuccess;
    }

    openNewFile() {
        const content = document.createElement('div');
        content.className = 'text-editor-container';
        content.innerHTML = `
            <div class="editor-toolbar">
                <input type="text" id="file-name" placeholder="untitled.txt" class="editor-filename-input" />
                <button id="save-btn" class="editor-save-btn">Save to Cloud</button>
            </div>
            <textarea id="editor-textarea" placeholder="Type your message here..."></textarea>
            <div class="editor-footer">
                <div class="privacy-notice">
                    <input type="checkbox" id="privacy-agreement" />
                    <label for="privacy-agreement">I agree to the <a href="#" id="view-privacy">Privacy Policy</a> (messages are public)</label>
                </div>
                <div class="editor-status" id="editor-status">Ready</div>
            </div>
        `;

        const win = this.wm.createWindow('New Text File', content);

        const saveBtn = content.querySelector('#save-btn');
        const textarea = content.querySelector('#editor-textarea');
        const fileNameInput = content.querySelector('#file-name');
        const status = content.querySelector('#editor-status');
        const privacyCheckbox = content.querySelector('#privacy-agreement');
        const viewPrivacyLink = content.querySelector('#view-privacy');

        viewPrivacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.wm.createWindow('Privacy Policy', `
                <div class="privacy-policy-content">
                    <h2>Privacy Policy</h2>
                    <p>This guestbook allows you to post public messages.</p>
                    <p><strong>What we collect:</strong> We collect the content of your message, the filename you provide, and the timestamp of your post.</p>
                    <p><strong>Visibility:</strong> Your message will be visible to ALL visitors of this website. Do not post sensitive or personal information.</p>
                    <p><strong>Moderation:</strong> I reserve the right to remove any content that is offensive, illegal, or otherwise inappropriate.</p>
                </div>
            `);
        });

        saveBtn.addEventListener('click', async () => {
            const fileName = fileNameInput.value.trim() || 'untitled.txt';
            const body = textarea.value.trim();

            if (!privacyCheckbox.checked) {
                status.textContent = 'Please agree to the privacy policy.';
                status.style.color = '#ffaa00';
                return;
            }

            if (!body) {
                status.textContent = 'Cannot save empty file.';
                status.style.color = '#ff4444';
                return;
            }

            status.textContent = 'Saving to Cloud...';
            status.style.color = '#fff';

            try {
                await saveMessage(fileName, body);
                status.textContent = 'Saved successfully!';
                status.style.color = '#44ff44';

                // Clear the editor after a delay or close the window?
                // Let's just celebrate for a second.
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
    }
}
