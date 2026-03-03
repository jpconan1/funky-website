# JP-OS Database Schema Reference

This project uses **Supabase** (PostgreSQL). Connection is via `@supabase/supabase-js`, configured in `src/supabase.js`.

The Supabase URL and anon key live in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## Table: `messages`

The main public content table. Stores notes, drawings, and other user-created files.

| Column       | Type        | Description                                                               |
|--------------|-------------|---------------------------------------------------------------------------|
| `id`         | uuid / int  | Primary key                                                               |
| `filename`   | text        | User-supplied filename (e.g. `hello.txt`, `drawing.png`)                  |
| `content`    | text        | File body. Text notes: HTML. Images: `JP-OS-MEDIA-STAMP:` + base64 PNG   |
| `from_name`  | text        | Optional "From:" attribution. Defaults to null. Max 100 chars.            |
| `is_binned`  | boolean     | True when the file has been dragged to The Bin. Defaults false/null.      |
| `bin_count`  | int         | How many times binned (used by RPC `bin_message`)                         |
| `created_at` | timestamptz | Auto-set on insert                                                        |

### Key rules
- Files with `content` length > 5000 chars **must** be prefixed with `JP-OS-MEDIA-STAMP:` (enforced in `saveMessage()`).
- `.draw` extension files must contain image data.
- Max sizes: text ~5 000 chars, images ~1 MB, `.loop` files ~50 000 chars.
- `from_name` is sanitized with DOMPurify and capped at 100 chars; omitted from the INSERT if blank.

### RPCs used
| RPC name           | Description                                          |
|--------------------|------------------------------------------------------|
| `bin_message`      | Sets `is_binned = true`, increments `bin_count`      |
| `restore_message`  | Sets `is_binned = false`                             |

---

## Table: `site_settings`

Key-value store for site-wide global state (e.g. the wallpaper).

| Column     | Type    | Description                                      |
|------------|---------|--------------------------------------------------|
| `key`      | text    | Setting name (e.g. `'wallpaper'`)                |
| `value`    | text    | Setting value (e.g. a base64 PNG data URL)       |
| `metadata` | jsonb   | Arbitrary extra data (e.g. `{ source_message_id }`) |

### RPCs used
| RPC name           | Args                      | Description                          |
|--------------------|---------------------------|--------------------------------------|
| `set_site_setting` | `p_key, p_value, p_metadata` | Upsert a setting                  |
| `clear_site_setting` | `p_key`                 | Delete a setting row                 |

### Currently used keys
| Key         | Value format            | Metadata                                  |
|-------------|-------------------------|--------------------------------------------|
| `wallpaper` | base64 PNG data URL     | `{ source_message_id: <messages.id> }`    |

---

## Where to look in code

| What you want to do             | File                   |
|---------------------------------|------------------------|
| Save a new file / note / image  | `src/supabase.js` → `saveMessage()` |
| Read all live (non-binned) files | `src/supabase.js` → `getMessages()` |
| Bin a file                      | `src/supabase.js` → `binMessage()`  |
| Get / set / clear a site setting | `src/supabase.js` → `getSetting / setSetting / clearSetting` |
| Wallpaper helpers               | `src/supabase.js` → `getWallpaper / setWallpaper / clearWallpaper / subscribeToWallpaper` |
| Notes editor UI                 | `src/text-editor.js` → `TextEditor.openNewFile()` |
| Paint / drawing UI              | `src/paint.js` → `Paint.open()` |
| Wallpaper dialog (in Paint)     | `src/paint.js` → `setupBridge()` → `setWallpaperCentered` |
