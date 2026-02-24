import { saveMessage } from './supabase.js';

export class PixelArt {
    constructor(windowManager, onSaveSuccess = null) {
        this.wm = windowManager;
        this.onSaveSuccess = onSaveSuccess;
        this.canvasSize = { w: 256, h: 256 };
        this.currentColor = '#ffffff';
        this.isDrawing = false;
        this.zoomLevel = 1;
        this.zoomOffset = { x: 0, y: 0 };
        this.currentTool = 'pencil';
        this.strokeSize = 1;
        this.brushShape = 'square';
        this.lastCoords = null;
    }

    open(file = null) {
        if (file && (file.id || file.path)) {
            return this.view(file);
        }
        return this.openNewFile();
    }

    view(file) {
        const content = document.createElement('div');
        content.className = 'pixel-art-container view-only';

        content.innerHTML = `
            <div class="editor-toolbar" style="justify-content: space-between;">
                <div class="editor-filename-display" style="font-family: var(--bios-font); color: var(--bios-text);">${file.name}</div>
                <div class="editor-status" style="opacity: 0.5;">Read Only</div>
            </div>
            <div class="pixel-art-viewer-body">
                <canvas class="pixel-art-canvas-view"></canvas>
            </div>
        `;

        const canvas = content.querySelector('.pixel-art-canvas-view');
        const ctx = canvas.getContext('2d');

        // Load data if available
        if (file.content) {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            };
            img.src = file.content;
        }

        return this.wm.createWindow(`Viewing: ${file.name}`, content);
    }

    openNewFile() {
        const content = document.createElement('div');
        content.className = 'pixel-art-container';

        content.innerHTML = `
            <div class="editor-toolbar">
                <div class="editor-toolbar-top">
                    <input type="text" id="pixel-file-name" placeholder="artwork.draw" class="editor-filename-input" />
                    <button id="pixel-save-btn" class="editor-save-btn">Save to Cloud</button>
                </div>
                <div class="editor-toolbar-bottom">
                    <div class="canvas-size-inputs">
                        <label>Size:</label>
                        <input type="number" id="canvas-width" value="256" min="1" max="256" class="size-input" />
                        <span>x</span>
                        <input type="number" id="canvas-height" value="256" min="1" max="256" class="size-input" />
                        <button id="resize-btn" class="tiny-btn">Resize</button>
                    </div>
                </div>
            </div>
            <div class="pixel-art-main">
                <div class="pixel-art-toolbox">
                    <div class="tool-group">
                        <button class="tool-btn active" data-tool="pencil" title="Pencil">
                            <span class="tool-icon">✏️</span>
                        </button>
                        <button class="tool-btn" data-tool="zoom" title="Zoom">
                            <span class="tool-icon">🔍</span>
                        </button>
                    </div>
                    <div class="color-picker-container">
                        <div class="color-preview" id="color-preview" style="background: ${this.currentColor}"></div>
                        <div class="rgb-sliders">
                            <div class="slider-row">
                                <label>R</label>
                                <input type="range" min="0" max="255" value="255" class="rgb-slider" id="r-slider" />
                            </div>
                            <div class="slider-row">
                                <label>G</label>
                                <input type="range" min="0" max="255" value="255" class="rgb-slider" id="g-slider" />
                            </div>
                            <div class="slider-row">
                                <label>B</label>
                                <input type="range" min="0" max="255" value="255" class="rgb-slider" id="b-slider" />
                            </div>
                        </div>
                        <input type="text" id="hex-field" value="#FFFFFF" class="hex-input" />
                    </div>
                    <div class="brush-settings-container">
                        <div class="brush-setting-row">
                            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                                <span class="brush-setting-label">Size</span>
                                <span class="stroke-size-value" id="stroke-size-val">1px</span>
                            </div>
                            <input type="range" min="1" max="32" value="1" class="rgb-slider" id="stroke-size-slider" />
                        </div>
                        <div class="brush-setting-row" style="margin-top: 5px;">
                            <span class="brush-setting-label">Shape</span>
                            <div class="brush-shape-grid">
                                <button class="shape-btn active" data-shape="square" title="Square">■</button>
                                <button class="shape-btn" data-shape="circle" title="Circle">●</button>
                                <button class="shape-btn" data-shape="marker" title="Marker Tip">🖋️</button>
                                <button class="shape-btn" data-shape="fountain" title="Fountain Pen">✒️</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="pixel-art-canvas-wrapper">
                    <canvas id="pixel-canvas" width="${this.canvasSize.w}" height="${this.canvasSize.h}"></canvas>
                    <div id="zoom-selection-box" style="display: none; position: absolute; border: 1px solid white; box-shadow: 0 0 0 1000px rgba(0,0,0,0.3); pointer-events: none; z-index: 10;"></div>
                </div>
            </div>
            <div class="editor-footer">
                <div class="privacy-notice">
                    <input type="checkbox" id="pixel-privacy-agreement" />
                    <label for="pixel-privacy-agreement">Public Artwork: <span>Permanent once saved.</span></label>
                </div>
                <div class="editor-status" id="pixel-status">Ready</div>
            </div>
        `;

        const win = this.wm.createWindow('New Pixel Art', content);
        win.element.style.width = '550px';
        win.element.style.height = '550px';
        const canvas = content.querySelector('#pixel-canvas');
        const ctx = canvas.getContext('2d');
        const rSlider = content.querySelector('#r-slider');
        const gSlider = content.querySelector('#g-slider');
        const bSlider = content.querySelector('#b-slider');
        const hexField = content.querySelector('#hex-field');
        const colorPreview = content.querySelector('#color-preview');
        const saveBtn = content.querySelector('#pixel-save-btn');
        const fileNameInput = content.querySelector('#pixel-file-name');
        const widthInput = content.querySelector('#canvas-width');
        const heightInput = content.querySelector('#canvas-height');
        const resizeBtn = content.querySelector('#resize-btn');
        const status = content.querySelector('#pixel-status');
        const privacyCheckbox = content.querySelector('#pixel-privacy-agreement');
        const toolBtns = content.querySelectorAll('.tool-btn');
        const shapeBtns = content.querySelectorAll('.shape-btn');
        const strokeSlider = content.querySelector('#stroke-size-slider');
        const strokeSizeVal = content.querySelector('#stroke-size-val');
        const zoomBox = content.querySelector('#zoom-selection-box');
        const canvasWrapper = content.querySelector('.pixel-art-canvas-wrapper');

        // Initial canvas setup
        // Resets canvas dimensions and clears it
        const initCanvas = (w, h) => {
            this.canvasSize = { w, h };
            canvas.width = w;
            canvas.height = h;
            ctx.fillStyle = '#00000000';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateDisplay();
        };

        // Updates display (CSS, zoom, transform) without clearing the canvas
        const updateDisplay = () => {
            const { w, h } = this.canvasSize;
            canvas.style.width = `${w * this.zoomLevel}px`;
            canvas.style.height = `${h * this.zoomLevel}px`;
            canvas.style.backgroundSize = `${this.zoomLevel * 20}px ${this.zoomLevel * 20}px`;

            if (this.zoomLevel > 1) {
                // Align to top-left so transform is predictable
                canvasWrapper.style.justifyContent = 'flex-start';
                canvasWrapper.style.alignItems = 'flex-start';
                canvas.style.transform = `translate(${-this.zoomOffset.x * this.zoomLevel}px, ${-this.zoomOffset.y * this.zoomLevel}px)`;
                canvas.style.transformOrigin = 'top left';
            } else {
                // Center for 1x view
                canvasWrapper.style.justifyContent = 'center';
                canvasWrapper.style.alignItems = 'center';
                canvas.style.transform = 'none';
            }
        };

        initCanvas(256, 256);

        resizeBtn.addEventListener('click', () => {
            const w = Math.min(256, Math.max(1, parseInt(widthInput.value) || 256));
            const h = Math.min(256, Math.max(1, parseInt(heightInput.value) || 256));

            if (confirm('Resizing will clear your current drawing. Continue?')) {
                widthInput.value = w;
                heightInput.value = h;
                initCanvas(w, h);
            }
        });

        const updateColor = () => {
            const r = parseInt(rSlider.value);
            const g = parseInt(gSlider.value);
            const b = parseInt(bSlider.value);
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
            this.currentColor = hex;
            colorPreview.style.background = hex;
            hexField.value = hex;
        };

        const updateFromHex = () => {
            let hex = hexField.value.trim();
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-F]{6}$/i.test(hex)) {
                this.currentColor = hex;
                colorPreview.style.background = hex;
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                rSlider.value = r;
                gSlider.value = g;
                bSlider.value = b;
            }
        };

        rSlider.addEventListener('input', updateColor);
        gSlider.addEventListener('input', updateColor);
        bSlider.addEventListener('input', updateColor);
        hexField.addEventListener('input', updateFromHex);

        toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toolBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;

                if (this.currentTool !== 'zoom') {
                    zoomBox.style.display = 'none';
                }
            });
        });

        shapeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                shapeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.brushShape = btn.dataset.shape;
            });
        });

        strokeSlider.addEventListener('input', () => {
            this.strokeSize = parseInt(strokeSlider.value);
            strokeSizeVal.textContent = `${this.strokeSize}px`;
        });

        const getCanvasCoords = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            // In 1x mode: rect.width = canvasSize.w
            // In 4x mode: rect.width = canvasSize.w * 4
            const x = (clientX - rect.left) / (rect.width / this.canvasSize.w);
            const y = (clientY - rect.top) / (rect.height / this.canvasSize.h);
            return { x: Math.floor(x), y: Math.floor(y) };
        };

        const draw = (e) => {
            if (!this.isDrawing || this.currentTool !== 'pencil') return;
            const coords = getCanvasCoords(e.clientX, e.clientY);
            const { x, y } = coords;

            if (x >= 0 && x < this.canvasSize.w && y >= 0 && y < this.canvasSize.h) {
                ctx.fillStyle = this.currentColor;
                ctx.strokeStyle = this.currentColor;

                const size = this.strokeSize;
                const half = Math.floor(size / 2);

                const drawShape = (px, py) => {
                    if (this.brushShape === 'square') {
                        ctx.fillRect(px - half, py - half, size, size);
                    } else if (this.brushShape === 'circle') {
                        ctx.beginPath();
                        ctx.arc(px + 0.5, py + 0.5, size / 2, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (this.brushShape === 'marker') {
                        ctx.beginPath();
                        ctx.moveTo(px - size / 2, py - size / 4);
                        ctx.lineTo(px + size / 2, py + size / 4);
                        ctx.lineWidth = size / 2;
                        ctx.stroke();
                    } else if (this.brushShape === 'fountain') {
                        ctx.beginPath();
                        ctx.moveTo(px - size / 2, py + size / 2);
                        ctx.lineTo(px + size / 2, py - size / 2);
                        ctx.lineWidth = Math.max(1, size / 4);
                        ctx.stroke();
                    }
                };

                if (this.lastCoords) {
                    const dx = x - this.lastCoords.x;
                    const dy = y - this.lastCoords.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const steps = Math.max(1, Math.floor(distance));

                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const interpX = Math.floor(this.lastCoords.x + dx * t);
                        const interpY = Math.floor(this.lastCoords.y + dy * t);
                        drawShape(interpX, interpY);
                    }
                } else {
                    drawShape(x, y);
                }

                this.lastCoords = { x, y };
            }
        };

        const updateZoomBox = (e) => {
            if (this.currentTool !== 'zoom' || this.zoomLevel > 1) {
                zoomBox.style.display = 'none';
                return;
            }

            const wrapperRect = canvasWrapper.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();

            // Zoom area is 1/4th of the canvas
            const zoomAreaW = this.canvasSize.w / 4;
            const zoomAreaH = this.canvasSize.h / 4;

            const coords = getCanvasCoords(e.clientX, e.clientY);
            let zoomX = Math.floor(coords.x - zoomAreaW / 2);
            let zoomY = Math.floor(coords.y - zoomAreaH / 2);

            // Constrain
            zoomX = Math.max(0, Math.min(zoomX, this.canvasSize.w - zoomAreaW));
            zoomY = Math.max(0, Math.min(zoomY, this.canvasSize.h - zoomAreaH));

            zoomBox.style.display = 'block';
            zoomBox.style.width = `${zoomAreaW * this.zoomLevel}px`;
            zoomBox.style.height = `${zoomAreaH * this.zoomLevel}px`;

            // Calculate position relative to the wrapper
            const offsetX = (zoomX - this.zoomOffset.x) * this.zoomLevel;
            const offsetY = (zoomY - this.zoomOffset.y) * this.zoomLevel;

            zoomBox.style.left = `${canvasRect.left - wrapperRect.left + offsetX}px`;
            zoomBox.style.top = `${canvasRect.top - wrapperRect.top + offsetY}px`;

            return { x: zoomX, y: zoomY };
        };

        canvas.addEventListener('mousedown', (e) => {
            if (this.currentTool === 'pencil') {
                this.isDrawing = true;
                draw(e);
            } else if (this.currentTool === 'zoom') {
                if (this.zoomLevel === 1) {
                    const zoomAreaW = this.canvasSize.w / 4;
                    const zoomAreaH = this.canvasSize.h / 4;
                    const coords = getCanvasCoords(e.clientX, e.clientY);

                    this.zoomOffset.x = Math.max(0, Math.min(Math.floor(coords.x - zoomAreaW / 2), this.canvasSize.w - zoomAreaW));
                    this.zoomOffset.y = Math.max(0, Math.min(Math.floor(coords.y - zoomAreaH / 2), this.canvasSize.h - zoomAreaH));
                    this.zoomLevel = 4;
                } else {
                    this.zoomLevel = 1;
                    this.zoomOffset = { x: 0, y: 0 };
                }
                updateDisplay();
                updateZoomBox(e);
            }
        });

        window.addEventListener('mousemove', (e) => {
            draw(e);
            updateZoomBox(e);
        });
        window.addEventListener('mouseup', () => {
            this.isDrawing = false;
            this.lastCoords = null;
        });

        saveBtn.addEventListener('click', async () => {
            let fileName = fileNameInput.value.trim() || 'artwork.draw';
            if (!fileName.toLowerCase().endsWith('.draw')) {
                fileName += '.draw';
            }

            // For pixel art, we save as DataURL
            const body = canvas.toDataURL('image/png');

            if (!privacyCheckbox.checked) {
                status.textContent = 'Please check the public box.';
                status.style.color = '#ffaa00';
                return;
            }

            status.textContent = 'Saving to Paper...';
            status.style.color = '#fff';

            try {
                // We use saveMessage but it will save the base64 string
                await saveMessage(fileName, body);
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
