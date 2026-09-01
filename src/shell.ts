// Renders a RoomDoc into the room shell: floor, walls, openings, glass/sky/rain.
// Structure only — furniture is placed items, people are people.
import * as THREE from 'three'
import { VoxelGrid } from './voxel'
import { PAL, UNIT, VOX } from './build'
import type { Opening, RoomDoc } from './types'

const WALL_H = 120 // voxels
const WIN_Y0 = 48
const WIN_Y1 = 108

interface FloorDef {
  a: string
  b: string
  seam: string
  line: string
  tile: number
  kind: 'wood' | 'checker' | 'carpet'
}
const FLOORS: Record<string, FloorDef> = {
  // woods
  honey: { a: PAL.floorA, b: PAL.floorB, seam: PAL.floorSeam, line: PAL.floorLine, tile: 40, kind: 'wood' },
  pale: { a: '#F4E3C4', b: '#EFDCBA', seam: '#E2CCA4', line: '#EBD6AE', tile: 32, kind: 'wood' },
  walnut: { a: '#9A6B45', b: '#916440', seam: '#7E5636', line: '#8A5F3E', tile: 40, kind: 'wood' },
  white: { a: '#F2EADC', b: '#EDE4D2', seam: '#DFD4C0', line: '#EBE0CC', tile: 32, kind: 'wood' },
  // checkers
  checker: { a: '#FBF1DC', b: '#F8DFE6', seam: '#EFD2C4', line: '#F8DFE6', tile: 16, kind: 'checker' },
  'checker-mint': { a: '#FBF1DC', b: '#DDEEE3', seam: '#EFD2C4', line: '#DDEEE3', tile: 16, kind: 'checker' },
  'checker-sky': { a: '#FBF1DC', b: '#DAE8F4', seam: '#EFD2C4', line: '#DAE8F4', tile: 16, kind: 'checker' },
  'checker-ink': { a: '#EDE5D4', b: '#8A8A94', seam: '#DFD4C0', line: '#8A8A94', tile: 16, kind: 'checker' },
  // pure white planks
  snow: { a: '#FFFFFF', b: '#FBFBFB', seam: '#EDEDED', line: '#F6F6F6', tile: 32, kind: 'wood' },
  // carpets
  carpet: { a: '#BFD9BC', b: '#BFD9BC', seam: '#BFD9BC', line: '#BFD9BC', tile: 40, kind: 'carpet' },
  'carpet-snow': { a: '#FFFFFF', b: '#FFFFFF', seam: '#FFFFFF', line: '#FFFFFF', tile: 40, kind: 'carpet' },
  'carpet-rose': { a: '#E8C7CE', b: '#E8C7CE', seam: '#E8C7CE', line: '#E8C7CE', tile: 40, kind: 'carpet' },
  'carpet-butter': { a: '#EFE0B0', b: '#EFE0B0', seam: '#EFE0B0', line: '#EFE0B0', tile: 40, kind: 'carpet' },
  'carpet-sky': { a: '#C3D8EA', b: '#C3D8EA', seam: '#C3D8EA', line: '#C3D8EA', tile: 40, kind: 'carpet' },
  'carpet-lavender': { a: '#D8CFEA', b: '#D8CFEA', seam: '#D8CFEA', line: '#D8CFEA', tile: 40, kind: 'carpet' },
  'carpet-cream': { a: '#EDE5D4', b: '#EDE5D4', seam: '#EDE5D4', line: '#EDE5D4', tile: 40, kind: 'carpet' },
  'carpet-graphite': { a: '#9A9AA4', b: '#9A9AA4', seam: '#9A9AA4', line: '#9A9AA4', tile: 40, kind: 'carpet' },
}
const WALLS: Record<string, { wall: string; wainscot: string; groove: string }> = {
  cream: { wall: PAL.wall, wainscot: PAL.wainscot, groove: PAL.groove },
  white: { wall: '#FDFCF6', wainscot: '#F1EEE4', groove: '#E4E0D2' },
  snow: { wall: '#FFFFFF', wainscot: '#F3F3F3', groove: '#E7E7E7' },
  pink: { wall: '#FBE9F0', wainscot: '#F6D9E3', groove: '#EFCBD9' },
  mint: { wall: '#EAF4ED', wainscot: '#DBECE0', groove: '#CCE1D3' },
  sky: { wall: '#E8F1F8', wainscot: '#D9E7F2', groove: '#C9DAEA' },
  lavender: { wall: '#EFEAF8', wainscot: '#E2DAF2', groove: '#D3C8E8' },
  butter: { wall: '#FBF3DC', wainscot: '#F4E7C2', groove: '#EAD9A8' },
  sage: { wall: '#EDF2E4', wainscot: '#DFE8D2', groove: '#D0DCBE' },
  greige: { wall: '#EAE5DC', wainscot: '#DDD6C9', groove: '#CFC6B6' },
  cocoa: { wall: '#B99C82', wainscot: '#A8886C', groove: '#977858' },
  charcoal: { wall: '#7E7E88', wainscot: '#6E6E78', groove: '#5F5F6A' },
}
const FLOOR_FALLBACK = FLOORS.honey
const WALL_FALLBACK = WALLS.cream

/** Swatch catalogs for the room editors (id + a CSS preview). */
export const FLOOR_CHOICES: { id: string; css: string }[] = Object.entries(FLOORS).map(([id, f]) => ({
  id,
  css: f.kind === 'checker' ? `linear-gradient(45deg, ${f.a} 50%, ${f.b} 50%)` : f.a,
}))
export const WALL_CHOICES: { id: string; css: string }[] = Object.entries(WALLS).map(([id, w]) => ({
  id,
  css: w.wall,
}))

export interface ShellHandles {
  group: THREE.Group
  skyMat: THREE.MeshBasicMaterial
  glassMat: THREE.MeshBasicMaterial
  update: (dt: number) => void
  dispose: () => void
}

export function buildShell(
  room: RoomDoc,
  mats?: { skyMat: THREE.MeshBasicMaterial; glassMat: THREE.MeshBasicMaterial }
): ShellHandles {
  const group = new THREE.Group()
  const W = room.w * UNIT
  const D = room.d * UNIT
  const fl = FLOORS[room.floor] ?? FLOOR_FALLBACK
  const wl = WALLS[room.wallStyle] ?? WALL_FALLBACK
  const g = new VoxelGrid()

  // ---------- floor + plinth ring ----------
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      const tx = Math.floor(x / fl.tile)
      const tz = Math.floor(z / fl.tile)
      let tone = fl.kind === 'carpet' ? fl.a : (tx + tz) % 2 === 0 ? fl.a : fl.b
      if (fl.kind === 'wood') {
        if (x % fl.tile === 0 || z % fl.tile === 0) tone = fl.seam
        else if ((tx + tz) % 2 === 0 ? x % 10 === 5 : z % 10 === 5) tone = fl.line
      }
      g.set(x, -1, z, tone)
    }
  g.fill(0, -6, 0, W - 1, -2, 5, PAL.plinth)
  g.fill(0, -6, D - 6, W - 1, -2, D - 1, PAL.plinth)
  g.fill(0, -6, 0, 5, -2, D - 1, PAL.plinth)
  g.fill(W - 6, -6, 0, W - 1, -2, D - 1, PAL.plinth)

  // ---------- walls + honey cap ----------
  g.fill(0, 0, -4, W - 1, WALL_H - 1, -1, wl.wall)
  g.fill(-4, 0, -4, -1, WALL_H - 1, D - 1, wl.wall)
  g.fill(0, WALL_H - 4, -4, W - 1, WALL_H - 1, -1, PAL.honey)
  g.fill(-4, WALL_H - 4, -4, -1, WALL_H - 1, D - 1, PAL.honey)
  for (let x = 0; x < W; x++)
    for (let y = 7; y <= 36; y++) g.set(x, y, -1, x % 8 === 4 ? wl.groove : wl.wainscot)
  for (let z = 0; z < D; z++)
    for (let y = 7; y <= 36; y++) g.set(-1, y, z, z % 8 === 4 ? wl.groove : wl.wainscot)

  // trim rails, segmented around the door opening on each wall
  const doorOn = (wall: Opening['wall']) =>
    room.openings.find((o) => o.kind === 'door' && o.wall === wall)
  const segments = (wall: Opening['wall'], len: number): [number, number][] => {
    const door = doorOn(wall)
    if (!door) return [[0, len - 1]]
    const a = Math.round(door.start * UNIT) - 4
    const b = Math.round((door.start + door.width) * UNIT) + 4
    const out: [number, number][] = []
    if (a > 0) out.push([0, a - 1])
    if (b < len - 1) out.push([b + 1, len - 1])
    return out
  }
  for (const [a, b] of segments('back', W)) {
    g.fill(a, 0, -1, b, 6, 0, PAL.trim)
    g.fill(a, 37, -1, b, 40, 0, PAL.trim)
  }
  for (const [a, b] of segments('left', D)) {
    g.fill(-1, 0, a, 0, 6, b, PAL.trim)
    g.fill(-1, 37, a, 0, 40, b, PAL.trim)
  }

  // ---------- openings ----------
  const glassMat = mats?.glassMat ?? new THREE.MeshBasicMaterial({ color: '#CCDEEE', transparent: true, opacity: 0.15, depthWrite: false })
  const skyMat = mats?.skyMat ?? new THREE.MeshBasicMaterial({ color: '#B7D0E8' })
  const rainSpans: [number, number][] = []

  for (const o of room.openings) {
    const s = Math.round(o.start * UNIT)
    const e = s + Math.round(o.width * UNIT)
    if (o.kind === 'window') {
      if (o.wall === 'back') carveWindow(g, 'back', s, e)
      else carveWindow(g, 'left', s, e)
      // glass + sky. The sky plane sits 2.8 units behind the wall, so the iso
      // view shifts it ~2.8 along the wall: offset the span to cover the
      // through-window view, and clamp the far end so it never peeks past the
      // wall's edge.
      const wallLen = o.wall === 'back' ? room.w : room.d
      const lo = o.start - 3.2
      const hi = Math.max(lo + 0.5, Math.min(o.start + o.width - 2.5, wallLen - 2.95))
      const cw = o.width * UNIT * VOX - 0.35
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(cw, (WIN_Y1 - WIN_Y0) * VOX - 0.4), glassMat)
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(hi - lo, 5), skyMat)
      const mid = ((s + e) / 2) * VOX
      const skyMid = (lo + hi) / 2
      const gy = ((WIN_Y0 + WIN_Y1) / 2) * VOX
      if (o.wall === 'back') {
        glass.position.set(mid, gy, -0.55)
        sky.position.set(skyMid, 2.5, -2.8)
      } else {
        glass.rotation.y = Math.PI / 2
        glass.position.set(-0.55, gy, mid)
        sky.rotation.y = Math.PI / 2
        sky.position.set(-2.8, 2.5, skyMid)
      }
      group.add(glass, sky)
      if (o.wall === 'back') rainSpans.push([o.start, o.start + o.width])
    } else {
      const dColor = o.doorColor ?? PAL.mintDeep
      const dKind = o.doorKind ?? 'classic'
      carveDoor(g, o.wall, s, e, dColor, dKind)
      const m = ((s + e) / 2) * VOX
      if (dKind === 'glass') {
        // full glass door: one tall pane + the sky behind it
        const gw = (e - s - 8) * VOX
        const gh = 75 * VOX
        const gy = 47.5 * VOX
        const pGlass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), glassMat)
        const pSky = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), skyMat)
        if (o.wall === 'left') {
          pGlass.rotation.y = Math.PI / 2
          pSky.rotation.y = Math.PI / 2
          pGlass.position.set(-0.12, gy, m)
          pSky.position.set(-0.27, gy, m)
        } else {
          pGlass.position.set(m, gy, -0.12)
          pSky.position.set(m, gy, -0.27)
        }
        group.add(pGlass, pSky)
      } else {
        // see-through porthole: glass + sky discs behind the carved circle
        const py = 68 * VOX
        const pr = 9.5 * VOX
        const pGlass = new THREE.Mesh(new THREE.CircleGeometry(pr, 24), glassMat)
        const pSky = new THREE.Mesh(new THREE.CircleGeometry(pr + 0.05, 24), skyMat)
        if (o.wall === 'left') {
          pGlass.rotation.y = Math.PI / 2
          pSky.rotation.y = Math.PI / 2
          pGlass.position.set(-0.12, py, m)
          pSky.position.set(-0.27, py, m)
        } else {
          pGlass.position.set(m, py, -0.12)
          pSky.position.set(m, py, -0.27)
        }
        group.add(pGlass, pSky)
      }
    }
  }

  const roomMesh = g.build({ noBottom: true })
  roomMesh.scale.setScalar(VOX)
  group.add(roomMesh)

  // ---------- rain behind the back wall ----------
  const RAIN_N = Math.min(220, 40 + room.w * 6)
  const rainPos = new Float32Array(RAIN_N * 2 * 3)
  const rainSeed: { x: number; z: number; y: number; sp: number }[] = []
  // clamp x so drops behind the wall never peek past its right edge in iso
  for (let i = 0; i < RAIN_N; i++)
    rainSeed.push({ x: 0.5 + Math.random() * Math.max(1, room.w - 4.6), z: -1.3 - Math.random() * 1.2, y: 1.5 + Math.random() * 3.5, sp: 6 + Math.random() * 4 })
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rainMat = new THREE.LineBasicMaterial({ color: '#E8F1FA', transparent: true, opacity: 0.55 })
  group.add(new THREE.LineSegments(rainGeo, rainMat))
  const update = (dt: number) => {
    for (let i = 0; i < RAIN_N; i++) {
      const dd = rainSeed[i]
      dd.y -= dd.sp * dt
      if (dd.y < 1.5) dd.y = 5.0
      rainPos[i * 6] = dd.x
      rainPos[i * 6 + 1] = dd.y
      rainPos[i * 6 + 2] = dd.z
      rainPos[i * 6 + 3] = dd.x
      rainPos[i * 6 + 4] = dd.y + 0.35
      rainPos[i * 6 + 5] = dd.z
    }
    rainGeo.attributes.position.needsUpdate = true
  }

  const dispose = () => {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  }

  return { group, skyMat, glassMat, update, dispose }
}

function carveWindow(g: VoxelGrid, wall: Opening['wall'], s: number, e: number) {
  if (wall === 'back') {
    g.carve(s, WIN_Y0, -4, e - 1, WIN_Y1, -1)
    g.fill(s - 4, WIN_Y0 - 4, -2, e + 3, WIN_Y0 - 1, -1, PAL.trim)
    g.fill(s - 4, WIN_Y0 - 1, -2, e + 3, WIN_Y0 - 1, 1, PAL.trim) // sill lip
    g.fill(s - 4, WIN_Y1 + 1, -2, e + 3, WIN_Y1 + 4, -1, PAL.trim)
    g.fill(s - 4, WIN_Y0, -2, s - 1, WIN_Y1, -1, PAL.trim)
    g.fill(e, WIN_Y0, -2, e + 3, WIN_Y1, -1, PAL.trim)
    if (e - s > 56) {
      const m = Math.round((s + e) / 2)
      g.fill(m - 1, WIN_Y0, -2, m + 1, WIN_Y1, -1, PAL.trim)
    }
    g.fill(s, 76, -2, e - 1, 80, -1, PAL.trim)
  } else {
    g.carve(-4, WIN_Y0, s, -1, WIN_Y1, e - 1)
    g.fill(-2, WIN_Y0 - 4, s - 4, -1, WIN_Y0 - 1, e + 3, PAL.trim)
    g.fill(-2, WIN_Y0 - 1, s - 4, 1, WIN_Y0 - 1, e + 3, PAL.trim)
    g.fill(-2, WIN_Y1 + 1, s - 4, -1, WIN_Y1 + 4, e + 3, PAL.trim)
    g.fill(-2, WIN_Y0, s - 4, -1, WIN_Y1, s - 1, PAL.trim)
    g.fill(-2, WIN_Y0, e, -1, WIN_Y1, e + 3, PAL.trim)
    if (e - s > 56) {
      const m = Math.round((s + e) / 2)
      g.fill(-2, WIN_Y0, m - 1, -1, WIN_Y1, m + 1, PAL.trim)
    }
    g.fill(-2, 76, s, -1, 80, e - 1, PAL.trim)
  }
}

function carveDoor(
  g: VoxelGrid,
  wall: Opening['wall'],
  s: number,
  e: number,
  color: string,
  kind: 'classic' | 'glass'
) {
  const top = 88
  if (wall === 'left') {
    g.carve(-2, 0, s, -1, top, e - 1)
    g.fill(-4, -1, s, -1, -1, e - 1, PAL.honeyDark) // threshold
    g.fill(-3, 0, s + 1, -3, top - 1, e - 2, color) // slab
    if (kind === 'glass') {
      // one big pane: carve everything but a frame + kick panel
      g.carve(-4, 10, s + 4, -3, top - 3, e - 5)
    } else {
      for (const [pz0, pz1] of [[s + 6, s + 12], [e - 13, e - 7]] as const) {
        if (pz1 > pz0 + 2) {
          g.carve(-3, 12, pz0, -3, 44, pz1)
          g.fill(-4, 12, pz0, -4, 44, pz1, PAL.mint)
        }
      }
      const m = Math.round((s + e) / 2)
      for (let z = m - 12; z <= m + 12; z++)
        for (let y = 56; y <= 80; y++) {
          const dd = Math.hypot(z - m, y - 68)
          if (dd < 10) {
            g.carve(-4, y, z, -3, y, z) // see straight through
          } else if (dd <= 12.5) g.set(-3, y, z, PAL.trim)
        }
    }
    g.fill(-2, 42, e - 7, -1, 46, e - 4, PAL.butter) // knob
    g.fill(-1, 0, s - 4, 0, top + 2, s - 1, PAL.trim) // architrave
    g.fill(-1, 0, e, 0, top + 2, e + 3, PAL.trim)
    g.fill(-1, top, s - 4, 0, top + 3, e + 3, PAL.trim)
  } else {
    g.carve(s, 0, -2, e - 1, top, -1)
    g.fill(s, -1, -4, e - 1, -1, -1, PAL.honeyDark)
    g.fill(s + 1, 0, -3, e - 2, top - 1, -3, color)
    if (kind === 'glass') {
      g.carve(s + 4, 10, -4, e - 5, top - 3, -3)
    } else {
      for (const [px0, px1] of [[s + 6, s + 12], [e - 13, e - 7]] as const) {
        if (px1 > px0 + 2) {
          g.carve(px0, 12, -3, px1, 44, -3)
          g.fill(px0, 12, -4, px1, 44, -4, PAL.mint)
        }
      }
      const m = Math.round((s + e) / 2)
      for (let x = m - 12; x <= m + 12; x++)
        for (let y = 56; y <= 80; y++) {
          const dd = Math.hypot(x - m, y - 68)
          if (dd < 10) {
            g.carve(x, y, -4, x, y, -3) // see straight through
          } else if (dd <= 12.5) g.set(x, y, -3, PAL.trim)
        }
    }
    g.fill(e - 7, 42, -2, e - 4, 46, -1, PAL.butter)
    g.fill(s - 4, 0, -1, s - 1, top + 2, 0, PAL.trim)
    g.fill(e, 0, -1, e + 3, top + 2, 0, PAL.trim)
    g.fill(s - 4, top, -1, e + 3, top + 3, 0, PAL.trim)
  }
}

/** Door slab colors for the room editor. */
export const DOOR_COLORS: { id: string; css: string }[] = [
  { id: '#3E7C5B', css: '#3E7C5B' },
  { id: '#7CC9AC', css: '#7CC9AC' },
  { id: '#F6D9E3', css: '#F6D9E3' },
  { id: '#FDFCF6', css: '#FDFCF6' },
  { id: '#7383BC', css: '#7383BC' },
  { id: '#D98D63', css: '#D98D63' },
  { id: '#8A5F3F', css: '#8A5F3F' },
  { id: '#5C5C68', css: '#5C5C68' },
]
