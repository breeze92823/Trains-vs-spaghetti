// Bloxity emote clips ({ len, loop, tracks }: bone name -> [[t s, xDeg, yDeg, zDeg], ...], degree
// deltas over the bind pose in XYZ Euler order) played on one character's bones. Used for the
// local driver and for every remote driver, so everyone sees everyone's emotes.
//   const e = new EmotePlayer(root)   // while the rig is still in its bind pose
//   e.play(clip, onEnd)  e.stop()  e.active
//   e.apply(dt)          // after rig.applyPose(): blends the tracked bones over the pose
import { Euler, Quaternion } from 'three'

const DEG = Math.PI / 180
const BLEND = 0.1 // s to blend in / out
const smooth = (s) => s * s * (3 - 2 * s)

export class EmotePlayer {
  constructor(root) {
    this.nodes = root?.nodes ?? {}
    this.bind = {}
    for (const name of Object.keys(this.nodes)) this.bind[name] = this.nodes[name].quaternion.clone()
    this.clip = null
    this.time = 0
    this.weight = 0
    this.leaving = false
    this.onEnd = null
    this.euler = new Euler()
    this.q = new Quaternion()
    this.q2 = new Quaternion()
  }

  get active() {
    return !!this.clip
  }

  play(clip, onEnd = null) {
    if (!clip?.tracks || !(clip.len > 0)) return
    this.clip = clip
    this.time = 0
    this.leaving = false
    this.onEnd = onEnd
  }

  stop() {
    if (this.clip) this.leaving = true
  }

  // Value of one track at time t: smoothstep between keys, clamped outside the range.
  static sample(keys, t, out) {
    const n = keys.length
    if (t <= keys[0][0]) return out.set(keys[0][1], keys[0][2], keys[0][3])
    if (t >= keys[n - 1][0]) return out.set(keys[n - 1][1], keys[n - 1][2], keys[n - 1][3])
    let i = 1
    while (i < n - 1 && keys[i][0] < t) i++
    const a = keys[i - 1]
    const b = keys[i]
    const s = smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]))
    return out.set(a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s)
  }

  apply(dt) {
    const clip = this.clip
    if (!clip) return
    this.time += dt
    if (!clip.loop && this.time >= clip.len + BLEND) this.leaving = true
    this.weight = this.leaving ? Math.max(0, this.weight - dt / BLEND) : Math.min(1, this.weight + dt / BLEND)
    if (this.leaving && this.weight <= 0) {
      const done = this.onEnd
      this.clip = null
      this.onEnd = null
      done?.()
      return
    }
    const t = clip.loop ? this.time % clip.len : Math.min(this.time, clip.len)
    for (const name in clip.tracks) {
      const node = this.nodes[name]
      const keys = clip.tracks[name]
      if (!node || !keys?.length) continue
      EmotePlayer.sample(keys, t, this.euler)
      this.euler.set(this.euler.x * DEG, this.euler.y * DEG, this.euler.z * DEG, 'XYZ')
      // bind * delta (the delta is applied in the bone's own frame), blended over the current pose
      this.q.copy(this.bind[name]).multiply(this.q2.setFromEuler(this.euler))
      node.quaternion.slerp(this.q, this.weight)
    }
  }
}
