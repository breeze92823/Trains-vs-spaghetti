// Quests window: "Reset in Xh Ym Zs", three daily quest cards (EASY / MEDIUM / HARD:
// difficulty, task, reward; Claim + Skip (gems) buttons; purple progress bar) and the
// footer line. Progress comes from game.js questEvent; the timer ticks every second.
import './quests.css'
import { svgIcon } from '../icons.js'
import { claimQuest, dailyQuests, formatNumber, questReward, questResetIn, shortNumber, skipQuest } from '../game.js'
import { storeReady } from '../bloxity.js'
import { createWindow, legoButton, olText, replay } from './window.js'

const two = (n) => String(n).padStart(2, '0')
const clock = (s) => `${Math.floor(s / 60)}:${two(Math.floor(s % 60))}`

function resetText() {
  const s = Math.max(0, Math.floor(questResetIn() / 1000))
  return `Reset in ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`
}

export function createQuests({ onClaim } = {}) {
  const win = createWindow({ title: 'QUESTS', icon: svgIcon('quests'), color: '#e0ac16', closeColor: '#ff1638', className: 'qs-window', onOpen: () => update() })
  const b = win.body
  b.classList.add('qs-body')
  const reset = olText('', 'qs-reset')
  b.append(reset)
  const cards = [0, 1, 2].map(() => {
    const card = document.createElement('div')
    card.className = 'qs-card'
    const label = olText('', 'qs-label')
    const task = olText('', 'qs-task')
    const reward = olText('', 'qs-reward')
    const text = document.createElement('div')
    text.className = 'qs-text'
    text.append(label, task, reward)
    const claim = legoButton('gw-white qs-claim', '', () => {
      const r = claimQuest(c.tierId)
      if (!r) {
        replay(claim, 'gw-shake')
        win.toast('Finish the quest first!')
        return
      }
      replay(card, 'gw-bump')
      win.toast(`+${formatNumber(r.amount)} ${r.type === 'power' ? 'Power' : 'Wins'}!`)
      onClaim?.(r)
    })
    const claimText = olText('Claim', 'qs-btn-text')
    claim.append(claimText)
    const bar = document.createElement('div')
    bar.className = 'qs-bar'
    const fill = document.createElement('div')
    fill.className = 'qs-fill'
    const barText = olText('', 'qs-bar-text')
    bar.append(fill, barText)
    card.append(text, claim, bar)
    b.append(card)
    const c = { tierId: null, card, label, task, reward, claim, claimText, fill, barText }
    return c
  })
  b.append(olText('Daily quests • Progress is shared across all worlds', 'qs-foot'))

  function update() {
    if (!win.isOpen()) return
    reset.textContent = resetText()
    dailyQuests().forEach((q, i) => {
      const c = cards[i]
      const t = q.tier
      c.tierId = t.id
      c.card.style.setProperty('--top', t.top)
      c.card.style.setProperty('--bottom', t.bottom)
      c.card.style.setProperty('--rim', t.border)
      c.label.textContent = t.label
      c.task.textContent = q.quest.text
      const r = questReward(t)
      c.reward.textContent = `+${formatNumber(r.amount)} ${r.type === 'power' ? 'Power' : 'Wins'} (${Math.round(t.reward.pct * 100)}%)`
      const time = q.quest.kind === 'seconds'
      c.barText.textContent = time ? `${clock(q.progress)} / ${clock(q.quest.goal)}` : `${shortNumber(q.progress)} / ${shortNumber(q.quest.goal)}`
      c.fill.style.width = `${(q.progress / q.quest.goal) * 100}%`
      c.claimText.textContent = q.claimed ? 'Claimed' : 'Claim'
      c.claim.classList.toggle('gw-white', !q.done || q.claimed)
      c.claim.classList.toggle('gw-yellow', q.done && !q.claimed)
      c.claim.classList.toggle('disabled', q.claimed)
    })
  }
  setInterval(update, 1000) // the reset timer and the time quests
  return { ...win, update }
}
