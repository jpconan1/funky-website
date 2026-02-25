# JP-OS App Development Plan

## Overview
Building out a "Toy OS" application suite. Apps are playgrounds for creation, following the "Ink on Paper" rule: Freedom within the app, but permanence once saved to the cloud.

## 1. The Architecture: "The File-App Association"
- **The Registry**: Robust App Registry in `desktop.js`.
- **Persistence**: Interfaces with `supabase.js`. Once a file is saved, it is read-only. Editing requires "Saving As" a new version or deleting the old one.

## 2. App Roadmap

### A. Rich Text Editor (Priority: High)
- **Tech**: `contenteditable` div.
- **Features**: Formatting, Font selection (BIOS, Funky, Modern), Text sizing.
- **Data**: Saves as HTML strings.

### B. ImgEditor (Priority: Medium)
- **New Name**: Formerly "Paint".
- **Features**:
    - **Pencil/Bucket/Eraser**: Standard digital tools.
    - **Harmony Brush**: Detects the current HSL value and paints with complementary/triadic colors in a jittered or alternating pattern.
    - **Dither Wand**: Applies retro checkerboard patterns between the "Primary" and "Secondary" colors for shading.
- **Data**: Saves as Base64/DataURL.

### C. GrooveBox (Priority: Medium)
- **Concept**: A 2004-style loop/step sequencer balancing ease-of-use with synthesis.
- **Features**:
    - **Step Sequencer**: 16-step grid for drums and melody.
    - **Macro-Synth**: No complex oscillators; just simple knobs for "Mood" (Bright/Dark) and "Shape" (Short/Long).
    - **Scale Snapping**: Constrains notes to specific scales (Major, Minor, Pentatonic) so you can't hit a "wrong" note.
    - **"Mutate" Button**: Procedurally generates a new pattern or sound tweak to get the groove started.

### D. The Composer (the "Super App")
- **Purpose**: Unifies the ecosystem.
- **Features**:
    - **Multitrack Timeline**: Drag and drop `.txt`, `.draw` (ImgEditor), and `.loop` (GrooveBox) files from the desktop.
    - **Transitions**: Simple Fade In/Out for each element.
    - **Output**: Saves as a `.show` file—a multimedia zine that plays back the sequence.

## 3. Implementation Steps
1. **Infrastructure**: Finalize File-App Registry.
2. **Text Editor**: Refine `TextEditor.js`.
3. **ImgEditor**: Implement `ImgEditor.js` with Harmony/Dither tools.
4. **GrooveBox**: Build the Web Audio sequencer.
5. **The Composer**: Build the final assembly tool.

