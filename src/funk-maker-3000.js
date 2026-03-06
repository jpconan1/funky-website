import { WindowManager } from './window-manager.js';
import { UI } from './ui-components.js';

export class FunkMaker3000 {
    constructor(windowManager) {
        this.wm = windowManager;
        this.audioCtx = null;
        this.activeOscillators = {};
        this.masterGain = null;

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
            "'": { note: 'F5', freq: 698.46, type: 'white' }
        };

        this.keysOrder = [
            'a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"
        ];

        // Synth State
        this.synthSettings = {
            instrument: 'custom',
            attack: 0.05,
            release: 0.3,
            cutoff: 4000,
            fmRatio: 2,
            fmDepth: 50,
            detune: 0,
            volume: 0.2
        };

        this.availableVoices = {
            sine: { type: 'sine', ratio: 1, gain: 0.5, detune: 0, active: true },
            square: { type: 'square', ratio: 1, gain: 0.3, detune: 0, active: false },
            sawtooth: { type: 'sawtooth', ratio: 0.5, gain: 0.3, detune: 0, active: false },
            triangle: { type: 'triangle', ratio: 2, gain: 0.3, detune: 0, active: false }
        };

        this.presets = {
            'init': {
                name: 'Clean Slate',
                voices: { sine: { active: true, ratio: 1, gain: 0.5, detune: 0 } },
                settings: { cutoff: 10000, attack: 0.01, release: 0.1, fmDepth: 0 }
            },
            'classic': {
                name: 'Classic Sine',
                voices: { sine: { active: true, ratio: 1, gain: 0.5, detune: 0 } },
                settings: { cutoff: 4000, attack: 0.05, release: 0.3, fmDepth: 0 }
            },
            '8bit': {
                name: '8-Bit Pulse',
                voices: { square: { active: true, ratio: 1, gain: 0.4, detune: 5 } },
                settings: { cutoff: 8000, attack: 0.001, release: 0.1, fmDepth: 0 }
            },
            'organ': {
                name: 'Space Organ',
                voices: {
                    sine: { active: true, ratio: 1, gain: 0.4, detune: 0 },
                    triangle: { active: true, ratio: 0.5, gain: 0.3, detune: 0 }
                },
                settings: { cutoff: 3000, attack: 0.1, release: 0.5, fmDepth: 20 }
            },
            'saw': {
                name: 'Aggressive Saw',
                voices: { sawtooth: { active: true, ratio: 1, gain: 0.4, detune: 10 } },
                settings: { cutoff: 5000, attack: 0.02, release: 0.2, fmDepth: 0 }
            },
            'dream': {
                name: 'Dream Pad',
                voices: {
                    triangle: { active: true, ratio: 1, gain: 0.4, detune: 0 },
                    sine: { active: true, ratio: 1.5, gain: 0.2, detune: 5 }
                },
                settings: { cutoff: 2000, attack: 0.4, release: 0.8, fmDepth: 30 }
            }
        };

        this.instruments = {
            'custom': {
                name: 'Custom Synth',
                voices: [] // Populated dynamically
            }
        };
        this.updateActiveVoices();
        this.builderContainer = null;
    }

    generateScribble() {
        this.initAudio();
        const n = 64; // complexity of the scribble
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        // Harmonic 0 is DC offset, keep it 0
        for (let i = 1; i < n; i++) {
            real[i] = (Math.random() * 2 - 1) / i; // higher harmonics have less energy
            imag[i] = (Math.random() * 2 - 1) / i;
        }
        const wave = this.audioCtx.createPeriodicWave(real, imag);
        this.instruments.scribble.voices[0].type = wave;
    }

    updateActiveVoices() {
        this.instruments.custom.voices = Object.values(this.availableVoices).filter(v => v.active);
    }

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive'
            });
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 0.2;
            this.masterGain.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    open() {
        const content = this.render();
        const win = this.wm.createWindow('Funk Maker 3000', content);

        // Adjust window size to fit keyboard
        win.element.style.width = '750px';
        win.element.style.height = '600px';

        // Add Synthesis Controls using UI library
        this.addControls(win);

        this.setupEventListeners(win);

        // Warm up the audio context immediately on open
        this.initAudio();

        return win;
    }

    addControls(win) {
        const container = win.element.querySelector('.synth-controls');
        if (!container) return;

        // --- PRESETS SECTION ---
        const presetOptions = Object.keys(this.presets).map(key => ({
            label: this.presets[key].name,
            value: key
        }));

        container.appendChild(UI.createDropdown('Presets', presetOptions, (val) => {
            this.loadPreset(val);
            this.renderBuilder(); // Refresh the voice sliders
            // We also need to refresh the global sliders? 
            // Better to just re-render the whole controls or update them.
            // For now, let's just make sure the values are updated.
            this.updateGlobalControlsValues(win);
        }));

        // --- TOOLBAR SECTION ---
        const toolbarLabel = document.createElement('label');
        toolbarLabel.textContent = 'Oscillators';
        toolbarLabel.className = 'ui-label';
        container.appendChild(toolbarLabel);

        const toolbar = UI.createToolbar(4);
        const types = [
            { type: 'sine', icon: '〰️', title: 'Sine' },
            { type: 'square', icon: '⬛', title: 'Square' },
            { type: 'sawtooth', icon: '🪚', title: 'Sawtooth' },
            { type: 'triangle', icon: '🔺', title: 'Triangle' }
        ];

        types.forEach(t => {
            const btn = UI.createToolButton(null, t.title, (e, b) => {
                this.availableVoices[t.type].active = !this.availableVoices[t.type].active;
                b.classList.toggle('selected', this.availableVoices[t.type].active);
                this.updateActiveVoices();
                this.renderBuilder();
            }, { selected: this.availableVoices[t.type].active });

            // Add custom content to button since we don't have images
            const iconSpan = document.createElement('span');
            iconSpan.textContent = t.icon;
            iconSpan.className = 'ui-tool-icon-text';
            btn.appendChild(iconSpan);

            toolbar.appendChild(btn);
        });
        container.appendChild(toolbar);

        // --- GLOBAL CONTROLS SECTION ---
        const globalSection = UI.createSection('Global Settings');
        container.appendChild(globalSection);

        // Cutoff
        container.appendChild(UI.createSlider('Filter', 20, 10000, this.synthSettings.cutoff, (val) => {
            this.synthSettings.cutoff = parseInt(val);
        }));

        // FM Ratio
        container.appendChild(UI.createSlider('FM Ratio', 5, 100, this.synthSettings.fmRatio * 10, (val) => {
            this.synthSettings.fmRatio = val / 10;
        }));

        // FM Depth
        container.appendChild(UI.createSlider('FM Depth', 0, 1000, this.synthSettings.fmDepth, (val) => {
            this.synthSettings.fmDepth = parseInt(val);
        }));

        // Attack
        container.appendChild(UI.createSlider('Attack', 0, 200, this.synthSettings.attack * 100, (val) => {
            this.synthSettings.attack = val / 100;
        }));

        // Release
        container.appendChild(UI.createSlider('Release', 0, 300, this.synthSettings.release * 100, (val) => {
            this.synthSettings.release = val / 100;
        }));

        // Detune
        container.appendChild(UI.createSlider('Master Detune', -1200, 1200, this.synthSettings.detune, (val) => {
            this.synthSettings.detune = parseInt(val);
        }));

        // Volume
        container.appendChild(UI.createSlider('Volume', 0, 100, this.synthSettings.volume * 100, (val) => {
            this.synthSettings.volume = val / 100;
            if (this.masterGain) {
                this.masterGain.gain.setTargetAtTime(this.synthSettings.volume, this.audioCtx.currentTime, 0.05);
            }
        }));
        // Builder Container (always on now, but content updates)
        this.builderContainer = document.createElement('div');
        this.builderContainer.className = 'instrument-builder';
        container.parentElement.insertBefore(this.builderContainer, container.nextSibling);
        this.renderBuilder();
    }

    loadPreset(key) {
        const preset = this.presets[key];
        if (!preset) return;

        // Reset all voices to inactive first
        Object.keys(this.availableVoices).forEach(vk => {
            this.availableVoices[vk].active = false;
        });

        // Apply preset voices
        Object.keys(preset.voices).forEach(vk => {
            const pv = preset.voices[vk];
            const av = this.availableVoices[vk];
            if (av) {
                av.active = true;
                av.ratio = pv.ratio !== undefined ? pv.ratio : av.ratio;
                av.gain = pv.gain !== undefined ? pv.gain : av.gain;
                av.detune = pv.detune !== undefined ? pv.detune : av.detune;
            }
        });

        // Apply preset settings
        Object.keys(preset.settings).forEach(sk => {
            if (this.synthSettings[sk] !== undefined) {
                this.synthSettings[sk] = preset.settings[sk];
            }
        });

        this.updateActiveVoices();

        // Update ToolButtons UI (brute force since we don't hold refs yet)
        const toolbar = document.querySelector('.ui-toolbar');
        if (toolbar) {
            const btns = toolbar.querySelectorAll('.ui-tool-button');
            const types = ['sine', 'square', 'sawtooth', 'triangle'];
            btns.forEach((btn, i) => {
                const type = types[i];
                btn.classList.toggle('selected', this.availableVoices[type].active);
            });
        }
    }

    updateGlobalControlsValues(win) {
        // This is a bit hacky - updating UI values after preset load
        const sliders = win.element.querySelectorAll('.ui-slider');
        sliders.forEach(slider => {
            const labelArea = slider.parentElement.querySelector('.ui-label-area');
            if (!labelArea) return;
            const label = labelArea.querySelector('.ui-label').textContent;
            const display = labelArea.querySelector('.ui-value-display');

            let val = null;
            if (label === 'Filter') val = this.synthSettings.cutoff;
            if (label === 'Attack') val = this.synthSettings.attack * 100;
            if (label === 'Release') val = this.synthSettings.release * 100;
            if (label === 'FM Depth') val = this.synthSettings.fmDepth;
            if (label === 'FM Ratio') val = this.synthSettings.fmRatio * 10;
            if (label === 'Master Detune') val = this.synthSettings.detune;
            if (label === 'Volume') val = this.synthSettings.volume * 100;

            if (val !== null) {
                slider.value = val;
                display.textContent = val;
            }
        });
    }

    renderBuilder() {
        if (!this.builderContainer) return;
        this.builderContainer.innerHTML = '';

        const activeVoices = Object.keys(this.availableVoices).filter(k => this.availableVoices[k].active);

        if (activeVoices.length === 0) {
            this.builderContainer.innerHTML = '<p class="ui-label" style="opacity: 0.5; padding: 20px; text-align: center;">Choose an oscillator from the toolbar above to start making noise.</p>';
            return;
        }

        const section = UI.createSection('Oscillator Settings');
        this.builderContainer.appendChild(section);

        const voicesContainer = document.createElement('div');
        voicesContainer.className = 'voices-list';

        activeVoices.forEach((type) => {
            const voice = this.availableVoices[type];
            const voiceRow = document.createElement('div');
            voiceRow.className = 'voice-row';

            // Label
            const label = document.createElement('div');
            label.className = 'ui-label';
            label.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            label.style.gridColumn = '1 / -1';
            label.style.fontWeight = 'bold';
            voiceRow.appendChild(label);

            // Ratio
            const ratioSlider = UI.createSlider('Freq Ratio', 0.1, 4.0, voice.ratio, (val) => {
                voice.ratio = parseFloat(val);
            }, 0.01);
            voiceRow.appendChild(ratioSlider);

            // Detune
            const detuneSlider = UI.createSlider('Detune', -100, 100, voice.detune, (val) => {
                voice.detune = parseFloat(val);
            });
            voiceRow.appendChild(detuneSlider);

            voicesContainer.appendChild(voiceRow);
        });

        this.builderContainer.appendChild(voicesContainer);
    }

    openNewFile() {
        return this.open();
    }

    render() {
        // We want to group keys for layout
        // A (W) S (E) D F (T) G (Y) H (U) J K (O) L (P) ; '

        let keysHtml = '';
        this.keysOrder.forEach(keyChar => {
            const data = this.keyMap[keyChar];
            const className = data.type === 'white' ? 'white-key' : 'black-key';
            keysHtml += `
                <div class="piano-key ${className}" data-key="${keyChar}">
                    <div class="key-label">${keyChar.toUpperCase()}</div>
                </div>
            `;
        });

        return `
            <div class="funk-maker-container">
                <div class="funk-maker-scroll-area">
                    <div class="synth-controls">
                        <!-- UI library will inject here -->
                    </div>
                </div>
                <div class="funk-maker-footer">
                    <div class="keyboard">
                        ${keysHtml}
                    </div>
                    <div class="piano-status">PRESS KEYS TO PLAY</div>
                </div>
            </div>
        `;
    }

    setupEventListeners(win) {
        const element = win.element;

        element.addEventListener('pointerdown', (e) => {
            const keyElement = e.target.closest('.piano-key');
            if (keyElement) {
                const key = keyElement.dataset.key;
                this.playNote(key, keyElement);
            }
        });

        element.addEventListener('pointerup', (e) => {
            const keyElement = e.target.closest('.piano-key');
            if (keyElement) {
                const key = keyElement.dataset.key;
                this.stopNote(key, keyElement);
            }
        });

        element.addEventListener('pointerleave', (e) => {
            const keyElement = e.target.closest('.piano-key');
            if (keyElement) {
                const key = keyElement.dataset.key;
                this.stopNote(key, keyElement);
            }
        });

        // Keyboard events - these need to be global or attached to the window
        const handleKeyDown = (e) => {
            if (e.repeat) return; // Prevent stuttering from auto-repeat

            // Check if this window is currently focused (highest z-index)
            const winZ = parseInt(win.element.style.zIndex);
            if (winZ >= this.wm.highestZIndex && this.keyMap[e.key.toLowerCase()]) {
                const key = e.key.toLowerCase();
                const keyElement = element.querySelector(`.piano-key[data-key="${key}"]`);
                this.playNote(key, keyElement);
            }
        };

        const handleKeyUp = (e) => {
            if (this.keyMap[e.key.toLowerCase()]) {
                const key = e.key.toLowerCase();
                const keyElement = element.querySelector(`.piano-key[data-key="${key}"]`);
                this.stopNote(key, keyElement);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Clean up listeners when window is closed
        const originalClose = win.close.bind(win);
        win.close = () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            this.stopAllNotes();
            originalClose();
        };
    }

    playNote(key, element) {
        this.initAudio();
        if (this.activeOscillators[key]) return;

        const data = this.keyMap[key];
        if (!data) return;

        const now = this.audioCtx.currentTime;
        const instrument = this.instruments[this.synthSettings.instrument];

        // Voice Group Architecture: Voices -> Shared Filter -> Shared Gain -> Master
        const voices = [];
        const voiceGain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.synthSettings.cutoff, now);
        filter.Q.setValueAtTime(1, now);

        instrument.voices.forEach(v => {
            const carrier = this.audioCtx.createOscillator();
            const modulator = this.audioCtx.createOscillator();
            const modGain = this.audioCtx.createGain();
            const g = this.audioCtx.createGain();

            const freq = data.freq * v.ratio;

            // Carrier setup
            if (v.type instanceof PeriodicWave) {
                carrier.setPeriodicWave(v.type);
            } else {
                carrier.type = v.type;
            }

            carrier.frequency.setValueAtTime(freq, now);
            carrier.detune.setValueAtTime((this.synthSettings.detune || 0) + (v.detune || 0), now);

            // Modulator setup
            modulator.type = 'sine';
            modulator.frequency.setValueAtTime(freq * this.synthSettings.fmRatio, now);
            modGain.gain.setValueAtTime(this.synthSettings.fmDepth, now);

            // Connections for FM
            // Modulator -> ModGain -> Carrier Frequency
            modulator.connect(modGain);
            modGain.connect(carrier.frequency);

            g.gain.setValueAtTime(v.gain, now);

            carrier.connect(g);
            g.connect(filter);

            carrier.start(now);
            modulator.start(now);

            voices.push({ carrier, modulator, gain: g });
        });

        filter.connect(voiceGain);
        voiceGain.connect(this.masterGain);

        // Env Attack
        voiceGain.gain.setValueAtTime(0, now);
        voiceGain.gain.linearRampToValueAtTime(1, now + Math.max(0.001, this.synthSettings.attack));

        this.activeOscillators[key] = { voices, voiceGain, filter };
        if (element) element.classList.add('active');
    }

    stopNote(key, element) {
        const active = this.activeOscillators[key];
        if (!active) return;

        const { voices, voiceGain } = active;
        const now = this.audioCtx.currentTime;
        const releaseTime = Math.max(0.01, this.synthSettings.release);

        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

        voices.forEach(v => {
            v.carrier.stop(now + releaseTime);
            v.modulator.stop(now + releaseTime);
        });

        delete this.activeOscillators[key];
        if (element) element.classList.remove('active');
    }

    stopAllNotes() {
        Object.keys(this.activeOscillators).forEach(key => {
            this.stopNote(key);
        });
    }
}
