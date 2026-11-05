// The player's train, heard from the camera (config AUDIO.train). Everything goes into
// one bus -> 3D panner at the train -> the world bus (ducked under menus), so it pans
// and fades with the chase camera; Settings > Train sounds switches the bus off.
//
// Continuous layers, eased every frame from the train's real motion:
//  - engine, by kind: steam = boiler hiss + firebox rumble, with exhaust chuffs spaced by
//    distance (accented in pairs, louder while working hard); diesel (+ shunter) = two
//    detuned saws through a lowpass, amplitude-pulsed at the firing rate, rising in
//    pitch with load; electric (bullet, modern) = traction-motor whine + gear mesh +
//    inverter buzz climbing with speed over a transformer hum
//  - wheel roar: rumbling pink noise that brightens and swells with speed
//  - brake squeal: beating sines + ringing noise while the train sheds speed (and a
//    lighter flange squeal on tight curves at speed)
//  - wind at the window: only while the driver's head is out, gusting, louder with speed
// One-shots: the clack-clack of each rail joint (two axles per bogie, both bogies; the
// driver bounces on each, onClack), the air-brake hiss on stopping, the horn on departure.
import { AUDIO } from '../config.js'
import { A, now, onStart, ready, voice } from './core.js'
import { burst, modal, rnd, tone } from './synth.js'

const T = AUDIO.train
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const VOICE = { steam: 'steam', diesel: 'diesel', shunter: 'diesel', bullet: 'electric', modern: 'electric' }
const RAIL = [
  [1, 1, 0.035],
  [2.31, 0.55, 0.022],
  [4.07, 0.3, 0.014],
  [6.62, 0.15, 0.008],
]

let bus = null
let panner = null
let enabled = true
const L = {} // the continuous layers' gains + params

function loop(ctx, buffer) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.start(0, Math.random() * (buffer.duration - 0.1))
  return src
}
function gain(ctx, to, value = 0) {
  const g = ctx.createGain()
  g.gain.value = value
  g.connect(to)
  return g
}
function filter(ctx, type, f, q = 0.7) {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
function osc(ctx, type, f) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = f
  o.start()
  return o
}

onStart((ctx) => {
  bus = ctx.createGain()
  bus.gain.value = enabled ? T.level : 0
  panner = ctx.createPanner()
  panner.panningModel = 'equalpower'
  panner.distanceModel = 'inverse'
  panner.refDistance = T.panner.refDistance
  panner.rolloffFactor = T.panner.rolloff
  panner.maxDistance = T.panner.maxDistance
  bus.connect(panner).connect(A.engine)

  // Wheel roar.
  L.roll = gain(ctx, bus)
  L.rollF = filter(ctx, 'bandpass', 400, 0.6)
  loop(ctx, A.noise.brownStereo).connect(L.rollF).connect(L.roll)
  L.rollHi = gain(ctx, bus)
  L.rollHiF = filter(ctx, 'bandpass', 1400, 1.1)
  loop(ctx, A.noise.pinkStereo).connect(L.rollHiF).connect(L.rollHi)

  // Steam: boiler hiss + firebox rumble (the chuffs are one-shots).
  L.steam = gain(ctx, bus)
  loop(ctx, A.noise.white).connect(filter(ctx, 'highpass', 4200)).connect(gain(ctx, L.steam, 0.06))
  L.fire = gain(ctx, L.steam)
  loop(ctx, A.noise.brown).connect(filter(ctx, 'lowpass', 160)).connect(L.fire)

  // Diesel: two detuned saws -> lowpass -> pulsed at the firing rate.
  L.diesel = gain(ctx, bus)
  L.dA = osc(ctx, 'sawtooth', 40)
  L.dB = osc(ctx, 'sawtooth', 40.6)
  L.dF = filter(ctx, 'lowpass', 260, 2.2)
  const pulse = gain(ctx, L.diesel, 0.6)
  L.dLfo = osc(ctx, 'sine', 20)
  const depth = ctx.createGain()
  depth.gain.value = 0.4
  L.dLfo.connect(depth).connect(pulse.gain)
  L.dA.connect(L.dF)
  L.dB.connect(L.dF)
  L.dF.connect(pulse)
  loop(ctx, A.noise.brown).connect(filter(ctx, 'lowpass', 220)).connect(gain(ctx, L.diesel, 0.5))

  // Electric: motor whine + gear mesh + inverter buzz, transformer hum.
  L.electric = gain(ctx, bus)
  L.hum = gain(ctx, L.electric, 0.05)
  osc(ctx, 'sine', 100).connect(L.hum)
  osc(ctx, 'sine', 200).connect(gain(ctx, L.hum, 0.4))
  L.whine = gain(ctx, L.electric)
  L.eA = osc(ctx, 'sine', 200)
  L.eB = osc(ctx, 'triangle', 300)
  L.eA.connect(L.whine)
  L.eB.connect(gain(ctx, L.whine, 0.35))
  L.buzz = gain(ctx, L.electric)
  L.eC = osc(ctx, 'square', 700)
  L.eCF = filter(ctx, 'bandpass', 1400, 3)
  L.eC.connect(L.eCF).connect(L.buzz)

  // Brake squeal: two beating sines with a wobble, and ringing noise.
  L.squeal = gain(ctx, bus)
  L.sA = osc(ctx, 'sine', 3150)
  L.sB = osc(ctx, 'sine', 3207)
  const wob = osc(ctx, 'sine', 6.5)
  const wobDepth = ctx.createGain()
  wobDepth.gain.value = 28
  wob.connect(wobDepth)
  wobDepth.connect(L.sA.frequency)
  wobDepth.connect(L.sB.frequency)
  L.sA.connect(gain(ctx, L.squeal, 0.5))
  L.sB.connect(gain(ctx, L.squeal, 0.35))
  L.sN = filter(ctx, 'bandpass', 3300, 9)
  loop(ctx, A.noise.white).connect(L.sN).connect(gain(ctx, L.squeal, 2.2))

  // Wind round the driver's head.
  L.wind = gain(ctx, bus)
  L.windF = filter(ctx, 'bandpass', 900, 0.5)
  loop(ctx, A.noise.pinkStereo).connect(L.windF).connect(L.wind)
})

export function setTrainSoundsEnabled(on) {
  enabled = !!on
  if (bus) bus.gain.setTargetAtTime(enabled ? T.level : 0, A.ctx.currentTime, 0.1)
}

// --- One-shots ----------------------------------------------------------------------
function clack(t, k) {
  modal({ t, f: rnd(1650, 2250), modes: RAIL, gain: 0.04 + 0.09 * k, strike: 0.03 * k, bus })
  burst({ t, noise: 'pink', type: 'bandpass', f: rnd(1700, 2600), q: 1.1, a: 0.0005, d: 0.03, gain: 0.06 + 0.12 * k, bus })
  tone({ t, type: 'sine', f: rnd(105, 130), f2: 55, glide: 0.06, a: 0.001, d: 0.09, gain: 0.07 + 0.17 * k, bus })
  burst({ t, noise: 'brown', type: 'lowpass', f: 420, a: 0.001, d: 0.07, gain: 0.05 + 0.1 * k, bus })
}

function chuff(speed, strong, work) {
  if (!voice(0.2, 0.5)) return
  const t = now()
  const k = clamp(speed / T.topSpeed, 0, 1)
  const g = (strong ? 1 : 0.62) * (0.65 + 0.6 * work)
  burst({ t, noise: 'pink', type: 'bandpass', f: 950 + 900 * k, f2: 360, q: 0.9, a: 0.004, d: 0.1 + 0.08 * (1 - k), gain: (0.08 + 0.06 * k) * g, bus, verb: 0.12 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 320, a: 0.003, d: 0.09, gain: (0.09 + 0.05 * k) * g, bus })
  burst({ t: t + 0.012, noise: 'white', type: 'highpass', f: 4200, a: 0.002, d: 0.06, gain: 0.025 * g, bus })
}

// The brakes letting go once stopped: a valve pop, then a long falling hiss.
export function hiss(peak = 6, kind = 'steam') {
  if (!bus || !enabled || !voice(1.4, 2)) return
  const t = now()
  const k = clamp(peak / 12, 0.5, 1)
  const steam = VOICE[kind] === 'steam'
  tone({ t, type: 'sine', f: 160, f2: 70, glide: 0.05, a: 0.001, d: 0.06, gain: 0.12 * k, bus })
  burst({ t: t + 0.02, noise: 'white', type: 'highpass', f: 5600, f2: 2400, sweep: steam ? 1.4 : 1, q: 0.5, a: 0.015, hold: steam ? 0.5 : 0.22, d: steam ? 1.2 : 0.8, gain: 0.32 * k, bus, verb: 0.2 })
  burst({ t: t + 0.02, noise: 'pink', type: 'bandpass', f: 3000, f2: 1800, q: 0.8, a: 0.01, d: 0.45, gain: 0.14 * k, bus })
}

// Horn notes: oscillators with an attack slur and a little vibrato, through a lowpass.
function notes(t, freqs, type, segments, { lp = 2400, gainK = 0.07, vib = 4, slur = 0.03 } = {}) {
  const ctx = A.ctx
  for (const [start, len] of segments) {
    const at = t + start
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, at)
    out.gain.linearRampToValueAtTime(gainK, at + 0.04)
    out.gain.setValueAtTime(gainK, at + len - 0.08)
    out.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.12)
    const f = filter(ctx, 'lowpass', lp, 0.9)
    f.connect(out).connect(bus)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.5
    const d = ctx.createGain()
    d.gain.value = vib
    lfo.connect(d)
    for (const fr of freqs) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(fr * (1 - slur), at)
      o.frequency.exponentialRampToValueAtTime(fr, at + 0.08)
      d.connect(o.frequency)
      o.connect(f)
      o.start(at)
      o.stop(at + len + 0.2)
    }
    lfo.start(at)
    lfo.stop(at + len + 0.2)
  }
}
let hornAt = -1e9
export function horn(kind = 'steam') {
  if (!bus || !enabled || !ready()) return
  const t0 = A.ctx.currentTime
  if (t0 - hornAt < T.hornCooldown || !voice(1.6, 3)) return
  hornAt = t0
  const t = now()
  const v = VOICE[kind] ?? 'steam'
  if (v === 'steam') {
    // A long steam whistle, then a short one, breathy at the start.
    notes(t, [523, 659, 784, 1046], 'triangle', [[0, 0.75], [0.95, 0.28]], { lp: 3200, gainK: 0.06, vib: 5, slur: 0.05 })
    burst({ t, noise: 'white', type: 'bandpass', f: 2400, q: 1.4, a: 0.03, hold: 0.6, d: 0.15, gain: 0.04, bus })
  } else if (v === 'diesel') {
    notes(t, [311, 392, 466], 'sawtooth', [[0, 0.9], [1.1, 0.35]], { lp: 2000, gainK: 0.05, vib: 1.5 })
  } else {
    notes(t, [659, 831], 'square', [[0, 0.32], [0.45, 0.55]], { lp: 2600, gainK: 0.035, vib: 2, slur: 0.01 })
  }
}

// --- Per frame ----------------------------------------------------------------------------
const pos = { x: 0, y: 0, z: 0 }
const fwd = { x: 0, y: 0, z: -1 }
let jointAt = 0
let chuffAt = 0
let chuffStrong = true
let gust = 0
let gustGoal = 0.5

function setParam(param, value, tc = 0.08) {
  param.setTargetAtTime(value, A.ctx.currentTime, tc)
}

// m: { speed, surge, lateral, grounded } (driver.motion); kind: the train model's kind;
// out: 0..1 how far the driver's head is out of the window; at: the train's world
// position; camera: the listener. onClack(strength, delay) as each axle hits a joint.
export function updateTrainSounds(dt, m, kind, out, at, camera, onClack) {
  if (!bus || !ready() || !(dt > 0)) return
  const ctx = A.ctx
  const v = VOICE[kind] ?? 'steam'
  const k = clamp(m.speed / T.topSpeed, 0, 1)
  const ground = m.grounded ? 1 : 0.15
  const work = clamp(m.surge / 2, 0, 1)

  // Where it is, and where we hear it from.
  const t = ctx.currentTime
  if (panner.positionX) {
    panner.positionX.setTargetAtTime(at.x, t, 0.03)
    panner.positionY.setTargetAtTime(at.y + 1.2, t, 0.03)
    panner.positionZ.setTargetAtTime(at.z, t, 0.03)
  } else panner.setPosition(at.x, at.y + 1.2, at.z)
  const e = camera.matrixWorld.elements
  pos.x = e[12]
  pos.y = e[13]
  pos.z = e[14]
  fwd.x = -e[8]
  fwd.y = -e[9]
  fwd.z = -e[10]
  const li = ctx.listener
  if (li.positionX) {
    li.positionX.setTargetAtTime(pos.x, t, 0.03)
    li.positionY.setTargetAtTime(pos.y, t, 0.03)
    li.positionZ.setTargetAtTime(pos.z, t, 0.03)
    li.forwardX.setTargetAtTime(fwd.x, t, 0.03)
    li.forwardY.setTargetAtTime(fwd.y, t, 0.03)
    li.forwardZ.setTargetAtTime(fwd.z, t, 0.03)
    li.upX.value = 0
    li.upY.value = 1
    li.upZ.value = 0
  } else {
    li.setPosition(pos.x, pos.y, pos.z)
    li.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0)
  }

  // Wheels on rails.
  setParam(L.roll.gain, (0.05 * k + 0.22 * k * k) * ground * (m.speed > 0.3 ? 1 : 0))
  setParam(L.rollF.frequency, 160 + 650 * k)
  setParam(L.rollHi.gain, 0.06 * k * k * ground)
  setParam(L.rollHiF.frequency, 900 + 1400 * k)

  // The engine voice for this kind; the others fade out.
  setParam(L.steam.gain, v === 'steam' ? 1 : 0, 0.2)
  setParam(L.diesel.gain, v === 'diesel' ? 0.06 + 0.07 * k + 0.05 * work : 0, 0.2)
  setParam(L.electric.gain, v === 'electric' ? 1 : 0, 0.2)
  if (v === 'steam') {
    setParam(L.fire.gain, 0.06 + 0.12 * k + 0.1 * work)
    // Chuffs: distance-spaced, never faster than ~9 a second; accented in pairs.
    if (m.speed > 0.8 && m.grounded) {
      chuffAt += m.speed * dt
      if (chuffAt >= Math.max(AUDIO.chuffEvery, m.speed / 9)) {
        chuffAt = 0
        chuff(m.speed, chuffStrong, work)
        chuffStrong = !chuffStrong
      }
    }
  } else if (v === 'diesel') {
    const load = clamp(k * 0.75 + work * 0.4, 0, 1)
    const f0 = 38 + 36 * load
    setParam(L.dA.frequency, f0, 0.25)
    setParam(L.dB.frequency, f0 * 1.013, 0.25)
    setParam(L.dLfo.frequency, f0 / 2, 0.25)
    setParam(L.dF.frequency, 240 + 1100 * load, 0.25)
  } else {
    const f = 160 + 1250 * k
    setParam(L.eA.frequency, f, 0.15)
    setParam(L.eB.frequency, f * 1.5, 0.15)
    setParam(L.whine.gain, (0.012 + 0.03 * k + 0.035 * work) * (m.speed > 0.3 ? 1 : 0.2))
    setParam(L.eC.frequency, 420 + 1800 * k, 0.15)
    setParam(L.eCF.frequency, 900 + 2600 * k, 0.15)
    setParam(L.buzz.gain, 0.004 + 0.014 * work + 0.006 * k)
  }

  // Squeal: shedding speed (brakes), or a tight curve at speed (flanges).
  const felt = m.speed - m.surge
  const brake = clamp((-m.surge - T.squeal.decel) / 5, 0, 1) * clamp(felt / 3, 0, 1)
  const flange = clamp((Math.abs(m.lateral) - T.squeal.curve) / 10, 0, 1) * clamp(m.speed / 8, 0, 1) * 0.45
  const sq = Math.max(brake, flange) * (m.grounded ? 1 : 0)
  setParam(L.squeal.gain, sq * 0.05, sq > 0.02 ? 0.04 : 0.12)
  setParam(L.sA.frequency, 3050 + 500 * sq, 0.1)
  setParam(L.sB.frequency, 3110 + 520 * sq, 0.1)

  // Wind round the head: a slow random gust.
  gust += (gustGoal - gust) * (1 - Math.exp(-1.6 * dt))
  if (Math.abs(gust - gustGoal) < 0.05) gustGoal = 0.35 + Math.random() * 0.65
  setParam(L.wind.gain, out * (0.015 + 0.2 * k) * (0.6 + 0.4 * gust), 0.12)
  setParam(L.windF.frequency, 500 + 1700 * k * (0.7 + 0.3 * gust), 0.2)

  // Rail joints: each axle pair passes a joint, then the rear bogie does.
  if (m.speed > 1 && m.grounded) {
    jointAt += m.speed * dt
    if (jointAt >= T.joint) {
      jointAt -= T.joint
      if (voice(0.5, 0.5)) {
        const s = clamp(0.35 + k * 0.9, 0, 1)
        const t0 = now()
        const gap = T.wheelbase / m.speed
        const bogie = Math.min(0.5, (T.wheelbase * 2.3) / m.speed)
        clack(t0, s)
        clack(t0 + gap, s * 0.8)
        if (bogie < 0.45) {
          clack(t0 + bogie, s * 0.85)
          clack(t0 + bogie + gap, s * 0.7)
        }
        onClack?.(s, 0)
        onClack?.(s * 0.7, gap)
      }
    }
  }
}
