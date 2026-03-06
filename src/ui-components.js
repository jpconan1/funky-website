export const UI = {

    /**
     * Vertical slider — uses a native <input type="range"> that is CSS-rotated
     * 90° so it feels natural for height/zoom controls.
     * The thumb is intentionally large so it's easy to grab on mobile.
     *
     * @param {number} min
     * @param {number} max
     * @param {number} value  initial value
     * @param {Function} onChange  called with the numeric value on every change
     * @param {number} [step=0.01]
     * @returns {HTMLElement}  the outer wrapper element
     */
    createVerticalSlider(min, max, value, onChange, step = 0.01) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ui-vslider-wrapper';

        const label = document.createElement('span');
        label.className = 'ui-vslider-label';
        label.textContent = `${Math.round(value * 100)}%`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'ui-vslider';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        // Prevent the page from scrolling while the user drags the slider
        slider.style.touchAction = 'none';

        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            label.textContent = `${Math.round(val * 100)}%`;
            onChange(val);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(slider);

        /** Expose a method so the WindowManager can update the thumb position
         *  when the scale changes from somewhere else (e.g. pinch-to-zoom). */
        wrapper.setValue = (newVal) => {
            slider.value = newVal;
            label.textContent = `${Math.round(newVal * 100)}%`;
        };

        return wrapper;
    },

    /**
     * Horizontal zoom slider — same native range but laid out horizontally.
     * Used when the window is too close to the left edge for the vertical bar.
     */
    createHorizontalZoomSlider(min, max, value, onChange, step = 0.01) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ui-hslider-wrapper';

        const label = document.createElement('span');
        label.className = 'ui-hslider-label';
        label.textContent = `${Math.round(value * 100)}%`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'ui-hslider';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.style.touchAction = 'none';

        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            label.textContent = `${Math.round(val * 100)}%`;
            onChange(val);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(slider);

        wrapper.setValue = (newVal) => {
            slider.value = newVal;
            label.textContent = `${Math.round(newVal * 100)}%`;
        };

        return wrapper;
    },

    createDropdown(label, options, onChange) {
        const container = document.createElement('div');
        container.className = 'ui-field ui-dropdown-container';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.className = 'ui-label';

        const select = document.createElement('select');
        select.className = 'ui-select';

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.selected) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => onChange(e.target.value));

        container.appendChild(labelEl);
        container.appendChild(select);
        return container;
    },

    createSlider(label, min, max, value, onChange, step = 1) {
        const container = document.createElement('div');
        container.className = 'ui-field ui-slider-container';

        const labelArea = document.createElement('div');
        labelArea.className = 'ui-label-area';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.className = 'ui-label';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = value;
        valueDisplay.className = 'ui-value-display';

        labelArea.appendChild(labelEl);
        labelArea.appendChild(valueDisplay);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.className = 'ui-slider';

        slider.addEventListener('input', (e) => {
            let val = e.target.value;
            // Round display value if it's a small step to avoid floating point nastiness
            if (step < 1) {
                val = parseFloat(val).toFixed(2);
            }
            valueDisplay.textContent = val;
            onChange(e.target.value);
        });

        container.appendChild(labelArea);
        container.appendChild(slider);
        return container;
    },

    createKnob(label, min, max, value, onChange) {
        const container = document.createElement('div');
        container.className = 'ui-field ui-knob-container';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.className = 'ui-label';
        labelEl.style.textAlign = 'center';

        const knobWrapper = document.createElement('div');
        knobWrapper.className = 'ui-knob-wrapper';

        const knob = document.createElement('div');
        knob.className = 'ui-knob';

        const indicator = document.createElement('div');
        indicator.className = 'ui-knob-indicator';
        knob.appendChild(indicator);

        // Calculate rotation based on value
        const updateRotation = (val) => {
            const percent = (val - min) / (max - min);
            const rotation = -135 + (percent * 270); // 270 degrees of rotation
            knob.style.transform = `rotate(${rotation}deg)`;
        };

        updateRotation(value);

        let isDragging = false;
        let startY = 0;
        let startVal = value;

        knob.addEventListener('pointerdown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startVal = parseFloat(value);
            knob.setPointerCapture(e.pointerId);
            knob.classList.add('dragging');
        });

        window.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const deltaY = startY - e.clientY;
            const range = max - min;
            const sensitivity = range / 200; // 200px move = full range
            let newVal = startVal + (deltaY * sensitivity);
            newVal = Math.max(min, Math.min(max, newVal));

            value = newVal;
            updateRotation(newVal);
            onChange(newVal);
        });

        window.addEventListener('pointerup', () => {
            isDragging = false;
            knob.classList.remove('dragging');
        });

        knobWrapper.appendChild(knob);
        container.appendChild(labelEl);
        container.appendChild(knobWrapper);
        return container;
    },

    createCheckbox(label, checked, onChange) {
        const container = document.createElement('div');
        container.className = 'ui-field ui-checkbox-container';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.id = `checkbox-${Math.random().toString(36).substr(2, 9)}`;
        checkbox.className = 'ui-checkbox';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.htmlFor = checkbox.id;
        labelEl.className = 'ui-label';

        checkbox.addEventListener('change', (e) => onChange(e.target.checked));

        container.appendChild(checkbox);
        container.appendChild(labelEl);
        return container;
    },

    createRadioGroup(label, options, name, selectedValue, onChange) {
        const container = document.createElement('div');
        container.className = 'ui-field ui-radio-group';

        const groupLabel = document.createElement('div');
        groupLabel.textContent = label;
        groupLabel.className = 'ui-label ui-group-label';
        container.appendChild(groupLabel);

        const optionsList = document.createElement('div');
        optionsList.className = 'ui-radio-options';

        options.forEach(opt => {
            const optContainer = document.createElement('div');
            optContainer.className = 'ui-radio-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.value = opt.value;
            radio.checked = opt.value === selectedValue;
            radio.id = `radio-${name}-${opt.value}`;
            radio.className = 'ui-radio';

            const optLabel = document.createElement('label');
            optLabel.textContent = opt.label;
            optLabel.htmlFor = radio.id;
            optLabel.className = 'ui-label-inline';

            radio.addEventListener('change', (e) => {
                if (e.target.checked) onChange(e.target.value);
            });

            optContainer.appendChild(radio);
            optContainer.appendChild(optLabel);
            optionsList.appendChild(optContainer);
        });

        container.appendChild(optionsList);
        return container;
    },

    createTextField(label, value, placeholder, onChange) {
        const container = document.createElement('div');
        container.className = 'ui-field ui-text-field-container';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.className = 'ui-label';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.placeholder = placeholder || '';
        input.className = 'ui-input';

        input.addEventListener('input', (e) => onChange(e.target.value));

        container.appendChild(labelEl);
        container.appendChild(input);
        return container;
    },

    createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'ui-button';
        button.addEventListener('click', onClick);
        return button;
    },

    createSection(title) {
        const container = document.createElement('div');
        container.className = 'ui-section';

        const header = document.createElement('h3');
        header.textContent = title;
        header.className = 'ui-section-header';

        container.appendChild(header);
        return container;
    },

    createToolbar(columns = 2) {
        const container = document.createElement('div');
        container.className = 'ui-toolbar';
        if (columns) {
            container.style.display = 'grid';
            container.style.gridTemplateColumns = `repeat(${columns}, auto)`;
        }
        return container;
    },

    createToolButton(iconSrc, title, onClick, options = {}) {
        const button = document.createElement('button');
        button.className = 'ui-tool-button';
        if (title) button.title = title;
        if (options.selected) button.classList.add('selected');

        if (iconSrc) {
            const icon = document.createElement('img');
            icon.src = iconSrc;
            icon.className = 'ui-tool-icon';
            button.appendChild(icon);
        }

        button.addEventListener('click', (e) => {
            if (options.toggle) {
                // If it's a toggle in a group, we might want to handle it externally
                // but basic toggle logic:
                // button.classList.toggle('selected');
            }
            onClick(e, button);
        });

        return button;
    }
};
