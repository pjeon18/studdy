import type { Mode } from './lighting'
import * as clock from './clock'
import { sfx, isEnabled, setEnabled, setMusicVolume, getMusicVolume } from './sounds'

const SPARKLE_COLORS = ['#FF7A9E', '#6FBFA3', '#FFC24D', '#9D8BE0', '#FF9EBB']

export function heartBurst(x: number, y: number) {
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span')
    s.className = 'sparkle glyph'
    s.textContent = Math.random() < 0.5 ? '♥' : '♡'
    s.style.color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]
    const ang = Math.random() * Math.PI * 2
    const dist = 26 + Math.random() * 30
    s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
    s.style.setProperty('--dy', `${Math.sin(ang) * dist - 16}px`)
    s.style.left = `${x}px`
    s.style.top = `${y}px`
    document.body.appendChild(s)
    setTimeout(() => s.remove(), 600)
  }
}

export interface CardData {
  /** This is the player's own card (shows the turn-around action). */
  self?: boolean
  name: string
  status: string
  working: string
  headphones: boolean
  streak: string
  /** Epoch ms when this person started focusing (for the live timer). */
  focusedSince: number
  hair?: string
  sweater?: string
  /** Set for real people — enables the real + friend / visit café actions. */
  userId?: string
}

const MOON_LATTE: CardData = {
  name: 'moon_latte',
  status: '"finals in 3 days… fighting ✩"',
  working: 'orgo pset 4',
  headphones: true,
  streak: '12 days ★',
  focusedSince: Date.now() - 72 * 60 * 1000,
}

// ---------- pixel portrait drawn from the same palette as the voxel head ----------
export function drawPortrait(
  cv: HTMLCanvasElement,
  hair = '#4A3226',
  sweater = '#FFA7C1',
  skin = '#FFD9B8',
  glasses = false,
  longHair = false
) {
  const g = cv.getContext('2d')!
  const P = { h: hair, s: skin, e: '#2B1B12', b: '#FFA8A8', k: sweater, bg: '#FFE9F0' }
  const grid = [
    'gggggggggggg',
    'ghhhhhhhhhhg',
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
    'hshhsshhsshh',
    'hssssssssssh',
    'hsseessees.h',
    'hssssssssssh',
    'hbsssssssbsh',
    'hssssssssssh',
    '.ssssssssss.',
    '.kkkkkkkkkk.',
  ]
  const map: Record<string, string> = { g: P.bg, h: P.h, s: P.s, e: P.e, b: P.b, k: P.k, '.': P.bg }
  const cell = cv.width / 12
  g.fillStyle = P.bg
  g.fillRect(0, 0, cv.width, cv.height)
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      g.fillStyle = map[row[x]] ?? P.bg
      g.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5)
    }
  })
  if (longHair) {
    g.fillStyle = P.h
    g.fillRect(0, 7 * cell, cell, 5 * cell)
    g.fillRect(11 * cell, 7 * cell, cell, 5 * cell)
    g.fillRect(cell, 10 * cell, cell, 2 * cell)
    g.fillRect(10 * cell, 10 * cell, cell, 2 * cell)
  }
  if (glasses) {
    g.strokeStyle = '#4A3A30'
    g.lineWidth = Math.max(1.5, cell * 0.32)
    g.strokeRect(2.55 * cell, 5.6 * cell, 2.9 * cell, 1.8 * cell)
    g.strokeRect(6.55 * cell, 5.6 * cell, 2.9 * cell, 1.8 * cell)
    g.fillStyle = '#4A3A30'
    g.fillRect(5.45 * cell, 6.2 * cell, 1.1 * cell, Math.max(1.5, cell * 0.32))
  }
}

export interface UICallbacks {
  onMode: (m: Mode) => void
  onRoomLight: (mult: number) => void
  onFurnitureLight: (mult: number) => void
  /** Turn the standing player (the self card's "↻ turn around"). */
  onTurn?: () => void
  /** Send a real friend request (profile cards of real people). */
  onFriendUser?: (userId: string) => void
  /** Travel to a real user's café (profile cards of real people). */
  onVisitUser?: (userId: string) => void
}

let turnHook: (() => void) | undefined
let friendHook: ((userId: string) => void) | undefined
let visitUserHook: ((userId: string) => void) | undefined

export function buildUI(cb: UICallbacks) {
  const ui = document.getElementById('ui')!
  turnHook = cb.onTurn
  friendHook = cb.onFriendUser
  visitUserHook = cb.onVisitUser

  // wordmark: rasterized pixel logo (see makeLogo)
  const brand = document.createElement('div')
  brand.className = 'brand'
  brand.innerHTML = `
    <img class="wordmark" alt="Studdy" />
    <div class="brand-sub">moon_latte's café · open 24h ☂</div>
  `
  ui.appendChild(brand)
  import('./pixelui').then(({ makeLogo }) =>
    makeLogo('Studdy').then(({ url, w }) => {
      const img = brand.querySelector('.wordmark') as HTMLImageElement
      img.src = url
      img.style.width = `${w * 3}px`
    })
  )

  // the communal sprint clock — everyone everywhere is on the same phase
  const clockEl = document.createElement('div')
  clockEl.className = 'clock-pill'
  clockEl.innerHTML = `<span class="clock-dot"></span><span class="clock-label">SPRINT</span><span class="clock-time">--:--</span>`
  ui.appendChild(clockEl)
  const timeEl = clockEl.querySelector('.clock-time') as HTMLElement
  const labelEl = clockEl.querySelector('.clock-label') as HTMLElement
  let lastMode: string | null = null
  const tickClock = () => {
    const ph = clock.phase()
    const secs = Math.ceil(ph.remaining / 1000)
    clockEl.classList.toggle('break', ph.mode === 'break')
    labelEl.textContent = ph.mode === 'break' ? 'BREAK ♪' : 'SPRINT'
    timeEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
    if (lastMode && lastMode !== ph.mode) sfx.bell() // the communal chime
    lastMode = ph.mode
  }
  tickClock()
  setInterval(tickClock, 500)

  // café controls: opens from its right-edge tab into the shared bottom-right slot
  const cafeTab = document.createElement('button')
  cafeTab.className = 'glossy-btn cafe-tab rslot-tab'
  cafeTab.textContent = '✦ café'
  ui.appendChild(cafeTab)

  const modeWin = document.createElement('div')
  modeWin.className = 'y2k-window mode-window rslot-window hidden'
  modeWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">café controls</span><button class="tb-close">×</button></div>
    <div class="y2k-body mode-buttons">
      <button class="glossy-btn mode-btn active" data-mode="day">☀ day</button>
      <button class="glossy-btn mode-btn" data-mode="dusk">☁ dusk</button>
      <button class="glossy-btn mode-btn" data-mode="night">☾ night</button>
      <label class="lights-row">
        <span class="lights-label">✦ room</span>
        <input type="range" class="lights-slider" data-light="room" min="0" max="100" value="100" />
      </label>
      <label class="lights-row">
        <span class="lights-label">✦ lamps</span>
        <input type="range" class="lights-slider" data-light="furniture" min="0" max="100" value="50" />
      </label>
      <label class="lights-row">
        <span class="lights-label">♪ music</span>
        <input type="range" class="lights-slider music-slider" min="0" max="100" />
      </label>
      <button class="glossy-btn mode-btn sound-btn"></button>
    </div>
  `
  ui.appendChild(modeWin)
  modeWin.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modeWin.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      cb.onMode(btn.dataset.mode as Mode)
      // at night the whole UI goes dark too (pink stays pink)
      document.body.classList.toggle('ui-night', btn.dataset.mode === 'night')
    })
  })
  modeWin.querySelectorAll<HTMLInputElement>('.lights-slider').forEach((slider) => {
    slider.addEventListener('input', () => {
      // room maxes brighter (×3) — the old max now sits at the ⅔ mark
      if (slider.dataset.light === 'room') cb.onRoomLight((Number(slider.value) / 100) * 3)
      else if (slider.dataset.light === 'furniture') cb.onFurnitureLight(Number(slider.value) / 50)
    })
  })
  cafeTab.addEventListener('click', () => toggleRightWindow(modeWin, cafeTab))
  modeWin.querySelector('.tb-close')!.addEventListener('click', () => toggleRightWindow(modeWin, cafeTab))
  const musicSlider = modeWin.querySelector('.music-slider') as HTMLInputElement
  musicSlider.value = String(Math.round(getMusicVolume() * 100))
  musicSlider.addEventListener('input', () => setMusicVolume(Number(musicSlider.value) / 100))
  const soundBtn = modeWin.querySelector('.sound-btn') as HTMLButtonElement
  const paintSound = () => {
    soundBtn.textContent = isEnabled() ? '♪ sound on' : '♪ sound off'
    soundBtn.classList.toggle('active', isEnabled())
  }
  paintSound()
  soundBtn.addEventListener('click', () => {
    setEnabled(!isEnabled())
    paintSound()
  })

  // hint
  const hint = document.createElement('div')
  hint.className = 'hint'
  hint.textContent = 'drag to look around · scroll to zoom · click the barista ♪'
  ui.appendChild(hint)

  return {
    setBackground(a: string, b: string) {
      document.body.style.background = `linear-gradient(168deg, ${a} 0%, ${b} 100%)`
    },
    openProfileCard(x: number, y: number, data?: CardData) {
      openProfileCard(ui, x, y, data)
    },
  }
}

let card: HTMLElement | null = null

/** Close any open profile card (e.g. when you travel). */
export function closeProfileCard() {
  card?.remove()
  card = null
}

function openProfileCard(ui: HTMLElement, x: number, y: number, data: CardData = MOON_LATTE) {
  if (card) card.remove()
  card = document.createElement('div')
  card.className = 'y2k-window profile-card'
  card.innerHTML = `
    <div class="y2k-titlebar drag-handle">
      <span class="tb-dots"><i></i><i></i></span>
      <span class="tb-title">profile</span>
      <button class="tb-close">×</button>
    </div>
    <div class="y2k-body">
      <div class="pc-top">
        <canvas class="pc-portrait" width="96" height="96"></canvas>
        <div class="pc-id">
          <div class="pc-name"></div>
          <div class="pc-status"></div>
        </div>
      </div>
      <div class="pc-rows">
        <div class="pc-row"><span>focused</span><b class="pc-focus">0m</b></div>
        <div class="pc-row"><span>working on</span><b class="pc-work"></b></div>
        <div class="pc-row"><span>headphones</span><b class="pc-hp"></b></div>
        <div class="pc-row"><span>streak</span><b class="pc-streak"></b></div>
      </div>
      <div class="pc-actions">
        ${
          data.self
            ? '<button class="glossy-btn btn-mint pc-turn">↻ turn around</button>'
            : '<button class="glossy-btn btn-pink pc-friend">+ friend</button><button class="glossy-btn btn-mint pc-visit">visit café</button>'
        }
      </div>
    </div>
  `
  ui.appendChild(card)
  const w = 252
  card.style.left = `${Math.min(Math.max(12, x - w / 2), window.innerWidth - w - 12)}px`
  card.style.top = `${Math.min(Math.max(12, y - 320), window.innerHeight - 380)}px`

  drawPortrait(card.querySelector('.pc-portrait') as HTMLCanvasElement, data.hair, data.sweater)
  ;(card.querySelector('.pc-name') as HTMLElement).textContent = data.name
  ;(card.querySelector('.pc-status') as HTMLElement).textContent = data.status
  ;(card.querySelector('.pc-work') as HTMLElement).textContent = data.working || '…'
  ;(card.querySelector('.pc-hp') as HTMLElement).innerHTML = data.headphones
    ? '<i class="hp-dot"></i>ON ♪'
    : 'off'
  ;(card.querySelector('.pc-streak') as HTMLElement).textContent = data.streak

  const focusEl = card.querySelector('.pc-focus') as HTMLElement
  const fmt = () => {
    const m = Math.max(0, Math.floor((Date.now() - data.focusedSince) / 60000))
    focusEl.textContent = m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
  }
  fmt()
  const tick = setInterval(() => {
    if (!card || !document.body.contains(card)) return clearInterval(tick)
    fmt()
  }, 1000)

  card.querySelector('.tb-close')!.addEventListener('click', (e) => {
    e.stopPropagation()
    card?.remove()
    card = null
  })
  card.querySelectorAll('.pc-actions .glossy-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.classList.contains('pc-turn')) turnHook?.()
      else if (data.userId && btn.classList.contains('pc-friend')) friendHook?.(data.userId)
      else if (data.userId && btn.classList.contains('pc-visit')) {
        closeProfileCard()
        visitUserHook?.(data.userId)
      } else if (!data.userId && btn.classList.contains('pc-friend')) {
        toast('they’re a regular — always around ♪')
      } else {
        toast('coming soon ♪')
      }
    })
  )

  // dragging by the title bar
  const handle = card.querySelector('.drag-handle') as HTMLElement
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).classList.contains('tb-close')) return
    const el = card!
    const startX = e.clientX - el.offsetLeft
    const startY = e.clientY - el.offsetTop
    const move = (ev: PointerEvent) => {
      el.style.left = `${ev.clientX - startX}px`
      el.style.top = `${ev.clientY - startY}px`
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

/** Escape user-controlled text before it goes anywhere near innerHTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** The bottom-right slot holds ONE window (café controls / friends / chat).
 *  The tab that opened it turns pink while its window is up. */
export function toggleRightWindow(win: HTMLElement, tab?: HTMLElement) {
  const wasHidden = win.classList.contains('hidden')
  document.querySelectorAll('.rslot-window').forEach((w) => w.classList.add('hidden'))
  document.querySelectorAll('.rslot-tab').forEach((t) => t.classList.remove('rtab-active'))
  if (wasHidden) {
    win.classList.remove('hidden')
    tab?.classList.add('rtab-active')
  }
}

/** Adds a "–" button to a window's titlebar that collapses it to just the bar. */
export function collapsible(win: HTMLElement) {
  const bar = win.querySelector('.y2k-titlebar')
  if (!bar) return
  const btn = document.createElement('button')
  btn.className = 'tb-min'
  btn.textContent = '–'
  bar.insertBefore(btn, bar.querySelector('.tb-close'))
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const c = win.classList.toggle('collapsed')
    btn.textContent = c ? '+' : '–'
  })
}

let toastEl: HTMLElement | null = null
export function toast(msg: string) {
  toastEl?.remove()
  toastEl = document.createElement('div')
  toastEl.className = 'toast'
  toastEl.textContent = msg
  document.body.appendChild(toastEl)
  setTimeout(() => toastEl?.remove(), 1600)
}
