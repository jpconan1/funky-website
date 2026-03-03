/**
 * Admin Authentication
 * Uses SHA-256 hashing via the Web Crypto API.
 * The hash stored here is the SHA-256 of the real password — never the plaintext.
 */

const ADMIN_HASH = '9a1436480def38271ff37d4066c37ea8fabab92a8648e9ef3fac40be861255ec';

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks sessionStorage for a cached admin session so the user
 * doesn't have to re-enter the password if they close/reopen a window.
 */
export function isAdminSession() {
    return sessionStorage.getItem('jp_admin_auth') === 'true';
}

function setAdminSession() {
    sessionStorage.setItem('jp_admin_auth', 'true');
}

/**
 * Shows a styled password prompt modal.
 * Resolves to true if correct password is entered, false if cancelled.
 */
export function promptAdminLogin() {
    return new Promise((resolve) => {
        // Inject styles if not already present
        if (!document.getElementById('admin-auth-styles')) {
            const style = document.createElement('style');
            style.id = 'admin-auth-styles';
            style.textContent = `
                #admin-auth-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 99999;
                    animation: adminFadeIn 0.15s ease;
                }
                @keyframes adminFadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                #admin-auth-dialog {
                    background: var(--color-bg, #1a1a2e);
                    border: 1px solid var(--color-border, #444);
                    border-radius: 6px;
                    padding: 28px 32px;
                    width: 300px;
                    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
                    font-family: var(--font-bios, monospace);
                    color: var(--color-text, #eee);
                    animation: adminSlideIn 0.2s cubic-bezier(.4,0,.2,1);
                }
                @keyframes adminSlideIn {
                    from { transform: translateY(-16px); opacity: 0; }
                    to   { transform: translateY(0);     opacity: 1; }
                }
                #admin-auth-dialog h2 {
                    margin: 0 0 6px 0;
                    font-size: 13px;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: var(--color-orange, #ff9900);
                }
                #admin-auth-dialog p {
                    margin: 0 0 16px 0;
                    font-size: 11px;
                    opacity: 0.6;
                }
                #admin-auth-input {
                    width: 100%;
                    box-sizing: border-box;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid var(--color-border, #444);
                    border-radius: 4px;
                    color: var(--color-text, #eee);
                    font-family: var(--font-bios, monospace);
                    font-size: 13px;
                    padding: 8px 10px;
                    outline: none;
                    transition: border-color 0.2s;
                    margin-bottom: 12px;
                }
                #admin-auth-input:focus {
                    border-color: var(--color-orange, #ff9900);
                }
                #admin-auth-input.shake {
                    animation: adminShake 0.35s ease;
                    border-color: #ff4444;
                }
                @keyframes adminShake {
                    0%,100% { transform: translateX(0); }
                    20%      { transform: translateX(-6px); }
                    40%      { transform: translateX(6px); }
                    60%      { transform: translateX(-4px); }
                    80%      { transform: translateX(4px); }
                }
                #admin-auth-error {
                    font-size: 10px;
                    color: #ff4444;
                    margin-bottom: 10px;
                    min-height: 14px;
                }
                .admin-auth-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }
                .admin-auth-btn {
                    font-family: var(--font-bios, monospace);
                    font-size: 11px;
                    padding: 6px 14px;
                    border-radius: 3px;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: background 0.15s, border-color 0.15s;
                    letter-spacing: 0.05em;
                }
                .admin-auth-btn.cancel {
                    background: transparent;
                    border-color: var(--color-border, #444);
                    color: var(--color-text, #eee);
                }
                .admin-auth-btn.cancel:hover {
                    border-color: #888;
                }
                .admin-auth-btn.confirm {
                    background: var(--color-orange, #ff9900);
                    border-color: var(--color-orange, #ff9900);
                    color: #111;
                    font-weight: bold;
                }
                .admin-auth-btn.confirm:hover {
                    filter: brightness(1.15);
                }
            `;
            document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.id = 'admin-auth-overlay';
        overlay.innerHTML = `
            <div id="admin-auth-dialog">
                <h2>⚙ Admin Access</h2>
                <p>Enter the admin password to continue.</p>
                <input id="admin-auth-input" type="password" placeholder="password" autocomplete="off" spellcheck="false" />
                <div id="admin-auth-error"></div>
                <div class="admin-auth-buttons">
                    <button class="admin-auth-btn cancel" id="admin-auth-cancel">Cancel</button>
                    <button class="admin-auth-btn confirm" id="admin-auth-submit">Unlock</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector('#admin-auth-input');
        const errorEl = overlay.querySelector('#admin-auth-error');
        const cancelBtn = overlay.querySelector('#admin-auth-cancel');
        const submitBtn = overlay.querySelector('#admin-auth-submit');

        input.focus();

        function cleanup(result) {
            overlay.remove();
            resolve(result);
        }

        async function attempt() {
            const entered = input.value;
            if (!entered) return;

            const hash = await sha256(entered);
            if (hash === ADMIN_HASH) {
                setAdminSession();
                cleanup(true);
            } else {
                errorEl.textContent = 'Incorrect password.';
                input.value = '';
                input.classList.remove('shake');
                // Trigger reflow to restart animation
                void input.offsetWidth;
                input.classList.add('shake');
                input.addEventListener('animationend', () => input.classList.remove('shake'), { once: true });
                input.focus();
            }
        }

        submitBtn.addEventListener('click', attempt);
        cancelBtn.addEventListener('click', () => cleanup(false));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attempt();
            if (e.key === 'Escape') cleanup(false);
        });

        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });
    });
}

/**
 * Convenience: returns true if already authed,
 * otherwise shows the prompt and returns the result.
 */
export async function requireAdmin() {
    if (isAdminSession()) return true;
    return await promptAdminLogin();
}
