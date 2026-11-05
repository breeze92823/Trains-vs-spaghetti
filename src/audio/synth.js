// Synthesis building blocks for the one-shots (sfx.js). Each one schedules a
// few native nodes at time `t` and lets them be collected when they end.
// Realism comes from physics-shaped recipes, not from oscillators beeping:
//  - burst(): filtered noise with an envelope (impacts, whooshes, spray, claps)
//  - modal(): a struck object as a sum of decaying inharmonic modes (metal, glass,
//    wood); mode pairs are detuned a hair so metal beats and shimmers like the real thing
//  - bubble(): a Minnaert bubble, a decaying sine whose pitch rises as it
//    collapses; dozens of them are what makes water sound like water
//  - tone(): a pitched partial with glide (thumps, horns, whine)
// Every call takes random variation (vary) so repeats never machine-gun.
import { A, now } from './core.js'

export const rnd = (lo, hi) => lo + Math.random() * (hi - lo)
export const vary = (x, pct) => x * (1 + (Math.random() * 2 - 1) * pct)
export const pick = (list) => list[Math.floor(Math.random() * list.length)]

// Routes `node` to a bus with optional pan and reverb send; returns the gain to drive.
export function route(node, { bus = A.sfx, pan = 0, verb = 0 } = {}) {
  const ctx = A.ctx
  let last = node
  if (pan) {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    last.connect(p)
    last = p
  }
  last.connect(bus)
  if (verb > 0) {
    const s = ctx.createGain()
    s.gain.value = verb
    last.connect(s).connect(A.verb)
  }
  return last
}

// Attack/decay envelope on a gain param: linear attack, exponential decay to silence.
export function env(param, t, attack, peak, decay, hold = 0) {
  param.setValueAtTime(0.0001, t)
  param.linearRampToValueAtTime(peak, t + attack)
  if (hold) param.setValueAtTime(peak, t + attack + hold)
  param.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay)
  return t + attack + hold + decay
}

function noiseSource(kind, t, dur) {
  const src = A.ctx.createBufferSource()
  const buf = A.noise[kind] ?? A.noise.white
  src.buffer = buf
  src.loop = true
  src.start(t, Math.random() * (buf.duration - 0.1))
  src.stop(t + dur + 0.05)
  return src
}

// Filtered noise burst.
// { t, noise: 'white'|'pink'|'brown', type: biquad type, f, f2 (sweep end), q, a, d, hold,
//   gain, pan, verb, bus, sweep: seconds for f -> f2 (default the whole sound), hp (extra highpass) }
export function burst(o) {
  const ctx = A.ctx
  const t = o.t ?? now()
  const a = o.a ?? 0.002
  const d = o.d ?? 0.1
  const dur = a + (o.hold ?? 0) + d
  const src = noiseSource(o.noise ?? 'white', t, dur)
  const f = ctx.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.setValueAtTime(o.f ?? 1000, t)
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep ?? dur))
  f.Q.value = o.q ?? 1
  const g = ctx.createGain()
  env(g.gain, t, a, o.gain ?? 0.5, d, o.hold ?? 0)
  let last = src.connect(f)
  if (o.hp) {
    const h = ctx.createBiquadFilter()
    h.type = 'highpass'
    h.frequency.value = o.hp
    last = last.connect(h)
  }
  last.connect(g)
  route(g, o)
  return t + dur
}

// Pitched partial: { t, type, f, f2, glide, a, d, hold, gain, pan, verb, bus, lp }
export function tone(o) {
  const ctx = A.ctx
  const t = o.t ?? now()
  const a = o.a ?? 0.003
  const d = o.d ?? 0.2
  const dur = a + (o.hold ?? 0) + d
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.f, t)
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? dur))
  if (o.detune) osc.detune.value = o.detune
  const g = ctx.createGain()
  env(g.gain, t, a, o.gain ?? 0.3, d, o.hold ?? 0)
  let last = osc
  if (o.lp) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = o.lp
    f.Q.value = o.lpq ?? 0.7
    last = last.connect(f)
  }
  last.connect(g)
  osc.start(t)
  osc.stop(t + dur + 0.05)
  route(g, o)
  return t + dur
}

// Struck object. modes: [[ratio, amp, decay s], ...] relative to f.
// beat: detune cents of the twin of each mode (metal); strike: noise click level.
export function modal(o) {
  const ctx = A.ctx
  const t = o.t ?? now()
  const out = ctx.createGain()
  out.gain.value = o.gain ?? 0.3
  route(out, o)
  let end = t
  for (const [ratio, amp, decay] of o.modes) {
    const f = o.f * ratio * (1 + (Math.random() - 0.5) * (o.spread ?? 0.004))
    if (f > ctx.sampleRate * 0.45) continue
    const twins = o.beat ? [-o.beat / 2, o.beat / 2] : [0]
    for (const cents of twins) {
      const osc = ctx.createOscillator()
      osc.frequency.value = f
      osc.detune.value = cents
      const g = ctx.createGain()
      const d = decay * (o.decay ?? 1)
      env(g.gain, t, 0.0008, amp / twins.length, d)
      osc.connect(g).connect(out)
      osc.start(t)
      osc.stop(t + d + 0.05)
      end = Math.max(end, t + d)
    }
  }
  if (o.strike) burst({ t, f: Math.min(9000, o.f * 2.2), q: 0.8, a: 0.0005, d: 0.006, gain: o.strike, bus: out })
  return end
}

// One Minnaert bubble: f Hz, d s; its pitch rises by `rise` while it rings.
export function bubble({ t, f, d = 0.03, gain = 0.1, rise = 0.25, pan = 0, verb = 0, bus = A.sfx }) {
  const ctx = A.ctx
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(f, t)
  osc.frequency.exponentialRampToValueAtTime(f * (1 + rise), t + d)
  const g = ctx.createGain()
  env(g.gain, t, 0.0015, gain, d)
  osc.connect(g)
  osc.start(t)
  osc.stop(t + d + 0.04)
  route(g, { bus, pan, verb })
}

// A cloud of bubbles over `dur` s, densest at the start: n bubbles between f0..f1 Hz.
export function bubbles({ t, n, dur, f0, f1, gain = 0.08, d = [0.015, 0.05], rise = 0.3, width = 0.6, verb = 0, bus = A.sfx }) {
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(Math.random(), 1.8) * dur
    // Small bubbles (high) are far more common than big ones.
    const f = f0 * Math.pow(f1 / f0, Math.pow(Math.random(), 0.7))
    bubble({ t: at, f, d: rnd(d[0], d[1]) * (900 / f) ** 0.3, gain: gain * rnd(0.4, 1), rise: rise * rnd(0.6, 1.4), pan: rnd(-width, width), verb, bus })
  }
}

// Paper / plastic crinkle: n tiny bandpassed noise grains over dur s.
export function crinkle({ t, n, dur, gain = 0.15, f0 = 1800, f1 = 7000, width = 0.5, bus = A.sfx, verb = 0 }) {
  for (let i = 0; i < n; i++) {
    burst({ t: t + Math.random() * dur, f: rnd(f0, f1), q: rnd(1.5, 5), a: 0.0006, d: rnd(0.004, 0.02), gain: gain * rnd(0.3, 1), pan: rnd(-width, width), bus, verb })
  }
}

// Soft-clip curve for a WaveShaper (drive ~1..8).
export function saturation(drive) {
  const n = 1024
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(x * drive) / Math.tanh(drive)
  }
  return c
}
