// The guestbook: a hand-drawn note pad (visiting) and your received-notes
// gallery (home). Notes are little PNG data URLs stored in the save.
import * as store from './store'
import { toast, heartBurst } from './ui'
import { sfx } from './sounds'
import type { GuestNote } from './types'

const W = 220
const H = 150
const PENS = ['#3A2A20', '#FF8FAF', '#7CC9AC', '#7FA9CE', '#EEC06A']

let win: HTMLElement | null = null
function closeWin() {
  win?.remove()
  win = null
}

/** Close any open guestbook window (e.g. when you travel). */
export function closeGuestbook() {
  closeWin()
}

/** Draw pad — leave a note at `cafeName`. */
export function openDrawPad(ui: HTMLElement, cafeName: string, atHome: boolean) {
  closeWin()
  win = document.createElement('div')
  win.className = 'y2k-window gb-window'
  win.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">sign the guestbook</span><button class="tb-close">×</button></div>
    <div class="y2k-body gb-body">
      <p class="gb-lead">leave a little drawing for ${cafeName} ♪</p>
      <canvas class="gb-canvas" width="${W}" height="${H}"></canvas>
      <div class="gb-tools">
        <span class="gb-pens"></span>
        <button class="glossy-btn ed-mini gb-clear">clear</button>
        <button class="glossy-btn btn-pink ed-mini gb-save">leave note ♪</button>
      </div>
    </div>
  `
  ui.appendChild(win)
  win.querySelector('.tb-close')!.addEventListener('click', closeWin)

  const cv = win.querySelector('.gb-canvas') as HTMLCanvasElement
  const g = cv.getContext('2d')!
  g.fillStyle = '#FFFDF4'
  g.fillRect(0, 0, W, H)
  // faint rule lines, like a real page
  g.fillStyle = 'rgba(90,70,50,0.10)'
  for (let y = 30; y < H; y += 28) g.fillRect(10, y, W - 20, 1)

  let pen = PENS[0]
  const pens = win.querySelector('.gb-pens') as HTMLElement
  PENS.forEach((c, i) => {
    const b = document.createElement('button')
    b.className = 'swatch gb-pen' + (i === 0 ? ' active' : '')
    b.style.background = c
    b.addEventListener('click', () => {
      pen = c
      pens.querySelectorAll('.gb-pen').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
    })
    pens.appendChild(b)
  })

  let drawing = false
  let last: [number, number] | null = null
  let drew = false
  const pos = (e: PointerEvent): [number, number] => {
    const r = cv.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  cv.addEventListener('pointerdown', (e) => {
    drawing = true
    drew = true
    last = pos(e)
    cv.setPointerCapture(e.pointerId)
  })
  cv.addEventListener('pointermove', (e) => {
    if (!drawing || !last) return
    const p = pos(e)
    g.strokeStyle = pen
    g.lineWidth = 3.4
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(last[0], last[1])
    g.lineTo(p[0], p[1])
    g.stroke()
    last = p
  })
  window.addEventListener('pointerup', () => (drawing = false))

  win.querySelector('.gb-clear')!.addEventListener('click', () => {
    g.fillStyle = '#FFFDF4'
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(90,70,50,0.10)'
    for (let y = 30; y < H; y += 28) g.fillRect(10, y, W - 20, 1)
    drew = false
  })
  ;(win.querySelector('.gb-save') as HTMLButtonElement).addEventListener('click', (e) => {
    if (!drew) {
      toast('draw a little something first ♪')
      return
    }
    const art = cv.toDataURL('image/png')
    if (atHome) {
      // signing your own book
      store.addGuestNote({ id: `gn-${Date.now()}`, from: store.save.info.name || 'you', art, at: Date.now() })
      toast('you signed your own guestbook ♪')
    } else {
      toast(`your note is in the guestbook at ${cafeName} ♪`)
    }
    store.addXp(5)
    sfx.earn()
    heartBurst((e as MouseEvent).clientX, (e as MouseEvent).clientY)
    closeWin()
  })
}

/** "8m ago"-style relative time for a note. */
function ago(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

/** Gallery of the notes in YOUR guestbook. */
export function openGallery(ui: HTMLElement) {
  closeWin()
  win = document.createElement('div')
  win.className = 'y2k-window gb-window'
  const seenAt = store.save.guestbookSeenAt
  const notes = [...store.save.guestbook].reverse()
  win.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">your guestbook</span><button class="tb-close">×</button></div>
    <div class="y2k-body gb-body">
      ${notes.length ? '' : '<p class="gb-lead">no notes yet — friends who visit can draw you something ♪</p>'}
      <div class="gb-gallery"></div>
      <div class="gb-tools"><button class="glossy-btn btn-mint ed-mini gb-sign">sign it yourself ♪</button></div>
    </div>
  `
  ui.appendChild(win)
  win.querySelector('.tb-close')!.addEventListener('click', closeWin)
  const gal = win.querySelector('.gb-gallery') as HTMLElement
  for (const n of notes) {
    const card = document.createElement('div')
    card.className = 'gb-note'
    const fresh = n.at > seenAt ? '<em class="new-pill">new</em>' : ''
    card.innerHTML = `<img src="${n.art}" alt="" /><span class="gb-meta"><i>${ago(n.at)}</i>${fresh} — ${n.from}</span>`
    gal.appendChild(card)
  }
  win.querySelector('.gb-sign')!.addEventListener('click', () => openDrawPad(ui, 'your café', true))
  store.markGuestbookSeen() // they've been looked at now
}

/** A couple of housewarming notes from the regulars, drawn in code. */
export function seedNotes() {
  if (store.save.guestbook.length) return
  const make = (draw: (g: CanvasRenderingContext2D) => void): string => {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    g.fillStyle = '#FFFDF4'
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(90,70,50,0.10)'
    for (let y = 30; y < H; y += 28) g.fillRect(10, y, W - 20, 1)
    g.lineWidth = 3.4
    g.lineCap = 'round'
    draw(g)
    return cv.toDataURL('image/png')
  }
  const heartNote = make((g) => {
    g.strokeStyle = '#FF8FAF'
    g.beginPath()
    g.moveTo(110, 105)
    g.bezierCurveTo(50, 60, 75, 22, 110, 55)
    g.bezierCurveTo(145, 22, 170, 60, 110, 105)
    g.stroke()
    g.strokeStyle = '#3A2A20'
    g.font = '18px "Pixelify Sans", monospace'
    g.fillStyle = '#3A2A20'
    g.fillText('welcome to the block!', 38, 132)
  })
  const coffeeNote = make((g) => {
    g.strokeStyle = '#7FA9CE'
    g.strokeRect(85, 45, 50, 45) // mug
    g.beginPath()
    g.arc(140, 66, 12, -Math.PI / 2, Math.PI / 2)
    g.stroke()
    g.strokeStyle = '#B7BBC9'
    g.beginPath()
    g.moveTo(97, 38)
    g.quadraticCurveTo(103, 26, 97, 16)
    g.moveTo(117, 38)
    g.quadraticCurveTo(123, 26, 117, 16)
    g.stroke()
    g.fillStyle = '#3A2A20'
    g.font = '18px "Pixelify Sans", monospace'
    g.fillText('first coffee is on me ♪', 36, 128)
  })
  store.addGuestNote({ id: 'gn-seed-1', from: 'moon_latte', art: heartNote, at: Date.now() - 40 * 60000 })
  store.addGuestNote({ id: 'gn-seed-2', from: 'peach_pit', art: coffeeNote, at: Date.now() - 8 * 60000 })
}
