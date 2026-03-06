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
            volume: 0.2,
            triggerMode: false
        };

        this.availableVoices = {
            sine: { type: 'sine', ratio: 1, gain: 0.5, detune: 0, active: true, pitchSweep: 0, sweepDuration: 0.1 },
            square: { type: 'square', ratio: 1, gain: 0.3, detune: 0, active: false, pitchSweep: 0, sweepDuration: 0.1 },
            sawtooth: { type: 'sawtooth', ratio: 0.5, gain: 0.3, detune: 0, active: false, pitchSweep: 0, sweepDuration: 0.1 },
            triangle: { type: 'triangle', ratio: 2, gain: 0.3, detune: 0, active: false, pitchSweep: 0, sweepDuration: 0.1 },
            noise: { type: 'noise', ratio: 1, gain: 0.3, detune: 0, active: false, pitchSweep: 0, sweepDuration: 0.1 }
        };

        this.presets = {
            'init': {
                name: 'Clean Slate',
                voices: { sine: { active: true, ratio: 1, gain: 0.5, detune: 0, pitchSweep: 0, sweepDuration: 0.1 } },
                settings: { cutoff: 10000, attack: 0.01, release: 0.1, fmDepth: 0, detune: 0 }
            },
            '8bit': {
                name: '8-Bit',
                voices: { square: { active: true, ratio: 1, gain: 0.4, detune: 5, pitchSweep: 0, sweepDuration: 0.1 } },
                settings: { cutoff: 8000, attack: 0.001, release: 0.1, fmDepth: 0, detune: 0 }
            },
            'string': {
                name: 'String',
                voices: {
                    sawtooth: { active: true, ratio: 1, gain: 0.3, detune: 10 },
                    triangle: { active: true, ratio: 1.01, gain: 0.3, detune: -10 }
                },
                settings: { cutoff: 4000, attack: 0.15, release: 0.6, fmDepth: 0, detune: 0 }
            },
            'alien': {
                name: 'Alien',
                voices: {
                    sine: { active: true, ratio: 2.5, gain: 0.4, pitchSweep: 400, sweepDuration: 0.4 },
                    sawtooth: { active: true, ratio: 0.5, gain: 0.2, pitchSweep: -200, sweepDuration: 0.2 }
                },
                settings: { cutoff: 3000, attack: 0.05, release: 0.4, fmDepth: 200, fmRatio: 4.5, detune: 0 }
            },
            'creepy': {
                name: 'Creepy',
                voices: {
                    sine: { active: true, ratio: 1, gain: 0.4, detune: 50 },
                    sawtooth: { active: true, ratio: 0.51, gain: 0.2, detune: -30 }
                },
                settings: { cutoff: 1200, attack: 0.5, release: 1.0, fmDepth: 150, fmRatio: 0.33, detune: 200 }
            },
            'joy': {
                name: 'Joy',
                voices: {
                    sine: { active: true, ratio: 1, gain: 0.4 },
                    triangle: { active: true, ratio: 2, gain: 0.3 }
                },
                settings: { cutoff: 8000, attack: 0.01, release: 0.1, fmDepth: 50, fmRatio: 2.0, detune: 0 }
            },
            'bop': {
                name: 'Bop',
                voices: {
                    square: { active: true, ratio: 1, gain: 0.5, detune: 2 }
                },
                settings: { cutoff: 5000, attack: 0.005, release: 0.15, fmDepth: 0, detune: 0 }
            },
            'organ': {
                name: 'Organ',
                voices: {
                    sine: { active: true, ratio: 1, gain: 0.4, detune: 0 },
                    triangle: { active: true, ratio: 0.5, gain: 0.3, detune: 0 }
                },
                settings: { cutoff: 3000, attack: 0.1, release: 0.5, fmDepth: 20, detune: 0 }
            },
            'saw': {
                name: 'Saw',
                voices: { sawtooth: { active: true, ratio: 1, gain: 0.4, detune: 10 } },
                settings: { cutoff: 5000, attack: 0.02, release: 0.2, fmDepth: 0, detune: 0 }
            },
            'neon': {
                name: 'Lead',
                voices: {
                    sawtooth: { active: true, ratio: 1, gain: 0.4, detune: 5 },
                    triangle: { active: true, ratio: 2, gain: 0.3, detune: -5 }
                },
                settings: { cutoff: 5000, attack: 0.01, release: 0.2, fmDepth: 20, fmRatio: 2.0, detune: 0 }
            },
            'kick': {
                name: 'Kick',
                voices: {
                    sine: { active: true, ratio: 0.5, gain: 0.9, pitchSweep: -150, sweepDuration: 0.3 }
                },
                settings: { cutoff: 1000, attack: 0.001, release: 0.5, fmDepth: 0, detune: 0 }
            },
            'snare': {
                name: 'Snare',
                voices: {
                    noise: { active: true, ratio: 1, gain: 0.7, pitchSweep: 0, sweepDuration: 0.1 },
                    sine: { active: true, ratio: 0.8, gain: 0.4, pitchSweep: -100, sweepDuration: 0.1 }
                },
                settings: { cutoff: 6000, attack: 0.001, release: 0.2, fmDepth: 0, detune: 0 }
            },
            'hat': {
                name: 'Hi-Hat',
                voices: {
                    noise: { active: true, ratio: 1, gain: 0.5, pitchSweep: 0, sweepDuration: 0.1 }
                },
                settings: { cutoff: 10000, attack: 0.001, release: 0.05, fmDepth: 0, detune: 0 }
            },
            'tom': {
                name: 'Floor Tom',
                voices: {
                    sine: { active: true, ratio: 0.35, gain: 0.8, pitchSweep: -100, sweepDuration: 0.2 },
                    triangle: { active: true, ratio: 0.36, gain: 0.2, pitchSweep: -100, sweepDuration: 0.2 }
                },
                settings: { cutoff: 800, attack: 0.001, release: 0.4, fmDepth: 10, fmRatio: 2, detune: 0 }
            },
            'cowbell': {
                name: 'Cowbell',
                voices: {
                    square: { active: true, ratio: 2.1, gain: 0.4, detune: 5 },
                    square2: { active: true, ratio: 3.2, gain: 0.3, detune: -5 }
                },
                settings: { cutoff: 3000, attack: 0.001, release: 0.1, fmDepth: 0, detune: 0 }
            },
            'tri': {
                name: 'Triangle',
                voices: {
                    sine: { active: true, ratio: 4.0, gain: 0.6, detune: 0 }
                },
                settings: { cutoff: 12000, attack: 0.001, release: 0.3, fmDepth: 0, detune: 0 }
            },
            'crash': {
                name: 'Crash',
                voices: {
                    noise: { active: true, ratio: 1, gain: 0.8 }
                },
                settings: { cutoff: 1000, attack: 0.001, release: 1.5, fmDepth: 500, fmRatio: 1.5, detune: 0 }
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

        if (!this.noiseBuffer && this.audioCtx) {
            // Create a 2-second buffer of white noise
            const bufferSize = this.audioCtx.sampleRate * 2;
            this.noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
            const output = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        }
    }

    open() {
        const content = this.render();
        const win = this.wm.createWindow('Funk Maker 3000', content);

        // Adjust window size to fit keyboard
        win.element.style.width = '750px';
        win.element.style.height = '600px';
        win.minWidth = 750;
        win.minHeight = 400;

        // Add Synthesis Controls using UI library
        this.addControls(win);

        this.setupEventListeners(win);

        // Warm up the audio context immediately on open
        this.initAudio();

        // Load default preset (Clean Slate)
        this.loadPreset('init');
        this.updateGlobalControlsValues(win);
        this.renderBuilder();

        return win;
    }

    addControls(win) {
        const container = win.element.querySelector('.synth-controls');
        if (!container) return;

        // --- PRESETS SECTION ---
        const presetsRow = document.createElement('div');
        presetsRow.className = 'presets-row';

        const presetLabel = document.createElement('span');
        presetLabel.className = 'ui-label';
        presetLabel.textContent = 'Presets:';
        presetsRow.appendChild(presetLabel);

        Object.keys(this.presets).forEach(key => {
            const btn = UI.createButton(this.presets[key].name, () => {
                this.loadPreset(key);
                this.renderBuilder();
                this.updateGlobalControlsValues(win);

                // Highlight selected preset btn
                presetsRow.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            btn.classList.add('preset-btn');
            if (key === 'init') btn.classList.add('active');
            presetsRow.appendChild(btn);
        });

        // --- RANDOMIZE ---
        const randBtn = UI.createButton('🎲 Randomize', () => {
            this.randomize(win);
            presetsRow.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        });
        randBtn.classList.add('preset-btn', 'randomize-btn');
        presetsRow.appendChild(randBtn);

        container.appendChild(presetsRow);

        // --- GLOBAL CONTROLS SECTION ---
        const globalSection = UI.createSection('Global Settings');
        container.appendChild(globalSection);

        // Cutoff
        container.appendChild(UI.createSlider('Filter', 20, 10000, this.synthSettings.cutoff, (val) => {
            const numVal = parseInt(val);
            this.synthSettings.cutoff = numVal;
            this.updateGlobalParams('filter', numVal);
        }));

        // FM Ratio
        container.appendChild(UI.createSlider('FM Ratio', 5, 100, this.synthSettings.fmRatio * 10, (val) => {
            const numVal = val / 10;
            this.synthSettings.fmRatio = numVal;
            this.updateGlobalParams('fmRatio', numVal);
        }));

        // FM Depth
        container.appendChild(UI.createSlider('FM Depth', 0, 1000, this.synthSettings.fmDepth, (val) => {
            const numVal = parseInt(val);
            this.synthSettings.fmDepth = numVal;
            this.updateGlobalParams('fmDepth', numVal);
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
            const numVal = parseInt(val);
            this.synthSettings.detune = numVal;
            this.updateGlobalParams('masterDetune', numVal);
        }));

        // Volume
        container.appendChild(UI.createSlider('Volume', 0, 100, this.synthSettings.volume * 100, (val) => {
            this.synthSettings.volume = val / 100;
            if (this.masterGain) {
                this.masterGain.gain.setTargetAtTime(this.synthSettings.volume, this.audioCtx.currentTime, 0.05);
            }
        }));

        // Trigger Mode Checkbox
        container.appendChild(UI.createCheckbox('Drum Trigger Mode', this.synthSettings.triggerMode, (val) => {
            this.synthSettings.triggerMode = val;
        }));
        // Builder Container (always on now, but content updates)
        this.builderContainer = document.createElement('div');
        this.builderContainer.className = 'instrument-builder';
        container.parentElement.insertBefore(this.builderContainer, container.nextSibling);
        this.renderBuilder();
    }

    randomize(win) {
        // Randomize Global Settings
        this.synthSettings.triggerMode = Math.random() < 0.25;
        this.synthSettings.cutoff = Math.floor(200 + Math.random() * 8000);
        this.synthSettings.fmRatio = Math.round((0.5 + Math.random() * 8) * 10) / 10;
        this.synthSettings.fmDepth = Math.floor(Math.random() * 800);
        if (this.synthSettings.triggerMode) {
            this.synthSettings.attack = Math.round(Math.random() * 0.2 * 100) / 100; // 0 to 0.2
            this.synthSettings.release = Math.round((0.05 + Math.random() * 0.25) * 100) / 100; // 0.05 to 0.3
        } else {
            this.synthSettings.attack = Math.round(Math.random() * 1.5 * 100) / 100;
            this.synthSettings.release = Math.round((0.1 + Math.random() * 2) * 100) / 100;
        }
        this.synthSettings.detune = Math.floor(Math.random() * 1000 - 500);

        // Randomize Voices
        const types = ['sine', 'square', 'sawtooth', 'triangle', 'noise'];
        let activeCount = 0;
        types.forEach(type => {
            const active = Math.random() > 0.5;
            this.availableVoices[type].active = active;
            if (active) activeCount++;

            this.availableVoices[type].ratio = Math.round((0.1 + Math.random() * 3.9) * 100) / 100;
            this.availableVoices[type].detune = Math.floor(Math.random() * 100 - 50);
            this.availableVoices[type].gain = Math.round((0.1 + Math.random() * 0.4) * 100) / 100;

            // Randomize Sweep
            this.availableVoices[type].pitchSweep = Math.floor(Math.random() * 800 - 400);
            this.availableVoices[type].sweepDuration = Math.round((0.01 + Math.random() * 0.5) * 100) / 100;
        });

        // Ensure at least one voice is active
        if (activeCount === 0) {
            this.availableVoices.sine.active = true;
        }

        this.updateActiveVoices();
        this.renderBuilder();
        this.updateGlobalControlsValues(win);
        this.updateToolbarUI();

        // Bonus: if there are active notes, update them immediately
        this.updateGlobalParams('filter', this.synthSettings.cutoff);
        this.updateGlobalParams('fmRatio', this.synthSettings.fmRatio);
        this.updateGlobalParams('fmDepth', this.synthSettings.fmDepth);
        this.updateGlobalParams('masterDetune', this.synthSettings.detune);
    }

    updateToolbarUI() {
        const toolbar = document.querySelector('.ui-toolbar');
        if (toolbar) {
            const btns = toolbar.querySelectorAll('.ui-tool-button');
            const types = ['sine', 'square', 'sawtooth', 'triangle', 'noise'];
            btns.forEach((btn, i) => {
                const type = types[i];
                if (type) btn.classList.toggle('selected', this.availableVoices[type].active);
            });
        }
    }

    loadPreset(key) {
        const preset = this.presets[key];
        if (!preset) return;

        // Auto-check trigger mode for drums
        const isDrum = ['kick', 'snare', 'hat', 'tom', 'cowbell', 'tri', 'crash'].includes(key);
        this.synthSettings.triggerMode = isDrum;

        // Reset all voices to inactive first
        Object.keys(this.availableVoices).forEach(vk => {
            const av = this.availableVoices[vk];
            av.active = false;
            av.pitchSweep = 0;
            av.sweepDuration = 0.1;
            // Also reset ratio/gain/detune if they are not in the preset? 
            // Actually let's just reset the ones we added recently.
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
                av.pitchSweep = pv.pitchSweep !== undefined ? pv.pitchSweep : 0;
                av.sweepDuration = pv.sweepDuration !== undefined ? pv.sweepDuration : 0.1;
            }
        });

        // Apply preset settings
        Object.keys(preset.settings).forEach(sk => {
            this.synthSettings[sk] = preset.settings[sk];
        });

        // Immediately update live params for active notes
        this.updateGlobalParams('filter', this.synthSettings.cutoff);
        this.updateGlobalParams('fmRatio', this.synthSettings.fmRatio);
        this.updateGlobalParams('fmDepth', this.synthSettings.fmDepth);
        this.updateGlobalParams('masterDetune', this.synthSettings.detune);

        this.updateActiveVoices();
        this.updateToolbarUI();
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

        // Update Checkboxes
        const checkboxes = win.element.querySelectorAll('.ui-checkbox');
        checkboxes.forEach(cb => {
            const labelEl = cb.parentElement.querySelector('.ui-label');
            if (labelEl && labelEl.textContent === 'Drum Trigger Mode') {
                cb.checked = this.synthSettings.triggerMode;
            }
        });
    }

    renderBuilder() {
        if (!this.builderContainer) return;
        this.builderContainer.innerHTML = '';

        const activeVoices = Object.keys(this.availableVoices).filter(k => this.availableVoices[k].active);

        // --- TOOLBAR SECTION ---
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

        types.forEach(t => {
            const btn = UI.createToolButton(null, t.title, (e, b) => {
                this.availableVoices[t.type].active = !this.availableVoices[t.type].active;
                b.classList.toggle('selected', this.availableVoices[t.type].active);
                this.updateActiveVoices();
                this.renderBuilder();
            }, { selected: this.availableVoices[t.type].active });

            const iconSpan = document.createElement('span');
            iconSpan.textContent = t.icon;
            iconSpan.className = 'ui-tool-icon-text';
            btn.appendChild(iconSpan);

            toolbar.appendChild(btn);
        });
        toolbarContainer.appendChild(toolbar);
        this.builderContainer.appendChild(toolbarContainer);

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
                const normVal = parseFloat(val);
                voice.ratio = normVal;
                this.updateLiveVoices(type, 'ratio', normVal);
            }, 0.01);
            voiceRow.appendChild(ratioSlider);

            // Detune
            const detuneSlider = UI.createSlider('Detune', -100, 100, voice.detune, (val) => {
                const normVal = parseFloat(val);
                voice.detune = normVal;
                this.updateLiveVoices(type, 'detune', normVal);
            });
            voiceRow.appendChild(detuneSlider);

            // Volume
            const volumeSlider = UI.createSlider('Volume', 0, 100, voice.gain * 100, (val) => {
                const normVal = parseFloat(val) / 100;
                voice.gain = normVal;
                this.updateLiveVoices(type, 'gain', normVal);
            });
            voiceRow.appendChild(volumeSlider);

            // Pitch Sweep (New)
            const sweepSlider = UI.createSlider('Sweep Range', -500, 500, voice.pitchSweep || 0, (val) => {
                voice.pitchSweep = parseInt(val);
            });
            voiceRow.appendChild(sweepSlider);

            // Sweep Time (New)
            const sweepTimeSlider = UI.createSlider('Sweep Time', 0.01, 1.0, voice.sweepDuration || 0.1, (val) => {
                voice.sweepDuration = parseFloat(val);
            }, 0.01);
            voiceRow.appendChild(sweepTimeSlider);

            voicesContainer.appendChild(voiceRow);
        });

        this.builderContainer.appendChild(voicesContainer);
    }

    updateGlobalParams(param, value) {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        Object.values(this.activeOscillators).forEach(active => {
            if (param === 'filter' && active.filter) {
                active.filter.frequency.setTargetAtTime(value, now, 0.05);
            }
            if (active.voices) {
                active.voices.forEach(v => {
                    if (param === 'masterDetune') {
                        const totalDetune = value + (v.voiceDetune || 0);
                        if (v.carrier && v.carrier.detune) v.carrier.detune.setTargetAtTime(totalDetune, now, 0.05);
                    } else if (param === 'fmRatio' && v.baseFreq && v.modulator) {
                        v.modulator.frequency.setTargetAtTime(v.baseFreq * (v.voiceRatio || 1) * value, now, 0.05);
                    } else if (param === 'fmDepth' && v.modGain) {
                        v.modGain.gain.setTargetAtTime(value, now, 0.05);
                    }
                });
            }
        });
    }

    updateLiveVoices(voiceType, param, value) {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        Object.values(this.activeOscillators).forEach(active => {
            if (active.voices) {
                active.voices.forEach(v => {
                    if (v.voiceType === voiceType) {
                        if (param === 'gain') {
                            v.gain.gain.setTargetAtTime(value, now, 0.05);
                        } else if (param === 'detune' && v.carrier && v.carrier.detune) {
                            v.voiceDetune = value;
                            const totalDetune = (this.synthSettings.detune || 0) + value;
                            v.carrier.detune.setTargetAtTime(totalDetune, now, 0.05);
                        } else if (param === 'ratio') {
                            v.voiceRatio = value;
                            if (v.baseFreq && v.carrier && v.carrier.frequency) {
                                v.carrier.frequency.setTargetAtTime(v.baseFreq * value, now, 0.05);
                                if (v.modulator) v.modulator.frequency.setTargetAtTime(v.baseFreq * value * this.synthSettings.fmRatio, now, 0.05);
                            }
                        }
                    }
                });
            }
        });
    }

    openNewFile() {
        return this.open();
    }

    render() {
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

        const handleKeyDown = (e) => {
            if (e.repeat) return;
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

        const voices = [];
        const voiceGain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.synthSettings.cutoff, now);
        filter.Q.setValueAtTime(1, now);

        instrument.voices.forEach(v => {
            let carrier, modulator, modGain;
            const g = this.audioCtx.createGain();
            const freq = data.freq * v.ratio;

            if (v.type === 'noise') {
                carrier = this.audioCtx.createBufferSource();
                carrier.buffer = this.noiseBuffer;
                carrier.loop = true;
            } else {
                carrier = this.audioCtx.createOscillator();
                modulator = this.audioCtx.createOscillator();
                modGain = this.audioCtx.createGain();

                if (v.type instanceof PeriodicWave) {
                    carrier.setPeriodicWave(v.type);
                } else {
                    carrier.type = v.type;
                }

                carrier.frequency.setValueAtTime(freq, now);
                carrier.detune.setValueAtTime((this.synthSettings.detune || 0) + (v.detune || 0), now);

                if (v.pitchSweep && v.pitchSweep !== 0) {
                    const sweepTime = Math.max(0.01, v.sweepDuration || 0.1);
                    carrier.frequency.exponentialRampToValueAtTime(Math.max(0.01, freq + v.pitchSweep), now + sweepTime);
                }

                modulator.type = 'sine';
                modulator.frequency.setValueAtTime(freq * this.synthSettings.fmRatio, now);
                modGain.gain.setValueAtTime(this.synthSettings.fmDepth, now);

                modulator.connect(modGain);
                modGain.connect(carrier.frequency);
                modulator.start(now);
            }

            g.gain.setValueAtTime(v.gain, now);
            carrier.connect(g);
            g.connect(filter);
            carrier.start(now);

            voices.push({
                carrier,
                modulator,
                modGain,
                gain: g,
                voiceType: v.type,
                baseFreq: data.freq,
                voiceRatio: v.ratio,
                voiceDetune: v.detune
            });
        });

        filter.connect(voiceGain);
        voiceGain.connect(this.masterGain);

        voiceGain.gain.setValueAtTime(0, now);
        voiceGain.gain.linearRampToValueAtTime(1, now + Math.max(0.001, this.synthSettings.attack));

        this.activeOscillators[key] = { voices, voiceGain, filter };
        if (element) element.classList.add('active');

        // Handle Trigger Mode (one-shot)
        if (this.synthSettings.triggerMode) {
            const release = Math.max(0.01, this.synthSettings.release);
            const attack = Math.max(0.001, this.synthSettings.attack);
            voiceGain.gain.exponentialRampToValueAtTime(0.001, now + attack + release);

            setTimeout(() => {
                this.stopNote(key, element);
            }, (attack + release) * 1000 + 50);
        }
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
            if (v.modulator) v.modulator.stop(now + releaseTime);
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
