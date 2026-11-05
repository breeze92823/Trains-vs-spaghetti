import './prompt.css'

// The hold-to-interact prompt over a world object (the reference's dark panel: a key
// circle on the left, a small object name over the action, e.g. "Train 4" / "Buy 25
// Wins"). While the key (or a finger / mouse on the panel itself, so touch has a path)
// is held, a ring fills round the key; shop.js times the hold and calls back.
//   prompt.show(objectText, actionText, enabled)   prompt.hide()
//   prompt.place(x, y)  screen px of the panel centre
//   prompt.setProgress(0..1)   prompt.flash()   prompt.shake()
//   prompt.pressed  true while a pointer holds the panel
const RING = 2 * Math.PI * 44

export function createPrompt(parent) {
  const root = document.createElement('div')
  root.className = 'pp'
  root.innerHTML = `
    <div class="pp-key">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="pp-track" cx="50" cy="50" r="44"></circle>
        <circle class="pp-ring" cx="50" cy="50" r="44" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"></circle>
      </svg>
      <span class="pp-letter">E</span>
      <span class="pp-tap"></span>
    </div>
    <div class="pp-text"><span class="pp-object"></span><span class="pp-action"></span></div>`
  const ring = root.querySelector('.pp-ring')
  const objectEl = root.querySelector('.pp-object')
  const actionEl = root.querySelector('.pp-action')
  parent.append(root)

  // Touch shows a tap target instead of the E key; whatever input was used last decides.
  const setTouch = (on) => root.classList.toggle('touch', on)
  setTouch(matchMedia('(pointer: coarse)').matches)
  window.addEventListener('pointerdown', (e) => setTouch(e.pointerType === 'touch' || e.pointerType === 'pen'), { capture: true })
  window.addEventListener('keydown', () => setTouch(false), { capture: true })

  let pressed = false
  let pointerId = null
  const release = (e) => {
    if (e && e.pointerId !== pointerId) return
    pressed = false
    pointerId = null
    root.classList.remove('held')
  }
  root.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    pressed = true
    pointerId = e.pointerId
    try {
      root.setPointerCapture(e.pointerId) // keep the hold while the finger wobbles off the panel
    } catch {
      // no capture (synthetic / already released pointer): pointerup still ends the hold
    }
    root.classList.add('held')
  })
  root.addEventListener('pointerup', release)
  root.addEventListener('pointercancel', release)
  root.addEventListener('lostpointercapture', release)
  root.addEventListener('contextmenu', (e) => e.preventDefault())

  let shown = false
  let lastObject = ''
  let lastAction = ''
  let lastP = -1
  return {
    get pressed() {
      return pressed
    },
    show(objectText, actionText, enabled = true) {
      if (objectText !== lastObject) objectEl.textContent = lastObject = objectText
      if (actionText !== lastAction) actionEl.textContent = lastAction = actionText
      root.classList.toggle('off', !enabled)
      if (!shown) {
        shown = true
        root.classList.add('show')
      }
    },
    hide() {
      if (!shown) return
      shown = false
      root.classList.remove('show')
      release()
      this.setProgress(0)
    },
    place(x, y) {
      root.style.left = `${Math.round(x)}px`
      root.style.top = `${Math.round(y)}px`
    },
    setProgress(p) {
      const q = Math.round(p * 200) / 200
      if (q === lastP) return
      lastP = q
      ring.setAttribute('stroke-dashoffset', String(RING * (1 - q)))
      root.classList.toggle('filling', q > 0)
    },
    flash() {
      root.classList.remove('flash', 'shake')
      void root.offsetWidth
      root.classList.add('flash')
    },
    shake() {
      root.classList.remove('flash', 'shake')
      void root.offsetWidth
      root.classList.add('shake')
    },
  }
}
