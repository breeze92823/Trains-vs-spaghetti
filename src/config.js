// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'trains-vs-spaghetti' // slug registered on bloxity.io
export const GAME_TITLE = 'Bowling Roll'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The ground (world.js): one convex slab of land in a sea. The shoreline sweeps from
// the front edge (-Z) back toward +Z on both wings.
export const BEACH = {
  front: -46, // z of the shoreline at the front edge
  back: 90, // z of the back edge
  halfWidth: 75, // x extent of the wings
  wingZ: 24, // z of the shoreline at the far left/right ends
  gateEdge: 21.5, // half-width of the straight shoreline at the front edge
  depth: 4, // slab thickness above the sea floor
  tile: 18, // m per sand texture tile
  fenceHeight: 3, // invisible wall around the sand so nobody walks into the sea
}
export const WATER = { level: -0.6, size: 1400, color: '#12a9e6', shallow: '#7ff0ff' }
export const SPAWN = { x: 0, y: 0.4, z: 0 } // on the white spawn pad in the middle of the plaza
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0, toneMapping: 'neutral' } // 'neutral' keeps the saturated lego colours; 'aces' is filmic
export const FOG = { near: 220, far: 760 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#2a7ff2',
    horizon: '#bfe6ff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#d8c39a',
    hemiIntensity: 0.8,
    envIntensity: 0.45,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.33, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 17, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.0, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '100', type: 'number', min: 0, max: 100 },
  music_volume: { def: '80', type: 'number', min: 0, max: 100 },
  background_transparency: { def: '0.8', type: 'number', min: 0, max: 1 },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =============================================================================
// --- Lego hub (hub.js, hubProps.js, trains.js, hud.js, game.js) --------------
// =============================================================================
// Layout (metres, +X east, +Z south, north = -Z). The spawn plaza is at the
// origin; the gate to the train lane is north, the Titles/Railcars stalls and
// the RedRush/Ironheart ramps flank it, the Trains display climbs the west
// wall under the waterfalls, the treadmills line the east wall, and the
// leaderboards, Worlds portal and pumpkin stand along the south wall.

export const LEGO = { stud: 0.8 } // m per stud cell on every lego texture

export const COLORS = {
  grass: '#27cf1a',
  path: '#aea4a7',
  sand: '#f3d78f',
  white: '#f4f4f6',
  yellow: '#ffcc14',
  yellowDark: '#f2a900',
  dirt: '#8c431a',
  dirtDark: '#6c3214',
  dirtTan: '#dc8b3d',
  dirtFloor: '#7a3c18',
  wood: '#5c3519',
  woodLight: '#8b5a2e',
  trunk: '#94501f',
  leaf: '#33c823',
  leafDark: '#25a417',
  water: '#1d9bff',
  rail: '#8f8f97',
  sleeper: '#6e4120',
  ink: '#16161f',
}

export const HUB = {
  bounds: { west: -66, east: 66, north: -60, south: 52 }, // inner faces of the cliff walls
  wallHeight: 10,
  wallThick: 4,
  plateau: 14, // m of grass between the first cliff and the second, higher one
  tier2Height: 17,
  farGround: 420, // half-size of the high grass that runs to the horizon
  plaza: { radius: 17, ring: 6, border: 0.7 }, // octagon circumradius, gray path ring width, yellow rim width
  spawnPad: 12,
  gate: { halfGap: 9, pillar: 3.6, height: 15, beamBottom: 11, beamTop: 14, laneLength: 52 },
  // Ground zones, axis-aligned rectangles [x0, z0, x1, z1] of gray path.
  paths: [
    [-6, -60, 6, -22], // north: plaza -> gate
    [-46, -58, 46, -46], // in front of the north wall (stalls, ramps, gate)
    [-6, 22, 6, 34], // south: plaza -> leaderboards / Worlds
    [-40, 32, 44, 46], // along the south wall
    [-34, -6, -22, 6], // west: plaza -> Trains display
    [22, -6, 44, 6], // east: plaza -> treadmills
    [38, -52, 48, 32], // in front of the treadmills
  ],
  chevrons: { from: -25, step: 3.8, count: 5, width: 9 }, // white arrows on the north path, pointing at the gate
  // Waterfalls down the cliff faces; `at` is the position along that face.
  waterfalls: [
    { face: 'west', at: -18, width: 5 },
    { face: 'west', at: -3, width: 5 },
    { face: 'west', at: 12, width: 5 },
    { face: 'north', at: -50, width: 4.5 },
  ],
  pool: { width: 5.5, z0: -26, z1: 20 }, // water channel along the west cliff foot, under the falls
  fences: [
    [22, -57.6, 46, -57.6],
    [31, 50.4, 50, 50.4],
    [-46, -57.6, -42, -57.6],
  ],
  // Lamp posts: [x, z, night light?]
  lamps: [
    [47, -52, true],
    [47, 27, true],
    [-1, 46, true],
    [-18, 46, false],
    [30, 49, false],
    [-43, -53, false],
  ],
  treeSeed: 77,
  trees: 22,
}

// Ramps beside the gate: the best trains in the shop on a yellow launch ramp. They sit
// past the last display train (power 3500 for 2.5M wins, ~700 wins per power): RedRush is
// 2x its power (7000) and Ironheart 8x (28000), priced at the same ~700 / ~900 wins per
// power. Bought with hold E like the display trains (shop.js), but need no lower train.
export const RAMPS = [
  { name: 'RedRush', mult: 2, wins: 5000000, power: 7000, x: -15, z: -50, side: -1, tag: '#ff3b3b', swirl: { color: '#ffffff', additive: true }, train: { kind: 'bullet', body: '#e8242c', stripe: '#ffd23a', window: '#1a1a24' } },
  { name: 'Ironheart', mult: 8, wins: 25000000, power: 28000, x: 15, z: -50, side: 1, tag: '#3dff4a', swirl: { color: '#1a1d14', additive: false }, train: { kind: 'diesel', body: '#2c6b2a', stripe: '#f4d23a', roof: '#232323' } },
]

// Stalls north-west of the plaza.
export const STALLS = [
  { name: 'Titles', opens: 'titles', x: -36, z: -48, stripe: '#2f8cff', mat: '#2ad6ff', labelColor: '#e7d6ff', labelOutline: '#4b1a8c' },
  { name: 'Railcars', opens: 'railcars', x: -24, z: -50.5, stripe: '#ff2a2a', mat: '#ff3030', labelColor: '#c9a8ff', labelOutline: '#3a1470', lock: 1 },
]

// Treadmills along the east wall, north to south. cost = rebirths needed, price = paid unlock.
export const TREADMILL = { x0: 49, x1: 61, width: 7, rise: 1.5, z: [-46, -35, -24, -13, -2, 9, 20], belt: 1.6 }
export const TREADMILLS = [
  { mult: 1, cost: 0, frame: '#f2f2f4', bar: '#ffd21a', belt: 'plain', rail: '#8f8f97' },
  { mult: 2, cost: 2, frame: '#7fc0ff', bar: '#ff8f2a', belt: 'water', rail: '#8f8f97' },
  { mult: 4, cost: 4, frame: '#ff2424', bar: '#ffd36a', belt: 'waves', rail: '#7d7d85' },
  { mult: 6, cost: 6, frame: '#ffd21a', bar: '#ff9a2a', belt: 'planks', rail: '#ff9a2a' },
  { mult: 10, cost: 10, frame: '#2aa6ff', bar: '#3bd14a', belt: 'ice', rail: '#ff3a3a' },
  { mult: 25, price: 169, frame: '#8a2ad8', bar: '#f2f2f4', belt: 'void', rail: '#f2f2f4', glow: '#c04bff' },
  { mult: 100, price: 839, frame: '#c9f6ff', bar: '#8fe9ff', belt: 'glow', rail: '#ffffff', glow: '#7ff3ff' },
]

// The Trains display on the west side: three tiers of five, front row first. Seen from
// the plaza the cheapest train of a row is on the left (south, +Z).
export const DISPLAY = {
  front: -34, depth: 7.5, rise: 2.0, base: 1.2, z0: -16, dz: 8, halfWidth: 21, back: -60, stairWidth: 5,
  padInset: 3.4, padW: 3.2, padL: 6.0, padTop: 0.38, trainScale: 1.1, // a train's plinth: centre behind the tier edge, size, top height
}
// The train shop: every display train is bought for `wins` and then equipped (the
// player drives it). `power` is what the equipped train earns per treadmill payout at
// 1x (before rebirth / title / railcar multipliers). `aura`: the rarity glow + sparkles.
// Indices run row by row (0 = the red starter); the prompt calls them "Train <i + 1>".
export const DISPLAY_TRAINS = [
  [
    { wins: 0, power: 1, train: { kind: 'steam', body: '#d8352a', boiler: '#2a2a30', trim: '#ff8a2a', wheel: '#c4302a', roof: '#3a1a14' } },
    { wins: 1, power: 2, train: { kind: 'steam', body: '#2f8f3a', boiler: '#1e1e22', trim: '#43c94f', wheel: '#2f8f3a', roof: '#1e1e22' } },
    { wins: 5, power: 5, train: { kind: 'steam', body: '#2456d8', boiler: '#1c2a4a', trim: '#5fa0ff', wheel: '#2456d8', roof: '#111827' } },
    { wins: 25, power: 10, aura: '#ffd21a', train: { kind: 'shunter', body: '#f2c21a', stripe: '#1a1a1a' } },
    { wins: 100, power: 25, aura: '#a64dff', train: { kind: 'modern', body: '#5a2ad0', stripe: '#9a6aff', window: '#14142a' } },
  ],
  [
    { wins: 250, power: 50, aura: '#4fe8ff', train: { kind: 'modern', body: '#1ab3c4', stripe: '#0f3d55', window: '#0d1a24' } },
    { wins: 750, power: 100, aura: '#b06bff', train: { kind: 'bullet', body: '#8a4dff', stripe: '#d0b8ff', window: '#1a1430' } },
    { wins: 2500, power: 150, aura: '#ff7ab0', train: { kind: 'bullet', body: '#ff6fa0', stripe: '#ffffff', window: '#2a1424' } },
    { wins: 7500, power: 250, aura: '#ffffff', train: { kind: 'bullet', body: '#d9dbe2', stripe: '#7a7f8c', window: '#1a1c24' } },
    { wins: 25000, power: 400, aura: '#7dff5a', train: { kind: 'diesel', body: '#2c6b2a', stripe: '#f4d23a', roof: '#232323' } },
  ],
  [
    { wins: 50000, power: 700, aura: '#9fe6ff', train: { kind: 'modern', body: '#bfe8ff', stripe: '#2a6fd0', window: '#0f1a2a' } },
    { wins: 100000, power: 1000, aura: '#8a8aff', train: { kind: 'diesel', body: '#1c1d22', stripe: '#6c6f7a', roof: '#0d0d10' } },
    { wins: 250000, power: 1500, aura: '#3f8cff', train: { kind: 'bullet', body: '#2456ff', stripe: '#8fd0ff', window: '#0d1430' } },
    { wins: 750000, power: 2500, aura: '#ff9a2a', train: { kind: 'diesel', body: '#c86a1a', stripe: '#3a2a12', roof: '#2a1a0d', camo: true } },
    { wins: 2500000, power: 3500, aura: '#ff4a2a', train: { kind: 'modern', body: '#e2361f', stripe: '#ff9a2a', window: '#24100c' } },
  ],
]
export const SHOP = {
  holdTime: 2, // s E (or a finger on the prompt) is held to buy / equip
  range: 5.5, // m from a pad's centre (horizontal) within which its prompt shows
  reachY: 3, // m of height difference still in reach (a tier above or below)
  startOwned: [0], // train indices a fresh save owns
  startTrain: 0, // equipped on a fresh save (the red starter, power 1: the 1x belt pays +1 at rebirth 0)
  pad: { owned: '#2f7cff', equipped: '#33d14a', locked: '#ff3b3b' }, // pad top colour by state
}

// South wall: the three leaderboards in a cliff alcove, the Worlds portal and the pumpkin.
export const LEADERBOARDS = {
  x: 15, width: 26, depth: 7, // alcove centre x, opening width, how far it cuts into the wall
  boards: [
    { title: 'Top Rebirths', header: '#46d35a', stat: 'rebirths' },
    { title: 'Top Wins', header: '#e6e8ee', stat: 'wins' },
    { title: 'Top Playtime', header: '#ffd21a', stat: 'playtime' },
  ],
}
export const WORLDS_PORTAL = { x: -10, z: 47 }
export const PUMPKIN = { x: -23, z: 45, radius: 2.6 }

// The player's own train (the avatar) is the equipped shop train (SHOP / DISPLAY_TRAINS);
// this is the fallback model and the chimney smoke colour.
export const PLAYER_TRAIN = { kind: 'steam', body: '#2f8f3a', boiler: '#1e1e22', trim: '#43c94f', wheel: '#2f8f3a', roof: '#1e1e22', smoke: '#c9ffd8' }
export const OFFLINE_NAME = 'ashanmwick2018' // name tag when there is no Bloxity user (dev / offline)

// A brand-new player: level 1, xp matches the 1 power. Saves live on the server only.
export const START_STATE = { power: 1, level: 1, xp: 1, wins: 0, rebirths: 0 }
export const levelXp = (level) => 50 * level // xp needed to finish `level` (1 -> 50)
export const POWER_GAIN = { tick: 0.7 } // s between treadmill payouts; each pays the equipped train's power x the belt's mult

// Training (training.js): rolling onto an unlocked treadmill locks the train onto the belt,
// nose up the slope, running in place until the player steers away or jumps.
export const TRAINING = {
  hold: 1.4, // m up-slope of the belt centre where the train runs
  pull: 7, // 1/s: how hard the train is drawn to that spot
  maxPull: 9, // m/s cap on that pull
  release: 0.45, // steering input (0..1) away from the headboard that lets go
  wheelSpeed: 11, // m/s the wheels turn while running in place
  bob: 0.045, // m the train bounces on its springs
  bobRate: 22, // rad/s of that bounce
  pitchEase: 8, // 1/s: tilting onto / off the slope
  // White wind streaks rushing past the train's sides.
  streaks: { count: 16, speed: 15, length: [1.4, 3.2], width: 0.06, opacity: 0.7, front: 3.2, back: -5.5, side: [1.15, 2.1], height: [0.35, 2.7] },
  // Thicker chimney smoke while training (on top of the idle puffs).
  smoke: { count: 44, life: 1.2, velocity: [0, 3.2, -2.6], spread: [0.5, 0.6, 0.6], size: 0.5, grow: 2.8, opacity: 0.16, intensity: 0.55 },
  // "+N" pops: scattered around the train on screen (fractions of the view), rising this far (reference px).
  pop: { spreadX: 0.11, spreadY: 0.07, offsetY: 0.02, rise: 330 },
}

// --- Titles (Titles window, ui/titles.js) ---------------------------------------------
// One title is equipped at a time and multiplies power gains by `mult`. Bought with wins
// (spent) or gems (`gems`, the premium price). Only the Unequip row is free; nothing is owned or equipped at the start.
// Rows marked `guess` were not in the reference screenshots (gaps in the scrolled list);
// their name / price / colour fill the gap between their neighbours.
export const TITLES = [
  { id: 'rookie', name: 'Rookie', color: '#45e03c', mult: 1.2, wins: 10, gems: 2 },
  { id: 'fireman', name: 'Fireman', color: '#ff4a1c', mult: 1.4, wins: 30, gems: 6 },
  { id: 'conductor', name: 'Conductor', color: '#ffd21a', mult: 1.6, wins: 150, gems: 15, guess: true },
  { id: 'express', name: 'Express', color: '#4d33ff', mult: 1.8, wins: 500, gems: 25 },
  { id: 'railConqueror', name: 'Rail Conqueror', color: '#ff7a1a', mult: 2, wins: 2500, gems: 29 },
  { id: 'spaghettiStorm', name: 'Spaghetti Storm', color: '#ff2a55', mult: 2.2, wins: 5000, gems: 39 },
  { id: 'turboTracker', name: 'Turbo Tracker', color: '#2ab8ff', mult: 2.4, wins: 25e3, gems: 69, guess: true },
  { id: 'steelTitan', name: 'Steel Titan', color: '#2f5cff', mult: 2.6, wins: 75e3, gems: 105 },
  { id: 'supersonic', name: 'Supersonic', color: '#25d6c2', mult: 2.8, wins: 250e3, gems: 159 },
  { id: 'railMaster', name: 'Rail Master', color: '#ff6a0c', mult: 3, wins: 1e6, gems: 215 },
  { id: 'steamBaron', name: 'Steam Baron', color: '#8a3aff', mult: 3.5, wins: 5e6, gems: 299, guess: true },
  { id: 'thunderRail', name: 'Thunder Rail', color: '#3ac8ff', mult: 4, wins: 15e6, gems: 399, guess: true },
  { id: 'ironDuke', name: 'Iron Duke', color: '#ff3ac0', mult: 4.5, wins: 50e6, gems: 599, guess: true },
  { id: 'trackTycoon', name: 'Track Tycoon', color: '#ffd21a', mult: 5, wins: 100e6, gems: 899, guess: true },
  { id: 'fullSteam', name: 'Full Steam', color: '#ff3d2e', mult: 6, wins: 250e6, gems: 1199 },
  { id: 'steamOverdrive', name: 'Steam Overdrive', color: '#ff9a2e', mult: 7, wins: 750e6, gems: 1399 },
  { id: 'expressLegend', name: 'Express Legend', color: '#eef02a', mult: 8, wins: 2e9, gems: 1599 },
  { id: 'railKing', name: 'Rail King', color: '#72ff2e', mult: 9, wins: 5e9, gems: 1799 },
  { id: 'eliteConductor', name: 'Elite Conductor', color: '#5cff3a', mult: 10, wins: 15e9, gems: 1999 },
  { id: 'spaghettiSlayer', name: 'Spaghetti Slayer', color: '#c43aff', mult: 12, wins: 50e9, gems: 2499, guess: true },
  { id: 'pastaCrusher', name: 'Pasta Crusher', color: '#ff5a8a', mult: 15, wins: 150e9, gems: 2999, guess: true },
  { id: 'ironMonarch', name: 'Iron Monarch', color: '#3affc8', mult: 18, wins: 500e9, gems: 3499, guess: true },
  { id: 'trackTitan', name: 'Track Titan', color: '#ff8a2a', mult: 22, wins: 1.5e12, gems: 3999, guess: true },
  { id: 'railOverlord', name: 'Rail Overlord', color: '#4a40ff', mult: 26, wins: 5e12, gems: 4999 },
  { id: 'railSovereign', name: 'Rail Sovereign', color: '#a23aff', mult: 30, wins: 15e12, gems: 5999 },
  { id: 'expressEmperor', name: 'Express Emperor', color: '#ff3cff', mult: 35, wins: 50e12, gems: 6999 },
  { id: 'cosmicExpress', name: 'Cosmic Express', color: '#3ad8ff', mult: 40, wins: 150e12, gems: 7999, guess: true },
  { id: 'eternalEngine', name: 'Eternal Engine', color: '#ffd23a', mult: 45, wins: 500e12, gems: 8999, guess: true },
  { id: 'infiniteExpress', name: 'Infinite Express', color: '#ff6a4c', mult: 50, wins: 1.5e15, gems: 9999 },
  { id: 'apexOverlord', name: 'Apex Overlord', color: '#ffb22e', mult: 60, wins: 5e15, gems: 11999 },
  { id: 'immortalExpress', name: 'Immortal Express', color: '#d8f03a', mult: 75, wins: 15e15, gems: 14999 },
]

// --- Rebirth (Rebirth window, ui/rebirth.js) -------------------------------------------
// Rebirth n -> n + 1 needs level(n); it resets power, level and xp (wins, titles,
// railcars and quests stay) and sets the rebirth power multiplier to mult(n + 1).
// Skip Rebirth (gems) rebirths without the level and keeps power + level.
export const REBIRTH = {
  level: (n) => 10 * (n + 1),
  mult: (n) => n + 1,
  skipGems: (n) => 35 * (n + 1),
}

// --- Daily quests (Quests window, ui/quests.js) ----------------------------------------
// One easy / medium / hard quest a day (UTC), picked from these pools by the day number.
// kind = what counts (game.js questEvent): 'run' (the train enters the lane), 'seconds'
// (time played), 'wall' (walls smashed), 'reward' (reward pads), 'power' (power earned).
// reward: `pct` of the current power / wins, at least `min`. skip = gem price.
export const QUESTS = {
  tiers: [
    { id: 'easy', label: 'EASY', top: '#d6f75c', bottom: '#38d93c', border: '#eaffc8', reward: { type: 'power', pct: 0.1, min: 100 }, skip: 6 },
    { id: 'medium', label: 'MEDIUM', top: '#ffe24a', bottom: '#ff9124', border: '#fff1c0', reward: { type: 'wins', pct: 0.25, min: 10 }, skip: 19 },
    { id: 'hard', label: 'HARD', top: '#ff9d9d', bottom: '#ff3246', border: '#ffd8dc', reward: { type: 'power', pct: 0.5, min: 500 }, skip: 39 },
  ],
  pools: {
    easy: [
      { kind: 'run', goal: 20, text: 'Start 20 Runs' },
      { kind: 'wall', goal: 25, text: 'Break 25 Walls' },
      { kind: 'seconds', goal: 300, text: 'Play 5 Minutes' },
      { kind: 'power', goal: 500, text: 'Earn 500 Power' },
    ],
    medium: [
      { kind: 'seconds', goal: 900, text: 'Play 15 Minutes' },
      { kind: 'wall', goal: 300, text: 'Break 300 Walls' },
      { kind: 'run', goal: 60, text: 'Start 60 Runs' },
      { kind: 'reward', goal: 5, text: 'Claim 5 Rewards' },
    ],
    hard: [
      { kind: 'wall', goal: 5000, text: 'Break 5,000 Walls' },
      { kind: 'seconds', goal: 2700, text: 'Play 45 Minutes' },
      { kind: 'run', goal: 200, text: 'Start 200 Runs' },
      { kind: 'reward', goal: 25, text: 'Claim 25 Rewards' },
    ],
  },
}

// --- Railcars (Railcars window, ui/railcars.js; wagons.js draws them) --------------------
// Containers are bought with wins (or gems) and open into one railcar from their pool
// (odds in %). Railcars hook on behind the train; each attached one adds (mult - 1) to the
// power multiplier, and the best `maxAttached` are attached automatically. Stock refills
// every `restock` s with a random amount in `stock` (the same for everyone in that period).
// Wagon kinds (wagons.js): 'gondola' | 'container' | 'coach' | 'tanker' | 'hopper';
// `look` = the container art (shop picture + the box on a container flatcar).
export const RAILCARS = { restock: 300, maxAttached: 3, gap: 0.45, unlockRebirths: 1 }
export const RARITY = {
  OP: { color: '#ff2a2a', outline: '#ffffff' },
  Common: { color: '#bdbdbd' },
  Uncommon: { color: '#3ee23a' },
  Rare: { color: '#2f7bff' },
  Epic: { color: '#b24aff' },
  Legendary: { color: '#ffc21a' },
  Mythic: { color: '#ff3ab0' },
}
export const RAILCAR_TYPES = {
  blueGondola: { name: 'Blue Gondola', rarity: 'Common', kind: 'gondola', color: '#2f7bff', mult: 1.2 },
  cargoFlat: { name: 'Cargo Flatcar', rarity: 'Common', kind: 'container', look: 'cargo', mult: 1.3 },
  greenGondola: { name: 'Green Gondola', rarity: 'Uncommon', kind: 'gondola', color: '#2f9a3a', mult: 1.5 },
  orangeGondola: { name: 'Orange Gondola', rarity: 'Uncommon', kind: 'gondola', color: '#ff7a1a', mult: 1.5 },
  industrialFlat: { name: 'Industrial Flatcar', rarity: 'Uncommon', kind: 'container', look: 'industrial', mult: 1.7 },
  steelHopper: { name: 'Steel Hopper', rarity: 'Rare', kind: 'hopper', color: '#8f96a3', mult: 2 },
  greenHopper: { name: 'Green Hopper', rarity: 'Rare', kind: 'hopper', color: '#1f9a55', mult: 2.2 },
  recyclingFlat: { name: 'Recycling Flatcar', rarity: 'Rare', kind: 'container', look: 'recycling', mult: 2.5 },
  silverTanker: { name: 'Silver Tanker', rarity: 'Epic', kind: 'tanker', color: '#c9ced8', mult: 3 },
  racingCoach: { name: 'Racing Coach', rarity: 'Epic', kind: 'coach', color: '#2a2a33', stripe: '#ff2a3a', mult: 3.5 },
  automotiveFlat: { name: 'Automotive Flatcar', rarity: 'Epic', kind: 'container', look: 'automotive', mult: 4 },
  redExpress: { name: 'Red Express Coach', rarity: 'Legendary', kind: 'coach', color: '#e8262f', stripe: '#ffffff', mult: 6 },
  galaxyCoach: { name: 'Galaxy Coach', rarity: 'Legendary', kind: 'coach', color: '#3a1a9a', stripe: '#c04bff', mult: 8 },
  cosmicFlat: { name: 'Cosmic Flatcar', rarity: 'Legendary', kind: 'container', look: 'cosmic', mult: 10 },
  voidTanker: { name: 'Void Tanker', rarity: 'Mythic', kind: 'tanker', color: '#24123f', mult: 15 },
  foodFlat: { name: 'Food Flatcar', rarity: 'Legendary', kind: 'container', look: 'food', mult: 20 },
  pastaTanker: { name: 'Pasta Tanker', rarity: 'Legendary', kind: 'tanker', color: '#ffcf3a', mult: 25 },
  spaghettiExpress: { name: 'Spaghetti Express', rarity: 'Mythic', kind: 'coach', color: '#ff3a2a', stripe: '#ffd23a', mult: 40 },
  desertFlat: { name: 'Desert Flatcar', rarity: 'OP', kind: 'container', look: 'desert', mult: 5 },
}
export const CONTAINERS = [
  { id: 'desert', name: 'Desert Container', rarity: 'OP', look: 'desert', gems: 59, single: true, pool: [['desertFlat', 100]] },
  { id: 'cargo', name: 'Cargo Container', rarity: 'Common', look: 'cargo', wins: 50, stock: [1, 3], pool: [['blueGondola', 60], ['cargoFlat', 30], ['greenGondola', 10]] },
  { id: 'industrial', name: 'Industrial Container', rarity: 'Uncommon', look: 'industrial', wins: 1500, stock: [1, 3], pool: [['orangeGondola', 55], ['industrialFlat', 35], ['steelHopper', 10]] },
  { id: 'recycling', name: 'Recycling Container', rarity: 'Rare', look: 'recycling', wins: 25e3, stock: [0, 2], pool: [['greenHopper', 60], ['recyclingFlat', 32], ['silverTanker', 8]] },
  { id: 'automotive', name: 'Automotive Container', rarity: 'Epic', look: 'automotive', wins: 300e3, stock: [0, 2], pool: [['racingCoach', 60], ['automotiveFlat', 32], ['redExpress', 8]] },
  { id: 'cosmic', name: 'Cosmic Container', rarity: 'Legendary', look: 'cosmic', wins: 4e6, stock: [0, 2], pool: [['galaxyCoach', 60], ['cosmicFlat', 35], ['voidTanker', 5]] },
  { id: 'food', name: 'Food Container', rarity: 'Legendary', look: 'food', wins: 35e6, stock: [0, 2], pool: [['foodFlat', 60], ['pastaTanker', 35], ['spaghettiExpress', 5]] },
]

// --- Settings window (ui/settings.js) --------------------------------------------------
export const GAME_VERSION = 'v1.1.4'
export const GAME_SETTINGS = [
  { key: 'music', label: 'Music' },
  { key: 'sfx', label: 'Sound effects' },
  { key: 'trainSfx', label: 'Train sounds' },
  { key: 'hud', label: 'Show HUD' },
  { key: 'wagons', label: "Other players' wagons" },
  { key: 'vfx', label: 'Visual effects' },
]

// --- The train lane (lane.js), north through the gate --------------------------------
// A white studded tunnel with a green floor and a track down the middle. Yellow brick
// walls block it: `hp` is the power needed to smash straight through; a weaker train
// knocks `power` off the wall per ram and bounces back. Every few walls the tunnel
// opens into a room with a treadmill (west) and a reward pad (east), then narrows
// between two blue blocks to the next wall. Broken walls rebuild once the train is
// back in the hub.
// Rooms of the lane, generated: 72 m per room (wall, gap, a 42 m room and its 7 m passage).
const LANE_ROOM_COUNT = 100
const LANE_ROOMS = Array.from({ length: LANE_ROOM_COUNT }, (_, i) => {
  const z0 = -110 - 72 * i
  const j = i - 3
  const wins = i < 3 ? [1, 2, 5][i] : [1, 2.5, 5][j % 3] * 10 ** (1 + Math.floor(j / 3))
  return { z0, z1: z0 - 42, halfWidth: 24, treadmill: 0, /* every lane room has the 1x belt */ reward: { mult: wins, wins } }
})

// Invite-friends benefit: each friend of the player currently in the same room adds this much to
// every power gain (shown as "Friend boost +N%" in the HUD).
export const FRIEND_BOOST = { perFriend: 0.1, max: 5 }

export const LANE = {
  halfWidth: 8, // tunnel inner half-width (the gate opening is HUB.gate.halfGap)
  outer: 11, // tunnel walls run from halfWidth to here (the hub's plateau gap)
  height: 16.5, // inner height; the ceiling slab tops out at HUB.tier2Height
  start: -60.5, // z just inside the gate
  end: -110 - 72 * 99 - 42 - 7 - 15, // past the last room's passage // z of the closing wall
  speedScale: 2.2, // train speed multiplier inside the lane
  smashPower: 2, // power (and xp) per wall smashed
  ramCooldown: 0.6, // s between rams on a wall that holds
  knockback: 15, // m/s the train bounces back off a wall that holds
  // Entering the lane the train slides onto the track and drives itself north along it until
  // it stops: a wall holds, or it is blocked (speed under stallSpeed m/s for stallTime s, after
  // grace s). Pushing the stick / WASD past `release` anywhere but up the track hands control to
  // the player; letting go (or pushing up the track) within `snap` m of the track steps the
  // train back onto it and the run carries on. After a wall holds or a stall it waits for a key.
  // pull: 1/s the sideways slide toward the track centre, maxSide: m/s cap on that slide.
  autoRun: { stallSpeed: 1.5, stallTime: 0.4, grace: 0.8, release: 0.25, snap: 3, pull: 5, maxSide: 7 },
  // The centre track. Rails at +-halfGauge (the trains' wheels are 0.66-0.68 m off centre),
  // railTop m high: a train over them rides on the rails (lifted from `lift[0]` m off centre,
  // fully down on the floor past `lift[1]`).
  track: { halfGauge: 0.67, railTop: 0.4, sleeperWidth: 2.3, lift: [0.2, 0.75] },
  // The walls are stacked spaghetti: long square yellow sticks in layers, end to end in
  // random lengths with ragged ends, two rows deep, each layer a little narrower (a
  // stepped heap). On a smash every stick becomes a Rapier body and flies.
  stick: { height: 0.45, depth: 0.62, rowsDeep: 2, layers: 10, minLen: 2.2, maxLen: 5.4, bottom: 16, top: 6.5, colors: ['#ffe81a', '#ffd60a', '#fff04a', '#ffdf00'] },
  debris: { life: 7, max: 420, push: 15, spin: 9, density: 0.35, friction: 0.75, restitution: 0.22 },
  hitStop: { duration: 0.075, scale: 0.06 }, // s of near-freeze on every smash (the "crunch" frame)
  fovKick: 9, // degrees the view punches out on a smash
  comboWindow: 3.5, // s between smashes that keeps a combo going
  // 100 rooms, each with a spaghetti wall in front of it. Every reward pad pays more than the
  // last (+1, +2, +5, +10, +25, +50, +100, +250 ...), the walls get ~2.5x tougher per room, and
  // touching a pad pays out, then sends the train back to the hub after `respawnDelay` s.
  walls: LANE_ROOMS.map((r, i) => ({ z: r.z0 + 15, hp: Math.round(5 * 2.5 ** i) })),
  rooms: LANE_ROOMS,
  respawnDelay: 0.9,
  passage: 7, // m of blue blocks narrowing a room back to the tunnel
  colors: { wall: '#e6ecf4', block: '#c4d8ef', floor: '#2fd61f' },
}

// --- Audio (audio/) -------------------------------------------------------------------
// Everything is synthesised (no files). Buses feed a glue compressor and a limiter.
export const AUDIO = {
  volume: 0.8,
  storageKey: 'trains-vs-spaghetti.sound',
  buses: { ui: 0.75, sfx: 0.95, amb: 0.5, engine: 0.55 },
  duck: 0.45,
  maxVoices: 56, // one-shot sounds at once before low-priority ones are skipped
  maxVoicesTouch: 28,
  latency: 0.04, // AudioContext latencyHint (s)
  latencyTouch: 0.07,
  lead: 0.02, // s every one-shot is scheduled ahead
  // Generated impulse response: a hard, close room (the tunnel) with a short tail.
  reverb: { seconds: 1.6, preDelay: 0.008, early: [[11, 0.55], [23, 0.42], [37, 0.3], [58, 0.22], [83, 0.14]], decay: 1.1, tail: 0.2, darken: 1.8, send: 0.8 },
  clatterPerSecond: 14, // stick-on-floor clicks allowed per second
  chuffEvery: 1.7, // m travelled per steam chuff (the lane's speed makes it race)
  // The player's train (audio/train.js): an engine voice per kind, wheel roar, rail-joint
  // clacks, brake squeal, air hiss, horn and the wind at the driver's window. They all go
  // through one 3D panner at the train (heard from the camera); Settings > Train sounds.
  train: {
    level: 1, // master gain of the train bus
    topSpeed: 30, // m/s that counts as full speed (the lane races at walkSpeed x 2.2)
    joint: 3.2, // m between rail joints (one clack-clack per joint)
    wheelbase: 1.1, // m between the two axles that hit each joint
    panner: { refDistance: 7, rolloff: 0.7, maxDistance: 80 },
    hornCooldown: 9, // s between departure horns
    squeal: { decel: 2.2, curve: 5 }, // m/s of shed speed / turn rate x speed that start the brake / flange squeal
  },
}

// --- The driver (driver.js): the player's Bloxity avatar in the cab --------------------
// Stands at the cab's open side window (trains.js userData.cab), drives (hands on the
// controls, sways with acceleration, braking and curves, bounces on the rail joints),
// glances around, and leans out of the window (+X side) to look down the line: on
// departure, on stopping (with a wave), entering the lane and every so often at speed.
export const DRIVER = {
  scale: 0.52, // of the 1.8 m avatar: a toy driver for a toy cab
  inertia: 0.6, // s the "felt" speed lags the real one (acceleration / braking sway)
  stopSpeed: 0.4, // m/s counted as stopped
  departAfter: 1.4, // s stopped before moving off counts as a departure (horn + lean out)
  stopFrom: 3.5, // m/s peak needed for a stop to count (hiss + wave)
  cruiseLean: [9, 16], // s at speed between lean-outs (random in range)
  leanFor: { depart: 3.4, stop: 2.6, lane: 4, cruise: [2.8, 4.6] }, // s out of the window
  // Waist + chest tilt out (kept under ~45 deg in all so the outer shoulder stays above the
  // sill), hips this far inside the wall and above the sill, head counter-tilt (0..1).
  lean: { roll: deg(28), roll2: deg(15), hipInset: 0.1, sillLift: 0.03, level: 0.55 },
  spring: { stiffness: 70, damping: 0.62 }, // lean in/out (damping < 1 overshoots a hair)
  sway: { accel: deg(7), brake: deg(10), curve: deg(9), vibrate: 0.003 },
  bump: { kick: 0.035, stiffness: 260, damping: 0.35 }, // rail-joint bounce (m)
  glance: { every: [3.5, 8], hold: [0.8, 1.6], yaw: deg(55) },
  // Poses (character space, radians; see avatar/rig.js): the inner hand on the regulator,
  // the window hand on the brake inside and on the sill outside, a wave when stopping.
  pose: {
    driveR: { ArmR1: { x: deg(-62), z: deg(-6) }, ArmR2: { x: deg(-40) } },
    driveL: { ArmL1: { x: deg(-55), z: deg(10) }, ArmL2: { x: deg(-35) } },
    sill: { ArmL1: { x: deg(-78), z: deg(28) }, ArmL2: { x: deg(-30) } }, // outside: reaching forward for the window frame
    wave: { ArmL1: { x: deg(-12), z: deg(212) }, ArmL2: { x: deg(-25) } }, // arm raised high out of the window, swung from the shoulder
    throttle: deg(22), // the regulator arm pulls back this far at full acceleration
  },
}
