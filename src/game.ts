// Game-mode orchestrator: renders the SaveDoc (shell + placed items), runs
// ghost placement, selection, and capacity. The scene is data-driven end to end.
import * as THREE from 'three'
import { buildShell, type ShellHandles } from './shell'
import { CATALOG, buildItem, buildPackage, footprintOf, type BuiltItem } from './items'
import { lampShadeMat, PAL } from './build'
import { buildPerson, makeAnimator, makeIdleAnimator } from './people'
import * as store from './store'
import { sfx } from './sounds'
import { toast, heartBurst, type CardData } from './ui'
import type { DreamCafe, SimPersona } from './cafes'
import type { RemotePatron } from './presence'
import type { PlacedItem, RoomDoc } from './types'

export type EditMode = 'view' | 'room' | 'furnish'

interface LiveItem {
  built: BuiltItem
  data: PlacedItem
  /** itemId|variant the group was built from (data aliases the store — compare this). */
  key: string
}

export interface Session {
  seatKey: string
  cafeName: string
  startedAt: number
  napkin: string
  headphones: boolean
}

export interface GameCallbacks {
  onRoomExtent: (w: number, d: number) => void
  onPendants: (positions: THREE.Vector3[]) => void
  onSelection: (sel: { uid: string; name: string; itemId: string; variant?: string } | null) => void
  onCapacity: (seats: number) => void
  onPlacingChange: (placing: string | null) => void
  onLampsChanged: () => void
  onVisit: (cafe: DreamCafe | null) => void
  onSession: (session: Session | null) => void
  onPatronCard: (data: CardData, x: number, y: number) => void
  /** Damage-indicator style floater over the player ("-12 ◍" / "+8 ◍"). */
  onFloat: (text: string, kind: 'spend' | 'earn') => void
  /** The guestbook was clicked (atHome: your book vs. someone else's). */
  onGuestbook: (atHome: boolean, x: number, y: number) => void
  /** The door was clicked (visiting → go home; home → open the directory). */
  onDoor: (atHome: boolean) => void
  /** A styling mirror was clicked. */
  onSalon: (kind: 'barber' | 'boutique' | 'all') => void
}

/** Anchored-seat capacity of a placed-item list (pure; used by the directory too). */
export function capacityOfPlaced(placed: PlacedItem[]): number {
  const surfaces = placed.filter((p) => CATALOG[p.itemId].surface)
  const reach = (q: PlacedItem) => {
    const e = CATALOG[q.itemId]
    const [fw, fd] = footprintOf(q.itemId, q.rot)
    return (e.surface!.radius ?? Math.max(fw, fd) / 2) + 1.45
  }
  let count = 0
  for (const p of placed) {
    const seats = CATALOG[p.itemId].seats
    if (!seats) continue
    for (const s of seats) {
      const a = (p.rot * Math.PI) / 2
      const sx = p.x + s.dx * Math.cos(a) + s.dz * Math.sin(a)
      const sz = p.z - s.dx * Math.sin(a) + s.dz * Math.cos(a)
      if (surfaces.some((q) => Math.hypot(q.x - sx, q.z - sz) <= reach(q))) count++
    }
  }
  return count
}

export function createGame(scene: THREE.Scene, cb: GameCallbacks) {
  const group = new THREE.Group()
  scene.add(group)

  // stable materials so the lighting rig can keep driving them across rebuilds
  const skyMat = new THREE.MeshBasicMaterial({ color: '#B7D0E8' })
  const glassMat = new THREE.MeshBasicMaterial({ color: '#CCDEEE', transparent: true, opacity: 0.15, depthWrite: false })
  const lampLights: THREE.PointLight[] = []

  let shell: ShellHandles | null = null
  const live = new Map<string, LiveItem>()
  let mode: EditMode = 'view'
  let visiting: DreamCafe | null = null

  const activeRoom = (): RoomDoc => (visiting ? visiting.room : store.save.room)
  const activePlaced = (): PlacedItem[] => (visiting ? visiting.placed : store.save.placed)

  // ---------- shell ----------
  function pendantGrid(): THREE.Vector3[] {
    const { w, d } = activeRoom()
    const out: THREE.Vector3[] = []
    const nx = Math.max(1, Math.round(w / 9))
    const nz = Math.max(1, Math.round(d / 9))
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        out.push(new THREE.Vector3(((i + 0.5) * w) / nx, 6.75, ((j + 0.5) * d) / nz))
    return out
  }

  // invisible clickable box over the door + a white sheen shown on hover
  let doorHit: THREE.Mesh | null = null
  let doorGlow: THREE.Group | null = null
  const doorHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  const doorGlowMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', depthWrite: false })

  /** A thin white frame the size of the door, for the hover outline. */
  function makeDoorFrame(w: number, h: number): THREE.Group {
    const g = new THREE.Group()
    const t = 0.09
    const bars: [number, number, number, number][] = [
      [0, h / 2 - t / 2, w, t],
      [0, -h / 2 + t / 2, w, t],
      [-w / 2 + t / 2, 0, t, h],
      [w / 2 - t / 2, 0, t, h],
    ]
    for (const [x, y, bw, bh] of bars) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), doorGlowMat)
      m.position.set(x, y, 0)
      g.add(m)
    }
    return g
  }

  function rebuildDoorHit() {
    if (doorHit) {
      group.remove(doorHit)
      doorHit = null
    }
    if (doorGlow) {
      group.remove(doorGlow)
      doorGlow = null
    }
    const door = activeRoom().openings.find((o) => o.kind === 'door')
    if (!door) return
    const mid = door.start + door.width / 2
    const h = 5.5
    doorHit = new THREE.Mesh(new THREE.BoxGeometry(door.wall === 'left' ? 0.3 : door.width, h, door.wall === 'left' ? door.width : 0.3), doorHitMat)
    doorGlow = makeDoorFrame(door.width - 0.1, h - 0.1)
    doorGlow.visible = false
    if (door.wall === 'left') {
      doorHit.position.set(-0.1, h / 2, mid)
      doorGlow.rotation.y = Math.PI / 2
      doorGlow.position.set(0.06, h / 2, mid)
    } else {
      doorHit.position.set(mid, h / 2, -0.1)
      doorGlow.position.set(mid, h / 2, 0.06)
    }
    group.add(doorHit, doorGlow)
  }

  function rebuildShell() {
    if (shell) {
      group.remove(shell.group)
      shell.dispose()
    }
    shell = buildShell(activeRoom(), { skyMat, glassMat })
    group.add(shell.group)
    rebuildDoorHit()
    cb.onRoomExtent(activeRoom().w, activeRoom().d)
    cb.onPendants(pendantGrid())
  }

  // ---------- placed items ----------
  function applyTransform(obj: THREE.Object3D, p: PlacedItem) {
    const surfaceOf = p.on ? live.get(p.on)?.data : undefined
    const h = surfaceOf ? CATALOG[surfaceOf.itemId].surface?.h ?? 0 : 0
    obj.position.set(p.x, h, p.z)
    obj.rotation.y = (p.rot * Math.PI) / 2
  }

  function syncPlaced() {
    const seen = new Set<string>()
    for (const p of activePlaced()) {
      seen.add(p.uid)
      const key = `${p.itemId}|${p.variant ?? ''}`
      let li = live.get(p.uid)
      if (!li || li.key !== key) {
        if (li) {
          group.remove(li.built.group)
          if (li.built.lampLight) lampLights.splice(lampLights.indexOf(li.built.lampLight), 1)
        }
        const built = buildItem(p.itemId, p.variant)
        built.group.userData.uid = p.uid
        if (built.lampLight) lampLights.push(built.lampLight)
        group.add(built.group)
        li = { built, data: p, key }
        live.set(p.uid, li)
      }
      li.data = p
      applyTransform(li.built.group, p)
    }
    for (const [uidStr, li] of live) {
      if (!seen.has(uidStr)) {
        group.remove(li.built.group)
        if (li.built.lampLight) lampLights.splice(lampLights.indexOf(li.built.lampLight), 1)
        live.delete(uidStr)
      }
    }
    cb.onCapacity(capacity())
    cb.onLampsChanged()
    if (selection && !live.has(selection)) setSelection(null)
  }

  // ---------- capacity ----------
  function capacity(): number {
    return capacityOfPlaced(activePlaced())
  }

  // ---------- validity ----------
  function overlaps(x: number, z: number, itemId: string, rot: number, ignoreUid?: string, onUid?: string): boolean {
    const [fw, fd] = footprintOf(itemId, rot)
    const mine = CATALOG[itemId]
    for (const p of store.save.placed) {
      if (p.uid === ignoreUid) continue
      const e = CATALOG[p.itemId]
      if (e.noCollide || mine.noCollide) continue
      // floor items collide with floor items; surface riders only with riders on the same surface
      const mineOnSurface = mine.placement === 'surface'
      const theirsOnSurface = e.placement === 'surface'
      if (mineOnSurface !== theirsOnSurface) continue
      if (mineOnSurface && p.on !== onUid) continue
      // two round tops: true circle test, so diagonal placements can't visually fuse
      if (!mineOnSurface && mine.surface?.radius && e.surface?.radius) {
        if (Math.hypot(p.x - x, p.z - z) < mine.surface.radius + e.surface.radius + 0.15) return true
        continue
      }
      const [pw, pd] = footprintOf(p.itemId, p.rot)
      // seats may still tuck up against tables, and flat-topped surfaces (square
      // tables, counters) may sit flush to line up into long runs; everything
      // else keeps a visible gap
      const seatAtTable = (mine.seats && e.surface) || (mine.surface && e.seats)
      const flushSurfaces = mine.surface && !mine.surface.radius && e.surface && !e.surface.radius
      const gap = mineOnSurface || seatAtTable || flushSurfaces ? -0.02 : 0.1
      if (Math.abs(p.x - x) < (fw + pw) / 2 + gap && Math.abs(p.z - z) < (fd + pd) / 2 + gap) return true
    }
    return false
  }

  /** Does the item at (x,z) fit on the given surface (small overhang allowed)? */
  function fitsOn(surf: PlacedItem, x: number, z: number, itemId: string, rot: number): boolean {
    const e = CATALOG[surf.itemId]
    if (!e.surface) return false
    const [fw, fd] = footprintOf(itemId, rot)
    const r = Math.max(fw, fd) / 2
    if (e.surface.radius) return Math.hypot(surf.x - x, surf.z - z) + r <= e.surface.radius + 0.25
    const [pw, pd] = footprintOf(surf.itemId, surf.rot)
    return Math.abs(surf.x - x) + r <= pw / 2 + 0.2 && Math.abs(surf.z - z) + r <= pd / 2 + 0.4
  }

  /** Empty 1-unit floor tiles, optionally with a hypothetical placement applied. */
  function emptyFloorTiles(extra?: { itemId: string; rot: number; x: number; z: number; ignoreUid?: string }): number {
    const room = activeRoom()
    const boxes: [number, number, number, number][] = []
    const add = (x: number, z: number, itemId: string, rot: number) => {
      const e = CATALOG[itemId]
      if (e.noCollide || e.placement === 'surface') return
      const [fw, fd] = footprintOf(itemId, rot)
      boxes.push([x - fw / 2 - 0.3, z - fd / 2 - 0.3, x + fw / 2 + 0.3, z + fd / 2 + 0.3])
    }
    for (const p of activePlaced()) {
      if (p.uid === extra?.ignoreUid) continue
      add(p.x, p.z, p.itemId, p.rot)
    }
    if (extra) add(extra.x, extra.z, extra.itemId, extra.rot)
    let n = 0
    for (let x = 1.5; x <= room.w - 1.5; x++)
      for (let z = 1.5; z <= room.d - 1.5; z++)
        if (!boxes.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) n++
    return n
  }

  function totalSeats(extraItemId?: string, ignoreUid?: string): number {
    let n = 0
    for (const p of activePlaced()) {
      if (p.uid === ignoreUid) continue
      n += CATALOG[p.itemId].seats?.length ?? 0
    }
    if (extraItemId) n += CATALOG[extraItemId].seats?.length ?? 0
    return n
  }

  function validAt(
    x: number,
    z: number,
    itemId: string,
    rot: number,
    ignoreUid?: string,
    surfUid?: string | null
  ): { ok: boolean; on?: string; reason?: 'floor' } {
    const { w, d } = store.save.room
    const entry = CATALOG[itemId]
    const [fw, fd] = footprintOf(itemId, rot)
    if (entry.placement === 'surface') {
      let surf = surfUid ? store.save.placed.find((p) => p.uid === surfUid) : undefined
      if (!surf) surf = store.save.placed.find((p) => CATALOG[p.itemId].surface && fitsOn(p, x, z, itemId, rot))
      if (!surf || !fitsOn(surf, x, z, itemId, rot)) return { ok: false }
      if (overlaps(x, z, itemId, rot, ignoreUid, surf.uid)) return { ok: false }
      return { ok: true, on: surf.uid }
    }
    if (x - fw / 2 < 0.05 || x + fw / 2 > w - 0.05 || z - fd / 2 < 0.05 || z + fd / 2 > d - 0.05) return { ok: false }
    if (overlaps(x, z, itemId, rot, ignoreUid)) return { ok: false }
    // keep the café walkable: at least one empty floor tile per seat in the room
    if (!entry.noCollide && emptyFloorTiles({ itemId, rot, x, z, ignoreUid }) < totalSeats(itemId, ignoreUid))
      return { ok: false, reason: 'floor' }
    return { ok: true }
  }

  // ---------- ghost placement ----------
  const validMat = new THREE.MeshBasicMaterial({ color: '#7CC9AC', transparent: true, opacity: 0.55, depthWrite: false })
  const invalidMat = new THREE.MeshBasicMaterial({ color: '#FF6A8E', transparent: true, opacity: 0.5, depthWrite: false })
  let placing: { itemId: string; variant?: string; rot: 0 | 1 | 2 | 3; ghost: THREE.Group; editUid?: string } | null = null
  let ghostAt: { x: number; z: number; ok: boolean; on?: string; reason?: 'floor' } | null = null
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()

  function makeGhost(itemId: string, variant?: string): THREE.Group {
    const built = buildItem(itemId, variant)
    built.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.material = validMat
      if ((o as THREE.PointLight).isLight) o.visible = false
      o.layers.disable(1)
    })
    return built.group
  }

  function startPlacing(itemId: string, variant?: string, editUid?: string) {
    cancelPlacing()
    const rot = editUid ? store.save.placed.find((p) => p.uid === editUid)?.rot ?? 0 : 0
    const ghost = makeGhost(itemId, variant)
    ghost.visible = false
    group.add(ghost)
    placing = { itemId, variant, rot: rot as 0 | 1 | 2 | 3, ghost, editUid }
    if (editUid) {
      const li = live.get(editUid)
      if (li) li.built.group.visible = false
    }
    setSelection(null)
    cb.onPlacingChange(itemId)
  }

  function cancelPlacing() {
    if (!placing) return
    if (placing.editUid) {
      const li = live.get(placing.editUid)
      if (li) li.built.group.visible = true
    }
    group.remove(placing.ghost)
    placing = null
    ghostAt = null
    cb.onPlacingChange(null)
  }

  function rotateGhost() {
    if (!placing) return
    placing.rot = ((placing.rot + 1) % 4) as 0 | 1 | 2 | 3
    if (ghostAt) updateGhost(ghostAt.x, ghostAt.z)
  }

  function updateGhost(x: number, z: number, surfUid?: string | null) {
    if (!placing) return
    x = Math.round(x * 4) / 4
    z = Math.round(z * 4) / 4
    const v = validAt(x, z, placing.itemId, placing.rot, placing.editUid, surfUid)
    ghostAt = { x, z, ...v }
    const entry = CATALOG[placing.itemId]
    const h = v.on ? CATALOG[store.save.placed.find((p) => p.uid === v.on)!.itemId].surface!.h : entry.placement === 'surface' ? 0.02 : 0
    placing.ghost.visible = true
    placing.ghost.position.set(x, h, z)
    placing.ghost.rotation.y = (placing.rot * Math.PI) / 2
    const mat = v.ok ? validMat : invalidMat
    placing.ghost.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.material = mat
    })
  }

  function confirmPlace(): boolean {
    if (!placing || !ghostAt || !ghostAt.ok) return false
    if (placing.editUid) {
      // moving a surface drags its riders along
      const before = store.save.placed.find((p) => p.uid === placing!.editUid)!
      const dx = ghostAt.x - before.x
      const dz = ghostAt.z - before.z
      store.moveItem(placing.editUid, ghostAt.x, ghostAt.z, placing.rot, ghostAt.on)
      for (const rider of store.save.placed.filter((p) => p.on === placing!.editUid))
        store.moveItem(rider.uid, rider.x + dx, rider.z + dz, rider.rot, rider.on)
    } else {
      store.placeItem(placing.itemId, placing.variant, ghostAt.x, ghostAt.z, placing.rot, ghostAt.on)
    }
    sfx.place()
    cancelPlacing()
    return true
  }

  // ---------- packages at the door ----------
  const pkgLive = new Map<string, THREE.Group>()

  function doorSpot(index: number): THREE.Vector3 {
    const door = store.save.room.openings.find((o) => o.kind === 'door')
    const { w, d } = store.save.room
    if (!door) return new THREE.Vector3(1.5 + index * 1.2, 0, 1.5)
    const mid = door.start + door.width / 2
    if (door.wall === 'left') return new THREE.Vector3(1.2, 0, Math.min(d - 1, mid + index * 1.3))
    return new THREE.Vector3(Math.min(w - 1, mid + index * 1.3), 0, 1.2)
  }

  function syncPackages() {
    const now = Date.now()
    const arrived = visiting ? [] : store.save.packages.filter((p) => p.arriveAt <= now)
    const seen = new Set<string>()
    arrived.forEach((p, i) => {
      seen.add(p.id)
      let grp = pkgLive.get(p.id)
      if (!grp) {
        grp = buildPackage()
        grp.userData.pkg = p.id
        group.add(grp)
        pkgLive.set(p.id, grp)
      }
      const spot = doorSpot(i)
      grp.position.copy(spot)
      grp.rotation.y = 0.3 + i * 0.35
    })
    for (const [id, grp] of pkgLive) {
      if (!seen.has(id)) {
        group.remove(grp)
        pkgLive.delete(id)
      }
    }
  }

  function pollPackages() {
    if (visiting) return
    const now = Date.now()
    for (const p of store.save.packages) {
      if (p.arriveAt <= now && !pkgLive.has(p.id)) {
        syncPackages()
        toast('a package arrived at the door ♪')
        return
      }
    }
  }

  // ---------- seats & occupants ----------
  interface SeatRef {
    key: string
    uid: string
    index: number
    x: number
    z: number
    itemId: string
    rot: number
  }

  function seatRefs(): SeatRef[] {
    const out: SeatRef[] = []
    for (const p of activePlaced()) {
      const seats = CATALOG[p.itemId].seats
      if (!seats) continue
      seats.forEach((s, i) => {
        const a = (p.rot * Math.PI) / 2
        const sx = p.x + s.dx * Math.cos(a) + s.dz * Math.sin(a)
        const sz = p.z - s.dx * Math.sin(a) + s.dz * Math.cos(a)
        out.push({ key: `${p.uid}:${i}`, uid: p.uid, index: i, x: sx, z: sz, itemId: p.itemId, rot: p.rot })
      })
    }
    return out
  }

  /** A sim persona, or a real remote player's (real=true, with full avatar). */
  type PatronPersona = SimPersona & {
    skin?: string
    hairStyle?: 'short' | 'long'
    glasses?: boolean
    real?: boolean
    uid?: string
  }

  interface Occupant {
    group: THREE.Group
    animate: (dt: number, t: number) => void
    persona?: PatronPersona
    sitSince: number
  }
  const occupants = new Map<string, Occupant>()
  /** presence key → seat key, for the real people rendered in this room. */
  const remoteSeat = new Map<string, string>()
  let session: Session | null = null

  const playerOpts = () => {
    const a = store.save.avatar
    return {
      hair: a.hair,
      sweater: a.sweater,
      sweaterDeep: `#${new THREE.Color(a.sweater).multiplyScalar(0.78).getHexString()}`,
      skin: a.skin,
      hairStyle: a.hairStyle,
      glasses: a.glasses,
    }
  }

  function faceAngle(x: number, z: number): number {
    let best: PlacedItem | null = null
    let bd = Infinity
    for (const q of activePlaced()) {
      if (!CATALOG[q.itemId].surface) continue
      const dist = Math.hypot(q.x - x, q.z - z)
      if (dist < bd) {
        bd = dist
        best = q
      }
    }
    // face the table you're anchored to; otherwise face the room's viewer corner
    if (best && bd < 3.4) return Math.atan2(best.x - x, best.z - z)
    return Math.PI * 0.8
  }

  function spawnSitter(seat: SeatRef, persona?: PatronPersona): Occupant {
    const person = buildPerson(persona ?? playerOpts())
    const entry = CATALOG[seat.itemId]
    const y = entry.seatY ?? 1.8
    person.group.position.set(seat.x, y, seat.z)
    // seats with backrests face the seat's forward; backless seats face the table
    person.group.rotation.y = entry.seatFaces === 'item' ? (seat.rot * Math.PI) / 2 : faceAngle(seat.x, seat.z)
    person.group.userData.occKey = seat.key
    group.add(person.group)
    const occ: Occupant = {
      group: person.group,
      animate: makeAnimator(person, Math.random() * 6, persona ? 3 + Math.random() * 2 : 4),
      persona,
      sitSince: Date.now(),
    }
    occupants.set(seat.key, occ)
    return occ
  }

  function removeOccupant(key: string) {
    const o = occupants.get(key)
    if (!o) return
    if (hoverHull?.src === o.group) clearHull()
    group.remove(o.group)
    occupants.delete(key)
  }

  function clearOccupants() {
    for (const k of [...occupants.keys()]) removeOccupant(k)
    remoteSeat.clear()
  }

  /** Reconcile the real people in this room (from realtime presence).
   *  Earliest claim wins a contested seat; real people bump sims. */
  function setRemotePatrons(patrons: RemotePatron[]) {
    const seats = seatRefs()
    // one winner per seat: the earliest claim
    const want = new Map<string, RemotePatron>()
    for (const p of patrons) {
      if (!p.seatKey || !seats.some((s) => s.key === p.seatKey)) continue
      const cur = want.get(p.seatKey)
      if (!cur || p.since < cur.since) want.set(p.seatKey, p)
    }
    // drop remotes that left, stood up, or moved seats
    for (const [key, seatKey] of [...remoteSeat]) {
      if (want.get(seatKey)?.key !== key) {
        removeOccupant(seatKey)
        remoteSeat.delete(key)
      }
    }
    for (const [seatKey, p] of want) {
      const status = p.napkin ? `"${p.napkin}"` : '"studying ♪"'
      if (remoteSeat.get(p.key) === seatKey) {
        // already rendered — keep the profile card fresh
        const occ = occupants.get(seatKey)
        if (occ?.persona) {
          occ.persona.status = status
          occ.persona.working = p.napkin || '…'
          occ.persona.headphones = p.headphones
        }
        continue
      }
      const cur = occupants.get(seatKey)
      if (cur) {
        if (session?.seatKey === seatKey) {
          if (p.since >= session.startedAt) continue // I was here first
          leaveSeat() // they were — hop up gracefully (focused time still pays out)
          toast('someone was already in that seat ♪')
        } else if (cur.persona && !cur.persona.real) {
          removeOccupant(seatKey) // a sim always gives up its seat for a real person
        } else {
          continue
        }
      }
      const seat = seats.find((s) => s.key === seatKey)!
      const occ = spawnSitter(seat, {
        name: p.name,
        status,
        working: p.napkin || '…',
        headphones: p.headphones,
        streak: 'here now ★',
        hair: p.hair,
        sweater: p.sweater,
        sweaterDeep: `#${new THREE.Color(p.sweater).multiplyScalar(0.78).getHexString()}`,
        skin: p.skin,
        hairStyle: p.hairStyle,
        glasses: p.glasses,
        real: true,
        uid: p.uid || undefined,
      })
      occ.sitSince = p.since
      remoteSeat.set(p.key, seatKey)
    }
  }

  // ---------- the standing player ----------
  let standing: { group: THREE.Group; animate: (dt: number, t: number) => void; since: number } | null = null
  /** Pick-up-and-drop: the player is carried by the cursor and snaps to tiles. */
  let dragState: { moved: boolean; ox: number; oz: number } | null = null

  function removeStanding() {
    if (!standing) return
    if (hoverHull?.src === standing.group) clearHull()
    group.remove(standing.group)
    standing = null
    dragState = null
  }

  function spotBlocked(x: number, z: number): boolean {
    for (const p of activePlaced()) {
      const e = CATALOG[p.itemId]
      if (e.noCollide || e.placement === 'surface') continue
      const [fw, fd] = footprintOf(p.itemId, p.rot)
      if (Math.abs(p.x - x) < fw / 2 + 0.3 && Math.abs(p.z - z) < fd / 2 + 0.3) return true
    }
    return false
  }

  function tileFree(x: number, z: number): boolean {
    const room = activeRoom()
    if (x < 0.6 || z < 0.6 || x > room.w - 0.6 || z > room.d - 0.6) return false
    return !spotBlocked(x, z)
  }

  /** Nearest empty 1-unit floor tile to (fx, fz) — where a person can stand. */
  function nearestFreeTile(fx: number, fz: number): { x: number; z: number } | null {
    const cx = Math.round(fx - 0.5) + 0.5
    const cz = Math.round(fz - 0.5) + 0.5
    for (let r = 0; r <= 10; r++) {
      let best: { x: number; z: number; d: number } | null = null
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const x = cx + dx
          const z = cz + dz
          if (!tileFree(x, z)) continue
          const d = Math.hypot(x - fx, z - fz)
          if (!best || d < best.d) best = { x, z, d }
        }
      if (best) return { x: best.x, z: best.z }
    }
    return null
  }

  function spawnStanding(x: number, z: number, rotY: number) {
    removeStanding()
    const person = buildPerson(playerOpts(), 'stand')
    person.group.position.set(x, 0, z)
    person.group.rotation.y = rotY
    person.group.userData.player = true
    group.add(person.group)
    standing = { group: person.group, animate: makeIdleAnimator(person, Math.random() * 6), since: Date.now() }
  }

  function doorLanding(): { x: number; z: number; rotY: number } {
    const room = activeRoom()
    const door = room.openings.find((o) => o.kind === 'door')
    const mid = door ? door.start + door.width / 2 : 2
    let x = door?.wall === 'left' ? 2.1 : Math.min(room.w - 1.5, Math.max(1.5, mid))
    let z = door?.wall === 'left' ? Math.min(room.d - 1.5, Math.max(1.5, mid)) : 2.1
    const rotY = door?.wall === 'left' ? Math.PI / 2 : 0
    const t = nearestFreeTile(x, z)
    if (t) {
      x = t.x
      z = t.z
    }
    return { x, z, rotY }
  }

  function standAtDoor() {
    const { x, z, rotY } = doorLanding()
    spawnStanding(x, z, rotY)
  }

  /** The nearest empty floor tile beside the seat to stand up onto. */
  function standSpotNear(seat: SeatRef): { x: number; z: number } {
    return nearestFreeTile(seat.x, seat.z) ?? doorLanding()
  }

  function sit(seat: SeatRef) {
    if (session) leaveSeat()
    removeStanding()
    spawnSitter(seat)
    session = {
      seatKey: seat.key,
      cafeName: visiting ? visiting.name : 'your café',
      startedAt: Date.now(),
      napkin: '',
      headphones: true,
    }
    cb.onSession(session)
    sfx.pop()
    toast(visiting ? `studying at ${visiting.name} ♪` : 'you took a seat ♪')
  }

  function leaveSeat() {
    if (!session) return
    const seat = seatRefs().find((s) => s.key === session!.seatKey)
    const minutes = Math.floor((Date.now() - session.startedAt) / 60000)
    removeOccupant(session.seatKey)
    session = null
    cb.onSession(null)
    if (seat) {
      const spot = standSpotNear(seat)
      // stand facing back toward the seat you just left
      spawnStanding(spot.x, spot.z, Math.atan2(seat.x - spot.x, seat.z - spot.z))
    } else {
      standAtDoor()
    }
    // focused time is the currency: 1 bean per focused minute (+10 xp each)
    if (minutes > 0) {
      store.addBeans(minutes)
      store.addXp(minutes * 10)
      cb.onFloat(`+${minutes} beans`, 'earn')
      sfx.earn()
      toast(`+${minutes} beans for focused time ♪`)
    }
  }

  function spawnSims() {
    if (!visiting) return
    const free = seatRefs().filter((s) => !occupants.has(s.key))
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[free[i], free[j]] = [free[j], free[i]]
    }
    visiting.sims.forEach((sim, i) => {
      if (i >= free.length) return
      const occ = spawnSitter(free[i], sim)
      occ.sitSince = Date.now() - (12 + Math.random() * 110) * 60000
    })
  }

  function playerCard(): CardData {
    return {
      self: true,
      name: store.save.info.name || 'you',
      status: session ? (session.napkin ? `"${session.napkin}"` : '"locked in ♪"') : '"just looking around ♪"',
      working: session?.napkin || '…',
      headphones: session?.headphones ?? true,
      streak: '1 day ★',
      focusedSince: session?.startedAt ?? standing?.since ?? Date.now(),
      hair: store.save.avatar.hair,
      sweater: store.save.avatar.sweater,
    }
  }

  function cardFor(key: string): CardData {
    const occ = occupants.get(key)
    if (occ?.persona) return { ...occ.persona, focusedSince: occ.sitSince, userId: occ.persona.uid }
    return playerCard()
  }

  // ---------- visiting ----------
  function visit(cafe: DreamCafe | null) {
    if ((cafe?.id ?? null) === (visiting?.id ?? null)) return
    if (session) {
      removeOccupant(session.seatKey)
      session = null
      cb.onSession(null)
    }
    clearOccupants()
    removeStanding()
    cancelPlacing()
    setSelection(null)
    visiting = cafe
    mode = 'view'
    seatRing.visible = false
    rebuildShell()
    syncPlaced()
    syncPackages()
    if (cafe) {
      spawnSims()
      store.addXp(3) // getting out there
    }
    standAtDoor() // you walk in through the door
    cb.onVisit(cafe)
  }

  // ---------- seat hover ring ----------
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#FFC24D',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const seatRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.74, 28), ringMat)
  seatRing.rotation.x = -Math.PI / 2
  seatRing.visible = false
  group.add(seatRing)

  // ---------- blinking white outline on everything clickable ----------
  let hoverDoor = false
  /** What the hovered thing does, floated above it ("sit down ♪"). */
  let hoverInfo: { text: string; x: number; y: number; z: number } | null = null
  let hoverHull: { src: THREE.Group; holder: THREE.Group } | null = null
  const hullMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', side: THREE.BackSide })

  /** Inverted-hull white shell: a thin outline hugging the hovered object. */
  function buildHull(src: THREE.Group): THREE.Group {
    const box = new THREE.Box3().setFromObject(src)
    const size = box.getSize(new THREE.Vector3())
    const centerWorld = box.getCenter(new THREE.Vector3())
    const centerLocal = src.worldToLocal(centerWorld.clone())
    const maxDim = Math.max(size.x, size.y, size.z, 0.2)
    const scale = Math.min(1.2, Math.max(1.05, 1 + 0.13 / maxDim))
    const holder = new THREE.Group()
    holder.position.copy(src.position)
    holder.rotation.copy(src.rotation)
    const pivot = new THREE.Group()
    pivot.position.copy(centerLocal)
    pivot.scale.setScalar(scale)
    const inner = src.clone(true)
    inner.position.set(-centerLocal.x, -centerLocal.y, -centerLocal.z)
    inner.rotation.set(0, 0, 0)
    inner.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.material = hullMat
        m.castShadow = false
        m.receiveShadow = false
      }
      if ((o as THREE.Light).isLight) o.visible = false
      o.layers.disable(1) // keep the shell out of the retro-outline mask
    })
    pivot.add(inner)
    holder.add(pivot)
    return holder
  }

  function clearHull() {
    if (!hoverHull) return
    group.remove(hoverHull.holder)
    hoverHull = null
  }

  function setHoverHull(src: THREE.Group | null) {
    if (hoverHull?.src === src) return
    clearHull()
    if (!src) return
    const holder = buildHull(src)
    group.add(holder)
    hoverHull = { src, holder }
  }

  function setDoorGlow(v: boolean) {
    hoverDoor = v
    if (doorGlow) doorGlow.visible = v
  }

  function personUnderRay(ray: THREE.Raycaster): THREE.Group | null {
    const people = [...occupants.values()].map((o) => o.group)
    if (standing) people.push(standing.group)
    if (!people.length) return null
    const hits = ray.intersectObjects(people, true)
    if (!hits.length) return null
    let o: THREE.Object3D | null = hits[0].object
    while (o && !o.userData.occKey && !o.userData.player) o = o.parent
    return (o as THREE.Group) ?? null
  }

  const INTERACT_ITEMS = new Set(['guestbook', 'salon-mirror'])

  /** Anything hoverable/clickable that should glow white. */
  function interactableUnderRay(ray: THREE.Raycaster): { group: THREE.Group | null; door: boolean } {
    const person = personUnderRay(ray)
    if (person) return { group: person, door: false }
    if (pkgLive.size) {
      const hits = ray.intersectObjects([...pkgLive.values()], true)
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object
        while (o && !o.userData.pkg) o = o.parent
        if (o) return { group: o as THREE.Group, door: false }
      }
    }
    const specials = [...live.values()].filter((li) => INTERACT_ITEMS.has(li.data.itemId)).map((li) => li.built.group)
    if (specials.length && mode === 'view') {
      const hits = ray.intersectObjects(specials, true)
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object
        while (o && !o.userData.uid) o = o.parent
        if (o) return { group: o as THREE.Group, door: false }
      }
    }
    if (doorHit && mode === 'view') {
      const dh = ray.intersectObject(doorHit)
      if (dh.length) {
        // only the door if nothing solid is in front of it along the ray
        const furn = ray.intersectObjects([...live.values()].map((li) => li.built.group), true)
        if (!furn.length || dh[0].distance < furn[0].distance) return { group: null, door: true }
      }
    }
    return { group: null, door: false }
  }

  function seatUnderRay(ray: THREE.Raycaster): SeatRef | null {
    const seatGroups = [...live.values()]
      .filter((li) => CATALOG[li.data.itemId].seats)
      .map((li) => li.built.group)
    if (!seatGroups.length) return null
    const hits = ray.intersectObjects(seatGroups, true)
    if (!hits.length) return null
    let o: THREE.Object3D | null = hits[0].object
    while (o && !o.userData.uid) o = o.parent
    if (!o) return null
    const pt = hits[0].point
    const cands = seatRefs().filter((s) => s.uid === o!.userData.uid)
    cands.sort((a, b) => Math.hypot(a.x - pt.x, a.z - pt.z) - Math.hypot(b.x - pt.x, b.z - pt.z))
    return cands[0] ?? null
  }

  // ---------- selection ----------
  let selection: string | null = null
  function setSelection(uidStr: string | null) {
    selection = uidStr
    if (!uidStr) {
      cb.onSelection(null)
      return
    }
    const data = live.get(uidStr)!.data
    cb.onSelection({ uid: uidStr, name: CATALOG[data.itemId].name, itemId: data.itemId, variant: data.variant })
  }

  // ---------- input from main ----------
  function pointerMove(ray: THREE.Raycaster) {
    if (!placing) {
      // anything clickable gets the blinking white outline + an action label
      const hov = interactableUnderRay(ray)
      setDoorGlow(hov.door)
      hoverInfo = null
      let hullTarget: THREE.Group | null = hov.group
      if (hov.door && doorHit) {
        hoverInfo = {
          text: visiting ? 'go home ♪' : 'café directory',
          x: doorHit.position.x,
          y: 5.8,
          z: doorHit.position.z,
        }
      } else if (hov.group) {
        const g = hov.group
        let text = ''
        if (g.userData.player) text = "this is you — drag to move ♪"
        else if (g.userData.occKey) text = occupants.get(g.userData.occKey)?.persona ? 'say hi ♪' : 'this is you'
        else if (g.userData.pkg) text = 'open the package ♪'
        else if (g.userData.uid) {
          const item = live.get(g.userData.uid)?.data.itemId
          if (item === 'guestbook') text = visiting ? 'sign the guestbook ♪' : 'your guestbook ♪'
          else if (item === 'salon-mirror') text = 'change your look ♪'
        }
        if (text) {
          const box = new THREE.Box3().setFromObject(g)
          hoverInfo = { text, x: (box.min.x + box.max.x) / 2, y: box.max.y + 0.35, z: (box.min.z + box.max.z) / 2 }
        }
      } else if (mode === 'view') {
        // free seats outline their whole seat
        const s = seatUnderRay(ray)
        if (s && !occupants.has(s.key)) {
          hullTarget = live.get(s.uid)?.built.group ?? null
          hoverInfo = { text: 'sit down ♪', x: s.x, y: (CATALOG[s.itemId].seatY ?? 1.8) + 1.2, z: s.z }
        }
      }
      setHoverHull(hullTarget)
      return
    }
    hoverInfo = null
    if (CATALOG[placing.itemId].placement === 'surface') {
      // aim at the actual tabletops, not the floor plane (parallax!)
      const surfGroups = [...live.values()]
        .filter((li) => CATALOG[li.data.itemId].surface && li.data.uid !== placing!.editUid)
        .map((li) => li.built.group)
      const hits = ray.intersectObjects(surfGroups, true)
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object
        while (o && !o.userData.uid) o = o.parent
        updateGhost(hits[0].point.x, hits[0].point.z, o?.userData.uid ?? null)
        return
      }
      if (ray.ray.intersectPlane(floorPlane, hitPoint)) updateGhost(hitPoint.x, hitPoint.z, null)
      return
    }
    if (ray.ray.intersectPlane(floorPlane, hitPoint)) updateGhost(hitPoint.x, hitPoint.z)
  }

  function sceneClick(ray: THREE.Raycaster, screenX = 0, screenY = 0): boolean {
    if (placing) {
      if (!confirmPlace() && ghostAt?.reason === 'floor')
        toast('leave an empty floor tile for every seat ♪')
      return true // handled either way
    }
    // packages open in any mode
    if (pkgLive.size) {
      const pkgHits = ray.intersectObjects([...pkgLive.values()], true)
      if (pkgHits.length) {
        let o: THREE.Object3D | null = pkgHits[0].object
        while (o && !o.userData.pkg) o = o.parent
        if (o) {
          const contents = store.openPackage(o.userData.pkg)
          if (contents) {
            const list = Object.entries(contents)
              .map(([k, n]) => `${n}× ${CATALOG[k].name}`)
              .join(' · ')
            toast(`unboxed: ${list}`)
            sfx.unbox()
            heartBurst(screenX, screenY)
          }
          return true
        }
      }
    }
    // people: open their profile card (any mode)
    const people = [...occupants.values()].map((o) => o.group)
    if (standing) people.push(standing.group)
    if (people.length) {
      const occHits = ray.intersectObjects(people, true)
      if (occHits.length) {
        let o: THREE.Object3D | null = occHits[0].object
        while (o && !o.userData.occKey && !o.userData.player) o = o.parent
        if (o) {
          cb.onPatronCard(o.userData.player ? playerCard() : cardFor(o.userData.occKey), screenX, screenY)
          return true
        }
      }
    }
    // view mode: nearest of door / guestbook / mirror wins, then seats
    if (mode === 'view') {
      const furnHits = ray.intersectObjects([...live.values()].map((li) => li.built.group), true)
      const doorHits = doorHit ? ray.intersectObject(doorHit) : []
      const doorDist = doorHits.length ? doorHits[0].distance : Infinity
      const furnDist = furnHits.length ? furnHits[0].distance : Infinity
      if (doorDist < furnDist) {
        cb.onDoor(!visiting)
        return true
      }
      if (furnHits.length) {
        let o: THREE.Object3D | null = furnHits[0].object
        while (o && !o.userData.uid) o = o.parent
        const li = o ? live.get(o.userData.uid) : undefined
        if (li?.data.itemId === 'guestbook') {
          cb.onGuestbook(!visiting, screenX, screenY)
          return true
        }
        if (li?.data.itemId === 'salon-mirror') {
          cb.onSalon(visiting?.shop ?? 'all')
          return true
        }
      }
      const s = seatUnderRay(ray)
      if (s) {
        if (occupants.has(s.key)) {
          toast("someone's already sitting there ♪")
        } else {
          sit(s)
          seatRing.visible = false
          heartBurst(screenX, screenY)
        }
        return true
      }
      return false
    }
    if (mode !== 'furnish') return false
    const groups = [...live.values()].map((li) => li.built.group)
    const hits = ray.intersectObjects(groups, true)
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object
      while (o && !o.userData.uid) o = o.parent
      if (o) {
        setSelection(o.userData.uid)
        return true
      }
    }
    setSelection(null)
    return false
  }

  // ---------- store wiring ----------
  store.on('room', () => {
    rebuildShell()
    syncPlaced() // eviction may have removed items
    syncPackages()
    if (standing) {
      // keep the player inside a shrinking room
      const { w, d } = activeRoom()
      standing.group.position.x = Math.min(w - 0.8, Math.max(0.8, standing.group.position.x))
      standing.group.position.z = Math.min(d - 0.8, Math.max(0.8, standing.group.position.z))
    }
  })
  store.on('placed', syncPlaced)
  store.on('packages', syncPackages)
  store.on('avatar', () => {
    // new look → rebuild whichever body the player currently has
    if (standing) {
      const p = standing.group.position.clone()
      const r = standing.group.rotation.y
      spawnStanding(p.x, p.z, r)
    } else if (session) {
      const seat = seatRefs().find((s) => s.key === session!.seatKey)
      if (seat) {
        removeOccupant(session.seatKey)
        spawnSitter(seat)
      }
    }
  })

  rebuildShell()
  syncPlaced()
  syncPackages()
  standAtDoor() // the player is always somewhere in the room

  const handle = {
    group,
    skyMat,
    glassMat,
    lampShadeMat,
    lampLights,
    fairyMats: [] as THREE.MeshBasicMaterial[],
    pendantPositions: pendantGrid(),
    update(dt: number, t: number) {
      shell?.update(dt)
      for (const li of live.values()) li.built.update?.(dt, t)
      for (const o of occupants.values()) o.animate(dt, t)
      standing?.animate(dt, t)
      // carried: dangle gently while held
      if (standing && dragState) standing.group.rotation.z = Math.sin(t * 6) * 0.06
      // hover outlines blink — slowly — and stay glued to what they outline
      const blink = Math.sin(t * 2.4) > -0.55
      if (hoverHull) {
        if (!hoverHull.src.parent) {
          clearHull() // the outlined thing is gone
        } else {
          hoverHull.holder.position.copy(hoverHull.src.position)
          hoverHull.holder.rotation.copy(hoverHull.src.rotation)
          hoverHull.holder.visible = blink
        }
      }
      if (doorGlow) doorGlow.visible = hoverDoor && blink
      if (seatRing.visible) ringMat.opacity = 0.6 + Math.sin(t * 3.2) * 0.22
      // gentle bob on waiting packages + arrival polling
      for (const grp of pkgLive.values()) grp.position.y = Math.sin(t * 2 + grp.position.x) * 0.02 + 0.02
      pollPackages()
    },
  }

  return {
    handle,
    setMode(m: EditMode) {
      if (visiting && m !== 'view') return // you can only edit your own café
      mode = m
      if (m !== 'view') {
        leaveSeat() // stand up to edit
        seatRing.visible = false
      }
      if (m !== 'furnish') {
        cancelPlacing()
        setSelection(null)
      }
    },
    getMode: () => mode,
    visit,
    getVisiting: () => visiting,
    leaveSeat,
    getSession: () => session,
    setRemotePatrons,
    /** Begin carrying the standing player (returns true if the grab landed). */
    startDrag(ray: THREE.Raycaster): boolean {
      if (mode !== 'view' || !standing) return false
      if (personUnderRay(ray) !== standing.group) return false
      dragState = { moved: false, ox: standing.group.position.x, oz: standing.group.position.z }
      // no ghost silhouettes while you're carried
      clearHull()
      setDoorGlow(false)
      hoverInfo = null
      return true
    },
    dragMove(ray: THREE.Raycaster) {
      if (!dragState || !standing) return
      hoverInfo = null
      if (!ray.ray.intersectPlane(floorPlane, hitPoint)) return
      const room = activeRoom()
      const sx = Math.min(room.w - 1.5, Math.max(1.5, Math.round(hitPoint.x - 0.5) + 0.5))
      const sz = Math.min(room.d - 1.5, Math.max(1.5, Math.round(hitPoint.z - 0.5) + 0.5))
      if (sx !== dragState.ox || sz !== dragState.oz) dragState.moved = true
      standing.group.position.set(sx, 0.4, sz) // held aloft
      seatRing.visible = true
      seatRing.position.set(sx, 0.05, sz)
      ringMat.color.set(tileFree(sx, sz) ? '#7CC9AC' : '#FF6A8E')
    },
    /** Drop the player. Returns true if they actually moved (false = it was a click). */
    endDrag(): boolean {
      if (!dragState || !standing) {
        dragState = null
        return false
      }
      const moved = dragState.moved
      const g = standing.group
      g.rotation.z = 0
      seatRing.visible = false
      ringMat.color.set('#FFC24D')
      if (!moved) {
        g.position.y = 0
        dragState = null
        return false
      }
      let x = g.position.x
      let z = g.position.z
      if (!tileFree(x, z)) {
        const t = nearestFreeTile(x, z)
        if (t) {
          x = t.x
          z = t.z
        } else {
          x = dragState.ox
          z = dragState.oz
        }
      }
      g.position.set(x, 0, z)
      sfx.pop()
      dragState = null
      return true
    },
    /** Quarter-turn the standing player (R key / the card's turn button). */
    turnPlayer() {
      if (!standing || dragState) return
      standing.group.rotation.y = (Math.round(standing.group.rotation.y / (Math.PI / 2)) + 1) * (Math.PI / 2)
      sfx.tick()
    },
    getHoverInfo: () => hoverInfo,
    /** World anchor above a sim's head, for chat bubbles. */
    getSimAnchor(name: string): THREE.Vector3 | null {
      for (const o of occupants.values())
        if (o.persona?.name === name) return o.group.position.clone().add(new THREE.Vector3(0, 1.9, 0))
      return null
    },
    /** World position just above the player's head (for floaters). */
    getPlayerAnchor(): THREE.Vector3 | null {
      if (session) {
        const occ = occupants.get(session.seatKey)
        if (occ) return occ.group.position.clone().add(new THREE.Vector3(0, 1.9, 0))
      }
      if (standing) return standing.group.position.clone().add(new THREE.Vector3(0, 2.5, 0))
      return null
    },
    float(text: string, kind: 'spend' | 'earn') {
      cb.onFloat(text, kind)
    },
    setNapkin(text: string) {
      if (session) session.napkin = text
    },
    setHeadphones(v: boolean) {
      if (session) session.headphones = v
    },
    startPlacing,
    cancelPlacing,
    rotateGhost,
    isPlacing: () => !!placing,
    pointerMove,
    sceneClick,
    capacity,
    rotateSelected() {
      if (!selection) return
      const p = store.save.placed.find((q) => q.uid === selection)!
      const next = ((p.rot + 1) % 4) as 0 | 1 | 2 | 3
      if (validAt(p.x, p.z, p.itemId, next, p.uid).ok) store.rotateItem(selection)
    },
    moveSelected() {
      if (!selection) return
      const p = store.save.placed.find((q) => q.uid === selection)!
      startPlacing(p.itemId, p.variant, p.uid)
    },
    storeSelected() {
      if (!selection) return
      store.storeItem(selection)
      setSelection(null)
    },
  }
}

export type Game = ReturnType<typeof createGame>
