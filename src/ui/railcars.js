// Railcars window: a sideways-scrolling row of container cards (name, rarity, the
// container picture, stock line, "Railcars & Odds" and the price button) and the
// "Restock in mm:ss" bar under the window. Buying opens the container into a railcar
// (game.js buyContainer) that hooks on behind the train (wagons.js).
import './railcars.css'
import { CONTAINERS, RAILCAR_TYPES, RARITY } from '../config.js'
import { svgIcon } from '../icons.js'
import { buyContainer, restockIn, shortNumber, state, stockLeft } from '../game.js'
import { storeReady } from '../bloxity.js'
import { createWindow, darken, legoButton, olText, replay } from './window.js'
import { fitText, fontsReady } from './fitText.js'
import { containerSvg } from './railcarArt.js'

const two = (n) => String(n).padStart(2, '0')
const gemPrice = (n) => `<span class="gw-gem"><span class="gw-gem-icon">${svgIcon('hexcoin')}</span><span class="gw-ol">${n}</span></span>`

function rarityText(rarity, cls) {
  const r = RARITY[rarity] ?? RARITY.Common
  const e = olText(rarity, cls)
  e.style.color = r.color
  e.style.setProperty('--oc', r.outline ?? darken(r.color, 0.8))
  return e
}

export function createRailcars({ onBought } = {}) {
  const win = createWindow({ title: 'Railcars', icon: svgIcon('railcar'), color: '#18a6e0', closeColor: '#ff1a8c', className: 'rc-window', onOpen: () => {
    panel.hidden = true
    update()
  } })
  const strip = document.createElement('div')
  strip.className = 'rc-strip'
  win.body.classList.add('rc-body')
  win.body.append(strip)
  // A mouse wheel scrolls the row sideways.
  strip.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      strip.scrollLeft += e.deltaY
      e.preventDefault()
    }
  }, { passive: false })

  const cards = CONTAINERS.filter((c) => !c.gems).map((c) => {
    const card = document.createElement('div')
    card.className = `rc-card${c.rarity === 'OP' ? ' op' : ''}`
    const name = olText(c.name, 'rc-name')
    const pic = document.createElement('div')
    pic.className = 'rc-pic'
    pic.innerHTML = containerSvg(c.look)
    const stock = olText('', 'rc-stock')
    const odds = legoButton('gw-yellow rc-odds', '', () => showOdds(c))
    odds.append(olText('Railcars & Odds', 'rc-odds-text'))
    const buy = legoButton('gw-green rc-buy', '', () => purchase(c, buy, pic))
    const buyText = document.createElement('span')
    buyText.className = 'rc-buy-text'
    buy.append(buyText)
    card.append(name, rarityText(c.rarity, 'rc-rarity'), pic, stock, odds, buy)
    strip.append(card)
    return { c, card, name, stock, buy, buyText }
  })
  fontsReady.then(() => {
    for (const k of cards) k.name.style.setProperty('--fs', fitText(k.c.name, 410, 60, { max: 46 }).size)
  })

  const restock = document.createElement('div')
  restock.className = 'rc-restock'
  const restockText = olText('', 'rc-restock-text')
  restock.append(restockText)
  win.dialog.append(restock)

  // --- Odds + reveal panels (over the cards) ---
  const panel = document.createElement('div')
  panel.className = 'rc-panel'
  panel.hidden = true
  win.body.append(panel)
  panel.addEventListener('click', (e) => {
    if (e.target === panel) panel.hidden = true
  })
  function showPanel(children) {
    panel.replaceChildren(...children)
    panel.hidden = false
    replay(panel, 'gw-pop')
  }
  function showOdds(c) {
    const box = document.createElement('div')
    box.className = 'rc-odds-box'
    box.append(olText(`${c.name}`, 'rc-odds-title'))
    for (const [id, pct] of c.pool) {
      const t = RAILCAR_TYPES[id]
      const row = document.createElement('div')
      row.className = 'rc-odds-row'
      const nm = olText(t.name, 'rc-odds-name')
      nm.style.color = RARITY[t.rarity].color
      row.append(nm, rarityText(t.rarity, 'rc-odds-rarity'), olText(`x${t.mult} Power`, 'rc-odds-mult'), olText(`${pct}%`, 'rc-odds-pct'))
      box.append(row)
    }
    const back = legoButton('gw-blue rc-back', '', () => (panel.hidden = true))
    back.append(olText('Back', 'rc-back-text'))
    box.append(back)
    showPanel([box])
  }
  function reveal(c, type) {
    const t = RAILCAR_TYPES[type]
    const box = document.createElement('div')
    box.className = 'rc-reveal'
    const pic = document.createElement('div')
    pic.className = 'rc-pic rc-reveal-pic'
    pic.innerHTML = containerSvg(c.look)
    const got = olText(t.name, 'rc-reveal-name')
    got.style.color = RARITY[t.rarity].color
    got.style.setProperty('--oc', RARITY[t.rarity].outline ?? darken(RARITY[t.rarity].color, 0.8))
    box.append(olText('You got', 'rc-reveal-head'), pic, got, rarityText(t.rarity, 'rc-reveal-rarity'), olText(`x${t.mult} Power`, 'rc-reveal-mult'))
    const ok = legoButton('gw-green rc-back', '', () => (panel.hidden = true))
    ok.append(olText('Awesome!', 'rc-back-text'))
    box.append(ok)
    showPanel([box])
  }

  let busy = false
  async function purchase(c, btn, pic) {
    if (busy) return
    if (c.gems && !storeReady()) return win.toast('Store coming soon!')
    busy = true
    const r = await buyContainer(c.id)
    busy = false
    if (r.error) {
      replay(btn, 'gw-shake')
      if (r.error === 'poor') win.toast(`Need ${shortNumber(c.wins - state.wins)} more Wins!`)
      else if (r.error === 'stock') win.toast('Out of stock!')
      else if (r.error === 'locked') win.toast('Railcars unlock at 1 rebirth')
      return
    }
    replay(pic, 'gw-bump')
    reveal(c, r.type)
    onBought?.(r.type)
    update()
  }

  function update() {
    if (!win.isOpen()) return
    const s = Math.max(0, Math.ceil(restockIn() / 1000))
    restockText.textContent = `Restock in ${two(Math.floor(s / 60))}:${two(s % 60)}`
    for (const k of cards) {
      const left = stockLeft(k.c)
      const out = left <= 0
      if (k.c.single) k.stock.textContent = out ? 'Owned' : 'Single opening'
      else k.stock.textContent = out ? 'Out of stock' : Number.isFinite(left) ? `In stock: ${left}` : ''
      k.stock.classList.toggle('single', !!k.c.single && !out)
      if (out) k.buyText.innerHTML = `<span class="gw-ol">${k.c.single ? 'Owned' : 'Out of stock'}</span>`
      else k.buyText.innerHTML = k.c.gems ? gemPrice(k.c.gems) : `<span class="gw-ol">${shortNumber(k.c.wins)} Wins</span>`
      k.buy.classList.toggle('disabled', out)
    }
  }
  setInterval(update, 1000)
  return { ...win, update }
}
