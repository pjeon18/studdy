// A short guided tour of the UI after onboarding: a pixel callout bubble
// hops between the real controls and says what each one does.
import { sfx } from './sounds'
import * as store from './store'
import { toast } from './ui'

interface TourStep {
  sel: string
  text: string
}

const STEPS: TourStep[] = [
  { sel: '[data-m="edit"]', text: '✎ edit café — place, move, rotate & recolor furniture. put a chair next to a table and it becomes a seat people can study at ♪' },
  { sel: '[data-m="shop"]', text: '◍ shop — spend beans on new furniture. orders arrive as packages at your door.' },
  { sel: '[data-m="visit"]', text: '✈ visit — study at friends\' cafés. every café shares the same sprint clock.' },
  { sel: '.clock-pill', text: 'the communal sprint clock — everyone everywhere sprints and breaks together. you earn 1 ◍ per focused minute while seated.' },
  { sel: '.cafe-tab', text: '✦ café — time of day, room & lamp lights, café music, and sound live here.' },
  { sel: '.brand-sub', text: 'your café\'s card — tap + to set open/closed, house rules, music, and your guestbook.' },
  { sel: '.friends-tab', text: '♥ friends — see who\'s online and studying, and drop into their café.' },
]

export function runTour(ui: HTMLElement, onDone: () => void) {
  const ring = document.createElement('div')
  ring.className = 'tour-ring'
  const bubble = document.createElement('div')
  bubble.className = 'y2k-window tour-bubble'
  ui.appendChild(ring)
  ui.appendChild(bubble)

  let i = 0

  const finish = () => {
    ring.remove()
    bubble.remove()
    const firstTime = localStorage.getItem('studdy-tour-done') !== '1'
    localStorage.setItem('studdy-tour-done', '1')
    if (firstTime) {
      // a housewarming gift for making it through the tour
      store.addBeans(150)
      sfx.earn()
      toast('a little housewarming gift: +150 beans — go explore the shop ♪')
    }
    onDone()
  }

  const show = () => {
    // skip steps whose target is missing/hidden
    while (i < STEPS.length) {
      const el = document.querySelector(STEPS[i].sel) as HTMLElement | null
      if (el && el.offsetParent !== null) break
      i++
    }
    if (i >= STEPS.length) {
      finish()
      return
    }
    const step = STEPS[i]
    const el = document.querySelector(step.sel) as HTMLElement
    const r = el.getBoundingClientRect()
    ring.style.left = `${r.left - 8}px`
    ring.style.top = `${r.top - 8}px`
    ring.style.width = `${r.width + 16}px`
    ring.style.height = `${r.height + 16}px`
    bubble.innerHTML = `
      <div class="y2k-body tour-body">
        <p>${step.text}</p>
        <div class="tour-actions">
          <span class="tour-count">${i + 1} / ${STEPS.length}</span>
          <button class="glossy-btn ed-mini tour-skip">skip</button>
          <button class="glossy-btn btn-pink ed-mini tour-next">${i === STEPS.length - 1 ? 'done ♪' : 'next ▸'}</button>
        </div>
      </div>
    `
    // place the bubble near the target, kept on screen (measure the real
    // box — on phones the text wraps taller than the desktop guess)
    const bw = Math.min(264, window.innerWidth - 16)
    const bh = bubble.offsetHeight || 120
    let bx = r.left + r.width / 2 - bw / 2
    let by = r.top - bh - 14
    if (by < 8) by = r.bottom + 14
    bx = Math.min(Math.max(8, bx), window.innerWidth - bw - 8)
    by = Math.min(Math.max(8, by), window.innerHeight - bh - 8)
    bubble.style.left = `${bx}px`
    bubble.style.top = `${by}px`
    bubble.querySelector('.tour-next')!.addEventListener('click', () => {
      sfx.tick()
      i++
      show()
    })
    bubble.querySelector('.tour-skip')!.addEventListener('click', finish)
  }

  show()
}

export function tourDone(): boolean {
  return localStorage.getItem('studdy-tour-done') === '1'
}
