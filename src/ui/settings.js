// Settings window: one row per GAME_SETTINGS entry (label + green ON / red OFF lego
// toggle) and the version under the list. The values live in game state (saved);
// main.js applies them (HUD visibility, effects, wagons, audio flags).
import './settings.css'
import { GAME_SETTINGS, GAME_VERSION } from '../config.js'
import { svgIcon } from '../icons.js'
import { setSetting, state } from '../game.js'
import { createWindow, legoButton, olText, replay } from './window.js'
import { fitText, fontsReady } from './fitText.js'

export function createSettings() {
  const win = createWindow({ title: 'Settings', icon: svgIcon('gear'), color: '#8d8d93', closeColor: '#ff1a8c', className: 'st-window', onOpen: () => update(), onResize: () => fit() })
  const list = document.createElement('div')
  list.className = 'st-list'
  win.body.append(list)
  const rows = GAME_SETTINGS.map((s) => {
    const row = document.createElement('div')
    row.className = 'gw-row st-row'
    const label = olText(s.label, 'st-label')
    const btn = legoButton('gw-green st-toggle', '', () => {
      setSetting(s.key, !state.settings[s.key])
      replay(btn, 'gw-bump')
      update()
    })
    const text = olText('ON', 'st-toggle-text')
    btn.append(text)
    row.append(label, btn)
    list.append(row)
    return { s, label, btn, text }
  })
  list.append(olText(GAME_VERSION, 'st-version'))

  let portrait = null
  function fit() {
    const p = win.overlay.classList.contains('portrait')
    if (p === portrait) return
    portrait = p
    for (const r of rows) r.label.style.setProperty('--fs', fitText(r.s.label, p ? 420 : 640, 90, { max: 64, pad: 4 }).size)
  }
  fontsReady.then(() => {
    portrait = null
    if (win.isOpen()) fit()
  })

  function update() {
    if (!win.isOpen()) return
    fit()
    for (const r of rows) {
      const on = !!state.settings[r.s.key]
      r.text.textContent = on ? 'ON' : 'OFF'
      r.btn.classList.toggle('gw-green', on)
      r.btn.classList.toggle('gw-red', !on)
      r.btn.setAttribute('aria-pressed', String(on))
    }
  }
  return { ...win, update }
}
