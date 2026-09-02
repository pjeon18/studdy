// First-run onboarding: name your café → style the room → order the basics
// → you're open. Runs over the live scene so every choice shows immediately.
import * as store from './store'
import { CATALOG } from './items'
import { FLOOR_CHOICES, WALL_CHOICES } from './shell'
import { itemThumb } from './thumbs'
import { beanImg } from './pixelui'
import { sfx } from './sounds'
import { toast, esc } from './ui'
import type { FloorStyle, WallStyle } from './types'
import type { Game } from './game'

export function needsOnboarding(): boolean {
  return store.save.info.name === ''
}

export function runOnboarding(ui: HTMLElement, game: Game, onDone: () => void) {
  // the wizard is modal: nothing else is clickable until it finishes
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop ob-backdrop'
  ui.appendChild(backdrop)

  const win = document.createElement('div')
  win.className = 'y2k-window onboard-window'
  win.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">welcome to studdy</span></div>
    <div class="y2k-body ob-body"></div>
  `
  ui.appendChild(win)
  const body = win.querySelector('.ob-body') as HTMLElement
  const title = win.querySelector('.tb-title') as HTMLElement

  let username = ''

  const dots = (step: number) =>
    `<div class="ob-dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`

  // ---------- step 1: name ----------
  function stepName() {
    title.textContent = 'welcome to studdy'
    body.innerHTML = `
      ${dots(0)}
      <p class="ob-lead">every café needs an owner. what should we call you?</p>
      <div class="ob-name-row">
        <input class="px-input ob-name" placeholder="your name…" maxlength="14" spellcheck="false" />
        <span class="ob-suffix">'s café</span>
      </div>
      <div class="ob-actions"><button class="glossy-btn btn-pink ob-next disabled">next ▸</button></div>
    `
    const input = body.querySelector('.ob-name') as HTMLInputElement
    const next = body.querySelector('.ob-next') as HTMLButtonElement
    input.addEventListener('input', () => {
      username = input.value.trim().toLowerCase().replace(/\s+/g, '_')
      next.classList.toggle('disabled', username.length < 2)
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && username.length >= 2) go()
    })
    const go = () => {
      store.setInfo({ name: username })
      stepRoom()
    }
    next.addEventListener('click', () => {
      if (username.length >= 2) go()
    })
    setTimeout(() => input.focus(), 50)
  }

  // ---------- step 2: room (live edits behind the window) ----------
  function stepRoom() {
    title.textContent = `${username}'s café`
    body.innerHTML = `
      ${dots(1)}
      <p class="ob-lead">make the room yours — it changes live behind this window.</p>
      <div class="ob-room-controls">
      <div class="ed-row ed-row-swatch"><span>walls</span><span class="ed-ctrl ed-swatches">${WALL_CHOICES.map(
        (c) => `<button class="swatch" data-wall="${c.id}" style="background:${c.css}"></button>`
      ).join('')}</span></div>
      <div class="ed-row ed-row-swatch"><span>floor</span><span class="ed-ctrl ed-swatches">${FLOOR_CHOICES.map(
        (c) => `<button class="swatch" data-floor="${c.id}" style="background:${c.css}"></button>`
      ).join('')}</span></div>
      <div class="ed-row"><span>width</span><span class="ed-ctrl"><button class="glossy-btn ed-mini" data-a="w-">−</button><b class="ed-val" data-v="w"></b><button class="glossy-btn ed-mini" data-a="w+">+</button></span></div>
      <div class="ed-row"><span>depth</span><span class="ed-ctrl"><button class="glossy-btn ed-mini" data-a="d-">−</button><b class="ed-val" data-v="d"></b><button class="glossy-btn ed-mini" data-a="d+">+</button></span></div>
      </div>
      <div class="ed-note">you can change all of this any time in ✎ edit café ♪</div>
      <div class="ob-actions"><button class="glossy-btn btn-pink ob-next">next ▸</button></div>
    `
    // listener lives on the step's own container so it dies with the step
    const controls = body.querySelector('.ob-room-controls') as HTMLElement
    const paint = () => {
      ;(controls.querySelector('[data-v="w"]') as HTMLElement).textContent = String(store.save.room.w)
      ;(controls.querySelector('[data-v="d"]') as HTMLElement).textContent = String(store.save.room.d)
      controls.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
        b.classList.toggle('active', b.dataset.floor === store.save.room.floor || b.dataset.wall === store.save.room.wallStyle)
      })
    }
    controls.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button') as HTMLElement | null
      if (!btn) return
      const { w, d } = store.save.room
      if (btn.dataset.a === 'w-') store.setRoomSize(w - 2, d)
      else if (btn.dataset.a === 'w+') store.setRoomSize(w + 2, d)
      else if (btn.dataset.a === 'd-') store.setRoomSize(w, d - 2)
      else if (btn.dataset.a === 'd+') store.setRoomSize(w, d + 2)
      if (btn.dataset.wall) store.setWallStyle(btn.dataset.wall as WallStyle)
      if (btn.dataset.floor) store.setFloor(btn.dataset.floor as FloorStyle)
      paint()
    })
    paint()
    ;(body.querySelector('.ob-next') as HTMLButtonElement).addEventListener('click', stepShop)
  }

  // ---------- step 3: order the basics ----------
  function stepShop() {
    title.textContent = 'stock the café'
    const BASICS = ['table-s', 'table-m', 'chair', 'stool']
    body.innerHTML = `
      ${dots(2)}
      <p class="ob-lead">order at least a table and a seat — they ship to your door.</p>
      <div class="ed-row shop-beans"><span>your beans</span><b class="ob-beans"></b></div>
      <div class="ob-shop"></div>
      <div class="ed-note ob-need">needed: 1 table · 1 seat</div>
      <div class="ob-actions"><button class="glossy-btn btn-pink ob-next disabled">open the café ▸</button></div>
    `
    const list = body.querySelector('.ob-shop') as HTMLElement
    const beansEl = body.querySelector('.ob-beans') as HTMLElement
    const needEl = body.querySelector('.ob-need') as HTMLElement
    const next = body.querySelector('.ob-next') as HTMLButtonElement
    let tables = 0
    let seatsN = 0
    const paint = () => {
      // soft-lock guard: you must always be able to afford what's still needed
      let shortfall = 0
      if (tables < 1) shortfall += CATALOG['table-s'].price
      if (seatsN < 1) shortfall += CATALOG.stool.price
      if (shortfall > store.save.beans) {
        store.addBeans(shortfall - store.save.beans)
        toast('the café fairy spotted you a few beans ♪')
      }
      beansEl.innerHTML = `${store.save.beans} ${beanImg(13)}`
      const needT = tables < 1 ? '1 table' : ''
      const needS = seatsN < 1 ? '1 seat' : ''
      needEl.textContent = needT || needS ? `still needed: ${[needT, needS].filter(Boolean).join(' · ')}` : 'that’s a café — everything arrives at your door ♪'
      next.classList.toggle('disabled', tables < 1 || seatsN < 1)
    }
    for (const id of BASICS) {
      const e = CATALOG[id]
      const row = document.createElement('div')
      row.className = 'shop-row'
      row.innerHTML = `<img class="shop-thumb" alt="" /><span class="shop-name">${e.name}<i>${e.seats ? `seats 1` : 'work surface'}</i></span><b class="shop-price">${e.price} ${beanImg(12)}</b>`
      ;(row.querySelector('.shop-thumb') as HTMLImageElement).src = itemThumb(id, e.variants?.[0])
      const buy = document.createElement('button')
      buy.className = 'glossy-btn ed-mini'
      buy.textContent = 'order'
      buy.addEventListener('click', () => {
        if (!store.orderItem(id)) {
          toast('not enough beans…')
          return
        }
        sfx.coin()
        game.float(`-${e.price} beans`, 'spend')
        if (e.seats) seatsN++
        else tables++
        paint()
      })
      row.appendChild(buy)
      list.appendChild(row)
    }
    paint()
    next.addEventListener('click', () => {
      if (tables < 1 || seatsN < 1) return
      stepGuestbook()
    })
  }

  // ---------- step 4: guestbook consent ----------
  function stepGuestbook() {
    title.textContent = 'the guestbook'
    body.innerHTML = `
      ${dots(3)}
      <p class="ob-lead">every café gets a <b>guestbook</b> by the door. visitors can sign it and leave little hand-drawn notes for you.</p>
      <p class="ob-lead">allow visitors to leave notes in yours?</p>
      <div class="ed-note">you can turn this on or off any time in your café's + card</div>
      <div class="ob-actions ob-actions-two">
        <button class="glossy-btn ob-gb-no">no thanks</button>
        <button class="glossy-btn btn-mint ob-gb-yes">yes, allow notes ♪</button>
      </div>
    `
    ;(body.querySelector('.ob-gb-yes') as HTMLButtonElement).addEventListener('click', () => {
      store.setInfo({ guestbook: true })
      stepDone()
    })
    ;(body.querySelector('.ob-gb-no') as HTMLButtonElement).addEventListener('click', () => {
      store.setInfo({ guestbook: false })
      stepDone()
    })
  }

  // ---------- step 5: open ----------
  function stepDone() {
    title.textContent = 'you’re open ♪'
    body.innerHTML = `
      ${dots(4)}
      <p class="ob-lead"><b>${esc(username)}'s café</b> is officially open.</p>
      <ul class="ob-list">
        <li>your order lands at the door in a moment — click the box</li>
        <li>✎ edit café to place furniture, ◍ shop for more</li>
        <li>sit anywhere to study · 1 ◍ per focused minute</li>
        <li>✈ visit friends' cafés — everyone shares one sprint clock</li>
      </ul>
      <div class="ob-actions"><button class="glossy-btn btn-mint ob-next">let's go ♪</button></div>
    `
    ;(body.querySelector('.ob-next') as HTMLButtonElement).addEventListener('click', () => {
      sfx.pop()
      backdrop.remove()
      win.remove()
      onDone()
    })
  }

  stepName()
}
