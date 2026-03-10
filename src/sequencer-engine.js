export class SequencerEngine {
    constructor(synthEngine) {
        this.synth = synthEngine;
        this.bpm = 120;
        this.loopBars = 2;

        // --- Roll state ---
        // recState tracks recording/playback status (legacy compat)
        this.recState = 'idle'; // 'idle' | 'rolling' | 'playing'
        this.isRolling = false; // is the tape currently scrolling?

        // Total roll length in 16th notes (loopBars * 16)
        // scrollPos is the current read-head in 16th notes (float)
        this.scrollPos = 0;
        this._rollRAF = null;
        this._rollLastTimestamp = null;

        // Loop region: in 16th notes
        this.loopStart = 0;
        this.loopEnd = null; // null = not set

        // Notes: stored as { key, freq, note, start16, end16 } (in 16th-note units)
        this.recNotes = [];
        this.recOpenNotes = {}; // key -> { start16 }
        this.savedLoops = [];
        this.metronomeEnabled = false;
        this.drumQuantize = '1/16'; // '1/16', '1/8', '1/4', 'off'

        // Playback timers (legacy kept for saved-loop playback)
        this.recPlaybackTimers = [];
        this._recPlaybackEndTimer = null;
        this._playheadRAF = null;

        // Count-in support (kept minimal)
        this.countInTimers = [];
        this._recAutoStopTimer = null;
        this.recStartTime = null; // kept for compat

        // Callbacks
        this.onStateChange = () => { };
        this.onPlayheadUpdate = () => { };          // pct (0-1 through loop region)
        this.onScrollUpdate = (pos16) => { };     // called every animation frame when rolling
        this.onNoteOn = (key) => { };       // overdub playback: key lit
        this.onNoteOff = (key) => { };       // overdub playback: key unlit

        // Overdub playback: tracks which recNotes have fired in the current cycle
        this._triggeredThisCycle = new Set();
        // Per-note off timers keyed by recNote index
        this._noteOffTimers = new Map();
    }

    // ---- Timing helpers ----
    getBeatDuration() { return 60 / this.bpm; }
    getSixteenthDuration() { return this.getBeatDuration() / 4; }  // seconds per 16th
    getTotalLength16() { return this.loopBars * 16; }
    getLoopDuration() { return this.getSixteenthDuration() * this.getTotalLength16(); }

    // ---- Roll (tape) control ----

    startRoll() {
        if (this.isRolling) return;
        this.synth.initAudio();
        this.isRolling = true;
        this.recState = 'rolling';
        this._rollLastTimestamp = null;
        this._tickRoll(performance.now());
        this.onStateChange();
    }

    stopRoll(immediate = false) {
        if (!this.isRolling) return;
        this.isRolling = false;
        if (this._rollRAF) cancelAnimationFrame(this._rollRAF);
        this._rollRAF = null;

        // Close any open notes
        Object.keys(this.recOpenNotes).forEach(k => this._closeNote(k));

        // Cancel all overdub-playback off-timers and unlight keys
        this._noteOffTimers.forEach((t, key) => {
            clearTimeout(t);
            this.onNoteOff(key);
        });
        this._noteOffTimers.clear();
        this._triggeredThisCycle.clear();

        this.recState = 'idle';
        this.synth.stopAllNotes(immediate);
        this.onStateChange();
    }

    toggleRoll() {
        if (this.isRolling) this.stopRoll();
        else this.startRoll();
    }

    _tickRoll(timestamp) {
        if (!this.isRolling) return;

        const total16 = this.getTotalLength16();
        const sixteenth_s = this.getSixteenthDuration();

        let prevPos = this.scrollPos;

        if (this._rollLastTimestamp !== null) {
            const dt = (timestamp - this._rollLastTimestamp) / 1000;
            const dt16 = dt / sixteenth_s;
            this.scrollPos += dt16;

            // Detect and handle loop wrap
            if (this.scrollPos >= total16) {
                this.scrollPos -= total16;
                // Clear triggered-this-cycle tracker so every note fires again
                this._triggeredThisCycle.clear();
            }
        }
        this._rollLastTimestamp = timestamp;

        // ---- Overdub playback: fire any recorded notes whose start16 falls
        //      in the window [prevPos, scrollPos) this frame ----
        const curPos = this.scrollPos;
        const tNow = this.synth.audioCtx.currentTime;

        this.recNotes.forEach((ev, idx) => {
            if (this._triggeredThisCycle.has(idx)) return;

            // Does this note's start fall in the current frame window?
            const inWindow = prevPos <= curPos
                ? ev.start16 >= prevPos && ev.start16 < curPos
                : ev.start16 >= prevPos || ev.start16 < curPos; // wrap frame

            if (!inWindow) return;
            this._triggeredThisCycle.add(idx);

            // Calculate precise audio time for start and end
            // offset16 is distance from prevPos to the note's start
            let offset16 = ev.start16 - prevPos;
            if (offset16 < 0) offset16 += total16; // Handle wrap

            const tOn = tNow + (offset16 * sixteenth_s);
            const dur16 = ((ev.end16 - ev.start16) % total16 + total16) % total16 || 0.5;
            const tOff = tOn + (dur16 * sixteenth_s);

            // Don't trigger if the user is already holding this key live
            if (!this.recOpenNotes[ev.key]) {
                const voiceId = this.synth.playNote(ev.key, ev.freq, ev.isPad, ev.synthSnapshot, tOn);

                // Key flash is UI, so we still use setTimeout for visual sync
                const visualDelay = Math.max(0, (tOn - tNow) * 1000);
                setTimeout(() => this.onNoteOn(ev.key), visualDelay);

                const offTimer = setTimeout(() => {
                    // Only stop if the key isn't currently held live by the user
                    if (!this.recOpenNotes[ev.key]) {
                        this.synth.stopNote(ev.key, null, voiceId, tOff);
                        this.onNoteOff(ev.key);
                    }
                    this._noteOffTimers.delete(ev.key);
                }, (tOff - tNow) * 1000 + 50);

                // Cancel any previous off-timer for this key (safety)
                if (this._noteOffTimers.has(ev.key)) clearTimeout(this._noteOffTimers.get(ev.key));
                this._noteOffTimers.set(ev.key, offTimer);
            }
        });

        // ---- Metronome ----
        if (this.metronomeEnabled) {
            const beatWidth = 4; // 1 beat = 4 sixteenths
            const pBeat = Math.floor(prevPos / beatWidth);
            const cBeat = Math.floor((prevPos <= curPos ? curPos : curPos + total16) / beatWidth);

            if (cBeat > pBeat) {
                // Determine if this is the start of a bar (every 16th note usually, 4 beats)
                const actualBeat = cBeat % (total16 / beatWidth);
                const isDownbeat = actualBeat === 0;
                if (this.synth.playMetronomeClick) {
                    this.synth.playMetronomeClick(isDownbeat);
                }
            }
        }

        this.onScrollUpdate(this.scrollPos);
        this._rollRAF = requestAnimationFrame(t => this._tickRoll(t));
    }

    // Nudge scroll position by +/- 1 sixteenth note
    nudgeScroll(delta16) {
        const total16 = this.getTotalLength16();
        this.scrollPos = ((this.scrollPos + delta16) % total16 + total16) % total16;
        this.onScrollUpdate(this.scrollPos);
    }

    // ---- Loop point ----

    setLoopPoint() {
        // If no loop start set yet, set start; second press sets end
        if (this.loopStart === null || this.loopEnd !== null) {
            // Reset and set start
            this.loopStart = this.scrollPos;
            this.loopEnd = null;
        } else {
            // Set end (must be after start)
            const end = this.scrollPos;
            if (end > this.loopStart) {
                this.loopEnd = end;
            } else {
                // Clicked before or at start — reset
                this.loopStart = this.scrollPos;
                this.loopEnd = null;
            }
        }
        this.onStateChange();
    }

    clearLoopPoint() {
        this.loopStart = 0;
        this.loopEnd = null;
        this.onStateChange();
    }

    quantizeNote(pos16) {
        if (this.drumQuantize === 'off') return pos16;

        // Match user setting to 16th note divisions
        let division = 1;
        if (this.drumQuantize === '1/8') division = 2;
        if (this.drumQuantize === '1/4') division = 4;

        return Math.round(pos16 / division) * division;
    }

    // ---- Note recording ----

    noteOn(key, data, allowStamp = false) {
        if (!data || !Number.isFinite(data.freq)) return;
        const isPad = data.type === 'pad';
        let voiceId = null;

        if (this.isRolling) {
            if (!this.recOpenNotes[key]) {
                let start16 = this.quantizeNote(this.scrollPos);
                if (isPad) {
                    const total16 = this.getTotalLength16();
                    // For pads, always record as a thin line (one-shot)
                    this.recNotes.push({
                        key,
                        note: data.note,
                        freq: data.freq,
                        isPad: true,
                        start16: start16 % total16,
                        end16: (start16 + 0.25) % total16 || total16,
                        synthSnapshot: this.synth.getSnapshotForKey(key)
                    });
                    this._triggeredThisCycle.add(this.recNotes.length - 1);
                    this.onStateChange();
                } else {
                    // Start of a recorded piano note
                    this.recOpenNotes[key] = {
                        start16: start16,
                        freq: data.freq,
                        note: data.note,
                        synthSnapshot: this.synth.getSnapshotForKey(key)
                    };
                }
            }
        } else if (allowStamp) {
            // When stopped, pressing a key puts a 16th note under the playhead
            const total16 = this.getTotalLength16();
            let start16 = this.quantizeNote(this.scrollPos);

            this.recNotes.push({
                key,
                note: data.note,
                freq: data.freq,
                isPad: isPad,
                start16: start16 % total16,
                end16: (start16 + (isPad ? 0.25 : 1)) % total16 || total16,
                synthSnapshot: this.synth.getSnapshotForKey(key)
            });
            this._triggeredThisCycle.add(this.recNotes.length - 1);
            this.onStateChange();
        }

        // Pad keys always have drum trigger effect (handled in synth.playNote)
        voiceId = this.synth.playNote(key, data.freq, isPad ? true : null);

        // If we are tracking an open piano note, store the voice token so we can stop exactly this instance on release
        if (this.recOpenNotes[key]) {
            this.recOpenNotes[key].voiceId = voiceId;
        }
    }

    noteOff(key) {
        const entry = this.recOpenNotes[key];
        const voiceId = entry ? entry.voiceId : null;
        this._closeNote(key);
        this.synth.stopNote(key, null, voiceId);
    }

    _closeNote(key) {
        const entry = this.recOpenNotes[key];
        if (!entry) return;
        let end16 = this.scrollPos;

        // Handle wrap-around: if end is before start (roll wrapped), add total length
        const total16 = this.getTotalLength16();
        if (end16 < entry.start16) end16 += total16;

        // Clamp to at least a 32nd note in length
        const minLen = 0.5;
        if (end16 - entry.start16 < minLen) end16 = entry.start16 + minLen;

        this.recNotes.push({
            key,
            note: entry.note,
            freq: entry.freq,
            isPad: false, // Piano notes
            start16: entry.start16 % total16,
            end16: end16 % total16 || total16, // keep within range
            synthSnapshot: entry.synthSnapshot
        });
        this._triggeredThisCycle.add(this.recNotes.length - 1);
        delete this.recOpenNotes[key];
    }

    clearNotes() {
        this.recNotes = [];
        this.recOpenNotes = {};
        this.onStateChange();
    }

    // ---- Legacy playback (for saved loops) ----

    startPlayback(notes, synthSnapshot, options = {}) {
        const {
            solo = false,
            startTime = this.synth.audioCtx.currentTime,
            offset16 = 0,
            duration16 = null
        } = options;

        if (solo) this._stopPlayback();

        this.recState = 'playing';
        this.onStateChange();

        const snapshot = synthSnapshot || this.synth.snapshot();
        if (solo) {
            this.synth.applySnapshot(snapshot);
        }

        const loopBars16 = this.getTotalLength16();
        const sixteenth_s = this.getSixteenthDuration();

        const sessionTimers = [];

        notes.forEach(ev => {
            let evStart16 = (ev.start16 !== undefined ? ev.start16 : (ev.start || 0) * 16) - offset16;
            let evEnd16 = (ev.end16 !== undefined ? ev.end16 : (ev.end || 0) * 16) - offset16;

            // If the note is entirely before or after the visible window of this clip iteration
            if (duration16 !== null) {
                if (evEnd16 <= 0 || evStart16 >= duration16) return;
                // Clamp
                evStart16 = Math.max(0, evStart16);
                evEnd16 = Math.min(duration16, evEnd16);
            } else {
                // Legacy / loop mode: if it's before the start, ignore it
                if (evEnd16 <= 0) return;
            }

            const tOn = startTime + (evStart16 * sixteenth_s);
            const tOff = startTime + (evEnd16 * sixteenth_s);

            const delayMs = (tOn - this.synth.audioCtx.currentTime) * 1000;

            const onTimer = setTimeout(() => {
                const voiceId = this.synth.playNote(ev.key, ev.freq, ev.isPad, ev.synthSnapshot || snapshot, tOn);

                const offDelayMs = (tOff - this.synth.audioCtx.currentTime) * 1000;
                const offTimer = setTimeout(() => {
                    this.synth.stopNote(ev.key, null, voiceId, tOff);
                }, Math.max(0, offDelayMs));

                sessionTimers.push(offTimer);
                this.recPlaybackTimers.push(offTimer);

            }, Math.max(0, delayMs - 10));

            sessionTimers.push(onTimer);
            this.recPlaybackTimers.push(onTimer);
        });

        const loopDurMs = (duration16 || loopBars16) * sixteenth_s * 1000;
        const endTimer = setTimeout(() => {
            // Clean up this session's timers from the global list
            sessionTimers.forEach(t => {
                const idx = this.recPlaybackTimers.indexOf(t);
                if (idx > -1) this.recPlaybackTimers.splice(idx, 1);
            });

            if (this.recPlaybackTimers.length === 0) {
                this.recState = 'idle';
                this.onStateChange();
            }
        }, loopDurMs + 100);

        this.recPlaybackTimers.push(endTimer);

        if (solo) {
            this._animatePlayhead(loopDurMs);
        }
    }

    _stopPlayback(immediate = false) {
        this.recPlaybackTimers.forEach(t => clearTimeout(t));
        this.recPlaybackTimers = [];
        clearTimeout(this._recPlaybackEndTimer);
        if (this._playheadRAF) cancelAnimationFrame(this._playheadRAF);
        this.synth.stopAllNotes(immediate);
        this.onPlayheadUpdate(0);
    }

    _animatePlayhead(totalMs) {
        const start = performance.now();
        const step = () => {
            const elapsed = performance.now() - start;
            const pct = Math.min(elapsed / totalMs, 1);
            this.onPlayheadUpdate(pct);
            if (elapsed < totalMs && this.recState === 'playing') {
                this._playheadRAF = requestAnimationFrame(step);
            }
        };
        this._playheadRAF = requestAnimationFrame(step);
    }

    stopAll(immediate = false) {
        this.countInTimers.forEach(t => clearTimeout(t));
        this.countInTimers = [];
        clearTimeout(this._recAutoStopTimer);
        this.stopRoll(immediate);
        this._stopPlayback(immediate);
        this.recOpenNotes = {};
        this.recState = 'idle';
        this.synth.stopAllNotes(immediate);
        this.onStateChange();
    }

    // ---- Randomization ----

    randomMelody(keyMap) {
        if (this.recNotes.length === 0) return;

        const pianoKeys = Object.entries(keyMap)
            .filter(([k, d]) => d.type !== 'pad')
            .map(([k, d]) => ({ key: k, ...d }));

        if (pianoKeys.length === 0) return;

        const noteToSemi = (n) => {
            const name = n.replace(/[0-9]/g, '');
            return { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 }[name] || 0;
        };

        // 1. Collect used notes to find a "scale"
        const usedSemis = new Set();
        this.recNotes.forEach(n => {
            if (!n.isPad) usedSemis.add(noteToSemi(n.note));
        });

        let scalePitches = Array.from(usedSemis);
        if (scalePitches.length < 3) {
            const root = scalePitches[0] || 0;
            // Default to minor pentatonic if we don't have enough notes
            scalePitches = [0, 3, 5, 7, 10].map(s => (s + root) % 12);
        }

        // 2. Guess rhythm: find occupied 16th slots in a bar
        const rhythmProfile = new Array(16).fill(0);
        this.recNotes.forEach(n => {
            const pos = Math.floor(n.start16) % 16;
            rhythmProfile[pos]++;
        });
        const totalNotes = this.recNotes.length;
        const probs = rhythmProfile.map(c => Math.min(0.8, (c / totalNotes) * 1.5 + 0.1));

        // 3. Find an empty half-measure (8 steps) starting from playhead
        const total16 = this.getTotalLength16();
        if (this.recNotes.length >= 2000) return; // Limit total notes

        let targetStart = -1;
        const startSearch = Math.floor(this.scrollPos / 8) * 8;

        // Optimization: Pre-sort or just filter notes that could possibly overlap
        // Since it's only 8 steps, we can just check if any notes exist in the bucket.
        const occupiedBuckets = new Set();
        this.recNotes.forEach(n => {
            let s = Math.floor(n.start16 / 8) * 8;
            let e = Math.floor((n.end16 - 0.01) / 8) * 8;
            occupiedBuckets.add(s % total16);
            occupiedBuckets.add(e % total16);
            // Handle notes spanning multiple buckets
            if (e > s) {
                for (let b = s + 8; b < e; b += 8) occupiedBuckets.add(b % total16);
            }
        });

        for (let i = 0; i < total16; i += 8) {
            const testStart = (startSearch + i) % total16;
            if (!occupiedBuckets.has(testStart)) {
                targetStart = testStart;
                break;
            }
        }

        if (targetStart === -1) return; // No empty half-measures available

        // 4. Fill the empty half-measure
        for (let i = 0; i < 8; i++) {
            const step = (targetStart + i) % total16;
            if (Math.random() < probs[step % 16]) {
                const pitchSemi = scalePitches[Math.floor(Math.random() * scalePitches.length)];
                const candidateKeys = pianoKeys.filter(pk => noteToSemi(pk.note) === pitchSemi);
                if (candidateKeys.length > 0) {
                    const chosen = candidateKeys[Math.floor(Math.random() * candidateKeys.length)];
                    this.recNotes.push({
                        key: chosen.key,
                        note: chosen.note,
                        freq: chosen.freq,
                        isPad: false,
                        start16: step,
                        end16: (step + 1) % total16 || total16,
                        synthSnapshot: this.synth.snapshot()
                    });
                }
            }
        }
        this.onStateChange();
    }

    randomChords(keyMap) {
        if (this.recNotes.length === 0 || this.recNotes.length >= 2000) return;

        const pianoKeys = Object.entries(keyMap)
            .filter(([k, d]) => d.type !== 'pad')
            .map(([k, d]) => ({ key: k, ...d }));

        const noteToSemi = (n) => {
            const name = n.replace(/[0-9]/g, '');
            return { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 }[name] || 0;
        };

        // Efficient solo check: bucket notes by time
        const timeMap = {}; // start16 -> notes
        this.recNotes.forEach(n => {
            if (n.isPad) return;
            const t = Math.round(n.start16 * 100) / 100;
            if (!timeMap[t]) timeMap[t] = [];
            timeMap[t].push(n);
        });

        const newNotes = [];
        this.recNotes.forEach((n) => {
            if (n.isPad) return;

            const t = Math.round(n.start16 * 100) / 100;
            const concurrent = timeMap[t] || [];

            // If it's the only note starting at this time, consider it "solo"
            if (concurrent.length === 1) {
                const rootSemi = noteToSemi(n.note);
                const thirdInterval = Math.random() > 0.5 ? 4 : 3;
                [thirdInterval, 7].forEach(interval => {
                    const targetSemi = (rootSemi + interval) % 12;
                    const candidates = pianoKeys.filter(pk => noteToSemi(pk.note) === targetSemi);
                    if (candidates.length > 0) {
                        const chosen = candidates[Math.floor(candidates.length / 2)];
                        newNotes.push({
                            key: chosen.key,
                            note: chosen.note,
                            freq: chosen.freq,
                            isPad: false,
                            start16: n.start16,
                            end16: n.end16,
                            synthSnapshot: n.synthSnapshot || this.synth.snapshot()
                        });
                    }
                });
            }
        });

        this.recNotes.push(...newNotes.slice(0, 2000 - this.recNotes.length));
        this.onStateChange();
    }

    // ---- Save / Load ----

    saveLoop(name) {
        if (this.recNotes.length === 0) return null;

        const LOOP_COLORS = [
            '#ea461d', '#2a9d8f', '#e9c46a', '#a8dadc',
            '#f4a261', '#6a4c93', '#80b918', '#e63946'
        ];
        const idx = this.savedLoops.length;
        const bundle = {
            id: Date.now(),
            name: name || `Loop ${idx + 1}`,
            color: LOOP_COLORS[idx % LOOP_COLORS.length],
            bpm: this.bpm,
            bars: this.loopBars,
            notes: JSON.parse(JSON.stringify(this.recNotes)), // deep copy notes
            synth: this.synth.snapshot()
        };
        this.savedLoops.push(bundle);
        return bundle;
    }

    // ---- Compat stubs (old UI referenced these) ----
    startCountIn() { this.startRoll(); }
    startRecording() { this.startRoll(); }
    stopRecording() { this.stopRoll(); }
}
