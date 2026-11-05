// The game's sounds, all synthesised (see synth.js for the building blocks).
// The star is the spaghetti wall: a smash is a low body thump, a crunch that
// sweeps down, a cluster of dry sticks snapping (sharp crack + short woody
// ring each, densest at the start), an air whoosh as the pieces fly, and a
// rising sparkle on combos (each consecutive smash a little higher, so a
// streak climbs). Sticks clatter on the floor as they land, the steam engine
// chuffs with distance, a two-tone whistle sounds entering the lane, and a
// wind bed rises with speed.
import { AUDIO } from '../config.js'
import { A, now, onStart, ready, voice } from './core.js'
import { burst, modal, rnd, tone } from './synth.js'

export { installAudio, toggleMuted, isMuted, setMuted } from './core.js'

const WOOD = [
  [1, 1, 0.05],
  [2.76, 0.5, 0.03],
  [5.4, 0.25, 0.016],
  [8.9, 0.12, 0.01],
]
const BELL = [
  [1, 0.5, 0.6],
  [2.01, 0.22, 0.4],
  [3.02, 0.12, 0.25],
  [4.17, 0.06, 0.18],
]

// One dry stick snapping: a broadband crack and a short woody ring.
function crack(t, f, gain, pan) {
  burst({ t, type: 'highpass', f: rnd(2600, 5200), q: 0.7, a: 0.0004, d: rnd(0.006, 0.02), gain, pan })
  modal({ t, f, modes: WOOD, gain: gain * 0.55, pan, strike: gain * 0.25, decay: rnd(0.6, 1.3) })
}

// A wall giving way. big: 0.6..2 (how hard), combo: 1, 2, 3 ... (raises the pitch).
export function smash({ big = 1, combo = 1 } = {}) {
  if (!voice(1.2, 3)) return
  const t = now()
  const up = Math.min(1.7, 1 + (combo - 1) * 0.07)
  tone({ t, type: 'sine', f: 150 * up, f2: 40, glide: 0.22, a: 0.002, d: 0.34, gain: 0.5 * big })
  tone({ t, type: 'triangle', f: 95, f2: 34, glide: 0.3, d: 0.42, gain: 0.22 * big, lp: 320 })
  burst({ t, noise: 'pink', type: 'bandpass', f: 2400 * up, f2: 480, q: 0.9, a: 0.002, d: 0.3, gain: 0.55 * big, verb: 0.35 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 900, f2: 120, q: 0.6, a: 0.003, d: 0.35, gain: 0.35 * big })
  const n = Math.round(12 + 10 * big)
  for (let i = 0; i < n; i++) crack(t + Math.pow(Math.random(), 1.8) * 0.38, rnd(650, 2000) * up, rnd(0.07, 0.2), rnd(-0.8, 0.8))
  burst({ t: t + 0.01, noise: 'white', type: 'lowpass', f: 7000, f2: 380, q: 0.5, a: 0.025, d: 0.5, gain: 0.16, verb: 0.3 })
  if (combo >= 2) {
    const f = 784 * Math.pow(2, Math.min(combo - 2, 12) / 12)
    modal({ t: t + 0.04, f, modes: BELL, gain: 0.16, verb: 0.4 })
    modal({ t: t + 0.1, f: f * 1.5, modes: BELL, gain: 0.1, verb: 0.4 })
  }
}

// A wall that holds: a heavy dull thump, a creak, a few sticks cracking.
export function hold() {
  if (!voice(0.8, 2)) return
  const t = now()
  tone({ t, type: 'sine', f: 110, f2: 38, glide: 0.18, d: 0.3, gain: 0.55 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, f2: 150, a: 0.002, d: 0.25, gain: 0.4 })
  modal({ t: t + 0.03, f: rnd(180, 240), modes: WOOD, gain: 0.25, decay: 3, verb: 0.3 })
  for (let i = 0; i < 4; i++) crack(t + 0.02 + Math.random() * 0.15, rnd(900, 1600), rnd(0.05, 0.1), rnd(-0.5, 0.5))
}

// A stick landing on the floor (strength 0..1), panned.
let clatterBudget = AUDIO.clatterPerSecond
let budgetAt = 0
export function clatter(strength, pan = 0) {
  if (!ready()) return
  const t0 = A.ctx.currentTime
  if (t0 - budgetAt > 1) {
    budgetAt = t0
    clatterBudget = AUDIO.clatterPerSecond
  }
  if (clatterBudget <= 0 || !voice(0.15, 0.6)) return
  clatterBudget--
  const t = now()
  const s = Math.min(1, strength)
  modal({ t, f: rnd(480, 1300), modes: WOOD, gain: 0.04 + 0.12 * s, pan, strike: 0.06 * s, decay: rnd(0.7, 1.2) })
  if (s > 0.5) burst({ t, noise: 'pink', type: 'bandpass', f: rnd(500, 900), q: 1.2, d: 0.05, gain: 0.08 * s, pan })
}

// Treadmill payout: a soft rising bloop.
export function gain() {
  if (!voice(0.15, 0.5)) return
  const t = now()
  tone({ t, type: 'sine', f: 760, f2: 1180, glide: 0.07, a: 0.003, d: 0.1, gain: 0.07, bus: A.ui })
}

export function levelUp() {
  if (!voice(1.5, 3)) return
  const t = now()
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => modal({ t: t + i * 0.085, f, modes: BELL, gain: 0.2, verb: 0.45, bus: A.ui }))
  tone({ t: t + 0.34, type: 'triangle', f: 1046.5, f2: 1568, glide: 0.25, d: 0.5, gain: 0.08, bus: A.ui })
  for (let i = 0; i < 10; i++) modal({ t: t + 0.3 + Math.random() * 0.5, f: rnd(2400, 4200), modes: [[1, 0.2, 0.12]], gain: 0.05, bus: A.ui })
}

export function reward() {
  if (!voice(1.2, 3)) return
  const t = now()
  for (let i = 0; i < 9; i++) modal({ t: t + i * 0.055, f: 1318.5 * Math.pow(2, (i % 4) / 12) * (i > 4 ? 1.5 : 1), modes: BELL, gain: 0.12, verb: 0.35, bus: A.ui })
}

export function click() {
  if (!voice(0.08, 0.5)) return
  const t = now()
  tone({ t, type: 'triangle', f: 1300, f2: 780, glide: 0.04, a: 0.001, d: 0.05, gain: 0.09, bus: A.ui })
}

// Steam chuff, louder and brighter with speed (m/s).
export function chuff(speed) {
  if (!voice(0.12, 0.4)) return
  const t = now()
  const k = Math.min(1, speed / 18)
  burst({ t, noise: 'pink', type: 'bandpass', f: 700 + 700 * k, q: 0.8, a: 0.004, d: 0.07 + 0.03 * (1 - k), gain: 0.05 + 0.07 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 260, a: 0.003, d: 0.06, gain: 0.05 + 0.05 * k })
}

// Two-tone steam whistle ("toot-toot") with a little vibrato.
export function whistle() {
  if (!voice(1.1, 2)) return
  const ctx = A.ctx
  const t0 = now()
  for (const [start, len] of [
    [0, 0.22],
    [0.3, 0.45],
  ]) {
    const t = t0 + start
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.linearRampToValueAtTime(0.09, t + 0.03)
    out.gain.setValueAtTime(0.09, t + len - 0.06)
    out.gain.exponentialRampToValueAtTime(0.0001, t + len)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 6
    const depth = ctx.createGain()
    depth.gain.value = 6
    lfo.connect(depth)
    for (const [f, type] of [
      [587, 'triangle'],
      [740, 'triangle'],
      [1174, 'sine'],
    ]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      depth.connect(o.frequency)
      o.connect(out)
      o.start(t)
      o.stop(t + len + 0.05)
    }
    lfo.start(t)
    lfo.stop(t + len + 0.05)
    const air = ctx.createBiquadFilter()
    air.type = 'highpass'
    air.frequency.value = 300
    out.connect(air).connect(A.sfx)
    burst({ t, noise: 'white', type: 'bandpass', f: 2600, q: 1.5, a: 0.02, hold: len - 0.08, d: 0.06, gain: 0.03 })
  }
}

// Wind bed: looping pink noise through a bandpass, level 0..1 eased.
let wind = null
onStart((ctx) => {
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 700
  f.Q.value = 0.6
  const g = ctx.createGain()
  g.gain.value = 0
  src.connect(f).connect(g).connect(A.sfx)
  src.start()
  wind = { g, f }
})
export function setWind(level) {
  if (!wind || !ready()) return
  const t = A.ctx.currentTime
  wind.g.gain.setTargetAtTime(level * 0.22, t, 0.15)
  wind.f.frequency.setTargetAtTime(500 + level * 1400, t, 0.2)
}
