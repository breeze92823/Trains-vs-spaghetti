import { CONTAINERS, DISPLAY_TRAINS, GAME_SETTINGS, levelXp, POWER_GAIN, QUESTS, RAILCAR_TYPES, RAILCARS, REBIRTH, SAVE_KEY, SHOP, START_STATE, TITLES } from './config.js'
import * as bloxity from './bloxity.js'

// Game state: power, level / xp, wins, rebirths, autopilot, titles, railcars,
// daily quests and the in-game settings. Power gains go through earnPower(),
// which applies the rebirth x title x railcar multiplier (powerMult). The
// saved part goes to localStorage (SAVE_KEY) until the server keeps saves.
const SAVED = ['power', 'level', 'xp', 'wins', 'rebirths', 'titlesOwned', 'title', 'railcars', 'nextUid', 'singles', 'stock', 'quests', 'settings', 'trainsOwned', 'train', 'playtime']

export const state = {
  ...START_STATE,
  playtime: 0, // s played (net.js ticks it while the page is visible)
  autopilot: false,
  titlesOwned: TITLES.filter((t) => t.owned).map((t) => t.id),
  title: TITLES.find((t) => t.owned)?.id ?? null,
  railcars: [], // [{ uid, type }] every railcar owned (type: RAILCAR_TYPES key)
  nextUid: 1,
  singles: [], // container ids bought once already (`single` containers)
  stock: { period: -1, bought: {} }, // bought per container in the current restock period
  quests: { day: -1, progress: {}, claimed: {} },
  settings: Object.fromEntries(GAME_SETTINGS.map((s) => [s.key, true])),
  trainsOwned: [...SHOP.startOwned], // shop train indices (DISPLAY_TRAINS row by row)
  train: SHOP.startTrain, // the equipped one: the player drives it, it sets the treadmill power
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return
    applySaved(JSON.parse(raw))
  } catch {
    // a broken save starts fresh
  }
}
// Copies a saved snapshot (localStorage, or the server's `progress`) into the state.
function applySaved(s) {
  try {
    for (const k of SAVED) if (s[k] !== undefined) state[k] = s[k]
    if (!Number.isFinite(state.playtime)) state.playtime = 0
    state.settings = { ...Object.fromEntries(GAME_SETTINGS.map((g) => [g.key, true])), ...state.settings }
    if (!Array.isArray(state.titlesOwned)) state.titlesOwned = ['rookie']
    if (!Array.isArray(state.railcars)) state.railcars = []
    state.railcars = state.railcars.filter((r) => RAILCAR_TYPES[r.type])
    if (!Array.isArray(state.trainsOwned)) state.trainsOwned = [...SHOP.startOwned]
    if (!state.trainsOwned.includes(state.train)) state.train = state.trainsOwned[0] ?? 0
  } catch {
    // a broken save starts fresh
  }
}
load()

// Online (net.js): the whole saved snapshot, and a sink that takes over from localStorage once the
// server has answered with this account's save (a guest keeps the localStorage mirror too).
export const snapshot = () => Object.fromEntries(SAVED.map((k) => [k, state[k]]))
let saveSink = null
export function setSaveSink(fn, { mirror = false } = {}) {
  saveSink = fn ? { fn, mirror } : null
}
// The server's save replaces the local one; listeners are told but nothing is written back.
export function hydrate(doc) {
  if (!doc || typeof doc !== 'object') return
  applySaved(doc)
  for (const fn of listeners) fn(state)
}

let saveTimer = 0
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (saveSink) {
      try {
        saveSink.fn(snapshot())
      } catch {
        // the net layer must never break the game
      }
      if (!saveSink.mirror) return
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()))
    } catch {
      // storage full / blocked: keep playing
    }
  }, 400)
}

const listeners = new Set()
export function onState(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}
function emit() {
  for (const fn of listeners) fn(state)
  save()
}

// --- Multipliers ---------------------------------------------------------------------------
export const titleById = (id) => TITLES.find((t) => t.id === id) ?? null
export const titleMult = () => titleById(state.title)?.mult ?? 1
export const rebirthMult = (n = state.rebirths) => REBIRTH.mult(n)

// The best maxAttached railcars (by multiplier) ride behind the train.
export function attachedRailcars() {
  return [...state.railcars].sort((a, b) => RAILCAR_TYPES[b.type].mult - RAILCAR_TYPES[a.type].mult).slice(0, RAILCARS.maxAttached)
}
export const railcarMult = () => 1 + attachedRailcars().reduce((s, r) => s + RAILCAR_TYPES[r.type].mult - 1, 0)
export const powerMult = () => rebirthMult() * titleMult() * railcarMult()

// --- Power / level / wins ----------------------------------------------------------------------
// Raw add (also xp); rewards and packs use it as-is.
export function addPower(n) {
  state.power += n
  state.xp += n
  while (state.xp >= levelXp(state.level)) {
    state.xp -= levelXp(state.level)
    state.level += 1
  }
  emit()
}

// A gain from playing: multiplied, and counted for the 'power' quests. Returns the amount.
export function earnPower(base) {
  const amount = Math.round(base * powerMult() * 10) / 10
  questEvent('power', amount, true)
  addPower(amount)
  return amount
}

export function addWins(n) {
  state.wins += n
  emit()
}

export function setAutopilot(on) {
  state.autopilot = on
  emit()
}

// Premium (gem) purchases go through the platform (bloxity.purchase); false = not bought.
async function buyWithGems(sku, price) {
  try {
    return await bloxity.purchase(sku, price)
  } catch {
    return false
  }
}

// --- Titles -------------------------------------------------------------------------------------
export const ownsTitle = (id) => state.titlesOwned.includes(id)
export function equipTitle(id) {
  if (id && !ownsTitle(id)) return false
  state.title = id
  emit()
  return true
}
// Wins: spent. Returns 'ok' | 'owned' | 'poor'.
export function buyTitle(id) {
  const t = titleById(id)
  if (!t) return 'poor'
  if (ownsTitle(id)) return 'owned'
  if (state.wins < t.wins) return 'poor'
  state.wins -= t.wins
  state.titlesOwned.push(id)
  state.title = id
  emit()
  return 'ok'
}
export async function buyTitleGems(id) {
  const t = titleById(id)
  if (!t || ownsTitle(id)) return false
  if (!(await buyWithGems(`title_${id}`, t.gems))) return false
  state.titlesOwned.push(id)
  state.title = id
  emit()
  return true
}

// --- Rebirth ------------------------------------------------------------------------------------
export const rebirthLevel = () => REBIRTH.level(state.rebirths)
export const canRebirth = () => state.level >= rebirthLevel()
export function rebirth() {
  if (!canRebirth()) return false
  state.rebirths += 1
  state.power = 0
  state.level = 1
  state.xp = 0
  emit()
  return true
}
export async function skipRebirth() {
  if (!(await buyWithGems(`skip_rebirth_${state.rebirths + 1}`, REBIRTH.skipGems(state.rebirths)))) return false
  state.rebirths += 1
  emit()
  return true
}

// --- Daily quests ---------------------------------------------------------------------------------
const DAY = 86400000
const dayNumber = () => Math.floor(Date.now() / DAY)
export const questResetIn = () => (dayNumber() + 1) * DAY - Date.now() // ms to the next UTC midnight

function rollQuests() {
  const d = dayNumber()
  if (state.quests.day === d) return
  state.quests = { day: d, progress: {}, claimed: {} }
}
// [{ tier, quest, progress, done, claimed }] for today, easy / medium / hard.
export function dailyQuests() {
  rollQuests()
  const d = state.quests.day
  return QUESTS.tiers.map((tier, i) => {
    const pool = QUESTS.pools[tier.id]
    const quest = pool[(d + i) % pool.length]
    const progress = Math.min(quest.goal, state.quests.progress[tier.id] ?? 0)
    return { tier, quest, progress, done: progress >= quest.goal, claimed: !!state.quests.claimed[tier.id] }
  })
}
// Reward of a tier right now: pct of the current power / wins, at least min.
export function questReward(tier) {
  const r = tier.reward
  const base = r.type === 'power' ? state.power : state.wins
  return { type: r.type, amount: Math.max(r.min, Math.floor(base * r.pct)) }
}
export const claimableQuests = () => dailyQuests().filter((q) => q.done && !q.claimed).length

// kind: 'run' | 'seconds' | 'wall' | 'reward' | 'power'. quiet = the caller emits.
let lastWhole = {}
export function questEvent(kind, n = 1, quiet = false) {
  let changed = false
  for (const q of dailyQuests()) {
    if (q.quest.kind !== kind || q.done || q.claimed) continue
    const id = q.tier.id
    state.quests.progress[id] = (state.quests.progress[id] ?? 0) + n
    // Time ticks every frame: only tell the listeners when a whole second passes.
    const whole = Math.floor(state.quests.progress[id])
    if (kind !== 'seconds' || whole !== lastWhole[id]) changed = true
    lastWhole[id] = whole
  }
  if (changed && !quiet) emit()
}
export function claimQuest(tierId) {
  const q = dailyQuests().find((x) => x.tier.id === tierId)
  if (!q || !q.done || q.claimed) return null
  const reward = questReward(q.tier)
  state.quests.claimed[tierId] = true
  if (reward.type === 'power') addPower(reward.amount)
  else addWins(reward.amount)
  emit()
  return reward
}
export async function skipQuest(tierId) {
  const q = dailyQuests().find((x) => x.tier.id === tierId)
  if (!q || q.done || q.claimed) return false
  if (!(await buyWithGems(`skip_quest_${tierId}`, q.tier.skip))) return false
  state.quests.progress[tierId] = q.quest.goal
  emit()
  return true
}

// --- Railcar shop ------------------------------------------------------------------------------------
const period = () => Math.floor(Date.now() / (RAILCARS.restock * 1000))
export const restockIn = () => (period() + 1) * RAILCARS.restock * 1000 - Date.now()
export const railcarsUnlocked = () => state.rebirths >= RAILCARS.unlockRebirths
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
// Containers left this period (Infinity for gem containers that are not single).
export function stockLeft(c) {
  if (c.single) return state.singles.includes(c.id) ? 0 : 1
  if (!c.stock) return Infinity
  const p = period()
  if (state.stock.period !== p) state.stock = { period: p, bought: {} }
  const [lo, hi] = c.stock
  const total = lo + Math.floor(hash(p, CONTAINERS.indexOf(c) + 1) * (hi - lo + 1))
  return Math.max(0, total - (state.stock.bought[c.id] ?? 0))
}
function openContainer(c) {
  let roll = Math.random() * c.pool.reduce((s, [, w]) => s + w, 0)
  let type = c.pool[0][0]
  for (const [id, w] of c.pool) {
    if ((roll -= w) < 0) {
      type = id
      break
    }
  }
  state.railcars.push({ uid: state.nextUid++, type })
  if (c.single) state.singles.push(c.id)
  else if (c.stock) state.stock.bought[c.id] = (state.stock.bought[c.id] ?? 0) + 1
  emit()
  return type
}
// Returns { type } on success or { error: 'locked' | 'stock' | 'poor' | 'cancelled' }.
export async function buyContainer(id) {
  const c = CONTAINERS.find((x) => x.id === id)
  if (!c) return { error: 'stock' }
  if (!railcarsUnlocked()) return { error: 'locked' }
  if (stockLeft(c) <= 0) return { error: 'stock' }
  if (c.gems) {
    if (!(await buyWithGems(`container_${id}`, c.gems))) return { error: 'cancelled' }
    return { type: openContainer(c) }
  }
  if (state.wins < c.wins) return { error: 'poor' }
  state.wins -= c.wins
  return { type: openContainer(c) }
}

// --- Trains (the shop on the west display, shop.js) --------------------------------------------------
export const SHOP_TRAINS = DISPLAY_TRAINS.flat()
export const ownsTrain = (i) => state.trainsOwned.includes(i)
export const trainPower = () => SHOP_TRAINS[state.train]?.power ?? 1
// Wins: spent, and the new train is equipped. Returns 'ok' | 'owned' | 'poor'.
export function buyTrain(i) {
  const t = SHOP_TRAINS[i]
  if (!t) return 'poor'
  if (ownsTrain(i)) return 'owned'
  for (let j = 0; j < i; j++) if (!ownsTrain(j)) return 'locked' // every lower train must be bought first
  if (state.wins < t.wins) return 'poor'
  state.wins -= t.wins
  state.trainsOwned.push(i)
  state.train = i
  emit()
  return 'ok'
}
export function equipTrain(i) {
  if (!ownsTrain(i)) return false
  state.train = i
  emit()
  return true
}

// --- Settings ----------------------------------------------------------------------------------------
export function setSetting(key, on) {
  state.settings[key] = on
  emit()
}

// --- Treadmills ---------------------------------------------------------------------------------------
const unlocked = (zone) => !zone.price && state.rebirths >= zone.cost

// zones: from buildProps().treadmills. Calls onGain(amount, zone) per payout and
// onLocked(zone) once each time the train rolls onto a locked belt.
export function createTreadmillTracker(zones, { onGain, onLocked }) {
  let current = null
  let timer = 0
  return {
    get current() {
      return current
    },
    // The belt the train is on, when it pays (unlocked); null otherwise.
    get active() {
      return current && unlocked(current) ? current : null
    },
    update(dt, pos) {
      const zone = zones.find((z) => pos.x >= z.x0 && pos.x <= z.x1 && pos.z >= z.z0 && pos.z <= z.z1 && pos.y < 3.5) ?? null
      if (zone !== current) {
        current = zone
        timer = 0
        if (zone && !unlocked(zone)) onLocked(zone)
      }
      if (!zone || !unlocked(zone)) return
      timer += dt
      while (timer >= POWER_GAIN.tick) {
        timer -= POWER_GAIN.tick
        onGain(earnPower(trainPower() * zone.mult), zone)
      }
    },
  }
}

// 1234 -> "1,234"; 12345 -> "12.3K"; up through K, M, B, T, Qa, Qi.
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qd']
export function formatNumber(n) {
  if (n < 10000) return Math.floor(n).toLocaleString('en-US')
  let i = 0
  while (n >= 1000 && i < SUFFIX.length - 1) {
    n /= 1000
    i++
  }
  return `${n >= 100 ? Math.floor(n) : Math.floor(n * 10) / 10}${SUFFIX[i]}`
}

// Price-tag style: 30, 500, 2.5K, 5K, 250K, 1.5Qa (no commas, one decimal at most).
export function shortNumber(n) {
  if (n < 1000) return String(Math.floor(n))
  let i = 0
  while (n >= 1000 && i < SUFFIX.length - 1) {
    n /= 1000
    i++
  }
  return `${Math.floor(n * 10) / 10}${SUFFIX[i]}`
}
