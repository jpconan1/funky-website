import './style.css'
import bootConfig from './boot-config.json'
import epaLogo from './assets/epa.png'

const app = document.querySelector('#app')
const savedScale = localStorage.getItem('ui-scale') || '1';
document.documentElement.style.setProperty('--ui-scale', savedScale);

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
}

import { initDesktop } from './desktop.js'

runBootSequence().then(() => {
  initDesktop()
})
