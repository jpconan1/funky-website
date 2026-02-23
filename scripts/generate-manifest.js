import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP_DIR = path.join(__dirname, '../public/desktop');
const OUTPUT_FILE = path.join(__dirname, '../public/desktop-manifest.json');

function scanDirectory(dirPath, relativePath = '') {
    const files = fs.readdirSync(dirPath);
    const items = [];

    for (const file of files) {
        if (file.startsWith('.')) continue; // Ignore hidden files

        const fullPath = path.join(dirPath, file);
        const stats = fs.statSync(fullPath);
        const ext = path.extname(file).toLowerCase();
        const isDirectory = stats.isDirectory();

        const item = {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            extension: isDirectory ? '' : ext,
            type: isDirectory ? 'directory' : getFileType(ext),
            path: relativePath ? `${relativePath}/${file}` : file
        };

        if (isDirectory) {
            item.contents = scanDirectory(fullPath, item.path);
        }

        items.push(item);
    }

    return items;
}

function generateManifest() {
    console.log('Scanning desktop folder...');

    if (!fs.existsSync(DESKTOP_DIR)) {
        fs.mkdirSync(DESKTOP_DIR, { recursive: true });
    }

    const manifest = scanDirectory(DESKTOP_DIR);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    console.log(`Manifest generated with ${manifest.length} top-level items.`);
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
