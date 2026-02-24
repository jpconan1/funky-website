# JP-OS App Development Plan

## Overview
Building out the core application suite for JP-OS, moving from simple text display to a modular, app-based ecosystem.

## 1. The Architecture: "The File-App Association"
- **The Registry**: Transform the `openFile` logic in `desktop.js` into a robust App Registry.
- **Workflow**: 
    1. Identify file extension or `isCloud` status.
    2. Lookup associated App class/handler.
    3. Initialize App within a new Window Manager window.
- **Persistence**: All apps will interface with `supabase.js` to save/load data from the `messages` table.

## 2. App Roadmap

### A. Rich Text Editor (Priority: High)
- **Tech**: `contenteditable` div, `document.execCommand`.
- **Features**: 
    - Formatting (Bold, Italic, Underline).
    - Font selection (Pixel, Serif, Funky).
    - Text sizing.
- **Data**: Saves as HTML strings to Supabase.

### B. MS Paint Clone (Priority: Medium)
- **Tech**: HTML5 Canvas.
- **Features**: 
    - Drawing tools (different from standard Paint, but pixel-focused).
    - Color palette.
    - Flood fill.
- **Data**: Saves as Base64/DataURL.

### C. Synth Loop Thing (Priority: Low / Research)
- **Tech**: Web Audio API.
- **Status**: TBD. This is the "experiment" app to be built last.
- **Features**: Sequencer, oscillators, filters.

## 3. Implementation Steps
1. **Infrastructure**: Implement the File-App Registry in `desktop.js`.
2. **Text Editor**: Upgrade `TextEditor.js`.
3. **Paint**: Create `Paint.js`.
4. **Synth**: Create `Synth.js`.
