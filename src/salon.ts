// The styling panel behind the shop mirrors: barbershop edits hair & skin,
// the boutique edits sweater & glasses — and sells the WARDROBE (hats, tag
// charms), the personal endgame sinks from docs/ECONOMY.md. Base looks stay
// free forever; the paid pieces are pure expression.
import * as store from './store'
import { SEAT_COLORS } from './items'
import { HATS, CHARMS } from './people'
import { toast } from './ui'
import { drawBust } from './people'
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
      <div class="salon-fig">
        <canvas class="salon-preview" width="160" height="208"></canvas>
        <div class="salon-name"></div>
      </div>
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
  const nameEl = win.querySelector('.salon-name') as HTMLElement
  const paint = () => {
    const a = store.save.avatar
    // the full look, hat included — exactly what everyone sees in the room
    drawBust(preview, { hair: a.hair, sweater: a.sweater, skin: a.skin, glasses: a.glasses, hairStyle: a.hairStyle, hat: a.hat })
    nameEl.textContent = `${a.charm ? a.charm + ' ' : ''}${store.save.info.name || 'you'} ♪`
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
        store.bumpCounter('salon')
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
      { v: 'true', label: 'on ♪' },
    ])

    // ---------- the wardrobe: hats + tag charms (owned forever) ----------
    const wardRow = (
      label: string,
      k: 'hat' | 'charm',
      entries: { id: string; label: string; price: number; value: string }[]
    ) => {
      const row = document.createElement('div')
      row.className = 'ed-row salon-ward'
      row.innerHTML = `<span>${label}</span><span class="ed-ctrl salon-ward-btns"></span>`
      const ctrl = row.querySelector('.ed-ctrl') as HTMLElement
      const repaint = () => {
        ctrl.innerHTML = ''
        const none = document.createElement('button')
        none.className = 'glossy-btn ed-mini' + (!store.save.avatar[k] ? ' active-station' : '')
        none.textContent = 'none'
        none.addEventListener('click', () => {
          sfx.tick()
          store.setAvatar({ [k]: '' } as never)
          repaint()
          paint()
        })
        ctrl.appendChild(none)
        for (const e of entries) {
          const owned = store.save.wardrobe.includes(e.id)
          const worn = store.save.avatar[k] === e.value
          const b = document.createElement('button')
          b.className = 'glossy-btn ed-mini' + (worn ? ' active-station' : '')
          b.innerHTML = owned ? e.label : `${e.label} <i class="ward-price">${e.price}◍</i>`
          b.addEventListener('click', () => {
            if (!store.save.wardrobe.includes(e.id)) {
              if (!store.buyWardrobe(e.id, e.price)) {
                toast(`${e.price} ◍ — keep studying ♪`)
                return
              }
              sfx.coin()
              toast(`the ${e.label.replace(/<[^>]*>/g, '')} is yours forever ♪`)
            } else {
              sfx.tick()
            }
            store.setAvatar({ [k]: worn ? '' : e.value } as never)
            repaint()
            paint()
          })
          ctrl.appendChild(b)
        }
      }
      repaint()
      rows.appendChild(row)
    }
    wardRow('hats', 'hat', HATS.map((h) => ({ id: h.id, label: h.name, price: h.price, value: h.id })))
    wardRow('tag charm', 'charm', CHARMS.map((c) => ({ id: c.id, label: `${c.glyph} ${c.name}`, price: c.price, value: c.glyph })))
    const wnote = document.createElement('div')
    wnote.className = 'ed-note'
    wnote.textContent = 'hats and charms follow you to every café — everyone sees them ♪'
    rows.appendChild(wnote)
  }
  const note = document.createElement('div')
  note.className = 'ed-note'
  note.textContent = 'changes apply right away — take a look at yourself ♪'
  rows.appendChild(note)
  paint()
}
