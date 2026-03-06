import './style.css'
import bootConfig from './boot-config.json'
import epaLogo from './assets/epa.png'

const app = document.querySelector('#app')
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let savedScale = localStorage.getItem('ui-scale');

if (!localStorage.getItem('ui-scale-initialized')) {
  savedScale = isMobile ? '1.5' : '1';
  localStorage.setItem('ui-scale', savedScale);
  localStorage.setItem('ui-scale-initialized', 'true');
}

document.documentElement.style.setProperty('--ui-scale', savedScale || '1');

// Prevent global browser zoom on iOS so it doesn't fight with our custom window scaling
document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
}, { passive: false });

document.addEventListener('gesturechange', (e) => {
  e.preventDefault();
}, { passive: false });

function addLine(text = '') {
  const line = document.createElement('div')
  line.className = 'line'
  line.textContent = text
  app.appendChild(line)
  app.scrollTop = app.scrollHeight
  return line
}

async function typeText(text, speed = 50) {
  const line = addLine('')
  for (let i = 0; i < text.length; i++) {
    line.textContent += text[i]
    await new Promise(r => setTimeout(r, speed))
  }
  return line
}

async function runBootSequence() {
  const { header, sequence } = bootConfig
  app.classList.add('booting')

  // Header with EPA logo from assets
  app.innerHTML = `
    <div class="logo-header">
      <div class="bios-info">
        <div class="line">${header.biosVersion}</div>
        <div class="line">${header.kernelRevision}</div>
      </div>
      <div class="energy-star-img">
        <img src="${epaLogo}" alt="EPA logo">
      </div>
    </div>
  `

  for (const step of sequence) {
    switch (step.type) {
      case 'instant':
        addLine(step.text)
        break
      case 'typing':
        await typeText(step.text, step.speed)
        break
      case 'wait':
        await new Promise(r => setTimeout(r, step.ms))
        break
      case 'progress':
        const line = addLine(step.text)
        const increment = step.increment || 64
        for (let i = 0; i <= step.target; i += increment) {
          line.textContent = `${step.text}${i}${step.unit}`
          await new Promise(r => setTimeout(r, step.speed || 20))
        }
        line.textContent = `${step.text}${step.target}${step.unit}`
        break
      case 'clear':
        app.innerHTML = ''
        break
    }
  }
  app.classList.remove('booting')
}

import { initDesktop } from './desktop.js'

runBootSequence().then(() => {
  initDesktop()
})
