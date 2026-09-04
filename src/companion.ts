// The seat companion: while you study, a little 2D pixel version of YOU sits
// at a desk in the corner of the screen — projected from your real voxel
// character, so it always wears what everyone else sees. It bobs, blinks,
// hums, and counts your verified focused time. A tap opens the focus view.
import { drawBust, type BustOpts } from './people'

export interface CompanionDeps {
  avatar: () => BustOpts
  focusSec: () => number
  seated: () => boolean
  onFocusView: () => void
}

const SCENE_W = 176
const SCENE_H = 118

export function mountCompanion(ui: HTMLElement, deps: CompanionDeps) {
  const card = document.createElement('div')
  card.className = 'companion-card hidden'
  card.innerHTML = `
    <canvas class="companion-scene" width="${SCENE_W * 2}" height="${SCENE_H * 2}"></canvas>
    <div class="companion-row">
      <span class="companion-time">0m ♪</span>
      <button class="glossy-btn ed-mini companion-focus">focus view</button>
    </div>
  `
  ui.appendChild(card)
  const cv = card.querySelector('.companion-scene') as HTMLCanvasElement
  const g = cv.getContext('2d')!
  g.scale(2, 2)
  g.imageSmoothingEnabled = false
  const timeEl = card.querySelector('.companion-time') as HTMLElement
  card.querySelector('.companion-focus')!.addEventListener('click', deps.onFocusView)

  // the bust is cached per look (open + blink frames) and only rebuilt on change
  const bustOpen = document.createElement('canvas')
  const bustShut = document.createElement('canvas')
  bustOpen.width = bustShut.width = 17 * 3 + 6
  bustOpen.height = bustShut.height = 40 * 3
  let lookKey = ''
  function syncBust() {
    const a = deps.avatar()
    const k = JSON.stringify(a)
    if (k === lookKey) return
    lookKey = k
    drawBust(bustOpen, a)
    drawBust(bustShut, { ...a, eyes: 'closed' })
  }

  let t = 0
  let blinkAt = 2600
  let noteAt = 5000
  const notes: { x: number; y: number; life: number }[] = []

  function paint() {
    syncBust()
    g.clearRect(0, 0, SCENE_W, SCENE_H)

    // your little self, bobbing behind the desk (pixel-snapped)
    const bob = Math.round(Math.sin(t / 900) * 1.5)
    const blinking = t >= blinkAt && t < blinkAt + 200
    if (t >= blinkAt + 200) blinkAt = t + 2200 + Math.random() * 2600
    const bust = blinking ? bustShut : bustOpen
    const bx = Math.round((SCENE_W - bust.width / 1) / 2)
    g.drawImage(bust, bx, -6 + bob)

    // the desk slab in front
    g.fillStyle = '#C89058'
    g.fillRect(0, 84, SCENE_W, SCENE_H - 84)
    g.fillStyle = '#E2B36E'
    g.fillRect(0, 84, SCENE_W, 4)
    g.fillStyle = '#A9773F'
    g.fillRect(0, 112, SCENE_W, 6)

    // laptop, back to us — you're working
    g.fillStyle = '#6D7280'
    g.fillRect(66, 56, 44, 30)
    g.fillStyle = '#9AA0AC'
    g.fillRect(66, 56, 44, 3)
    g.fillRect(66, 56, 3, 30)
    g.fillRect(107, 56, 3, 30)
    g.fillStyle = '#FFA9C1' // the little sticker
    g.fillRect(84, 68, 7, 7)
    g.fillStyle = '#565B66'
    g.fillRect(62, 86, 52, 3)

    // a warm mug, steaming
    g.fillStyle = '#A5D8F0'
    g.fillRect(128, 68, 14, 17)
    g.fillStyle = '#8FC7E4'
    g.fillRect(128, 68, 14, 3)
    g.fillRect(142, 72, 4, 8)
    g.fillStyle = '#6B4A32'
    g.fillRect(130, 70, 10, 2)
    g.fillStyle = 'rgba(255,255,255,0.75)'
    const ph = Math.floor(t / 400) % 3
    for (let i = 0; i < 3; i++) {
      const yy = 60 - i * 8 - ph * 2
      if (yy > 34) g.fillRect(133 + ((i + ph) % 2) * 3, yy, 3, 3)
    }

    // every so often, a small note floats up
    if (t >= noteAt) {
      notes.push({ x: bx + 46, y: 22, life: 1400 })
      noteAt = t + 5200 + Math.random() * 4200
    }
    g.font = '11px "Pixelify Sans", monospace'
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i]
      n.life -= 160
      n.y -= 1.4
      if (n.life <= 0) {
        notes.splice(i, 1)
        continue
      }
      g.fillStyle = `rgba(255, 122, 158, ${Math.min(1, n.life / 900)})`
      g.fillText('♪', n.x, n.y)
    }

    const m = Math.max(0, Math.floor(deps.focusSec() / 60))
    timeEl.textContent = (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`) + ' ♪'
  }

  setInterval(() => {
    const on = deps.seated()
    card.classList.toggle('hidden', !on)
    if (!on || document.hidden) return
    t += 160
    paint()
  }, 160)

  return {
    /** e.g. while the focus view covers the screen */
    setHidden(h: boolean) {
      card.classList.toggle('companion-tucked', h)
    },
  }
}
