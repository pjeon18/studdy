// The styling panel behind the shop mirrors: barbershop edits hair & skin,
// the boutique edits sweater & glasses. Changes apply to the live avatar.
import * as store from './store'
import { SEAT_COLORS } from './items'
import { drawPortrait } from './ui'
import { sfx } from './sounds'

export const SKIN_TONES = ['#FFDCBD', '#F3C79F', '#DFA878', '#B07A4C', '#8A5A34']
export const HAIR_COLORS = ['#7C5940', '#3A3230', '#8A5F3F', '#A25B3C', '#C89058', '#D9A868', '#E77E9F', '#9D8BD0', '#6FBFA3', '#B7BBC9']

let win: HTMLElement | null = null

/** Close the styling panel (e.g. when you travel). */
export function closeSalon() {
  win?.remove()
  win = null
}

export function openSalon(ui: HTMLElement, kind: 'barber' | 'boutique' | 'all') {
  win?.remove()
  win = document.createElement('div')
  win.className = 'y2k-window salon-window'
  const title = kind === 'barber' ? 'snip snip ✂ — new look' : kind === 'boutique' ? 'thread & thimble — fitting room' : 'the mirror'
  win.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">${title}</span><button class="tb-close">×</button></div>
    <div class="y2k-body salon-body">
      <canvas class="salon-preview" width="120" height="120"></canvas>
      <div class="salon-rows"></div>
    </div>
  `
  ui.appendChild(win)
  win.querySelector('.tb-close')!.addEventListener('click', () => {
    win?.remove()
    win = null
  })
  const rows = win.querySelector('.salon-rows') as HTMLElement
  const preview = win.querySelector('.salon-preview') as HTMLCanvasElement
  const paint = () => {
    const a = store.save.avatar
    drawPortrait(preview, a.hair, a.sweater, a.skin, a.glasses, a.hairStyle === 'long')
    rows.querySelectorAll<HTMLElement>('.swatch, .salon-opt').forEach((b) => {
      const k = b.dataset.k!
      const v = b.dataset.v!
      const cur =
        k === 'skin' ? a.skin : k === 'hair' ? a.hair : k === 'sweater' ? a.sweater : k === 'hairStyle' ? a.hairStyle : String(a.glasses)
      b.classList.toggle('active', cur === v)
    })
  }

  const swatchRow = (label: string, k: string, values: { v: string; css: string }[]) => {
    const row = document.createElement('div')
    row.className = 'ed-row ed-row-swatch'
    row.innerHTML = `<span>${label}</span><span class="ed-ctrl ed-swatches"></span>`
    const ctrl = row.querySelector('.ed-ctrl') as HTMLElement
    for (const { v, css } of values) {
      const b = document.createElement('button')
      b.className = 'swatch'
      b.dataset.k = k
      b.dataset.v = v
      b.style.background = css
      b.addEventListener('click', () => {
        sfx.tick()
        store.setAvatar({ [k]: v } as never)
        paint()
      })
      ctrl.appendChild(b)
    }
    rows.appendChild(row)
  }

  const optRow = (label: string, k: string, opts: { v: string; label: string }[]) => {
    const row = document.createElement('div')
    row.className = 'ed-row'
    row.innerHTML = `<span>${label}</span><span class="ed-ctrl"></span>`
    const ctrl = row.querySelector('.ed-ctrl') as HTMLElement
    for (const o of opts) {
      const b = document.createElement('button')
      b.className = 'glossy-btn ed-mini salon-opt'
      b.dataset.k = k
      b.dataset.v = o.v
      b.textContent = o.label
      b.addEventListener('click', () => {
        sfx.tick()
        store.setAvatar((k === 'glasses' ? { glasses: o.v === 'true' } : { [k]: o.v }) as never)
        paint()
      })
      ctrl.appendChild(b)
    }
    rows.appendChild(row)
  }

  if (kind !== 'boutique') {
    swatchRow('skin', 'skin', SKIN_TONES.map((v) => ({ v, css: v })))
    swatchRow('hair', 'hair', HAIR_COLORS.map((v) => ({ v, css: v })))
    optRow('length', 'hairStyle', [
      { v: 'short', label: 'short' },
      { v: 'long', label: 'long ♪' },
    ])
  }
  if (kind !== 'barber') {
    swatchRow('sweater', 'sweater', Object.values(SEAT_COLORS).map(([v]) => ({ v, css: v })))
    optRow('glasses', 'glasses', [
      { v: 'false', label: 'none' },
      { v: 'true', label: 'glasses ♪' },
    ])
  }
  const note = document.createElement('div')
  note.className = 'ed-note'
  note.textContent = 'changes apply right away — take a look at yourself ♪'
  rows.appendChild(note)
  paint()
}
