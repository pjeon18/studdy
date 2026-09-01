// One tiny observable store: the SaveDoc plus mutations, persisted to localStorage.
import { CATALOG } from './items'
import type { Avatar, CafeInfo, GuestNote, Opening, PlacedItem, RoomDoc, SaveDoc } from './types'

const KEY = 'studdy-save-v1'

export type StoreEvent = 'room' | 'placed' | 'inventory' | 'beans' | 'packages' | 'info' | 'guestbook' | 'avatar' | 'newitems' | 'xp'

const DEFAULT_AVATAR: Avatar = {
  skin: '#FFDCBD',
  hair: '#7C5940',
  hairStyle: 'short',
  sweater: '#7383BC',
  glasses: false,
}

const DEFAULT_INFO: CafeInfo = {
  name: '',
  open: true,
  rules: '25 / 5 sprints · headphones welcome',
  desc: 'a cozy corner to get things done. take any open seat ♪',
  music: 'lofi',
  guestbook: true,
}

function starter(): SaveDoc {
  return {
    v: 1,
    room: {
      w: 16,
      d: 12,
      floor: 'honey',
      wallStyle: 'cream',
      openings: [
        { id: 'door-1', wall: 'left', kind: 'door', start: 2, width: 2.5 },
        { id: 'win-1', wall: 'back', kind: 'window', start: 4, width: 5 },
      ],
    },
    // every café starts with its guestbook by the door
    placed: [{ uid: 'guestbook-home', itemId: 'guestbook', x: 4.5, z: 1.4, rot: 0 }],
    inventory: Object.fromEntries(Object.keys(CATALOG).map((k) => [k, 0])),
    beans: 60,
    // the starter kit arrives as a package waiting at the door (F1)
    // a small housewarming box — the real furniture gets ordered in onboarding
    packages: [
      {
        id: 'pkg-starter',
        items: { 'rug-round': 1, mug: 2, 'open-book': 1 },
        arriveAt: 0,
      },
    ],
    info: { ...DEFAULT_INFO },
    guestbook: [],
    guestbookSeenAt: 0,
    avatar: { ...DEFAULT_AVATAR },
    newItems: [],
    xp: 0,
  }
}

function load(): SaveDoc {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const doc = JSON.parse(raw) as SaveDoc
      if (doc.v === 1 && doc.room && doc.placed && doc.inventory) {
        doc.packages ??= []
        doc.beans ??= 60
        doc.info ??= { ...DEFAULT_INFO }
        doc.info.name ??= ''
        doc.info.music ??= 'lofi'
        doc.info.guestbook ??= true
        doc.guestbook ??= []
        doc.guestbookSeenAt ??= 0
        doc.avatar ??= { ...DEFAULT_AVATAR }
        doc.newItems ??= []
        doc.xp ??= 0
        for (const k of Object.keys(CATALOG)) doc.inventory[k] ??= 0
        return doc
      }
    }
  } catch {
    /* fall through to starter */
  }
  return starter()
}

export const save: SaveDoc = load()

const listeners = new Map<StoreEvent, Set<() => void>>()
export function on(ev: StoreEvent, fn: () => void) {
  if (!listeners.has(ev)) listeners.set(ev, new Set())
  listeners.get(ev)!.add(fn)
}
let persistT: ReturnType<typeof setTimeout> | undefined
let dirty = false
function commit(ev: StoreEvent) {
  dirty = true
  clearTimeout(persistT)
  persistT = setTimeout(flush, 250)
  listeners.get(ev)?.forEach((fn) => fn())
}
function flush() {
  if (!dirty) return
  dirty = false
  localStorage.setItem(KEY, JSON.stringify(save))
}
window.addEventListener('beforeunload', flush)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
})

let uidN = Date.now() % 100000
const uid = () => `p${uidN++}`

// ---------- room mutations ----------
export function setRoomSize(w: number, d: number) {
  save.room.w = Math.min(32, Math.max(10, Math.round(w)))
  save.room.d = Math.min(24, Math.max(8, Math.round(d)))
  clampOpenings()
  evictOutOfBounds()
  commit('room')
}

export function setFloor(floor: RoomDoc['floor']) {
  save.room.floor = floor
  commit('room')
}

export function setWallStyle(s: RoomDoc['wallStyle']) {
  save.room.wallStyle = s
  commit('room')
}

function wallLength(wall: Opening['wall']): number {
  return wall === 'back' ? save.room.w : save.room.d
}

function clampOpenings() {
  for (const o of save.room.openings) {
    const len = wallLength(o.wall)
    o.width = Math.min(o.width, len - 1)
    o.start = Math.min(Math.max(0.5, o.start), len - o.width - 0.5)
  }
}

/** Evenly re-space the windows on one wall, avoiding the door. */
function layoutWindows(wall: Opening['wall']) {
  const wins = save.room.openings.filter((o) => o.wall === wall && o.kind === 'window')
  if (!wins.length) return
  const len = wallLength(wall)
  const door = save.room.openings.find((o) => o.kind === 'door' && o.wall === wall)
  // free segments of the wall (excluding the door with a margin)
  const segs: [number, number][] = []
  if (door) {
    const a = door.start - 0.75
    const b = door.start + door.width + 0.75
    if (a > 1.5) segs.push([0.5, a])
    if (b < len - 1.5) segs.push([b, len - 0.5])
  } else {
    segs.push([0.5, len - 0.5])
  }
  segs.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
  // assign windows to segments round-robin by remaining length
  const bySeg: number[] = segs.map(() => 0)
  for (let i = 0; i < wins.length; i++) {
    let best = 0
    for (let s = 1; s < segs.length; s++) {
      const room = (segs[s][1] - segs[s][0]) / (bySeg[s] + 1)
      const bestRoom = (segs[best][1] - segs[best][0]) / (bySeg[best] + 1)
      if (room > bestRoom) best = s
    }
    bySeg[best]++
  }
  let wi = 0
  segs.forEach(([a, b], si) => {
    const n = bySeg[si]
    if (!n) return
    const segLen = b - a
    const wWidth = Math.max(2, Math.min(5, segLen / n - 0.6))
    for (let k = 0; k < n; k++) {
      const o = wins[wi++]
      o.width = wWidth
      o.start = a + ((k + 1) * segLen) / (n + 1) - wWidth / 2
    }
  })
  clampOpenings()
}

export function windowCount(wall: Opening['wall']): number {
  return save.room.openings.filter((o) => o.wall === wall && o.kind === 'window').length
}

export function setWindowCount(wall: Opening['wall'], n: number) {
  n = Math.min(3, Math.max(0, n))
  let wins = save.room.openings.filter((o) => o.wall === wall && o.kind === 'window')
  while (wins.length > n) {
    const gone = wins.pop()!
    save.room.openings = save.room.openings.filter((o) => o.id !== gone.id)
  }
  while (wins.length < n) {
    const o: Opening = { id: `win-${uid()}`, wall, kind: 'window', start: 1, width: 4 }
    save.room.openings.push(o)
    wins.push(o)
  }
  layoutWindows(wall)
  commit('room')
}

export function moveDoor(delta: number) {
  const door = save.room.openings.find((o) => o.kind === 'door')
  if (!door) return
  door.start += delta
  clampOpenings()
  layoutWindows('back')
  layoutWindows('left')
  commit('room')
}

export function doorWall(wall: Opening['wall']) {
  const door = save.room.openings.find((o) => o.kind === 'door')
  if (!door) return
  door.wall = wall
  clampOpenings()
  layoutWindows('back')
  layoutWindows('left')
  commit('room')
}

export function setDoorStyle(patch: { doorColor?: string; doorKind?: 'classic' | 'glass' }) {
  const door = save.room.openings.find((o) => o.kind === 'door')
  if (!door) return
  Object.assign(door, patch)
  commit('room')
}

export function setAvatar(patch: Partial<Avatar>) {
  Object.assign(save.avatar, patch)
  commit('avatar')
}

/** The red "new" pill was clicked away for this item. */
export function markItemSeen(itemId: string) {
  if (!save.newItems.includes(itemId)) return
  save.newItems = save.newItems.filter((k) => k !== itemId)
  commit('newitems')
}

export function setVariant(uidStr: string, variant: string) {
  const p = save.placed.find((q) => q.uid === uidStr)
  if (!p) return
  p.variant = variant
  commit('placed')
}

// ---------- furnish mutations ----------
export function placeItem(itemId: string, variant: string | undefined, x: number, z: number, rot: 0 | 1 | 2 | 3, onUid?: string): PlacedItem | null {
  if ((save.inventory[itemId] ?? 0) <= 0) return null
  save.inventory[itemId]--
  const p: PlacedItem = { uid: uid(), itemId, variant, x, z, rot, on: onUid }
  save.placed.push(p)
  commit('placed')
  commit('inventory')
  addXp(2) // decorating counts as playing
  return p
}

export function moveItem(uidStr: string, x: number, z: number, rot: 0 | 1 | 2 | 3, onUid?: string) {
  const p = save.placed.find((q) => q.uid === uidStr)
  if (!p) return
  p.x = x
  p.z = z
  p.rot = rot
  p.on = onUid
  commit('placed')
}

export function rotateItem(uidStr: string) {
  const p = save.placed.find((q) => q.uid === uidStr)
  if (!p) return
  p.rot = ((p.rot + 1) % 4) as 0 | 1 | 2 | 3
  commit('placed')
}

export function storeItem(uidStr: string) {
  const p = save.placed.find((q) => q.uid === uidStr)
  if (!p) return
  // anything sitting on this surface goes back to inventory too
  const riders = save.placed.filter((q) => q.on === uidStr)
  for (const r of riders) {
    save.inventory[r.itemId] = (save.inventory[r.itemId] ?? 0) + 1
  }
  save.inventory[p.itemId] = (save.inventory[p.itemId] ?? 0) + 1
  save.placed = save.placed.filter((q) => q.uid !== uidStr && q.on !== uidStr)
  commit('placed')
  commit('inventory')
}

function evictOutOfBounds() {
  const { w, d } = save.room
  const evicted = save.placed.filter((p) => p.x < 0 || p.x > w || p.z < 0 || p.z > d)
  if (!evicted.length) return
  for (const p of evicted) save.inventory[p.itemId] = (save.inventory[p.itemId] ?? 0) + 1
  const gone = new Set(evicted.map((p) => p.uid))
  // riders of evicted surfaces come back too
  for (const p of save.placed.filter((q) => q.on && gone.has(q.on))) {
    save.inventory[p.itemId] = (save.inventory[p.itemId] ?? 0) + 1
    gone.add(p.uid)
  }
  save.placed = save.placed.filter((p) => !gone.has(p.uid))
  commit('placed')
  commit('inventory')
}

// ---------- shop / delivery ----------
export function orderItem(itemId: string): boolean {
  const price = CATALOG[itemId]?.price ?? 0
  if (save.beans < price) return false
  save.beans -= price
  // orders placed while a box is still being packed ship together
  const now = Date.now()
  let pkg = save.packages.find((p) => p.arriveAt - now > 12000)
  if (!pkg) {
    pkg = { id: `pkg-${uid()}`, items: {}, arriveAt: now + 20000 }
    save.packages.push(pkg)
  }
  pkg.items[itemId] = (pkg.items[itemId] ?? 0) + 1
  commit('beans')
  commit('packages')
  return true
}

/** Unbox an arrived package into the inventory. Returns its contents. */
export function openPackage(pkgId: string): Record<string, number> | null {
  const pkg = save.packages.find((p) => p.id === pkgId)
  if (!pkg || pkg.arriveAt > Date.now()) return null
  for (const [k, n] of Object.entries(pkg.items)) {
    save.inventory[k] = (save.inventory[k] ?? 0) + n
    if (!save.newItems.includes(k)) save.newItems.push(k)
  }
  save.packages = save.packages.filter((p) => p.id !== pkgId)
  commit('packages')
  commit('inventory')
  commit('newitems')
  addXp(5)
  return pkg.items
}

export function deliverNow() {
  const now = Date.now()
  for (const p of save.packages) p.arriveAt = Math.min(p.arriveAt, now)
  commit('packages')
}

export function grantBeans(n = 100) {
  save.beans += n
  commit('beans')
}

/** Credit earned beans (focused time). */
export function addBeans(n: number) {
  if (n <= 0) return
  save.beans += n
  commit('beans')
}

export function setInfo(patch: Partial<CafeInfo>) {
  Object.assign(save.info, patch)
  commit('info')
}

// ---------- experience & levels ----------
/** XP needed to get from level n to n+1. */
const levelCost = (n: number) => 100 + (n - 1) * 50

export function levelInfo(xp = save.xp): { level: number; into: number; need: number } {
  let level = 1
  let rest = xp
  while (rest >= levelCost(level)) {
    rest -= levelCost(level)
    level++
  }
  return { level, into: rest, need: levelCost(level) }
}

export function addXp(n: number) {
  if (n <= 0) return
  save.xp += n
  commit('xp')
}

export function markGuestbookSeen() {
  save.guestbookSeenAt = Date.now()
  commit('guestbook')
}

export function addGuestNote(note: GuestNote) {
  save.guestbook.push(note)
  if (save.guestbook.length > 40) save.guestbook.shift() // the book only holds so much
  commit('guestbook')
}

export function grantAll(n = 5) {
  for (const k of Object.keys(save.inventory)) save.inventory[k] += n
  commit('inventory')
}

export function resetSave() {
  localStorage.removeItem(KEY)
  localStorage.removeItem('studdy-hint-stage')
  localStorage.removeItem('studdy-tour-done')
  location.reload()
}
