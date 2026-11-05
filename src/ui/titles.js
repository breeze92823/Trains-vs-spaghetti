// Titles window: a scrolling list of titles. Each row: the name in its colour (scaled
// to fit, like the reference), "xN Power", and either the prices (wins / gems) or
// EQUIP / EQUIPPED. The first row unequips. Buying with wins spends them and equips.
import './titles.css'
import { TITLES } from '../config.js'
import { svgIcon } from '../icons.js'
import { buyTitle, buyTitleGems, equipTitle, ownsTitle, shortNumber, state } from '../game.js'
import { storeReady } from '../bloxity.js'
import { createWindow, darken, legoButton, olText, replay } from './window.js'
import { fitText, fontsReady } from './fitText.js'

const UNEQUIP = { id: null, name: 'Unequip', color: '#a3acd4', mult: 1 }
// Name box (design px) in landscape / portrait rows.
const NAME_BOX = { land: [376, 124], port: [282, 124] }

export function createTitles({ onEquip } = {}) {
  const win = createWindow({ title: 'Titles', icon: svgIcon('crown'), color: '#d21fd8', closeColor: '#ff1638', className: 'tt-window', onOpen: () => update(true), onResize: () => fitNames() })
  const list = document.createElement('div')
  list.className = 'tt-list'
  win.body.append(list)

  const rows = [UNEQUIP, ...TITLES].map((t) => {
    const row = document.createElement('div')
    row.className = 'gw-row tt-row'
    const name = document.createElement('div')
    name.className = 'tt-name gw-ol'
    name.style.color = t.color
    name.style.setProperty('--oc', darken(t.color, 0.78))
    const mult = document.createElement('div')
    mult.className = 'tt-mult'
    mult.append(olText(`x${t.mult}`, 'tt-x'), olText('Power', 'tt-pw'))

    const equip = legoButton('gw-blue tt-equip', '', () => {
      if (t.id === null) equipTitle(null)
      else if (ownsTitle(t.id)) equipTitle(t.id)
      replay(equip, 'gw-bump')
      onEquip?.()
    })
    const label = olText('', 'tt-equip-text')
    equip.append(label)

    const buy = document.createElement('div')
    buy.className = 'tt-buy'
    const wins = legoButton('gw-yellow tt-wins', `<span class="tt-trophy">${svgIcon('trophy')}</span>`, () => {
      const r = buyTitle(t.id)
      if (r === 'poor') {
        replay(wins, 'gw-shake')
        win.toast(`Need ${shortNumber(t.wins - state.wins)} more Wins!`)
      } else {
        win.toast(`${t.name} equipped!`)
        onEquip?.()
      }
    })
    wins.append(olText(shortNumber(t.wins ?? 0), 'tt-val'))
    buy.append(wins)
    row.append(name, mult, equip, buy)
    list.append(row)
    return { t, row, name, equip, label, buy }
  })

  let portrait = null
  function fitNames() {
    const p = win.overlay.classList.contains('portrait')
    if (p === portrait) return
    portrait = p
    const [w, h] = NAME_BOX[p ? 'port' : 'land']
    for (const r of rows) {
      const { size, lines } = fitText(r.t.name, w, h, { max: 100, lineHeight: 1.08 })
      r.name.style.setProperty('--fs', size)
      r.name.replaceChildren(...lines.flatMap((l, i) => (i ? [document.createElement('br'), l] : [l])))
    }
  }
  fontsReady.then(() => {
    portrait = null
    if (win.isOpen()) fitNames()
  })

  let shownKey = ''
  function update(force = false) {
    if (!win.isOpen()) return
    fitNames()
    const key = `${state.title}|${state.titlesOwned.join(',')}`
    if (key === shownKey && !force) return
    shownKey = key
    for (const r of rows) {
      const owned = r.t.id === null || ownsTitle(r.t.id)
      r.buy.hidden = owned
      r.equip.hidden = !owned
      if (r.t.id === null) r.label.textContent = state.title ? 'UNEQUIP' : 'UNEQUIPPED'
      else r.label.textContent = state.title === r.t.id ? 'EQUIPPED' : 'EQUIP'
      r.equip.classList.toggle('on', r.t.id === state.title)
    }
  }
  return { ...win, update }
}
