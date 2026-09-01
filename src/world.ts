import * as THREE from 'three'
import { VoxelGrid } from './voxel'
import { buildPerson } from './people'

// 1 voxel = 0.0625 world units. Room floor: 448 x 320 voxels (28 x 20 world).
export const VOX = 0.0625

export const PAL = {
  floorA: '#F0D9B2',
  floorB: '#EAD1A6',
  floorSeam: '#DCC298',
  floorLine: '#E4CCA0',
  plinth: '#F2E3C6',
  wall: '#FAF2E3',
  wainscot: '#F3E6CE',
  groove: '#EADABC',
  trim: '#FFFCF3',
  honey: '#D9A868',
  honeyDark: '#C08F52',
  marble: '#FCF7EC',
  counterFace: '#ECDEC3',
  mint: '#A8E0CB',
  mintDeep: '#7CC9AC',
  pink: '#FFB3C7',
  pinkDeep: '#FF8FAF',
  pinkMilk: '#FFDCE7',
  pinkFold: '#FFC3D4',
  butter: '#FFD98E',
  lavender: '#CCBBF0',
  lavenderDeep: '#B5A0E4',
  cream: '#FFF6E4',
  chrome: '#DADDE7',
  chromeDark: '#B7BBC9',
  skin: '#FFDCBD',
  hairCocoa: '#7C5940',
  hairHi: '#9E7654',
  denim: '#7383BC',
  blush: '#FFB9B0',
  dark: '#3A2A20',
  terracotta: '#D98D63',
  soil: '#8A6A4E',
  leafA: '#8CC98B',
  leafB: '#66A96E',
  catBody: '#F6E8CC',
  catPatch: '#E0AC66',
  mustard: '#F6C167',
  board: '#5F4A38',
  cork: '#DDBE8F',
  wire: '#D8CCB6',
}

export interface WorldHandles {
  group: THREE.Group
  avatarMeshes: THREE.Object3D[]
  catMeshes: THREE.Object3D[]
  lampPos: THREE.Vector3
  screenGlowPos: THREE.Vector3
  pendantPositions: THREE.Vector3[]
  skyMat: THREE.MeshBasicMaterial
  rainMat: THREE.LineBasicMaterial
  glassMat: THREE.MeshBasicMaterial
  fairyMats: THREE.MeshBasicMaterial[]
  screenMat: THREE.MeshBasicMaterial
  lampShadeMat: THREE.MeshLambertMaterial
  update: (dt: number, t: number) => void
}

// smooth-geometry helpers: big round shapes are real cylinders/discs so the
// silhouettes stay clean (voxel steps read as pixelation on large circles)
const matCache = new Map<string, THREE.MeshLambertMaterial>()
function smoothMat(hex: string): THREE.MeshLambertMaterial {
  let m = matCache.get(hex)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() })
    matCache.set(hex, m)
  }
  return m
}
/** Layer 1 marks objects for the retro outline pass (furniture + creatures). */
export const OUTLINE_LAYER = 1
function outlined<T extends THREE.Object3D>(o: T): T {
  o.traverse((m) => m.layers.enable(OUTLINE_LAYER))
  o.layers.enable(OUTLINE_LAYER)
  return o
}
/** Solid cylinder in voxel coordinates (yBottom..yBottom+h voxels tall). */
function puck(cx: number, cz: number, yBottom: number, h: number, r: number, hex: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r * VOX, r * VOX, h * VOX, 40)
  const mesh = new THREE.Mesh(geo, smoothMat(hex))
  mesh.position.set(cx * VOX, (yBottom + h / 2) * VOX, cz * VOX)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return outlined(mesh)
}
/** Tapered cone shade in voxel coordinates. */
function cone(cx: number, cz: number, yBottom: number, h: number, rBottom: number, rTop: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop * VOX, rBottom * VOX, h * VOX, 40)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(cx * VOX, (yBottom + h / 2) * VOX, cz * VOX)
  mesh.castShadow = true
  return outlined(mesh)
}

function blobTexture(): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(cv)
}

const CHALK: Record<string, string[]> = {
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
}

// ----------------------------------------------------------------- world ----
export function buildWorld(): WorldHandles {
  const group = new THREE.Group()
  const updaters: ((dt: number, t: number) => void)[] = []

  const g = new VoxelGrid() // room shell (soft, no outlines)
  const f = new VoxelGrid() // freestanding furniture (gets the outline pass)

  // ---------- floor: parquet tiles + hollow cream plinth ----------
  for (let x = 0; x < 448; x++)
    for (let z = 0; z < 320; z++) {
      const tx = Math.floor(x / 40)
      const tz = Math.floor(z / 40)
      let tone = (tx + tz) % 2 === 0 ? PAL.floorA : PAL.floorB
      if (x % 40 === 0 || z % 40 === 0) tone = PAL.floorSeam
      else if ((tx + tz) % 2 === 0 ? x % 10 === 5 : z % 10 === 5) tone = PAL.floorLine
      g.set(x, -1, z, tone)
    }
  // plinth: perimeter ring only (interior is never visible)
  g.fill(0, -6, 0, 447, -2, 5, PAL.plinth)
  g.fill(0, -6, 314, 447, -2, 319, PAL.plinth)
  g.fill(0, -6, 0, 5, -2, 319, PAL.plinth)
  g.fill(442, -6, 0, 447, -2, 319, PAL.plinth)

  // ---------- walls ----------
  g.fill(0, 0, -4, 447, 119, -1, PAL.wall)
  g.fill(-4, 0, -4, -1, 119, 319, PAL.wall)
  g.fill(0, 116, -4, 447, 119, -1, PAL.honey)
  g.fill(-4, 116, -4, -1, 119, 319, PAL.honey)
  for (let x = 0; x < 448; x++)
    for (let y = 7; y <= 36; y++) g.set(x, y, -1, x % 8 === 4 ? PAL.groove : PAL.wainscot)
  for (let z = 0; z < 320; z++)
    for (let y = 7; y <= 36; y++) g.set(-1, y, z, z % 8 === 4 ? PAL.groove : PAL.wainscot)
  g.fill(0, 0, -1, 447, 6, 0, PAL.trim)
  g.fill(0, 37, -1, 447, 40, 0, PAL.trim)
  // left-wall trim stops at the door opening (z 20..68) instead of crossing it
  g.fill(-1, 0, 0, 0, 6, 19, PAL.trim)
  g.fill(-1, 0, 69, 0, 6, 319, PAL.trim)
  g.fill(-1, 37, 0, 0, 40, 19, PAL.trim)
  g.fill(-1, 37, 69, 0, 40, 319, PAL.trim)

  // ---------- two windows in the back wall ----------
  for (const wx of [32, 168]) {
    const x0 = wx
    const x1 = wx + 104
    g.carve(x0, 48, -4, x1, 108, -1)
    g.fill(x0 - 4, 44, -2, x1 + 4, 47, -1, PAL.trim)
    g.fill(x0 - 4, 47, -2, x1 + 4, 47, 1, PAL.trim) // sill lip
    g.fill(x0 - 4, 109, -2, x1 + 4, 112, -1, PAL.trim)
    g.fill(x0 - 4, 48, -2, x0 - 1, 108, -1, PAL.trim)
    g.fill(x1 + 1, 48, -2, x1 + 4, 108, -1, PAL.trim)
    g.fill(x0 + 50, 48, -2, x0 + 54, 108, -1, PAL.trim) // vertical mullion
    g.fill(x0, 76, -2, x1, 80, -1, PAL.trim) // horizontal mullion
  }
  // sill plants: little pots with rims, soil, and sprouts
  for (const [px, bloom] of [[52, 1], [108, 0], [216, 0]] as const) {
    g.fill(px, 48, -1, px + 6, 53, 0, PAL.terracotta)
    g.fill(px - 1, 54, -1, px + 7, 54, 0, PAL.terracotta) // rim
    g.fill(px + 1, 54, -1, px + 5, 54, 0, PAL.soil)
    g.fill(px + 3, 55, 0, px + 3, 56, 0, PAL.leafB) // sprout
    g.set(px + 2, 56, 0, PAL.leafA)
    g.set(px + 4, 56, 0, PAL.leafA)
    if (bloom) g.set(px + 3, 57, 0, PAL.pinkDeep)
  }

  // ivy garland hugging the window headers
  for (let x = 30; x <= 278; x += 9) {
    const drop = (x % 5)
    g.sphere(x, 108 - drop / 2, 0, 3, (x / 9) % 2 === 0 ? PAL.leafA : PAL.leafB)
    if (x % 27 === 6) {
      g.fill(x, 94 - drop, 0, x, 105 - drop, 0, PAL.leafB)
      g.set(x, 92 - drop, 0, PAL.leafA)
    }
  }

  // curtains at the outer edges + butter rod
  g.fill(16, 114, 0, 288, 115, 1, PAL.butter)
  g.sphere(16, 114, 1, 2.6, PAL.butter)
  g.sphere(288, 114, 1, 2.6, PAL.butter)
  for (const [px0, px1] of [[16, 28], [276, 288]] as const) {
    for (let x = px0; x <= px1; x++) {
      const depth = 2 + ((x * 7) % 3 === 0 ? 2 : 0)
      const col = (x * 5) % 4 === 0 ? PAL.pinkFold : PAL.pinkMilk
      g.fill(x, 40, 0, x, 113, depth, col)
    }
  }

  // trailing plant on a little shelf between the windows
  g.fill(142, 86, 0, 162, 89, 7, PAL.honey)
  g.cylinder(152, 4, 90, 97, 4.4, PAL.terracotta)
  g.sphere(152, 98, 4, 4, PAL.leafA)
  g.fill(146, 66, 6, 146, 88, 6, PAL.leafB)
  g.set(146, 64, 6, PAL.leafA)
  g.fill(158, 74, 6, 158, 88, 6, PAL.leafB)
  g.set(158, 72, 6, PAL.leafA)

  // ---------- chalkboard with STUDDY (2x chalk font) ----------
  g.fill(296, 52, -1, 386, 108, -1, PAL.honeyDark)
  g.fill(300, 56, 0, 382, 104, 0, PAL.board)
  let cx = 310
  for (const ch of 'STUDDY') {
    const rows = CHALK[ch]
    for (let ry = 0; ry < 5; ry++)
      for (let rx = 0; rx < 3; rx++)
        if (rows[ry][rx] === '#') g.fill(cx + rx * 2, 96 - ry * 2 - 1, 0, cx + rx * 2 + 1, 96 - ry * 2, 0, PAL.cream)
    cx += 10
  }
  g.fill(310, 82, 0, 366, 82, 0, PAL.pinkDeep)
  const scribbles: [number, number, number, string][] = [
    [308, 74, 20, PAL.cream], [332, 74, 12, PAL.butter],
    [308, 68, 14, PAL.mint], [326, 68, 18, PAL.cream],
    [308, 62, 12, PAL.lavender], [324, 62, 16, PAL.pink],
  ]
  for (const [sx, sy, w, col] of scribbles) g.fill(sx, sy, 0, sx + w, sy, 0, col)
  // little chalk cup doodle
  g.fill(358, 62, 0, 368, 70, 0, PAL.board)
  g.fill(359, 64, 0, 367, 69, 0, PAL.cream)
  g.fill(359, 63, 0, 367, 63, 0, PAL.cream)
  g.set(369, 66, 0, PAL.cream)

  // ---------- corkboard ----------
  g.fill(398, 52, -1, 440, 92, -1, PAL.honey)
  g.fill(400, 54, 0, 438, 90, 0, PAL.cork)
  const notes: [number, number, string][] = [
    [404, 78, PAL.pink], [414, 70, PAL.mint], [426, 80, PAL.butter],
    [430, 62, PAL.lavender], [406, 60, PAL.cream], [418, 82, PAL.pinkMilk],
    [420, 58, PAL.pink],
  ]
  for (const [nx, ny, nc] of notes) {
    g.fill(nx, ny, 1, nx + 6, ny + 6, 1, nc)
    g.set(nx + 3, ny + 6, 1, PAL.pinkDeep)
  }

  // ---------- door: recessed 2 voxels into the wall, inset panels, proud frame ----------
  g.carve(-2, 0, 24, -1, 102, 64)
  g.fill(-4, -1, 24, -1, -1, 64, PAL.honeyDark) // threshold under the reveal
  g.fill(-3, 0, 25, -3, 101, 63, PAL.mintDeep) // door slab sits inside the reveal
  for (const [pz0, pz1] of [[30, 36], [52, 58]] as const) {
    g.carve(-3, 12, pz0, -3, 44, pz1)
    g.fill(-4, 12, pz0, -4, 44, pz1, PAL.mint) // inset panels, one voxel deeper
  }
  for (let z = 32; z <= 56; z++)
    for (let y = 66; y <= 90; y++) {
      const d = Math.hypot(z - 44, y - 78)
      if (d < 10) {
        g.carve(-3, y, z, -3, y, z)
        g.fill(-4, y, z, -4, y, z, PAL.cream) // porthole glass, deepest
      } else if (d <= 12.5) g.set(-3, y, z, PAL.trim) // porthole ring on the slab
    }
  g.fill(-2, 48, 58, -1, 52, 61, PAL.butter) // knob, proud of the door face
  // architrave frame, proud of the wall
  g.fill(-1, 0, 20, 0, 104, 23, PAL.trim)
  g.fill(-1, 0, 65, 0, 104, 68, PAL.trim)
  g.fill(-1, 102, 20, 0, 105, 68, PAL.trim)
  // clock: a real 2-voxel-thick disc proud of the wall
  for (let z = 88; z <= 104; z++)
    for (let y = 92; y <= 108; y++) {
      const d = Math.hypot(z - 96, y - 100)
      if (d <= 8) g.fill(-1, y, z, 0, y, z, d >= 6.2 ? PAL.honey : PAL.trim)
    }
  g.fill(0, 100, 96, 0, 104, 96, PAL.dark)
  g.fill(0, 100, 97, 0, 100, 100, PAL.dark)
  g.set(0, 100, 96, PAL.pinkDeep)
  // poster: latte with heart steam, framed with a proud border
  g.fill(-1, 44, 80, -1, 84, 112, PAL.trim)
  g.fill(-1, 44, 80, 0, 84, 82, PAL.trim)
  g.fill(-1, 44, 110, 0, 84, 112, PAL.trim)
  g.fill(-1, 44, 80, 0, 46, 112, PAL.trim)
  g.fill(-1, 82, 80, 0, 84, 112, PAL.trim)
  g.fill(-1, 46, 82, -1, 82, 110, PAL.pinkMilk)
  g.fill(-1, 52, 88, -1, 64, 102, PAL.cream)
  g.fill(-1, 50, 90, -1, 52, 100, PAL.cream)
  g.fill(-1, 56, 103, -1, 62, 105, PAL.cream)
  g.fill(-1, 64, 90, -1, 65, 100, '#A8734A')
  g.fill(-1, 69, 92, -1, 71, 94, PAL.pinkDeep)
  g.fill(-1, 74, 97, -1, 76, 99, PAL.pinkDeep)

  // ---------- counter (left wall) ----------
  f.fill(0, 0, 120, 38, 37, 264, PAL.counterFace)
  for (let z = 128; z <= 256; z += 16) f.fill(38, 4, z, 38, 34, z, PAL.honeyDark)
  f.fill(0, 38, 116, 46, 43, 268, PAL.marble)
  f.fill(0, 0, 120, 38, 2, 264, PAL.honeyDark)

  // espresso machine
  f.roundedBox(2, 44, 136, 30, 66, 178, PAL.cream)
  f.fill(2, 44, 136, 30, 48, 178, PAL.chrome)
  f.fill(2, 64, 136, 30, 67, 178, PAL.chrome)
  f.cylinder(10, 148, 68, 74, 4, PAL.cream)
  f.carveCylinder(10, 148, 71, 74, 2.4)
  f.cylinder(20, 166, 68, 73, 4, PAL.pink)
  f.carveCylinder(20, 166, 70, 73, 2.4)
  f.set(29, 66, 176, '#FFFFFF') // chrome shine
  f.set(28, 66, 177, '#FFFFFF')
  f.set(29, 47, 177, '#FFFFFF')
  f.fill(30, 50, 144, 34, 56, 150, PAL.chromeDark)
  f.fill(30, 50, 162, 34, 56, 168, PAL.chromeDark)
  f.fill(34, 52, 146, 44, 54, 148, PAL.honey)
  f.fill(34, 52, 164, 44, 54, 166, PAL.honey)
  f.fill(32, 43, 140, 42, 43, 172, PAL.chromeDark)
  f.fill(30, 57, 151, 30, 63, 157, PAL.chromeDark) // gauge: dark bezel, pink dial
  f.fill(30, 59, 153, 30, 61, 155, PAL.pinkDeep)
  f.fill(30, 44, 177, 33, 46, 179, PAL.chromeDark) // steam wand, attached to the body

  // grinder
  f.cylinder(16, 196, 44, 62, 6.4, PAL.chromeDark)
  f.cylinder(16, 196, 62, 72, 4.8, PAL.chrome)

  // two-tier cake stand
  f.disc(16, 222, 44, 10, PAL.trim)
  f.cylinder(16, 222, 45, 52, 1.6, PAL.trim)
  f.disc(16, 222, 53, 7, PAL.trim)
  f.cylinder(12, 218, 45, 49, 3, PAL.butter) // cupcakes below
  f.cylinder(21, 226, 45, 49, 3, PAL.mint)
  f.cylinder(16, 222, 54, 58, 4.4, PAL.cream) // cake on top
  f.cylinder(16, 222, 59, 60, 4.4, PAL.pink)
  f.set(16, 61, 222, PAL.pinkDeep)

  // register: keypad, receipt, drawer groove, screen shine
  f.roundedBox(6, 44, 240, 24, 52, 256, PAL.chromeDark)
  f.fill(8, 52, 242, 22, 58, 244, PAL.dark)
  f.set(21, 57, 244, '#FFFFFF')
  for (const kx of [11, 14, 17]) {
    f.set(kx, 52, 247, PAL.cream)
    f.set(kx, 52, 250, PAL.cream)
  }
  f.fill(11, 53, 252, 13, 56, 253, '#FFFDF4') // receipt curling up
  f.fill(24, 46, 243, 24, 46, 253, '#999DAB') // drawer groove
  // tip jar
  f.cylinder(34, 250, 44, 52, 3.6, PAL.butter)
  f.carveCylinder(34, 250, 47, 52, 2.4)

  // mug shelves
  for (const sy of [78, 98]) {
    f.fill(0, sy, 124, 15, sy + 3, 260, PAL.honey)
    const mugColors = [PAL.mint, PAL.pink, PAL.butter, PAL.lavender, PAL.cream, PAL.mintDeep]
    let i = 0
    for (let z = 130; z <= 254; z += 16) {
      const c = mugColors[(i + (sy === 98 ? 3 : 0)) % 6]
      f.cylinder(6, z, sy + 4, sy + 11, 4, c)
      f.carveCylinder(6, z, sy + 8, sy + 11, 2.4) // real opening
      f.fill(10, sy + 6, z - 1, 11, sy + 9, z + 1, c) // handle flush to the mug
      i++
    }
  }

  // ---------- window bar ----------
  f.fill(24, 40, 8, 280, 45, 40, PAL.honey)
  for (const bx of [40, 150, 260]) f.fill(bx - 2, 0, 32, bx + 2, 39, 38, PAL.honeyDark)
  // someone's spot: open notebook (cover, page stack, ribbon) + pen
  f.fill(46, 46, 12, 81, 46, 32, '#C9895E') // cover
  f.fill(48, 47, 14, 63, 47, 30, PAL.cream) // pages
  f.fill(64, 47, 14, 79, 47, 30, '#FFFDF4')
  f.fill(63, 47, 14, 64, 47, 30, PAL.honeyDark) // spine
  f.fill(68, 47, 18, 74, 47, 18, PAL.lavenderDeep)
  f.fill(67, 47, 22, 76, 47, 22, PAL.lavenderDeep)
  f.fill(70, 46, 32, 72, 46, 35, PAL.pinkDeep) // bookmark ribbon
  f.fill(88, 46, 20, 96, 46, 21, PAL.pinkDeep)
  f.cylinder(110, 22, 46, 55, 5, PAL.butter)
  f.carveCylinder(110, 22, 51, 55, 3.2)
  f.disc(110, 22, 51, 3.2, '#A8734A') // coffee resting inside
  f.fill(116, 49, 21, 118, 52, 23, PAL.butter)
  f.cylinder(140, 20, 46, 51, 4, PAL.terracotta)
  g.sphere(140, 54, 20, 3.6, PAL.mintDeep)
  // a closed laptop someone left
  f.roundedBox(180, 46, 14, 212, 48, 34, PAL.lavenderDeep)
  f.fill(194, 48, 22, 197, 48, 25, PAL.cream)
  f.cylinder(240, 22, 46, 54, 4.6, PAL.mint)
  f.carveCylinder(240, 22, 50, 54, 2.9)
  f.disc(240, 22, 50, 2.9, '#A8734A')
  // bar stools (legs voxel, seats smooth)
  const stoolAt = (sx: number, sz: number, top: string, deep: string, h = 28) => {
    group.add(puck(sx, sz, h - 1, 2, 12.5, deep))
    group.add(puck(sx, sz, h + 1, 2.4, 12, top))
    for (const [lx, lz] of [[sx - 7, sz - 7], [sx + 7, sz - 7], [sx - 7, sz + 7], [sx + 7, sz + 7]] as const)
      f.fill(lx, 0, lz, lx + 1, h - 1, lz + 1, PAL.honeyDark)
  }
  stoolAt(60, 54, PAL.lavender, PAL.lavenderDeep)
  stoolAt(150, 54, PAL.pink, PAL.pinkDeep)
  stoolAt(230, 54, PAL.mint, PAL.mintDeep)

  // ---------- big round rug (smooth discs, voxel heart motif) ----------
  const rugBase = new THREE.Mesh(new THREE.CircleGeometry(68 * VOX, 64), smoothMat(PAL.cream))
  rugBase.rotation.x = -Math.PI / 2
  rugBase.position.set(212 * VOX, 0.022, 152 * VOX)
  rugBase.receiveShadow = true
  group.add(rugBase)
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(61 * VOX, 68 * VOX, 64), smoothMat(PAL.pink))
  rugRing.rotation.x = -Math.PI / 2
  rugRing.position.set(212 * VOX, 0.028, 152 * VOX)
  rugRing.receiveShadow = true
  group.add(rugRing)
  const HEART = ['..##...##..', '.####.####.', '###########', '###########', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....']
  // heart motif on the open front-left of the rug (not clipped by the table base)
  HEART.forEach((row, i) => {
    for (let x = 0; x < row.length; x++)
      if (row[x] === '#') g.fill(166 + x * 3, 0, 168 + i * 3, 168 + x * 3, 0, 170 + i * 3, PAL.pinkDeep)
  })

  // ---------- study table (barista) ----------
  const roundTable = (cx: number, cz: number, r: number) => {
    group.add(puck(cx, cz, 39, 1.4, r - 1, PAL.honeyDark))
    group.add(puck(cx, cz, 40, 2, r, PAL.honey))
    group.add(puck(cx, cz, 2, 36, 4.4, PAL.honeyDark))
    f.fill(cx - 16, 0, cz - 3, cx + 16, 2, cz + 3, PAL.honeyDark)
    f.fill(cx - 3, 0, cz - 16, cx + 3, 2, cz + 16, PAL.honeyDark)
  }
  roundTable(212, 150, 34)

  // laptop
  f.roundedBox(196, 42, 136, 228, 42, 156, PAL.lavender)
  f.fill(198, 42, 138, 226, 42, 154, PAL.lavenderDeep)
  for (let y = 43; y <= 58; y++) {
    const zo = 157 + Math.floor((y - 43) / 5)
    f.fill(196, y, zo, 228, y, zo + 1, PAL.lavender)
  }
  f.fill(209, 49, 160, 215, 54, 160, PAL.cream) // sticker
  f.set(222, 58, 160, '#FFFFFF') // lid shine
  f.set(224, 57, 159, '#FFFFFF')

  // cup + saucer (smooth), fully on the tabletop, handle flush against the cup
  group.add(puck(232, 140, 42, 1.2, 9, PAL.trim))
  group.add(puck(232, 140, 43, 9, 6.2, PAL.cream))
  group.add(puck(232, 140, 52, 2, 6.2, PAL.pink)) // rim
  group.add(puck(232, 140, 52.2, 1.2, 4.7, '#8A5A3A')) // coffee, recessed below the rim
  const glint = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.07), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }))
  glint.position.set(231 * VOX, 53.6 * VOX, 139 * VOX)
  group.add(glint)
  f.fill(238, 46, 139, 240, 49, 141, PAL.cream)
  // napkin + pen
  f.fill(192, 42, 160, 204, 42, 172, PAL.pinkMilk)
  f.fill(194, 43, 174, 202, 43, 175, PAL.pinkDeep)
  // book stack with visible page edges
  f.fill(220, 42, 155, 236, 44, 169, PAL.mintDeep)
  f.fill(220, 43, 155, 236, 43, 169, '#FFF9EA')
  f.fill(222, 45, 157, 234, 47, 167, PAL.butter)
  f.fill(222, 46, 157, 234, 46, 167, '#FFF9EA')
  // pencil cup with pencils standing in a real opening
  f.cylinder(222, 128, 42, 50, 3.6, PAL.lavenderDeep)
  f.carveCylinder(222, 128, 47, 50, 2.2)
  f.fill(222, 47, 128, 222, 51, 128, PAL.pinkDeep)
  f.fill(220, 47, 127, 220, 51, 127, PAL.mintDeep)

  // barista chair
  group.add(puck(212, 106, 31, 1.6, 16.5, PAL.mint))
  group.add(puck(212, 106, 32.6, 2, 16, PAL.mintDeep))
  for (const [lx, lz] of [[202, 96], [222, 96], [202, 116], [222, 116]] as const)
    f.fill(lx, 0, lz, lx + 1, 31, lz + 1, PAL.honeyDark)
  f.fill(198, 34, 92, 226, 36, 94, PAL.mintDeep)
  f.fill(198, 36, 92, 199, 54, 94, PAL.mintDeep)
  f.fill(225, 36, 92, 226, 54, 94, PAL.mintDeep)
  f.fill(198, 54, 92, 226, 58, 94, PAL.mint)

  // guest stool at the study table
  stoolAt(212, 198, PAL.pink, PAL.pinkDeep)

  // ---------- second table (empty, waiting for a patron) ----------
  roundTable(340, 240, 26)
  f.fill(326, 42, 226, 357, 42, 248, '#C9895E') // open book: cover
  f.fill(328, 43, 228, 341, 43, 246, PAL.cream) // pages
  f.fill(342, 43, 228, 355, 43, 246, '#FFFDF4')
  f.fill(341, 43, 228, 342, 43, 246, PAL.honeyDark) // spine
  f.fill(333, 43, 234, 338, 43, 234, PAL.lavenderDeep) // notes
  f.fill(332, 43, 239, 339, 43, 239, PAL.lavenderDeep)
  f.fill(336, 42, 248, 338, 42, 251, PAL.pinkDeep) // ribbon
  f.cylinder(348, 254, 42, 51, 4.6, PAL.mint) // mug beside the book, on the table
  f.carveCylinder(348, 254, 47, 51, 2.9)
  f.disc(348, 254, 47, 2.9, '#A8734A')
  f.fill(353, 45, 253, 354, 48, 255, PAL.mint)
  stoolAt(340, 196, PAL.mint, PAL.mintDeep)
  stoolAt(340, 284, PAL.butter, '#EEC06A')

  // ---------- bookshelf (right, back wall) ----------
  f.fill(380, 0, 0, 444, 3, 20, PAL.honey)
  f.fill(380, 0, 0, 384, 104, 20, PAL.honey)
  f.fill(440, 0, 0, 444, 104, 20, PAL.honey)
  f.fill(380, 100, 0, 444, 104, 20, PAL.honey)
  f.fill(385, 28, 0, 439, 31, 20, PAL.honey)
  f.fill(385, 54, 0, 439, 57, 20, PAL.honey)
  f.fill(385, 78, 0, 439, 81, 20, PAL.honey)
  const spines = [PAL.pinkDeep, PAL.mintDeep, PAL.butter, PAL.lavenderDeep, PAL.denim, PAL.terracotta, PAL.leafB, PAL.pink, PAL.chromeDark]
  const shelfRows = [4, 32, 58, 82]
  shelfRows.forEach((sy, row) => {
    let x = 386
    let i = row * 3
    while (x < 435) {
      const w = 2 + ((x + row) % 3)
      const h = 16 + ((x * 3 + row * 5) % 7)
      f.fill(x, sy, 3, x + w, sy + h, 17, spines[i % spines.length])
      x += w + 2
      i++
    }
  })
  // shelf-top decor
  f.fill(388, 105, 6, 394, 107, 14, PAL.cream)
  f.cylinder(391, 10, 108, 114, 3, PAL.butter)
  f.fill(402, 105, 5, 414, 117, 7, PAL.trim)
  f.fill(404, 107, 8, 412, 115, 8, PAL.pinkMilk)
  f.cylinder(428, 12, 105, 111, 4.4, PAL.terracotta)
  g.sphere(428, 112, 12, 4.4, PAL.leafA)
  f.fill(433, 92, 18, 433, 106, 18, PAL.leafB)
  f.set(433, 90, 18, PAL.leafA)

  // ---------- floor lamp ----------
  f.disc(362, 40, 0, 8, PAL.honeyDark)
  f.fill(361, 1, 39, 362, 69, 40, PAL.honeyDark)

  // ---------- monstera ----------
  f.cylinder(428, 48, 0, 15, 11, PAL.terracotta)
  f.cylinder(428, 48, 15, 17, 12, PAL.terracotta)
  f.cylinder(428, 48, 17, 18, 9.6, PAL.soil)
  f.fill(428, 19, 48, 428, 40, 48, PAL.leafB)
  f.fill(420, 19, 43, 420, 33, 43, PAL.leafB)
  g.ellipsoid(414, 40, 40, 9, 4.4, 7, PAL.leafA)
  g.ellipsoid(437, 44, 52, 8, 4.4, 6.6, PAL.leafB)
  g.ellipsoid(424, 49, 56, 7.6, 3.6, 6, PAL.leafA)
  g.ellipsoid(436, 54, 42, 7, 3.6, 5.4, PAL.leafB)
  g.ellipsoid(422, 58, 46, 6, 3.2, 5, PAL.leafA)

  // ---------- armchair + side table (faces the room) ----------
  f.roundedBox(384, 2, 104, 432, 16, 152, PAL.mint)
  f.roundedBox(388, 16, 108, 428, 22, 148, PAL.mintDeep)
  f.roundedBox(424, 16, 104, 440, 50, 152, PAL.mint)
  f.fill(426, 50, 108, 438, 52, 148, PAL.mintDeep)
  f.roundedBox(384, 16, 96, 436, 30, 104, PAL.mint)
  f.roundedBox(384, 16, 152, 436, 30, 160, PAL.mint)
  f.roundedBox(414, 22, 116, 428, 38, 140, PAL.pinkMilk)
  f.fill(420, 29, 115, 421, 30, 115, PAL.pinkDeep)
  // side table with a mug
  group.add(puck(356, 128, 25, 1.2, 9, PAL.honeyDark))
  group.add(puck(356, 128, 26, 1.6, 9.4, PAL.honey))
  group.add(puck(356, 128, 0, 1.2, 5, PAL.honeyDark))
  group.add(puck(356, 128, 1, 25, 2, PAL.honeyDark))
  group.add(puck(356, 128, 27.6, 7, 4, PAL.pink))
  group.add(puck(356, 128, 33.4, 1, 2.8, '#8A5A3A')) // open top

  // ---------- umbrella stand + standing sign (by the door) ----------
  f.cylinder(12, 100, 0, 18, 6, PAL.cream)
  f.ring(12, 100, 18, 6, 4, PAL.trim)
  f.carveCylinder(12, 100, 7, 17, 4)
  f.fill(10, 18, 96, 11, 40, 97, PAL.pinkDeep)
  f.set(10, 41, 98, PAL.pinkDeep)
  f.fill(14, 18, 102, 15, 34, 103, PAL.mintDeep)
  f.set(14, 35, 104, PAL.mintDeep)
  // sign
  f.fill(16, 0, 76, 18, 4, 88, PAL.honeyDark)
  f.fill(16, 4, 78, 17, 30, 86, PAL.cream)
  f.fill(16, 5, 78, 16, 30, 86, PAL.honeyDark)
  f.fill(17, 22, 80, 17, 24, 84, PAL.pinkDeep)
  f.fill(17, 16, 80, 17, 17, 84, PAL.mintDeep)
  f.fill(17, 10, 80, 17, 11, 84, PAL.butter)

  // ---------- fairy-light wire (right wall section, over chalkboard + corkboard) ----------
  for (let x = 294; x < 442; x++) {
    const dipY = 113 - Math.round(2.6 * Math.abs(Math.sin(((x - 294) / 30) * Math.PI)))
    g.set(x, dipY, 0, PAL.wire)
  }

  // ---------- runner rug along the counter ----------
  for (let x = 56; x <= 84; x++)
    for (let z = 132; z <= 252; z++) {
      const edge = x <= 58 || x >= 82 || z <= 134 || z >= 250
      g.set(x, 0, z, edge ? PAL.mintDeep : (x + z) % 2 === 0 ? PAL.mint : '#B8E6D4')
    }

  const roomMesh = g.build({ noBottom: true })
  roomMesh.scale.setScalar(VOX)
  group.add(roomMesh)

  const furnMesh = f.build({ noBottom: true })
  furnMesh.scale.setScalar(VOX)
  group.add(outlined(furnMesh))

  // floor-lamp shade: smooth cone with drivable emissive
  const lampShadeMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(PAL.mustard).convertSRGBToLinear(),
    emissive: new THREE.Color(PAL.mustard).convertSRGBToLinear(),
    emissiveIntensity: 0.06,
  })
  group.add(cone(362, 40, 70, 18, 13, 5.5, lampShadeMat))
  group.add(puck(362, 40, 68.6, 1.4, 8.4, PAL.butter))

  // ---------- ceiling lights: an even, INVISIBLE grid (every café has them;
  // the fixed camera never sees a ceiling, so no fixtures are drawn) ----------
  const pendantPositions: THREE.Vector3[] = []
  for (const px of [75, 220, 365])
    for (const pz of [80, 230])
      pendantPositions.push(new THREE.Vector3(px * VOX, 108 * VOX, pz * VOX))

  // ================= glass / sky / rain =================
  const glassMat = new THREE.MeshBasicMaterial({ color: '#CCDEEE', transparent: true, opacity: 0.15, depthWrite: false })
  for (const cxw of [5.25, 13.75]) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 3.6), glassMat)
    glass.position.set(cxw, 4.9, -0.55)
    group.add(glass)
  }

  const skyMat = new THREE.MeshBasicMaterial({ color: '#B7D0E8' })
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(24, 5), skyMat)
  sky.position.set(9.5, 2.5, -2.8)
  group.add(sky)
  const roofMat = new THREE.MeshBasicMaterial({ color: '#97AECB' })
  const roofs = new THREE.Group()
  const roofHeights = [1.8, 2.8, 2.3, 3.2, 2.0, 2.6, 3.0, 2.2]
  roofHeights.forEach((h, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.3, h, 0.4), roofMat)
    b.position.set(0.8 + i * 2.4, 1.2 + h / 2, -2.3)
    roofs.add(b)
  })
  group.add(roofs)

  const RAIN_N = 200
  const rainPos = new Float32Array(RAIN_N * 2 * 3)
  const rainSeed: { x: number; z: number; y: number; sp: number }[] = []
  for (let i = 0; i < RAIN_N; i++)
    rainSeed.push({ x: 1 + Math.random() * 17, z: -1.3 - Math.random() * 1.2, y: 1.5 + Math.random() * 3.5, sp: 6 + Math.random() * 4 })
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rainMat = new THREE.LineBasicMaterial({ color: '#E8F1FA', transparent: true, opacity: 0.55 })
  group.add(new THREE.LineSegments(rainGeo, rainMat))
  updaters.push((dt) => {
    for (let i = 0; i < RAIN_N; i++) {
      const d = rainSeed[i]
      d.y -= d.sp * dt
      if (d.y < 1.5) d.y = 5.0
      rainPos[i * 6] = d.x
      rainPos[i * 6 + 1] = d.y
      rainPos[i * 6 + 2] = d.z
      rainPos[i * 6 + 3] = d.x
      rainPos[i * 6 + 4] = d.y + 0.35
      rainPos[i * 6 + 5] = d.z
    }
    rainGeo.attributes.position.needsUpdate = true
  })

  // fairy bulbs
  const fairyColors = ['#FF9EBB', '#9FE8CF', '#FFDE8A', '#CDBAFF']
  const fairyMats: THREE.MeshBasicMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: fairyColors[i % 4] })
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), mat)
    const wx = 306 + i * 25
    const dipY = 113 - 2.6 * Math.abs(Math.sin(((wx - 294) / 30) * Math.PI))
    bulb.position.set(wx * VOX, (dipY - 2.5) * VOX, 0.09)
    group.add(bulb)
    fairyMats.push(mat)
  }

  // barista laptop screen glow
  const screenMat = new THREE.MeshBasicMaterial({ color: '#EAF6FF' })
  const screen1 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), screenMat)
  screen1.position.set(13.25, 3.1, 9.85)
  screen1.rotation.y = Math.PI
  screen1.rotation.x = -0.2
  group.add(screen1)

  // steam over the cup
  const steamTex = blobTexture()
  const steamSprites: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false }))
    group.add(s)
    steamSprites.push(s)
  }
  updaters.push((_, t) => {
    steamSprites.forEach((s, i) => {
      const p = ((t * 0.32 + i / 3) % 1 + 1) % 1
      s.position.set(14.5 + Math.sin((p + i) * 6) * 0.1, 3.45 + p * 1.0, 8.75)
      ;(s.material as THREE.SpriteMaterial).opacity = 0.34 * Math.sin(p * Math.PI)
      s.scale.setScalar(0.22 + p * 0.34)
    })
  })

  // ================= barista =================
  const barista = buildPerson({ hair: PAL.hairCocoa, sweater: PAL.pink, sweaterDeep: PAL.pinkDeep })
  barista.group.position.set(212 * VOX, 35 * VOX, 106 * VOX)
  group.add(barista.group)

  let blinkT = 2.5
  updaters.push((dt, t) => {
    barista.armL.rotation.x = 0.55 + Math.sin(t * 13) * 0.07
    barista.armR.rotation.x = 0.55 + Math.sin(t * 13 + Math.PI) * 0.07
    barista.headGroup.position.y = 10 * VOX + 0.05 + Math.sin(t * 2) * 0.02
    barista.headGroup.rotation.z = Math.sin(t * 1.2) * 0.02
    blinkT -= dt
    if (blinkT < 0) blinkT = 2 + Math.random() * 3.5
    const b = blinkT < 0.12 ? 0.1 : 1
    barista.eyeL.scale.y = b
    barista.eyeR.scale.y = b
  })

  // ================= cat (small: ~0.75 world curled) =================
  const cat = new THREE.Group()
  const cushMesh = puck(0, 0, 0, 2.4, 15, PAL.lavender)
  cat.add(cushMesh)
  const cushRing = new THREE.Mesh(new THREE.RingGeometry(12.4 * VOX, 15 * VOX, 48), smoothMat(PAL.lavenderDeep))
  cushRing.rotation.x = -Math.PI / 2
  cushRing.position.y = 2.4 * VOX + 0.004
  cat.add(outlined(cushRing))

  // a simple sitting voxel cat, built in the same language as the people:
  // box body, chibi box head, line eyes, pink nose — nothing more
  const catBodyGroup = new THREE.Group()
  const cb = new VoxelGrid()
  cb.roundedBox(-5, 0, -4, 4, 7, 3, PAL.catBody) // sitting body
  cb.fill(-4, 0, 3, -3, 1, 4, PAL.catBody) // front paws
  cb.fill(2, 0, 3, 3, 1, 4, PAL.catBody)
  cb.fill(-2, 0, 3, 1, 3, 3, '#FFF9EA') // chest bib
  cb.fill(4, 2, -3, 4, 4, -2, PAL.catPatch) // side stripes
  cb.fill(4, 3, 0, 4, 5, 1, PAL.catPatch)
  cb.roundedBox(-6, 8, -5, 5, 16, 4, PAL.catBody) // chibi head, wider than body
  cb.roundedBox(-5, 17, -4, 4, 17, 3, PAL.catBody) // crown step — rounder top
  cb.fill(-2, 9, 4, 1, 11, 4, '#FFF9EA') // lighter muzzle around the nose
  cb.fill(-5, 18, -3, -3, 18, -1, PAL.catPatch) // ears (on the crown step)
  cb.set(-4, 19, -2, PAL.catPatch)
  cb.fill(2, 18, -3, 4, 18, -1, PAL.catBody)
  cb.set(3, 19, -2, PAL.catBody)
  cb.set(-4, 18, -1, PAL.pink) // inner-ear pixels
  cb.set(3, 18, -1, PAL.pink)
  cb.fill(-6, 10, -5, -4, 13, -2, PAL.catPatch) // patch over one side of the head
  const catBodyMesh = cb.build()
  catBodyMesh.scale.setScalar(VOX)
  catBodyGroup.add(catBodyMesh)
  // line eyes + nose, same as the people
  const catEyeMat = new THREE.MeshBasicMaterial({ color: PAL.dark })
  const catEyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.04), catEyeMat)
  const catEyeR = catEyeL.clone()
  catEyeL.position.set(-0.21, 0.76, 0.33)
  catEyeR.position.set(0.15, 0.76, 0.33)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: PAL.pinkDeep }))
  nose.position.set(-0.03, 0.65, 0.33)
  catBodyGroup.add(catEyeL, catEyeR, nose)
  catBodyGroup.position.y = 2.4 * VOX
  cat.add(outlined(catBodyGroup))
  // simple voxel tail: out and up
  const tail = new THREE.Group()
  const tv = new VoxelGrid()
  tv.fill(0, 0, 0, 1, 1, 4, PAL.catPatch)
  tv.fill(0, 1, 4, 1, 5, 5, PAL.catPatch)
  tv.fill(0, 5, 4, 1, 6, 5, PAL.catBody)
  const tailMesh = tv.build()
  tailMesh.scale.setScalar(VOX)
  tail.add(tailMesh)
  tail.position.set(0.26, 2.4 * VOX, -0.5)
  cat.add(outlined(tail))

  cat.position.set(100 * VOX, 0, 216 * VOX)
  cat.rotation.y = 0.42
  group.add(cat)
  updaters.push((_, t) => {
    catBodyGroup.scale.y = 1 + Math.sin(t * 1.5) * 0.03
    tail.rotation.y = Math.sin(t * 0.8) * 0.16
  })

  // ================= ground shadow =================
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ opacity: 0.12 }))
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = -6 * VOX - 0.01
  shadowPlane.receiveShadow = true
  group.add(shadowPlane)

  return {
    group,
    avatarMeshes: barista.meshes,
    catMeshes: [catBodyMesh, cushMesh, tailMesh],
    lampPos: new THREE.Vector3(22.6, 4.6, 2.5),
    screenGlowPos: new THREE.Vector3(13.25, 3.0, 9.2),
    pendantPositions,
    skyMat,
    rainMat,
    glassMat,
    fairyMats,
    screenMat,
    lampShadeMat,
    update: (dt, t) => updaters.forEach((u) => u(dt, t)),
  }
}
