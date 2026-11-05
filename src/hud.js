// The on-screen HUD, laid out after the reference screenshots (1920 x 992):
//   top centre   - Autopilot (red) and 2x WINS (yellow, trophy) lego buttons
//   left         - rebirths + wins counters, the 2-column tile grid
//                  (Rebirth, FREE!, Titles, Worlds, Quests, locked, Settings)
//   right        - x2 POWER / 2x WALK SPEED boosts, colours cycling
//   bottom       - "N POWER", the LEVEL bar, +10K / +1M / + buttons
//   bottom-left  - Friend boost
// plus "+2 (bolt)" pops over the train and a toast line for messages.
// Sizes are reference pixels times --u (set on resize). The top-left corner is
// Boxity's (toolbar + chat feed): the left column moves down clear of it and
// shrinks to fit (setReserved).
import './hud.css'
import { levelXp } from './config.js'
import { formatNumber } from './game.js'
import { svgIcon } from './icons.js'
import { click } from './audio/sfx.js'

function el(tag, className, html = '') {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (html) e.innerHTML = html
  return e
}

const text = (className, value) => {
  const e = el('span', `ol ${className}`)
  e.textContent = value
  return e
}

// Fires on pointerdown (no click delay) and plays the press bounce.
function button(className, html, fn) {
  const b = el('button', `hud-btn ${className}`, html)
  b.type = 'button'
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    b.classList.remove('pop')
    void b.offsetWidth
    b.classList.add('pop')
    click()
    fn?.(b)
  })
  return b
}

export function createHud({ onSettings, onAutopilot, onRebirth, onTitles, onQuests, onRailcars, onHonk } = {}) {
  const root = el('div', 'hud')
  let toastTimer = 0
  const toastEl = el('div', 'hud-toast ol')
  const toast = (msg) => {
    toastEl.textContent = msg
    toastEl.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800)
  }
  const soon = (name) => () => toast(`${name} coming soon!`)

  // --- Top ---
  const top = el('div', 'hud-top')

  // --- Left ---
  const left = el('div', 'hud-left')
  const stat = (icon, cls) => {
    const s = el('div', `hud-stat ${cls}`, `<span class="stat-bar"></span><span class="stat-icon">${svgIcon(icon)}</span>`)
    const v = text('stat-val', '0')
    s.append(v)
    left.append(s)
    return v
  }
  const rebirthVal = stat('rebirth', 'stat-rebirth')
  const winsVal = stat('trophy', 'stat-wins')
  const grid = el('div', 'hud-tiles')
  const tile = (cls, icon, label, fn) => {
    const b = button(`lego tile ${cls}`, `<span class="tile-icon">${svgIcon(icon)}</span>`, fn)
    if (label) b.append(text('tile-label', label))
    grid.append(b)
    return b
  }
  // A red "!" on a tile: something to do there (setBadges).
  const badge = (b) => {
    const e = text('tile-badge', '!')
    e.hidden = true
    b.append(e)
    return e
  }
  const rebirthBadge = badge(tile('tile-rebirth', 'rebirth', 'Rebirth', () => onRebirth?.()))
  tile('tile-titles', 'crown', 'Titles', () => onTitles?.())
  tile('tile-worlds', 'globe', 'Worlds', soon('Worlds'))
  const questsBadge = badge(tile('tile-quests', 'quests', 'Quests', () => onQuests?.()))
  // Locked until the first rebirth, then the Railcars tile.
  const railTile = tile('tile-locked', 'lockedTrain', '', () => onRailcars?.())
  const railLabel = text('tile-label small', 'Unlocks at 1 rebirth')
  railTile.append(railLabel)
  let railUnlocked = false
  const settingsTile = tile('tile-settings', 'gear', '', () => onSettings?.())
  left.append(grid)

  // --- Right: boosts ---
  const right = el('div', 'hud-right')

  // --- Bottom ---
  const bottom = el('div', 'hud-bottom')
  const powerText = text('power-text', '0 POWER')
  const bar = el('div', 'lego level-bar')
  const fill = el('div', 'level-fill')
  const levelText = text('level-text', 'LEVEL 1')
  const xpText = text('xp-text', '0/50')
  bar.append(fill, levelText, xpText)
  const barWrap = el('div', 'level-wrap', `<span class="level-icon">${svgIcon('metro')}</span>`)
  barWrap.prepend(bar)
  bottom.append(powerText, barWrap)

  const friend = el('div', 'hud-friend')
  friend.append(text('friend-text', 'Friend boost +0%'))
  friend.insertAdjacentHTML('beforeend', `<span class="friend-icon">${svgIcon('plus')}</span>`)

  // Honk: tap / click it, or press H (the keycap shows the key).
  // Hold it to keep honking (onHonk(true) on press, onHonk(false) on release).
  const honkBtn = button('lego btn-honk', '<span class="ol honk-text">HONK</span><span class="honk-key ol">H</span>', () => onHonk?.(true))
  honkBtn.setAttribute('aria-label', 'Hold to honk the horn (H)')
  let honkHeld = false
  honkBtn.addEventListener('pointerdown', () => (honkHeld = true))
  const honkRelease = () => {
    if (!honkHeld) return
    honkHeld = false
    onHonk?.(false)
  }
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) honkBtn.addEventListener(ev, honkRelease)
  window.addEventListener('pointerup', honkRelease)
  window.addEventListener('blur', honkRelease)

  const pops = el('div', 'hud-pops')
  const levelBanner = el('div', 'hud-levelup ol')
  const comboEl = el('div', 'hud-combo')
  const flashEl = el('div', 'hud-flash')
  root.append(flashEl, top, left, right, bottom, friend, honkBtn, pops, levelBanner, comboEl, toastEl)
  document.body.appendChild(root)

  // --- Scale, Boxity's reserved corner, room for the touch controls ---
  let reserved = []
  function layout() {
    const w = window.innerWidth
    const h = window.innerHeight
    const portrait = h > w
    const u = Math.max(0.2, portrait ? Math.min(w / 980, h / 1500) : Math.min(w / 1920, h / 992))
    root.style.setProperty('--u', `${u}px`)
    // Top row: below any reserved strip that crosses the middle of the screen (phones: a full-width toolbar).
    // The row spans w/2 - 415u (trophy overhang) .. w/2 + 369u; slide it right if that clears a strip, else drop below it.
    let topY = 50 * u
    let shift = 0
    for (const a of reserved) {
      const lo = w / 2 - 415 * u + shift
      if (a.left >= w / 2 + 369 * u + shift || a.left + a.width <= lo || a.top >= topY + 74 * u) continue
      const need = a.left + a.width + 6 - lo
      if (a.left < lo && w / 2 + 369 * u + shift + need < w - 120) shift += need
      else topY = Math.max(topY, a.top + a.height + 6)
    }
    top.style.top = `${topY}px`
    top.style.marginLeft = `${shift}px`
    // Banners sit under the top row wherever it ended up (phones push it below the chat feed).
    levelBanner.style.top = `${Math.max(200 * u, topY + 86 * u)}px`
    comboEl.style.top = `${Math.max(300 * u, topY + 86 * u + 50 * u)}px`
    right.style.top = `${portrait ? Math.max(topY + 74 * u + 70 * u, 300 * u) : Math.max(417 * u, topY + 74 * u + 40 * u)}px`
    const b = bottom.getBoundingClientRect()
    const bottomRoom = h - b.top // px the bottom group takes, from the screen's bottom edge
    friend.style.bottom = portrait ? `${bottomRoom + 6}px` : ''
    honkBtn.style.bottom = portrait ? `${bottomRoom + 6 + 62 * u}px` : ''
    const floor = portrait ? bottomRoom + 50 * u + 8 : 70 * u
    // Left column: below the Boxity chat feed when they would overlap, shrunk to fit above the bottom HUD.
    let colTop = 195 * u
    for (const a of reserved) if (a.left < 260 * u && a.left + a.width > 20 * u) colTop = Math.max(colTop, a.top + a.height + 8)
    if (topY + 74 * u > 150 * u) colTop = Math.max(colTop, topY + 74 * u + 12) // the top row was pushed down: stay under it
    // Short screens: four tile columns (two rows) before shrinking anything.
    const room = h - colTop - floor
    const wide = room < 590 * u * 0.85
    left.classList.toggle('wide', wide)
    const colH = wide ? 372 * u : 590 * u
    const scale = Math.max(0.6, Math.min(1, room / colH))
    left.style.top = `${colTop}px`
    left.style.transform = `scale(${scale})`
    // Touch controls (touch.css) move clear of the HUD where they would collide.
    const r = right.getBoundingClientRect()
    const t = top.getBoundingClientRect()
    const de = document.documentElement.style
    de.setProperty('--hud-bottom', `${b.right > w - 210 ? bottomRoom : 0}px`)
    de.setProperty('--hud-top', `${t.right > w - 120 ? r.bottom + 10 : 0}px`)
  }
  window.addEventListener('resize', layout)
  layout()

  let shown = { power: -1, level: -1, xp: -1, wins: -1, rebirths: -1, autopilot: null }
  return {
    root,
    toast,
    // Red "!" badges and the Railcars tile: { rebirth, quests, railcars (unlocked) }.
    setBadges({ rebirth, quests, railcars }) {
      rebirthBadge.hidden = !rebirth
      questsBadge.hidden = !quests
      if (railcars === railUnlocked) return
      railUnlocked = railcars
      railTile.classList.toggle('tile-railcars', railcars)
      railTile.querySelector('.tile-icon').innerHTML = svgIcon(railcars ? 'railcar' : 'lockedTrain')
      railLabel.textContent = railcars ? 'Railcars' : 'Unlocks at 1 rebirth'
      railLabel.classList.toggle('small', !railcars)
    },
    // Settings > Show HUD: everything but the Settings tile (so it can be turned back on).
    setVisible(on) {
      root.classList.toggle('hud-hidden', !on)
      settingsTile.classList.add('keep')
    },
    setReserved(areas) {
      reserved = areas
      layout()
    },
    setState(s) {
      if (s.power !== shown.power) powerText.textContent = `${formatNumber(s.power)} POWER`
      if (s.level !== shown.level || s.xp !== shown.xp) {
        const need = levelXp(s.level)
        levelText.textContent = `LEVEL ${s.level}`
        xpText.textContent = `${formatNumber(s.xp)}/${formatNumber(need)}`
        fill.style.setProperty('--p', Math.min(1, s.xp / need).toFixed(4))
      }
      if (s.wins !== shown.wins) winsVal.textContent = formatNumber(s.wins)
      if (s.rebirths !== shown.rebirths) rebirthVal.textContent = formatNumber(s.rebirths)
      shown = { ...s }
    },
    // "+N" with an icon (power bolt, trophy), floating up from screen point (x, y) px.
    // rise: how far it floats (reference px); a long rise also lasts longer (treadmill payouts).
    pop(amount, x, y, icon = 'bolt', rise = 0) {
      const p = el('div', `hud-pop pop-${icon}${rise ? ' pop-far' : ''}`, `<span class="ol pop-text">+${formatNumber(amount)}</span><span class="pop-icon">${svgIcon(icon)}</span>`)
      p.style.left = `${x}px`
      p.style.top = `${y}px`
      if (rise) p.style.setProperty('--rise', rise)
      pops.append(p)
      setTimeout(() => p.remove(), rise ? 1700 : 1100)
    },
    // The "N POWER" line swells for a moment (a payout landed).
    setFriendBoost(pct, onInvite) {
      friend.firstChild.textContent = `Friend boost +${pct}%`
      friend.style.cursor = 'pointer'
      friend.onclick = onInvite
      friend.style.pointerEvents = 'auto'
    },
    bumpPower() {
      powerText.classList.remove('bump')
      void powerText.offsetWidth
      powerText.classList.add('bump')
    },
    // "x3 COMBO!" on a streak of smashes; it grows and warms with the count.
    combo(n) {
      if (n < 2) return
      comboEl.innerHTML = `<span class="ol combo-x">x${n}</span><span class="ol combo-word">${n >= 8 ? 'UNSTOPPABLE!' : n >= 5 ? 'MEGA COMBO!' : 'COMBO!'}</span>`
      comboEl.style.setProperty('--n', Math.min(n, 12))
      comboEl.classList.remove('show')
      void comboEl.offsetWidth
      comboEl.classList.add('show')
    },
    // A white impact frame over the screen (strength 0..2).
    flash(strength = 1) {
      flashEl.style.setProperty('--a', Math.min(0.32, 0.12 + 0.1 * strength).toFixed(2))
      flashEl.classList.remove('show')
      void flashEl.offsetWidth
      flashEl.classList.add('show')
    },
    // "LEVEL UP 4 -> 5" banner under the top buttons.
    levelUp(from, to) {
      levelBanner.textContent = `LEVEL UP  ${from} → ${to}`
      levelBanner.classList.remove('show')
      void levelBanner.offsetWidth
      levelBanner.classList.add('show')
    },
  }
}
