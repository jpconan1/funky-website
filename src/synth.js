import { saveMessage, MEDIA_STAMP, stripStamp } from './supabase.js';

export class Synth {
    constructor(windowManager, onSave) {
        this.wm = windowManager;
        this.onSave = onSave;
        this.audioCtx = null;
        this.isPlaying = false;
        this.isTimelinePlaying = false;
        this.currentStep = 0;
        this.currentTimelineStep = 0;
        this.bpm = 120;
        this.nextTickTime = 0;
        this.timerID = null;

        this.timelineData = [[], [], [], []]; // 4 tracks
        this.scale = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.50, 1174.66];

        // Bytebeat Sampler state
        this.bytebeatT = [0, 0, 0, 0];
        this.formulaStrings = [
            "(t * (m * 5 + 1) & t >> (8 - Math.floor(s * 4))) | (t >> 4)", // BASS
            "(t * (t >> 8 | t >> (11 - Math.floor(s * 3)))) & (63 + Math.floor(m * 128))", // DRUM
            "(((t >> 8) | (t >> 12)) * (t >> 10 % (16 + Math.floor(s * 16)))) ^ (t * (m * 2 + 1))", // GLITCH
            "(t * (5 + Math.floor(s * 5)) & t >> 7) | (t * 3 & t >> (10 - Math.floor(m * 5)))" // LEAD
        ];
        this.bytebeatFormulas = [];
        this.formulaStrings.forEach((f, i) => this.compileFormula(i, f));

        this.presets = [
            [
                "(t * (m * 5 + 1) & t >> (8 - Math.floor(s * 4))) | (t >> 4)",
                "t * ((t>>12|t>>8)&63&t>>4)",
                "(t/2 & t>>8) * (t>>16) | t/4"
            ],
            [
                "(t * (t >> 8 | t >> (11 - Math.floor(s * 3)))) & (63 + Math.floor(m * 128))",
                "(t*9&t>>4|t*5&t>>7|t*3&t/1024)-1",
                "t * (t>>5|t>>s*10) >> (t>>m*12)"
            ],
            [
                "(((t >> 8) | (t >> 12)) * (t >> 10 % (16 + Math.floor(s * 16)))) ^ (t * (m * 2 + 1))",
                "(t>>6|t|t>>(t>>16))&10+((t>>11)&7)",
                "t*(t>>11&t>>8&123&t>>m*5)"
            ],
            [
                "(t * (5 + Math.floor(s * 5)) & t >> 7) | (t * 3 & t >> (10 - Math.floor(m * 5)))",
                "t * (t>>8+m*4 & t>>4+s*4)",
                "(t & t>>s*12) | (t>>m*8)"
            ]
        ];

        this.voiceBuffers = [[], [], [], []]; // For visualization
        this.vizContexts = [null, null, null, null];
        this.animationFrameID = null;

        // Sequencer track voices
        this.sequencerVoices = Array(8).fill('osc');
    }

    compileFormula(index, formulaStr) {
        try {
            // Create a function that takes t, m, s and returns the result of the formula
            this.bytebeatFormulas[index] = new Function('t', 'm', 's', `
                try {
                    return (${formulaStr});
                } catch(e) {
                    return 0;
                }
            `);
            this.formulaStrings[index] = formulaStr;
        } catch (e) {
            console.warn('Invalid bytebeat formula:', e);
            this.bytebeatFormulas[index] = () => 0;
        }
    }

    scrambleFormula(formula) {
        // Change numbers slightly
        let scrambled = formula.replace(/\d+/g, (match) => {
            const num = parseInt(match);
            if (num <= 1) return match;
            const jitter = Math.floor(Math.random() * 5) - 2; // -2 to +2
            return Math.max(1, num + jitter);
        });

        // Swap bitwise operators occasionally
        const bitOps = ['&', '|', '^'];
        scrambled = scrambled.replace(/[&|^]/g, (match) => {
            return Math.random() > 0.85 ? bitOps[Math.floor(Math.random() * 3)] : match;
        });

        // Toggle shifts occasionally
        scrambled = scrambled.replace(/>>/g, (match) => Math.random() > 0.9 ? '<<' : match);
        scrambled = scrambled.replace(/<</g, (match) => Math.random() > 0.9 ? '>>' : match);

        return scrambled;
    }

    openNewFile() {
        const content = this.createAppSkeleton();
        const win = this.wm.createWindow('New Song (broken) - Synth', content);
        this.initVisualizers(win);
        this.setupEventListeners(win, null);
    }

    open(file) {
        const content = this.createAppSkeleton(file);
        const win = this.wm.createWindow(`Synth - ${file.name}`, content);
        this.initVisualizers(win);
        this.setupEventListeners(win, file);

        // Populate data if it's an existing file
        if (file.content) {
            try {
                const data = JSON.parse(stripStamp(file.content));
                this.loadData(win, data);
            } catch (e) {
                console.error('Failed to parse loop data', e);
            }
        }
    }

    createAppSkeleton(file = null) {
        const isNew = !file;
        const filename = file ? file.name : '';

        return `
            <div class="synth-container">
                <div class="synth-header">
                    <div class="editor-toolbar">
                        <input type="text" class="editor-filename-input synth-filename" 
                            placeholder="song_name" 
                            value="${filename.replace('.loop', '')}" 
                            ${!isNew ? 'readonly' : ''}>
                        <span class="filename-extension">.loop</span>
                        
                        ${isNew ? `
                        <div class="editor-toolbar-group">
                            <button class="editor-save-btn synth-save-btn">SAVE TO CLOUD</button>
                        </div>
                        ` : ''}
                        <div class="editor-toolbar-group">
                            <button class="editor-btn synth-play-btn" title="Loop current 16 steps">▶ SEQ</button>
                            <button class="editor-btn synth-timeline-play-btn" title="Play the whole song">▶ SONG</button>
                        </div>
                    </div>
                </div>

                <div class="synth-main">
                    <div class="synth-sequencer">
                        <div class="sequencer-title">STEP SEQUENCER</div>
                        <div class="sequencer-flex">
                            <div class="sequencer-row-labels">
                                ${Array(8).fill(0).map((_, i) => `<div class="track-selector" data-track="${7 - i}">OSC</div>`).join('')}
                            </div>
                            <div class="sequencer-grid">
                                ${Array(16).fill(0).map((_, i) => `<div class="step-column" data-step="${i}">
                                    ${Array(8).fill(0).map((_, j) => `<div class="step-cell" data-note="${7 - j}"></div>`).join('')}
                                </div>`).join('')}
                            </div>
                        </div>
                        <div class="sequencer-controls">
                            <div class="synth-knob-group">
                                <div class="synth-knob" data-label="MOOD" data-value="0.5">
                                    <div class="knob-dial"></div>
                                </div>
                                <div class="synth-knob" data-label="SHAPE" data-value="0.5">
                                    <div class="knob-dial"></div>
                                </div>
                            </div>
                            <div class="synth-bpm-group">
                                <label>BPM: <span class="bpm-value">120</span></label>
                                <input type="range" class="bpm-slider" min="60" max="200" value="120">
                            </div>
                            <div class="synth-volume-group">
                                <label>VOL</label>
                                <input type="range" class="volume-slider" min="0" max="100" value="50">
                            </div>
                            <button class="mutate-btn">MUTATE</button>
                            <button class="pack-btn">PACK LOOP</button>
                        </div>
                    </div>

                    <div class="synth-sampler">
                        <div class="sampler-title">DIGITAL SAMPLER (BYTEBEAT)</div>
                        <div class="sampler-flex">
                            <div class="sampler-row-labels">
                                <div class="sampler-label">BASS</div>
                                <div class="sampler-label">DRUM</div>
                                <div class="sampler-label">GLITCH</div>
                                <div class="sampler-label">LEAD</div>
                            </div>
                            <div class="sampler-grid">
                                ${Array(16).fill(0).map((_, i) => `<div class="step-column" data-step="${i}">
                                    ${Array(4).fill(0).map((_, j) => `<div class="sampler-cell" data-voice="${j}"></div>`).join('')}
                                </div>`).join('')}
                            </div>
                            <div class="sampler-visualizers">
                                ${Array(4).fill(0).map((_, i) => `
                                    <div class="voice-viz-container">
                                        <canvas class="voice-viz" data-voice="${i}" width="100" height="25"></canvas>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="sampler-formulas">
                            ${[0, 1, 2, 3].map(i => `
                                <div class="formula-row">
                                    <div class="formula-label">${['BASS', 'DRUM', 'GLITCH', 'LEAD'][i]}</div>
                                    <input type="text" class="formula-input" data-voice="${i}" value="${this.formulaStrings[i]}" placeholder="t * ...">
                                    <div class="formula-presets">
                                        <div class="preset-btn" data-voice="${i}" data-preset="0" title="Preset 1">1</div>
                                        <div class="preset-btn" data-voice="${i}" data-preset="1" title="Preset 2">2</div>
                                        <div class="preset-btn" data-voice="${i}" data-preset="2" title="Preset 3">3</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="synth-timeline">
                        <div class="timeline-title">TIMELINE</div>
                        <div class="timeline-tracks">
                            ${Array(4).fill(0).map((_, i) => `
                                <div class="timeline-track" data-track="${i}">
                                    <div class="track-label">Track ${i + 1}</div>
                                    <div class="track-content"></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="editor-footer">
                    <div class="privacy-notice">
                        <input type="checkbox" id="synth-privacy-check" ${!isNew ? 'checked disabled' : ''}>
                        <label for="synth-privacy-check">I agree to the <a href="#" class="privacy-link">Privacy Policy</a></label>
                    </div>
                    <div class="editor-status synth-status">Idle</div>
                </div>
            </div>
        `;
    }

    setupEventListeners(win, file) {
        const element = win.element;
        const saveBtn = element.querySelector('.synth-save-btn');
        const privacyCheck = element.querySelector('#synth-privacy-check');
        const filenameInput = element.querySelector('.synth-filename');
        const status = element.querySelector('.synth-status');
        const privacyLink = element.querySelector('.privacy-link');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSave(win));
        }

        if (privacyLink) {
            privacyLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.wm.createWindow('Privacy Policy', `
                    <div class="privacy-policy-content">
                        <h2>Privacy Policy</h2>
                        <p>By saving a song to Synth, you agree that your creation (the .loop file) will be publically visible to anyone visiting this website.</p>
                        <p>We do not collect any personal data other than what you choose to include in your song name and the sequence itself.</p>
                        <p>Keep it funky, keep it respectful.</p>
                    </div>
                `);
            });
        }

        // Cell toggling
        element.querySelectorAll('.step-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                cell.classList.toggle('active');
            });
        });

        element.querySelectorAll('.sampler-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                cell.classList.toggle('active');
            });
        });

        // Play/Stop buttons
        const playBtn = element.querySelector('.synth-play-btn');
        const timelinePlayBtn = element.querySelector('.synth-timeline-play-btn');

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.togglePlayback(win, 'sequencer');
            });
        }

        if (timelinePlayBtn) {
            timelinePlayBtn.addEventListener('click', () => {
                this.togglePlayback(win, 'timeline');
            });
        }

        // Knob dragging
        element.querySelectorAll('.synth-knob').forEach(knob => {
            let isDragging = false;
            let startY = 0;
            let startValue = parseFloat(knob.dataset.value);

            knob.addEventListener('pointerdown', (e) => {
                isDragging = true;
                startY = e.clientY;
                startValue = parseFloat(knob.dataset.value);
                document.body.style.cursor = 'ns-resize';
                knob.setPointerCapture(e.pointerId); // Better than global listeners
            });

            knob.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                const delta = (startY - e.clientY) / 100;
                let newValue = Math.max(0, Math.min(1, startValue + delta));
                knob.dataset.value = newValue;
                knob.querySelector('.knob-dial').style.transform = `rotate(${newValue * 270 - 135}deg)`;
            });

            knob.addEventListener('pointerup', (e) => {
                if (isDragging) {
                    isDragging = false;
                    document.body.style.cursor = 'default';
                    knob.releasePointerCapture(e.pointerId);
                }
            });

            // Set initial rotation
            const val = parseFloat(knob.dataset.value);
            knob.querySelector('.knob-dial').style.transform = `rotate(${val * 270 - 135}deg)`;
        });

        // Mutate button...
        const mutateBtn = element.querySelector('.mutate-btn');
        if (mutateBtn) {
            mutateBtn.addEventListener('click', () => {
                status.textContent = 'Mutating...';
                setTimeout(() => {
                    element.querySelectorAll('.step-cell').forEach(cell => {
                        if (Math.random() > 0.9) cell.classList.add('active');
                        else if (Math.random() > 0.5) cell.classList.remove('active');
                    });
                    status.textContent = 'Mutated!';
                }, 300);
            });
        }

        // Pack Loop button
        const packBtn = element.querySelector('.pack-btn');
        if (packBtn) {
            packBtn.addEventListener('click', () => {
                const activeCells = element.querySelectorAll('.step-cell.active');
                if (activeCells.length === 0) {
                    this.wm.alert('Sequence is empty. Add some notes before packing!', 'Synth');
                    return;
                }

                // Add a "loop block" to the first available track in the timeline
                const loopData = this.collectSequencerData(element);
                const tracks = element.querySelectorAll('.track-content');
                let added = false;

                for (let i = 0; i < tracks.length; i++) {
                    const track = tracks[i];
                    if (this.timelineData[i].length < 16) { // Max 16 measures for now
                        const blockPos = this.timelineData[i].length;
                        this.timelineData[i].push(loopData);

                        const block = document.createElement('div');
                        block.className = 'timeline-block';
                        block.dataset.step = blockPos;
                        block.innerHTML = `<span>LOOP</span><div class="block-delete">×</div>`;

                        block.querySelector('.block-delete').addEventListener('click', (e) => {
                            e.stopPropagation();
                            const idx = this.timelineData[i].indexOf(loopData);
                            if (idx > -1) this.timelineData[i].splice(idx, 1);
                            block.remove();
                            this.renderTimeline(win);
                        });

                        track.appendChild(block);
                        added = true;
                        status.textContent = 'Loop packed to timeline!';
                        break;
                    }
                }
                if (!added) {
                    this.wm.alert('Timeline is full!', 'Synth');
                }
            });
        }

        // Track selector voice switching
        element.querySelectorAll('.track-selector').forEach(selector => {
            selector.addEventListener('click', () => {
                const trackIdx = parseInt(selector.dataset.track);
                const currentVoice = this.sequencerVoices[trackIdx];
                let nextVoice = 'osc';

                if (currentVoice === 'osc') nextVoice = 'bb0';
                else if (currentVoice === 'bb0') nextVoice = 'bb1';
                else if (currentVoice === 'bb1') nextVoice = 'bb2';
                else if (currentVoice === 'bb2') nextVoice = 'bb3';
                else nextVoice = 'osc';

                this.sequencerVoices[trackIdx] = nextVoice;
                selector.textContent = nextVoice.toUpperCase();
                selector.className = 'track-selector ' + (nextVoice.startsWith('bb') ? 'voice-bb' : 'voice-osc');
            });
        });

        // BPM slider
        const bpmSlider = element.querySelector('.bpm-slider');
        const bpmValue = element.querySelector('.bpm-value');
        if (bpmSlider) {
            bpmSlider.addEventListener('input', (e) => {
                this.bpm = parseInt(e.target.value);
                bpmValue.textContent = this.bpm;
            });
        }

        // Formula inputs
        element.querySelectorAll('.formula-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const voice = parseInt(e.target.dataset.voice);
                this.compileFormula(voice, e.target.value);
            });
        });

        // Preset buttons
        element.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const voice = parseInt(btn.dataset.voice);
                const pIdx = parseInt(btn.dataset.preset);
                const baseFormula = this.presets[voice][pIdx];
                const scrambled = this.scrambleFormula(baseFormula);

                const input = element.querySelector(`.formula-input[data-voice="${voice}"]`);
                if (input) {
                    input.value = scrambled;
                    this.compileFormula(voice, scrambled);
                }
            });
        });

        // Volume slider
        const volSlider = element.querySelector('.volume-slider');
        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                const vol = parseInt(e.target.value) / 100;
                if (this.masterGain) {
                    this.masterGain.gain.setTargetAtTime(vol, this.audioCtx.currentTime, 0.1);
                }
            });
        }
    }

    renderTimeline(win) {
        const element = win.element;
        const tracks = element.querySelectorAll('.track-content');
        tracks.forEach((track, i) => {
            track.innerHTML = '';
            this.timelineData[i].forEach((loopData, blockPos) => {
                const block = document.createElement('div');
                block.className = 'timeline-block';
                block.dataset.step = blockPos;
                block.innerHTML = `<span>LOOP</span><div class="block-delete">×</div>`;
                block.querySelector('.block-delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.timelineData[i].splice(blockPos, 1);
                    this.renderTimeline(win);
                });
                track.appendChild(block);
            });
        });
    }

    async handleSave(win) {
        const element = win.element;
        const filenameInput = element.querySelector('.synth-filename');
        const privacyCheck = element.querySelector('#synth-privacy-check');
        const status = element.querySelector('.synth-status');

        const name = filenameInput.value.trim();
        if (!name) {
            this.wm.alert('Please enter a filename.', 'Error');
            return;
        }

        if (!privacyCheck.checked) {
            this.wm.alert('You must agree to the Privacy Policy to save to the cloud.', 'Privacy Policy');
            return;
        }

        const fullFilename = name.endsWith('.loop') ? name : name + '.loop';

        // Collect data and prepend our security stamp
        const data = this.collectData(element);
        const content = MEDIA_STAMP + JSON.stringify(data);

        try {
            status.textContent = 'Saving...';
            await saveMessage(fullFilename, content);
            status.textContent = 'Saved to cloud!';

            if (this.onSave) this.onSave();

            // Make read-only after save
            filenameInput.readOnly = true;
            privacyCheck.disabled = true;
            const saveBtn = element.querySelector('.synth-save-btn');
            if (saveBtn) saveBtn.remove();

            win.setTitle(`Synth - ${fullFilename}`);
        } catch (error) {
            console.error('Save failed:', error);
            status.textContent = 'Error saving';
            this.wm.alert('Failed to save: ' + error.message, 'Error');
        }
    }

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 0.5;
            this.masterGain.connect(this.audioCtx.destination);
        }
    }

    initVisualizers(win) {
        const element = win.element;
        const canvases = element.querySelectorAll('.voice-viz');
        canvases.forEach((canvas, i) => {
            this.vizContexts[i] = canvas.getContext('2d');
        });
    }

    drawVisualizers() {
        if (!this.isPlaying && !this.isTimelinePlaying) {
            cancelAnimationFrame(this.animationFrameID);
            return;
        }

        this.vizContexts.forEach((ctx, i) => {
            if (!ctx) return;
            const canvas = ctx.canvas;
            const data = this.voiceBuffers[i];

            // Background
            ctx.fillStyle = '#0a0a0c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (data && data.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = i === 1 ? '#ff007a' : '#00ffca'; // pink for drums, green for others
                ctx.lineWidth = 1;

                const step = canvas.width / data.length;
                for (let j = 0; j < data.length; j++) {
                    const x = j * step;
                    const y = (data[j] + 1) * 0.5 * canvas.height;
                    if (j === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                // Slowly drain the buffer so it doesn't just stay static
                if (Math.random() > 0.5) data.shift();
            }
        });

        this.animationFrameID = requestAnimationFrame(() => this.drawVisualizers());
    }

    togglePlayback(win, mode) {
        this.initAudio();
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const seqBtn = win.element.querySelector('.synth-play-btn');
        const timeBtn = win.element.querySelector('.synth-timeline-play-btn');

        // Stop whatever is playing first
        const wasPlaying = this.isPlaying || this.isTimelinePlaying;
        const currentMode = this.isPlaying ? 'sequencer' : (this.isTimelinePlaying ? 'timeline' : null);

        this.isPlaying = false;
        this.isTimelinePlaying = false;
        clearTimeout(this.timerID);
        seqBtn.textContent = '▶ SEQ';
        timeBtn.textContent = '▶ SONG';
        seqBtn.classList.remove('active');
        timeBtn.classList.remove('active');
        win.element.querySelectorAll('.step-column').forEach(col => col.classList.remove('highlight'));
        win.element.querySelectorAll('.timeline-block').forEach(b => b.classList.remove('active'));

        if (wasPlaying && currentMode === mode) {
            return; // Just stopped
        }

        if (mode === 'sequencer') {
            this.isPlaying = true;
            seqBtn.textContent = '■ STOP';
            seqBtn.classList.add('active');
            this.currentStep = 0;
            this.nextTickTime = this.audioCtx.currentTime;
            this.scheduler(win, 'sequencer');
            this.drawVisualizers();
        } else {
            this.isTimelinePlaying = true;
            timeBtn.textContent = '■ STOP';
            timeBtn.classList.add('active');
            this.currentStep = 0; // step within the current loop
            this.currentTimelineStep = 0; // measure/block index
            this.nextTickTime = this.audioCtx.currentTime;
            this.scheduler(win, 'timeline');
            this.drawVisualizers();
        }
    }

    scheduler(win, mode) {
        while (this.nextTickTime < this.audioCtx.currentTime + 0.1) {
            if (mode === 'sequencer') {
                this.scheduleSequencerTick(this.currentStep, this.nextTickTime, win);
                this.advanceSequencerStep();
            } else {
                this.scheduleTimelineTick(this.currentTimelineStep, this.currentStep, this.nextTickTime, win);
                this.advanceTimelineStep();
            }
        }
        this.timerID = setTimeout(() => this.scheduler(win, mode), 25);
    }

    advanceSequencerStep() {
        const secondsPerBeat = 60.0 / (this.bpm * 4);
        this.nextTickTime += secondsPerBeat;
        this.currentStep = (this.currentStep + 1) % 16;
    }

    advanceTimelineStep() {
        const secondsPerBeat = 60.0 / (this.bpm * 4);
        this.nextTickTime += secondsPerBeat;
        this.currentStep++;
        if (this.currentStep >= 16) {
            this.currentStep = 0;
            this.currentTimelineStep++;
            if (this.currentTimelineStep >= 16) {
                this.currentTimelineStep = 0;
            }
        }
    }

    scheduleSequencerTick(step, time, win) {
        const element = win.element;
        // Highlight columns in both grids
        const columns = element.querySelectorAll(`.step-column[data-step="${step}"]`);

        setTimeout(() => {
            if (!this.isPlaying) return;
            element.querySelectorAll('.step-column').forEach(c => c.classList.remove('highlight'));
            columns.forEach(col => col.classList.add('highlight'));
        }, (time - this.audioCtx.currentTime) * 1000);

        const mood = parseFloat(element.querySelector('.synth-knob[data-label="MOOD"]').dataset.value);
        const shape = parseFloat(element.querySelector('.synth-knob[data-label="SHAPE"]').dataset.value);

        // Sequencer grid
        const seqCol = element.querySelector(`.sequencer-grid .step-column[data-step="${step}"]`);
        if (seqCol) {
            seqCol.querySelectorAll('.step-cell.active').forEach(cell => {
                const noteIndex = parseInt(cell.dataset.note);
                const voice = this.sequencerVoices[noteIndex];

                if (voice === 'osc') {
                    this.playTone(this.scale[noteIndex], time, mood, shape);
                } else {
                    const voiceIdx = parseInt(voice.replace('bb', ''));
                    this.playBytebeat(voiceIdx, time, mood, shape);
                }
            });
        }

        // Sampler grid (independent tracks)
        const samplerCol = element.querySelector(`.sampler-grid .step-column[data-step="${step}"]`);
        if (samplerCol) {
            samplerCol.querySelectorAll('.sampler-cell.active').forEach(cell => {
                const voiceIndex = parseInt(cell.dataset.voice);
                this.playBytebeat(voiceIndex, time, mood, shape);
            });
        }
    }

    scheduleTimelineTick(measure, step, time, win) {
        const element = win.element;

        setTimeout(() => {
            if (!this.isTimelinePlaying) return;
            element.querySelectorAll('.timeline-block').forEach(b => b.classList.remove('active'));
            element.querySelectorAll(`.timeline-block[data-step="${measure}"]`).forEach(b => b.classList.add('active'));
        }, (time - this.audioCtx.currentTime) * 1000);

        for (let i = 0; i < 4; i++) {
            const loopData = this.timelineData[i][measure];
            if (loopData) {
                const notesAtStep = loopData.cells.filter(c => parseInt(c.step) === step);
                notesAtStep.forEach(c => {
                    this.playTone(this.scale[c.note], time, loopData.knobs.mood, loopData.knobs.shape);
                });

                const samplerAtStep = loopData.sampler.filter(c => parseInt(c.step) === step);
                samplerAtStep.forEach(c => {
                    this.playBytebeat(c.voice, time, loopData.knobs.mood, loopData.knobs.shape);
                });
            }
        }
    }

    playTone(freq, time, mood, shape) {

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Mood affects wave type and detune
        // Bright = Sawtooth, Dark = Sine
        if (mood > 0.7) osc.type = 'sawtooth';
        else if (mood > 0.4) osc.type = 'square';
        else if (mood > 0.2) osc.type = 'triangle';
        else osc.type = 'sine';

        osc.frequency.value = freq;
        osc.detune.value = (mood - 0.5) * 50; // Jitter

        // Shape affects envelope
        const attack = 0.01;
        const decay = 0.1 + (shape * 0.5);
        const sustain = 0.1;
        const release = 0.1 + (shape * 1.0);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.3, time + attack);
        gain.gain.exponentialRampToValueAtTime(sustain, time + attack + decay);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay + release);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + attack + decay + release);
    }

    playBytebeat(index, time, mood, shape) {
        const sampleRate = 8000;
        const duration = 0.2; // slightly longer slice
        const buffer = this.audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);

        const vizData = [];
        for (let i = 0; i < data.length; i++) {
            const val = this.bytebeatFormulas[index](this.bytebeatT[index], mood, shape) & 255;
            data[i] = (val / 127.5) - 1.0;
            if (i % 8 === 0) vizData.push(data[i]);
            this.bytebeatT[index]++;
        }
        this.voiceBuffers[index] = vizData;

        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.35; // increased volume

        // Apply a quick fade out to prevent clicks
        gain.gain.setValueAtTime(0.35, time + duration - 0.02);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        source.connect(gain);
        gain.connect(this.masterGain);

        source.start(time);
    }

    save() {
        // ... handled by handleSave ...
    }

    collectData(element) {
        return {
            version: '1.3',
            type: 'synth-song',
            bpm: this.bpm,
            timeline: this.timelineData,
            formulas: this.formulaStrings,
            voices: this.sequencerVoices,
            sequencer: this.collectSequencerData(element)
        };
    }

    collectSequencerData(element) {
        const cells = [];
        element.querySelectorAll('.step-cell.active').forEach(cell => {
            const step = cell.parentElement.dataset.step;
            const note = cell.dataset.note;
            cells.push({ step, note });
        });

        const sampler = [];
        element.querySelectorAll('.sampler-cell.active').forEach(cell => {
            const step = cell.parentElement.dataset.step;
            const voice = parseInt(cell.dataset.voice);
            sampler.push({ step, voice });
        });

        const moodKnob = element.querySelector('.synth-knob[data-label="MOOD"]');
        const shapeKnob = element.querySelector('.synth-knob[data-label="SHAPE"]');

        return {
            cells: cells,
            sampler: sampler,
            knobs: {
                mood: parseFloat(moodKnob.dataset.value),
                shape: parseFloat(shapeKnob.dataset.value)
            }
        };
    }

    loadData(win, data) {
        const element = win.element;
        if (data.type === 'synth-song') {
            if (data.bpm) {
                this.bpm = data.bpm;
                const bpmSlider = element.querySelector('.bpm-slider');
                const bpmValue = element.querySelector('.bpm-value');
                if (bpmSlider) bpmSlider.value = this.bpm;
                if (bpmValue) bpmValue.textContent = this.bpm;
            }
            if (data.formulas) {
                data.formulas.forEach((f, i) => {
                    this.compileFormula(i, f);
                    const input = element.querySelector(`.formula-input[data-voice="${i}"]`);
                    if (input) input.value = f;
                });
            }
            if (data.voices) {
                this.sequencerVoices = data.voices;
                element.querySelectorAll('.track-selector').forEach(sel => {
                    const trackIdx = parseInt(sel.dataset.track);
                    const voice = this.sequencerVoices[trackIdx];
                    sel.textContent = voice.toUpperCase();
                    sel.className = 'track-selector ' + (voice.startsWith('bb') ? 'voice-bb' : 'voice-osc');
                });
            }
            if (data.sequencer) this.loadSequencerData(element, data.sequencer);
            if (data.timeline) {
                this.timelineData = data.timeline;
                this.renderTimeline(win);
            }
        } else {
            // Legacy loop-only data
            this.loadSequencerData(element, data);
        }
    }

    loadSequencerData(element, data) {
        element.querySelectorAll('.step-cell').forEach(c => c.classList.remove('active'));
        element.querySelectorAll('.sampler-cell').forEach(c => c.classList.remove('active'));

        if (data.cells) {
            data.cells.forEach(c => {
                const cell = element.querySelector(`.sequencer-grid .step-column[data-step="${c.step}"] .step-cell[data-note="${c.note}"]`);
                if (cell) cell.classList.add('active');
            });
        }

        if (data.sampler) {
            data.sampler.forEach(s => {
                const cell = element.querySelector(`.sampler-grid .step-column[data-step="${s.step}"] .sampler-cell[data-voice="${s.voice}"]`);
                if (cell) cell.classList.add('active');
            });
        }

        if (data.knobs) {
            const moodKnob = element.querySelector('.synth-knob[data-label="MOOD"]');
            const shapeKnob = element.querySelector('.synth-knob[data-label="SHAPE"]');

            if (moodKnob) {
                moodKnob.dataset.value = data.knobs.mood;
                moodKnob.querySelector('.knob-dial').style.transform = `rotate(${data.knobs.mood * 270 - 135}deg)`;
            }
            if (shapeKnob) {
                shapeKnob.dataset.value = data.knobs.shape;
                shapeKnob.querySelector('.knob-dial').style.transform = `rotate(${data.knobs.shape * 270 - 135}deg)`;
            }
        }
    }
}
