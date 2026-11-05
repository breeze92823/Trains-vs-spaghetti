// Everything online in one place (main.js creates it once): the server connection (net.js), the
// other players (remotePlayers.js), Bloxity emotes and chat bubbles for everyone, the hub
// leaderboards (server lists, with Bloxity's boards as fallback and as the E-to-open panel), the
// score submissions, friend toasts, ad breaks and the portal's volume / FPS settings.
// Nothing here may throw: offline (dev, blocked SDK) it is simply idle.
//   const online = startOnline({ scene, camera, playerGroup, driver, props, hud, getPose, getTraining })
//   online.update(dt, elapsed)      each frame
//   online.paused                   true during a Bloxity ad break (main.js skips the sim)
//   online.action(name)             one-shot action for the others ('horn', 'smash', 'steal', ...)
import * as THREE from 'three'
import { Vector3 } from 'three'
import { AUDIO } from './config.js'
import * as bloxity from './bloxity.js'
import { startNet } from './net.js'
import { createRemotePlayers } from './remotePlayers.js'
import { onKey } from './input.js'
import { createPrompt } from './prompt.js'
import { setVolume } from './audio/core.js'
import { state } from './game.js'
import { player } from './player.js'
import { sign } from './signs.js'

const BOARD_RANGE = 9 // m from a hub board within which its prompt shows

export function startOnline({ scene, camera, playerGroup, driver, props, hud, getPose, getTraining }) {
  const net = startNet({ getPose, getTraining })
  const remotes = createRemotePlayers(scene, net)
  const online = { net, remotes, paused: false, action: (name) => net.sendAction(name) }

  // --- Volume, FPS, ad breaks (portal settings) ----------------------------------
  const applyVolume = () => setVolume(online.paused ? 0 : (AUDIO.volume * (bloxity.settings.master_volume ?? 100)) / 100)
  bloxity.onSetting((key) => {
    if (key === 'master_volume') applyVolume()
    if (key === 'show_fps') fpsBox.style.display = bloxity.settings.show_fps ? 'block' : 'none'
  })
  bloxity.onAdBreak((on) => {
    online.paused = on
    applyVolume()
  })
  applyVolume()
  const fpsBox = document.createElement('div')
  fpsBox.style.cssText = 'position:fixed;right:8px;bottom:6px;font:600 12px Fredoka,sans-serif;color:#fff;text-shadow:0 1px 2px #000;z-index:5;pointer-events:none;display:none'
  document.body.append(fpsBox)
  fpsBox.style.display = bloxity.settings.show_fps ? 'block' : 'none'
  let fpsFrames = 0
  let fpsAt = performance.now()

  // --- Emotes: yours play on your driver and reach everyone through the roster ------
  let emotes = new Map()
  bloxity.loadEmotes().then((m) => (emotes = m))
  let playing = false
  function playEmote(id) {
    const clip = emotes.get(String(id))
    if (!clip) return false
    playing = true
    driver.playEmote(clip, () => {
      if (playing) net.sendEmote('')
      playing = false
    })
    net.sendEmote(String(id))
    return true
  }
  bloxity.onEmoteRequest(async (id) => {
    if (!emotes.size) emotes = await bloxity.loadEmotes()
    playEmote(id)
  })

  // --- Chat bubbles over the sender's train -----------------------------------------
  const bubbles = new Set()
  function bubbleFallback(root, text) {
    // Used when the SDK has no attachBubble (dev): a plain sign for a few seconds.
    const s = sign([{ text: text.slice(0, 48), color: '#1b1b22', size: 0.7, outline: '#ffffff' }], 0.5, { depthTest: false, renderOrder: 11, outline: 8 })
    s.position.y = 5.2
    root.add(s)
    const b = { s, until: performance.now() + 4000, root }
    bubbles.add(b)
  }
  function showChat(m, root) {
    if (!root) return
    if (!bloxity.attachChatBubble(THREE, root, m, 5.2)) bubbleFallback(root, String(m.text ?? ''))
  }
  bloxity.onChatMessage((m) => {
    const own = m.isLocalPlayer || m.userId === bloxity.userId()
    showChat(m, own ? playerGroup : remotes.byUid(m.userId)?.root)
  })
  online.say = (text) => showChat({ text, isLocalPlayer: true }, playerGroup) // dev helper

  // --- Leaderboards ---------------------------------------------------------------------
  const lb = props.leaderboards
  net.onBoards((boards) => lb?.setData(boards))
  // Server offline: fall back to Bloxity's own boards for the hub panels.
  setTimeout(async () => {
    if (net.boards || !bloxity.sdk()) return
    const data = {}
    for (const d of bloxity.LEADERBOARD_DEFS) data[d.id] = await bloxity.topScores(d.id, 7)
    if (!net.boards) lb?.setData(data)
  }, 6000)
  // Scores go to Bloxity's boards when they change (checked every 30 s, plus on leaving).
  const submitted = {}
  function submitScores() {
    const scores = { rebirths: state.rebirths, wins: state.wins, power: state.power, playtime: state.playtime }
    for (const [id, v] of Object.entries(scores)) {
      if (!(v > 0) || submitted[id] === Math.floor(v)) continue
      submitted[id] = Math.floor(v)
      bloxity.submitScore(id, v)
    }
  }
  setInterval(submitScores, 30000)
  setTimeout(submitScores, 8000)
  window.addEventListener('pagehide', submitScores)

  // E (or tapping the prompt) next to a hub board opens Bloxity's own leaderboard panel.
  const prompt = createPrompt(document.body)
  let nearBoard = null
  let wasPressed = false
  const v = new Vector3()
  function openBoard() {
    if (!nearBoard) return
    if (!bloxity.openLeaderboard(nearBoard.stat)) hud?.toast?.('Open the Bloxity leaderboard from the portal menu')
  }
  onKey('KeyE', openBoard)

  online.update = (dt, elapsed) => {
    remotes.update(dt, elapsed, camera.position)

    // Stop your emote when the train moves.
    if (driver.emoting && Math.hypot(player.velocity.x, player.velocity.z) > 1) {
      driver.stopEmote()
      if (playing) net.sendEmote('')
      playing = false
    }

    // Fallback bubbles.
    const now = performance.now()
    for (const b of bubbles)
      if (now > b.until) {
        b.root.remove(b.s)
        b.s.material.map?.dispose()
        b.s.material.dispose()
        bubbles.delete(b)
      }

    // Board prompt.
    const p = player.position
    const spots = lb?.spots ?? []
    let best = null
    let bestD = BOARD_RANGE
    for (const s of spots) {
      const d = Math.hypot(p.x - s.x, p.z - s.z)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    nearBoard = best
    if (best) {
      v.set(best.x, 2.4, best.z).project(camera)
      if (v.z < 1) {
        prompt.show(best.title, 'Open')
        prompt.place((v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight)
      } else prompt.hide()
    } else prompt.hide()
    if (prompt.pressed && !wasPressed) openBoard()
    wasPressed = prompt.pressed

    if (bloxity.settings.show_fps) {
      fpsFrames++
      if (now - fpsAt > 500) {
        fpsBox.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsAt))} FPS`
        fpsFrames = 0
        fpsAt = now
      }
    }
  }
  online.playEmote = playEmote
  online.leaderboards = lb
  return online
}
