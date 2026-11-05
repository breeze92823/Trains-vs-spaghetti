// Isometric shipping-container pictures for the Railcars shop cards (SVG), one per
// container `look`: a coloured corrugated box in a dark frame with corner blocks and
// door bars on the end, plus the look's own art on the long side.
// Faces are drawn in unit space through affine transforms (side / end / top).
const LOOKS = {
  cargo: { base: '#1f5cff', light: '#5a8cff', dark: '#1238b0', glow: '#2f7bff' },
  desert: { base: '#ff8a1a', light: '#ffc060', dark: '#c04a08', glow: '#ff7a1a' },
  industrial: { base: '#ff6a12', light: '#ff9a50', dark: '#b8400a', glow: '#ff5a10' },
  recycling: { base: '#1f8f4f', light: '#3fc070', dark: '#11603a', glow: '#22c060' },
  automotive: { base: '#2a2a32', light: '#4a4a55', dark: '#17171c', glow: '#ff2a3a' },
  cosmic: { base: '#3a26d0', light: '#6a50ff', dark: '#1e1280', glow: '#a040ff' },
  food: { base: '#e8262f', light: '#ff5a5a', dark: '#9a1018', glow: '#ff3a2a' },
}
export const lookColor = (look) => LOOKS[look] ?? LOOKS.cargo

// Box corners in screen space (viewBox 0 0 210 180).
const O = [20, 104]
const L = [118, 59] // long axis
const S = [48, -28] // short axis (into the picture)
const U = 62 // height
const pt = (u, s, up) => [O[0] + L[0] * u + S[0] * s, O[1] + L[1] * u + S[1] * s - U * up]
const poly = (pts) => pts.map((p) => p.join(',')).join(' ')

// Side art in unit space: u 0..1 along the box, v 0..1 top to bottom.
function sideArt(look, c) {
  switch (look) {
    case 'desert':
      return `<rect x="0" y="0" width="1" height="1" fill="url(#dsky)"/>
        <circle cx="0.55" cy="0.42" r="0.13" fill="#fff4b0"/>
        <path d="M0 0.78 Q0.25 0.6 0.5 0.75 T1 0.7 V1 H0Z" fill="#c8501a"/>
        <path d="M0.2 0.85 v-0.3 M0.2 0.66 h-0.05 v-0.08 M0.2 0.7 h0.05 v-0.1 M0.78 0.82 v-0.26 M0.78 0.64 h0.05 v-0.08" stroke="#1d3a1a" stroke-width="0.035" fill="none" stroke-linecap="round"/>`
    case 'industrial':
      return '<path d="M0.04 0.08 L0.96 0.92 M0.96 0.08 L0.04 0.92" stroke="#ffb070" stroke-width="0.07"/><path d="M0.04 0.08 L0.96 0.92 M0.96 0.08 L0.04 0.92" stroke="#b8400a" stroke-width="0.03"/>'
    case 'recycling':
      return '<g transform="translate(0.5 0.5) scale(0.32 0.6)" fill="none" stroke="#ffffff" stroke-width="0.16" stroke-linecap="round"><path d="M-0.7 0.4 L-0.1 -0.6 M0.2 -0.6 L0.8 0.4 M0.6 0.7 L-0.6 0.7"/><path d="M-0.35 -0.55 L-0.05 -0.65 L0 -0.35 M0.85 0.1 L0.85 0.45 L0.55 0.45 M-0.3 0.9 L-0.6 0.7 L-0.3 0.5"/></g>'
    case 'automotive':
      return '<path d="M0 0.55 L0.6 0.15 L1 0.1 M0 0.75 L0.65 0.35 L1 0.32" stroke="#ff2a3a" stroke-width="0.07" fill="none"/><path d="M0 0.55 L0.6 0.15 L1 0.1 M0 0.75 L0.65 0.35 L1 0.32" stroke="#ffffff" stroke-width="0.02" fill="none"/>'
    case 'cosmic':
      return `<rect x="0" y="0" width="1" height="1" fill="url(#cosmos)"/>
        <g fill="#fff">${[[0.1, 0.2], [0.3, 0.7], [0.8, 0.25], [0.9, 0.8], [0.2, 0.45], [0.7, 0.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.018"/>`).join('')}</g>
        <ellipse cx="0.5" cy="0.5" rx="0.2" ry="0.16" fill="none" stroke="#ff7af0" stroke-width="0.04"/><circle cx="0.5" cy="0.5" r="0.09" fill="#140830"/>`
    case 'food':
      return `<g transform="translate(0.5 0.52)"><ellipse rx="0.17" ry="0.12" cy="-0.1" fill="#f0a030"/><rect x="-0.18" y="-0.04" width="0.36" height="0.08" fill="#5a2a10"/><rect x="-0.18" y="-0.07" width="0.36" height="0.04" fill="#3ec03a"/><ellipse rx="0.17" ry="0.08" cy="0.1" fill="#f0a030"/></g>
        <g transform="translate(0.82 0.55)" fill="#ffd23a"><rect x="-0.06" y="-0.2" width="0.03" height="0.3"/><rect x="0" y="-0.25" width="0.03" height="0.35"/><rect x="0.05" y="-0.18" width="0.03" height="0.28"/></g>`
    default:
      return ''
  }
}

let uid = 0
export function containerSvg(look) {
  const c = lookColor(look)
  const id = `ct${uid++}`
  const side = `matrix(${L[0]} ${L[1]} 0 ${U} ${O[0]} ${O[1] - U})`
  const end = `matrix(${S[0]} ${S[1]} 0 ${U} ${O[0] + L[0]} ${O[1] + L[1] - U})`
  // Corrugation ribs.
  let ribs = ''
  for (let i = 1; i < 14; i++) ribs += `<path d="M${i / 14} 0.05 V0.95" stroke="${c.dark}" stroke-width="0.012"/>`
  let endRibs = ''
  for (let i = 1; i < 6; i++) endRibs += `<path d="M${i / 6} 0.05 V0.95" stroke="${c.dark}" stroke-width="0.03"/>`
  const top = poly([pt(0, 0, 1), pt(1, 0, 1), pt(1, 1, 1), pt(0, 1, 1)])
  const frame = '#26262e'
  return `<svg viewBox="0 0 210 180" aria-hidden="true" class="ct-svg" style="--glow:${c.glow}">
  <defs>
    <linearGradient id="dsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1a"/><stop offset="1" stop-color="#ffb040"/></linearGradient>
    <radialGradient id="cosmos"><stop offset="0" stop-color="#8a50ff"/><stop offset="1" stop-color="#1a1080"/></radialGradient>
    <clipPath id="${id}u"><rect x="0" y="0" width="1" height="1"/></clipPath>
  </defs>
  <polygon points="${top}" fill="${c.light}" stroke="${frame}" stroke-width="5" stroke-linejoin="round"/>
  ${(() => {
    let t = ''
    for (let i = 1; i < 10; i++) {
      const a = pt(i / 10, 0.08, 1)
      const b = pt(i / 10, 0.92, 1)
      t += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c.base}" stroke-width="1.6"/>`
    }
    return t
  })()}
  <g transform="${side}"><rect x="0" y="0" width="1" height="1" fill="${c.base}"/>${ribs}<g clip-path="url(#${id}u)">${sideArt(look, c)}</g></g>
  <g transform="${end}"><rect x="0" y="0" width="1" height="1" fill="${c.dark}"/>${endRibs}
    <path d="M0.3 0.08 V0.92 M0.42 0.08 V0.92 M0.6 0.08 V0.92 M0.72 0.08 V0.92" stroke="#e8e8ee" stroke-width="0.045"/>
    <path d="M0.26 0.35 h0.2 M0.56 0.35 h0.2 M0.26 0.65 h0.2 M0.56 0.65 h0.2" stroke="#e8e8ee" stroke-width="0.03"/></g>
  <polygon points="${poly([pt(0, 0, 0), pt(1, 0, 0), pt(1, 0, 1), pt(0, 0, 1)])}" fill="none" stroke="${frame}" stroke-width="6" stroke-linejoin="round"/>
  <polygon points="${poly([pt(1, 0, 0), pt(1, 1, 0), pt(1, 1, 1), pt(1, 0, 1)])}" fill="none" stroke="${frame}" stroke-width="6" stroke-linejoin="round"/>
  ${[pt(0, 0, 0), pt(1, 0, 0), pt(1, 1, 0), pt(0, 0, 1), pt(1, 0, 1), pt(1, 1, 1), pt(0, 1, 1)].map(([x, y]) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="${frame}" stroke="#4a4a55" stroke-width="1.5"/>`).join('')}
</svg>`
}
