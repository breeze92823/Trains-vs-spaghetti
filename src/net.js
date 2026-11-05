// The game server connection (Colyseus room "world", the Trains-vs-spaghetti-backend project).
//
//   const net = startNet({ getPose: () => ({ x, y, z, yaw, speed }), getTraining: () => bool })
//
// - Reaches the server through the Bloxity matchmaker (bloxity.resolveServerEndpoint: a new
//   Client per resolve, retried with backoff for ~60 s). Without the SDK (dev, blocked CDN) it
//   tries ws://localhost:2567 (or VITE_SERVER_URL) a couple of times and then stays offline
//   quietly; progress is not saved in that case.
// - Save: the server's Mongo doc is the only save for a signed-in player (game.js hydrate /
//   setSaveSink). No localStorage. Nothing is written until the
//   server answered with `progress` / `noProgress`.
// - Presence: `pose` ~10/s, `loadout` and `setAvatar` on change; the others come back through
//   the roster (net.players(), read by remotePlayers.js).
// - Leaderboards: the server's `leaderboard` message (net.boards / net.onBoards).
// Nothing in here may throw outward: the game is fully playable offline.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, OFFLINE_NAME } from './config.js'
import * as bloxity from './bloxity.js'
import { attachedRailcars, hydrate, onState, setSaveSink, snapshot, state } from './game.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const AVATAR_MAX = 3000 // the server's AVATAR_MAX_LEN

export function startNet({ getPose, getTraining } = {}) {
  const boardListeners = new Set()
  const stateListeners = new Set()
  const net = {
    room: null,
    online: false, // joined
    loaded: false, // the server answered with this account's save
    boards: null, // { rebirths|wins|power|playtime: [{ name, value, pfp }] }
    ranks: {},
    get sessionId() {
      return net.room?.sessionId ?? ''
    },
    // The roster (sessionId -> PlayerState) or null.
    players: () => net.room?.state?.players ?? null,
    onBoards(fn) {
      boardListeners.add(fn)
      if (net.boards) fn(net.boards, net.ranks)
      return () => boardListeners.delete(fn)
    },
    onConnection(fn) {
      stateListeners.add(fn)
      return () => stateListeners.delete(fn)
    },
    sendEmote: (id) => send('emote', { id: id || '' }),
    sendAction: (name) => send('action', { name }),
    flush: () => saveNow(),
    stop,
  }
  let stopped = false
  let lastSaved = ''

  function send(type, payload) {
    try {
      if (net.room) net.room.send(type, payload)
    } catch {
      // Dropped connection: the reconnect loop owns it.
    }
  }
  function notify() {
    for (const fn of stateListeners) {
      try {
        fn(net)
      } catch (err) {
        console.warn('[net] listener threw', err)
      }
    }
  }

  // --- Saving ------------------------------------------------------------------
  function saveNow() {
    if (!net.room || !net.loaded) return
    const snap = snapshot()
    const json = JSON.stringify(snap)
    if (json === lastSaved) return
    lastSaved = json
    send('saveProgress', snap)
  }
  function attachSink() {
    setSaveSink(() => saveNow())
  }

  // --- Identity -----------------------------------------------------------------
  let sentIdentity = ''
  const identity = () => ({ userId: bloxity.userId(), username: bloxity.displayName() === 'Offline' ? OFFLINE_NAME : bloxity.displayName(), pfp: bloxity.getPfp() })
  function checkIdentity() {
    const id = identity()
    const key = JSON.stringify(id)
    if (key === sentIdentity) return
    if (net.room && sentIdentity) {
      const prev = JSON.parse(sentIdentity)
      if (prev.userId !== id.userId) {
        saveNow() // a final save under the old identity first
        net.loaded = false
        setSaveSink(null)
      }
      send('identify', id)
    }
    sentIdentity = key
  }
  bloxity.subscribeAuth(() => checkIdentity())

  // --- Presence ----------------------------------------------------------------
  let lastPose = ''
  let lastPoseAt = 0
  let lastLoadout = ''
  let lastAvatar = ''
  let lastAvatarAt = 0
  const r2 = (v) => Math.round(v * 100) / 100
  function loadout() {
    return {
      train: state.train,
      title: state.title ?? '',
      level: state.level,
      railcars: attachedRailcars().map((r) => r.type),
      training: !!getTraining?.(),
    }
  }
  function avatarJson() {
    try {
      let json = JSON.stringify(bloxity.avatarLook())
      if (json.length > AVATAR_MAX) json = JSON.stringify({ ...bloxity.avatarLook(), skin: '' })
      return json.length <= AVATAR_MAX ? json : ''
    } catch {
      return ''
    }
  }
  function presence() {
    if (!net.room) return
    const now = performance.now()
    const p = getPose?.()
    if (p) {
      const msg = { x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), speed: r2(p.speed) }
      const key = `${msg.x},${msg.y},${msg.z},${msg.yaw},${msg.speed}`
      if (key !== lastPose || now - lastPoseAt > 1500) {
        lastPose = key
        lastPoseAt = now
        send('pose', msg)
      }
    }
    const l = loadout()
    const lk = JSON.stringify(l)
    if (lk !== lastLoadout) {
      lastLoadout = lk
      send('loadout', l)
    }
    if (now - lastAvatarAt > 1000) {
      lastAvatarAt = now
      const a = avatarJson()
      if (a && a !== lastAvatar) {
        lastAvatar = a
        send('setAvatar', { avatar: a })
      }
    }
  }
  const presenceTimer = setInterval(presence, 100)
  const saveTimer = setInterval(saveNow, 30000)
  const playTimer = setInterval(() => {
    if (!document.hidden) state.playtime += 1 // saved with the next snapshot, no UI refresh needed
  }, 1000)
  const onHide = () => {
    if (document.hidden) saveNow()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', saveNow)
  onState(() => {
    // Equip / buy changes reach the others at once instead of at the next 100 ms tick.
    if (net.room) presence()
  })

  // --- Connecting ----------------------------------------------------------------
  let launchTried = false
  async function resolveTarget() {
    if (bloxity.canResolveServer()) {
      const launch = bloxity.launchRoomId()
      if (launch && !launchTried) {
        launchTried = true
        const found = await bloxity.locateRoom(launch).catch(() => null)
        if (found) return { endpoint: found.endpoint, roomId: found.roomId, relay: found.relayRoomId }
      }
      const { endpoint, relayRoomId } = await bloxity.resolveServerEndpoint(bloxity.userId())
      return { endpoint, relay: relayRoomId }
    }
    const dev = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV || DEV_MODE ? 'ws://localhost:2567' : '')
    return dev ? { endpoint: dev, local: true } : null
  }

  function handlers(room) {
    room.onMessage('progress', (doc) => {
      hydrate(doc)
      net.loaded = true
      lastSaved = JSON.stringify(snapshot())
      attachSink()
      notify()
    })
    room.onMessage('noProgress', () => {
      net.loaded = true
      lastSaved = ''
      attachSink()
      saveNow() // a new account starts from the defaults
      notify()
    })
    room.onMessage('serverError', () => {
      // The save could not be read: never overwrite it. Playing on, unsaved.
      net.loaded = false
      setSaveSink(() => {})
    })
    room.onMessage('leaderboard', (data) => {
      if (!data?.boards) return
      net.boards = data.boards
      net.ranks = data.ranks ?? {}
      for (const fn of boardListeners) {
        try {
          fn(net.boards, net.ranks)
        } catch (err) {
          console.warn('[net] board listener threw', err)
        }
      }
    })
    // Messages the server may add later must not warn.
    for (const t of ['spins', 'daily', 'dailyResult', 'spinResult']) room.onMessage(t, () => {})
  }

  async function connectOnce() {
    const target = await resolveTarget()
    if (!target) return 'offline'
    const client = new Client(target.endpoint)
    const id = identity()
    sentIdentity = JSON.stringify(id)
    const p = getPose?.()
    const options = {
      ...id,
      pose: p && { x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), speed: r2(p.speed) },
      loadout: loadout(),
      avatar: avatarJson(),
    }
    const room = target.roomId ? await client.joinById(target.roomId, options) : await client.joinOrCreate('world', options)
    if (stopped) {
      room.leave()
      return 'stopped'
    }
    net.room = room
    net.online = true
    net.loaded = false
    handlers(room)
    bloxity.updateRoom(target.relay ? `${target.relay}~${room.roomId}` : room.roomId)
    let closed
    const gone = new Promise((r) => (closed = r))
    room.onLeave((code) => closed(code))
    room.onError((code, message) => console.warn('[net] room error', code, message))
    notify()
    const code = await gone
    net.room = null
    net.online = false
    net.loaded = false
    setSaveSink(null)
    bloxity.updateRoom('')
    notify()
    return code === 1000 ? 'left' : 'dropped'
  }

  async function run() {
    // Wait for auth to settle so the first join already carries the right identity.
    if (!bloxity.authState.ready) await new Promise((r) => bloxity.subscribeAuth((a) => a.ready && r()))
    let failures = 0
    let since = Date.now()
    while (!stopped) {
      try {
        const result = await connectOnce()
        if (result === 'offline' || result === 'stopped') return
        failures = 0
        since = Date.now()
        await sleep(1000) // dropped: rejoin
      } catch (err) {
        failures++
        const local = !bloxity.canResolveServer()
        if (local && failures >= 2) return // no dev server running: stay offline quietly
        if (failures === 1) console.info('[net] server not reachable yet, retrying', err?.message ?? err)
        const long = Date.now() - since > 60000
        await sleep(long ? 15000 : Math.min(10000, 1000 * 2 ** Math.min(failures, 4)))
      }
    }
  }
  run()

  // A different environment reported by the portal (dev <-> prod) means a different server.
  bloxity.onEnvironmentChanged(() => {
    try {
      net.room?.leave()
    } catch {
      // The loop reconnects.
    }
  })

  function stop() {
    stopped = true
    clearInterval(presenceTimer)
    clearInterval(saveTimer)
    clearInterval(playTimer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', saveNow)
    try {
      net.room?.leave()
    } catch {
      // Closing anyway.
    }
  }
  return net
}
