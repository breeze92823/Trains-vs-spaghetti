// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import { GAME_SLUG, GAME_TITLE, SETTINGS, DEV_MODE, coerceSetting } from './config.js'

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const unsubscribers = []

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    let base = 'https://static.bloxity.io'
    try {
      base = sdk()?.environment?.()?.staticUrl || base
    } catch {
      // Older SDK builds have no environment().
    }
    const url = new URL(raw, base)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    const onLocalhost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    SDK.init(onLocalhost ? { gameSlug: GAME_SLUG, portalUrl: 'https://bloxity.io' } : { gameSlug: GAME_SLUG })
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event) => {
        if (event === 'respawn_request') emit(respawnListeners)
      }),
    )

    SDK.game.loadingStep('Building the island')
    initExtras(SDK)
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
export async function resolveServerEndpoint(userId) {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG, userId ? { userId } : undefined)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Premium purchases ------------------------------------------------
// Gem (premium currency) purchases: titles, Skip Rebirth, quest skips, gem containers.
// Resolves true once paid. The store is not hooked to the SDK yet: dev builds grant every
// purchase so the flows can be played through; production answers false (the windows
// then say the store is coming soon).
export const storeReady = () => import.meta.env.DEV
export async function purchase(sku, price) {
  void sku
  void price
  return storeReady()
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}

// =============================================================================
// Online integrations (docs.bloxity.io/#html5): leaderboards, emotes, chat bubbles,
// friends/party, ads breaks, extra settings. Gems / purchases are deliberately not here.
// Every call is guarded: a missing SDK or a method this SDK build lacks does nothing.
// =============================================================================
const emoteListeners = new Set()
const chatListeners = new Set()
const adListeners = new Set()
const playerEventListeners = new Set()
export const onEmoteRequest = (fn) => (emoteListeners.add(fn), () => emoteListeners.delete(fn)) // fn(emoteId)
export const onChatMessage = (fn) => (chatListeners.add(fn), () => chatListeners.delete(fn)) // fn({ userId, username, text, isGif, isLocalPlayer })
export const onAdBreak = (fn) => (adListeners.add(fn), () => adListeners.delete(fn)) // fn(true | false)
export const onPlayerEvent = (fn) => (playerEventListeners.add(fn), () => playerEventListeners.delete(fn)) // fn(event, data)

// The boards defined with the SDK; ids match the server's leaderboard stats (hub boards).
export const LEADERBOARD_DEFS = [
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'wins', label: 'Wins', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'power', label: 'Power', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'playtime', label: 'Playtime', order: 'desc', mode: 'best', format: 'time', reset: 'none' },
]

function initExtras(SDK) {
  const guard = (fn) => {
    try {
      fn()
    } catch (err) {
      console.warn('[bloxity] integration skipped', err)
    }
  }
  guard(() => SDK.leaderboard?.define?.(LEADERBOARD_DEFS))
  guard(() => SDK.game.registerFeature?.('emotes'))
  guard(() => SDK.game.registerFeature?.('play_with_friends'))
  guard(() => SDK.ads?.declareScreens?.({ menu: {}, results: {}, gameplay: {} }))
  guard(() => {
    const a = SDK.ads
    if (!a) return
    const off1 = a.onBreakStart?.(() => emit(adListeners, true))
    const off2 = a.onBreakEnd?.(() => emit(adListeners, false))
    for (const off of [off1, off2]) if (typeof off === 'function') unsubscribers.push(off)
  })
  guard(() => {
    const off = SDK.player.onEvent((event, data) => {
      if (event === 'play_emote') emit(emoteListeners, data)
      emit(playerEventListeners, event, data) // chat_message_sent, pointer_lock_changed, ...
    })
    if (typeof off === 'function') unsubscribers.push(off)
  })
  guard(() => {
    const off = SDK.chat?.onMessage?.((m) => emit(chatListeners, m))
    if (typeof off === 'function') unsubscribers.push(off)
  })
}

// --- Identity for the game server ---------------------------------------------
// The Bloxity user id, else a per-browser guest id (the server never saves `guest-` ids).
export function userId() {
  const u = authState.user
  const id = u && (u.id ?? u.userId ?? u.sub)
  if (id) return String(id)
  const g = authState.guest
  const gid = g && (g.id ?? g.userId)
  if (gid) return String(gid).startsWith('guest-') ? String(gid) : `guest-${gid}`
  try {
    let v = sessionStorage.getItem('tvs-guest')
    if (!v) sessionStorage.setItem('tvs-guest', (v = `guest-${Math.random().toString(36).slice(2, 12)}`))
    return v
  } catch {
    return 'guest-local'
  }
}

// The player's look as the server relays it to the others: { equipped, proportions, skin }.
export function avatarLook() {
  return { equipped: getEquippedAvatar(), proportions: getProportions(), skin: getSkinTextureUrl() }
}

// --- Leaderboards --------------------------------------------------------------
// Submits a final score for one of LEADERBOARD_DEFS (null when signed out / no SDK).
export async function submitScore(id, score) {
  try {
    if (!Number.isFinite(score)) return null
    return (await sdk()?.leaderboard?.submit?.(id, Math.floor(score))) ?? null
  } catch {
    return null
  }
}
// Top rows as [{ name, value, pfp }] (empty when unavailable). The row shape of getTop is read
// defensively: an array, or an object holding one.
export async function topScores(id, limit = 10) {
  try {
    const r = await sdk()?.leaderboard?.getTop?.(id, { period: 'all', limit })
    const rows = Array.isArray(r) ? r : r?.entries ?? r?.results ?? r?.rows ?? r?.top ?? r?.scores ?? []
    return rows.slice(0, limit).map((e) => ({ name: e.displayName ?? e.username ?? e.name ?? 'Player', value: Number(e.score ?? e.value) || 0, pfp: e.pfp ?? '' }))
  } catch {
    return []
  }
}
// Opens Bloxity's own leaderboard panel; false outside Bloxity.
export function openLeaderboard(id) {
  try {
    return sdk()?.leaderboard?.open?.(id) === true
  } catch {
    return false
  }
}

// --- Emotes ----------------------------------------------------------------------
let emotesPromise = null
// id -> { len, loop, tracks } from {apiUrl}/v1/avatar/emotes (fetched once).
export function loadEmotes() {
  emotesPromise ??= (async () => {
    const map = new Map()
    try {
      const api = sdk()?.environment?.()?.apiUrl
      if (!api) return map
      const res = await fetch(`${api.replace(/\/$/, '')}/v1/avatar/emotes`)
      if (!res.ok) return map
      const body = await res.json()
      for (const e of body?.emotes ?? []) if (e?.id != null && e.clip) map.set(String(e.id), e.clip)
    } catch {
      // No emotes this session.
    }
    return map
  })()
  return emotesPromise
}

// --- Chat bubbles ------------------------------------------------------------------
// Bubble above `root` (a THREE.Object3D) via the SDK helper; false when the SDK has none.
export function attachChatBubble(THREE, root, message, height) {
  try {
    const chat = sdk()?.chat
    if (!chat?.attachBubble) return false
    chat.attachBubble(THREE, root, chat.bubbleText ? chat.bubbleText(message) : message.text, height ? { height } : undefined)
    return true
  } catch {
    return false
  }
}

// --- Friends / rooms ---------------------------------------------------------------
// The player's Bloxity friends as [{ id, username }] (empty for guests / outside Bloxity).
export async function friendList() {
  try {
    const list = (await sdk()?.getFriends?.()) ?? (await sdk()?.friends?.getFriends?.()) ?? []
    return list.map((f) => ({ id: f._id ?? f.id, username: f.username }))
  } catch {
    return []
  }
}
// Shareable link into this player's room (opens the game with ?roomId=), '' when unavailable.
export function inviteLink() {
  try {
    const s = sdk()
    return s?.getInviteFriendsLink?.() ?? s?.friends?.getInviteFriendsLink?.() ?? ''
  } catch {
    return ''
  }
}
export function playerJoined(username) {
  try {
    sdk()?.game?.playerJoined?.(username)
  } catch {
    // Ignore.
  }
}
export function playerInRoom(username) {
  try {
    sdk()?.game?.playerInRoom?.(username)
  } catch {
    // Ignore.
  }
}
// fn(env) when the portal reports a different environment after init (reconnect to its playUrl).
export function onEnvironmentChanged(fn) {
  try {
    const off = sdk()?.onEnvironmentChanged?.(fn)
    if (typeof off === 'function') return off
  } catch {
    // Ignore.
  }
  return () => {}
}

// --- Rewarded ads ------------------------------------------------------------------
export const adsAvailable = () => {
  try {
    return !!sdk()?.ads?.isAvailable?.()
  } catch {
    return false
  }
}
// Resolves true only when the viewer watched it to the end (placement: lowercase, digits, hyphens).
export async function showRewarded(placement) {
  try {
    const r = await sdk()?.ads?.showRewarded?.(placement)
    return r?.status === 'completed'
  } catch {
    return false
  }
}
