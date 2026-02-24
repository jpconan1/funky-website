import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const VERSION = '2.1.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP_DIR = path.join(__dirname, '../public/desktop');
const OUTPUT_FILE = path.join(__dirname, '../public/desktop-manifest.json');

function getFileType(file, stats) {
    if (stats.isDirectory()) return 'directory';

    const ext = path.extname(file).toLowerCase();
    const types = {
        '.txt': 'text',
        '.md': 'text',
        '.pdf': 'document',
        '.png': 'image',
        '.jpg': 'image',
        '.jpeg': 'image',
        '.gif': 'image',
        '.webp': 'image',
        '.html': 'app',
        '.js': 'app'
    };

    return types[ext] || 'unknown';
}

function scanDirectory(dirPath, relativePath = '') {
    try {
        if (!fs.existsSync(dirPath)) return [];

        const files = fs.readdirSync(dirPath).sort();
        const items = [];

        for (const file of files) {
            if (file.startsWith('.')) continue;

            const fullPath = path.join(dirPath, file);
            try {
                // If it doesn't exist anymore, skip (common during moves)
                if (!fs.existsSync(fullPath)) continue;

                let stats = fs.statSync(fullPath);

                // If we get an "unknown" size or stats for a split second, skip it
                if (!stats) continue;

                const isDirectory = stats.isDirectory();
                const ext = path.extname(file).toLowerCase();

                const item = {
                    name: file,
                    size: stats.size,
                    modified: stats.mtime,
                    extension: isDirectory ? '' : ext,
                    type: getFileType(file, stats),
                    path: relativePath ? `${relativePath}/${file}` : file
                };

                if (isDirectory) {
                    item.contents = scanDirectory(fullPath, item.path);
                    // Double check type if it has contents
                    if (item.contents && item.type !== 'directory') {
                        item.type = 'directory';
                    }
                }

                items.push(item);
            } catch (err) {
                // Ignore stat errors for files that disappear during scan
                continue;
            }
        }

        return items;
    } catch (err) {
        console.error(`[v${VERSION}] Error reading directory ${dirPath}:`, err.message);
        return [];
    }
}

function generateManifest() {
    console.log(`[v${VERSION}] Scanning desktop folder...`);

    try {
        if (!fs.existsSync(DESKTOP_DIR)) {
            fs.mkdirSync(DESKTOP_DIR, { recursive: true });
        }

        const manifest = scanDirectory(DESKTOP_DIR);

        // Security check: if we somehow got 0 items but the folder isn't empty, 
        // maybe wait and try once more? 
        if (manifest.length === 0 && fs.readdirSync(DESKTOP_DIR).filter(f => !f.startsWith('.')).length > 0) {
            console.log(`[v${VERSION}] Result was empty but folder isn't. Retrying in 200ms...`);
            setTimeout(generateManifest, 200);
            return;
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
        console.log(`[v${VERSION}] Manifest updated (${manifest.length} items).`);
    } catch (err) {
        console.error(`[v${VERSION}] Failed to generate manifest:`, err.message);
    }
}

generateManifest();

if (process.argv.includes('--watch')) {
    console.log(`[v${VERSION}] Watcher active on ${DESKTOP_DIR}...`);
    let timeout;
    let isProcessing = false;

    fs.watch(DESKTOP_DIR, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.startsWith('.') || filename.includes('/.'))) return;

        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (isProcessing) return;
            isProcessing = true;
            generateManifest();
            isProcessing = false;
        }, 1000); // 1 second debounce for major stability
    });
}
