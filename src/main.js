import { ACESFilmicToneMapping, Clock, Group, NeutralToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { CAMERA, graphicsPreset, LANE, OFFLINE_NAME, PLAYER_TRAIN, RENDER, STALLS, TRAINING } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { makeClouds } from './world.js'
import { buildHub } from './hub.js'
import { buildProps } from './hubProps.js'
import { buildLane } from './lane.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { createEmitter, setParticleDensity, updateParticles } from './particles.js'
import { buildTrain, spinWheels } from './trains.js'
import { sign } from './signs.js'
import { createHud } from './hud.js'
import { buildShop, mountPlayerTrain } from './shop.js'
import { createTraining } from './training.js'
import { attachedRailcars, canRebirth, claimableQuests, createTreadmillTracker, formatNumber, onState, questEvent, railcarsUnlocked, setAutopilot, state, titleById } from './game.js'
import { closeTopWindow, setWindowReserved } from './ui/window.js'
import { createTitles } from './ui/titles.js'
import { createRebirthWindow } from './ui/rebirth.js'
import { createQuests } from './ui/quests.js'
import { createSettings } from './ui/settings.js'
import { createRailcars } from './ui/railcars.js'
import { createWagons } from './wagons.js'
import * as sfx from './audio/sfx.js'
import { hiss, horn, setTrainSoundsEnabled, updateTrainSounds } from './audio/train.js'
import { createDriver } from './driver.js'
import { startOnline } from './online.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> sky + lighting,
// the lego hub (ground, cliffs, props) + colliders, player body + train ->
// HUD -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null

function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    setParticleDensity(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()
sfx.installAudio() // the AudioContext starts on the first tap / key (autoplay rules)

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = RENDER.toneMapping === 'aces' ? ACESFilmicToneMapping : NeutralToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => closeTopWindow() || bloxity.showMenu(), renderer.domElement) // Esc closes a window, else opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
scene.add(camera) // the lane's speed lines ride on it
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + world ----------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
scene.add(makeClouds())
bloxity.loadingStep('Building the hub')
const hub = buildHub(scene)
const props = buildProps(scene)
// The lane's callbacks reach the HUD, which is created below.
const lane = buildLane(scene, camera, {
  onSmash: (amount, w, combo, big) => {
    popAtTrain(amount, 'bolt')
    hud.flash(big)
    hud.combo(combo)
    hud.bumpPower()
  },
  onHold: (w) => hud.toast(`LEVEL ${w.level} holds! ${formatNumber(w.hpNow)} HP left`),
  onReward: (r) => {
    popAtTrain(r.wins, 'trophy')
    hud.toast(`x${r.mult} REWARD  +${formatNumber(r.wins)} Wins!`)
    setTimeout(respawn, LANE.respawnDelay * 1000) // back to the hub
  },
})
for (const [x, y, z] of hub.lampBulbs) lighting.addLamp(x, y, z, {})
createPlayerBody()
syncYawToPlayer()

// --- The player's train ---------------------------------------------------------
const playerGroup = new Group()
scene.add(playerGroup)
let railLift = 0 // m the train is raised to ride on the lane track's rails (lane.trackLift, smoothed)
// `train` holds the equipped shop train's model (swapped on equip, shop.js) with its smoke;
// the loop turns, pitches and bobs the holder.
const train = new Group()
playerGroup.add(train)
mountPlayerTrain(scene, train)
// The player's Bloxity avatar drives it from the cab (driver.js); its moves cue the horn
// on departure and the brake hiss on stopping (audio/train.js).
const driver = createDriver(train, { onDepart: (kind) => (horn(kind), online?.action('horn')), onStop: (peak, kind) => hiss(peak, kind) })
const driverBump = (k, delay) => driver.bump(k, delay)

// Name tag: the equipped title (its colour) over "@name" over "Level N".
const playerName = () => {
  const n = bloxity.displayName()
  return n === 'Offline' ? OFFLINE_NAME : n
}
const tagLines = () => [
  ...(titleById(state.title) ? [{ text: titleById(state.title).name, color: titleById(state.title).color, size: 0.62 }] : []),
  { text: `@${playerName()}`, color: '#ffffff', size: 0.62 },
  { text: `Level ${state.level}`, color: ['#ffe86a', '#ffb51a'], size: 0.7 },
]
const tag = sign(tagLines(), 0.55, { depthTest: false, renderOrder: 10, outline: 10 })
tag.position.y = 3.3
playerGroup.add(tag)
let tagLevel = state.level
bloxity.subscribeAuth(() => tag.setLines(tagLines()))
const screen = new Vector3()
// Pops "+N <icon>" just right of the train on screen. scatter: a treadmill payout,
// dropped at a random spot around the train and floating up higher (TRAINING.pop).
function popAtTrain(amount, icon, scatter = false) {
  screen.set(player.renderPosition.x, player.renderPosition.y + 2.2, player.renderPosition.z).project(camera)
  const w = window.innerWidth
  const h = window.innerHeight
  let x = (screen.x * 0.5 + 0.5) * w
  let y = (-screen.y * 0.5 + 0.5) * h
  if (scatter) {
    const P = TRAINING.pop
    const side = Math.random() < 0.5 ? -1 : 1
    x += side * (0.04 + Math.random() * P.spreadX) * w
    y += (P.offsetY + (Math.random() * 2 - 1) * P.spreadY) * h
    hud.pop(amount, x, y, icon, P.rise)
  } else hud.pop(amount, x + w * 0.08, y, icon)
}

// --- HUD + game ---------------------------------------------------------------------
const hud = createHud({
  onSettings: () => windows.settings.toggle(),
  onRebirth: () => windows.rebirth.toggle(),
  onTitles: () => windows.titles.toggle(),
  onQuests: () => windows.quests.toggle(),
  onRailcars: () => (railcarsUnlocked() ? windows.railcars.toggle() : hud.toast('Unlocks at 1 rebirth')),
  onAutopilot: () => {
    setAutopilot(!state.autopilot)
    hud.toast(state.autopilot ? 'Autopilot ON' : 'Autopilot OFF')
  },
})
bloxity.onReservedAreas((areas) => {
  hud.setReserved(areas)
  setWindowReserved(areas)
})
// The windows (ui/): Titles, Rebirth, Quests, Settings, Railcars.
const windows = {
  titles: createTitles(),
  rebirth: createRebirthWindow({ onRebirth: () => hud.toast(`Rebirth ${state.rebirths}! x${state.rebirths + 1} Power`) }),
  quests: createQuests({ onClaim: (r) => popAtTrain(r.amount, r.type === 'power' ? 'bolt' : 'trophy') }),
  settings: createSettings(),
  railcars: createRailcars(),
}
// Railcars hooked on behind the train (wagons.js), the best ones owned.
const wagons = createWagons(scene)
let tagTitle = state.title
// The in-game Settings window's toggles. Music / Sound effects are kept for the audio
// layer (none yet); Other players' wagons for multiplayer (none yet).
let shownSettings = ''
function applyGameSettings(set) {
  const key = JSON.stringify(set)
  if (key === shownSettings) return
  shownSettings = key
  hud.setVisible(set.hud)
  sfx.setMuted(!set.sfx) // Settings > Sound effects
  setTrainSoundsEnabled(set.trainSfx !== false) // Settings > Train sounds
  setParticleDensity(set.vfx ? graphicsPreset(bloxity.settings.graphics_quality).particles : 0)
}
// Rolling onto the Titles / Railcars stall mats opens their window (once per visit).
const stallSpots = STALLS.filter((st) => st.opens)
let atStall = null
function checkStalls(pos) {
  const st = pos.y < 2.5 ? stallSpots.find((x) => Math.hypot(pos.x - x.x, pos.z - x.z) < 3.2) ?? null : null
  if (st === atStall) return
  atStall = st
  if (!st) return
  if (st.opens === 'railcars' && !railcarsUnlocked()) hud.toast('Railcars unlock at 1 rebirth')
  else windows[st.opens].open()
}
onState((s) => {
  hud.setState(s)
  for (const w of Object.values(windows)) w.update()
  hud.setBadges({ rebirth: canRebirth(), quests: claimableQuests() > 0, railcars: railcarsUnlocked() })
  applyGameSettings(s.settings)
  wagons.set(attachedRailcars().map((r) => r.type), player.renderPosition.x, player.renderPosition.y, player.renderPosition.z, player.facing)
  if (s.title !== tagTitle) {
    tagTitle = s.title
    tag.setLines(tagLines())
  }
  if (s.level !== tagLevel) {
    if (s.level > tagLevel) {
      hud.levelUp(tagLevel, s.level)
      sfx.levelUp()
    }
    tagLevel = s.level
    tag.setLines(tagLines())
  }
})
const tracker = createTreadmillTracker([...props.treadmills, ...lane.treadmills], {
  onGain: (amount) => {
    popAtTrain(amount, 'bolt', true)
    sfx.gain()
    hud.bumpPower()
  },
  onLocked(zone) {
    hud.toast(zone.price ? `Unlock the ${zone.mult}x treadmill in the store` : `Needs ${zone.cost} rebirths`)
  },
})

const training = createTraining(scene, playerGroup, train)
const shop = buildShop(scene, camera, props.shopSlots, hud) // the Trains display: hold E to buy / equip
// Online (online.js): the server room, the other players, Bloxity emotes / chat bubbles, leaderboards.
var online = startOnline({
  scene,
  camera,
  playerGroup,
  driver,
  props,
  hud,
  getPose: () => ({ x: player.renderPosition.x, y: player.renderPosition.y + railLift, z: player.renderPosition.z, yaw: player.facing, speed: Math.hypot(player.velocity.x, player.velocity.z) }),
  getTraining: () => !!tracker.active && !!player.training,
})

// --- Modes + keys ---------------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
const last = { x: player.renderPosition.x, z: player.renderPosition.z }

let manualTime = 0 // dev stepping (__game.frame) advances time while the tab is not drawing
function frame(fixedDt) {
  if (online.paused && !fixedDt) return void clock.getDelta() // a Bloxity ad break: the world waits
  const realDt = fixedDt ?? Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const dt = realDt * lane.timeScale(realDt) // a smash's hit-stop slows the whole world for a beat
  if (fixedDt) manualTime += fixedDt
  const elapsed = clock.elapsedTime + manualTime

  stepPhysics(dt)
  interpolatePlayer()

  const p = player.renderPosition
  railLift += (lane.trackLift(p.x, p.z) - railLift) * (1 - Math.exp(-25 * dt))
  playerGroup.position.set(p.x, p.y + railLift, p.z)
  train.rotation.y = player.facing
  const moved = Math.hypot(p.x - last.x, p.z - last.z)
  last.x = p.x
  last.z = p.z
  spinWheels(train, moved)
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  train.position.y = player.grounded ? Math.abs(Math.sin(elapsed * 18)) * 0.03 * Math.min(1, speed / 6) : 0

  tracker.update(dt, player.position)
  questEvent('seconds', dt) // the 'Play N Minutes' quests
  wagons.update(p.x, p.y + railLift, p.z, player.facing, (train.userData.length ?? 4.2) / 2 - 0.25)
  checkStalls(player.position)
  shop.update(dt, player.position)
  training.lock(tracker.active) // takes hold from the next physics step
  training.update(dt)
  lane.setViewport(renderer.domElement.height)
  lane.update(dt, elapsed)
  updateCamera(camera, dt)
  lane.shakeCamera(camera, dt)
  driver.update(dt, elapsed)
  updateTrainSounds(dt, driver.motion, driver.kind, driver.out, p, camera, driverBump) // engine, wheels, clacks, brakes, wind (steam chuffs too)
  hub.update(dt, elapsed)
  props.update(dt, elapsed, p)
  online.update(dt, elapsed)
  lighting.update(dt, playerGroup.position)
  updateParticles(elapsed, renderer.domElement.height)
  postfx.render()

  if (shownLoading) {
    readySince += dt
    if (readySince > 0.5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}
renderer.setAnimationLoop(() => frame())

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  // ?at=x,z,facingDeg starts there (screenshots of each side of the hub).
  const at = new URLSearchParams(location.search).get('at')
  if (at) {
    const [x, z, f] = at.split(',').map(Number)
    teleport(x, 0.5, z, ((f || 0) * Math.PI) / 180)
  }
  window.__game = { online, player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, state, hud, frame: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) frame(dt) } }
}
