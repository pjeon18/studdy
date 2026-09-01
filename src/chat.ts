// Café chat: a shared room chat with the regulars, plus speech bubbles that
// pop over heads. Your napkin status stays permanent; chat lines are fleeting.
import * as store from './store'
import { toggleRightWindow, esc } from './ui'
import { sfx } from './sounds'
import type { Game } from './game'
import type * as THREE from 'three'

type ShowBubble = (anchor: () => THREE.Vector3 | null, text: string, ms?: number) => void

const CHATTER = [
  'ok five more minutes of this then break ♪',
  'does anyone else reread the same line 4 times',
  'the rain is carrying me today',
  'refill run — anyone want anything?',
  'this playlist is exactly right',
  'almost done with this section!!',
  'brb stretching',
  'love what you did with this place ♪',
  'quiet hours are the best hours',
  'one more page. one. more. page.',
]

export function buildChat(ui: HTMLElement, game: Game, showBubble: ShowBubble) {
  let muted = localStorage.getItem('studdy-chat-muted') === '1'
  let unread = 0

  const tab = document.createElement('button')
  tab.className = 'glossy-btn chat-tab rslot-tab'
  tab.textContent = '✉ chat'
  ui.appendChild(tab)
  const badge = document.createElement('span')
  badge.className = 'px-badge hidden'
  tab.appendChild(badge)
  const paintBadge = () => {
    badge.textContent = String(Math.min(unread, 9))
    badge.classList.toggle('hidden', unread <= 0)
  }

  const win = document.createElement('div')
  win.className = 'y2k-window chat-window rslot-window hidden'
  win.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">café chat</span><button class="glossy-btn ed-mini chat-mute"></button><button class="tb-close">×</button></div>
    <div class="y2k-body chat-body">
      <div class="chat-log"></div>
      <input class="px-input chat-input" placeholder="say something…" maxlength="80" />
    </div>
  `
  ui.appendChild(win)
  const log = win.querySelector('.chat-log') as HTMLElement
  const input = win.querySelector('.chat-input') as HTMLInputElement
  const muteBtn = win.querySelector('.chat-mute') as HTMLButtonElement
  const paintMute = () => {
    muteBtn.textContent = muted ? 'muted' : 'mute'
    muteBtn.classList.toggle('active', !muted)
  }
  paintMute()
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    muted = !muted
    localStorage.setItem('studdy-chat-muted', muted ? '1' : '0')
    paintMute()
  })
  win.querySelector('.tb-close')!.addEventListener('click', () => win.classList.add('hidden'))
  tab.addEventListener('click', () => {
    toggleRightWindow(win, tab)
    if (!win.classList.contains('hidden')) {
      unread = 0
      paintBadge()
      log.scrollTop = log.scrollHeight
      input.focus()
    }
  })

  function addLine(from: string, text: string, self = false) {
    const row = document.createElement('div')
    row.className = 'chat-row' + (self ? ' self' : '')
    row.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`
    log.appendChild(row)
    while (log.children.length > 60) log.removeChild(log.firstChild!)
    log.scrollTop = log.scrollHeight
    if (!self && win.classList.contains('hidden')) {
      unread++
      paintBadge()
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    sfx.tick()
    addLine(store.save.info.name || 'you', text, true)
    // the fleeting bubble over your head — the napkin status is the permanent one
    showBubble(() => game.getPlayerAnchor(), text)
  })

  // the regulars chat now and then (muted = they keep it to themselves)
  let lastSim = ''
  setInterval(() => {
    if (muted) return
    const cafe = game.getVisiting()
    const sims = cafe?.sims ?? []
    if (!sims.length || Math.random() > 0.4) return
    const sim = sims[Math.floor(Math.random() * sims.length)]
    if (sim.name === lastSim && sims.length > 1) return
    lastSim = sim.name
    const line = CHATTER[Math.floor(Math.random() * CHATTER.length)]
    addLine(sim.name, line)
    showBubble(() => game.getSimAnchor(sim.name), line)
  }, 11000)

  return { addLine }
}
