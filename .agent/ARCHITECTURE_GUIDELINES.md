# JP-OS Architecture Guidelines

These guidelines are mandatory for any agent or developer contributing to the JP-OS codebase. They ensure that all work remains compatible with the future transition to **MyOSHomepage**, a multi-tenant Virtual Desktop Environment (VDE).

## 1. Avoid Global/Static Hardcoding
All application state should be passed as data or managed in a way that can be serialized/deserialized. 

*   **Rule:** Apps (like Chess, Paint, etc.) should not store game/user state in global variables.
*   **Implementation:** Use a `saveState()` and `loadState()` pattern. These methods should eventually interface with `supabase.js` or a central state manager.
*   **Why:** When moving to multi-tenancy, multiple users will have different states for the same app.

## 2. Asset Path Abstraction
Never use absolute paths targeting local files if they are meant to be user-customizable.

*   **Rule:** Reference assets (wallpapers, icons, sounds) via an ID or relative path from a `base_url`.
*   **Implementation:** `const wallpaperUrl = `${USER_CDN}/${userId}/wallpaper.png`;`
*   **Why:** User-specific assets will eventually be served from a CDN/Signed URL, not from the local `/public` directory.

## 3. The "Settings-First" Pattern
Features should look for a configuration object before applying a default value.

*   **Rule:** If you add a feature (e.g., a "dark mode" or a "Start Menu icon"), it must be driven by a `userConfig` JSON object.
*   **Implementation:** 
    ```javascript
    const startMenuIcon = userConfig.startIcon || '/default-start.png';
    ```
*   **Why:** This makes the entire UI "themeable" and "data-driven," which is required for per-user customization.

## 4. Mobile-First Interaction
Every single UI element must work on touch devices.

*   **Rule:** Do not rely solely on `hover` or `contextmenu` (right-click) events. 
*   **Implementation:** 
    *   Use a unified InputManager (already partially implemented).
    *   Simulate right-clicks with "Long Press" (press and hold for > 500ms).
    *   Scale targets for touch (all buttons should be at least 44x44px or have a large hit-box).
*   **Why:** Mobile is a first-class citizen for MyOSHomepage.

## 5. Sandboxed App Communication
Treat apps as modular "black boxes."

*   **Rule:** Apps should communicate with the "Host OS" via a standard API (like `window.postMessage`) rather than direct DOM manipulation of the parent.
*   **Implementation:** An app should ask the OS `window.parent.postMessage({ type: 'FS_SAVE', data: ... })` instead of importing `supabase.js` directly.
*   **Why:** Future third-party apps will run in `<iframe sandbox>`, and direct imports will be blocked for security.

## 6. Multi-Tenant Check: The "user_id" Test
Before finalizing any new feature, ask: "If 100 people were using this site at the same time, would this feature leak data or break for others?"

*   **Check:** Does this affect a global file on the server (BAD) or a row in a database table tied to a user ID (GOOD)?

---

### File References
*   **Root Config:** `src/boot-config.json` (The blueprint for data-driven boot).
*   **Subspace API:** `src/supabase.js` (The storage bridge).
*   **Desktop Engine:** `src/desktop.js` (The orchestrator).
