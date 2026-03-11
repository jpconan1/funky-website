import { incrementHitCount } from './supabase.js';

export class HitCounter {
    constructor(containerId = 'hit-counter') {
        this.containerId = containerId;
        this.count = 0;
    }

    async init() {
        // Increment and get the count from Supabase
        this.count = await incrementHitCount();
        this.render();
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Pad count to at least 6 digits for a retro feel
        const countStr = this.count.toString().padStart(6, '0');
        
        container.innerHTML = '';
        container.title = 'Thanks for visiting!';
        
        for (const digit of countStr) {
            const digitEl = document.createElement('div');
            digitEl.className = 'hit-digit';
            digitEl.textContent = digit;
            container.appendChild(digitEl);
        }
    }
}
