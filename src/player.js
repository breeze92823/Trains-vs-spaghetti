import { inputState } from './input.js'
import { getYaw, syncYawToPlayer } from './camera.js'
import { isFirstPerson } from './modes.js'
import { RAPIER, alpha, onTick, world } from './physics.js'
import { LANE, PHYSICS, PLAYER_DIMS, SPAWN, SPAWN_FACING, TRAINING } from './config.js'

// The local player singleton, mutated in place. A kinematic Rapier capsule
// driven by Rapier's KinematicCharacterController: it slides along walls,
// autosteps small ledges, climbs slopes up to PHYSICS.maxSlope, snaps down
// steps and shoves dynamic bodies (crates, balls) with PHYSICS.pushMass.
// Gravity, jumping (with coyote time and a jump buffer) and acceleration are
// ours; collision resolution is Rapier's. Stepped once per physics tick.
export const player = {
  position: { x: 0, y: 0, z: 0 }, // capsule base (feet), at the latest tick
  renderPosition: { x: 0, y: 0, z: 0 }, // feet, interpolated for this frame
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  facing: SPAWN_FACING, // yaw the character model faces, radians
  dims: { ...PLAYER_DIMS },
  speedScale: 1, // set by the lane (faster in there)
  // Set by training.js while the train runs in place on a treadmill:
  // { x, z } spot to hold, facing (yaw up the slope), ux / uz (unit vector up the slope).
  training: null,
  trainingLetGo: false, // the player steered off: no re-lock until the train leaves the belt
  // Set by lane.js while the train drives itself down the lane: { x, z } unit heading along a
  // track through (px, pz). The train slides onto the track and runs along it; any steering
  // but "up the track" hands control back (null = normal driving).
  autoRun: null,
  wish: { x: 0, z: 0 }, // last tick's camera-relative steering (lane.js reads it)
}

const HALF = PLAYER_DIMS.height / 2 // capsule centre above the feet
const prev = { x: 0, y: 0, z: 0 }
let body = null
let collider = null
let controller = null
let sinceGrounded = 0
let jumpQueued = 0 // s left on a buffered jump

export function createPlayerBody() {
  const r = PLAYER_DIMS.radius
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y + HALF, SPAWN.z))
  collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - r, r).setFriction(0), body)

  controller = world.createCharacterController(0.02)
  controller.setUp({ x: 0, y: 1, z: 0 })
  controller.enableAutostep(PHYSICS.stepHeight, 0.15, false)
  controller.enableSnapToGround(PHYSICS.snapToGround)
  controller.setMaxSlopeClimbAngle((PHYSICS.maxSlope * Math.PI) / 180)
  controller.setMinSlopeSlideAngle(((PHYSICS.maxSlope + 5) * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.setCharacterMass(PHYSICS.pushMass)

  resetPlayer()
  onTick(step)
}

export function resetPlayer(spawn = SPAWN, facing = SPAWN_FACING) {
  player.position.x = prev.x = player.renderPosition.x = spawn.x
  player.position.y = prev.y = player.renderPosition.y = spawn.y
  player.position.z = prev.z = player.renderPosition.z = spawn.z
  player.velocity.x = player.velocity.y = player.velocity.z = 0
  player.grounded = true
  player.facing = facing
  player.training = null
  player.trainingLetGo = false
  player.autoRun = null
  body?.setTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z }, true)
  body?.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z })
}

export function respawn() {
  resetPlayer()
  syncYawToPlayer()
}

const TAU = Math.PI * 2
// Turns angle `from` toward `to` by at most maxDelta, the short way round.
function rotateTowards(from, to, maxDelta) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  if (Math.abs(diff) <= maxDelta) return to
  return (from + Math.sign(diff) * maxDelta) % TAU
}

// Moves the (x, z) velocity toward the target as one 2D vector so it curves
// straight instead of warping axis-by-axis.
function approach2D(v, targetX, targetZ, maxDelta) {
  const dx = targetX - v.x
  const dz = targetZ - v.z
  const dist = Math.hypot(dx, dz)
  if (dist <= maxDelta || dist === 0) {
    v.x = targetX
    v.z = targetZ
  } else {
    v.x += (dx / dist) * maxDelta
    v.z += (dz / dist) * maxDelta
  }
}

function step(dt) {
  prev.x = player.position.x
  prev.y = player.position.y
  prev.z = player.position.z

  // Camera-relative ground basis.
  const yaw = getYaw()
  const fwdX = -Math.sin(yaw)
  const fwdZ = -Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const mv = inputState.move
  const len = Math.hypot(mv.x, mv.z)
  const scale = len > 1 ? 1 / len : 1
  const wishX = (fwdX * mv.z + rightX * mv.x) * scale
  const wishZ = (fwdZ * mv.z + rightZ * mv.x) * scale
  const speed = (inputState.sprint ? PHYSICS.sprintSpeed : PHYSICS.walkSpeed) * player.speedScale
  player.wish.x = wishX
  player.wish.z = wishZ

  // Auto-run: steering anywhere but up the track takes the controls back.
  if (player.autoRun) {
    const a = player.autoRun
    const wish = Math.hypot(wishX, wishZ)
    if (wish > LANE.autoRun.release && wishX * a.x + wishZ * a.z < wish * 0.85) player.autoRun = null
  }

  // Training: steering anywhere but up the belt (or jumping) lets go; otherwise the
  // train is drawn to its spot on the belt and runs in place facing the headboard.
  const tr = player.training
  if (tr) {
    const wish = Math.hypot(wishX, wishZ)
    const along = wishX * tr.ux + wishZ * tr.uz
    if (inputState.jump || (wish > TRAINING.release && along < wish * 0.7)) {
      player.training = null
      player.trainingLetGo = true
    }
  }
  if (player.training) {
    let vx = (tr.x - player.position.x) * TRAINING.pull
    let vz = (tr.z - player.position.z) * TRAINING.pull
    const v = Math.hypot(vx, vz)
    if (v > TRAINING.maxPull) {
      vx *= TRAINING.maxPull / v
      vz *= TRAINING.maxPull / v
    }
    player.velocity.x = vx
    player.velocity.z = vz
  } else if (player.autoRun) {
    // Slide sideways onto the track's centre line while running along it.
    const a = player.autoRun
    const A = LANE.autoRun
    const off = (player.position.x - a.px) * -a.z + (player.position.z - a.pz) * a.x // m left/right of the line
    const side = Math.max(-A.maxSide, Math.min(A.maxSide, -off * A.pull))
    approach2D(player.velocity, a.x * speed - a.z * side, a.z * speed + a.x * side, (player.grounded ? PHYSICS.accel : PHYSICS.airAccel) * dt)
  } else {
    const rate = !player.grounded ? PHYSICS.airAccel : len > 0.01 ? PHYSICS.accel : PHYSICS.decel
    approach2D(player.velocity, wishX * speed, wishZ * speed, rate * dt)
  }

  // Jump: buffered a little before landing, and allowed a little after leaving a ledge.
  if (inputState.jump) {
    jumpQueued = PHYSICS.jumpBuffer
    inputState.jump = false
  }
  sinceGrounded = player.grounded ? 0 : sinceGrounded + dt
  let jumped = false
  if (jumpQueued > 0 && sinceGrounded <= PHYSICS.coyoteTime) {
    player.velocity.y = PHYSICS.jumpSpeed
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
  }
  jumpQueued = Math.max(0, jumpQueued - dt)

  player.velocity.y += PHYSICS.gravity * dt
  if (player.grounded && !jumped && player.velocity.y < -2) player.velocity.y = -2 // stay pressed to slopes

  const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt }
  // Dynamic bodies (the spaghetti sticks) never block the train: it plows through and the
  // solver shoves them aside as the kinematic capsule moves into them.
  controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC)
  const moved = controller.computedMovement()
  player.grounded = !jumped && controller.computedGrounded()

  // Blocked vertically: a ceiling stops the rise, the floor stops the fall.
  if (player.velocity.y > 0 && moved.y < desired.y * 0.5) player.velocity.y = 0
  if (player.grounded && player.velocity.y < 0) player.velocity.y = Math.max(player.velocity.y, -2)
  // Horizontal velocity is left alone: the controller already slides along walls,
  // and scaling it by moved/desired would also bleed speed on every ramp and step.

  const t = body.translation()
  const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z }
  body.setNextKinematicTranslation(next)
  player.position.x = next.x
  player.position.y = next.y - HALF
  player.position.z = next.z

  if (player.position.y < PHYSICS.killY) {
    respawn()
    return
  }

  // The body turns toward its heading; in first person it always faces the view.
  if (isFirstPerson()) player.facing = yaw + Math.PI
  else if (player.training) player.facing = rotateTowards(player.facing, player.training.facing, PHYSICS.turnSpeed * dt)
  else if (player.autoRun) {
    // Face the run's heading, not the velocity: a wall's knockback bounce must not spin the train round.
    player.facing = rotateTowards(player.facing, Math.atan2(player.autoRun.x, player.autoRun.z), PHYSICS.turnSpeed * dt)
  }
  else if (Math.hypot(wishX, wishZ) > 0.05) {
    player.facing = rotateTowards(player.facing, Math.atan2(wishX, wishZ), PHYSICS.turnSpeed * dt)
  }
}

// Called once per frame after the physics ticks: interpolated feet position.
export function interpolate() {
  const p = player.position
  const r = player.renderPosition
  r.x = prev.x + (p.x - prev.x) * alpha
  r.y = prev.y + (p.y - prev.y) * alpha
  r.z = prev.z + (p.z - prev.z) * alpha
}
