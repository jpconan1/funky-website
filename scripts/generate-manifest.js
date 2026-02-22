import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP_DIR = path.join(__dirname, '../public/desktop');
const OUTPUT_FILE = path.join(__dirname, '../public/desktop-manifest.json');

function generateManifest() {
    console.log('Scanning desktop folder...');

    if (!fs.existsSync(DESKTOP_DIR)) {
        fs.mkdirSync(DESKTOP_DIR, { recursive: true });
    }

    const files = fs.readdirSync(DESKTOP_DIR);
    const manifest = files
        .filter(file => !file.startsWith('.')) // Ignore hidden files
        .map(file => {
            const stats = fs.statSync(path.join(DESKTOP_DIR, file));
            const ext = path.extname(file).toLowerCase();

            return {
                name: file,
                size: stats.size,
                modified: stats.mtime,
                extension: ext,
                type: getFileType(ext)
            };
        });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    console.log(`Manifest generated with ${manifest.length} files.`);
}

function getFileType(ext) {
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

generateManifest();

if (process.argv.includes('--watch')) {
    console.log('Watching for changes in desktop folder...');
    fs.watch(DESKTOP_DIR, (eventType, filename) => {
        if (filename && !filename.startsWith('.')) {
            console.log(`File ${filename} changed (${eventType}), regenerating manifest...`);
            generateManifest();
        }
    });
}
