// Shared chibi person builder + idle animation, used by the showcase barista,
// the seated player, and simulated patrons.
import * as THREE from 'three'
import { VoxelGrid } from './voxel'
import { PAL, VOX, OUTLINE_LAYER } from './build'

export interface PersonOpts {
  hair: string
  sweater: string
  sweaterDeep: string
  skin?: string
  hairStyle?: 'short' | 'long'
  glasses?: boolean
  /** Wardrobe hat id (see HATS) — worn everywhere you go. */
  hat?: string
}

// ---------- the wardrobe: hats (bought at the boutique, docs/ECONOMY.md) ----------
// Drawn on the head grid: x 0..16 (8 = center), z 0..15 (15 = face),
// the crown tops out at y 13.
export const HATS: { id: string; name: string; price: number; draw: (g: VoxelGrid) => void }[] = [
  {
    id: 'beret', name: 'beret', price: 200,
    draw(g) {
      g.fill(1, 14, 2, 15, 15, 13, '#C24545')
      g.fill(3, 16, 4, 13, 16, 11, '#C24545') // the puff
      g.fill(7, 17, 7, 9, 17, 8, '#963A3A') // the little stem
    },
  },
  {
    id: 'beanie', name: 'beanie', price: 180,
    draw(g) {
      g.fill(1, 12, 1, 15, 14, 14, '#7CC9AC') // fold band (sits low)
      g.fill(2, 15, 2, 14, 16, 13, '#8FD4B8') // dome
      g.fill(4, 17, 4, 12, 17, 11, '#8FD4B8')
      g.fill(7, 18, 6, 9, 19, 9, '#FFF6E4') // pompom
    },
  },
  {
    id: 'cat-ears', name: 'cat ears', price: 400,
    draw(g) {
      // a soft hood band with two little ears
      g.fill(1, 13, 1, 15, 14, 14, '#4A3A30')
      g.fill(2, 15, 3, 5, 17, 7, '#4A3A30') // left ear
      g.fill(3, 15, 4, 4, 16, 6, '#FFB3C7') // inner
      g.fill(11, 15, 3, 14, 17, 7, '#4A3A30') // right ear
      g.fill(12, 15, 4, 13, 16, 6, '#FFB3C7')
    },
  },
  {
    id: 'flower-clip', name: 'flower clip', price: 150,
    draw(g) {
      g.fill(13, 12, 10, 15, 14, 12, '#FFF6E4') // petals
      g.set(14, 13, 11, '#FFD98E') // the heart
      g.set(12, 13, 11, '#FFF6E4')
      g.set(15, 12, 10, '#FFF6E4')
    },
  },
  {
    id: 'mushroom-cap', name: 'mushroom cap', price: 320,
    draw(g) {
      g.fill(0, 14, 1, 16, 15, 14, '#D95555') // wide cap brim
      g.fill(1, 16, 2, 15, 17, 13, '#D95555')
      g.fill(4, 18, 4, 12, 18, 11, '#D95555')
      g.fill(3, 16, 4, 5, 17, 6, '#FFF6E4') // spots
      g.fill(11, 16, 9, 13, 17, 11, '#FFF6E4')
      g.fill(7, 18, 6, 8, 18, 7, '#FFF6E4')
    },
  },
  {
    id: 'paper-crown', name: 'paper crown', price: 260,
    draw(g) {
      g.fill(2, 13, 2, 14, 14, 13, '#E8C25A')
      for (let x = 2; x <= 14; x += 3) g.fill(x, 15, 2, x + 1, 16, 3, '#E8C25A') // front points
      for (let x = 2; x <= 14; x += 3) g.fill(x, 15, 12, x + 1, 16, 13, '#E8C25A') // back points
      g.set(8, 14, 2, '#FF8FAF') // the jewel
    },
  },
]
export const HAT_IDS = new Set(HATS.map((h) => h.id))

// tag charms: a little glyph before your name, everywhere it floats
export const CHARMS: { id: string; glyph: string; name: string; price: number }[] = [
  { id: 'charm-star', glyph: '✦', name: 'star', price: 120 },
  { id: 'charm-moon', glyph: '☾', name: 'moon', price: 120 },
  { id: 'charm-bloom', glyph: '⚘', name: 'bloom', price: 120 },
  { id: 'charm-heart', glyph: '♥', name: 'heart', price: 120 },
  { id: 'charm-note', glyph: '♬', name: 'note', price: 120 },
]
export const CHARM_GLYPHS = new Set(CHARMS.map((c) => c.glyph))

export type Pose = 'sit' | 'stand'

export interface Person {
  group: THREE.Group
  headGroup: THREE.Group
  eyeL: THREE.Mesh
  eyeR: THREE.Mesh
  meshes: THREE.Object3D[]
  armL: THREE.Group
  armR: THREE.Group
  /** Rest height of the head group (differs by pose). */
  headY: number
  pose: Pose
}

/** Chibi person (~2 world units), local voxels, facing +z.
 *  'sit': origin at the seat top center. 'stand': origin at the floor. */
export function buildPerson(opts: PersonOpts, pose: Pose = 'sit'): Person {
  const group = new THREE.Group()
  const meshes: THREE.Object3D[] = []
  const standing = pose === 'stand'
  const torsoY = standing ? 10 : 0 // legs lift the torso when standing

  const body = new VoxelGrid()
  if (standing) {
    // little legs + shoes
    body.fill(-5, 0, -2, -1, 10, 1, PAL.denim)
    body.fill(0, 0, -2, 4, 10, 1, PAL.denim)
    body.fill(-5, 0, 1, -1, 1, 4, '#FFFFFF')
    body.fill(0, 0, 1, 4, 1, 4, '#FFFFFF')
  } else {
    // lap / thighs / shoes — compact
    body.fill(-5, -3, -3, 4, 0, 6, PAL.denim)
    body.fill(-5, -5, 5, -3, -3, 8, '#FFFFFF')
    body.fill(2, -5, 5, 4, -3, 8, '#FFFFFF')
  }
  // small chibi torso: the head should dominate
  body.roundedBox(-6, torsoY, -4, 5, torsoY + 8, 3, opts.sweater)
  body.fill(-6, torsoY + 8, -4, 5, torsoY + 9, 3, opts.sweater)
  body.carve(-6, torsoY + 8, -4, -6, torsoY + 9, 3)
  body.carve(5, torsoY + 8, -4, 5, torsoY + 9, 3)
  body.carve(-5, torsoY + 9, -4, -5, torsoY + 9, 3)
  body.carve(4, torsoY + 9, -4, 4, torsoY + 9, 3)
  for (let x = -5; x <= 4; x++) {
    body.set(x, torsoY, 3, opts.sweaterDeep)
    body.set(x, torsoY + 1, 3, opts.sweaterDeep)
  }
  const bodyMesh = body.build()
  bodyMesh.scale.setScalar(VOX)
  bodyMesh.position.set(VOX / 2, 0, 0)
  group.add(bodyMesh)
  meshes.push(bodyMesh)

  const skin = opts.skin ?? PAL.skin
  // the crown highlight follows the hair color (a fixed brown looks like a bald spot on dyed hair)
  const hairHi = `#${new THREE.Color(opts.hair).lerp(new THREE.Color('#FFFFFF'), 0.22).getHexString()}`

  // head 17 x 13 x 16 — compact chibi: short crown, low bangs, side locks
  const headGroup = new THREE.Group()
  const hd = new VoxelGrid()
  hd.roundedBox(0, 0, 0, 16, 12, 15, skin)
  hd.roundedBox(0, 9, 0, 16, 12, 15, opts.hair)
  hd.roundedBox(1, 13, 1, 15, 13, 14, opts.hair) // single low crown step
  hd.fill(5, 13, 4, 11, 13, 11, hairHi) // crown highlight
  hd.fill(0, 0, 0, 16, 8, 5, opts.hair) // back of head
  hd.fill(0, 3, 0, 1, 8, 15, opts.hair) // sides
  hd.fill(15, 3, 0, 16, 8, 15, opts.hair)
  // bangs low on the brow with a soft scallop
  for (let x = 2; x <= 14; x++) {
    hd.fill(x, 7, 15, x, 8, 15, opts.hair)
    if (Math.abs(x - 8) % 3 !== 2) hd.set(x, 6, 15, opts.hair)
  }
  // side locks framing the face
  hd.fill(2, 2, 15, 3, 5, 15, opts.hair)
  hd.fill(13, 2, 15, 14, 5, 15, opts.hair)
  hd.fill(4, 1, 15, 5, 2, 15, PAL.blush)
  hd.fill(11, 1, 15, 12, 2, 15, PAL.blush)
  hd.set(8, 1, 15, '#E08A7A') // little mouth
  if (opts.hairStyle === 'long') {
    // a soft curtain of hair falling down the back, tapered at the ends
    hd.fill(1, -7, 0, 15, -1, 4, opts.hair)
    hd.fill(3, -10, 0, 13, -8, 3, opts.hair)
    hd.fill(0, -4, 12, 1, -1, 15, opts.hair) // front strands
    hd.fill(15, -4, 12, 16, -1, 15, opts.hair)
  }
  // the hat rides the same grid so it turns and bobs with the head
  const hat = HATS.find((h) => h.id === opts.hat)
  if (hat) hat.draw(hd)
  const headMesh = hd.build()
  headMesh.scale.setScalar(VOX)
  headMesh.position.set(-17 * VOX / 2, 0, -16 * VOX / 2)
  headGroup.add(headMesh)
  meshes.push(headMesh)

  // eyes: simple vertical lines — calm and cute, never staring
  const eyeMat = new THREE.MeshBasicMaterial({ color: PAL.dark })
  function makeEye(): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.05), eyeMat)
  }
  const eyeL = makeEye()
  const eyeR = makeEye()
  eyeL.position.set(-0.26, 0.22, 16 * VOX / 2 + 0.01)
  eyeR.position.set(0.26, 0.22, 16 * VOX / 2 + 0.01)
  headGroup.add(eyeL, eyeR)
  meshes.push(eyeL, eyeR)

  if (opts.glasses) {
    const rimMat = new THREE.MeshBasicMaterial({ color: '#4A3A30' })
    const fz = 16 * VOX / 2 + 0.018
    const rim = (cx: number) => {
      const parts: [number, number, number, number][] = [
        [cx, 0.36, 0.36, 0.045], // top
        [cx, 0.08, 0.36, 0.045], // bottom
        [cx - 0.16, 0.22, 0.045, 0.33], // left
        [cx + 0.16, 0.22, 0.045, 0.33], // right
      ]
      for (const [x, y, w, h] of parts) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), rimMat)
        m.position.set(x, y, fz)
        headGroup.add(m)
        meshes.push(m)
      }
    }
    rim(-0.26)
    rim(0.26)
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.02), rimMat)
    bridge.position.set(0, 0.3, fz)
    headGroup.add(bridge)
    meshes.push(bridge)
  }

  const headY = (standing ? 20 : 10) * VOX + 0.05
  headGroup.position.set(0, headY, 0)
  group.add(headGroup)

  const mk = () => {
    const g = new THREE.Group()
    const av = new VoxelGrid()
    av.fill(0, 0, 0, 1, 1, 6, opts.sweater)
    av.fill(0, 0, 7, 1, 1, 9, skin)
    const m = av.build()
    m.scale.setScalar(VOX)
    m.position.set(-1 * VOX, -1 * VOX, 0)
    g.add(m)
    meshes.push(m)
    return g
  }
  const armL = mk()
  const armR = mk()
  const armY = (standing ? 17 : 7) * VOX
  const armRest = standing ? 1.35 : 0.55 // hanging vs on the table
  armL.position.set(-0.4, armY, standing ? VOX : 3 * VOX)
  armR.position.set(0.4, armY, standing ? VOX : 3 * VOX)
  armL.rotation.x = armRest
  armR.rotation.x = armRest
  group.add(armL, armR)

  meshes.forEach((m) => m.traverse((o) => o.layers.enable(OUTLINE_LAYER)))
  return { group, headGroup, eyeL, eyeR, meshes, armL, armR, headY, pose }
}

/** Returns an update(dt, t) that runs the seated working/bobbing/blinking idle.
 *  Kept mild: slow small arm movement, gentle head bob. */
export function makeAnimator(p: Person, phase = 0, speed = 4): (dt: number, t: number) => void {
  let blinkT = 2 + Math.random() * 3
  return (dt: number, t: number) => {
    p.armL.rotation.x = 0.55 + Math.sin(t * speed + phase) * 0.035
    p.armR.rotation.x = 0.55 + Math.sin(t * speed + phase + Math.PI) * 0.035
    p.headGroup.position.y = p.headY + Math.sin(t * 1.4 + phase) * 0.014
    p.headGroup.rotation.z = Math.sin(t * 0.8 + phase) * 0.015
    blinkT -= dt
    if (blinkT < 0) blinkT = 2 + Math.random() * 3.5
    const b = blinkT < 0.12 ? 0.1 : 1
    p.eyeL.scale.y = b
    p.eyeR.scale.y = b
  }
}

/** Standing idle: soft breath bob, tiny sway, hanging arms, blinking. */
export function makeIdleAnimator(p: Person, phase = 0): (dt: number, t: number) => void {
  let blinkT = 2 + Math.random() * 3
  return (dt: number, t: number) => {
    const breathe = Math.sin(t * 1.1 + phase)
    p.headGroup.position.y = p.headY + breathe * 0.012
    p.headGroup.rotation.z = Math.sin(t * 0.5 + phase) * 0.018
    p.armL.rotation.x = 1.35 + breathe * 0.02
    p.armR.rotation.x = 1.35 + Math.sin(t * 1.1 + phase + Math.PI) * 0.02
    blinkT -= dt
    if (blinkT < 0) blinkT = 2 + Math.random() * 3.5
    const b = blinkT < 0.12 ? 0.1 : 1
    p.eyeL.scale.y = b
    p.eyeR.scale.y = b
  }
}
