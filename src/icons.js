// Chunky "simulator" icons on a 64 x 64 grid, as lists of paths so the same
// art draws as inline SVG in the HUD (svgIcon) and on canvas for the in-world
// signs (drawIcon, via Path2D). Each part: d (SVG path), fill, optional
// stroke width `w` (outline colour is always INK) and `fillOnly`.
const INK = '#17171f'

export const ICON_PARTS = {
  trophy: [
    { d: 'M17 14h-7c0 9 4 14 11 15M47 14h7c0 9-4 14-11 15', fill: 'none', stroke: '#ffb400', w: 5 },
    { d: 'M17 8h30v9c0 13-7 21-15 23-8-2-15-10-15-23z', fill: '#ffc61a' },
    { d: 'M22 12h6v12c0 4 1 7 3 9-6-2-9-9-9-15z', fill: '#ffe680', fillOnly: true },
    { d: 'M28 39h8v8h-8z', fill: '#ffb400' },
    { d: 'M19 47h26v8H19z', fill: '#f08a00' },
    { d: 'M30 15h5v15h-5v-10l-3 1v-4z', fill: '#e87a00', fillOnly: true },
  ],
  rebirth: [
    { d: 'M9 31A23 23 0 0 1 49 16l4-5 3 19-18-3 6-5A15 15 0 0 0 17 31z', fill: '#ff3448' },
    { d: 'M14 27A19 19 0 0 1 44 15', fill: 'none', stroke: '#ff8a94', w: 3, fillOnly: true },
    { d: 'M55 33A23 23 0 0 1 15 48l-4 5-3-19 18 3-6 5A15 15 0 0 0 47 33z', fill: '#ffffff' },
    { d: 'M50 37A19 19 0 0 1 22 49', fill: 'none', stroke: '#4aa6ff', w: 4, fillOnly: true },
  ],
  gem: [
    { d: 'M20 10h24l12 14-24 32L8 24z', fill: '#e9eef5' },
    { d: 'M8 24h48M20 10l6 14 6 32 6-32 6-14', fill: 'none', stroke: '#9aa6b8', w: 2.5, fillOnly: true },
  ],
  star: [
    { d: 'M32 4l8.5 17.5 19.5 2.8-14 13.7 3.3 19.4L32 48.3l-17.3 9.1L18 38 4 24.3l19.5-2.8z', fill: '#ffc21a' },
    { d: 'M32 13l5.5 11.4 12.5 1.8-9 8.8', fill: 'none', stroke: '#ffe88a', w: 4, fillOnly: true },
  ],
  crown: [
    { d: 'M8 46 5 17l15 13 12-20 12 20 15-13-3 29z', fill: '#ffc21a' },
    { d: 'M9 46h46v8H9z', fill: '#f29a00' },
    { d: 'M32 27l5 6-5 6-5-6z', fill: '#ff2f5a' },
    { d: 'M17 36l3.5 3.5-3.5 3.5-3.5-3.5zM47 36l3.5 3.5-3.5 3.5-3.5-3.5z', fill: '#2f8cff' },
    { d: 'M5 17a3.5 3.5 0 1 0 .1 0M32 8a3.5 3.5 0 1 0 .1 0M59 17a3.5 3.5 0 1 0 .1 0', fill: '#ff4f8a' },
  ],
  globe: [
    { d: 'M32 6a26 26 0 1 0 .1 0z', fill: '#2a8cff' },
    { d: 'M14 18c6-2 9 2 13 1s4 5 0 8-9 1-10 7-6 4-8 0c-1-6 1-12 5-16zM36 12c5 0 10 2 13 6-2 3-6 2-8 5s2 6-1 9-7 1-7-4 3-6 0-9 0-7 3-7zM40 40c4-2 9 0 11 1-3 7-9 12-15 13 0-5 1-12 4-14z', fill: '#36d14a' },
    { d: 'M18 14c-4 3-7 8-8 13', fill: 'none', stroke: '#9fd4ff', w: 3.5, fillOnly: true },
  ],
  quests: [
    { d: 'M12 10h40v50H12z', fill: '#d08a3a' },
    { d: 'M17 15h30v40H17z', fill: '#fff8ea' },
    { d: 'M24 5h16v10H24z', fill: '#9aa3b2' },
    { d: 'M21 24l3 3 5-6M21 34l3 3 5-6M21 44l3 3 5-6', fill: 'none', stroke: '#22b33a', w: 3.5, fillOnly: true },
    { d: 'M32 25h11M32 35h11M32 45h11', fill: 'none', stroke: '#7a8aa0', w: 3, fillOnly: true },
  ],
  lockedTrain: [
    { d: 'M6 20h26l6 8h12c4 0 7 3 7 7v13H6z', fill: '#050507' },
    { d: 'M40 12h8v16h-8zM10 12h18v8H10z', fill: '#050507' },
    { d: 'M14 52a5 5 0 1 0 .1 0M30 52a5 5 0 1 0 .1 0M46 52a5 5 0 1 0 .1 0', fill: '#050507' },
  ],
  gear: [
    {
      d: 'M28 5h8l1.6 6.6a21 21 0 0 1 5.8 2.4l5.8-3.6 5.6 5.6-3.6 5.8a21 21 0 0 1 2.4 5.8L60 28v8l-6.6 1.6a21 21 0 0 1-2.4 5.8l3.6 5.8-5.6 5.6-5.8-3.6a21 21 0 0 1-5.8 2.4L36 60h-8l-1.6-6.6a21 21 0 0 1-5.8-2.4l-5.8 3.6-5.6-5.6 3.6-5.8a21 21 0 0 1-2.4-5.8L4 36v-8l6.6-1.6a21 21 0 0 1 2.4-5.8l-3.6-5.8 5.6-5.6 5.8 3.6a21 21 0 0 1 5.8-2.4zM32 22a10 10 0 1 0 .1 0z',
      fill: '#c9ccd4',
    },
  ],
  bolt: [
    { d: 'M40 3 13 36h15l-6 26 29-35H36z', fill: '#2f9bff' },
    { d: 'M37 9 20 31', fill: 'none', stroke: '#bfe6ff', w: 4, fillOnly: true },
  ],
  shoe: [
    { d: 'M6 40c2-10 6-18 12-22l8 9c6 2 10 0 14-4 6 6 14 9 18 13 2 3 1 8-3 9H10c-3 0-5-2-4-5z', fill: '#ff2b3a' },
    { d: 'M6 44h52v6c0 3-2 5-5 5H11c-3 0-5-2-5-5z', fill: '#ffffff' },
    { d: 'M24 32l5-3M28 37l5-3M33 41l5-3', fill: 'none', stroke: '#ffffff', w: 3, fillOnly: true },
  ],
  metro: [
    { d: 'M14 8h36c4 0 7 3 7 7v28c0 4-3 7-7 7H14c-4 0-7-3-7-7V15c0-4 3-7 7-7z', fill: '#2f8cff' },
    { d: 'M13 16h38v14H13z', fill: '#bfe6ff' },
    { d: 'M7 33h50v10c0 4-3 7-7 7H14c-4 0-7-3-7-7z', fill: '#ffffff' },
    { d: 'M16 41a3 3 0 1 0 .1 0M48 41a3 3 0 1 0 .1 0', fill: '#ffd21a' },
    { d: 'M18 50l-6 9M46 50l6 9M10 58h44', fill: 'none', stroke: '#2a2a35', w: 4 },
  ],
  plus: [
    { d: 'M24 6h16v18h18v16H40v18H24V40H6V24h18z', fill: '#3fd14a' },
    { d: 'M27 10h10v15', fill: 'none', stroke: '#9cf2a3', w: 3, fillOnly: true },
  ],
  lock: [
    { d: 'M20 28v-8a12 12 0 0 1 24 0v8', fill: 'none', stroke: '#c9ccd4', w: 6 },
    { d: 'M14 28h36v28H14z', fill: '#ffc21a' },
    { d: 'M32 36a4 4 0 0 1 2 7.5V49h-4v-5.5A4 4 0 0 1 32 36z', fill: '#7a4a00', fillOnly: true },
  ],
  // Premium currency: white hexagon coin (gem prices in the windows).
  hexcoin: [
    { d: 'M32 4l24 14v28L32 60 8 46V18z', fill: '#ffffff', w: 3.6 },
    { d: 'M32 15l14.5 8.5v17L32 49l-14.5-8.5v-17z', fill: 'none', stroke: '#17171f', w: 4.4 },
    { d: 'M28 28h8v8h-8z', fill: '#17171f', fillOnly: true },
  ],
  // Railcars: blue open wagon heaped with yellow cargo, on dark wheels.
  railcar: [
    { d: 'M8 20c4-6 12-9 24-9s20 3 24 9z', fill: '#ffd21a' },
    { d: 'M5 20h54v24H5z', fill: '#2a6aff' },
    { d: 'M14 23v18M23 23v18M32 23v18M41 23v18M50 23v18', fill: 'none', stroke: '#1a3fb0', w: 3, fillOnly: true },
    { d: 'M7 22h50', fill: 'none', stroke: '#8fc0ff', w: 2.5, fillOnly: true },
    { d: 'M3 44h58v5H3z', fill: '#2a2a35' },
    { d: 'M9 52a6 6 0 1 0 12 0a6 6 0 1 0-12 0zM43 52a6 6 0 1 0 12 0a6 6 0 1 0-12 0z', fill: '#3a3a45' },
  ],
}

// Inline SVG markup for the HUD.
export function svgIcon(name) {
  const parts = ICON_PARTS[name] ?? []
  const body = parts
    .map((p) => {
      const stroke = p.stroke ?? INK
      const w = p.w ?? 3.2
      if (p.fill === 'none') return `<path d="${p.d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
      if (p.fillOnly) return `<path d="${p.d}" fill="${p.fill}"/>`
      return `<path d="${p.d}" fill="${p.fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`
    })
    .join('')
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`
}

// Draws an icon on a 2D canvas, `size` px square with its top-left at (x, y).
export function drawIcon(ctx, name, x, y, size) {
  const parts = ICON_PARTS[name]
  if (!parts || typeof Path2D === 'undefined') return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 64, size / 64)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const p of parts) {
    const path = new Path2D(p.d)
    if (p.fill === 'none') {
      ctx.strokeStyle = p.stroke ?? INK
      ctx.lineWidth = p.w ?? 3.2
      ctx.stroke(path)
      continue
    }
    if (!p.fillOnly) {
      ctx.strokeStyle = INK
      ctx.lineWidth = (p.w ?? 3.2) * 2
      ctx.stroke(path)
    }
    ctx.fillStyle = p.fill
    ctx.fill(path)
  }
  ctx.restore()
}
