import './style.css'
import bootConfig from './boot-config.json'
import epaLogo from './assets/epa.png'

const app = document.querySelector('#app')
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let savedScale = localStorage.getItem('ui-scale');

if (!localStorage.getItem('ui-scale-initialized-v2')) {
  savedScale = isMobile ? '2' : '1';
  localStorage.setItem('ui-scale', savedScale);
  localStorage.setItem('ui-scale-initialized-v2', 'true');
}

document.documentElement.style.setProperty('--ui-scale', savedScale || '1');

let bootScreenContainer = null;

function addLine(text = '') {
  const line = document.createElement('div')
  line.className = 'line'
  line.textContent = text
  const target = bootScreenContainer || app
  target.appendChild(line)
  target.scrollTop = target.scrollHeight
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

  // Create a container for boot content that handles its own scrolling
  bootScreenContainer = document.createElement('div')
  bootScreenContainer.className = 'boot-screen'
  app.appendChild(bootScreenContainer)

  // Header with EPA logo from assets
  bootScreenContainer.innerHTML = `
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
        bootScreenContainer.innerHTML = ''
        break
    }
  }

  // Clean up boot screen and booting class
  app.classList.remove('booting')
  app.innerHTML = ''
  bootScreenContainer = null
}

import { initDesktop } from './desktop.js'

runBootSequence().then(() => {
  initDesktop()
})

