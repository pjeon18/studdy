// Edit-mode UI: mode bar, room panel (structure, free), furnish panel
// (inventory tray + ghost placement), selection actions, debug tools.
// All in the pixel chrome.
import * as store from './store'
import * as clock from './clock'
import { CATALOG, variantColor } from './items'
import { FLOOR_CHOICES, WALL_CHOICES, DOOR_COLORS } from './shell'
import { itemThumb } from './thumbs'
import { DREAM_CAFES, FRIENDS, type DreamCafe, type FriendState } from './cafes'
import { toast, drawPortrait, collapsible, toggleRightWindow, esc } from './ui'
import { beanImg } from './pixelui'
import { sfx, setStation, STATIONS, isEnabled, setEnabled, setMusicVolume, getMusicVolume, nowPlaying, type Station } from './sounds'
import { capacityOfPlaced, type Game, type Session } from './game'
import { cloudConfigured, cloudUser, linkEmail, signOut, isDev } from './cloud'
import { fetchCafeByUser, listOpenCafes, listFriends, acceptRequest, declineRequest, getMyHandle, shareUrl, fetchLeaders, starsFor } from './social'
import { fetchMyClub, myClubCached, createClub, joinClub, leaveClub, kickMember, donate, clubhouseCafe } from './clubs'
import { whereIs } from './presence'
import type { FloorStyle, WallStyle } from './types'

export interface Editor {
  setCapacity: (n: number) => void
  setSelection: (sel: { uid: string; name: string; itemId: string; variant?: string } | null) => void
  setPlacing: (itemId: string | null) => void
  setVisiting: (cafe: DreamCafe | null) => void
  setSession: (s: Session | null) => void
  openDirectory: () => void
  /** Live "n studying now" counts per café id, from realtime presence. */
  setLiveCounts: (counts: Record<string, number>) => void
  /** Incoming friend-request count (the ♥ tab badge). */
  setRequestCount: (n: number) => void
}

/** iPhone-style red counter pinned to a button's corner. */
function attachBadge(host: HTMLElement): (n: number) => void {
  const b = document.createElement('span')
  b.className = 'px-badge hidden'
  host.appendChild(b)
  return (n: number) => {
    b.textContent = String(Math.min(n, 9))
    b.classList.toggle('hidden', n <= 0)
  }
}

export function buildEditor(ui: HTMLElement, game: Game): Editor {
  // ---------- mode bar ----------
  const bar = document.createElement('div')
  bar.className = 'edit-bar'
  bar.innerHTML = `
    <button class="glossy-btn btn-pink" data-m="edit">✎ edit café</button>
    <button class="glossy-btn btn-mint" data-m="shop">◍ shop</button>
    <button class="glossy-btn" data-m="visit">✈ visit</button>
    <button class="glossy-btn gear-btn" data-m="settings">⚙</button>
    <button class="glossy-btn btn-pink hidden" data-m="home">⌂ go home</button>
    <button class="glossy-btn hidden" data-m="room">room</button>
    <button class="glossy-btn hidden" data-m="furnish">furnish</button>
    <button class="glossy-btn hidden" data-m="done">✕ done</button>
  `
  ui.appendChild(bar)
  const barBtn = (m: string) => bar.querySelector(`[data-m="${m}"]`) as HTMLButtonElement

  /** Left side shows ONE window at a time (room / furnish / shop / directory / info). */
  function showLeft(win: HTMLElement | null) {
    for (const w of [roomWin, furnishWin, shopWin, dirWin, infoWin]) w.classList.add('hidden')
    win?.classList.remove('hidden')
  }

  /** Standing in my clubhouse (members furnish it together). */
  const isClubVisit = () => {
    const v = game.getVisiting()
    const c = myClubCached()
    return !!v && !!c && v.id === `club:${c.id}`
  }

  function setMode(m: 'view' | 'room' | 'furnish') {
    game.setMode(m)
    const editing = m !== 'view'
    const club = isClubVisit()
    barBtn('edit').classList.toggle('hidden', editing || (!!visitingCafe && !club))
    barBtn('shop').classList.toggle('hidden', editing || !!visitingCafe)
    barBtn('room').classList.toggle('hidden', !editing || club) // clubhouse walls are fixed (v1)
    barBtn('furnish').classList.toggle('hidden', !editing)
    barBtn('done').classList.toggle('hidden', !editing)
    barBtn('room').classList.toggle('active', m === 'room')
    barBtn('furnish').classList.toggle('active', m === 'furnish')
    barBtn('visit').classList.toggle('hidden', editing)
    if (m === 'furnish') refreshInventory()
    showLeft(m === 'room' ? roomWin : m === 'furnish' ? furnishWin : null)
    selWin.classList.add('hidden')
    if (m !== 'room') refreshRoom()
  }
  // decorating & shopping are for breaks (or any time you're not mid-sprint)
  const sprintLocked = (): boolean => {
    if (!game.getSession() || clock.phase().mode === 'break') return false
    toast('finish the sprint first ♪ shop & edits open at break')
    return true
  }

  barBtn('edit').addEventListener('click', () => {
    if (sprintLocked()) return
    setMode('furnish')
  })
  barBtn('room').addEventListener('click', () => setMode('room'))
  barBtn('furnish').addEventListener('click', () => setMode('furnish'))
  barBtn('done').addEventListener('click', () => setMode('view'))
  barBtn('shop').addEventListener('click', () => {
    if (sprintLocked()) return
    const wasHidden = shopWin.classList.contains('hidden')
    setMode('view')
    showLeft(wasHidden ? shopWin : null)
  })
  barBtn('visit').addEventListener('click', () => {
    const wasHidden = dirWin.classList.contains('hidden')
    setMode('view')
    showLeft(wasHidden ? dirWin : null)
    if (wasHidden) {
      renderRealCafes()
      renderLeaders()
    }
  })
  barBtn('home').addEventListener('click', () => game.visit(null))

  // ---------- settings: a true modal (backdrop blocks everything until ×) ----------
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop hidden'
  ui.appendChild(backdrop)
  const setWin = document.createElement('div')
  setWin.className = 'y2k-window settings-window hidden'
  setWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">settings</span><button class="tb-close">×</button></div>
    <div class="y2k-body settings-body">
      <div class="set-row"><span>sound</span><button class="glossy-btn ed-mini set-sound"></button></div>
      <div class="set-row"><span>music volume</span><input type="range" class="lights-slider set-music" min="0" max="100" /></div>
      <div class="set-row"><span>name color</span><span class="ed-swatches set-namecolor"></span></div>
      <div class="set-row"><span>account</span><b class="set-acct"></b></div>
      <div class="set-acct-box">
        <input class="px-input set-email" type="email" placeholder="email for magic link…" />
        <button class="glossy-btn ed-mini set-link">send link ♪</button>
      </div>
      <div class="set-row set-out-row hidden"><span></span><button class="glossy-btn ed-mini set-out">sign out</button></div>
      <div class="set-row set-share-row hidden"><span>café link</span><button class="glossy-btn btn-pink ed-mini set-share">copy ♪</button></div>
      <div class="set-row set-card-row hidden"><span>share card</span><button class="glossy-btn btn-mint ed-mini set-card">make one ♪</button></div>
      <div class="set-row"><span>week recap</span><button class="glossy-btn btn-mint ed-mini set-recap">make one ♪</button></div>
      <div class="set-row"><span>save</span><button class="glossy-btn ed-mini set-reset">reset everything</button></div>
      <div class="ed-note">studdy · a study spot that never closes ♪</div>
    </div>
  `
  ui.appendChild(setWin)
  const setSound = setWin.querySelector('.set-sound') as HTMLButtonElement
  const setMusic = setWin.querySelector('.set-music') as HTMLInputElement
  const setAcct = setWin.querySelector('.set-acct') as HTMLElement
  const acctBox = setWin.querySelector('.set-acct-box') as HTMLElement
  const outRow = setWin.querySelector('.set-out-row') as HTMLElement
  const setEmail = setWin.querySelector('.set-email') as HTMLInputElement
  // the floating name-tag color — yours to pick, shown to everyone
  const NAME_COLORS = ['#FFFFFF', '#FFA9C1', '#F8BD62', '#7CC9AC', '#8FC1E8', '#B9A8E8', '#FF8C6B']
  const nameCtrl = setWin.querySelector('.set-namecolor') as HTMLElement
  const paintNameSwatches = () => {
    const cur = store.save.avatar.nameColor ?? '#FFFFFF'
    nameCtrl.querySelectorAll<HTMLElement>('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.v === cur))
  }
  for (const c of NAME_COLORS) {
    const b = document.createElement('button')
    b.className = 'swatch'
    b.dataset.v = c
    b.style.background = c
    b.addEventListener('click', () => {
      sfx.tick()
      store.setAvatar({ nameColor: c })
      paintNameSwatches()
    })
    nameCtrl.appendChild(b)
  }

  const shareRow = setWin.querySelector('.set-share-row') as HTMLElement
  const shareBtn = setWin.querySelector('.set-share') as HTMLButtonElement
  shareBtn.addEventListener('click', async () => {
    const url = shareUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast('café link copied — send it to a friend ♪')
    } catch {
      prompt('your café link ♪', url)
    }
  })
  const cardRow = setWin.querySelector('.set-card-row') as HTMLElement
  setWin.querySelector('.set-card')!.addEventListener('click', async () => {
    toast('drawing your card ♪')
    const { downloadShareCard } = await import('./sharecard')
    await downloadShareCard()
    toast('share card saved — post it ♪')
  })
  setWin.querySelector('.set-recap')!.addEventListener('click', async () => {
    toast('adding up your week ♪')
    const { downloadWeekCard } = await import('./sharecard')
    await downloadWeekCard()
    toast('week recap saved ♪')
  })
  const paintSettings = () => {
    setSound.textContent = isEnabled() ? 'on ♪' : 'off'
    setSound.classList.toggle('btn-mint', isEnabled())
    setMusic.value = String(Math.round(getMusicVolume() * 100))
    paintNameSwatches()
    const handle = getMyHandle()
    shareRow.classList.toggle('hidden', !handle)
    cardRow.classList.toggle('hidden', !handle)
    if (handle) shareBtn.textContent = `@${handle} · copy ♪`
    if (!cloudConfigured()) {
      setAcct.textContent = 'local only'
      acctBox.classList.add('hidden')
      outRow.classList.add('hidden')
      return
    }
    const u = cloudUser()
    if (!u) {
      setAcct.textContent = 'connecting…'
      acctBox.classList.add('hidden')
      outRow.classList.add('hidden')
    } else if (u.anonymous) {
      setAcct.textContent = 'guest · cloud save on ♪'
      acctBox.classList.remove('hidden')
      outRow.classList.add('hidden')
    } else {
      setAcct.textContent = u.email ?? 'signed in ♪'
      acctBox.classList.add('hidden')
      outRow.classList.remove('hidden')
    }
  }
  setWin.querySelector('.set-link')!.addEventListener('click', async () => {
    const email = setEmail.value.trim()
    if (!email.includes('@')) {
      toast('enter an email first ♪')
      return
    }
    toast(await linkEmail(email))
  })
  setWin.querySelector('.set-out')!.addEventListener('click', async () => {
    await signOut()
    toast('signed out — playing locally ♪')
    paintSettings()
  })
  setSound.addEventListener('click', () => {
    setEnabled(!isEnabled())
    paintSettings()
  })
  setMusic.addEventListener('input', () => setMusicVolume(Number(setMusic.value) / 100))
  setWin.querySelector('.set-reset')!.addEventListener('click', () => store.resetSave())
  const closeSettings = () => {
    backdrop.classList.add('hidden')
    setWin.classList.add('hidden')
  }
  setWin.querySelector('.tb-close')!.addEventListener('click', closeSettings)
  barBtn('settings').addEventListener('click', () => {
    paintSettings()
    backdrop.classList.remove('hidden')
    setWin.classList.remove('hidden')
  })

  // ---------- room panel ----------
  const roomWin = document.createElement('div')
  roomWin.className = 'y2k-window editor-window hidden'
  roomWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">room</span></div>
    <div class="y2k-body">
      <div class="ed-row"><span>width</span><span class="ed-ctrl"><button class="glossy-btn ed-mini" data-a="w-">−</button><b class="ed-val" data-v="w"></b><button class="glossy-btn ed-mini" data-a="w+">+</button></span></div>
      <div class="ed-row"><span>depth</span><span class="ed-ctrl"><button class="glossy-btn ed-mini" data-a="d-">−</button><b class="ed-val" data-v="d"></b><button class="glossy-btn ed-mini" data-a="d+">+</button></span></div>
      <div class="ed-row ed-row-swatch"><span>floor</span><span class="ed-ctrl ed-swatches" data-k="floor"></span></div>
      <div class="ed-row ed-row-swatch"><span>walls</span><span class="ed-ctrl ed-swatches" data-k="wall"></span></div>
      <div class="ed-row"><span>windows left</span><span class="ed-ctrl"><button class="glossy-btn ed-mini" data-a="wl-">−</button><b class="ed-val" data-v="wl"></b><button class="glossy-btn ed-mini" data-a="wl+">+</button></span></div>
      <div class="ed-row"><span>windows right</span><span class="ed-ctrl"><button class="glossy-btn ed-mini" data-a="wb-">−</button><b class="ed-val" data-v="wb"></b><button class="glossy-btn ed-mini" data-a="wb+">+</button></span></div>
      <div class="ed-row"><span>door</span><span class="ed-ctrl">
        <button class="glossy-btn ed-mini" data-a="door-">◀</button>
        <button class="glossy-btn ed-mini" data-a="doorwall">↔</button>
        <button class="glossy-btn ed-mini" data-a="door+">▶</button>
        <button class="glossy-btn ed-mini" data-a="doorkind"></button>
      </span></div>
      <div class="ed-row ed-row-swatch"><span>door color</span><span class="ed-ctrl ed-swatches" data-k="door"></span></div>
      <div class="ed-note">structural edits are free ♪</div>
    </div>
  `
  ui.appendChild(roomWin)
  // swatch grids come from the shell's catalogs
  const floorCtrl = roomWin.querySelector('[data-k="floor"]') as HTMLElement
  const wallCtrl = roomWin.querySelector('[data-k="wall"]') as HTMLElement
  for (const c of FLOOR_CHOICES) {
    const b = document.createElement('button')
    b.className = 'swatch'
    b.dataset.floor = c.id
    b.style.background = c.css
    floorCtrl.appendChild(b)
  }
  for (const c of WALL_CHOICES) {
    const b = document.createElement('button')
    b.className = 'swatch'
    b.dataset.wall = c.id
    b.style.background = c.css
    wallCtrl.appendChild(b)
  }
  const doorCtrl = roomWin.querySelector('[data-k="door"]') as HTMLElement
  for (const c of DOOR_COLORS) {
    const b = document.createElement('button')
    b.className = 'swatch'
    b.dataset.door = c.id
    b.style.background = c.css
    doorCtrl.appendChild(b)
  }

  function refreshRoom() {
    ;(roomWin.querySelector('[data-v="w"]') as HTMLElement).textContent = String(store.save.room.w)
    ;(roomWin.querySelector('[data-v="d"]') as HTMLElement).textContent = String(store.save.room.d)
    ;(roomWin.querySelector('[data-v="wb"]') as HTMLElement).textContent = String(store.windowCount('back'))
    ;(roomWin.querySelector('[data-v="wl"]') as HTMLElement).textContent = String(store.windowCount('left'))
    const door = store.save.room.openings.find((o) => o.kind === 'door')
    ;(roomWin.querySelector('[data-a="doorkind"]') as HTMLElement).textContent =
      (door?.doorKind ?? 'classic') === 'glass' ? 'glass' : 'classic'
    roomWin.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
      b.classList.toggle(
        'active',
        b.dataset.floor === store.save.room.floor ||
          b.dataset.wall === store.save.room.wallStyle ||
          (!!b.dataset.door && b.dataset.door === (door?.doorColor ?? '#3E7C5B'))
      )
    })
  }

  // Structural edits are FREE for now. The escalating costs (width/depth
  // 10,20,30…; windows 15,30,45…) were rolled back 2026-09-03: charging
  // for room changes only after a free start read as a bait-and-switch —
  // structure pricing waits for the comprehensive economy pass.

  roomWin.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    const a = (btn as HTMLElement).dataset.a
    const { w, d } = store.save.room
    if (a === 'w-') store.setRoomSize(w - 2, d)
    else if (a === 'w+') store.setRoomSize(w + 2, d)
    else if (a === 'd-') store.setRoomSize(w, d - 2)
    else if (a === 'd+') store.setRoomSize(w, d + 2)
    else if (a === 'wb-') store.setWindowCount('back', store.windowCount('back') - 1)
    else if (a === 'wb+') store.setWindowCount('back', store.windowCount('back') + 1)
    else if (a === 'wl-') store.setWindowCount('left', store.windowCount('left') - 1)
    else if (a === 'wl+') store.setWindowCount('left', store.windowCount('left') + 1)
    else if (a === 'door-') store.moveDoor(-1)
    else if (a === 'door+') store.moveDoor(1)
    else if (a === 'doorwall') store.doorWall(store.save.room.openings.find((o) => o.kind === 'door')?.wall === 'left' ? 'back' : 'left')
    else if (a === 'doorkind') {
      const door = store.save.room.openings.find((o) => o.kind === 'door')
      store.setDoorStyle({ doorKind: (door?.doorKind ?? 'classic') === 'glass' ? 'classic' : 'glass' })
    }
    const fl = (btn as HTMLElement).dataset.floor as FloorStyle | undefined
    if (fl) store.setFloor(fl)
    const wl = (btn as HTMLElement).dataset.wall as WallStyle | undefined
    if (wl) store.setWallStyle(wl)
    const dc = (btn as HTMLElement).dataset.door
    if (dc) store.setDoorStyle({ doorColor: dc })
    refreshRoom()
  })

  // ---------- furnish panel ----------
  const furnishWin = document.createElement('div')
  furnishWin.className = 'y2k-window editor-window hidden'
  furnishWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">furnish</span></div>
    <div class="y2k-body">
      <div class="inv-grid"></div>
      <div class="ed-note ed-cap">seats: 0</div>
      <div class="ed-note">click to place · R rotate · esc cancel</div>
    </div>
  `
  ui.appendChild(furnishWin)
  const invGrid = furnishWin.querySelector('.inv-grid') as HTMLElement
  const capEl = furnishWin.querySelector('.ed-cap') as HTMLElement

  function refreshInventory() {
    invGrid.innerHTML = ''
    ;(furnishWin.querySelector('.tb-title') as HTMLElement).textContent = isClubVisit() ? 'furnish the clubhouse' : 'furnish'
    if (isClubVisit()) {
      // the clubhouse shops straight from the catalog — the treasury pays
      const club = myClubCached()!
      const bal = document.createElement('div')
      bal.className = 'ed-note club-bal'
      bal.textContent = `treasury: ${club.treasury} ◍ — placing spends it ♪`
      invGrid.appendChild(bal)
      for (const entry of Object.values(CATALOG)) {
        const b = document.createElement('button')
        b.className = 'glossy-btn inv-btn'
        b.innerHTML = `${entry.name} <i>${entry.price} ◍</i>`
        b.addEventListener('click', () => {
          const variants = entry.variants
          const variant = variants ? variants[Math.floor(Math.random() * variants.length)] : undefined
          game.startPlacing(entry.id, variant)
          invGrid.querySelectorAll('.inv-btn').forEach((x) => x.classList.remove('active'))
          b.classList.add('active')
        })
        invGrid.appendChild(b)
      }
      return
    }
    for (const [id, n] of Object.entries(store.save.inventory)) {
      if (n <= 0 || !CATALOG[id]) continue
      const b = document.createElement('button')
      b.className = 'glossy-btn inv-btn'
      b.innerHTML = `${CATALOG[id].name} <i>×${n}</i>`
      if (store.save.newItems.includes(id)) b.innerHTML += `<em class="new-pill">new</em>`
      b.addEventListener('click', () => {
        store.markItemSeen(id) // the red pill clears once you pick it up
        const variants = CATALOG[id].variants
        const variant = variants ? variants[Math.floor(Math.random() * variants.length)] : undefined
        game.startPlacing(id, variant)
        invGrid.querySelectorAll('.inv-btn').forEach((x) => x.classList.remove('active'))
        b.classList.add('active')
      })
      invGrid.appendChild(b)
    }
  }
  store.on('inventory', refreshInventory)
  store.on('newitems', refreshInventory)

  // notification counters: unseen items on the edit button…
  const editBadge = attachBadge(barBtn('edit'))
  const paintEditBadge = () => editBadge(store.save.newItems.length)
  store.on('newitems', paintEditBadge)
  paintEditBadge()

  // ---------- selection actions ----------
  const selWin = document.createElement('div')
  selWin.className = 'y2k-window sel-window hidden'
  selWin.innerHTML = `
    <div class="y2k-body sel-body">
      <b class="sel-name"></b>
      <span class="sel-variants"></span>
      <button class="glossy-btn ed-mini" data-s="rotate">⟳</button>
      <button class="glossy-btn ed-mini" data-s="move">✥</button>
      <button class="glossy-btn ed-mini" data-s="store">⤓</button>
      <button class="glossy-btn ed-mini" data-s="close">✕</button>
    </div>
  `
  ui.appendChild(selWin)
  const selVariants = selWin.querySelector('.sel-variants') as HTMLElement
  selWin.addEventListener('click', (e) => {
    const s = ((e.target as HTMLElement).closest('button') as HTMLElement)?.dataset.s
    if (s === 'rotate') game.rotateSelected()
    else if (s === 'move') game.moveSelected()
    else if (s === 'store') game.storeSelected()
    else if (s === 'close') selWin.classList.add('hidden')
  })

  // ---------- shop ----------
  const shopWin = document.createElement('div')
  shopWin.className = 'y2k-window editor-window shop-window hidden'
  shopWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">shop</span><button class="tb-close">×</button></div>
    <div class="y2k-body">
      <div class="ed-row shop-beans"><span>your beans</span><b class="bean-count">0 ◍</b></div>
      <div class="shop-tabs"></div>
      <div class="shop-list"></div>
      <div class="ed-note">orders arrive at your door in a moment ♪</div>
    </div>
  `
  ui.appendChild(shopWin)
  shopWin.querySelector('.tb-close')!.addEventListener('click', () => shopWin.classList.add('hidden'))
  const shopTabs = shopWin.querySelector('.shop-tabs') as HTMLElement
  const shopList = shopWin.querySelector('.shop-list') as HTMLElement
  const beanCount = shopWin.querySelector('.bean-count') as HTMLElement
  let shopCat = 'all'
  const cats = ['all', ...new Set(Object.values(CATALOG).map((e) => e.category)), 'themes']

  // café themes: floor + walls + door sold as a set (all from existing styles)
  const THEMES = [
    { id: 'strawberry-milk', name: 'strawberry milk', price: 60, floor: 'checker', wall: 'pink', door: '#F6D9E3' },
    { id: 'matcha-library', name: 'matcha library', price: 60, floor: 'walnut', wall: 'sage', door: '#3E7C5B' },
    { id: 'seaside-morning', name: 'seaside morning', price: 60, floor: 'checker-sky', wall: 'sky', door: '#7383BC' },
    { id: 'lavender-dusk', name: 'lavender dusk', price: 60, floor: 'carpet-lavender', wall: 'lavender', door: '#FDFCF6' },
    { id: 'snow-studio', name: 'snow studio', price: 45, floor: 'snow', wall: 'snow', door: '#FDFCF6' },
    { id: 'midnight-ink', name: 'midnight ink', price: 75, floor: 'checker-ink', wall: 'charcoal', door: '#5C5C68' },
  ]
  const themeSwatch = (t: (typeof THEMES)[number]) => {
    const f = FLOOR_CHOICES.find((c) => c.id === t.floor)?.css ?? '#EEE'
    const w = WALL_CHOICES.find((c) => c.id === t.wall)?.css ?? '#FFF'
    return `<span class="theme-swatch"><i style="background:${w}"></i><i style="background:${f}"></i><i style="background:${t.door}"></i></span>`
  }
  function applyTheme(t: (typeof THEMES)[number]) {
    store.setFloor(t.floor)
    store.setWallStyle(t.wall)
    store.setDoorStyle({ doorColor: t.door })
    toast(`${t.name} ♪`)
    sfx.pop()
  }
  for (const c of cats) {
    const b = document.createElement('button')
    b.className = 'glossy-btn shop-tab' + (c === 'all' ? ' active' : '')
    b.textContent = c
    b.addEventListener('click', () => {
      shopCat = c
      shopTabs.querySelectorAll('.shop-tab').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      refreshShop()
    })
    shopTabs.appendChild(b)
  }
  function refreshShop() {
    beanCount.innerHTML = `${store.save.beans} ${beanImg(13)}`
    shopList.innerHTML = ''
    if (shopCat === 'themes') {
      for (const t of THEMES) {
        const owned = store.save.themes.includes(t.id)
        const row = document.createElement('div')
        row.className = 'shop-row'
        row.innerHTML = `${themeSwatch(t)}<span class="shop-name">${t.name}<i>floor · walls · door</i></span><b class="shop-price">${owned ? 'owned' : `${t.price} ${beanImg(12)}`}</b>`
        const buy = document.createElement('button')
        buy.className = 'glossy-btn ed-mini' + (owned ? ' btn-mint' : '')
        buy.textContent = owned ? 'apply ♪' : 'buy'
        if (!owned && store.save.beans < t.price) buy.classList.add('disabled')
        buy.addEventListener('click', () => {
          if (visitingCafe) {
            toast('themes dress your own café ♪')
            return
          }
          if (store.buyTheme(t.id, t.price)) {
            applyTheme(t)
            refreshShop()
          } else {
            toast('not enough beans…')
          }
        })
        row.appendChild(buy)
        shopList.appendChild(row)
      }
      return
    }
    for (const e of Object.values(CATALOG)) {
      if (shopCat !== 'all' && e.category !== shopCat) continue
      const row = document.createElement('div')
      row.className = 'shop-row'
      const seats = e.seats ? ` · seats ${e.seats.length}` : ''
      row.innerHTML = `<img class="shop-thumb" alt="" /><span class="shop-name">${e.name}<i>${e.footprint[0]}×${e.footprint[1]}${seats}</i></span><b class="shop-price">${e.price} ${beanImg(12)}</b>`
      ;(row.querySelector('.shop-thumb') as HTMLImageElement).src = itemThumb(e.id, e.variants?.[0])
      const buy = document.createElement('button')
      buy.className = 'glossy-btn ed-mini'
      buy.textContent = 'order'
      if (store.save.beans < e.price) buy.classList.add('disabled')
      buy.addEventListener('click', () => {
        if (store.orderItem(e.id)) {
          toast('order placed · arriving soon ♪')
          game.float(`-${e.price} beans`, 'spend')
          sfx.coin()
        } else {
          toast('not enough beans…')
        }
      })
      row.appendChild(buy)
      shopList.appendChild(row)
    }
  }
  store.on('beans', refreshShop)
  refreshShop()

  // ---------- player strip: name · level + xp bar · beans (no box, just bold pixels) ----------
  const playerPill = document.createElement('div')
  playerPill.className = 'player-pill'
  playerPill.innerHTML = `
    <span class="pp-name"></span>
    <span class="pp-lv"></span>
    <span class="pp-streak" title="daily study streak"></span>
    <span class="pp-bar"><i class="pp-fill"></i></span>
    <b class="pp-beans-wrap">${beanImg(22)}<span class="pp-beans"></span></b>
  `
  ui.appendChild(playerPill)
  const ppName = playerPill.querySelector('.pp-name') as HTMLElement
  const ppLv = playerPill.querySelector('.pp-lv') as HTMLElement
  const ppFill = playerPill.querySelector('.pp-fill') as HTMLElement
  const ppBeans = playerPill.querySelector('.pp-beans') as HTMLElement
  let lastLevel = store.levelInfo().level
  const ppStreak = playerPill.querySelector('.pp-streak') as HTMLElement
  function refreshPill() {
    const li = store.levelInfo()
    ppName.textContent = store.save.info.name || 'you'
    ppLv.textContent = `lv ${li.level}`
    ppStreak.textContent = store.save.streak.count > 0 ? `${store.save.streak.count}★` : ''
    ppFill.style.width = `${Math.round((li.into / li.need) * 100)}%`
    ppBeans.textContent = String(store.save.beans)
    if (li.level > lastLevel) {
      lastLevel = li.level
      toast(`level up! you're lv ${li.level} ♪`)
      sfx.earn()
    }
  }
  store.on('xp', refreshPill)
  store.on('beans', refreshPill)
  store.on('info', refreshPill)
  store.on('goals', refreshPill) // the streak rides this event
  refreshPill()

  // ---------- deliveries queue (below the sprint clock) ----------
  const delivWin = document.createElement('div')
  delivWin.className = 'y2k-window deliv-window hidden'
  delivWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">deliveries</span></div>
    <div class="y2k-body"><div class="deliv-list"></div></div>
  `
  ui.appendChild(delivWin)
  const delivList = delivWin.querySelector('.deliv-list') as HTMLElement
  function refreshDeliveries() {
    const pkgs = store.save.packages
    delivWin.classList.toggle('hidden', pkgs.length === 0)
    if (!pkgs.length) return
    const now = Date.now()
    delivList.innerHTML = pkgs
      .map((p) => {
        const count = Object.values(p.items).reduce((a, b) => a + b, 0)
        const eta =
          p.arriveAt <= now
            ? '<b class="dv-here">at your door ♪</b>'
            : `<b>~${Math.max(1, Math.ceil((p.arriveAt - now) / 60000))} min</b>`
        return `<div class="deliv-row"><span class="dv-box">▣</span><span class="dv-what">${count} item${count === 1 ? '' : 's'}</span>${eta}</div>`
      })
      .join('')
  }
  store.on('packages', refreshDeliveries)
  setInterval(refreshDeliveries, 5000)
  refreshDeliveries()

  // ---------- café directory (visiting) ----------
  const dirWin = document.createElement('div')
  dirWin.className = 'y2k-window editor-window dir-window hidden'
  dirWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">café directory</span></div>
    <div class="y2k-body">
      <div class="dir-real hidden"><div class="fr-head">real cafés ♪</div><div class="dir-real-list"></div></div>
      <div class="dir-leaders hidden"><div class="fr-head">top studiers ♪</div><div class="dir-leaders-list"></div></div>
      <div class="fr-head">dream cafés ♪</div>
      <div class="dir-list"></div>
      <div class="ed-note">every café is a real study spot ♪</div>
    </div>
  `
  ui.appendChild(dirWin)
  let lastCounts: Record<string, number> = {}
  const paintLiveCounts = () => {
    dirWin.querySelectorAll<HTMLElement>('.dir-live').forEach((el) => {
      const n = lastCounts[el.dataset.cafe!] ?? 0
      el.textContent = n > 0 ? `${n} here now ♪` : ''
      el.classList.toggle('hidden', n <= 0)
    })
  }
  const dirReal = dirWin.querySelector('.dir-real') as HTMLElement
  const dirRealList = dirWin.querySelector('.dir-real-list') as HTMLElement
  const dirList = dirWin.querySelector('.dir-list') as HTMLElement

  const dirLeaders = dirWin.querySelector('.dir-leaders') as HTMLElement
  const dirLeadersList = dirWin.querySelector('.dir-leaders-list') as HTMLElement

  const visitRealCafe = async (userId: string) => {
    dirWin.classList.add('hidden')
    const cafe = await fetchCafeByUser(userId)
    if (cafe) game.visit(cafe)
    else toast('their café is closed right now ♪')
  }

  /** Other people's open cafés — owners who are home right now come first. */
  const renderRealCafes = async () => {
    const cafes = await listOpenCafes()
    dirReal.classList.toggle('hidden', !cafes.length)
    dirRealList.textContent = ''
    const ownerIn = (uid: string) => whereIs(uid) === `user:${uid}`
    cafes.sort((a, b) => Number(ownerIn(b.userId)) - Number(ownerIn(a.userId)))
    for (const c of cafes) {
      const row = document.createElement('div')
      row.className = 'dir-row'
      row.innerHTML = `
        <span class="dir-name">${esc(c.name)}'s café<i>@${esc(c.handle)}${ownerIn(c.userId) ? ' · <b class="dir-in">owner is in ♪</b>' : ''}</i></span>
        <span class="dir-meta"><b class="dir-stars">${'★'.repeat(starsFor(c.minutes))}</b><i class="dir-live hidden" data-cafe="user:${esc(c.userId)}"></i></span>
      `
      const go = document.createElement('button')
      go.className = 'glossy-btn ed-mini'
      go.textContent = 'visit'
      go.addEventListener('click', () => visitRealCafe(c.userId))
      row.appendChild(go)
      dirRealList.appendChild(row)
    }
    paintLiveCounts()
  }

  /** The xp leaderboard — see the cafés of the most devoted studiers. */
  const renderLeaders = async () => {
    const leaders = await fetchLeaders()
    dirLeaders.classList.toggle('hidden', !leaders.length)
    dirLeadersList.textContent = ''
    leaders.forEach((l, i) => {
      const row = document.createElement('div')
      row.className = 'dir-row'
      row.innerHTML = `
        <span class="dir-name">${i + 1}. ${esc(l.name)}<i>@${esc(l.handle)}</i></span>
        <span class="dir-meta"><b>lv ${store.levelInfo(l.xp).level}</b><i>${l.xp.toLocaleString()} xp</i></span>
      `
      const go = document.createElement('button')
      go.className = 'glossy-btn ed-mini'
      go.textContent = 'visit'
      go.addEventListener('click', () => visitRealCafe(l.userId))
      row.appendChild(go)
      dirLeadersList.appendChild(row)
    })
  }
  for (const cafe of DREAM_CAFES) {
    const row = document.createElement('div')
    row.className = 'dir-row'
    const seats = capacityOfPlaced(cafe.placed)
    row.innerHTML = `
      <span class="dir-name">${cafe.name}<i>${cafe.vibe}</i></span>
      <span class="dir-meta"><b>${cafe.ruleset}</b><i>${cafe.sims.length}/${seats} seats</i><i class="dir-live hidden" data-cafe="${cafe.id}"></i></span>
    `
    const go = document.createElement('button')
    go.className = 'glossy-btn ed-mini'
    go.textContent = 'visit'
    go.addEventListener('click', () => {
      dirWin.classList.add('hidden')
      game.visit(cafe)
    })
    row.appendChild(go)
    dirList.appendChild(row)
  }

  // ---------- session HUD (seated) ----------
  const hudWin = document.createElement('div')
  hudWin.className = 'y2k-window session-hud hidden'
  hudWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">studying</span></div>
    <div class="y2k-body">
      <div class="ed-row"><span>focused</span><b class="hud-time">0m</b></div>
      <input class="px-input hud-napkin" placeholder="napkin: working on…" maxlength="40" />
      <div class="hud-btns">
        <button class="glossy-btn ed-mini hud-hp active">♪ headphones</button>
        <button class="glossy-btn ed-mini hud-focus">focus view</button>
        <button class="glossy-btn ed-mini hud-leave">stand up</button>
      </div>
      <div class="ed-note hud-rate">earning 1 ◍ per focused minute ♪</div>
    </div>
  `
  ui.appendChild(hudWin)
  const hudTime = hudWin.querySelector('.hud-time') as HTMLElement
  const hudNapkin = hudWin.querySelector('.hud-napkin') as HTMLInputElement
  const hudHp = hudWin.querySelector('.hud-hp') as HTMLButtonElement
  const fmtHud = () => {
    // verified focused time — the same clock the payout uses
    const m = Math.max(0, Math.floor(game.getFocusSec() / 60))
    hudTime.textContent = m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
  }
  setInterval(() => {
    if (!hudWin.classList.contains('hidden')) fmtHud()
  }, 1000)
  hudNapkin.addEventListener('input', () => game.setNapkin(hudNapkin.value.trim()))
  hudHp.addEventListener('click', () => {
    const on = !hudHp.classList.contains('active')
    hudHp.classList.toggle('active', on)
    game.setHeadphones(on)
  })
  ;(hudWin.querySelector('.hud-leave') as HTMLButtonElement).addEventListener('click', () => game.leaveSeat())
  ;(hudWin.querySelector('.hud-focus') as HTMLButtonElement).addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('studdy:focusview'))
  )

  // ---------- marquee + café info card ----------
  const brandSub = document.querySelector('.brand-sub') as HTMLElement | null
  let visitingCafe: DreamCafe | null = null

  const infoWin = document.createElement('div')
  infoWin.className = 'y2k-window info-window hidden'
  infoWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">about this café</span><button class="tb-close">×</button></div>
    <div class="y2k-body info-body">
      <div class="ed-row"><span>status</span><button class="glossy-btn ed-mini info-open"></button></div>
      <div class="ed-row"><span>music</span><span class="ed-ctrl info-music"></span></div>
      <p class="info-now-playing"></p>
      <div class="ed-row info-gb-row"><span>guestbook</span><button class="glossy-btn ed-mini info-gb"></button></div>
      <div class="ed-row"><span>sprints</span><b class="info-rules-ro hidden"></b></div>
      <input class="px-input info-rules" placeholder="house rules…" maxlength="48" />
      <textarea class="px-input info-desc" rows="3" placeholder="describe your café…" maxlength="180"></textarea>
      <p class="info-desc-ro hidden"></p>
    </div>
  `
  ui.appendChild(infoWin)
  const infoOpenBtn = infoWin.querySelector('.info-open') as HTMLButtonElement
  const infoRules = infoWin.querySelector('.info-rules') as HTMLInputElement
  const infoRulesRo = infoWin.querySelector('.info-rules-ro') as HTMLElement
  const infoDesc = infoWin.querySelector('.info-desc') as HTMLTextAreaElement
  const infoDescRo = infoWin.querySelector('.info-desc-ro') as HTMLElement
  infoWin.querySelector('.tb-close')!.addEventListener('click', () => infoWin.classList.add('hidden'))
  infoOpenBtn.addEventListener('click', () => {
    if (visitingCafe) return
    store.setInfo({ open: !store.save.info.open })
    refreshInfo()
    refreshBrand()
  })
  infoRules.addEventListener('input', () => store.setInfo({ rules: infoRules.value }))
  infoDesc.addEventListener('input', () => store.setInfo({ desc: infoDesc.value }))
  const infoGb = infoWin.querySelector('.info-gb') as HTMLButtonElement
  infoGb.addEventListener('click', () => {
    if (visitingCafe) return
    store.setInfo({ guestbook: !store.save.info.guestbook })
    refreshInfo()
  })

  const homeName = () => (store.save.info.name ? `${store.save.info.name}'s café` : 'your café')

  // the radio's shared schedule is keyed by whose café you're in
  const homeSeed = () => 'user:' + (cloudUser()?.id ?? 'local')

  const npEl = infoWin.querySelector('.info-now-playing') as HTMLElement
  function refreshNowPlaying() {
    const t = nowPlaying()
    npEl.textContent = t ? `♪ on air — ${t}` : ''
    npEl.classList.toggle('hidden', !t)
  }
  setInterval(() => {
    if (!infoWin.classList.contains('hidden')) refreshNowPlaying()
  }, 8000)

  function refreshInfo() {
    const away = !!visitingCafe
    ;(infoWin.querySelector('.tb-title') as HTMLElement).textContent = away ? visitingCafe!.name : homeName()
    infoOpenBtn.textContent = away ? 'open' : store.save.info.open ? 'open ♪' : 'closed'
    infoOpenBtn.classList.toggle('btn-mint', away || store.save.info.open)
    infoRules.classList.toggle('hidden', away)
    infoRulesRo.classList.toggle('hidden', !away)
    infoDesc.classList.toggle('hidden', away)
    infoDescRo.classList.toggle('hidden', !away)
    // music: the owner picks the station; visitors see what's playing
    const musicEl = infoWin.querySelector('.info-music') as HTMLElement
    musicEl.innerHTML = ''
    if (away) {
      const label = STATIONS.find((s) => s.id === visitingCafe!.music)?.label ?? 'quiet'
      musicEl.innerHTML = `<b class="info-music-ro">♪ ${label}</b>`
    } else {
      const SHORT: Record<string, string> = { lofi: 'lofi', rain: 'rain', off: 'quiet' }
      for (const s of STATIONS) {
        const b = document.createElement('button')
        b.className = 'glossy-btn ed-mini station-btn' + (store.save.info.music === s.id ? ' active-station' : '')
        b.textContent = SHORT[s.id] ?? s.id
        b.addEventListener('click', () => {
          store.setInfo({ music: s.id })
          setStation(s.id)
          refreshInfo()
        })
        musicEl.appendChild(b)
      }
    }
    refreshNowPlaying()
    // guestbook toggle (home only)
    ;(infoWin.querySelector('.info-gb-row') as HTMLElement).classList.toggle('hidden', away)
    infoGb.textContent = store.save.info.guestbook ? 'on ♪' : 'off'
    infoGb.classList.toggle('btn-mint', store.save.info.guestbook)
    if (away) {
      infoRulesRo.textContent = `${visitingCafe!.ruleset} · ${visitingCafe!.vibe}`
      infoDescRo.textContent = visitingCafe!.desc
    } else {
      infoRules.value = store.save.info.rules
      infoDesc.value = store.save.info.desc
    }
  }

  function refreshBrand() {
    if (!brandSub) return
    const away = !!visitingCafe
    const name = away ? visitingCafe!.name : homeName()
    const open = away ? true : store.save.info.open
    brandSub.innerHTML = `${esc(name)} · <b class="bs-open ${open ? 'is-open' : ''}">${open ? 'open' : 'closed'}</b><button class="bs-more">+</button>`
    brandSub.querySelector('.bs-more')!.addEventListener('click', () => {
      const wasHidden = infoWin.classList.contains('hidden')
      refreshInfo()
      showLeft(wasHidden ? infoWin : null)
    })
  }
  refreshBrand()
  store.on('info', refreshBrand)
  setStation(store.save.info.music as Station, homeSeed()) // home station from the save

  // ---------- friends tab (side) ----------
  const friendsTab = document.createElement('button')
  friendsTab.className = 'glossy-btn friends-tab rslot-tab'
  friendsTab.textContent = '♥ friends'
  ui.appendChild(friendsTab)

  // the badge shows real pending friend requests (wired via setRequestCount)
  const friendsBadge = attachBadge(friendsTab)

  const friendsWin = document.createElement('div')
  friendsWin.className = 'y2k-window friends-window rslot-window hidden'
  friendsWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">friends</span><button class="tb-close">×</button></div>
    <div class="y2k-body">
      <div class="fr-real"></div>
      <div class="fr-head">the regulars ♪</div>
      <div class="friends-list"></div>
    </div>
  `
  ui.appendChild(friendsWin)
  friendsWin.querySelector('.tb-close')!.addEventListener('click', () => friendsWin.classList.add('hidden'))
  const friendsReal = friendsWin.querySelector('.fr-real') as HTMLElement
  const friendsList = friendsWin.querySelector('.friends-list') as HTMLElement
  const STATE_LABEL: Record<FriendState, string> = {
    studying: 'studying', online: 'online', idle: 'idle', offline: 'offline',
  }

  const visitUser = async (userId: string) => {
    friendsWin.classList.add('hidden')
    const cafe = await fetchCafeByUser(userId)
    if (cafe) game.visit(cafe)
    else toast('their café is closed right now ♪')
  }

  /** Where a real person is, as a friendly line + presence dot state. */
  const placeLine = (userId: string): { state: FriendState; label: string } => {
    const at = whereIs(userId)
    if (!at) return { state: 'offline', label: 'away right now' }
    if (at === `user:${userId}`) return { state: 'studying', label: 'at their café ♪' }
    const dc = DREAM_CAFES.find((c) => c.id === at)
    if (dc) return { state: 'studying', label: `@ ${dc.name}` }
    return { state: 'studying', label: 'out visiting ♪' }
  }

  const personRow = (p: { userId: string; handle: string; name: string; avatar: { hair: string; sweater: string } }, state: FriendState, detail: string) => {
    const row = document.createElement('div')
    row.className = `friend-row st-${state}`
    row.innerHTML = `
      <canvas class="fr-face" width="48" height="48"></canvas>
      <span class="fr-id">${esc(p.name)}
        <i>@${esc(p.handle)}</i>
        <i>${esc(detail)}</i>
      </span>
      <span class="fr-right"><span class="fr-state"><i class="fr-dot"></i>${STATE_LABEL[state]}</span></span>
    `
    drawPortrait(row.querySelector('.fr-face') as HTMLCanvasElement, p.avatar.hair, p.avatar.sweater)
    return row
  }

  /** Rebuild the real friends + incoming requests sections. */
  const renderReal = async () => {
    const { friends, requests } = await listFriends()
    friendsReal.textContent = ''
    if (requests.length) {
      const head = document.createElement('div')
      head.className = 'fr-head'
      head.textContent = 'wants to be friends ♪'
      friendsReal.appendChild(head)
      for (const r of requests) {
        const row = personRow(r, 'online', 'sent you a request')
        const right = row.querySelector('.fr-right') as HTMLElement
        right.textContent = ''
        const yes = document.createElement('button')
        yes.className = 'glossy-btn btn-pink ed-mini'
        yes.textContent = '♥ yes'
        yes.addEventListener('click', async () => {
          if (await acceptRequest(r.rowId)) {
            toast(`you and ${r.name} are friends now ♪`)
            renderReal()
          }
        })
        const no = document.createElement('button')
        no.className = 'glossy-btn ed-mini'
        no.textContent = 'no'
        no.addEventListener('click', async () => {
          await declineRequest(r.rowId)
          renderReal()
        })
        right.append(yes, no)
        friendsReal.appendChild(row)
      }
    }
    if (friends.length) {
      const head = document.createElement('div')
      head.className = 'fr-head'
      head.textContent = 'your friends ♪'
      friendsReal.appendChild(head)
      for (const f of friends) {
        const where = placeLine(f.userId)
        const row = personRow(f, where.state, where.label)
        const go = document.createElement('button')
        go.className = 'glossy-btn ed-mini'
        go.textContent = 'visit'
        go.addEventListener('click', () => visitUser(f.userId))
        row.querySelector('.fr-right')!.appendChild(go)
        friendsReal.appendChild(row)
      }
    }
    if (!requests.length && !friends.length) {
      const note = document.createElement('div')
      note.className = 'ed-note'
      note.textContent = 'no friends yet — tap someone studying near you ♪'
      friendsReal.appendChild(note)
    }
  }

  for (const f of FRIENDS) {
    const row = document.createElement('div')
    row.className = `friend-row st-${f.state}`
    const cafe = f.where ? DREAM_CAFES.find((c) => c.id === f.where) : undefined
    row.innerHTML = `
      <canvas class="fr-face" width="48" height="48"></canvas>
      <span class="fr-id">${f.name}
        <i>${cafe && f.state !== 'offline' ? `@ ${cafe.name} · ` : ''}${f.detail}</i>
        ${f.time ? `<i>${f.time}</i>` : ''}
      </span>
      <span class="fr-right"><span class="fr-state"><i class="fr-dot"></i>${STATE_LABEL[f.state]}</span></span>
    `
    drawPortrait(row.querySelector('.fr-face') as HTMLCanvasElement, f.hair, f.sweater)
    if (cafe && f.state !== 'offline') {
      const go = document.createElement('button')
      go.className = 'glossy-btn ed-mini'
      go.textContent = 'visit'
      go.addEventListener('click', () => {
        friendsWin.classList.add('hidden')
        game.visit(cafe)
      })
      row.querySelector('.fr-right')!.appendChild(go)
    }
    friendsList.appendChild(row)
  }
  friendsTab.addEventListener('click', () => {
    toggleRightWindow(friendsWin, friendsTab)
    if (!friendsWin.classList.contains('hidden')) renderReal()
  })

  // ---------- clubs tab (side): five-seat clans, level 10+ ----------
  const clubsTab = document.createElement('button')
  clubsTab.className = 'glossy-btn clubs-tab rslot-tab'
  clubsTab.textContent = '♜ clubs'
  ui.appendChild(clubsTab)

  const clubWin = document.createElement('div')
  clubWin.className = 'y2k-window clubs-window rslot-window hidden'
  clubWin.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">study clubs</span><button class="tb-close">×</button></div>
    <div class="y2k-body club-body"></div>
  `
  ui.appendChild(clubWin)
  clubWin.querySelector('.tb-close')!.addEventListener('click', () => clubWin.classList.add('hidden'))
  const clubBody = clubWin.querySelector('.club-body') as HTMLElement

  const clubLocked = () => store.levelInfo().level < 10
  const paintClubTab = () => clubsTab.classList.toggle('locked', clubLocked() && !myClubCached())
  store.on('xp', paintClubTab)
  paintClubTab()

  function renderClub() {
    const club = myClubCached()
    clubBody.innerHTML = ''
    if (!cloudConfigured() || !cloudUser()) {
      clubBody.innerHTML = `<p class="ed-note">clubs live in the cloud — you're playing local-only right now ♪</p>`
      return
    }
    if (!club && clubLocked()) {
      clubBody.innerHTML = `
        <p class="ed-note">study clubs unlock at <b>level 10</b> — five friends, one shared
        clubhouse you furnish together, and a warmth bonus when a clubmate is studying ♪</p>
        <p class="ed-note">you're lv ${store.levelInfo().level} — keep sitting down ♪</p>`
      return
    }
    if (!club) {
      clubBody.innerHTML = `
        <p class="ed-note">five seats, one shared clubhouse, +10% xp while a clubmate studies ♪</p>
        <div class="ed-row"><input class="px-input club-new-name" placeholder="club name…" maxlength="24" /></div>
        <div class="ed-row"><input class="px-input club-new-handle" placeholder="handle (for invites)…" maxlength="20" />
          <button class="glossy-btn ed-mini btn-pink club-create">found it ♪</button></div>
        <hr class="ed-hr" />
        <div class="ed-row"><input class="px-input club-join-handle" placeholder="a club's handle…" maxlength="20" />
          <button class="glossy-btn ed-mini btn-mint club-join">join</button></div>
        <p class="ed-note club-msg"></p>`
      const msg = clubBody.querySelector('.club-msg') as HTMLElement
      clubBody.querySelector('.club-create')!.addEventListener('click', async () => {
        const name = (clubBody.querySelector('.club-new-name') as HTMLInputElement).value.trim()
        const handle = (clubBody.querySelector('.club-new-handle') as HTMLInputElement).value.trim().toLowerCase()
        if (!name || !handle) {
          msg.textContent = 'give it a name and a handle ♪'
          return
        }
        msg.textContent = 'founding…'
        const err = await createClub(handle, name)
        msg.textContent = err ?? ''
        if (!err) {
          sfx.earn()
          toast('your club is open ♪')
          renderClub()
          paintClubTab()
        }
      })
      clubBody.querySelector('.club-join')!.addEventListener('click', async () => {
        const handle = (clubBody.querySelector('.club-join-handle') as HTMLInputElement).value.trim().toLowerCase()
        if (!handle) return
        msg.textContent = 'knocking…'
        const err = await joinClub(handle)
        msg.textContent = err ?? ''
        if (!err) {
          sfx.earn()
          toast('welcome to the club ♪')
          renderClub()
          paintClubTab()
        }
      })
      return
    }
    // in a club
    const me = cloudUser()
    const lead = club.myRole === 'leader'
    clubBody.innerHTML = `
      <div class="ed-row"><b>${esc(club.name)}</b><span class="ed-note">@${esc(club.handle)}</span></div>
      <div class="ed-row"><span>treasury</span><b>${club.treasury} ◍</b></div>
      <div class="ed-row club-donate-row">
        <span>chip in</span>
        <span>
          <button class="glossy-btn ed-mini" data-d="10">+10</button>
          <button class="glossy-btn ed-mini" data-d="50">+50</button>
          <button class="glossy-btn ed-mini" data-d="250">+250</button>
        </span>
      </div>
      <div class="club-members"></div>
      <div class="ed-row">
        <button class="glossy-btn btn-pink club-visit">⌂ clubhouse ♪</button>
        <button class="glossy-btn ed-mini club-leave">leave</button>
      </div>
      <p class="ed-note">everyone can furnish the clubhouse — the treasury pays for it.
      while a clubmate is studying, you both earn +10% xp ♪</p>
      <p class="ed-note club-msg"></p>`
    const msg = clubBody.querySelector('.club-msg') as HTMLElement
    const membersEl = clubBody.querySelector('.club-members') as HTMLElement
    for (const m of club.members) {
      const row = document.createElement('div')
      row.className = 'ed-row club-member'
      row.innerHTML = `<span>${esc(m.name)} <i class="ed-note">@${esc(m.handle)}${m.role === 'leader' ? ' · leader' : ''}</i></span>`
      if (lead && m.userId !== me?.id) {
        const kick = document.createElement('button')
        kick.className = 'glossy-btn ed-mini'
        kick.textContent = '×'
        kick.title = 'remove from the club'
        kick.addEventListener('click', async () => {
          await kickMember(m.userId)
          renderClub()
        })
        row.appendChild(kick)
      }
      membersEl.appendChild(row)
    }
    clubBody.querySelectorAll('[data-d]').forEach((b) =>
      b.addEventListener('click', async () => {
        const n = Number((b as HTMLElement).dataset.d)
        if (!store.spendBeans(n)) {
          msg.textContent = 'not enough beans ♪'
          return
        }
        const t = await donate(n)
        if (t < 0) {
          store.grantBeans(n) // the cloud said no — hand them back
          msg.textContent = 'that didn’t go through — try again ♪'
        } else {
          sfx.coin()
          msg.textContent = ''
          renderClub()
        }
      })
    )
    clubBody.querySelector('.club-visit')!.addEventListener('click', () => {
      const fresh = myClubCached()
      if (fresh) game.visit(clubhouseCafe(fresh))
      clubWin.classList.add('hidden')
    })
    clubBody.querySelector('.club-leave')!.addEventListener('click', async () => {
      if (!confirm(lead ? 'leave your club? the oldest member becomes leader (or it closes).' : 'leave the club?')) return
      await leaveClub()
      toast('you left the club ♪')
      renderClub()
      paintClubTab()
    })
  }

  clubsTab.addEventListener('click', async () => {
    toggleRightWindow(clubWin, clubsTab)
    if (clubWin.classList.contains('hidden')) return
    clubBody.innerHTML = `<p class="ed-note">checking the clubhouse…</p>`
    await fetchMyClub(true)
    paintClubTab()
    renderClub()
  })

  // ---------- debug / dev panel ----------
  // built for everyone, shown for ?debug (local poking) or a dev account
  {
    const dbg = document.createElement('div')
    dbg.className = 'y2k-window editor-window dbg-window hidden collapsed'
    dbg.innerHTML = `
      <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">debug</span></div>
      <div class="y2k-body dbg-body">
        <button class="glossy-btn" data-d="grant">+5 of everything</button>
        <button class="glossy-btn" data-d="beans">+100 beans</button>
        <button class="glossy-btn hidden" data-dev="1" data-d="rich">+10,000 beans</button>
        <button class="glossy-btn hidden" data-dev="1" data-d="infinite">∞ beans</button>
        <button class="glossy-btn hidden" data-dev="1" data-d="stock">+99 of everything</button>
        <button class="glossy-btn" data-d="deliver">deliver packages now</button>
        <button class="glossy-btn" data-d="skip">⏩ skip to next phase</button>
        <button class="glossy-btn" data-d="reset">reset save</button>
      </div>
    `
    ui.appendChild(dbg)
    dbg.addEventListener('click', (e) => {
      const d = ((e.target as HTMLElement).closest('button') as HTMLElement)?.dataset.d
      if (d === 'grant') store.grantAll()
      if (d === 'beans') store.grantBeans()
      if (d === 'rich') store.grantBeans(10_000)
      if (d === 'infinite') store.grantBeans(Math.max(0, 999_999 - store.save.beans))
      if (d === 'stock') store.grantAll(99)
      if (d === 'deliver') store.deliverNow()
      if (d === 'skip') {
        clock.skipPhase()
        toast(`communal clock: ${clock.phase().mode} ♪`)
      }
      if (d === 'reset') store.resetSave()
    })
    const debugParam = new URLSearchParams(location.search).has('debug')
    if (debugParam) dbg.classList.remove('hidden')
    // the dev account gets the full panel wherever they're signed in —
    // the session arrives async, so check gently until it settles
    const devCheck = setInterval(() => {
      if (!isDev()) return
      clearInterval(devCheck)
      dbg.classList.remove('hidden')
      ;(dbg.querySelector('.tb-title') as HTMLElement).textContent = 'dev ♪'
      dbg.querySelectorAll('[data-dev]').forEach((b) => b.classList.remove('hidden'))
    }, 2000)
    setTimeout(() => clearInterval(devCheck), 60_000) // stop checking after a minute
  }

  refreshRoom()
  refreshInventory()
  setMode('view')
  // every window can be tucked away to just its titlebar (shop ×, friends via its tab)
  for (const w of [roomWin, furnishWin, dirWin, hudWin, infoWin]) collapsible(w)
  const dbgWin = ui.querySelector('.dbg-window')
  if (dbgWin) collapsible(dbgWin as HTMLElement)

  return {
    setCapacity(n) {
      capEl.textContent = `seats: ${n}`
    },
    setSelection(sel) {
      if (!sel) {
        selWin.classList.add('hidden')
        return
      }
      ;(selWin.querySelector('.sel-name') as HTMLElement).textContent = sel.name
      // color swatches, if the item has variants
      selVariants.innerHTML = ''
      const variants = CATALOG[sel.itemId].variants
      if (variants) {
        for (const v of variants) {
          const dot = document.createElement('button')
          dot.className = 'swatch sw-dot' + (v === (sel.variant ?? variants[0]) ? ' active' : '')
          dot.style.background = variantColor(v)
          dot.addEventListener('click', () => {
            store.setVariant(sel.uid, v)
            selVariants.querySelectorAll('.sw-dot').forEach((x) => x.classList.remove('active'))
            dot.classList.add('active')
          })
          selVariants.appendChild(dot)
        }
      }
      selWin.classList.remove('hidden')
    },
    setPlacing(itemId) {
      if (!itemId) invGrid.querySelectorAll('.inv-btn').forEach((x) => x.classList.remove('active'))
    },
    setVisiting(cafe) {
      const away = !!cafe
      visitingCafe = cafe
      const clubEd = isClubVisit()
      game.setClubEditable(clubEd)
      barBtn('edit').textContent = clubEd ? '✎ furnish clubhouse' : '✎ edit café'
      barBtn('edit').classList.toggle('hidden', away && !clubEd)
      barBtn('shop').classList.toggle('hidden', away)
      barBtn('home').classList.toggle('hidden', !away)
      showLeft(null)
      refreshBrand()
      // the café you're in sets the music (and its radio schedule)
      setStation((cafe ? cafe.music : store.save.info.music) as Station, cafe ? cafe.id : homeSeed())
      if (!away) toast('welcome home ♪')
    },
    setSession(s) {
      hudWin.classList.toggle('hidden', !s)
      if (s) {
        hudNapkin.value = s.napkin
        hudHp.classList.toggle('active', s.headphones)
        const rate = store.focusRate()
        ;(hudWin.querySelector('.hud-rate') as HTMLElement).textContent =
          `earning ${rate % 1 ? rate.toFixed(1) : rate} ◍ per focused minute ♪`
        fmtHud()
      }
    },
    openDirectory() {
      setMode('view')
      showLeft(dirWin)
      renderRealCafes()
      renderLeaders()
    },
    setLiveCounts(counts) {
      lastCounts = counts
      paintLiveCounts()
    },
    setRequestCount(n) {
      friendsBadge(n)
    },
  }
}
