// The focus view: a first-person, low-stimulus screen for when you want the
// timer and nothing else — your desk, an open book, a warm mug, the communal
// clock. The 3D room keeps existing (you stay seated, presence keeps beating)
// but the GPU goes quiet: main.ts skips rendering entirely while this is up.
import * as clock from './clock'

export interface FocusDeps {
  seated: () => boolean
  focusSec: () => number
  napkin: () => string
  setNapkin: (v: string) => void
  nowPlaying: () => string | null
  leave: () => void
  /** true = stop rendering the 3D scene underneath */
  onPause: (on: boolean) => void
  onVisibleChange?: (open: boolean) => void
}

const DESK_H = 64 // logical pixel rows; columns follow the screen's aspect

export function initFocusView(ui: HTMLElement, deps: FocusDeps) {
  const el = document.createElement('div')
  el.className = 'focus-view hidden'
  el.innerHTML = `
    <div class="focus-top">
      <button class="glossy-btn focus-back">← back to the café</button>
      <button class="glossy-btn focus-stand">stand up</button>
    </div>
    <div class="focus-mid">
      <div class="focus-phase">sprint</div>
      <div class="focus-clock">25:00</div>
      <div class="focus-sub">focused 0m</div>
      <input class="px-input focus-napkin" placeholder="napkin: working on…" maxlength="40" />
    </div>
    <div class="focus-np"></div>
    <canvas class="focus-desk"></canvas>
  `
  ui.appendChild(el)
  const phaseEl = el.querySelector('.focus-phase') as HTMLElement
  const clockEl = el.querySelector('.focus-clock') as HTMLElement
  const subEl = el.querySelector('.focus-sub') as HTMLElement
  const napkinEl = el.querySelector('.focus-napkin') as HTMLInputElement
  const npEl = el.querySelector('.focus-np') as HTMLElement
  const cv = el.querySelector('.focus-desk') as HTMLCanvasElement
  const g = cv.getContext('2d')!

  let open = false
  let steamT = 0

  // logical pixel grid sized from the screen so the desk runs edge to edge
  // without stretching pixels out of square
  let LW = 300
  function sizeDesk() {
    const cssW = cv.clientWidth || window.innerWidth
    const cssH = cv.clientHeight || 150
    LW = Math.max(120, Math.round(DESK_H * (cssW / cssH)))
    if (cv.width !== LW || cv.height !== DESK_H) {
      cv.width = LW
      cv.height = DESK_H
    }
  }
  window.addEventListener('resize', () => {
    if (!open) return
    sizeDesk()
    paintDesk(true)
  })

  napkinEl.addEventListener('input', () => deps.setNapkin(napkinEl.value.trim()))
  el.querySelector('.focus-back')!.addEventListener('click', () => close())
  el.querySelector('.focus-stand')!.addEventListener('click', () => {
    deps.leave() // the session summary appears over the café
    close()
  })

  function tick() {
    if (!open) return
    if (!deps.seated()) {
      close() // stood up (or got tucked in) while the view was up
      return
    }
    const p = clock.phase()
    const onBreak = p.mode === 'break'
    phaseEl.textContent = onBreak ? 'break ♪' : 'sprint'
    phaseEl.classList.toggle('on-break', onBreak)
    const sec = Math.ceil(p.remaining / 1000)
    clockEl.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
    const m = Math.max(0, Math.floor(deps.focusSec() / 60))
    subEl.textContent = `focused ${m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`}`
    const t = deps.nowPlaying()
    npEl.textContent = t ? `♪ ${t}` : ''
  }

  function paintDesk(force = false) {
    if (!open || (document.hidden && !force)) return
    steamT++
    const top = 18 // the desk's back edge (steam rises above it)
    g.clearRect(0, 0, LW, DESK_H)

    // the desk surface, seen from your chair, running edge to edge
    g.fillStyle = '#C89058'
    g.fillRect(0, top, LW, DESK_H - top)
    g.fillStyle = '#E2B36E'
    g.fillRect(0, top, LW, 2)
    g.fillStyle = '#B5804A'
    for (let i = 0; i * 34 + 26 < LW; i++) g.fillRect(10 + i * 34, top + 8 + (i % 3) * 12, 16, 1) // wood grain

    const cx = Math.round(LW / 2)
    // the open book, centered under the clock
    g.fillStyle = '#C24545'
    g.fillRect(cx - 33, top + 4, 66, 34)
    g.fillStyle = '#FFFDF4'
    g.fillRect(cx - 31, top + 5, 30, 31)
    g.fillRect(cx + 1, top + 5, 30, 31)
    g.fillStyle = '#8A6D52'
    g.fillRect(cx - 1, top + 5, 2, 31) // the spine crease
    g.fillStyle = '#C9BBA4'
    for (let r = 0; r < 5; r++) {
      g.fillRect(cx - 27, top + 10 + r * 5, 22 - (r === 4 ? 9 : 0), 1)
      g.fillRect(cx + 5, top + 10 + r * 5, 22 - (r === 4 ? 13 : 0), 1)
    }
    // a pencil to the right of the book
    g.fillStyle = '#FFC24D'
    g.fillRect(cx + 44, top + 22, 18, 3)
    g.fillStyle = '#FFA9C1'
    g.fillRect(cx + 62, top + 22, 3, 3)
    g.fillStyle = '#FFF4DE'
    g.fillRect(cx + 41, top + 22, 3, 3)
    g.fillStyle = '#4A3226'
    g.fillRect(cx + 40, top + 23, 1, 1)
    // sticky notes further right (when the desk is wide enough)
    if (cx + 104 <= LW) {
      g.fillStyle = '#FFE08A'
      g.fillRect(cx + 84, top + 8, 12, 12)
      g.fillStyle = '#FFAFC6'
      g.fillRect(cx + 92, top + 14, 12, 12)
    }

    // the mug on the left, steaming gently
    const mx = cx - 66
    g.fillStyle = '#A5D8F0'
    g.fillRect(mx, top + 8, 13, 16)
    g.fillStyle = '#8FC7E4'
    g.fillRect(mx, top + 8, 13, 2)
    g.fillRect(mx + 13, top + 11, 3, 8)
    g.fillStyle = '#6B4A32'
    g.fillRect(mx + 2, top + 10, 9, 2)
    g.fillStyle = 'rgba(255,255,255,0.7)'
    const ph = steamT % 3
    for (let i = 0; i < 3; i++) {
      const yy = top + 2 - i * 6 - ph * 2
      if (yy > 0) g.fillRect(mx + 4 + ((i + ph) % 2) * 3, yy, 2, 2)
    }
    // a tiny plant on the far left (when the desk is wide enough)
    const px = cx - 110
    if (px >= 4) {
      g.fillStyle = '#D97B5A'
      g.fillRect(px, top + 16, 10, 8)
      g.fillStyle = '#B65F44'
      g.fillRect(px, top + 16, 10, 2)
      g.fillStyle = '#58A084'
      g.fillRect(px + 1, top + 8, 3, 8)
      g.fillRect(px + 5, top + 5, 3, 11)
      g.fillRect(px - 2, top + 11, 3, 5)
    }
  }

  setInterval(tick, 500)
  setInterval(paintDesk, 420)

  function openView() {
    if (open || !deps.seated()) return
    open = true
    napkinEl.value = deps.napkin()
    el.classList.remove('hidden')
    deps.onPause(true)
    deps.onVisibleChange?.(true)
    tick()
    sizeDesk()
    paintDesk(true)
  }
  function close() {
    if (!open) return
    open = false
    el.classList.add('hidden')
    deps.onPause(false)
    deps.onVisibleChange?.(false)
  }

  return { open: openView, close, isOpen: () => open }
}
