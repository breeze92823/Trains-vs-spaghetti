// Rebirth window: "Rebirth n" -> "Rebirth n+1" with the power multipliers in green
// plates, the rules line, the level requirement box with its progress bar, and the
// Rebirth / Skip Rebirth (gems) buttons.
import './rebirth.css'
import { REBIRTH } from '../config.js'
import { svgIcon } from '../icons.js'
import { canRebirth, rebirth, rebirthLevel, rebirthMult, skipRebirth, state } from '../game.js'
import { storeReady } from '../bloxity.js'
import { createWindow, legoButton, olText, replay } from './window.js'

const ARROW = `<svg viewBox="0 0 60 70" aria-hidden="true">
  <path d="M8 6 L54 35 L8 64 Z" fill="#141016" stroke="#141016" stroke-width="10" stroke-linejoin="round"/>
  <path d="M8 6 L54 35 L8 64 Z" fill="#ffffff" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
  <path d="M8 40 L54 35 L8 64 Z" fill="#d6dce6"/>
</svg>`

export function createRebirthWindow({ onRebirth } = {}) {
  const win = createWindow({ title: 'Rebirth', icon: svgIcon('rebirth'), color: '#e8202a', closeColor: '#ff1aa0', className: 'rb-window', onOpen: () => update() })
  const b = win.body
  b.classList.add('rb-body')
  b.innerHTML = `
    <div class="rb-cols">
      <div class="rb-col"><span class="gw-ol rb-label" data-f="from"></span><div class="gw-lego rb-plate"><span class="gw-ol rb-mult" data-f="fromMult"></span></div></div>
      <div class="rb-arrow">${ARROW}</div>
      <div class="rb-col"><span class="gw-ol rb-label" data-f="to"></span><div class="gw-lego rb-plate"><span class="gw-ol rb-mult" data-f="toMult"></span></div></div>
    </div>
    <p class="gw-ol rb-rules">Rebirth resets regular Power and level. Event progress, trains<br>and wins stay. Skip keeps regular Power and level.</p>
    <div class="rb-need">
      <span class="gw-ol rb-need-text" data-f="need"></span>
      <div class="rb-bar"><div class="gw-lego rb-fill"></div><span class="gw-ol rb-bar-text" data-f="bar"></span></div>
    </div>
    <div class="rb-btns"></div>`
  const f = {}
  for (const el of b.querySelectorAll('[data-f]')) f[el.dataset.f] = el
  const need = b.querySelector('.rb-need')
  const fill = b.querySelector('.rb-fill')

  const rebirthBtn = legoButton('gw-yellow rb-btn', '', () => {
    if (!rebirth()) {
      replay(need, 'gw-shake')
      win.toast(`Reach Level ${rebirthLevel()} first!`)
      return
    }
    done()
  })
  rebirthBtn.append(olText('Rebirth', 'rb-btn-text'))
  b.querySelector('.rb-btns').append(rebirthBtn)

  function done() {
    for (const el of b.querySelectorAll('.rb-plate')) replay(el, 'gw-bump')
    win.toast(`REBIRTH ${state.rebirths}!  x${rebirthMult()} Power`)
    onRebirth?.()
  }

  function update() {
    if (!win.isOpen()) return
    const n = state.rebirths
    f.from.textContent = `Rebirth ${n}`
    f.to.textContent = `Rebirth ${n + 1}`
    f.fromMult.textContent = `x${rebirthMult(n)}`
    f.toMult.textContent = `x${rebirthMult(n + 1)}`
    const lvl = rebirthLevel()
    const ready = canRebirth()
    f.need.textContent = ready ? 'Ready to rebirth!' : `Requires Level ${lvl} to rebirth`
    f.bar.textContent = `${Math.min(state.level, lvl)} / ${lvl}`
    fill.style.width = `${Math.min(1, state.level / lvl) * 100}%`
    need.classList.toggle('ready', ready)
  }
  return { ...win, update }
}
