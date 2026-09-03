// Catalog v1: every placeable item, with footprint/seat/surface metadata and a
// builder that constructs it at the local origin facing +z. Built in the style
// bible's language: voxel bodies, smooth round shapes, hollow vessels, flat-face
// shine only, outlines automatic.
import * as THREE from 'three'
import { VoxelGrid } from './voxel'
import { PAL, VOX, puck, cone, outlined, smoothMat, shadeMat, toonRamp } from './build'
import type { CatalogItem } from './types'

export interface BuiltItem {
  group: THREE.Group
  update?: (dt: number, t: number) => void
  /** For floor lamps: the warm light the lighting rig drives. */
  lampLight?: THREE.PointLight
  /** For fairy-light items: bulb materials the lighting rig twinkles. */
  fairyMats?: THREE.MeshBasicMaterial[]
}

type Builder = (variant: string) => BuiltItem

interface Entry extends CatalogItem {
  build: Builder
  /** Rugs: no collision, items can overlap them. */
  noCollide?: boolean
}

// The cozy palette: warm pastels → cool pastels → neutrals → deep accents.
// Each entry is [base, deep]; deeps are the same hue pulled darker so any
// pairing across the set stays harmonious.
export const SEAT_COLORS: Record<string, [string, string]> = {
  pink: [PAL.pink, PAL.pinkDeep],
  peach: ['#FFC49E', '#F09B6C'],
  butter: [PAL.butter, '#EEC06A'],
  mint: [PAL.mint, PAL.mintDeep],
  sage: ['#B9CCA4', '#94AC7E'],
  sky: ['#A9CBE8', '#7FA9CE'],
  lavender: [PAL.lavender, PAL.lavenderDeep],
  periwinkle: ['#AEB8EC', '#8794D6'],
  cream: ['#F2E6CF', '#DCC69E'],
  cocoa: ['#B08661', '#8F6844'],
  terracotta: ['#D98D63', '#B96F4A'],
  moss: ['#7E9A6C', '#617E52'],
  berry: ['#C97795', '#A85374'],
  graphite: ['#7A7A85', '#5C5C68'],
}
export const VARIANTS = Object.keys(SEAT_COLORS)

// Wood tones for tables / counters / shelves: [light, dark]
export const WOODS: Record<string, [string, string]> = {
  honey: [PAL.honey, PAL.honeyDark],
  walnut: ['#8A5F3F', '#6E4A2F'],
  pale: ['#E4C692', '#C6A671'],
  white: ['#F2EBDE', '#D6C9B2'],
}
export const WOOD_VARIANTS = Object.keys(WOODS)

// Lamp shade colors ('butter' keeps the classic mustard glow)
export const SHADE_VARIANTS = ['butter', 'pink', 'mint', 'sky', 'lavender', 'cream']
const shadeHex = (v: string) => (v === 'butter' ? PAL.mustard : (SEAT_COLORS[v] ?? SEAT_COLORS.cream)[0])

/** Swatch color for any variant id, whatever family it belongs to. */
export function variantColor(v: string): string {
  return SEAT_COLORS[v]?.[0] ?? WOODS[v]?.[0] ?? shadeHex(v)
}

function lighten(hex: string, amt: number): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#FFFFFF'), amt)
  return `#${c.getHexString().toUpperCase()}`
}

function vox(g: VoxelGrid, opts: { jitter?: number; outline?: boolean } = {}): THREE.Mesh {
  const mesh = g.build({ jitter: opts.jitter })
  mesh.scale.setScalar(VOX)
  if (opts.outline !== false) outlined(mesh)
  return mesh
}

/** Gentle steam wisps rising from a point (voxel coords), for hot things. */
function makeSteam(px: number, py: number, pz: number, scale = 1) {
  const group = new THREE.Group()
  const mats: THREE.MeshBasicMaterial[] = []
  const puffs: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false })
    const puff = new THREE.Mesh(new THREE.CircleGeometry(0.042 * scale, 10), m)
    puff.rotation.y = Math.PI / 4 // face the iso camera
    group.add(puff)
    mats.push(m)
    puffs.push(puff)
  }
  group.position.set(px * VOX, py * VOX, pz * VOX)
  const update = (_: number, t: number) => {
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.38 + i / 3) % 1
      puffs[i].position.set(Math.sin((k * 4 + i * 2) * 1.8) * 0.03, k * 0.46 * scale, 0)
      puffs[i].scale.setScalar(0.6 + k)
      mats[i].opacity = Math.sin(k * Math.PI) * 0.34
    }
  }
  return { group, update }
}

// ---------- builders ----------

function stool(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.pink
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (const [lx, lz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]] as const)
    g.fill(lx, 0, lz, lx + 1, 23, lz + 1, PAL.honeyDark)
  group.add(vox(g))
  group.add(puck(0.5, 0.5, 24, 2, 10.5, deep))
  group.add(puck(0.5, 0.5, 26, 2.4, 10, top))
  return { group }
}

function chair(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.mint
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (const [lx, lz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]] as const)
    g.fill(lx, 0, lz, lx + 1, 24, lz + 1, PAL.honeyDark)
  // solid rounded back with a little heart cutout — chair-scaled, not throne-scaled
  g.roundedBox(-7, 26, -10, 7, 41, -8, top)
  g.fill(-7, 26, -10, 7, 27, -8, deep)
  const heart: [number, number][] = [
    [36, -2], [36, 2],
    [35, -3], [35, -2], [35, -1], [35, 0], [35, 1], [35, 2], [35, 3],
    [34, -2], [34, -1], [34, 0], [34, 1], [34, 2],
    [33, -1], [33, 0], [33, 1],
    [32, 0],
  ]
  for (const [hy, hx] of heart) g.carve(hx, hy, -10, hx, hy, -8)
  group.add(vox(g))
  group.add(puck(0.5, 0.5, 24, 1.6, 12, top))
  group.add(puck(0.5, 0.5, 25.6, 2, 11.5, deep))
  return { group }
}

function tableRound(r: number): Builder {
  return (variant) => {
    const [light, dark] = WOODS[variant] ?? WOODS.honey
    const group = new THREE.Group()
    const g = new VoxelGrid()
    g.fill(-16, 0, -3, 16, 2, 3, dark)
    g.fill(-3, 0, -16, 3, 2, 16, dark)
    group.add(vox(g))
    group.add(puck(0, 0, 2, 32, 4.4, dark))
    group.add(puck(0, 0, 34, 1.4, r - 1, dark))
    group.add(puck(0, 0, 35, 3, r, light))
    return { group }
  }
}

function sideTable(variant: string): BuiltItem {
  const [light, dark] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  group.add(puck(0, 0, 0, 1.2, 5, dark))
  group.add(puck(0, 0, 1, 25, 2, dark))
  group.add(puck(0, 0, 25, 1.2, 9, dark))
  group.add(puck(0, 0, 26, 1.6, 9.4, light))
  return { group }
}

/** Flat square table — flush edges, so a row of them reads as one long table. */
function tableSquare(variant: string): BuiltItem {
  const [light, dark] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (const [lx, lz] of [[-14, -14], [12, -14], [-14, 12], [12, 12]] as const)
    g.fill(lx, 0, lz, lx + 2, 33, lz + 2, dark)
  g.fill(-15, 34, -15, 14, 35, 14, dark)
  g.fill(-16, 35, -16, 15, 38, 15, light) // full-bleed top: neighbors join seamlessly
  group.add(vox(g))
  return { group }
}

function armchair(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.mint
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-24, 2, -20, 24, 16, 20, top) // base
  g.roundedBox(-20, 16, -16, 20, 22, 16, deep) // cushion
  g.roundedBox(-24, 16, -28, 24, 44, -18, top) // backrest (-z)
  g.fill(-22, 44, -26, 22, 46, -20, deep)
  g.roundedBox(-32, 16, -22, -24, 30, 20, top) // armrests
  g.roundedBox(24, 16, -22, 32, 30, 20, top)
  group.add(vox(g))
  // throw pillow: leaning on the seat cushion against the backrest, diamond-tilted
  const p = new VoxelGrid()
  p.roundedBox(-6, 0, -2, 6, 12, 2, PAL.pinkMilk)
  p.set(0, 6, 2, PAL.pinkDeep) // little heart button
  const pm = vox(p)
  pm.position.set(9 * VOX, 22 * VOX, -13 * VOX)
  pm.rotation.set(-0.22, -0.12, 0.08)
  group.add(pm)
  return { group }
}

function loveseat(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.pink
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-40, 2, -20, 40, 16, 20, top)
  g.roundedBox(-37, 16, -16, -2, 22, 16, deep)
  g.roundedBox(2, 16, -16, 37, 22, 16, deep)
  g.roundedBox(-40, 16, -28, 40, 42, -18, top)
  g.fill(-38, 42, -26, 38, 44, -20, deep)
  g.roundedBox(-48, 16, -22, -40, 30, 20, top)
  g.roundedBox(40, 16, -22, 48, 30, 20, top)
  group.add(vox(g))
  return { group }
}

function rugRound(variant: string): BuiltItem {
  const [ring] = SEAT_COLORS[variant] ?? SEAT_COLORS.pink
  const group = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CircleGeometry(2.1, 48), smoothMat(PAL.cream))
  base.rotation.x = -Math.PI / 2
  base.position.y = 0.022
  base.receiveShadow = true
  const rim = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.1, 48), smoothMat(ring))
  rim.rotation.x = -Math.PI / 2
  rim.position.y = 0.028
  rim.receiveShadow = true
  group.add(base, rim)
  return { group }
}

function rugRunner(variant: string): BuiltItem {
  const [a, edgeC] = SEAT_COLORS[variant] ?? SEAT_COLORS.mint
  const b = lighten(a, 0.35)
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (let x = -14; x <= 14; x++)
    for (let z = -38; z <= 38; z++) {
      const edge = x <= -13 || x >= 13 || z <= -37 || z >= 37
      g.set(x, 0, z, edge ? edgeC : (x + z) % 2 === 0 ? a : b)
    }
  group.add(vox(g, { jitter: 0, outline: false }))
  return { group }
}

function bookshelf(variant: string): BuiltItem {
  const [wood] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  const spines = [PAL.pinkDeep, PAL.mintDeep, PAL.butter, PAL.lavenderDeep, PAL.denim, PAL.terracotta, PAL.leafB, PAL.pink, PAL.chromeDark]
  g.fill(-32, 0, -8, 31, 3, 7, wood)
  g.fill(-32, 0, -8, -29, 85, 7, wood)
  g.fill(29, 0, -8, 31, 85, 7, wood)
  g.fill(-32, 82, -8, 31, 85, 7, wood)
  g.fill(-28, 26, -8, 28, 29, 7, wood)
  g.fill(-28, 52, -8, 28, 55, 7, wood)
  const rows = [4, 30, 56]
  rows.forEach((sy, row) => {
    let x = -26
    let i = row * 3
    while (x < 24) {
      const w = 2 + ((x + 100 + row) % 3)
      const h = 15 + (((x + 100) * 3 + row * 5) % 6)
      g.fill(x, sy, -5, x + w, sy + h, 5, spines[i % spines.length])
      x += w + 2
      i++
    }
  })
  group.add(vox(g))
  return { group }
}

function floorLamp(variant: string): BuiltItem {
  const group = new THREE.Group()
  group.add(puck(0, 0, 0, 1.4, 8, PAL.honeyDark))
  const g = new VoxelGrid()
  g.fill(-1, 1, -1, 0, 57, 0, PAL.honeyDark)
  group.add(vox(g))
  group.add(cone(0, 0, 58, 16, 12, 5, shadeMat(shadeHex(variant || 'butter'))))
  group.add(puck(0, 0, 56.6, 1.4, 7.6, PAL.butter))
  // soft wide pool, not a hot disc on the nearest wall — and low enough
  // that a mid-room lamp clearly lights the floor around itself
  const lampLight = new THREE.PointLight('#FFC276', 1.2, 18, 1.4)
  lampLight.position.set(0, 38 * VOX, 0)
  group.add(lampLight)
  return { group, lampLight }
}

function monstera(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 13, 9, PAL.terracotta)
  g.cylinder(0, 0, 13, 15, 10, PAL.terracotta)
  g.cylinder(0, 0, 15, 16, 7.6, PAL.soil)
  g.fill(0, 17, 0, 0, 36, 0, PAL.leafB)
  g.fill(-7, 17, -4, -7, 29, -4, PAL.leafB)
  g.ellipsoid(-11, 36, -7, 8, 4, 6, PAL.leafA)
  g.ellipsoid(8, 40, 4, 7, 4, 6, PAL.leafB)
  g.ellipsoid(-4, 44, 7, 7, 3.4, 5.4, PAL.leafA)
  g.ellipsoid(7, 48, -5, 6.4, 3.2, 5, PAL.leafB)
  g.ellipsoid(-5, 52, -2, 5.4, 3, 4.4, PAL.leafA)
  group.add(vox(g))
  return { group }
}

function catCushion(): BuiltItem {
  const group = new THREE.Group()
  group.add(puck(0, 0, 0, 2.4, 15, PAL.lavender))
  const ring = new THREE.Mesh(new THREE.RingGeometry(12.4 * VOX, 15 * VOX, 48), smoothMat(PAL.lavenderDeep))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 2.4 * VOX + 0.004
  group.add(outlined(ring))
  // the café cat, sitting in the middle
  const body = new THREE.Group()
  const cb = new VoxelGrid()
  cb.roundedBox(-5, 0, -4, 4, 7, 3, PAL.catBody)
  cb.fill(-4, 0, 3, -3, 1, 4, PAL.catBody)
  cb.fill(2, 0, 3, 3, 1, 4, PAL.catBody)
  cb.fill(-2, 0, 3, 1, 3, 3, '#FFF9EA')
  cb.fill(4, 2, -3, 4, 4, -2, PAL.catPatch)
  cb.fill(4, 3, 0, 4, 5, 1, PAL.catPatch)
  cb.roundedBox(-6, 8, -5, 5, 16, 4, PAL.catBody)
  cb.roundedBox(-5, 17, -4, 4, 17, 3, PAL.catBody)
  cb.fill(-2, 9, 4, 1, 11, 4, '#FFF9EA')
  cb.fill(-5, 18, -3, -3, 18, -1, PAL.catPatch)
  cb.set(-4, 19, -2, PAL.catPatch)
  cb.fill(2, 18, -3, 4, 18, -1, PAL.catBody)
  cb.set(3, 19, -2, PAL.catBody)
  cb.set(-4, 18, -1, PAL.pink)
  cb.set(3, 18, -1, PAL.pink)
  cb.fill(-6, 10, -5, -4, 13, -2, PAL.catPatch)
  body.add(vox(cb))
  const eyeMat = new THREE.MeshBasicMaterial({ color: PAL.dark })
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.04), eyeMat)
  const eyeR = eyeL.clone()
  eyeL.position.set(-0.18, 0.76, 0.31)
  eyeR.position.set(0.12, 0.76, 0.31)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: PAL.pinkDeep }))
  nose.position.set(-0.03, 0.65, 0.31)
  body.add(eyeL, eyeR, nose)
  body.position.y = 2.4 * VOX
  group.add(outlined(body))
  const tail = new THREE.Group()
  const tv = new VoxelGrid()
  tv.fill(0, 0, 0, 1, 1, 4, PAL.catPatch)
  tv.fill(0, 1, 4, 1, 5, 5, PAL.catPatch)
  tv.fill(0, 5, 4, 1, 6, 5, PAL.catBody)
  const tm = vox(tv)
  tail.add(tm)
  tail.position.set(0.26, 2.4 * VOX, -0.5)
  group.add(outlined(tail))
  const update = (_: number, t: number) => {
    body.scale.y = 1 + Math.sin(t * 1.5) * 0.03
    tail.rotation.y = Math.sin(t * 0.8) * 0.16
  }
  return { group, update }
}

function counterBody(halfW: number, variant: string): BuiltItem {
  const [light, dark] = WOODS[variant] ?? WOODS.honey
  const face = lighten(light, 0.55)
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-halfW, 0, -10, halfW - 1, 37, 9, face)
  for (let x = -halfW + 8; x <= halfW - 8; x += 8) g.fill(x, 4, 9, x, 34, 9, dark)
  g.fill(-halfW, 0, -10, halfW - 1, 2, 9, dark)
  g.fill(-halfW, 38, -12, halfW - 1, 43, 13, PAL.marble)
  group.add(vox(g))
  return { group }
}

const counter: Builder = (variant) => counterBody(16, variant)
const counterLong: Builder = (variant) => counterBody(32, variant)

function espresso(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-12, 0, -8, 12, 20, 8, PAL.cream)
  g.fill(-12, 0, -8, 12, 3, 8, PAL.chrome)
  g.fill(-12, 18, -8, 12, 20, 8, PAL.chrome)
  g.set(10, 19, 6, '#FFFFFF') // flat-face shine
  g.set(9, 19, 7, '#FFFFFF')
  g.fill(-6, 6, 8, -2, 10, 10, PAL.chromeDark) // group head
  g.fill(-5, 7, 11, -3, 8, 15, PAL.honey) // portafilter
  g.fill(-8, 0, 9, 0, 0, 14, PAL.chromeDark) // drip tray
  g.fill(6, 10, 8, 8, 13, 8, PAL.chromeDark) // gauge bezel
  g.fill(7, 11, 8, 7, 12, 8, PAL.pinkDeep)
  const cup = new VoxelGrid()
  cup.cylinder(6, -2, 21, 26, 4, PAL.pink)
  cup.carveCylinder(6, -2, 24, 26, 2.4)
  group.add(vox(g), vox(cup))
  const steam = makeSteam(6, 26, -2, 0.8)
  group.add(steam.group)
  return { group, update: steam.update }
}

function cakeStand(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.disc(0, 0, 0, 10, PAL.trim)
  g.cylinder(0, 0, 1, 8, 1.6, PAL.trim)
  g.disc(0, 0, 9, 7, PAL.trim)
  g.cylinder(-4, -4, 1, 5, 3, PAL.butter)
  g.cylinder(5, 4, 1, 5, 3, PAL.mint)
  g.cylinder(0, 0, 10, 14, 4.4, PAL.cream)
  g.cylinder(0, 0, 15, 16, 4.4, PAL.pink)
  g.set(0, 17, 0, PAL.pinkDeep)
  group.add(vox(g))
  return { group }
}

function register(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-8, 0, -8, 8, 8, 8, PAL.chromeDark)
  g.fill(-6, 8, -8, 6, 14, -6, PAL.dark)
  g.set(5, 13, -6, '#FFFFFF')
  for (const kx of [-4, 0, 4]) {
    g.set(kx, 8, 0, PAL.cream)
    g.set(kx, 8, 3, PAL.cream)
  }
  g.fill(-6, 9, 5, -4, 12, 6, '#FFFDF4') // receipt
  g.fill(-8, 2, 8, 8, 2, 8, '#999DAB') // drawer groove (front face)
  group.add(vox(g))
  return { group }
}

function mug(variant: string): BuiltItem {
  const [c] = SEAT_COLORS[variant] ?? SEAT_COLORS.butter
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 9, 4, c)
  g.carveCylinder(0, 0, 5, 9, 2.4)
  g.disc(0, 0, 5, 2.4, '#A8734A')
  g.fill(4, 2, -1, 5, 6, 1, c)
  group.add(vox(g))
  const steam = makeSteam(0, 9, 0, 0.75)
  group.add(steam.group)
  return { group, update: steam.update }
}

function openBook(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-10, 0, -7, 10, 0, 7, '#C9895E')
  g.fill(-9, 1, -6, -1, 1, 6, PAL.cream)
  g.fill(0, 1, -6, 9, 1, 6, '#FFFDF4')
  g.fill(-1, 1, -6, 0, 1, 6, PAL.honeyDark)
  g.fill(2, 1, -3, 6, 1, -3, PAL.lavenderDeep)
  g.fill(1, 1, 1, 7, 1, 1, PAL.lavenderDeep)
  g.fill(3, 0, 7, 5, 0, 9, PAL.pinkDeep)
  group.add(vox(g))
  return { group }
}

function laptopClosed(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-11, 0, -7, 11, 2, 7, PAL.lavenderDeep)
  g.fill(-2, 2, -1, 1, 2, 2, PAL.cream)
  g.set(9, 2, -5, '#FFFFFF')
  group.add(vox(g))
  return { group }
}

function plantS(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 5, 3, PAL.terracotta)
  g.disc(0, 0, 5, 3.4, PAL.terracotta)
  g.disc(0, 0, 5, 2.2, PAL.soil)
  g.fill(0, 6, 0, 0, 7, 0, PAL.leafB)
  g.set(-1, 7, 0, PAL.leafA)
  g.set(1, 7, 0, PAL.leafA)
  group.add(vox(g))
  return { group }
}

// ---------- expansion set (seating / tables / café gear / decor / things) ----------

function bench(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.cocoa
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (const [lx, lz] of [[-28, -10], [26, -10], [-28, 8], [26, 8]] as const)
    g.fill(lx, 0, lz, lx + 2, 22, lz + 1, PAL.honeyDark)
  g.fill(-30, 22, -11, 29, 24, 10, PAL.honeyDark)
  g.roundedBox(-30, 24, -11, 29, 28, 10, top)
  g.fill(-30, 24, 10, 29, 25, 10, deep)
  group.add(vox(g))
  return { group }
}

function floorCushion(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.butter
  const group = new THREE.Group()
  group.add(puck(0, 0, 0, 6, 11.5, deep))
  group.add(puck(0, 0, 6, 5, 10.6, top))
  group.add(puck(0, 0, 10.6, 1, 1.6, deep)) // tuft button
  return { group }
}

function beanBag(variant: string): BuiltItem {
  const [top, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.sage
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.ellipsoid(0, 6, 0, 16, 9, 15, deep)
  g.ellipsoid(0, 13, -3, 12, 7, 11, top)
  g.carve(-17, -10, -16, 17, -1, 16)
  group.add(vox(g))
  return { group }
}

function tableLong(variant: string): BuiltItem {
  const [light, dark] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (const [lx, lz] of [[-42, -19], [40, -19], [-42, 17], [40, 17]] as const)
    g.fill(lx, 0, lz, lx + 2, 33, lz + 2, dark)
  g.fill(-44, 34, -22, 43, 35, 21, dark)
  g.fill(-46, 35, -23, 45, 38, 22, light)
  group.add(vox(g))
  return { group }
}

function coffeeTable(variant: string): BuiltItem {
  const [light, dark] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (const [lx, lz] of [[-26, -14], [24, -14], [-26, 12], [24, 12]] as const)
    g.fill(lx, 0, lz, lx + 2, 20, lz + 2, dark)
  g.fill(-27, 20, -15, 26, 21, 14, dark)
  g.roundedBox(-28, 21, -16, 27, 24, 15, light)
  group.add(vox(g))
  return { group }
}

function desk(variant: string): BuiltItem {
  const [light, dark] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(10, 0, -14, 30, 34, 13, light) // drawer pedestal
  g.fill(12, 7, 13, 28, 12, 13, dark)
  g.fill(12, 16, 13, 28, 21, 13, dark)
  g.fill(12, 25, 13, 28, 30, 13, dark)
  for (const dy of [9, 18, 27]) g.fill(19, dy, 13, 21, dy + 1, 13, PAL.cream) // knobs
  g.fill(-30, 0, -14, -28, 34, -12, dark) // left legs
  g.fill(-30, 0, 11, -28, 34, 13, dark)
  g.fill(-32, 35, -16, 31, 38, 15, light)
  group.add(vox(g))
  return { group }
}

function pastryCase(): BuiltItem {
  // the big bakery display: marble deck + shelf, glass front and top, full of goods
  const group = new THREE.Group()
  const g = new VoxelGrid()
  const HW = 26
  g.fill(-HW, 0, -13, HW - 1, 10, 12, PAL.counterFace) // base cabinet
  g.fill(-HW, 0, -13, HW - 1, 2, 12, PAL.honeyDark)
  g.fill(-HW, 10, -13, HW - 1, 12, 12, PAL.marble) // deck
  g.fill(-HW + 3, 27, -11, HW - 4, 28, 11, PAL.marble) // middle shelf
  g.fill(-HW, 44, -13, HW - 1, 47, 12, PAL.cream) // top
  g.fill(-HW, 12, -13, -HW + 2, 44, 12, PAL.cream) // end panels
  g.fill(HW - 3, 12, -13, HW - 1, 44, 12, PAL.cream)
  g.fill(-HW + 3, 12, -13, HW - 4, 44, -12, PAL.trim) // back panel
  // deck goods: bread
  g.ellipsoid(-17, 16, 2, 6, 4, 4.4, '#D9A55F') // boule
  g.set(-17, 20, 2, '#C08540')
  g.ellipsoid(-6, 15, -4, 5, 3.2, 3.6, '#C98F4B') // loaf
  g.fill(2, 13, 3, 16, 16, 6, '#E0B26B') // loaf pan bread
  g.fill(4, 16, 3, 6, 16, 6, '#C98F4B') // crust score
  g.fill(10, 16, 3, 12, 16, 6, '#C98F4B')
  g.ellipsoid(11, 14, -5, 6, 2.6, 3, '#E8C078') // croissant-ish crescent
  g.ellipsoid(19, 14, 1, 4, 2.6, 3, '#E8C078')
  group.add(vox(g))
  // shelf goods: cakes
  group.add(puck(-15, 0, 29, 6, 5.5, PAL.pink))
  group.add(puck(-15, 0, 35, 1.4, 3, PAL.pinkMilk))
  group.add(puck(-3, 2, 29, 5, 4.6, PAL.butter))
  group.add(puck(8, -2, 29, 6, 5, PAL.mint))
  group.add(puck(18, 2, 29, 4, 4, PAL.lavender))
  // glass: front pane + top strip
  const glassMat = new THREE.MeshLambertMaterial({ color: '#DDEBF5', transparent: true, opacity: 0.22, depthWrite: false })
  const front = new THREE.Mesh(new THREE.BoxGeometry(45 * VOX, 32 * VOX, 0.02), glassMat)
  front.position.set(-0.5 * VOX, 28 * VOX, 12.4 * VOX)
  const topGlass = new THREE.Mesh(new THREE.BoxGeometry(45 * VOX, 0.02, 10 * VOX), glassMat)
  topGlass.position.set(-0.5 * VOX, 43.8 * VOX, 7 * VOX)
  group.add(front, topGlass)
  return { group }
}

function menuBoard(): BuiltItem {
  // easel: side posts in the board's own plane, little splayed feet
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-12, 0, -1, -10, 33, 1, PAL.honeyDark) // posts
  g.fill(10, 0, -1, 12, 33, 1, PAL.honeyDark)
  g.fill(-12, 0, -4, -10, 1, 4, PAL.honeyDark) // feet
  g.fill(10, 0, -4, 12, 1, 4, PAL.honeyDark)
  g.fill(-10, 8, -1, 9, 32, 1, PAL.board) // board between the posts
  g.fill(-12, 33, -1, 12, 35, 1, PAL.honey) // cap rail
  // chalk menu on the front face
  g.fill(-7, 27, 1, 0, 28, 1, PAL.cream)
  g.fill(-7, 23, 1, 6, 23, 1, '#F8DFE6')
  g.fill(-7, 20, 1, 4, 20, 1, PAL.cream)
  g.fill(-7, 17, 1, 7, 17, 1, PAL.mint)
  g.fill(-7, 14, 1, 2, 14, 1, PAL.cream)
  group.add(vox(g))
  return { group }
}

function jukebox(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-16, 0, -10, 15, 44, 9, '#8F4A6B')
  g.fill(-16, 0, -10, 15, 3, 9, PAL.dark)
  g.fill(-12, 6, 9, 11, 37, 9, PAL.cream)
  g.fill(-8, 10, 9, 7, 21, 9, PAL.dark) // record window
  g.fill(-4, 13, 9, 3, 18, 9, '#5C4668')
  g.set(-6, 19, 9, '#FFFFFF')
  group.add(vox(g))
  // glowing arch bands that pulse in sequence
  const baseColors = [new THREE.Color(PAL.butter), new THREE.Color(PAL.pink), new THREE.Color(PAL.mint)]
  const white = new THREE.Color('#FFFFFF')
  const mats: THREE.MeshBasicMaterial[] = []
  ;[35, 30.5, 26].forEach((y, i) => {
    const m = new THREE.MeshBasicMaterial({ color: baseColors[i] })
    const band = new THREE.Mesh(new THREE.BoxGeometry(24 * VOX, 4 * VOX, VOX), m)
    band.position.set(-0.5 * VOX, y * VOX, 10.2 * VOX)
    group.add(outlined(band))
    mats.push(m)
  })
  const update = (_: number, t: number) => {
    mats.forEach((m, i) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 - i * 1.6)
      m.color.copy(baseColors[i]).lerp(white, pulse * 0.5)
    })
  }
  return { group, update }
}

function piano(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-34, 0, -14, 33, 52, 5, '#4A3630')
  g.fill(-34, 26, 5, 33, 32, 14, '#4A3630')
  g.fill(-32, 32, 5, 31, 33, 13, PAL.cream)
  for (let x = -30; x <= 28; x += 5) g.fill(x, 33, 5, x + 1, 33, 9, PAL.dark)
  g.fill(-34, 0, 5, -30, 26, 14, '#4A3630')
  g.fill(29, 0, 5, 33, 26, 14, '#4A3630')
  g.fill(-30, 38, 4, 29, 46, 5, '#5C443C') // music panel
  g.fill(-6, 0, 5, -4, 3, 9, PAL.butter) // pedals
  g.fill(2, 0, 5, 4, 3, 9, PAL.butter)
  group.add(vox(g))
  return { group }
}

// ---------- the audio corner ----------

function speakerS(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-4, 0, -3, 4, 13, 3, PAL.dark)
  g.fill(-3, 1, 3, 3, 12, 3, '#4E4E58') // fabric front
  for (let y = 2; y <= 6; y++)
    for (let x = -2; x <= 2; x++)
      if (Math.hypot(x, y - 4) <= 2.2) g.set(x, y, 3, y === 4 && x === 0 ? '#8A8A96' : '#2C2C34') // woofer
  g.set(0, 10, 3, '#8A8A96') // tweeter
  g.set(3, 12, 3, PAL.mintDeep) // power dot
  group.add(vox(g))
  return { group }
}

function speakerL(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-7, 0, -6, 7, 42, 5, PAL.dark)
  g.fill(-6, 2, 5, 6, 40, 5, '#4E4E58')
  for (const cy of [10, 28]) {
    for (let y = cy - 4; y <= cy + 4; y++)
      for (let x = -4; x <= 4; x++)
        if (Math.hypot(x, y - cy) <= 4.2) g.set(x, y, 5, y === cy && x === 0 ? '#8A8A96' : '#2C2C34')
  }
  g.set(5, 38, 5, PAL.pinkDeep) // power dot
  group.add(vox(g))
  return { group }
}

function vinylCrate(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  // open wooden crate
  g.fill(-9, 0, -8, 9, 1, 8, PAL.honeyDark)
  g.fill(-9, 0, -8, -8, 12, 8, PAL.honey)
  g.fill(8, 0, -8, 9, 12, 8, PAL.honey)
  g.fill(-9, 0, -8, 9, 12, -7, PAL.honey)
  g.fill(-9, 0, 7, 9, 12, 8, PAL.honey)
  g.fill(-9, 5, 7, 9, 7, 8, PAL.honeyDark) // slat line
  // records leaning inside
  const sleeves = [PAL.pinkDeep, PAL.denim, PAL.mintDeep, PAL.mustard, PAL.lavenderDeep, '#8F4A6B']
  sleeves.forEach((c, i) => {
    const z = -6 + i * 2.2
    g.fill(-7, 2, Math.round(z), 7, 15 - (i % 3), Math.round(z), c)
  })
  group.add(vox(g))
  return { group }
}

function guitar(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  // stand legs
  g.fill(-6, 0, -4, -5, 1, 4, PAL.honeyDark)
  g.fill(5, 0, -4, 6, 1, 4, PAL.honeyDark)
  g.fill(-6, 0, -1, 6, 2, 0, PAL.honeyDark)
  // acoustic body: two bouts drawn as vertical circles in the x/y plane
  const body = (cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = -r; x <= r; x++)
        if (Math.hypot(x, y - cy) <= r) g.fill(x, y, 0, x, y, 2, '#C98F4B')
  }
  body(9, 8)
  body(17, 6)
  for (let y = 11; y <= 15; y++)
    for (let x = -2; x <= 2; x++)
      if (Math.hypot(x, y - 13) <= 2.2) g.fill(x, y, 2, x, y, 2, PAL.dark) // soundhole
  g.fill(-3, 8, 2, 3, 8, 2, '#8A5A32') // bridge
  g.fill(-1, 17, 1, 0, 34, 2, '#8A5A32') // neck
  g.fill(-2, 34, 1, 1, 39, 2, PAL.dark) // headstock
  g.set(-2, 36, 2, PAL.cream)
  g.set(1, 37, 2, PAL.cream)
  group.add(vox(g))
  return { group }
}

function tableLamp(variant: string): BuiltItem {
  const group = new THREE.Group()
  group.add(puck(0, 0, 0, 1.4, 5, PAL.honeyDark))
  const g = new VoxelGrid()
  g.fill(-1, 1, -1, 0, 14, 0, PAL.honeyDark)
  group.add(vox(g))
  group.add(cone(0, 0, 15, 10, 8, 3.6, shadeMat(shadeHex(variant || 'butter'))))
  group.add(puck(0, 0, 14.2, 1, 5, PAL.butter))
  const lampLight = new THREE.PointLight('#FFC276', 1.2, 11, 1.4)
  lampLight.position.set(0, 20 * VOX, 0)
  group.add(lampLight)
  return { group, lampLight }
}

function candle(variant: string): BuiltItem {
  const [c] = SEAT_COLORS[variant] ?? SEAT_COLORS.cream
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.disc(0, 0, 0, 4, PAL.chrome)
  g.cylinder(0, 0, 1, 8, 2.4, c)
  group.add(vox(g))
  // a real flickering flame
  const flameMat = new THREE.MeshBasicMaterial({ color: '#FFC24D' })
  const flame = new THREE.Mesh(new THREE.BoxGeometry(VOX, 2.2 * VOX, VOX), flameMat)
  flame.position.set(0, 9.6 * VOX, 0)
  group.add(flame)
  const warm = new THREE.Color('#FFC24D')
  const hot = new THREE.Color('#FFE49A')
  const update = (_: number, t: number) => {
    flame.scale.y = 1 + Math.sin(t * 9.2) * 0.22 + Math.sin(t * 23.7) * 0.1
    const s = 1 + Math.sin(t * 16.3) * 0.14
    flame.scale.x = s
    flame.scale.z = s
    flameMat.color.copy(warm).lerp(hot, 0.5 + 0.5 * Math.sin(t * 12.1))
  }
  return { group, update }
}

function fiddleTree(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 14, 10, PAL.cream)
  g.cylinder(0, 0, 14, 16, 8.4, PAL.cream)
  g.cylinder(0, 0, 16, 17, 6.8, PAL.soil)
  g.fill(0, 17, 0, 0, 52, 0, PAL.soil)
  g.fill(-5, 30, 2, -5, 36, 2, PAL.soil)
  g.ellipsoid(0, 58, 0, 10, 8, 9, PAL.leafB)
  g.ellipsoid(-8, 48, 3, 7, 6, 6, PAL.leafA)
  g.ellipsoid(7, 50, -3, 7, 5, 6, PAL.leafA)
  g.ellipsoid(-5, 39, 2, 6, 5, 5, PAL.leafB)
  group.add(vox(g))
  return { group }
}

function cactus(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 10, 7, PAL.terracotta)
  g.disc(0, 0, 10, 5.4, PAL.soil)
  g.cylinder(0, 0, 11, 40, 4, PAL.leafB)
  g.fill(-9, 22, -1, -5, 25, 1, PAL.leafB)
  g.fill(-9, 25, -1, -6, 33, 1, PAL.leafB)
  g.set(0, 41, 0, PAL.pink) // little flower on the flat top
  group.add(vox(g))
  return { group }
}

function bonsai(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-8, 0, -5, 8, 3, 5, PAL.terracotta)
  g.fill(-7, 3, -4, 7, 4, 4, PAL.soil)
  g.fill(-1, 5, 0, 0, 10, 0, PAL.soil)
  g.fill(2, 9, 1, 3, 12, 1, PAL.soil)
  g.ellipsoid(0, 14, 0, 7, 3.4, 5, PAL.leafB)
  g.ellipsoid(5, 16, 2, 4, 2.4, 3, PAL.leafA)
  group.add(vox(g))
  return { group }
}

function vaseFlowers(variant: string): BuiltItem {
  const [c] = SEAT_COLORS[variant] ?? SEAT_COLORS.sky
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 10, 3.4, c)
  g.carveCylinder(0, 0, 8, 10, 2)
  g.fill(0, 10, 0, 0, 15, 0, PAL.leafB)
  g.fill(-3, 10, -1, -3, 14, -1, PAL.leafB)
  g.fill(3, 10, 1, 3, 13, 1, PAL.leafB)
  g.roundedBox(-1, 16, -1, 1, 19, 1, PAL.pink)
  g.roundedBox(-4, 15, -2, -2, 17, 0, PAL.butter)
  g.roundedBox(2, 14, 0, 4, 16, 2, PAL.pinkMilk)
  group.add(vox(g))
  return { group }
}

function bookStack(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-8, 0, -6, 8, 3, 6, PAL.mintDeep)
  g.fill(-8, 1, 6, 8, 2, 6, PAL.cream) // page edges
  g.fill(-7, 4, -5, 7, 7, 5, PAL.terracotta)
  g.fill(-7, 5, 5, 7, 6, 5, PAL.cream)
  g.fill(-6, 8, -5, 6, 10, 4, PAL.lavenderDeep)
  group.add(vox(g))
  return { group }
}

function teapot(variant: string): BuiltItem {
  const [c, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.mint
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 10, 6, c)
  g.cylinder(0, 0, 10, 12, 3.4, c)
  g.disc(0, 0, 12, 2, deep)
  g.set(0, 13, 0, deep)
  g.fill(6, 5, -1, 9, 7, 0, c) // spout
  g.fill(-8, 7, -1, -6, 8, 0, c) // handle
  g.fill(-8, 4, -1, -8, 7, 0, c)
  g.fill(-8, 3, -1, -6, 4, 0, c)
  group.add(vox(g))
  const steam = makeSteam(8.5, 8, -0.5, 0.7)
  group.add(steam.group)
  return { group, update: steam.update }
}

function radio(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-9, 0, -5, 9, 12, 5, PAL.terracotta)
  g.fill(-6, 3, 5, 0, 9, 5, PAL.cream)
  for (let y = 4; y <= 8; y += 2) g.fill(-5, y, 5, -1, y, 5, PAL.honeyDark)
  g.fill(3, 4, 5, 6, 7, 5, PAL.cream)
  g.set(4, 5, 5, PAL.dark)
  g.set(5, 6, 5, PAL.pinkDeep)
  g.fill(-7, 12, -1, -7, 17, 0, PAL.chromeDark) // antenna
  group.add(vox(g))
  return { group }
}

function recordPlayer(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-11, 0, -9, 11, 5, 9, PAL.honey)
  g.fill(7, 5, -8, 9, 8, -6, PAL.chromeDark) // arm post
  g.fill(2, 7, -6, 8, 8, -5, PAL.chromeDark) // arm
  group.add(vox(g))
  const record = new THREE.Group()
  record.add(puck(0, 0, 0, 1.4, 7.5, PAL.dark))
  record.add(puck(0, 0, 1.4, 0.8, 2.6, PAL.pink))
  record.position.set(-1 * VOX, 5 * VOX, 0)
  group.add(record)
  const update = (_: number, t: number) => {
    record.rotation.y = t * 1.6
  }
  return { group, update }
}

function fishbowl(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.disc(0, 0, 1, 5, '#C8B08A') // pebbles
  g.set(-2, 2, 1, PAL.pinkDeep)
  g.set(3, 2, -2, PAL.mintDeep)
  group.add(vox(g))
  // the resident fish, actually swimming laps
  const fish = new THREE.Group()
  const fb = new VoxelGrid()
  fb.fill(0, 0, 0, 2, 1, 0, '#FF9C4A')
  fb.set(3, 0, 0, '#FFB877') // tail
  const fm = fb.build()
  fm.scale.setScalar(VOX)
  fm.position.set(-2 * VOX, -VOX, -0.5 * VOX)
  fish.add(fm)
  group.add(outlined(fish))
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(7 * VOX, 24, 18),
    new THREE.MeshLambertMaterial({ color: '#CFE4F2', transparent: true, opacity: 0.3, depthWrite: false })
  )
  bowl.position.y = 6.4 * VOX
  group.add(outlined(bowl))
  const update = (_: number, t: number) => {
    const a = t * 0.8
    fish.position.set(Math.cos(a) * 0.15, (5.8 + Math.sin(t * 1.7)) * VOX, Math.sin(a) * 0.15)
    fish.rotation.y = Math.PI / 2 - a // heading along the orbit tangent
  }
  return { group, update }
}

function rugL(variant: string): BuiltItem {
  const [base, deep] = SEAT_COLORS[variant] ?? SEAT_COLORS.cream
  const lite = lighten(base, 0.4)
  const group = new THREE.Group()
  const g = new VoxelGrid()
  for (let x = -44; x <= 44; x++)
    for (let z = -30; z <= 30; z++) {
      const edge = Math.abs(x) >= 43 || Math.abs(z) >= 29
      const border = Math.abs(x) >= 38 || Math.abs(z) >= 24
      g.set(x, 0, z, edge ? deep : border ? lite : (Math.floor(x / 6) + Math.floor(z / 6)) % 2 === 0 ? base : lite)
    }
  group.add(vox(g, { jitter: 0, outline: false }))
  return { group }
}

function bookshelfLow(variant: string): BuiltItem {
  const [wood] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  const spines = [PAL.mintDeep, PAL.pinkDeep, PAL.lavenderDeep, PAL.butter, PAL.denim, PAL.terracotta, PAL.leafB, PAL.chromeDark]
  g.fill(-32, 0, -8, 31, 3, 7, wood)
  g.fill(-32, 0, -8, -29, 55, 7, wood)
  g.fill(29, 0, -8, 31, 55, 7, wood)
  g.fill(-32, 52, -8, 31, 55, 7, wood)
  g.fill(-28, 26, -8, 28, 29, 7, wood)
  const rows = [4, 30]
  rows.forEach((sy, row) => {
    let x = -26
    let i = row * 2
    while (x < 24) {
      const w = 2 + ((x + 100 + row) % 3)
      const h = 14 + (((x + 100) * 3 + row * 5) % 6)
      g.fill(x, sy, -5, x + w, sy + h, 5, spines[i % spines.length])
      x += w + 2
      i++
    }
  })
  // trailing plant on top
  g.cylinder(20, 0, 56, 61, 3.4, PAL.terracotta)
  g.set(20, 62, 0, PAL.leafB)
  g.set(19, 62, 1, PAL.leafA)
  g.fill(24, 50, 2, 24, 55, 2, PAL.leafA)
  group.add(vox(g))
  return { group }
}

function coatRack(): BuiltItem {
  const group = new THREE.Group()
  group.add(puck(0, 0, 0, 1.6, 7, PAL.honeyDark))
  const g = new VoxelGrid()
  g.fill(-1, 1, -1, 0, 52, 0, PAL.honeyDark)
  g.fill(-7, 44, -1, -2, 45, 0, PAL.honey)
  g.fill(1, 46, -1, 6, 47, 0, PAL.honey)
  g.fill(-1, 40, 1, 0, 41, 6, PAL.honey)
  group.add(vox(g))
  group.add(puck(0, 0, 53, 3, 6, PAL.pinkDeep)) // a beret someone left
  group.add(puck(0, 0, 56, 1.4, 2, PAL.pinkDeep))
  return { group }
}

function umbrellaStand(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 14, 6, PAL.chrome)
  g.carveCylinder(0, 0, 10, 14, 4.4)
  group.add(vox(g))
  group.add(cone(-2, 1, 14, 16, 2.6, 0.7, smoothMat(PAL.pinkDeep)))
  group.add(cone(2, -1, 14, 18, 2.6, 0.7, smoothMat(PAL.denim)))
  return { group }
}

/** The guestbook: an open book on a little podium. Interactable — visitors draw notes. */
function guestbook(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  // podium
  g.fill(-7, 0, -6, 6, 2, 5, PAL.honeyDark)
  g.fill(-2, 2, -2, 1, 26, 1, PAL.honey)
  g.fill(-8, 26, -7, 7, 28, 6, PAL.honey) // slanted-ish desk top
  // open book
  g.fill(-8, 28, -6, 7, 29, 5, '#C9895E') // cover
  g.fill(-7, 29, -5, -1, 30, 4, PAL.cream) // left page
  g.fill(0, 29, -5, 6, 30, 4, '#FFFDF4') // right page
  g.fill(-1, 29, -5, 0, 30, 4, PAL.honeyDark) // spine groove
  // little heart doodle on the left page
  g.set(-5, 30, -2, PAL.pinkDeep)
  g.set(-3, 30, -2, PAL.pinkDeep)
  g.fill(-5, 30, -1, -3, 30, -1, PAL.pinkDeep)
  g.set(-4, 30, 0, PAL.pinkDeep)
  // pen resting on the right page
  g.fill(2, 30, 1, 5, 30, 2, PAL.denim)
  group.add(vox(g))
  // gentle sparkle so it reads interactable
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.9 })
  const spark = new THREE.Mesh(new THREE.BoxGeometry(VOX * 1.4, VOX * 1.4, VOX * 1.4), sparkMat)
  spark.position.set(-9 * VOX, 34 * VOX, 0)
  group.add(spark)
  const update = (_: number, t: number) => {
    spark.position.y = (33 + Math.sin(t * 2.2) * 2) * VOX
    sparkMat.opacity = 0.45 + 0.45 * Math.sin(t * 3.1)
    spark.rotation.y = t * 1.4
  }
  return { group, update }
}

/** Standing salon mirror — click it in a shop to restyle yourself. */
function salonMirror(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-8, 0, -5, 7, 2, 4, PAL.honeyDark) // feet
  g.fill(-8, 2, -2, 7, 46, 0, PAL.honey) // frame slab
  g.fill(-6, 4, 0, 5, 43, 0, PAL.chrome) // mirror backing
  group.add(vox(g))
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(11 * VOX, 38 * VOX),
    new THREE.MeshBasicMaterial({ color: '#DDEBF5', transparent: true, opacity: 0.55 })
  )
  glass.position.set(-0.5 * VOX, 24 * VOX, 1.1 * VOX)
  group.add(outlined(glass))
  // the interactable sparkle
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9 })
  const spark = new THREE.Mesh(new THREE.BoxGeometry(VOX * 1.4, VOX * 1.4, VOX * 1.4), sparkMat)
  spark.position.set(3 * VOX, 40 * VOX, 1.5 * VOX)
  group.add(spark)
  const update = (_: number, t: number) => {
    spark.position.y = (38 + Math.sin(t * 2.4) * 3) * VOX
    sparkMat.opacity = 0.4 + 0.5 * Math.sin(t * 3.4)
    spark.rotation.y = t * 1.6
  }
  return { group, update }
}

// ---------- kitchen ----------
function fridge(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-14, 0, -11, 14, 76, 11, PAL.cream)
  g.fill(-14, 0, -11, 14, 3, 11, PAL.chromeDark) // kick plate
  for (let x = -13; x <= 13; x++) g.set(x, 52, 12, PAL.chromeDark) // freezer seam
  g.fill(10, 30, 12, 11, 48, 12, PAL.chrome) // door handle (tall)
  g.fill(10, 56, 12, 11, 68, 12, PAL.chrome) // freezer handle
  g.set(-8, 40, 12, PAL.pinkDeep) // fridge magnets
  g.set(-5, 36, 12, PAL.mintDeep)
  g.set(-9, 30, 12, PAL.butter)
  g.set(2, 74, 6, '#FFFFFF') // flat-face shine on top
  g.set(3, 74, 5, '#FFFFFF')
  group.add(vox(g))
  return { group }
}

function stove(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-14, 0, -11, 14, 40, 11, PAL.cream)
  g.fill(-14, 0, -11, 14, 2, 11, PAL.chromeDark)
  g.fill(-14, 40, -11, 14, 42, 11, PAL.marble) // cooktop deck
  // oven door: window band + handle
  g.fill(-10, 10, 12, 10, 24, 12, PAL.chromeDark)
  g.fill(-8, 12, 12, 8, 22, 12, '#4A3A30') // dark glass
  g.fill(-10, 30, 12, 10, 32, 12, PAL.chrome) // handle bar
  for (const dx of [-9, -3, 3, 9]) g.set(dx, 36, 12, PAL.pinkDeep) // dials
  group.add(vox(g))
  // burners: flat dark pucks on the deck
  for (const [bx, bz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]] as const)
    group.add(puck(bx, bz, 42, 1.2, 4.6, '#4A3A30'))
  return { group }
}

function kitchenSink(variant: string): BuiltItem {
  const [light] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-20, 0, -12, 20, 38, 12, PAL.counterFace)
  for (let x = -18; x <= 18; x += 4) g.fill(x, 4, 13, x + 1, 34, 13, light) // cabinet slats
  g.fill(-22, 38, -13, 21, 42, 13, PAL.marble) // top
  g.carve(-12, 40, -8, 11, 42, 7) // basin
  g.fill(-12, 39, -8, 11, 40, 7, PAL.chrome) // basin floor
  // faucet: a little chrome arch
  g.fill(-1, 42, -11, 1, 52, -9, PAL.chrome)
  g.fill(-1, 50, -9, 1, 52, -4, PAL.chrome)
  g.set(3, 43, -10, PAL.pinkDeep) // hot tap
  g.set(-4, 43, -10, PAL.mintDeep) // cold tap
  group.add(vox(g))
  return { group }
}

function kettle(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 10, 5.4, PAL.butter)
  g.carveCylinder(0, 0, 8, 10, 3.4)
  g.disc(0, 0, 10, 3, '#EEC06A') // lid
  g.set(0, 12, 0, PAL.honeyDark) // knob
  g.fill(5, 4, -1, 8, 6, 1, PAL.butter) // spout
  g.fill(-8, 4, -1, -6, 9, 1, PAL.honeyDark) // handle
  group.add(vox(g))
  const steam = makeSteam(0, 12, 0, 0.7)
  group.add(steam.group)
  return { group, update: steam.update }
}

function toaster(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-8, 0, -5, 8, 10, 5, PAL.chrome)
  g.fill(-8, 0, -5, 8, 1, 5, PAL.chromeDark)
  g.carve(-5, 9, -3, -2, 10, 2) // slots
  g.carve(2, 9, -3, 5, 10, 2)
  g.fill(-4, 8, -2, -3, 14, 1, '#E8C287') // toast peeking out
  g.fill(3, 8, -2, 4, 12, 1, '#E8C287')
  g.fill(9, 4, -1, 10, 6, 1, PAL.pinkDeep) // lever
  g.set(6, 8, 6, '#FFFFFF') // flat-face shine
  group.add(vox(g))
  return { group }
}

// ---------- library ----------
function bookCart(variant: string): BuiltItem {
  const [, dark] = WOODS[variant] ?? WOODS.honey
  const group = new THREE.Group()
  const g = new VoxelGrid()
  const spines = [PAL.pinkDeep, PAL.mintDeep, PAL.butter, PAL.lavenderDeep, '#7FA9CE']
  for (const sy of [4, 20]) {
    g.fill(-12, sy, -7, 12, sy + 1, 7, dark) // shelf
    let x = -11
    let i = sy // vary the run per shelf
    while (x < 10) {
      const w = 2 + ((x + 100 + sy) % 3)
      g.fill(x, sy + 2, -5, x + w, sy + 2 + 10 + ((x + sy) % 4), 5, spines[i % spines.length])
      x += w + 2
      i++
    }
  }
  g.fill(-12, 4, -7, -11, 34, 7, dark) // side panels
  g.fill(11, 4, -7, 12, 34, 7, dark)
  g.fill(-12, 33, -7, 12, 34, 7, dark) // push rail
  group.add(vox(g))
  for (const [wx, wz] of [[-9, -5], [9, -5], [-9, 5], [9, 5]] as const)
    group.add(puck(wx, wz, 0, 4, 2.2, '#4A3A30')) // wheels
  return { group }
}

function globe(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 2, 5, PAL.honeyDark) // base
  g.fill(-1, 2, -1, 0, 14, 0, PAL.honeyDark) // stem
  g.ellipsoid(0, 22, 0, 8, 8, 8, '#8FC1E8') // oceans
  // little continents
  g.fill(-6, 20, 4, -2, 25, 7, '#9CCB88')
  g.fill(2, 24, -7, 6, 28, -3, '#9CCB88')
  g.fill(0, 16, 3, 4, 19, 6, '#9CCB88')
  g.fill(-2, 28, -2, 1, 29, 1, '#FFFFFF') // ice cap
  group.add(vox(g))
  return { group }
}

// ---------- plants ----------
function palmPlant(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 8, 6, '#C97B5A') // pot
  g.carveCylinder(0, 0, 6, 8, 4.8)
  g.disc(0, 0, 6, 4.8, '#8A5A3C') // soil
  g.fill(-1, 6, -1, 0, 26, 0, '#A8794F') // trunk
  g.set(0, 14, 0, '#96683F')
  // fronds: four arcs reaching out and drooping
  const leaf = '#6FA96B'
  const dark = '#5C9158'
  g.fill(0, 26, 0, 10, 28, 1, leaf)
  g.fill(8, 24, 0, 13, 26, 1, dark)
  g.fill(-10, 26, -1, 0, 28, 0, leaf)
  g.fill(-13, 24, -1, -8, 26, 0, dark)
  g.fill(-1, 26, 0, 0, 28, 10, dark)
  g.fill(-1, 24, 8, 0, 26, 13, leaf)
  g.fill(-1, 26, -10, 0, 28, 0, leaf)
  g.fill(-1, 24, -13, 0, 26, -8, dark)
  g.fill(-2, 28, -2, 1, 30, 1, leaf) // crown
  group.add(vox(g))
  return { group }
}

function flowerTrio(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  const pots: [number, string, string][] = [
    [-8, '#C97B5A', PAL.pinkDeep],
    [0, '#B5A0E4', PAL.butter],
    [8, '#C97B5A', '#FFFFFF'],
  ]
  for (const [px, potC, bloom] of pots) {
    g.fill(px - 2, 0, -2, px + 2, 4, 2, potC)
    g.carve(px - 1, 3, -1, px + 1, 4, 1)
    g.set(px, 4, 0, '#6FA96B') // stem
    g.set(px, 5, 0, '#6FA96B')
    g.set(px, 6, 0, bloom) // bloom
    g.set(px - 1, 6, 0, bloom)
    g.set(px + 1, 6, 0, bloom)
    g.set(px, 7, 0, bloom)
  }
  group.add(vox(g))
  return { group }
}

function ivyPot(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.cylinder(0, 0, 0, 6, 4.6, PAL.trim)
  g.carveCylinder(0, 0, 4, 6, 3.6)
  g.disc(0, 0, 4, 3.6, '#8A5A3C')
  const leaf = '#7FB069'
  const dark = '#659455'
  // vines spilling over the rim and trailing down the sides
  g.fill(4, 2, -1, 6, 6, 1, leaf)
  g.fill(6, 0, 0, 8, 3, 1, dark)
  g.fill(-6, 3, -1, -4, 6, 1, dark)
  g.fill(-8, 0, 0, -6, 4, 1, leaf)
  g.fill(-1, 4, 4, 1, 6, 6, leaf)
  g.fill(0, 1, 6, 1, 4, 8, dark)
  g.fill(-1, 5, -6, 1, 6, -4, dark)
  g.fill(-2, 6, -2, 2, 7, 2, leaf) // top tuft
  group.add(vox(g))
  return { group }
}

// ---------- fairy lights ----------
function fairyGarland(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-19, 0, -1, -18, 44, 0, PAL.honeyDark) // poles
  g.fill(18, 0, -1, 19, 44, 0, PAL.honeyDark)
  g.disc(-18, 0, 0, 4, PAL.honeyDark) // feet
  g.disc(18, 0, 0, 4, PAL.honeyDark)
  group.add(vox(g))
  // the drooping string with twinkling bulbs (the lighting rig drives them)
  const fairyMats: THREE.MeshBasicMaterial[] = []
  const wireMat = new THREE.MeshToonMaterial({ color: '#6B5844', gradientMap: toonRamp })
  const N = 9
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = (t - 0.5) * 36 * VOX
    const y = (44 - Math.sin(t * Math.PI) * 9) * VOX
    if (i < N) {
      const t2 = (i + 1) / N
      const x2 = (t2 - 0.5) * 36 * VOX
      const y2 = (44 - Math.sin(t2 * Math.PI) * 9) * VOX
      const seg = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x, y2 - y), 0.04, 0.04), wireMat)
      seg.position.set((x + x2) / 2, (y + y2) / 2, 0)
      seg.rotation.z = Math.atan2(y2 - y, x2 - x)
      group.add(seg)
    }
    if (i > 0 && i < N) {
      const m = new THREE.MeshBasicMaterial({ color: '#FFDE8A' })
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.11), m)
      bulb.position.set(x, y - 0.12, 0)
      group.add(bulb)
      fairyMats.push(m)
    }
  }
  return { group, fairyMats }
}

// ---------- wall décor (hung on the back/left walls, centered on origin) ----------
// Wall items are drawn centered on BOTH x and y (the hanging point is the
// middle of the piece) and flat against z≈0, facing +z into the room.

function poster(variant?: string): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-11, -14, 0, 11, 14, 1, PAL.honeyDark) // frame
  g.fill(-9, -12, 1, 9, 12, 2, PAL.cream) // paper
  if (variant === 'cat') {
    g.fill(-4, -6, 2, 4, 2, 2, '#8A6A4F') // the loaf
    g.fill(-6, 0, 2, -4, 4, 2, '#8A6A4F') // ears-ish head
    g.fill(-6, -8, 2, 5, -7, 2, PAL.pink) // cushion
  } else if (variant === 'plants') {
    g.fill(-6, -9, 2, -4, -2, 2, PAL.mintDeep)
    g.fill(-7, -1, 2, -3, 4, 2, PAL.mint)
    g.fill(2, -9, 2, 4, 0, 2, PAL.mintDeep)
    g.fill(0, 1, 2, 6, 6, 2, PAL.mint)
  } else if (variant === 'moon') {
    g.fill(-3, 2, 2, 5, 9, 2, PAL.butter)
    g.fill(-6, -9, 2, 7, -8, 2, PAL.lavenderDeep) // hills
    g.fill(-9, -12, 2, 9, -9, 2, PAL.lavender)
  } else {
    // sunset
    g.fill(-9, 4, 2, 9, 12, 2, PAL.butter)
    g.fill(-9, -2, 2, 9, 3, 2, PAL.pink)
    g.fill(-9, -12, 2, 9, -3, 2, PAL.pinkDeep)
    g.fill(-3, 2, 2, 3, 7, 2, '#FFE9B0') // the sun
  }
  group.add(vox(g))
  return { group }
}

function wallClock(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-8, -8, 0, 8, 8, 1, PAL.honeyDark)
  g.fill(-6, -6, 1, 6, 6, 2, PAL.cream)
  g.fill(0, 0, 2, 0, 4, 2, PAL.board) // minute hand
  g.fill(1, 0, 2, 3, 0, 2, PAL.board) // hour hand
  g.fill(0, 6, 2, 0, 6, 2, PAL.pinkDeep) // twelve tick
  group.add(vox(g))
  return { group }
}

function wallShelf(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-16, -2, 0, 16, 0, 6, PAL.honey) // the plank
  g.fill(-14, -6, 0, -12, -2, 1, PAL.honeyDark) // brackets
  g.fill(12, -6, 0, 14, -2, 1, PAL.honeyDark)
  // a few books + a tiny plant living on it
  g.fill(-13, 1, 1, -11, 9, 5, PAL.pinkDeep)
  g.fill(-10, 1, 1, -8, 8, 5, PAL.mintDeep)
  g.fill(-7, 1, 1, -5, 10, 5, PAL.lavenderDeep)
  g.fill(6, 1, 2, 10, 4, 5, '#C97B63') // pot
  g.fill(7, 5, 2, 9, 8, 4, PAL.mintDeep)
  group.add(vox(g))
  return { group }
}

function pennantGarland(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  const flags = [PAL.pink, PAL.butter, PAL.mint, PAL.lavender, PAL.pinkDeep]
  for (let i = 0; i < 5; i++) {
    const cx = -20 + i * 10
    const dip = i % 2 === 0 ? 0 : -2 // the string sags between pins
    g.fill(cx - 4, 4 + dip, 0, cx + 4, 5 + dip, 1, PAL.board) // string run
    g.fill(cx - 3, -1 + dip, 0, cx + 3, 3 + dip, 1, flags[i]) // flag
    g.fill(cx - 2, -4 + dip, 0, cx + 2, -2 + dip, 1, flags[i])
    g.fill(cx - 1, -6 + dip, 0, cx + 1, -5 + dip, 1, flags[i])
  }
  group.add(vox(g))
  return { group }
}

function framedPhoto(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.fill(-6, -7, 0, 6, 7, 1, PAL.butter) // little gold frame
  g.fill(-4, -5, 1, 4, 5, 2, PAL.pinkMilk)
  g.fill(-2, -2, 2, 2, 2, 2, PAL.pinkDeep) // a heart-ish middle
  g.fill(-1, -3, 2, 1, -3, 2, PAL.pinkDeep)
  group.add(vox(g))
  return { group }
}

function neonMoon(): BuiltItem {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  // crescent: bright butter with a warm halo ring
  g.fill(-2, 6, 0, 6, 8, 1, '#FFE79A')
  g.fill(2, 2, 0, 8, 6, 1, '#FFE79A')
  g.fill(4, -4, 0, 8, 2, 1, '#FFE79A')
  g.fill(2, -8, 0, 8, -4, 1, '#FFE79A')
  g.fill(-2, -10, 0, 6, -8, 1, '#FFE79A')
  g.fill(0, -1, 0, 2, 1, 1, PAL.pinkMilk) // a wink of pink
  group.add(vox(g))
  return { group }
}

// ---------- the catalog ----------
export const CATALOG: Record<string, Entry> = {
  stool: {
    id: 'stool', price: 8, name: 'stool', category: 'seating', footprint: [1.4, 1.4], placement: 'floor',
    seats: [{ dx: 0, dz: 0 }], seatY: 1.78, variants: VARIANTS, build: stool,
  },
  chair: {
    id: 'chair', price: 12, name: 'café chair', category: 'seating', footprint: [1.6, 1.6], placement: 'floor',
    seats: [{ dx: 0, dz: 0 }], seatY: 1.73, seatFaces: 'item', variants: VARIANTS, build: chair,
  },
  armchair: {
    id: 'armchair', price: 30, name: 'armchair', category: 'seating', footprint: [4.2, 3.6], placement: 'floor',
    seats: [{ dx: 0, dz: 0.2 }], seatY: 1.45, seatFaces: 'item', variants: VARIANTS, build: armchair,
  },
  loveseat: {
    id: 'loveseat', price: 45, name: 'loveseat', category: 'seating', footprint: [6.2, 3.6], placement: 'floor',
    seats: [{ dx: -1.1, dz: 0.2 }, { dx: 1.1, dz: 0.2 }], seatY: 1.45, seatFaces: 'item', variants: VARIANTS, build: loveseat,
  },
  bench: {
    id: 'bench', price: 18, name: 'bench', category: 'seating', footprint: [4, 1.6], placement: 'floor',
    seats: [{ dx: -1, dz: 0 }, { dx: 1, dz: 0 }], seatY: 1.76, variants: VARIANTS, build: bench,
  },
  'floor-cushion': {
    id: 'floor-cushion', price: 6, name: 'floor cushion', category: 'seating', footprint: [1.5, 1.5], placement: 'floor',
    seats: [{ dx: 0, dz: 0 }], seatY: 0.72, variants: VARIANTS, build: floorCushion,
  },
  'bean-bag': {
    id: 'bean-bag', price: 16, name: 'bean bag', category: 'seating', footprint: [2.2, 2.2], placement: 'floor',
    seats: [{ dx: 0, dz: 0.15 }], seatY: 1.0, seatFaces: 'item', variants: VARIANTS, build: beanBag,
  },
  'table-s': {
    id: 'table-s', price: 15, name: 'round table S', category: 'tables', footprint: [2.8, 2.8], placement: 'floor',
    surface: { h: 2.375, radius: 1.25 }, variants: WOOD_VARIANTS, build: tableRound(20),
  },
  'table-m': {
    id: 'table-m', price: 25, name: 'round table M', category: 'tables', footprint: [4, 4], placement: 'floor',
    surface: { h: 2.375, radius: 1.875 }, variants: WOOD_VARIANTS, build: tableRound(30),
  },
  'table-sq': {
    id: 'table-sq', price: 18, name: 'square table', category: 'tables', footprint: [2, 2], placement: 'floor',
    surface: { h: 2.375 }, variants: WOOD_VARIANTS, build: tableSquare,
  },
  'side-table': {
    id: 'side-table', price: 10, name: 'side table', category: 'tables', footprint: [1.3, 1.3], placement: 'floor',
    surface: { h: 1.725, radius: 0.55 }, variants: WOOD_VARIANTS, build: sideTable,
  },
  'table-l': {
    id: 'table-l', price: 35, name: 'long table', category: 'tables', footprint: [5.8, 2.9], placement: 'floor',
    surface: { h: 2.375 }, variants: WOOD_VARIANTS, build: tableLong,
  },
  'coffee-table': {
    id: 'coffee-table', price: 14, name: 'coffee table', category: 'tables', footprint: [3.5, 2], placement: 'floor',
    surface: { h: 1.5 }, variants: WOOD_VARIANTS, build: coffeeTable,
  },
  desk: {
    id: 'desk', price: 22, name: 'writing desk', category: 'tables', footprint: [4, 2], placement: 'floor',
    surface: { h: 2.375 }, variants: WOOD_VARIANTS, build: desk,
  },
  counter: {
    id: 'counter', price: 20, name: 'counter', category: 'counter', footprint: [2, 1.7], placement: 'floor',
    surface: { h: 2.75 }, variants: WOOD_VARIANTS, build: counter,
  },
  'counter-l': {
    id: 'counter-l', price: 34, name: 'long counter', category: 'counter', footprint: [4, 1.7], placement: 'floor',
    surface: { h: 2.75 }, variants: WOOD_VARIANTS, build: counterLong,
  },
  'pastry-case': {
    id: 'pastry-case', price: 55, name: 'bakery display', category: 'counter', footprint: [3.2, 1.7], placement: 'floor', build: pastryCase,
  },
  'menu-board': {
    id: 'menu-board', price: 10, name: 'menu board', category: 'counter', footprint: [1.6, 0.6], placement: 'floor', build: menuBoard,
  },
  // ---------- the gallery wave: wall décor (footprint = [width, height]) ----------
  poster: {
    id: 'poster', price: 12, name: 'poster', category: 'wall', footprint: [1.5, 1.9], placement: 'wall',
    variants: ['sunset', 'cat', 'plants', 'moon'], build: poster,
  },
  'wall-clock': {
    id: 'wall-clock', price: 14, name: 'wall clock', category: 'wall', footprint: [1.1, 1.1], placement: 'wall', build: wallClock,
  },
  'wall-shelf': {
    id: 'wall-shelf', price: 18, name: 'wall shelf', category: 'wall', footprint: [2.1, 1.1], placement: 'wall', build: wallShelf,
  },
  'pennant-garland': {
    id: 'pennant-garland', price: 10, name: 'pennant garland', category: 'wall', footprint: [3.1, 1.0], placement: 'wall', build: pennantGarland,
  },
  'framed-photo': {
    id: 'framed-photo', price: 8, name: 'framed photo', category: 'wall', footprint: [0.9, 1.0], placement: 'wall', build: framedPhoto,
  },
  'neon-moon': {
    id: 'neon-moon', price: 26, name: 'neon moon', category: 'wall', footprint: [1.2, 1.3], placement: 'wall', build: neonMoon,
  },
  bookshelf: {
    id: 'bookshelf', price: 35, name: 'bookshelf', category: 'decor', footprint: [4, 1.1], placement: 'floor', variants: WOOD_VARIANTS, build: bookshelf,
  },
  'bookshelf-low': {
    id: 'bookshelf-low', price: 22, name: 'low bookshelf', category: 'decor', footprint: [4, 1.1], placement: 'floor', variants: WOOD_VARIANTS, build: bookshelfLow,
  },
  'floor-lamp': {
    id: 'floor-lamp', price: 18, name: 'floor lamp', category: 'decor', footprint: [1.7, 1.7], placement: 'floor', variants: SHADE_VARIANTS, build: floorLamp,
  },
  jukebox: {
    id: 'jukebox', price: 60, name: 'jukebox', category: 'decor', footprint: [2, 1.3], placement: 'floor', build: jukebox,
  },
  piano: {
    id: 'piano', price: 80, name: 'upright piano', category: 'decor', footprint: [4.3, 1.8], placement: 'floor', build: piano,
  },
  guestbook: {
    id: 'guestbook', price: 12, name: 'guestbook', category: 'decor', footprint: [1, 0.9], placement: 'floor', build: guestbook,
  },
  'salon-mirror': {
    id: 'salon-mirror', price: 30, name: 'salon mirror', category: 'decor', footprint: [1.1, 0.7], placement: 'floor', build: salonMirror,
  },
  'coat-rack': {
    id: 'coat-rack', price: 9, name: 'coat rack', category: 'decor', footprint: [1, 1], placement: 'floor', build: coatRack,
  },
  fridge: {
    id: 'fridge', price: 60, name: 'fridge', category: 'counter', footprint: [1.9, 1.5], placement: 'floor', build: fridge,
  },
  stove: {
    id: 'stove', price: 55, name: 'stove & oven', category: 'counter', footprint: [1.9, 1.5], placement: 'floor', build: stove,
  },
  'kitchen-sink': {
    id: 'kitchen-sink', price: 45, name: 'kitchen sink', category: 'counter', footprint: [2.7, 1.7], placement: 'floor',
    surface: { h: 2.625 }, variants: WOOD_VARIANTS, build: kitchenSink,
  },
  kettle: {
    id: 'kettle', price: 8, name: 'kettle', category: 'things', footprint: [0.7, 0.7], placement: 'surface', build: kettle,
  },
  toaster: {
    id: 'toaster', price: 10, name: 'toaster', category: 'things', footprint: [1.1, 0.7], placement: 'surface', build: toaster,
  },
  'book-cart': {
    id: 'book-cart', price: 30, name: 'book cart', category: 'decor', footprint: [1.6, 1], placement: 'floor',
    variants: WOOD_VARIANTS, build: bookCart,
  },
  globe: {
    id: 'globe', price: 22, name: 'globe', category: 'decor', footprint: [1.1, 1.1], placement: 'floor', build: globe,
  },
  'palm-plant': {
    id: 'palm-plant', price: 26, name: 'palm plant', category: 'plants', footprint: [1.7, 1.7], placement: 'floor', build: palmPlant,
  },
  'flower-trio': {
    id: 'flower-trio', price: 12, name: 'flower trio', category: 'plants', footprint: [1.4, 0.4], placement: 'surface', build: flowerTrio,
  },
  'ivy-pot': {
    id: 'ivy-pot', price: 14, name: 'ivy pot', category: 'plants', footprint: [0.7, 0.7], placement: 'surface', build: ivyPot,
  },
  'fairy-garland': {
    id: 'fairy-garland', price: 25, name: 'fairy garland', category: 'decor', footprint: [2.5, 0.5], placement: 'floor', build: fairyGarland,
  },
  'umbrella-stand': {
    id: 'umbrella-stand', price: 7, name: 'umbrella stand', category: 'decor', footprint: [0.9, 0.9], placement: 'floor', build: umbrellaStand,
  },
  'rug-round': {
    id: 'rug-round', price: 12, name: 'round rug', category: 'rugs', footprint: [4.2, 4.2], placement: 'floor',
    noCollide: true, variants: VARIANTS, build: rugRound,
  },
  'rug-runner': {
    id: 'rug-runner', price: 10, name: 'runner rug', category: 'rugs', footprint: [2, 5], placement: 'floor',
    noCollide: true, variants: VARIANTS, build: rugRunner,
  },
  'rug-l': {
    id: 'rug-l', price: 16, name: 'big rug', category: 'rugs', footprint: [5.6, 3.8], placement: 'floor',
    noCollide: true, variants: VARIANTS, build: rugL,
  },
  monstera: {
    id: 'monstera', price: 15, name: 'monstera', category: 'plants', footprint: [1.6, 1.6], placement: 'floor', build: monstera,
  },
  'fiddle-tree': {
    id: 'fiddle-tree', price: 20, name: 'fiddle-leaf tree', category: 'plants', footprint: [1.6, 1.6], placement: 'floor', build: fiddleTree,
  },
  cactus: {
    id: 'cactus', price: 8, name: 'cactus', category: 'plants', footprint: [1.1, 1.1], placement: 'floor', build: cactus,
  },
  'cat-cushion': {
    id: 'cat-cushion', price: 25, name: 'cat cushion', category: 'decor', footprint: [2, 2], placement: 'floor', build: catCushion,
  },
  espresso: {
    id: 'espresso', price: 40, name: 'espresso machine', category: 'counter', footprint: [1.7, 1.4], placement: 'surface', build: espresso,
  },
  'cake-stand': {
    id: 'cake-stand', price: 15, name: 'cake stand', category: 'counter', footprint: [1.3, 1.3], placement: 'surface', build: cakeStand,
  },
  register: {
    id: 'register', price: 15, name: 'register', category: 'counter', footprint: [1.1, 1.1], placement: 'surface', build: register,
  },
  mug: {
    id: 'mug', price: 4, name: 'mug', category: 'things', footprint: [0.7, 0.7], placement: 'surface',
    variants: VARIANTS, build: mug,
  },
  'open-book': {
    id: 'open-book', price: 5, name: 'open book', category: 'things', footprint: [1.4, 1.1], placement: 'surface', build: openBook,
  },
  'book-stack': {
    id: 'book-stack', price: 6, name: 'book stack', category: 'things', footprint: [1.1, 0.9], placement: 'surface', build: bookStack,
  },
  'laptop-closed': {
    id: 'laptop-closed', price: 20, name: 'laptop', category: 'things', footprint: [1.5, 1], placement: 'surface', build: laptopClosed,
  },
  'table-lamp': {
    id: 'table-lamp', price: 12, name: 'table lamp', category: 'decor', footprint: [0.9, 0.9], placement: 'surface', variants: SHADE_VARIANTS, build: tableLamp,
  },
  candle: {
    id: 'candle', price: 3, name: 'candle', category: 'things', footprint: [0.5, 0.5], placement: 'surface',
    variants: VARIANTS, build: candle,
  },
  teapot: {
    id: 'teapot', price: 8, name: 'teapot', category: 'things', footprint: [1, 0.8], placement: 'surface',
    variants: VARIANTS, build: teapot,
  },
  radio: {
    id: 'radio', price: 14, name: 'radio', category: 'things', footprint: [1.2, 0.7], placement: 'surface', build: radio,
  },
  'record-player': {
    id: 'record-player', price: 25, name: 'record player', category: 'things', footprint: [1.4, 1.2], placement: 'surface', build: recordPlayer,
  },
  'speaker-s': {
    id: 'speaker-s', price: 10, name: 'small speaker', category: 'things', footprint: [0.6, 0.5], placement: 'surface', build: speakerS,
  },
  'speaker-l': {
    id: 'speaker-l', price: 28, name: 'big speaker', category: 'decor', footprint: [1, 0.8], placement: 'floor', build: speakerL,
  },
  'vinyl-crate': {
    id: 'vinyl-crate', price: 14, name: 'vinyl crate', category: 'decor', footprint: [1.2, 1.1], placement: 'floor', build: vinylCrate,
  },
  guitar: {
    id: 'guitar', price: 35, name: 'guitar', category: 'decor', footprint: [1, 0.8], placement: 'floor', build: guitar,
  },
  fishbowl: {
    id: 'fishbowl', price: 12, name: 'fishbowl', category: 'things', footprint: [0.9, 0.9], placement: 'surface', build: fishbowl,
  },
  'plant-s': {
    id: 'plant-s', price: 4, name: 'succulent', category: 'plants', footprint: [0.6, 0.6], placement: 'surface', build: plantS,
  },
  bonsai: {
    id: 'bonsai', price: 10, name: 'bonsai', category: 'plants', footprint: [1.1, 0.7], placement: 'surface', build: bonsai,
  },
  'vase-flowers': {
    id: 'vase-flowers', price: 6, name: 'tulip vase', category: 'plants', footprint: [0.6, 0.6], placement: 'surface',
    variants: VARIANTS, build: vaseFlowers,
  },
}

/** A delivery box with a bow, for the doorstep. */
export function buildPackage(): THREE.Group {
  const group = new THREE.Group()
  const g = new VoxelGrid()
  g.roundedBox(-10, 0, -8, 10, 13, 8, '#CE9C63')
  g.fill(-10, 0, -8, 10, 1, 8, '#B8854E')
  g.fill(-2, 2, -8, 2, 13, 8, PAL.cream) // tape strap
  g.fill(-10, 13, -1, 10, 13, 1, PAL.pinkDeep) // ribbon
  g.fill(-2, 13, -8, 2, 13, 8, PAL.pinkDeep)
  g.roundedBox(-5, 14, -2, -1, 16, 2, PAL.pink) // bow loops
  g.roundedBox(1, 14, -2, 5, 16, 2, PAL.pink)
  g.set(0, 14, 0, PAL.pinkDeep)
  g.fill(5, 4, 8, 9, 8, 8, '#FFFDF4') // label
  const mesh = g.build()
  mesh.scale.setScalar(VOX)
  group.add(outlined(mesh))
  return group
}

export function buildItem(itemId: string, variant?: string): BuiltItem {
  const entry = CATALOG[itemId]
  const v = variant ?? entry.variants?.[0] ?? ''
  return entry.build(v)
}

/** Footprint after rotation. */
export function footprintOf(itemId: string, rot: number): [number, number] {
  const [w, d] = CATALOG[itemId].footprint
  return rot % 2 === 0 ? [w, d] : [d, w]
}
