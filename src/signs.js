import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { fontReady } from './propkit.js'
import { drawIcon } from './icons.js'

// Floating billboard signs (always face the camera, like the reference's
// labels): one or more lines of outlined Fredoka text, each with an optional
// icon in front ('trophy', 'rebirth', 'gem', 'lock', 'bolt' ...).
//   line: { text, color, size = 1, icon, iconRight, outline = '#17171f', gap }
// `color` may be [top, bottom] for a vertical gradient. `height` is the world
// height of one size-1 line (so signs of any length share a scale); the sprite
// is anchored at its bottom centre unless opts.anchor says otherwise.
// sign.setLines(lines) repaints in place (name tags, level counters).
const BASE = 96 // px of a size-1 line

function paint(c, lines, { pad = 18, outline = 12 } = {}) {
  const ctx = c.getContext('2d')
  const measure = lines.map((l) => {
    const px = Math.round(BASE * (l.size ?? 1))
    ctx.font = `700 ${px}px Fredoka, "Arial Black", sans-serif`
    const tw = l.text ? ctx.measureText(l.text).width : 0
    const icon = l.icon ? px * 1.05 : 0
    const gap = l.icon && l.text ? px * (l.gap ?? 0.12) : 0
    return { px, tw, icon, gap, w: icon + gap + tw, h: px * 1.12 }
  })
  const width = Math.max(...measure.map((m) => m.w)) + pad * 2 + outline * 2
  const height = measure.reduce((s, m) => s + m.h, 0) + pad * 2
  c.width = Math.ceil(width)
  c.height = Math.ceil(height)
  ctx.clearRect(0, 0, c.width, c.height)
  let y = pad
  lines.forEach((l, i) => {
    const m = measure[i]
    const x0 = (c.width - m.w) / 2
    const iconX = l.iconRight ? x0 + m.tw + m.gap : x0
    if (l.icon) drawIcon(ctx, l.icon, iconX, y + (m.h - m.icon) / 2, m.icon)
    if (l.text) {
      ctx.font = `700 ${m.px}px Fredoka, "Arial Black", sans-serif`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.lineJoin = 'round'
      const tx = l.iconRight ? x0 : x0 + m.icon + m.gap
      const ty = y + m.h / 2 + m.px * 0.04
      ctx.lineWidth = outline * (l.size ?? 1) * (l.outlineScale ?? 1)
      ctx.strokeStyle = l.outline ?? '#17171f'
      ctx.strokeText(l.text, tx, ty)
      if (Array.isArray(l.color)) {
        const g = ctx.createLinearGradient(0, ty - m.px / 2, 0, ty + m.px / 2)
        g.addColorStop(0, l.color[0])
        g.addColorStop(1, l.color[1])
        ctx.fillStyle = g
      } else ctx.fillStyle = l.color ?? '#ffffff'
      ctx.fillText(l.text, tx, ty)
    }
    y += m.h
  })
}

export function sign(lines, height, opts = {}) {
  const c = document.createElement('canvas')
  let current = lines
  paint(c, current, opts)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, depthTest: opts.depthTest ?? true })
  const sprite = new Sprite(mat)
  sprite.center.set(0.5, opts.anchor ?? 0)
  sprite.renderOrder = opts.renderOrder ?? 3
  const fit = () => {
    const h = (height * c.height) / (BASE * 1.12) // `height` = metres per size-1 line
    sprite.scale.set((h * c.width) / c.height, h, 1)
  }
  const repaint = () => {
    paint(c, current, opts)
    tex.dispose() // the canvas may have changed size
    tex.needsUpdate = true
    fit()
  }
  fit()
  fontReady.then(repaint)
  sprite.setLines = (next) => {
    current = next
    repaint()
  }
  return sprite
}
