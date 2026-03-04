export const UI = {
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

    createSlider(label, min, max, value, onChange) {
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
        slider.value = value;
        slider.className = 'ui-slider';

        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
            onChange(e.target.value);
        });

        container.appendChild(labelArea);
        container.appendChild(slider);
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
    }
};
