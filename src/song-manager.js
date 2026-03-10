export class SongManager {
    constructor(funkMaker) {
        this.fm = funkMaker;
        this.seq = funkMaker.seq;

        // NEW: Model-first architecture
        this.tracks = [
            { id: 0, name: 'Track 1', clips: [], volume: 0.8 },
            { id: 1, name: 'Track 2', clips: [], volume: 0.8 },
            { id: 2, name: 'Track 3', clips: [], volume: 0.8 },
            { id: 3, name: 'Track 4', clips: [], volume: 0.8 }
        ];

        this.pxPer16 = 5; // Default: Max zoomed out overview
        this.isPlaying = false;
        this.playhead16 = 0;
        this._songRAF = null;
        this._lastTimestamp = null;

        // Tracks which clips have been triggered in the current playback run
        this._triggeredClips = new Set();
        this.toolMode = 'select';
    }

    loadSong(songData) {
        if (!songData) return;

        this.totalBars = songData.bars || 16;

        if (songData.bpm) {
            this.fm.seq.bpm = songData.bpm;
            // Sync UI if open
            const bpmInput = this.fm.winRef?.element.querySelector('#fm-bpm');
            if (bpmInput) bpmInput.value = songData.bpm;
        }

        if (songData.tracks) {
            // Reconstruct tracks and clips
            this.tracks = songData.tracks.map(t => ({
                id: t.id,
                name: t.name,
                volume: t.volume || 0.8,
                clips: (t.clips || []).map(c => ({
                    id: c.id || crypto.randomUUID(),
                    start16: c.start16,
                    duration16: c.duration16,
                    offset16: c.offset16 || 0,
                    loop: c.loop, // The full loop snapshot
                    isLooping: true
                }))
            }));
        }

        if (songData.bars) {
            // Wait for DOM
            setTimeout(() => {
                const barsInput = this.fm.winRef?.element.querySelector('#fm-song-bars');
                if (barsInput) barsInput.value = songData.bars;
                this.renderTimeline();
            }, 50);
        } else {
            this.renderTimeline();
        }
    }

    renderSongPanel() {
        return `
            <div class="fm-song-panel">
                <div class="fm-song-sidebar">
                    <div class="fm-sidebar-header">
                        <div class="fm-sidebar-title">SAVED LOOPS</div>
                        <div class="fm-trash-can" id="fm-trash-can" title="Drop loops here to delete"></div>
                    </div>
                    <div class="fm-loop-bank" id="fm-loop-bank">
                        <!-- Chips will be rendered here by renderLoopBank -->
                    </div>
                </div>

                <div class="fm-timeline-container">
                    <div class="fm-song-header">
                        <div class="fm-header-left">
                            <div class="fm-transport-group">
                                <button class="fm-transport-btn" id="fm-song-play">▶ PLAY ALL</button>
                                <button class="fm-transport-btn" id="fm-song-stop">■ STOP</button>
                            </div>
                            <div class="fm-separator"></div>
                            <div class="fm-tool-group">
                                <button class="fm-transport-btn fm-tool-btn" id="fm-tool-select" title="Select Tool">🖱️</button>
                                <button class="fm-transport-btn fm-tool-btn" id="fm-tool-scissors" title="Scissor Tool">✂️</button>
                            </div>
                        </div>
                        
                        <div class="fm-header-right">
                            <div class="fm-transport-group">
                                <span class="fm-transport-label">BPM</span>
                                <input type="number" class="fm-bpm-input" id="fm-song-bpm" value="${this.seq.bpm}" min="40" max="240" />
                            </div>
                            <div class="fm-transport-group fm-zoom-group">
                                <span class="fm-transport-label">ZOOM</span>
                                <input type="range" class="fm-zoom-slider" id="fm-song-zoom" min="0" max="100" value="50" />
                            </div>
                        </div>
                    </div>

                    <div class="fm-timeline-viewport" id="fm-timeline-viewport">
                        <div class="fm-timeline-scroller" id="fm-timeline-scroller">
                            <div class="fm-timeline-ruler" id="fm-timeline-ruler"></div>
                            <div class="fm-tracks" id="fm-tracks">
                                ${this.tracks.map(track => `
                                    <div class="fm-track" data-track-id="${track.id}">
                                        <div class="fm-track-lane" data-track="${track.id}"></div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="fm-song-playhead" id="fm-song-playhead"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderLoopBank() {
        if (!this.fm.winRef) return;
        const slots = this.fm.winRef.element.querySelector('#fm-loop-bank');
        if (!slots) return;
        slots.innerHTML = '';

        if (this.seq.savedLoops.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fm-shelf-empty';
            empty.innerHTML = 'Saved loops will appear here.<br><br>Record something in the LOOP tab and hit Save!';
            slots.appendChild(empty);
            return;
        }

        // Render from newest to oldest
        [...this.seq.savedLoops].reverse().forEach((loop, revIdx) => {
            const idx = this.seq.savedLoops.length - 1 - revIdx;
            const chip = document.createElement('div');
            chip.className = 'fm-loop-chip';
            chip.draggable = true;
            chip.dataset.loopIdx = idx;

            const dot = document.createElement('div');
            dot.className = 'fm-loop-chip-color';
            dot.style.background = loop.color;
            dot.style.color = loop.color;

            const name = document.createElement('span');
            name.textContent = loop.name;

            const play = document.createElement('button');
            play.className = 'fm-chip-play-btn';
            play.textContent = '▶';
            play.title = 'Preview Loop';
            play.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.isPlaying) this.stopSong();
                if (this.seq.recState !== 'idle') this.seq.stopAll();
                this.seq.startPlayback(loop.notes, loop.synth, { solo: true });
            });

            chip.appendChild(dot);
            chip.appendChild(name);
            chip.appendChild(play);

            chip.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/funkmaker-loop', String(idx));
                e.dataTransfer.effectAllowed = 'copy';
                chip.style.opacity = '0.5';
            });

            chip.addEventListener('dragend', () => {
                chip.style.opacity = '1';
            });

            slots.appendChild(chip);
        });
    }

    setupEventListeners(win) {
        const el = win.element;

        el.querySelector('#fm-song-play')?.addEventListener('click', () => {
            this.startSong();
        });

        el.querySelector('#fm-song-stop')?.addEventListener('click', () => {
            this.stopSong();
        });

        // Sync BPM between tabs
        const songBpmInput = el.querySelector('#fm-song-bpm');
        if (songBpmInput) {
            songBpmInput.addEventListener('change', () => {
                const newBpm = Math.max(40, Math.min(240, parseInt(songBpmInput.value) || 120));
                if (this.fm.syncBpm) {
                    this.fm.syncBpm(newBpm);
                } else {
                    this.seq.bpm = newBpm;
                    const loopBpmInput = this.fm.winRef?.element.querySelector('#fm-bpm');
                    if (loopBpmInput) loopBpmInput.value = newBpm;
                }
            });
            songBpmInput.addEventListener('keydown', (e) => {
                if (['e', 'E', '.', '-', '+'].includes(e.key)) e.preventDefault();
            });
        }


        const selectTool = el.querySelector('#fm-tool-select');
        const scissorsTool = el.querySelector('#fm-tool-scissors');

        const updateToolUI = () => {
            selectTool?.classList.toggle('active', this.toolMode === 'select');
            scissorsTool?.classList.toggle('active', this.toolMode === 'scissors');
        };

        selectTool?.addEventListener('click', () => {
            this.toolMode = 'select';
            updateToolUI();
        });

        scissorsTool?.addEventListener('click', () => {
            this.toolMode = 'scissors';
            updateToolUI();
        });

        updateToolUI();

        const zoomInput = el.querySelector('#fm-song-zoom');
        if (zoomInput) {
            zoomInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                // Non-linear mapping: 0-50 maps to 1-5px, 50-100 maps to 5-100px.
                // This makes the new default (5px) the middle of the slider.
                if (val <= 50) {
                    this.pxPer16 = (val / 50) * 4 + 1;
                } else {
                    this.pxPer16 = ((val - 50) / 50) * 95 + 5;
                }
                this.renderTimeline();
            });
        }

        // Handle dropping loops onto tracks
        const lanes = el.querySelectorAll('.fm-track-lane');
        lanes.forEach(lane => {
            lane.addEventListener('dragover', (e) => {
                e.preventDefault();
                lane.classList.add('drag-over');
            });
            lane.addEventListener('dragleave', () => {
                lane.classList.remove('drag-over');
            });
            lane.addEventListener('drop', (e) => {
                e.preventDefault();
                lane.classList.remove('drag-over');
                const loopIdxString = e.dataTransfer.getData('application/funkmaker-loop');
                if (loopIdxString !== "") {
                    const trackIdx = lane.dataset.track;
                    this.addLoopToTimeline(parseInt(loopIdxString), parseInt(trackIdx), e.offsetX);
                }
            });
        });

        // Trash Can Delete Interaction
        const trashCan = el.querySelector('#fm-trash-can');
        if (trashCan) {
            trashCan.addEventListener('dragover', (e) => {
                e.preventDefault();
                trashCan.classList.add('drag-over');
            });
            trashCan.addEventListener('dragleave', () => {
                trashCan.classList.remove('drag-over');
            });
            trashCan.addEventListener('drop', async (e) => {
                e.preventDefault();
                trashCan.classList.remove('drag-over');
                const loopIdxString = e.dataTransfer.getData('application/funkmaker-loop');
                if (loopIdxString !== "") {
                    const loopIdx = parseInt(loopIdxString);
                    const loop = this.seq.savedLoops[loopIdx];
                    if (!loop) return;

                    const confirmed = await this.fm.wm.confirm(
                        `Are you sure you want to delete the loop "${loop.name}"? This cannot be undone.`,
                        { title: 'Confirm Delete' }
                    );

                    if (confirmed) {
                        this.seq.savedLoops.splice(loopIdx, 1);
                        this.fm._persistLoops();
                        this.renderLoopBank();
                    }
                }
            });
        }

        this.renderTimeline();
    }

    renderTimeline() {
        if (!this.fm.winRef) return;
        const el = this.fm.winRef.element;

        // 0. Recalculate actual song length
        let max16 = 0;
        this.tracks.forEach(track => {
            track.clips.forEach(clip => {
                const end16 = clip.start16 + clip.duration16;
                if (end16 > max16) max16 = end16;
            });
        });
        // Update length display (if we still want to show it somewhere, but user asked to replace it)
        // For now, we'll keep the internal totalBars updated.
        this.totalBars = max16 / 16;


        // Use a visual length that is at least enough to contain clips, plus some room
        const visualBars = Math.max(this.totalBars + 8, 16);
        const total16 = visualBars * 16;
        const timelineWidth = total16 * this.pxPer16;
        const labelWidth = 0;

        // 1. Update ruler
        const ruler = el.querySelector('#fm-timeline-ruler');
        if (ruler) {
            ruler.innerHTML = '';
            ruler.style.width = `${timelineWidth + labelWidth}px`;
            for (let i = 0; i < Math.ceil(visualBars); i++) {
                const tick = document.createElement('div');
                tick.className = 'fm-ruler-tick fm-ruler-bar';
                // Offset by labelWidth so it aligns with lanes
                tick.style.left = `${labelWidth + i * 16 * this.pxPer16}px`;
                tick.textContent = i + 1;
                ruler.appendChild(tick);
            }
        }

        // 2. Render Tracks
        const trackContainer = el.querySelector('#fm-tracks');
        if (!trackContainer) return;
        trackContainer.style.width = `${timelineWidth + labelWidth}px`;

        this.tracks.forEach(track => {
            const lane = trackContainer.querySelector(`.fm-track-lane[data-track="${track.id}"]`);
            if (!lane) return;

            lane.innerHTML = '';
            // Lane width is exactly the timeline content width
            lane.style.width = `${timelineWidth}px`;

            track.clips.forEach(clip => {
                const blockEl = document.createElement('div');
                blockEl.className = 'fm-timeline-block';
                blockEl.style.left = `${clip.start16 * this.pxPer16}px`;
                blockEl.style.width = `${clip.duration16 * this.pxPer16}px`;
                blockEl.style.background = clip.loop.color;
                blockEl.textContent = clip.loop.name;
                blockEl.dataset.clipId = clip.id;

                // Move interaction
                blockEl.addEventListener('mousedown', (e) => {
                    if (e.target.classList.contains('fm-block-delete')) return;
                    if (e.target.classList.contains('fm-block-resize')) return;
                    this._onBlockMouseDown(e, clip, track);
                });

                // Resize handle
                const resize = document.createElement('div');
                resize.className = 'fm-block-resize';
                resize.addEventListener('mousedown', (e) => {
                    this._onResizeMouseDown(e, clip);
                });
                blockEl.appendChild(resize);

                // Delete button
                const del = document.createElement('div');
                del.className = 'fm-block-delete';
                del.textContent = '×';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    track.clips = track.clips.filter(c => c !== clip);
                    this.renderTimeline();
                });
                blockEl.appendChild(del);

                lane.appendChild(blockEl);
            });
        });

        this._updatePlayhead();
    }

    _onResizeMouseDown(e, clip) {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const initialDuration16 = clip.duration16;

        const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const sixteenthDiff = dx / this.pxPer16;

            // Snap to sixteenths or 1/4 bars? Let's say sixteenths for fine chopping
            let newDuration16 = Math.max(1, initialDuration16 + sixteenthDiff);

            // Optional: Snap to beats (4 sixteenths) if Shift is NOT held? 
            // For now just snap to sixteenths
            newDuration16 = Math.round(newDuration16);

            clip.duration16 = newDuration16;
            this.renderTimeline();
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    _onBlockMouseDown(e, clip, track) {
        e.preventDefault();
        e.stopPropagation();

        if (this.toolMode === 'scissors') {
            // Calculate split point in sixteenths
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const splitOffset16 = Math.round(clickX / this.pxPer16);

            if (splitOffset16 > 0 && splitOffset16 < clip.duration16) {
                // Perform the split
                const newClip = JSON.parse(JSON.stringify(clip));
                newClip.id = crypto.randomUUID();

                // Left half stays as original clip
                const originalDuration = clip.duration16;
                clip.duration16 = splitOffset16;

                // Right half becomes new clip
                newClip.start16 = clip.start16 + splitOffset16;
                newClip.duration16 = originalDuration - splitOffset16;
                // Update offset for the right half? 
                // For now, if it's a loop, we just shift the start. 
                // A better approach would be to track source start offset.
                newClip.offset16 = (clip.offset16 || 0) + splitOffset16;

                track.clips.push(newClip);
                this.renderTimeline();
            }
            return;
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const initialStart16 = clip.start16;
        const initialTrackId = track.id;

        const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            // X movement -> start16
            const sixteenthDiff = dx / this.pxPer16;
            let newStart16 = Math.round((initialStart16 + sixteenthDiff) / 4) * 4;
            if (newStart16 < 0) newStart16 = 0;
            clip.start16 = newStart16;

            // Y movement -> track change (30px is roughly track height)
            const trackDiff = Math.round(dy / 40);
            const newTrackId = Math.max(0, Math.min(this.tracks.length - 1, initialTrackId + trackDiff));

            if (newTrackId !== track.id) {
                // Remove from old track
                track.clips = track.clips.filter(c => c.id !== clip.id);
                // Add to new track
                const newTrack = this.tracks.find(t => t.id === newTrackId);
                newTrack.clips.push(clip);
                track = newTrack; // Update local track ref for ongoing move
            }

            this.renderTimeline();
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    addLoopToTimeline(loopIdx, trackIdx, xPos) {
        const loop = this.seq.savedLoops[loopIdx];
        if (!loop) return;

        const track = this.tracks.find(t => t.id === trackIdx);
        if (!track) return;

        // Snap to nearest 1/4 bar (4 sixteenths), ensuring it doesn't go below 0
        const sixteenthPos = xPos / this.pxPer16;
        let snapped16 = Math.round(sixteenthPos / 4) * 4;

        // Strong snap to beginning if dropped in the first beat
        if (snapped16 < 0 || sixteenthPos < 2) snapped16 = 0;

        const clip = {
            id: crypto.randomUUID(),
            loop: JSON.parse(JSON.stringify(loop)), // snapshot of the loop
            start16: snapped16,
            duration16: loop.bars * 16,
            offset16: 0,
            isLooping: true
        };

        track.clips.push(clip);
        this.renderTimeline();
    }

    startSong() {
        if (this.isPlaying) this.stopSong();
        this.isPlaying = true;
        this.playhead16 = 0;
        this._triggeredClips.clear();

        // Start the master clock
        const ctx = this.seq.synth.audioCtx;
        this.songStartTime = ctx.currentTime;
        this._lastTimestamp = performance.now();
        this._songTick();

        const playBtn = this.fm.winRef?.element.querySelector('#fm-song-play');
        if (playBtn) playBtn.classList.add('playing');

        // Preview UI update
        const previewPlayBtn = this.fm.winRef?.element.querySelector('#fm-preview-play');
        if (previewPlayBtn) {
            previewPlayBtn.textContent = '■ STOP';
        }
    }

    stopSong() {
        this.isPlaying = false;
        if (this._songRAF) cancelAnimationFrame(this._songRAF);
        this.seq.stopAll(true);
        this.playhead16 = 0;
        this._updatePlayhead();

        const playBtn = this.fm.winRef?.element.querySelector('#fm-song-play');
        if (playBtn) playBtn.classList.remove('playing');

        // Preview UI update
        const previewPlayBtn = this.fm.winRef?.element.querySelector('#fm-preview-play');
        if (previewPlayBtn) {
            previewPlayBtn.textContent = '▶ PLAY';
        }
    }

    _songTick() {
        if (!this.isPlaying) return;

        const ctx = this.seq.synth.audioCtx;
        const now = ctx.currentTime;
        const sixteenth_s = this.seq.getSixteenthDuration();

        // Master clock derived from audio context
        const prevPlayhead = this.playhead16;
        this.playhead16 = (now - this.songStartTime) / sixteenth_s;

        const total16 = this.totalBars * 16;

        if (this.playhead16 >= total16) {
            this.stopSong();
            return;
        }

        // Trigger clips: use a look-ahead window for reliability
        const lookahead16 = 2; // Schedule ~2 sixteenths ahead (approx 250ms at 120bpm)
        const windowEnd16 = this.playhead16 + lookahead16;

        this.tracks.forEach(track => {
            track.clips.forEach(clip => {
                const loopLen16 = clip.loop.bars * 16;
                const clipEnd16 = clip.start16 + clip.duration16;

                // Handle scissored/looping clips by breaking them into per-loop iterations
                let currentPos16 = clip.start16;
                let iterationIdx = 0;

                while (currentPos16 < clipEnd16) {
                    const triggerId = `${clip.id}-${iterationIdx}`;

                    // The first iteration might have an offset (start mid-loop)
                    const iterationOffset = (iterationIdx === 0) ? (clip.offset16 || 0) : 0;

                    // How much of the source loop is remaining in this iteration?
                    const sourceRemaining = loopLen16 - iterationOffset;

                    // How much of the clip is remaining?
                    const clipRemaining = clipEnd16 - currentPos16;

                    // This iteration lasts for the smaller of the two
                    const iterationDuration = Math.min(sourceRemaining, clipRemaining);

                    if (!this._triggeredClips.has(triggerId)) {
                        // If the start of this iteration falls within our lookahead window
                        if (currentPos16 >= this.playhead16 && currentPos16 < windowEnd16) {
                            this._triggeredClips.add(triggerId);

                            const triggerTime = this.songStartTime + (currentPos16 * sixteenth_s);

                            this.seq.startPlayback(clip.loop.notes, clip.loop.synth, {
                                startTime: triggerTime,
                                offset16: iterationOffset,
                                duration16: iterationDuration
                            });
                        }
                    }

                    currentPos16 += iterationDuration;
                    iterationIdx++;
                }
            });
        });

        this._updatePlayhead();
        this._songRAF = requestAnimationFrame(() => this._songTick());
    }

    _updatePlayhead() {
        if (!this.fm.winRef) return;
        const ph = this.fm.winRef.element.querySelector('#fm-song-playhead');
        if (ph) {
            // Align with lanes
            ph.style.left = `${this.playhead16 * this.pxPer16}px`;
        }

        // Preview playhead
        const previewPh = this.fm.winRef.element.querySelector('#fm-preview-playhead');
        if (previewPh) {
            const total16 = this.totalBars * 16;
            const progress = (this.playhead16 / total16) * 100;
            previewPh.style.left = `${progress}%`;
        }
    }
}

