export class SynthEngine {
    constructor() {
        this.listeners = {};
        this._waveData = null; // Lazy-init wavetable data
        this.audioCtx = null;
        this.activeVoices = new Map(); // voiceId -> voice record
        this.keyToLatestVoiceId = {}; // key -> voiceId
        this.masterGain = null;
        this.noiseBuffer = null;
        this.keySnapshots = {}; // Per-key snapshots (for pads)

        this.synthSettings = {
            instrument: 'custom',
            attack: 0.05,
            release: 0.3,
            cutoff: 4000,
            fmRatio: 2,
            fmDepth: 50,
            detune: 0,
            volume: 0.8,
            triggerMode: false,
            morphSpeed: 15,
            playMode: 'wavetable'
        };

        this.oscillatorOrder = ['sine', 'square', 'sawtooth', 'triangle', 'noise'];

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
                settings: { cutoff: 10000, attack: 0.01, release: 0.1, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            '8bit': {
                name: '8-Bit',
                voices: { square: { active: true, ratio: 1, gain: 0.4, detune: 5, pitchSweep: 0, sweepDuration: 0.1 } },
                settings: { cutoff: 8000, attack: 0.001, release: 0.1, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'string': {
                name: 'String',
                voices: {
                    sawtooth: { active: true, ratio: 1, gain: 0.3, detune: 10 },
                    triangle: { active: true, ratio: 1.01, gain: 0.3, detune: -10 }
                },
                settings: { cutoff: 4000, attack: 0.15, release: 0.6, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'alien': {
                name: 'Alien',
                voices: {
                    sine: { active: true, ratio: 4.5, gain: 0.4, pitchSweep: 1200, sweepDuration: 0.6 },
                    square: { active: true, ratio: 0.5, gain: 0.2, pitchSweep: -800, sweepDuration: 0.4 }
                },
                settings: { cutoff: 4500, attack: 0.08, release: 1.2, fmDepth: 550, fmRatio: 3.7, detune: 10, playMode: 'modulate' }
            },
            'bass': {
                name: 'Bass',
                voices: {
                    sawtooth: { active: true, ratio: 0.5, gain: 0.6, detune: 5 },
                    triangle: { active: true, ratio: 0.501, gain: 0.4, detune: -5 }
                },
                settings: { cutoff: 800, attack: 0.02, release: 0.4, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'joy': {
                name: 'Joy',
                voices: {
                    sine: { active: true, ratio: 1, gain: 0.4 },
                    sawtooth: { active: true, ratio: 2, gain: 0.25, detune: 4 }
                },
                settings: { cutoff: 12000, attack: 0.01, release: 0.2, fmDepth: 120, fmRatio: 2.0, detune: 0, playMode: 'overlap' }
            },
            'bop': {
                name: 'Bop',
                voices: {
                    triangle: { active: true, ratio: 1, gain: 0.6, pitchSweep: -150, sweepDuration: 0.08 }
                },
                settings: { cutoff: 6500, attack: 0.002, release: 0.12, fmDepth: 10, fmRatio: 1.0, detune: 0, playMode: 'overlap' }
            },
            'organ': {
                name: 'Organ',
                voices: {
                    sine: { active: true, ratio: 1, gain: 0.4, detune: 0 },
                    triangle: { active: true, ratio: 0.5, gain: 0.3, detune: 0 }
                },
                settings: { cutoff: 3000, attack: 0.1, release: 0.5, fmDepth: 20, detune: 0, playMode: 'overlap' }
            },
            'saw': {
                name: 'Saw',
                voices: { sawtooth: { active: true, ratio: 1, gain: 0.4, detune: 10 } },
                settings: { cutoff: 5000, attack: 0.02, release: 0.2, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'neon': {
                name: 'Lead',
                voices: {
                    sawtooth: { active: true, ratio: 1, gain: 0.4, detune: 5 },
                    triangle: { active: true, ratio: 2, gain: 0.3, detune: -5 }
                },
                settings: { cutoff: 5000, attack: 0.01, release: 0.2, fmDepth: 20, fmRatio: 2.0, detune: 0, playMode: 'overlap' }
            },
            'kick': {
                name: 'Kick',
                voices: {
                    sine: { active: true, ratio: 0.5, gain: 0.9, pitchSweep: -150, sweepDuration: 0.3 }
                },
                settings: { cutoff: 1000, attack: 0.001, release: 0.5, fmDepth: 0, detune: 0, playMode: 'wavetable' }
            },
            'snare': {
                name: 'Snare',
                voices: {
                    noise: { active: true, ratio: 1, gain: 0.7, pitchSweep: 0, sweepDuration: 0.1 },
                    sine: { active: true, ratio: 0.8, gain: 0.4, pitchSweep: -100, sweepDuration: 0.1 }
                },
                settings: { cutoff: 6000, attack: 0.001, release: 0.2, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'hat': {
                name: 'Hi-Hat',
                voices: {
                    noise: { active: true, ratio: 1, gain: 0.5, pitchSweep: 0, sweepDuration: 0.1 }
                },
                settings: { cutoff: 10000, attack: 0.001, release: 0.05, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'tom': {
                name: 'Floor Tom',
                voices: {
                    sine: { active: true, ratio: 0.35, gain: 0.8, pitchSweep: -100, sweepDuration: 0.2 },
                    triangle: { active: true, ratio: 0.36, gain: 0.2, pitchSweep: -100, sweepDuration: 0.2 }
                },
                settings: { cutoff: 800, attack: 0.001, release: 0.4, fmDepth: 10, fmRatio: 2, detune: 0, playMode: 'wavetable' }
            },
            'cowbell': {
                name: 'Cowbell',
                voices: {
                    square: { active: true, ratio: 2.1, gain: 0.4, detune: 5 },
                    square2: { active: true, ratio: 3.2, gain: 0.3, detune: -5 }
                },
                settings: { cutoff: 3000, attack: 0.001, release: 0.1, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'tri': {
                name: 'Triangle',
                voices: {
                    sine: { active: true, ratio: 4.0, gain: 0.6, detune: 0 }
                },
                settings: { cutoff: 12000, attack: 0.001, release: 0.3, fmDepth: 0, detune: 0, playMode: 'overlap' }
            },
            'crash': {
                name: 'Crash',
                voices: {
                    noise: { active: true, ratio: 1, gain: 0.8 }
                },
                settings: { cutoff: 1000, attack: 0.001, release: 1.5, fmDepth: 500, fmRatio: 1.5, detune: 0, playMode: 'overlap' }
            }
        };

        this.instruments = {
            'custom': {
                name: 'Custom Synth',
                voices: [] // Populated dynamically
            }
        };
        this.updateActiveVoices();
        this._voiceCounter = 0;
    }

    getPreset(key) {
        const preset = this.presets[key];
        if (!preset) return null;

        const snapshot = {
            synthSettings: { ...this.synthSettings, ...preset.settings },
            oscillatorOrder: [...this.oscillatorOrder],
            voices: JSON.parse(JSON.stringify(this.availableVoices))
        };

        // Reset all voices in snapshot
        Object.keys(snapshot.voices).forEach(vk => {
            snapshot.voices[vk].active = false;
        });

        // Apply preset voices
        Object.keys(preset.voices).forEach(vk => {
            const pv = preset.voices[vk];
            const av = snapshot.voices[vk];
            if (av) {
                av.active = true;
                if (pv.ratio !== undefined) av.ratio = pv.ratio;
                if (pv.gain !== undefined) av.gain = pv.gain;
                if (pv.detune !== undefined) av.detune = pv.detune;
                if (pv.pitchSweep !== undefined) av.pitchSweep = pv.pitchSweep;
                if (pv.sweepDuration !== undefined) av.sweepDuration = pv.sweepDuration;
            }
        });

        return snapshot;
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive'
            });
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 0.8;
            this.masterGain.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (!this.noiseBuffer && this.audioCtx) {
            const bufferSize = this.audioCtx.sampleRate * 2;
            this.noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
            const output = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        }
    }

    updateActiveVoices() {
        this.instruments.custom.voices = this.oscillatorOrder
            .map(type => this.availableVoices[type])
            .filter(v => v && v.active);
    }

    reorderOscillators(newOrder) {
        this.oscillatorOrder = newOrder;
        this.updateActiveVoices();
        this.emit('synthChange', this.snapshot());
    }

    setKeySnapshot(key, snapshot) {
        this.keySnapshots[key] = snapshot;
    }

    _initWavetableData() {
        if (this._waveData) return;
        const size = 64;
        const generate = (type) => {
            const real = new Float32Array(size);
            const imag = new Float32Array(size);
            for (let i = 1; i < size; i++) {
                if (type === 'sine') {
                    if (i === 1) imag[i] = 1;
                } else if (type === 'square') {
                    if (i % 2 !== 0) imag[i] = 1 / i;
                } else if (type === 'sawtooth') {
                    imag[i] = 1 / i;
                } else if (type === 'triangle') {
                    if (i % 2 !== 0) {
                        const sign = ((i - 1) / 2) % 2 === 0 ? 1 : -1;
                        imag[i] = sign / (i * i);
                    }
                }
            }
            return { real, imag };
        };

        this._waveData = {
            sine: generate('sine'),
            square: generate('square'),
            sawtooth: generate('sawtooth'),
            triangle: generate('triangle')
        };
    }

    _startWavetableMorph(key, carrier, types, morphSpeedOverride = null, playModeOverride = null, scheduledStartTime = null) {
        if (types.length < 2) return;
        const now = this.audioCtx.currentTime;
        const startTime = scheduledStartTime !== null ? scheduledStartTime : now;
        const morphSpeed = morphSpeedOverride !== null ? morphSpeedOverride : this.synthSettings.morphSpeed;
        const playMode = playModeOverride !== null ? playModeOverride : this.synthSettings.playMode;

        const update = () => {
            const active = this.activeVoices.get(this.keyToLatestVoiceId[key]);
            if (!active || !active.morphing) return;

            const currentCtxTime = this.audioCtx.currentTime;
            if (currentCtxTime < startTime) {
                active.morphRaf = requestAnimationFrame(update);
                return;
            }

            const elapsed = currentCtxTime - startTime;
            let t = elapsed * morphSpeed;
            let finished = false;

            if (playMode === 'modulate') {
                // Ping-pong logic
                const cycle = (types.length - 1) * 2;
                if (cycle > 0) {
                    let phase = t % cycle;
                    if (phase > types.length - 1) {
                        t = cycle - phase;
                    } else {
                        t = phase;
                    }
                } else {
                    t = 0;
                }
            } else {
                // Original wavetable logic: 0 to length-1 and stop
                if (t >= types.length - 1) {
                    t = types.length - 1;
                    finished = true;
                }
            }

            const idx1 = Math.floor(t);
            const idx2 = Math.min(idx1 + 1, types.length - 1);
            const mix = t - idx1;

            const w1 = this._waveData[types[idx1]];
            const w2 = this._waveData[types[idx2]];

            if (!w1 || !w2) {
                if (!finished) active.morphRaf = requestAnimationFrame(update);
                return;
            }

            const size = w1.real.length;
            const r = new Float32Array(size);
            const i = new Float32Array(size);
            for (let j = 0; j < size; j++) {
                r[j] = w1.real[j] * (1 - mix) + w2.real[j] * mix;
                i[j] = w1.imag[j] * (1 - mix) + w2.imag[j] * mix;
            }

            const wave = this.audioCtx.createPeriodicWave(r, i);
            carrier.setPeriodicWave(wave);

            if (finished) {
                active.morphing = false;
            } else {
                active.morphRaf = requestAnimationFrame(update);
            }
        };

        const active = this.activeVoices.get(this.keyToLatestVoiceId[key]);
        if (active) active.morphing = true;
        update();
    }

    generateScribble() {
        this.initAudio();
        const n = 64;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        for (let i = 1; i < n; i++) {
            real[i] = (Math.random() * 2 - 1) / i;
            imag[i] = (Math.random() * 2 - 1) / i;
        }
        const wave = this.audioCtx.createPeriodicWave(real, imag);
        // Special case: if we want to use periodic wave we'd need to set it on a voice
        return wave;
    }

    loadPreset(key) {
        const preset = this.presets[key];
        if (!preset) return;

        this.synthSettings.triggerMode = false;

        Object.keys(this.availableVoices).forEach(vk => {
            const av = this.availableVoices[vk];
            av.active = false;
            av.pitchSweep = 0;
            av.sweepDuration = 0.1;
        });

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

        Object.keys(preset.settings).forEach(sk => {
            this.synthSettings[sk] = preset.settings[sk];
        });

        this.updateGlobalParams('filter', this.synthSettings.cutoff);
        this.updateGlobalParams('fmRatio', this.synthSettings.fmRatio);
        this.updateGlobalParams('fmDepth', this.synthSettings.fmDepth);
        this.updateGlobalParams('masterDetune', this.synthSettings.detune);

        this.updateActiveVoices();
        this.emit('synthChange', this.snapshot());
    }

    randomize() {
        this.synthSettings.triggerMode = false;
        this.synthSettings.cutoff = Math.floor(200 + Math.random() * 8000);
        this.synthSettings.fmRatio = Math.round((0.5 + Math.random() * 8) * 10) / 10;
        this.synthSettings.fmDepth = Math.floor(Math.random() * 30);
        this.synthSettings.morphSpeed = Math.floor(1 + Math.random() * 99);
        const modes = ['overlap', 'modulate', 'wavetable'];
        this.synthSettings.playMode = modes[Math.floor(Math.random() * modes.length)];

        this.synthSettings.attack = Math.round(Math.random() * 1.5 * 100) / 100;
        this.synthSettings.release = Math.round((0.1 + Math.random() * 2) * 100) / 100;
        this.synthSettings.detune = 0;

        // Shuffle oscillator order
        for (let i = this.oscillatorOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.oscillatorOrder[i], this.oscillatorOrder[j]] = [this.oscillatorOrder[j], this.oscillatorOrder[i]];
        }

        let activeCount = 0;
        Object.keys(this.availableVoices).forEach(type => {
            if (type === 'noise') {
                this.availableVoices[type].active = false;
                return;
            }

            const active = Math.random() > 0.5;
            this.availableVoices[type].active = active;
            if (active) activeCount++;

            this.availableVoices[type].ratio = Math.round((0.1 + Math.random() * 3.9) * 100) / 100;
            this.availableVoices[type].detune = 0;
            this.availableVoices[type].gain = Math.round((0.1 + Math.random() * 0.4) * 100) / 100;
            this.availableVoices[type].pitchSweep = Math.floor(Math.random() * 800 - 400);
            this.availableVoices[type].sweepDuration = Math.round((0.01 + Math.random() * 0.5) * 100) / 100;
        });

        if (activeCount === 0) {
            this.availableVoices.sine.active = true;
        }

        this.updateActiveVoices();
        this.updateGlobalParams('filter', this.synthSettings.cutoff);
        this.updateGlobalParams('fmRatio', this.synthSettings.fmRatio);
        this.updateGlobalParams('fmDepth', this.synthSettings.fmDepth);
        this.updateGlobalParams('masterDetune', this.synthSettings.detune);

        this.emit('synthChange', this.snapshot());
    }

    updateGlobalParams(param, value) {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        this.activeVoices.forEach(active => {
            if (active.isLocked) return;
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

        if (param === 'volume' && this.masterGain) {
            this.masterGain.gain.setTargetAtTime(value, now, 0.05);
        }

        this.emit('paramChange', { param, value });
    }

    updateLiveVoices(voiceType, param, value) {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;

        this.activeVoices.forEach(active => {
            if (active.isLocked) return;
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
        this.emit('voiceChange', { voiceType, param, value });
    }

    playNote(key, freq, overrideTriggerMode = null, snapshotOverride = null, time = null) {
        if (!Number.isFinite(freq)) return null;
        this.initAudio();
        const now = time || this.audioCtx.currentTime;
        this._initWavetableData();

        // If a note is already playing on this key, stop it immediately.
        // This prevents "droning" when references are overwritten by new triggers.
        const latestVoiceId = this.keyToLatestVoiceId[key];
        if (latestVoiceId && this.activeVoices.has(latestVoiceId)) {
            // Increase cross-fade duration to 7ms to prevent "static" clicks
            this.stopNote(key, 0.007, latestVoiceId, now);
        }

        // VOICE TOKEN LOGIC:
        // By issuing a fresh voiceId, we ensure that late 'off' commands from 
        // older note instances don't accidentally silence a newer note.
        const voiceId = ++this._voiceCounter;
        const voices = [];
        const voiceGain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        // Use snapshotOverride if provided, otherwise fallback to keySnapshots, then global
        const snapshot = snapshotOverride || this.keySnapshots[key];
        const settings = snapshot ? snapshot.synthSettings : this.synthSettings;
        const voicesData = snapshot ? snapshot.voices : this.availableVoices;
        const oscOrder = snapshot ? snapshot.oscillatorOrder : this.oscillatorOrder;

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(settings.cutoff, now);
        filter.Q.setValueAtTime(1, now);

        const allVoices = oscOrder.map(type => voicesData[type]).filter(v => v && v.active);
        const geoVoices = allVoices.filter(v => v.type !== 'noise');
        const noiseVoices = allVoices.filter(v => v.type === 'noise');

        // Wavetable morphing if multiple geometric voices are selected and mode is morphing
        const playMode = settings.playMode;
        const useWavetable = (playMode === 'wavetable' || playMode === 'modulate') && geoVoices.length > 1;

        let wavetableCarrier = null;
        if (useWavetable) {
            const master = geoVoices[0]; // Use first selected as master for ratios/gain
            const voiceFreq = freq * master.ratio;
            const carrier = this.audioCtx.createOscillator();
            wavetableCarrier = carrier;
            const modulator = this.audioCtx.createOscillator();
            const modGain = this.audioCtx.createGain();
            const g = this.audioCtx.createGain();

            carrier.frequency.setValueAtTime(voiceFreq, now);
            carrier.detune.setValueAtTime((settings.detune || 0) + (master.detune || 0), now);

            if (master.pitchSweep && master.pitchSweep !== 0) {
                const sweepTime = Math.max(0.01, master.sweepDuration || 0.1);
                carrier.frequency.exponentialRampToValueAtTime(Math.max(0.01, voiceFreq + master.pitchSweep), now + sweepTime);
            }

            modulator.type = 'sine';
            modulator.frequency.setValueAtTime(voiceFreq * settings.fmRatio, now);
            modGain.gain.setValueAtTime(settings.fmDepth, now);

            modulator.connect(modGain);
            modGain.connect(carrier.frequency);
            modulator.start(now);

            g.gain.setValueAtTime(master.gain, now);
            carrier.connect(g);
            g.connect(filter);
            carrier.start(now);

            voices.push({
                carrier, modulator, modGain, gain: g,
                voiceType: 'wavetable', baseFreq: freq, voiceRatio: master.ratio, voiceDetune: master.detune
            });
        } else {
            // Standard individual oscillators for geo (0 or 1)
            geoVoices.forEach(v => {
                let carrier, modulator, modGain;
                const g = this.audioCtx.createGain();
                const voiceFreq = freq * v.ratio;

                carrier = this.audioCtx.createOscillator();
                modulator = this.audioCtx.createOscillator();
                modGain = this.audioCtx.createGain();
                carrier.type = v.type;

                carrier.frequency.setValueAtTime(voiceFreq, now);
                carrier.detune.setValueAtTime((settings.detune || 0) + (v.detune || 0), now);

                if (v.pitchSweep && v.pitchSweep !== 0) {
                    const sweepTime = Math.max(0.01, v.sweepDuration || 0.1);
                    carrier.frequency.exponentialRampToValueAtTime(Math.max(0.01, voiceFreq + v.pitchSweep), now + sweepTime);
                }

                modulator.type = 'sine';
                modulator.frequency.setValueAtTime(voiceFreq * settings.fmRatio, now);
                modGain.gain.setValueAtTime(settings.fmDepth, now);

                modulator.connect(modGain);
                modGain.connect(carrier.frequency);
                modulator.start(now);

                g.gain.setValueAtTime(v.gain, now);
                carrier.connect(g);
                g.connect(filter);
                carrier.start(now);

                voices.push({
                    carrier, modulator, modGain, gain: g,
                    voiceType: v.type, baseFreq: freq, voiceRatio: v.ratio, voiceDetune: v.detune
                });
            });
        }

        // Noise voices always play on top separately
        noiseVoices.forEach(v => {
            const g = this.audioCtx.createGain();
            const carrier = this.audioCtx.createBufferSource();
            carrier.buffer = this.noiseBuffer;
            carrier.loop = true;

            g.gain.setValueAtTime(v.gain, now);
            carrier.connect(g);
            g.connect(filter);
            carrier.start(now);

            voices.push({
                carrier, gain: g, voiceType: 'noise'
            });
        });

        filter.connect(voiceGain);
        voiceGain.connect(this.masterGain);
        voiceGain.gain.setValueAtTime(0, now);
        voiceGain.gain.linearRampToValueAtTime(1, now + Math.max(0.001, settings.attack));

        const isTrigger = overrideTriggerMode !== null ? overrideTriggerMode : settings.triggerMode;
        const voiceRecord = { voices, voiceGain, filter, release: settings.release, voiceId, isLocked: !!snapshotOverride, isTrigger, morphing: useWavetable };
        this.activeVoices.set(voiceId, voiceRecord);
        this.keyToLatestVoiceId[key] = voiceId;

        if (useWavetable && wavetableCarrier) {
            this._startWavetableMorph(key, wavetableCarrier, geoVoices.map(v => v.type), settings.morphSpeed, playMode, now);
        }

        if (isTrigger) {
            const release = Math.max(0.01, settings.release);
            const attack = Math.max(0.001, settings.attack);
            voiceGain.gain.exponentialRampToValueAtTime(0.001, now + attack + release);
            // We still need a JS timer to clean up the object reference, 
            // but the audio stop is scheduled precisely above and below.
            setTimeout(() => this.stopNote(key, false, voiceId, now + attack + release), (attack + release) * 1000 + 50);
        }

        return voiceId;
    }

    stopNote(key, releaseTimeOverride = null, voiceId = null, time = null) {
        // If voiceId is provided, stop that specific voice.
        // Otherwise, stop the latest voice for the key.
        const idToStop = voiceId !== null ? voiceId : this.keyToLatestVoiceId[key];
        const active = this.activeVoices.get(idToStop);

        if (!active) return;

        // One-Shot Guard: If this is a trigger note and we are receiving a 
        // manual release (null releaseTimeOverride), ignore it.
        // This lets the pad finish its natural one-shot release.
        if (active.isTrigger && releaseTimeOverride === null) {
            return;
        }

        const { voices, voiceGain, release } = active;
        const now = time || this.audioCtx.currentTime;

        const rTime = (typeof releaseTimeOverride === 'number')
            ? releaseTimeOverride
            : Math.max(0.01, release !== undefined ? release : this.synthSettings.release);

        active.morphing = false;
        if (active.morphRaf) cancelAnimationFrame(active.morphRaf);

        try {
            voiceGain.gain.cancelScheduledValues(now);
            const timeConstant = rTime / 3;
            voiceGain.gain.setTargetAtTime(0, now, timeConstant);

            voices.forEach(v => {
                if (v.carrier.stop) v.carrier.stop(now + rTime + 0.1);
                if (v.modulator && v.modulator.stop) v.modulator.stop(now + rTime + 0.1);
            });
        } catch (e) { }

        this.activeVoices.delete(idToStop);
        if (this.keyToLatestVoiceId[key] === idToStop) {
            delete this.keyToLatestVoiceId[key];
        }
    }

    stopAllNotes(immediate = false) {
        this.activeVoices.forEach((active, voiceId) => {
            // We don't have the key here easily, but stopNote handles clearing
            // Or we can just iterate the map
            const now = this.audioCtx.currentTime;
            const rTime = immediate ? 0.001 : 0.05;
            active.voiceGain.gain.cancelScheduledValues(now);
            active.voiceGain.gain.setTargetAtTime(0, now, rTime / 3);
            active.voices.forEach(v => v.carrier.stop(now + rTime + 0.1));
        });
        this.activeVoices.clear();
        this.keyToLatestVoiceId = {};
    }

    playMetronomeClick(isDownbeat) {
        if (!this.audioCtx) this.initAudio();
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, now);

        g.gain.setValueAtTime(0.15, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(g);
        g.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.05);
    }

    snapshot() {
        return {
            synthSettings: JSON.parse(JSON.stringify(this.synthSettings)),
            oscillatorOrder: [...this.oscillatorOrder],
            voices: JSON.parse(JSON.stringify(
                Object.fromEntries(
                    Object.entries(this.availableVoices).map(([k, v]) => [k, { ...v }])
                )
            ))
        };
    }

    applySnapshot(snapshot) {
        if (!snapshot) return;
        Object.assign(this.synthSettings, snapshot.synthSettings);
        if (snapshot.oscillatorOrder) this.oscillatorOrder = [...snapshot.oscillatorOrder];
        Object.entries(snapshot.voices).forEach(([k, v]) => {
            if (this.availableVoices[k]) Object.assign(this.availableVoices[k], v);
        });
        this.updateActiveVoices();
    }

    getSnapshotForKey(key) {
        if (this.keySnapshots[key]) {
            // Return a deep copy of the key's specific snapshot
            return JSON.parse(JSON.stringify(this.keySnapshots[key]));
        }
        return this.snapshot();
    }
}
