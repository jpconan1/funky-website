import { WindowManager } from './window-manager.js';
import { UI } from './ui-components.js';
import { SynthEngine } from './synth-engine.js';
import { SequencerEngine } from './sequencer-engine.js';
import { SongManager } from './song-manager.js';
import { saveMessage, MEDIA_STAMP } from './supabase.js';

export class FunkMaker3000 {
    constructor(windowManager) {
        this.wm = windowManager;
        this.synth = new SynthEngine();
        this.seq = new SequencerEngine(this.synth);
        this.song = new SongManager(this);

        this.activeTab = 'synth';
        this.octave = 0;
        this.winRef = null;
        this.builderContainer = null;

        this.keyMap = {
            'a': { note: 'C4', freq: 261.63, type: 'white' },
            'w': { note: 'C#4', freq: 277.18, type: 'black' },
            's': { note: 'D4', freq: 293.66, type: 'white' },
            'e': { note: 'D#4', freq: 311.13, type: 'black' },
            'd': { note: 'E4', freq: 329.63, type: 'white' },
            'f': { note: 'F4', freq: 349.23, type: 'white' },
            't': { note: 'F#4', freq: 369.99, type: 'black' },
            'g': { note: 'G4', freq: 392.00, type: 'white' },
            'y': { note: 'G#4', freq: 415.30, type: 'black' },
            'h': { note: 'A4', freq: 440.00, type: 'white' },
            'u': { note: 'A#4', freq: 466.16, type: 'black' },
            'j': { note: 'B4', freq: 493.88, type: 'white' },
            'k': { note: 'C5', freq: 523.25, type: 'white' },
            'o': { note: 'C#5', freq: 554.37, type: 'black' },
            'l': { note: 'D5', freq: 587.33, type: 'white' },
            'p': { note: 'D#5', freq: 622.25, type: 'black' },
            ';': { note: 'E5', freq: 659.25, type: 'white' },
            "'": { note: 'F5', freq: 698.46, type: 'white' },
            // Lower row pads (MPC style)
            'z': { note: 'C3', freq: 130.81, type: 'pad', color: '#eef1db', targetColor: '#ff2d55' },
            'x': { note: 'D3', freq: 146.83, type: 'pad', color: '#eef1db', targetColor: '#5856d6' },
            'c': { note: 'E3', freq: 164.81, type: 'pad', color: '#eef1db', targetColor: '#007aff' },
            'v': { note: 'F3', freq: 174.61, type: 'pad', color: '#eef1db', targetColor: '#5ac8fa' },
            'b': { note: 'G3', freq: 196.00, type: 'pad', color: '#eef1db', targetColor: '#4cd964' },
            'n': { note: 'A3', freq: 220.00, type: 'pad', color: '#eef1db', targetColor: '#ffcc00' },
            'm': { note: 'B3', freq: 246.94, type: 'pad', color: '#eef1db', targetColor: '#ff9500' },
            ',': { note: 'C4', freq: 261.63, type: 'pad', color: '#eef1db', targetColor: '#ff3b30' },
            '.': { note: 'D4', freq: 293.66, type: 'pad', color: '#eef1db', targetColor: '#af52de' },
            '/': { note: 'E4', freq: 329.63, type: 'pad', color: '#eef1db', targetColor: '#5856d6' }
        };

        this.unsetPadMapping = {
            'z': 'a',
            'x': 's',
            'c': 'd',
            'v': 'f',
            'b': 'g',
            'n': 'h',
            'm': 'j',
            ',': 'k',
            '.': 'l',
            '/': ';'
        };

        this.keysOrder = [
            'a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"
        ];

        this.padsOrder = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'];

        // Wire up engine callbacks
        this.seq.onStateChange = () => this._updateLoopUI();
        this.seq.onPlayheadUpdate = () => { /* not used in roll view */ };
        this.seq.onScrollUpdate = (pos16) => this._onRollScroll(pos16);

        // Overdub key flash — light the piano key when a recorded note replays
        this.seq.onNoteOn = (key) => {
            if (!this.winRef) return;
            this.winRef.element.querySelector(`.piano-key[data-key="${key}"], .pad[data-key="${key}"]`)?.classList.add('active');
        };
        this.seq.onNoteOff = (key) => {
            if (!this.winRef) return;
            // Only remove active if the user isn't currently holding the key
            if (!this.seq.recOpenNotes[key]) {
                this.winRef.element.querySelector(`.piano-key[data-key="${key}"], .pad[data-key="${key}"]`)?.classList.remove('active');
            }
        };

        // Roll canvas rendering
        this._rollCanvas = null;
        this._rollCtx = null;
        this._loopToolActive = false;  // 'set loop point' mode

        // Combined order for looper roll visualization
        this.looperOrder = [...this.keysOrder, ...this.padsOrder];

        this._selectedNote = null;

        // Data-driven UI Sync
        this.synth.on('synthChange', () => {
            if (this.winRef) {
                this.updateGlobalControlsValues(this.winRef);
                this.renderBuilder();
            }
        });

        this.synth.on('paramChange', ({ param, value }) => {
            if (this.winRef) this._syncGlobalControl(param, value);
        });

        this.synth.on('voiceChange', () => {
            // Internal voice changes might not need a full builder re-render 
            // but for now keeping it simple.
        });

        this._loadSavedLoops();
    }

    _loadSavedLoops() {
        try {
            const saved = localStorage.getItem('fm3000-loops');
            if (saved) {
                const loops = JSON.parse(saved);
                // Basic validation: ensure it's an array
                if (Array.isArray(loops)) {
                    this.seq.savedLoops = loops;
                }
            }
        } catch (e) {
            console.warn('Failed to load saved loops:', e);
        }
    }

    _persistLoops() {
        try {
            localStorage.setItem('fm3000-loops', JSON.stringify(this.seq.savedLoops));
        } catch (e) {
            console.error('Failed to save loops to localStorage:', e);
        }
    }

    _syncGlobalControl(param, value) {
        if (!this.winRef) return;
        const sliders = this.winRef.element.querySelectorAll('.ui-slider');
        const mapping = {
            'filter': 'Filter',
            'fmRatio': 'FM Ratio',
            'fmDepth': 'FM Depth',
            'masterDetune': 'Master Detune',
            'volume': 'Volume',
            'morphSpeed': 'Morph Speed'
        };

        const targetLabel = mapping[param];
        if (!targetLabel) return;

        sliders.forEach(slider => {
            const container = slider.parentElement;
            const labelEl = container.querySelector('.ui-label');
            if (labelEl && labelEl.textContent === targetLabel) {
                let displayVal = value;
                if (param === 'fmRatio') displayVal = value * 10;
                if (param === 'volume') displayVal = value * 100;

                slider.value = displayVal;
                const display = container.querySelector('.ui-value-display');
                if (display) display.textContent = displayVal;
            }
        });
    }

    syncBpm(newBpm) {
        this.seq.bpm = newBpm;
        if (this.winRef) {
            const el = this.winRef.element;
            const b1 = el.querySelector('#fm-bpm');
            const b2 = el.querySelector('#fm-song-bpm');
            if (b1) b1.value = newBpm;
            if (b2) b2.value = newBpm;
        }
        if (this.activeTab === 'song') {
            this.song.renderTimeline();
        } else if (this.activeTab === 'loop') {
            this._drawRollCanvas(this.seq.scrollPos);
        }
    }


    open(songData = null, options = {}) {
        this.synth.initAudio();

        if (songData) {
            return this.openPreview(songData, options);
        }

        return this.openFull();
    }

    openPreview(songData, options) {
        const fromName = options.fromName || "A mysterious stranger";
        const content = this.renderPreview(songData, fromName);
        const win = this.wm.createWindow('Funk Maker 3000 - Preview', content);
        this.winRef = win;

        win.element.style.width = '480px';
        win.element.style.height = '320px';

        this.song.loadSong(songData);

        const playBtn = win.element.querySelector('#fm-preview-play');
        playBtn.addEventListener('click', () => {
            if (this.song.isPlaying) {
                this.song.stopSong();
            } else {
                this.song.startSong();
            }
        });

        const remixBtn = win.element.querySelector('#fm-preview-remix');
        remixBtn.addEventListener('click', () => {
            this.song.stopSong();
            this.openFull(songData);
        });

        return win;
    }

    renderPreview(songData, fromName) {
        let fromDisplay = fromName;
        if (fromName === "A mysterious stranger") {
            fromDisplay = `<i>${fromName}</i>`;
        }

        return `
            <div class="fm-preview-container">
                <div class="fm-preview-title">${songData.name || "UNTITLED FUNK"}</div>
                <div class="fm-preview-from">FROM: ${fromDisplay}</div>
                
                <div class="fm-preview-bar-container">
                    <div id="fm-preview-playhead" class="fm-preview-playhead"></div>
                </div>

                <div class="fm-preview-controls">
                    <button class="fm-preview-btn" id="fm-preview-play">▶ PLAY</button>
                    <button class="fm-preview-btn" id="fm-preview-remix">Remix</button>
                </div>
            </div>
        `;
    }

    openFull(songData = null) {
        const content = this.render();
        let win = this.winRef;

        if (win && win.element.isConnected) {
            // Transform existing preview window into full app
            win.setTitle('Funk Maker 3000');
            const contentArea = win.element.querySelector('.window-content');
            contentArea.innerHTML = content;
        } else {
            win = this.wm.createWindow('Funk Maker 3000', content);
            this.winRef = win;
        }

        win.element.style.width = '750px';
        win.element.style.height = '600px';
        win.minWidth = 750;
        win.minHeight = 400;

        // Centering if it was small
        const desktop = document.querySelector('#desktop');
        if (desktop) {
            const dw = desktop.clientWidth;
            const dh = desktop.clientHeight;
            win.element.style.left = `${(dw - 750) / 2}px`;
            win.element.style.top = `${(dh - 600) / 2}px`;
        }

        this.addControls(win);
        this.setupEventListeners(win);

        if (songData) {
            try {
                this.song.loadSong(songData);
                // Update header fields
                const nameInp = win.element.querySelector('#fm-song-name');
                const prodInp = win.element.querySelector('#fm-song-producer');
                if (nameInp) nameInp.value = songData.name || "Untitled Funk";
                if (prodInp) {
                    const fromName = songData.producer || "Anonymous";
                    prodInp.value = fromName;
                }
            } catch (e) {
                console.error("Failed to load song data in full view:", e);
            }
        }

        this.synth.loadPreset('init');
        this.updateGlobalControlsValues(win);
        this.renderBuilder();

        this._setupTabButtons(win);
        this.song.setupEventListeners(win);
        this.switchTab(this.activeTab, win);

        return win;
    }

    _setupTabButtons(win) {
        const btns = win.element.querySelectorAll('.fm-tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab, win);
            });
        });
    }

    _startCanvasAnimation() {
        if (this._canvasAnimId) return;
        const loop = () => {
            if (this.activeTab === 'loop') {
                this._drawRollCanvas(this.seq.scrollPos);
                this._canvasAnimId = requestAnimationFrame(loop);
            } else {
                this._canvasAnimId = null;
            }
        };
        this._canvasAnimId = requestAnimationFrame(loop);
    }

    switchTab(tabId, win) {
        win = win || this.winRef;
        if (!win) return;
        this.activeTab = tabId;

        win.element.querySelectorAll('.fm-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        win.element.querySelectorAll('.fm-panel').forEach(panel => {
            const isActive = panel.dataset.panel === tabId;
            panel.classList.toggle('fm-panel--active', isActive);
            panel.style.display = isActive ? '' : 'none';
        });

        // Toggle body class for CSS-driven footer styling
        win.element.querySelector('.funk-maker-container')
            ?.classList.toggle('loop-tab-active', tabId === 'loop');

        // When switching to loop tab, sync canvas to DOM key positions (delayed so layout settles)
        if (tabId === 'loop' && this._rollCanvas) {
            requestAnimationFrame(() => {
                const container = this._rollCanvas.parentElement;
                if (!container) return;
                this._rollCanvas.width = container.offsetWidth;
                this._rollCanvas.height = container.offsetHeight;
                this._syncKeyLayoutFromDOM();
                this._drawRollCanvas(this.seq.scrollPos);
            });
            this._startCanvasAnimation(); // Start continuous animation for portal effects
        } else if (tabId === 'song') {
            this.song.renderLoopBank();
            if (this._canvasAnimId) {
                cancelAnimationFrame(this._canvasAnimId);
                this._canvasAnimId = null;
            }
        } else if (this._canvasAnimId) {
            cancelAnimationFrame(this._canvasAnimId);
            this._canvasAnimId = null;
        }
    }


    addControls(win) {
        const container = win.element.querySelector('.synth-controls');
        if (!container) return;

        const presetsRow = document.createElement('div');
        presetsRow.className = 'presets-row';

        const presetLabel = document.createElement('span');
        presetLabel.className = 'ui-label';
        presetLabel.textContent = 'Presets:';
        presetsRow.appendChild(presetLabel);

        Object.keys(this.synth.presets).forEach(key => {
            const btn = UI.createButton(this.synth.presets[key].name, () => {
                this.synth.loadPreset(key);
                // No more manual renders here!
                presetsRow.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            btn.classList.add('preset-btn');
            if (key === 'init') btn.classList.add('active');
            presetsRow.appendChild(btn);
        });

        const randBtn = UI.createButton('🎲 Randomize', () => {
            this.synth.randomize();
            // Events handle the rest!
            presetsRow.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        });
        randBtn.classList.add('preset-btn', 'randomize-btn');
        presetsRow.appendChild(randBtn);

        container.appendChild(presetsRow);

        const globalSection = UI.createSection('Global Settings');
        container.appendChild(globalSection);

        container.appendChild(UI.createSlider('Filter', 20, 10000, this.synth.synthSettings.cutoff, (val) => {
            const numVal = parseInt(val);
            this.synth.synthSettings.cutoff = numVal;
            this.synth.updateGlobalParams('filter', numVal);
        }));

        container.appendChild(UI.createSlider('FM Ratio', 5, 100, this.synth.synthSettings.fmRatio * 10, (val) => {
            const numVal = val / 10;
            this.synth.synthSettings.fmRatio = numVal;
            this.synth.updateGlobalParams('fmRatio', numVal);
        }));

        container.appendChild(UI.createSlider('FM Depth', 0, 1000, this.synth.synthSettings.fmDepth, (val) => {
            const numVal = parseInt(val);
            this.synth.synthSettings.fmDepth = numVal;
            this.synth.updateGlobalParams('fmDepth', numVal);
        }));

        container.appendChild(UI.createSlider('Attack', 0, 200, this.synth.synthSettings.attack * 100, (val) => {
            this.synth.synthSettings.attack = val / 100;
        }));

        container.appendChild(UI.createSlider('Release', 0, 300, this.synth.synthSettings.release * 100, (val) => {
            this.synth.synthSettings.release = val / 100;
        }));

        container.appendChild(UI.createSlider('Master Detune', -1200, 1200, this.synth.synthSettings.detune, (val) => {
            const numVal = parseInt(val);
            this.synth.synthSettings.detune = numVal;
            this.synth.updateGlobalParams('masterDetune', numVal);
        }));

        container.appendChild(UI.createSlider('Volume', 0, 100, this.synth.synthSettings.volume * 100, (val) => {
            this.synth.synthSettings.volume = val / 100;
            this.synth.updateGlobalParams('volume', this.synth.synthSettings.volume);
        }));

        const octaveGroup = document.createElement('div');
        octaveGroup.className = 'ui-field';
        octaveGroup.style.display = 'flex';
        octaveGroup.style.alignItems = 'center';
        octaveGroup.style.gap = '10px';
        octaveGroup.style.padding = '10px';
        octaveGroup.style.background = 'rgba(255,255,255,0.03)';
        octaveGroup.style.borderRadius = '4px';

        const octaveLabel = document.createElement('span');
        octaveLabel.className = 'ui-label';
        octaveLabel.textContent = 'Octave:';
        octaveLabel.style.marginBottom = '0';
        octaveGroup.appendChild(octaveLabel);

        const octaveInput = document.createElement('input');
        octaveInput.type = 'number';
        octaveInput.className = 'fm-bpm-input';
        octaveInput.value = this.octave;
        octaveInput.min = -4;
        octaveInput.max = 4;
        octaveInput.style.width = '60px';
        octaveInput.addEventListener('change', (e) => {
            this.octave = parseInt(e.target.value);
        });
        // Block scientific notation and decimals
        octaveInput.addEventListener('keydown', (e) => {
            if (['e', 'E', '.'].includes(e.key)) e.preventDefault();
        });
        octaveGroup.appendChild(octaveInput);
        container.appendChild(octaveGroup);


        container.appendChild(UI.createRadioGroup('Play Mode', [
            { label: 'Overlap', value: 'overlap' },
            { label: 'Modulate', value: 'modulate' },
            { label: 'Wavetable', value: 'wavetable' }
        ], 'playMode', this.synth.synthSettings.playMode, (val) => {
            this.synth.synthSettings.playMode = val;
            this.synth.emit('synthChange', this.synth.snapshot());
            this.renderBuilder();
        }));

        this.builderContainer = document.createElement('div');
        this.builderContainer.className = 'instrument-builder';
        container.parentElement.insertBefore(this.builderContainer, container.nextSibling);
        this.renderBuilder();
    }


    updateGlobalControlsValues(win) {
        const sliders = win.element.querySelectorAll('.ui-slider');
        sliders.forEach(slider => {
            const labelArea = slider.parentElement.querySelector('.ui-label-area');
            if (!labelArea) return;
            const label = labelArea.querySelector('.ui-label').textContent;
            const display = labelArea.querySelector('.ui-value-display');

            let val = null;
            if (label === 'Filter') val = this.synth.synthSettings.cutoff;
            if (label === 'Attack') val = this.synth.synthSettings.attack * 100;
            if (label === 'Release') val = this.synth.synthSettings.release * 100;
            if (label === 'FM Depth') val = this.synth.synthSettings.fmDepth;
            if (label === 'FM Ratio') val = this.synth.synthSettings.fmRatio * 10;
            if (label === 'Master Detune') val = this.synth.synthSettings.detune;
            if (label === 'Volume') val = this.synth.synthSettings.volume * 100;
            if (label === 'Morph Speed') val = this.synth.synthSettings.morphSpeed;

            if (val !== null) {
                slider.value = val;
                display.textContent = val;
            }
        });


        const radioGroups = win.element.querySelectorAll('.ui-radio-group');
        radioGroups.forEach(group => {
            const labelEl = group.querySelector('.ui-group-label');
            if (labelEl && labelEl.textContent === 'Play Mode') {
                const radios = group.querySelectorAll('.ui-radio');
                radios.forEach(r => {
                    r.checked = r.value === this.synth.synthSettings.playMode;
                });
            }
        });
    }

    renderBuilder() {
        if (!this.builderContainer) return;
        this.builderContainer.innerHTML = '';

        const activeVoices = Object.keys(this.synth.availableVoices).filter(k => this.synth.availableVoices[k].active);

        const toolbarContainer = document.createElement('div');
        toolbarContainer.className = 'oscillator-toolbar-container';

        const toolbarLabel = document.createElement('label');
        toolbarLabel.textContent = 'Active Oscillators';
        toolbarLabel.className = 'ui-label';
        toolbarContainer.appendChild(toolbarLabel);

        const toolbar = UI.createToolbar(5);
        const types = [
            { type: 'sine', icon: '〰️', title: 'Sine' },
            { type: 'square', icon: '⬛', title: 'Square' },
            { type: 'sawtooth', icon: '🪚', title: 'Sawtooth' },
            { type: 'triangle', icon: '🔺', title: 'Triangle' },
            { type: 'noise', icon: '💨', title: 'Noise' }
        ];

        // Sort types based on engine's current order
        const orderedTypes = [...this.synth.oscillatorOrder].map(type => types.find(t => t.type === type));

        orderedTypes.forEach((t, index) => {
            const btn = UI.createToolButton(null, t.title, (e, b) => {
                const voice = this.synth.availableVoices[t.type];
                voice.active = !voice.active;
                b.classList.toggle('selected', voice.active);
                this.synth.updateActiveVoices();
                this.renderBuilder();
            }, { selected: this.synth.availableVoices[t.type].active });

            btn.setAttribute('draggable', 'true');
            btn.dataset.type = t.type;
            btn.dataset.index = index;
            btn.classList.add('fm-osc-btn');

            const grabber = document.createElement('span');
            grabber.className = 'fm-osc-grabber';
            grabber.textContent = '⠿';
            btn.appendChild(grabber);

            const iconSpan = document.createElement('span');
            iconSpan.textContent = t.icon;
            iconSpan.className = 'ui-tool-icon-text';
            btn.appendChild(iconSpan);

            // Drag events
            btn.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', t.type);
                btn.classList.add('dragging');
            });

            btn.addEventListener('dragend', () => {
                btn.classList.remove('dragging');
                toolbar.querySelectorAll('.fm-osc-btn').forEach(b => b.classList.remove('drag-over'));
            });

            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                btn.classList.add('drag-over');
            });

            btn.addEventListener('dragleave', () => {
                btn.classList.remove('drag-over');
            });

            btn.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedType = e.dataTransfer.getData('text/plain');
                if (draggedType === t.type) return;

                const currentOrder = [...this.synth.oscillatorOrder];
                const fromIdx = currentOrder.indexOf(draggedType);
                const toIdx = currentOrder.indexOf(t.type);

                currentOrder.splice(fromIdx, 1);
                currentOrder.splice(toIdx, 0, draggedType);

                this.synth.reorderOscillators(currentOrder);
                this.renderBuilder();
            });

            toolbar.appendChild(btn);
        });
        toolbarContainer.appendChild(toolbar);
        this.builderContainer.appendChild(toolbarContainer);

        // Morph Speed Slider (Inline with oscillators)
        if (this.synth.synthSettings.playMode !== 'overlap') {
            const morphSection = document.createElement('div');
            morphSection.className = 'morph-speed-container';
            morphSection.style.marginBottom = '20px';
            morphSection.appendChild(UI.createSlider('Morph Speed', 1, 100, this.synth.synthSettings.morphSpeed, (val) => {
                const numVal = parseInt(val);
                this.synth.synthSettings.morphSpeed = numVal;
                this.synth.updateGlobalParams('morphSpeed', numVal);
            }));
            this.builderContainer.appendChild(morphSection);
        }

        if (activeVoices.length === 0) {
            this.builderContainer.appendChild(UI.createSection('Oscillator Settings'));
            const emptyHint = document.createElement('p');
            emptyHint.className = 'ui-label';
            emptyHint.style.opacity = '0.5';
            emptyHint.style.padding = '20px';
            emptyHint.style.textAlign = 'center';
            emptyHint.textContent = 'Choose an oscillator from the toolbar above to start making noise.';
            this.builderContainer.appendChild(emptyHint);
            return;
        }

        const section = UI.createSection('Oscillator Settings');
        this.builderContainer.appendChild(section);

        const voicesContainer = document.createElement('div');
        voicesContainer.className = 'voices-list';

        activeVoices.forEach((type) => {
            const voice = this.synth.availableVoices[type];
            const voiceRow = document.createElement('div');
            voiceRow.className = 'voice-row';

            const labelArea = document.createElement('div');
            labelArea.className = 'ui-label';
            labelArea.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            labelArea.style.gridColumn = '1 / -1';
            labelArea.style.fontWeight = 'bold';
            voiceRow.appendChild(labelArea);

            voiceRow.appendChild(UI.createSlider('Freq Ratio', 0.1, 4.0, voice.ratio, (val) => {
                voice.ratio = parseFloat(val);
                this.synth.updateLiveVoices(type, 'ratio', voice.ratio);
            }, 0.01));

            voiceRow.appendChild(UI.createSlider('Detune', -100, 100, voice.detune, (val) => {
                voice.detune = parseFloat(val);
                this.synth.updateLiveVoices(type, 'detune', voice.detune);
            }));

            voiceRow.appendChild(UI.createSlider('Volume', 0, 100, voice.gain * 100, (val) => {
                voice.gain = parseFloat(val) / 100;
                this.synth.updateLiveVoices(type, 'gain', voice.gain);
            }));

            voiceRow.appendChild(UI.createSlider('Sweep Range', -500, 500, voice.pitchSweep || 0, (val) => {
                voice.pitchSweep = parseInt(val);
            }));

            voiceRow.appendChild(UI.createSlider('Sweep Time', 0.01, 1.0, voice.sweepDuration || 0.1, (val) => {
                voice.sweepDuration = parseFloat(val);
            }, 0.01));

            voicesContainer.appendChild(voiceRow);
        });

        this.builderContainer.appendChild(voicesContainer);
    }

    _updateLoopUI() {
        if (!this.winRef) return;
        const el = this.winRef.element;

        const rolling = this.seq.isRolling;
        const hasNotes = this.seq.recNotes.length > 0;

        // Roll button
        const rollBtn = el.querySelector('#fm-roll-toggle');
        if (rollBtn) {
            rollBtn.classList.toggle('rolling', rolling);
            rollBtn.textContent = rolling ? '⏹ STOP' : '▶ ROLL';
        }

        // Stage rolling class (drives CSS animations)
        const stage = el.querySelector('#fm-roll-stage');
        if (stage) stage.classList.toggle('rolling', rolling);

        // Inline status text
        const rollStatus = el.querySelector('#fm-roll-status');
        if (rollStatus) {
            rollStatus.textContent = rolling ? '⏺ REC + PLAY' : '';
        }

        // Save button — only available while stopped and notes exist
        const saveBtn = el.querySelector('#fm-save-loop-btn');
        if (saveBtn) saveBtn.disabled = rolling || !hasNotes;

        // Clear button
        const clearBtn = el.querySelector('#fm-clear-btn');
        if (clearBtn) clearBtn.disabled = rolling || !hasNotes;

        // Random buttons
        const randMelBtn = el.querySelector('#fm-rand-melody-btn');
        if (randMelBtn) randMelBtn.disabled = rolling || !hasNotes;

        const randChrBtn = el.querySelector('#fm-rand-chords-btn');
        if (randChrBtn) randChrBtn.disabled = rolling || !hasNotes;

        // Loop tool button glow
        const loopToolBtn = el.querySelector('#fm-loop-tool-btn');
        if (loopToolBtn) {
            const hasLoop = this.seq.loopEnd !== null;
            loopToolBtn.classList.toggle('active', hasLoop || this._loopToolActive);
        }

        // Metronome button glow
        const metBtn = el.querySelector('#fm-metronome-btn');
        if (metBtn) {
            metBtn.classList.toggle('active', this.seq.metronomeEnabled);
        }

        // Status in footer
        const footerStatus = el.querySelector('.piano-status');
        if (footerStatus) {
            if (rolling) footerStatus.textContent = '⏺ REC · ▶ PLAY';
            else if (hasNotes) footerStatus.textContent = 'LOOP READY — ROLL TO OVERDUB';
            else footerStatus.textContent = 'PRESS KEYS TO PLAY';
        }
    }

    _onRollScroll(pos16) {
        // Called every animation frame when the roll is running.
        // Tell the canvas to redraw.
        this._drawRollCanvas(pos16);
    }

    // -------------------------------------------------------------------
    // CANVAS TAPE-ROLL RENDERER
    //
    // Coordinate convention (playhead at centre):
    //   y = H/2  →  NOW  (the playhead line)
    //   y < H/2  →  PAST (content scrolling upward and away)
    //   y > H/2  →  FUTURE / upcoming (content rising toward the playhead)
    //
    // For any tape position P:
    //   played(P) = how many 16ths ago P fired (wraps mod total16)
    //   if played(P) <= total16/2  → recent past  → above centre
    //   if played(P)  > total16/2  → upcoming     → below centre
    //
    //   yOf(P) = H/2 - played(P) * pxPer16          (recent past)
    //          = H/2 + (total16 - played(P)) * pxPer16  (upcoming)
    // -------------------------------------------------------------------
    _drawRollCanvas(currentPos16) {
        const canvas = this._rollCanvas;
        const ctx = this._rollCtx;
        if (!canvas || !ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        if (W === 0 || H === 0) return;

        const total16 = this.seq.getTotalLength16();
        const playheadY = H / 2;

        // FIXED SCALE: Scale based on height such that 3 bars (48 sixteenths) 
        // always fit within the canvas height. This ensures the loop 
        // visuals are consistent across window sizes.
        const pxPer16 = H / 48;

        // Portal positions are STATIONARY relative to the playhead.
        // Their distance is exactly the loop length.
        const portalDist = total16 * pxPer16;
        const yBlue = playheadY - portalDist / 2;
        const yOrange = playheadY + portalDist / 2;

        // Canvas y for any tape position — past = above, future = below.
        // Content wraps at the portals.
        const yOf = (pos16) => {
            // Find relative distance from playhead in sixteenths, wrapped to [-total/2, total/2]
            let diff = ((pos16 - currentPos16 + total16 / 2) % total16 + total16) % total16 - total16 / 2;
            return playheadY + diff * pxPer16;
        };

        // ---- Clear + BG ----
        ctx.clearRect(0, 0, W, H);

        // Deep void background (outside the tape)
        ctx.fillStyle = '#040806';
        ctx.fillRect(0, 0, W, H);

        // Tape background (between portals)
        const tapeTop = Math.max(0, yBlue);
        const tapeBottom = Math.min(H, yOrange);
        if (tapeBottom > tapeTop) {
            ctx.fillStyle = '#08120a';
            ctx.fillRect(0, tapeTop, W, tapeBottom - tapeTop);
        }

        // Subtle scan-line texture
        for (let y = 0; y < H; y += 4) {
            ctx.fillStyle = 'rgba(255,255,255,0.007)';
            ctx.fillRect(0, y, W, 1);
        }

        // ---- Lane backgrounds (Clipped to region between portals) ----
        const kx = this._keyXPositions || [];
        const kw = this._keyWidths || [];

        ctx.save();
        if (tapeBottom > tapeTop) {
            ctx.beginPath();
            ctx.rect(0, tapeTop, W, tapeBottom - tapeTop);
            ctx.clip();
        }

        this.looperOrder.forEach((keyChar, i) => {
            const isBlack = this.keyMap[keyChar].type === 'black';
            const isPad = this.keyMap[keyChar].type === 'pad';

            if (isPad) {
                ctx.fillStyle = 'rgba(255,255,255,0.015)';
            } else {
                ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.03)';
            }

            ctx.fillRect(kx[i] || 0, 0, kw[i] || 0, H);

            ctx.fillStyle = isPad ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
            ctx.fillRect((kx[i] || 0) + (kw[i] || 0) - 1, 0, 1, H);
        });
        ctx.restore();

        // ---- MASKED PLANK CONTENT (Grid, Notes, Brackets) ----
        ctx.save();
        if (tapeBottom > tapeTop) {
            ctx.beginPath();
            ctx.rect(0, tapeTop, W, tapeBottom - tapeTop);
            ctx.clip();
        }

        // ---- Scrolling grid lines (bar / beat / 16th) ----
        // Optimization: Only iterate over visible ticks
        const topDiff = (tapeTop - playheadY) / pxPer16;
        const bottomDiff = (tapeBottom - playheadY) / pxPer16;
        const firstTick = Math.floor(currentPos16 + topDiff);
        const lastTick = Math.ceil(currentPos16 + bottomDiff);

        for (let t = firstTick; t <= lastTick; t++) {
            const tick = (t % total16 + total16) % total16;
            const yPx = yOf(tick);

            const isBar = tick % 16 === 0;
            const isBeat = tick % 4 === 0;

            if (isBar) {
                ctx.strokeStyle = 'rgba(238,241,219,0.22)';
                ctx.lineWidth = 1.5;
                const barLabel = (Math.floor(tick / 16) + 1).toString();
                ctx.fillStyle = 'rgba(238,241,219,0.45)';
                ctx.font = 'bold 10px "IBM VGA", monospace';
                ctx.fillText(barLabel, 6, yPx - 3);
            } else if (isBeat) {
                ctx.strokeStyle = 'rgba(255,255,255,0.10)';
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                ctx.lineWidth = 0.5;
            }
            ctx.beginPath();
            ctx.moveTo(0, yPx); ctx.lineTo(W, yPx);
            ctx.stroke();
        }

        // ---- Loop region brackets ----
        if (this.seq.loopEnd !== null) {
            const yS = yOf(this.seq.loopStart);
            const yE = yOf(this.seq.loopEnd);
            ctx.fillStyle = 'rgba(234,70,29,0.07)';
            ctx.fillRect(0, Math.min(yS, yE), W, Math.abs(yS - yE));
            ctx.strokeStyle = 'rgba(234,70,29,0.55)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(0, yS); ctx.lineTo(W, yS);
            ctx.moveTo(0, yE); ctx.lineTo(W, yE);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (this._loopToolActive) {
            const yS = yOf(this.seq.loopStart);
            ctx.strokeStyle = 'rgba(234,70,29,0.8)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(0, yS); ctx.lineTo(W, yS);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ---- Recorded & Live Notes (Two Passes: Pads then Piano) ----
        const allRecorded = this.seq.recNotes;
        const allLive = Object.entries(this.seq.recOpenNotes).map(([key, entry]) => ({ ...entry, key }));

        const renderNote = (ev, isLive, pass) => {
            const keyData = this.keyMap[ev.key];
            if (!keyData) return;
            const isPad = keyData.type === 'pad';

            if (pass === 'pads' && !isPad) return;
            if (pass === 'piano' && isPad) return;

            const i = this.looperOrder.indexOf(ev.key);
            if (i < 0) return;

            const x = kx[i] || 0;
            const w = kw[i] || 10;
            const dur16 = isLive ? (currentPos16 - ev.start16 + total16) % total16 : ((ev.end16 - ev.start16) % total16 + total16) % total16 || 0.5;
            const noteH = Math.max(dur16 * pxPer16, 3);
            const yStart = yOf(ev.start16);
            const isDragging = this._draggingNote === ev;
            const isSelected = this._selectedNote === ev;
            const color = keyData.color || null;

            // Draw instances to handle portal wrapping
            [0, -portalDist, portalDist].forEach(offset => {
                const targetY = yStart + offset;
                // Cull off-screen notes
                if (targetY + noteH < -50 || targetY > H + 50) return;

                if (isPad) {
                    this._drawPadTint(ctx, W, targetY, noteH, isLive, yBlue, yOrange, color, isSelected);
                } else {
                    this._fillNoteRect(ctx, x, w, targetY, noteH, isLive, yBlue, yOrange, isDragging, isSelected, color);
                }
            });
        };

        // Pass 1: Pads (Background)
        allRecorded.forEach(ev => renderNote(ev, false, 'pads'));
        allLive.forEach(ev => renderNote(ev, true, 'pads'));

        // Pass 2: Piano (Foreground)
        allRecorded.forEach(ev => renderNote(ev, false, 'piano'));
        allLive.forEach(ev => renderNote(ev, true, 'piano'));

        ctx.restore();

        // ---- Playhead line (the NOW marker) ----
        ctx.save();
        // Subtle fade zone behind the line — past half slightly dimmer
        const fadeGrad = ctx.createLinearGradient(0, 0, 0, H);
        fadeGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
        fadeGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
        fadeGrad.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(0, 0, W, H);

        // Glow behind the line
        const glowGrad = ctx.createLinearGradient(0, playheadY - 18, 0, playheadY + 18);
        glowGrad.addColorStop(0, 'rgba(234,70,29,0)');
        glowGrad.addColorStop(0.5, 'rgba(234,70,29,0.18)');
        glowGrad.addColorStop(1, 'rgba(234,70,29,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, playheadY - 18, W, 36);

        // The line itself
        ctx.strokeStyle = 'rgba(234,70,29,0.9)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(234,70,29,0.8)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, playheadY);
        ctx.lineTo(W, playheadY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Small "NOW" triangle markers on left and right edges
        ctx.fillStyle = 'rgba(234,70,29,0.85)';
        ctx.beginPath();
        ctx.moveTo(0, playheadY - 5);
        ctx.lineTo(0, playheadY + 5);
        ctx.lineTo(8, playheadY);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(W, playheadY - 5);
        ctx.lineTo(W, playheadY + 5);
        ctx.lineTo(W - 8, playheadY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // ---- Cycle progress strip (very top, thin) ----
        const pct = currentPos16 / total16;
        ctx.fillStyle = 'rgba(234,70,29,0.15)';
        ctx.fillRect(0, 0, W, 3);
        ctx.fillStyle = 'rgba(234,70,29,0.6)';
        ctx.fillRect(0, 0, pct * W, 3);

        // ---- Portal loop effects ----
        // Blue portal at the start of cycle (past), Orange at the end (future)
        this._drawPortalEdge(ctx, W, H, performance.now(), 'blue', yBlue);
        this._drawPortalEdge(ctx, W, H, performance.now(), 'orange', yOrange);
    }

    _drawPortalEdge(ctx, W, H, now, color, targetY) {
        const t = now / 1000; // seconds
        const isBlue = color === 'blue';
        const edgeY = targetY;

        // Skip if way off screen
        if (edgeY < -100 || edgeY > H + 100) return;

        // Portal palette
        const coreRgb = isBlue ? '80, 200, 255' : '255, 140, 20';
        const midRgb = isBlue ? '30, 120, 230' : '220, 80, 10';
        const outerRgb = isBlue ? '10, 40, 120' : '100, 20, 5';

        const portalH = Math.min(35, H * 0.09); // 50% smaller glow depth
        const cx = W / 2;

        ctx.save();

        // -- Radial elliptical glow gradient from portal center --
        const grad = ctx.createRadialGradient(cx, edgeY, 0, cx, edgeY, W * 0.7);
        grad.addColorStop(0, `rgba(${coreRgb}, 0.50)`);
        grad.addColorStop(0.30, `rgba(${midRgb},  0.20)`);
        grad.addColorStop(0.70, `rgba(${outerRgb}, 0.08)`);
        grad.addColorStop(1, `rgba(${outerRgb}, 0.00)`);

        // Clip to the glow area (pointing "inward" towards the loop content)
        ctx.beginPath();
        if (isBlue) {
            ctx.rect(0, edgeY - 5, W, portalH + 20);
        } else {
            ctx.rect(0, edgeY - portalH - 20, W, portalH + 25);
        }
        ctx.clip();

        ctx.fillStyle = grad;
        ctx.fillRect(0, edgeY - portalH - 20, W, (portalH + 20) * 2);

        // -- Drifting Portal Sparks --
        const numParticles = 10;
        for (let i = 0; i < numParticles; i++) {
            const seed = (i * 1337) % 1000;
            const px = ((seed / 1000) * W + t * 15 * (i % 2 === 0 ? 1 : -1)) % W;
            const pPhase = (seed / 1000) * Math.PI * 2;
            const pyDist = Math.abs(Math.sin(t * 1.5 + pPhase)) * portalH * 0.9;
            const py = isBlue ? edgeY + pyDist : edgeY - pyDist;
            const pSize = 1.0 + Math.sin(t * 3 + pPhase) * 0.8;
            const pAlpha = 0.2 + 0.3 * Math.abs(Math.cos(t * 2 + pPhase));

            ctx.fillStyle = `rgba(${coreRgb}, ${pAlpha})`;
            ctx.beginPath();
            ctx.arc(px < 0 ? px + W : px, py, pSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // -- Bright rim line at the boundary --
        ctx.shadowColor = `rgba(${coreRgb}, 0.8)`;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(${coreRgb}, 0.7)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, edgeY);
        ctx.lineTo(W, edgeY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // -- Secondary soft inner glow band --
        const bandH = 4;
        const bandGrad = ctx.createLinearGradient(
            0, isBlue ? edgeY : edgeY - bandH,
            0, isBlue ? edgeY + bandH : edgeY
        );
        bandGrad.addColorStop(0, `rgba(${coreRgb}, 0.35)`);
        bandGrad.addColorStop(1, `rgba(${coreRgb}, 0.00)`);
        ctx.fillStyle = bandGrad;
        ctx.fillRect(0, isBlue ? edgeY : edgeY - bandH, W, bandH);

        ctx.restore();
    }

    _drawPadTint(ctx, W, top, h, isLive, yBlue, yOrange, overrideColor, isSelected) {
        // Simple portal blending (mostly opacity based for tints)
        const distFromBlue = Math.abs(top - yBlue);
        const distFromOrange = Math.abs((top + h) - yOrange);
        const portalProximity = 80;

        let noteColor = overrideColor || '#ffcc00';

        ctx.save();

        // Tints should be subtle enough to see the grid and other tints
        ctx.globalAlpha = isLive ? 0.45 : 0.25;
        ctx.fillStyle = noteColor;
        ctx.fillRect(0, top, W, h);

        // Brighter top/bottom edges for definition (lines or section boundaries)
        ctx.globalAlpha = isLive ? 0.7 : 0.4;
        ctx.fillRect(0, top, W, 1);
        ctx.fillRect(0, top + h - 1, W, 1);

        // Quick hits (lines) get a subtle glow only if few notes exist
        if (h < 10 && !isSelected) {
            // No shadow for bulk pad hits
            ctx.shadowBlur = 0;
            ctx.fillRect(0, top, W, h);
        }

        if (isSelected) {
            ctx.shadowColor = noteColor;
            ctx.shadowBlur = 15;
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(1, top, W - 2, h);
            ctx.setLineDash([]);
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    _fillNoteRect(ctx, x, kw, top, h, isLive, yBlue, yOrange, isDragging, isSelected, overrideColor = null) {
        const pad = 2;
        const rx = x + pad;
        const rw = Math.max(kw - pad * 2, 4);
        const r = 2; // corner radius

        // Proximity to portals shifts color
        // yBlue = blue portal, yOrange = orange portal
        const distFromBlue = Math.abs(top - yBlue);
        const distFromOrange = Math.abs((top + h) - yOrange);
        const portalProximity = 80; // pixels range

        let noteColor = overrideColor || (isLive ? '#ffcc00' : 'rgba(234,70,29,0.93)');
        let shadowColor = overrideColor || (isLive ? '#ffcc00' : 'rgba(234,70,29,0.7)');

        if (distFromBlue < portalProximity) {
            const factor = 1 - (distFromBlue / portalProximity);
            // Blend with portal blue (80, 200, 255)
            noteColor = isLive ? '#ffcc00' : `rgba(${234 * (1 - factor) + 80 * factor}, ${70 * (1 - factor) + 200 * factor}, ${29 * (1 - factor) + 255 * factor}, 0.95)`;
            shadowColor = `rgba(80, 200, 255, ${0.4 + factor * 0.6})`;
        } else if (distFromOrange < portalProximity) {
            const factor = 1 - (distFromOrange / portalProximity);
            // Blend with portal orange (255, 140, 20)
            noteColor = isLive ? '#ffcc00' : `rgba(${234 * (1 - factor) + 255 * factor}, ${70 * (1 - factor) + 140 * factor}, ${29 * (1 - factor) + 20 * factor}, 0.95)`;
            shadowColor = `rgba(255, 140, 20, ${0.4 + factor * 0.6})`;
        }

        ctx.fillStyle = noteColor;

        // Performance: Only use shadows for high-priority notes
        if (isDragging || isSelected || isLive) {
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = (isDragging || isSelected) ? 20 : 12;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.moveTo(rx + r, top);
        ctx.lineTo(rx + rw - r, top);
        ctx.quadraticCurveTo(rx + rw, top, rx + rw, top + r);
        ctx.lineTo(rx + rw, top + h - r);
        ctx.quadraticCurveTo(rx + rw, top + h, rx + rw - r, top + h);
        ctx.lineTo(rx + r, top + h);
        ctx.quadraticCurveTo(rx, top + h, rx, top + h - r);
        ctx.lineTo(rx, top + r);
        ctx.quadraticCurveTo(rx, top, rx + r, top);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        if (isDragging || isSelected) {
            ctx.strokeStyle = isDragging ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            if (isSelected && !isDragging) ctx.setLineDash([4, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.shadowBlur = 0;
    }

    _renderLoopShelf() {
        this.song.renderLoopBank();
    }

    _setupLoopControls(win) {
        const el = win.element;

        // BPM
        const bpmInput = el.querySelector('#fm-bpm');
        if (bpmInput) {
            bpmInput.value = this.seq.bpm;
            bpmInput.addEventListener('change', () => {
                const newBpm = Math.max(40, Math.min(240, parseInt(bpmInput.value) || 120));
                this.syncBpm(newBpm);
            });
            bpmInput.addEventListener('keydown', (e) => {
                if (['e', 'E', '.', '-', '+'].includes(e.key)) e.preventDefault();
            });
        }

        // Loop length input
        const barsInput = el.querySelector('#fm-loop-bars');
        if (barsInput) {
            barsInput.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 2;
                this.seq.loopBars = val;
                this._updateLoopUI();
                // Redraw canvas immediately to show the change in length
                if (this._rollCanvas) this._drawRollCanvas(this.seq.scrollPos);
            });
            barsInput.addEventListener('keydown', (e) => {
                if (['e', 'E'].includes(e.key)) e.preventDefault();
            });
        }

        const quantizeSelect = win.element.querySelector('#fm-drum-quantize');
        if (quantizeSelect) {
            quantizeSelect.addEventListener('change', (e) => {
                this.seq.drumQuantize = e.target.value;
            });
        }
        // Roll toggle (spacebar also handles this)
        el.querySelector('#fm-roll-toggle')?.addEventListener('click', () => {
            this.seq.toggleRoll();
        });

        // Loop tool button - Removed (Now handled by direct dragging/stamping)

        // Set loop end button - Removed

        // Metronome toggle
        el.querySelector('#fm-metronome-btn')?.addEventListener('click', () => {
            this.seq.metronomeEnabled = !this.seq.metronomeEnabled;
            this._updateLoopUI();
        });

        // Publish to Desktop
        el.querySelector('#fm-publish-btn')?.addEventListener('click', () => {
            this.publishSong();
        });

        // Clear notes
        el.querySelector('#fm-clear-btn')?.addEventListener('click', () => {
            this.seq.clearNotes();
            this._selectedNote = null;
            this._updateLoopUI();
            this._drawRollCanvas(this.seq.scrollPos);
        });

        // Save loop
        el.querySelector('#fm-save-loop-btn')?.addEventListener('click', async () => {
            if (this.seq.recNotes.length === 0) return;

            const defaultName = `Funk Loop ${this.seq.savedLoops.length + 1}`;
            const name = await this.wm.prompt("Name your loop:", defaultName, { title: 'SAVE LOOP' });
            if (name === null) return; // cancelled

            const loop = this.seq.saveLoop(name || defaultName);
            if (loop) {
                this._persistLoops();
                this._renderLoopShelf();
                this._animateSuckToTab(el.querySelector('#fm-save-loop-btn'));
                this._selectedNote = null;
            }
            this._updateLoopUI();
        });

        // Randomize buttons
        el.querySelector('#fm-rand-melody-btn')?.addEventListener('click', () => {
            if (this.seq.recNotes.length === 0) return;
            this.seq.randomMelody(this.keyMap);
            this._drawRollCanvas(this.seq.scrollPos);
        });

        el.querySelector('#fm-rand-chords-btn')?.addEventListener('click', () => {
            if (this.seq.recNotes.length === 0) return;
            this.seq.randomChords(this.keyMap);
            this._drawRollCanvas(this.seq.scrollPos);
        });

        // Init canvas
        this._initRollCanvas(win);
        this._setupCanvasInteractions(win);
        this._updateLoopUI();
    }

    _setupCanvasInteractions(win) {
        const canvas = this._rollCanvas;
        if (!canvas) return;

        this._draggingNote = null;
        this._dragStartInfo = null;

        canvas.addEventListener('pointerdown', (e) => {
            // Blur any focused input when clicking canvas
            if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                document.activeElement.blur();
            }

            const x = e.offsetX;
            const y = e.offsetY;

            const noteResult = this._getNoteAt(x, y);
            if (noteResult) {
                const { note } = noteResult;
                this._draggingNote = note;
                this._selectedNote = note;
                const total16 = this.seq.getTotalLength16();
                const pxPer16 = canvas.height / 48;
                const relY = y - canvas.height / 2;
                const clickPos16 = (this.seq.scrollPos + (relY / pxPer16) + total16) % total16;

                this._dragStartInfo = {
                    x, y,
                    noteStart16: note.start16,
                    noteEnd16: note.end16,
                    clickPos16: clickPos16,
                    initialKey: note.key,
                    duration16: ((note.end16 - note.start16) % total16 + total16) % total16 || 0.5
                };
                canvas.setPointerCapture(e.pointerId);

                // Play the note on grab using its original DNA
                const isPad = this.keyMap[note.key]?.type === 'pad';
                this.synth.playNote(note.key, note.freq, isPad, note.synthSnapshot);
                setTimeout(() => this.synth.stopNote(note.key, false, null), 150);
            } else {
                this._selectedNote = null;
                if (!this.seq.isRolling) this._drawRollCanvas(this.seq.scrollPos);
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            const x = e.offsetX;
            const y = e.offsetY;

            if (!this._draggingNote) {
                // Update cursor based on hover
                const hover = this._getNoteAt(x, y);
                canvas.style.cursor = hover ? 'move' : '';
                return;
            }

            // --- Move ---
            const total16 = this.seq.getTotalLength16();
            const pxPer16 = canvas.height / 48;
            const relY = y - canvas.height / 2;
            const currentClickPos16 = (this.seq.scrollPos + (relY / pxPer16) + total16) % total16;

            // Calculate delta in 16ths, handling wrap-around
            let delta16 = currentClickPos16 - this._dragStartInfo.clickPos16;
            if (delta16 > total16 / 2) delta16 -= total16;
            if (delta16 < -total16 / 2) delta16 += total16;

            // --- Horizontal Move (Pitch/Instrument) ---
            let foundKey = null;
            const isDraggingPad = this.keyMap[this._draggingNote.key]?.type === 'pad';

            if (!isDraggingPad) {
                for (let i = 0; i < this._keyXPositions.length; i++) {
                    const key = this.looperOrder[i];
                    const keyData = this.keyMap[key];
                    if (keyData.type === 'pad') continue; // Only piano notes can swap lanes here

                    const kX = this._keyXPositions[i];
                    const kW = this._keyWidths[i];
                    if (x >= kX && x <= kX + kW) {
                        foundKey = key;
                        break;
                    }
                }

                if (foundKey && foundKey !== this._draggingNote.key) {
                    const data = this.keyMap[foundKey];
                    this._draggingNote.key = foundKey;
                    this._draggingNote.note = data.note;
                    this._draggingNote.freq = data.freq;
                    this.synth.playNote(foundKey, data.freq, false, this._draggingNote.synthSnapshot);
                    setTimeout(() => this.synth.stopNote(foundKey), 100);
                }
            }


            // --- Vertical Move (Time) ---
            let newStart16 = (this._dragStartInfo.noteStart16 + delta16 + total16) % total16;
            newStart16 = this.seq.quantizeNote(newStart16);

            this._draggingNote.start16 = newStart16;
            this._draggingNote.end16 = (newStart16 + this._dragStartInfo.duration16) % total16 || total16;


            if (!this.seq.isRolling) {
                this._drawRollCanvas(this.seq.scrollPos);
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (this._draggingNote) {
                this.seq.onStateChange();
                this._draggingNote = null;
                this._dragStartInfo = null;
                canvas.releasePointerCapture(e.pointerId);
            }
        });
    }

    _getNoteAt(x, y) {
        if (!this._rollCanvas) return null;
        const total16 = this.seq.getTotalLength16();
        const pxPer16 = this._rollCanvas.height / 48;
        const H = this._rollCanvas.height;
        const playheadY = H / 2;
        const currentPos16 = this.seq.scrollPos;

        const getY = (pos16) => {
            let diff = ((pos16 - currentPos16 + total16 / 2) % total16 + total16) % total16 - total16 / 2;
            return playheadY + diff * pxPer16;
        };

        // 1. Find lane for piano notes
        let pianoKey = null;
        if (this._keyXPositions && this._keyWidths) {
            for (let i = 0; i < this._keyXPositions.length; i++) {
                const kX = this._keyXPositions[i];
                const kW = this._keyWidths[i];
                if (x >= kX && x <= kX + kW) {
                    const key = this.looperOrder[i];
                    if (this.keyMap[key] && this.keyMap[key].type !== 'pad') {
                        pianoKey = key;
                        break;
                    }
                }
            }
        }

        // 2. Pass 1: Look for piano notes in the correct lane (Foreground)
        if (pianoKey) {
            for (let i = this.seq.recNotes.length - 1; i >= 0; i--) {
                const note = this.seq.recNotes[i];
                if (note.key !== pianoKey) continue;

                const yStartBase = getY(note.start16);
                const dur16 = ((note.end16 - note.start16) % total16 + total16) % total16 || 0.5;
                const noteH = Math.max(dur16 * pxPer16, 4);
                const portalDist = total16 * pxPer16;
                const yBases = [yStartBase, yStartBase - portalDist, yStartBase + portalDist];

                for (const yStart of yBases) {
                    if (y >= yStart && y <= yStart + noteH) {
                        return { note, edge: 'middle' };
                    }
                }
            }
        }

        // 3. Pass 2: Look for pad notes (Background layers)
        for (let i = this.seq.recNotes.length - 1; i >= 0; i--) {
            const note = this.seq.recNotes[i];
            const keyData = this.keyMap[note.key];
            if (keyData?.type !== 'pad') continue;

            const yStartBase = getY(note.start16);
            const dur16 = ((note.end16 - note.start16) % total16 + total16) % total16 || 0.5;
            const noteH = Math.max(dur16 * pxPer16, 4);
            const portalDist = total16 * pxPer16;
            const yBases = [yStartBase, yStartBase - portalDist, yStartBase + portalDist];

            for (const yStart of yBases) {
                if (y >= yStart && y <= yStart + noteH) {
                    return { note, edge: 'middle' };
                }
            }
        }
        return null;
    }

    _initRollCanvas(win) {
        const canvas = win.element.querySelector('#fm-roll-canvas');
        if (!canvas) return;

        this._rollCanvas = canvas;
        this._rollCtx = canvas.getContext('2d');

        // Size canvas to its container and sync key layout from DOM
        const resizeAndSync = () => {
            const container = canvas.parentElement;
            if (!container) return;
            canvas.width = container.offsetWidth;
            canvas.height = container.offsetHeight;
            // Try DOM sync first (accurate); fall back to calculated layout
            if (!this._syncKeyLayoutFromDOM()) this._buildKeyLayout(canvas.width);
            this._drawRollCanvas(this.seq.scrollPos);
        };

        this._rollResizeObserver = new ResizeObserver(resizeAndSync);
        this._rollResizeObserver.observe(canvas.parentElement);
        resizeAndSync();
        // Re-sync once layout has settled (fonts, borders measured)
        requestAnimationFrame(resizeAndSync);
    }

    // Read the *actual rendered* key positions from the DOM.
    // This guarantees canvas lanes align with the real keyboard regardless of
    // padding, scaling, or black-key overlap.
    _syncKeyLayoutFromDOM() {
        if (!this.winRef || !this._rollCanvas) return false;
        const keyEls = Array.from(
            this.winRef.element.querySelectorAll('.piano-key, .pad')
        );
        if (keyEls.length === 0) return false;

        const canvasRect = this._rollCanvas.getBoundingClientRect();
        this._keyXPositions = [];
        this._keyWidths = [];

        // looperOrder matches the DOM order of .piano-key and .pad elements
        keyEls.forEach(el => {
            const r = el.getBoundingClientRect();
            this._keyXPositions.push(r.left - canvasRect.left);
            this._keyWidths.push(r.width);
        });
        return this._keyXPositions.length === this.looperOrder.length;
    }

    _buildKeyLayout(totalWidth) {
        // Fallback when DOM keys are not yet laid out
        const keyWidths = this.keysOrder.map(k => this.keyMap[k].type === 'white' ? 60 : 40);
        const rawTotal = keyWidths.reduce((a, b) => a + b, 0);
        const scale = totalWidth / rawTotal;
        this._keyWidths = keyWidths.map(w => w * scale);
        this._keyXPositions = [];
        let x = 0;
        this._keyWidths.forEach(w => { this._keyXPositions.push(x); x += w; });
    }

    render() {
        let keysHtml = '';
        this.keysOrder.forEach(keyChar => {
            const data = this.keyMap[keyChar];
            const className = data.type === 'white' ? 'white-key' : 'black-key';
            keysHtml += `
                <div class="piano-key ${className}" data-key="${keyChar}" draggable="true">
                    <div class="key-label">${keyChar.toUpperCase()}</div>
                    <div class="note-label">${data.note}</div>
                </div>
            `;
        });

        let padsHtml = '';
        this.padsOrder.forEach(keyChar => {
            const data = this.keyMap[keyChar];
            const setClass = data.isSet ? 'set' : '';
            padsHtml += `
                <div class="pad ${setClass}" data-key="${keyChar}" style="--pad-color: ${data.color}">
                    <div class="pad-label">${keyChar.toUpperCase()}</div>
                    <div class="note-label">${data.note}</div>
                </div>
            `;
        });

        return `
            <div class="funk-maker-container">
                <div class="fm-tab-bar">
                    <div class="fm-tabs">
                        <button class="fm-tab-btn active" data-tab="synth">
                            <span class="fm-tab-icon">🎛</span>
                            <span class="fm-tab-label">SYNTH</span>
                        </button>
                        <button class="fm-tab-btn" data-tab="loop">
                            <span class="fm-tab-icon">⏺</span>
                            <span class="fm-tab-label">LOOP</span>
                        </button>
                        <button class="fm-tab-btn" data-tab="song">
                            <span class="fm-tab-icon">🎞</span>
                            <span class="fm-tab-label">SONG</span>
                        </button>
                    </div>

                    <div class="fm-publish-group">
                        <div class="fm-input-wrapper">
                            <label class="fm-input-label" for="fm-song-name">File name:</label>
                            <input type="text" class="fm-song-input" id="fm-song-name" placeholder="required" value="" maxlength="40">
                        </div>
                        <div class="fm-input-wrapper">
                            <label class="fm-input-label" for="fm-song-producer">From:</label>
                            <input type="text" class="fm-song-input" id="fm-song-producer" placeholder="optional" value="" maxlength="20">
                        </div>
                        <button class="fm-publish-btn" id="fm-publish-btn" title="Save to Desktop Cloud">Save to Cloud</button>
                    </div>
                </div>

                <div class="fm-panels-container">
                    <div class="fm-panel fm-panel--active" data-panel="synth">
                        <div class="funk-maker-scroll-area">
                            <div class="synth-controls"></div>
                        </div>
                    </div>

                    <div class="fm-panel" data-panel="loop" style="display:none">
                        ${this._renderLoopPanel()}
                    </div>

                    <div class="fm-panel" data-panel="song" style="display:none">
                        ${this._renderSongPanel()}
                    </div>
                </div>

                <div class="funk-maker-footer">
                    <div class="keyboard-unit">
                        <div class="piano-row">${keysHtml}</div>
                        <div class="pads-row">${padsHtml}</div>
                    </div>
                </div>
            </div>
        `;
    }

    _renderLoopPanel() {
        return `
            <div class="fm-loop-panel">

                <!-- Upper toolbar -->
                <div class="fm-loop-toolbar">
                    <div class="fm-transport-group">
                        <span class="fm-transport-label">BPM</span>
                        <input type="number" class="fm-bpm-input" id="fm-bpm" value="${this.seq.bpm}" min="40" max="240" />
                    </div>
                    <div class="fm-transport-group">
                        <span class="fm-transport-label">BARS</span>
                        <input type="number" class="fm-bpm-input" id="fm-loop-bars" value="${this.seq.loopBars}" min="0.5" max="300" step="0.5" />
                    </div>
                    <div class="fm-transport-group">
                        <span class="fm-transport-label">QUANTIZE</span>
                        <select class="fm-bpm-input" id="fm-drum-quantize" style="width: auto; padding-right: 20px;">
                            <option value="off" ${this.seq.drumQuantize === 'off' ? 'selected' : ''}>OFF</option>
                            <option value="1/16" ${this.seq.drumQuantize === '1/16' ? 'selected' : ''}>1/16</option>
                            <option value="1/8" ${this.seq.drumQuantize === '1/8' ? 'selected' : ''}>1/8</option>
                            <option value="1/4" ${this.seq.drumQuantize === '1/4' ? 'selected' : ''}>1/4</option>
                        </select>
                    </div>

                    <!-- Roll toggle: starts/stops the looper clock -->
                    <button class="fm-roll-toggle" id="fm-roll-toggle">▶ ROLL</button>

                    <!-- Tool buttons -->
                    <div class="fm-loop-tools">
                        <button class="fm-tool-btn" id="fm-metronome-btn" title="Metronome Toggle">
                            <span class="fm-tool-icon">⏳</span>
                            <span class="fm-tool-label">MET</span>
                        </button>
                    </div>

                    <div class="fm-transport-group" style="margin-left:auto; flex-direction: column; gap:6px; align-items: flex-end;">
                        <div style="display: flex; gap: 6px;">
                            <button class="fm-transport-btn fm-clear-btn" id="fm-clear-btn">🗑 Clear</button>
                            <button class="fm-transport-btn" id="fm-save-loop-btn">💾 Save</button>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="fm-transport-btn randomize-btn" id="fm-rand-melody-btn" style="padding: 2px 8px; font-size: 10px;">🎲 Melody</button>
                            <button class="fm-transport-btn randomize-btn" id="fm-rand-chords-btn" style="padding: 2px 8px; font-size: 10px;">🎹 Chords</button>
                        </div>
                    </div>
                </div>

                <!-- The roll: canvas fills everything down to the piano keys -->
                <div class="fm-roll-stage" id="fm-roll-stage">
                    <canvas class="fm-roll-canvas" id="fm-roll-canvas"></canvas>
                    <div class="fm-roll-head" id="fm-roll-head"></div>
                    <div class="fm-roll-info" id="fm-roll-info">
                        <span class="fm-roll-status" id="fm-roll-status"></span>
                        <span class="fm-roll-hint">SPACE = roll · ↑↓ = nudge · CLICK to select · BACKSPACE = remove</span>
                    </div>
                </div>


            </div>
        `;
    }


    _renderSongPanel() {
        return this.song.renderSongPanel();
    }

    async publishSong() {
        if (!this.winRef) return;
        const el = this.winRef.element;

        // 1. Validation: At least one clip on timeline
        const hasClips = this.song.tracks.some(t => t.clips.length > 0);
        if (!hasClips) {
            this.wm.alert("Your song timeline is empty! Record some loops and drag them onto the tracks in the SONG tab first.", "Blank Song Error");
            return;
        }

        const songName = el.querySelector('#fm-song-name')?.value.trim() || "Untitled Funk";
        const producer = el.querySelector('#fm-song-producer')?.value.trim() || "Anonymous";

        // 2. Serialize
        const songData = {
            version: "1.0",
            name: songName,
            producer: producer,
            bpm: this.seq.bpm,
            bars: this.song.totalBars,
            tracks: this.song.tracks.map(t => ({
                id: t.id,
                name: t.name,
                volume: t.volume,
                clips: t.clips.map(c => ({
                    id: c.id,
                    start16: c.start16,
                    duration16: c.duration16,
                    offset16: c.offset16,
                    loop: c.loop
                }))
            }))
        };

        const fileName = `${songName}.song`;
        const content = MEDIA_STAMP + JSON.stringify(songData);

        try {
            const publishBtn = el.querySelector('#fm-publish-btn');
            publishBtn.disabled = true;
            publishBtn.textContent = "⌛ SAVING...";

            await saveMessage(fileName, content, { fromName: producer });

            this.wm.alert(`"${songName}" has been saved to the cloud!`, "Success");

            publishBtn.disabled = false;
            publishBtn.textContent = "Save to Cloud";
        } catch (error) {
            console.error("Saving failed:", error);
            this.wm.alert("Failed to save song: " + error.message, "Error");
            const publishBtn = el.querySelector('#fm-publish-btn');
            if (publishBtn) {
                publishBtn.disabled = false;
                publishBtn.textContent = "Save to Cloud";
            }
        }
    }

    _animateSuckToTab(sourceEl) {
        if (!sourceEl || !this.winRef) return;

        const songTabBtn = this.winRef.element.querySelector('.fm-tab-btn[data-tab="song"]');
        if (!songTabBtn) return;

        const startRect = sourceEl.getBoundingClientRect();
        const endRect = songTabBtn.getBoundingClientRect();

        const flyer = document.createElement('div');
        flyer.className = 'fm-suck-anim';
        flyer.style.left = `${startRect.left}px`;
        flyer.style.top = `${startRect.top}px`;
        flyer.style.width = `${startRect.width}px`;
        flyer.style.height = `${startRect.height}px`;
        document.body.appendChild(flyer);

        // Force reflow
        flyer.offsetHeight;

        // Transition to tab position and shrink
        flyer.style.left = `${endRect.left + endRect.width / 2}px`;
        flyer.style.top = `${endRect.top + endRect.height / 2}px`;
        flyer.style.width = '0px';
        flyer.style.height = '0px';
        flyer.style.opacity = '0';

        flyer.addEventListener('transitionend', () => {
            flyer.remove();
            // Glow the tab
            songTabBtn.classList.add('glow');
            setTimeout(() => songTabBtn.classList.remove('glow'), 800);
        }, { once: true });
    }

    setupEventListeners(win) {
        const element = win.element;
        this._activePointers = new Map(); // pointerId -> key

        element.addEventListener('pointerdown', (e) => {
            const interactiveEl = e.target.closest('.piano-key, .pad');
            if (interactiveEl) {
                // Blur focused inputs when playing keys
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    document.activeElement.blur();
                }

                const key = interactiveEl.dataset.key;
                let data = { ...this.keyMap[key] };

                const isPad = data.type === 'pad';

                if (!isPad && this.octave !== 0) {
                    data.freq = data.freq * Math.pow(2, this.octave);
                }

                // Handle unset pads: play note from key above
                if (isPad && !data.isSet) {
                    const keyAbove = this.unsetPadMapping[key];
                    if (keyAbove && this.keyMap[keyAbove]) {
                        data.note = this.keyMap[keyAbove].note;
                        data.freq = this.keyMap[keyAbove].freq;
                    }
                }

                // CRITICAL: Do not set pointer capture for piano keys 
                // if we want to allow native drag-and-drop to start.
                if (!interactiveEl.classList.contains('piano-key')) {
                    interactiveEl.setPointerCapture(e.pointerId);
                }

                this._activePointers.set(e.pointerId, key);
                this.seq.noteOn(key, data, this.activeTab === 'loop');
                interactiveEl.classList.add('active');
            }
        });

        element.addEventListener('pointerup', (e) => {
            const key = this._activePointers.get(e.pointerId);
            if (key) {
                this.seq.noteOff(key);
                element.querySelector(`.piano-key[data-key="${key}"], .pad[data-key="${key}"]`)?.classList.remove('active');
                this._activePointers.delete(e.pointerId);
            }
        });

        element.addEventListener('pointercancel', (e) => {
            const key = this._activePointers.get(e.pointerId);
            if (key) {
                // If this is a piano key, it might be about to start a drag.
                // We wait a moment to check if the 'dragging' class gets added in dragstart.
                // If not, we stop the note.
                setTimeout(() => {
                    const el = element.querySelector(`.piano-key[data-key="${key}"], .pad[data-key="${key}"]`);
                    const isActuallyDragging = el && el.classList.contains('dragging');
                    if (!isActuallyDragging) {
                        this.seq.noteOff(key);
                        el?.classList.remove('active');
                        this._activePointers.delete(e.pointerId);
                    }
                }, 50);
            }
        });

        // PAD DRAG & DROP
        const handleDragStart = (e) => {
            const keyEl = e.target.closest('.piano-key');
            if (keyEl) {
                const key = keyEl.dataset.key;
                e.dataTransfer.setData('application/funkmaker-key', key);
                e.dataTransfer.effectAllowed = 'copy';
                keyEl.classList.add('dragging');
            }
        };

        const handleDragEnd = (e) => {
            const keyEl = e.target.closest('.piano-key');
            if (keyEl) {
                keyEl.classList.remove('dragging');
                const key = keyEl.dataset.key;
                if (key) {
                    this.seq.noteOff(key);
                    keyEl.classList.remove('active');
                    // Also clear it from active pointers in case it was there
                    for (let [pid, k] of this._activePointers.entries()) {
                        if (k === key) this._activePointers.delete(pid);
                    }
                }
            }
        };

        const handleDragOver = (e) => {
            const pad = e.target.closest('.pad');
            if (pad) {
                e.preventDefault(); // Necessary to allow drop
                e.dataTransfer.dropEffect = 'copy';
                pad.classList.add('drag-over');
            }
        };

        const handleDragEnter = (e) => {
            const pad = e.target.closest('.pad');
            if (pad) {
                e.preventDefault();
                pad.classList.add('drag-over');
            }
        };

        const handleDragLeave = (e) => {
            const pad = e.target.closest('.pad');
            if (pad) {
                pad.classList.remove('drag-over');
            }
        };

        const handleDrop = (e) => {
            const padEl = e.target.closest('.pad');
            if (padEl) {
                e.preventDefault();
                padEl.classList.remove('drag-over');
                const sourceKeyChar = e.dataTransfer.getData('application/funkmaker-key');
                if (sourceKeyChar) {
                    const padKeyChar = padEl.dataset.key;
                    const sourceData = this.keyMap[sourceKeyChar];
                    const padData = this.keyMap[padKeyChar];

                    if (sourceData && padData) {
                        // Capture!
                        const snapshot = this.synth.snapshot();

                        // Force drum trigger for pad snapshots
                        snapshot.synthSettings.triggerMode = true;

                        padData.note = sourceData.note;
                        let targetFreq = sourceData.freq;
                        if (this.octave !== 0) {
                            targetFreq *= Math.pow(2, this.octave);
                        }
                        padData.freq = targetFreq;
                        padData.color = padData.targetColor;
                        padData.isSet = true;

                        // Notify synth engine
                        this.synth.setKeySnapshot(padKeyChar, snapshot);

                        // Update Visuals
                        padEl.style.setProperty('--pad-color', padData.color);
                        padEl.classList.add('set');

                        // Small flash or sound to confirm
                        this.synth.playNote(padKeyChar, padData.freq, true);
                        setTimeout(() => this.synth.stopNote(padKeyChar), 200);
                    }
                }
            }
        };

        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('dragend', handleDragEnd);
        element.addEventListener('dragenter', handleDragEnter);
        element.addEventListener('dragover', handleDragOver);
        element.addEventListener('dragleave', handleDragLeave);
        element.addEventListener('drop', handleDrop);

        const handleKeyDown = (e) => {
            if (e.repeat) return;
            const key = e.key.toLowerCase();
            if (!this.keyMap[key]) return;

            // Focus handling: if an input is focused, typing a key should blur it 
            // so the keyboard shortcuts work and the input doesn't get junk.
            // BUT: we don't want to steal focus from text inputs where the user is typing!
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA')) {
                const isTextInput = (document.activeElement.tagName === 'INPUT' && (document.activeElement.type === 'text' || !document.activeElement.type)) ||
                    document.activeElement.tagName === 'TEXTAREA';

                if (isTextInput) return; // Let the user type in text fields!

                document.activeElement.blur();
            }

            let data = { ...this.keyMap[key] };

            if (data.type !== 'pad' && this.octave !== 0) {
                data.freq = data.freq * Math.pow(2, this.octave);
            }

            if (parseInt(win.element.style.zIndex) >= this.wm.highestZIndex) {
                const isPad = data.type === 'pad';

                // Handle unset pads: play note from key above
                if (isPad && !data.isSet) {
                    const keyAbove = this.unsetPadMapping[key];
                    if (keyAbove && this.keyMap[keyAbove]) {
                        data.note = this.keyMap[keyAbove].note;
                        data.freq = this.keyMap[keyAbove].freq;
                    }
                }

                this.seq.noteOn(key, data, this.activeTab === 'loop');
                element.querySelector(`.piano-key[data-key="${key}"], .pad[data-key="${key}"]`)?.classList.add('active');
            }
        };
        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap[key]) {
                this.seq.noteOff(key);
                element.querySelector(`.piano-key[data-key="${key}"], .pad[data-key="${key}"]`)?.classList.remove('active');
            }
        };

        const handleBlur = () => {
            this._clearAllKeys();
        };

        const handleLoopKeyDown = (e) => {
            // Only handle loop-specific keys when loop tab is active
            if (this.activeTab !== 'loop') return;
            if (e.target.tagName === 'INPUT') return; // don't steal input focus

            if (e.code === 'Space') {
                e.preventDefault();
                this.seq.toggleRoll();
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                this.seq.nudgeScroll(-1); // nudge backward 1 sixteenth
                this._drawRollCanvas(this.seq.scrollPos);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                this.seq.nudgeScroll(1);  // nudge forward 1 sixteenth
                this._drawRollCanvas(this.seq.scrollPos);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                if (this._selectedNote) {
                    const idx = this.seq.recNotes.indexOf(this._selectedNote);
                    if (idx !== -1) {
                        this.seq.recNotes.splice(idx, 1);
                        this._selectedNote = null;
                        this.seq.onStateChange();
                        if (!this.seq.isRolling) this._drawRollCanvas(this.seq.scrollPos);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('keydown', handleLoopKeyDown);
        window.addEventListener('blur', handleBlur);
        this._setupLoopControls(win);

        const originalClose = win.close;
        win.close = () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('keydown', handleLoopKeyDown);
            window.removeEventListener('blur', handleBlur);
            this._clearAllKeys();
            if (this._rollResizeObserver) this._rollResizeObserver.disconnect();
            originalClose();
        };
    }

    _clearAllKeys() {
        this.seq.stopAll(true);
        if (this._activePointers) this._activePointers.clear();
        if (this.winRef) {
            this.winRef.element.querySelectorAll('.piano-key, .pad').forEach(el => {
                el.classList.remove('active');
            });
        }
    }
}
