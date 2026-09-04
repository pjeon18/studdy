// CHARACTER PROPORTION LAB — dev-only, the game is untouched. Explores taller
// chibi bodies (real legs, hanging arms) against the current build, in the
// same voxel language, with the SAME head. Every variant is shown standing
// AND seated at real game furniture, because seat (1.78) and tabletop (2.375)
// heights are the constraints a new body has to live with.
import * as THREE from 'three'
import { VoxelGrid } from '../voxel'
import { PAL, VOX, setToonRamp } from '../build'
import { buildShell } from '../shell'
import { buildItem } from '../items'
import { buildPerson, makeAnimator, makeIdleAnimator, type PersonOpts } from '../people'
import type { RoomDoc } from '../types'

// the game's day ramp so materials read exactly like in-game
setToonRamp([0.36, 0.29, 0.88, 0.56, 0.5, 0.98, 1.0, 0.94, 0.86, 1.16, 1.08, 0.92])

// ---------- the experimental body ----------
// Same 17-wide head as the game; only the body below changes.
interface Proportions {
  /** standing leg height in voxels (current build: 10, fused) */
  leg: number
  torsoW: number
  torsoH: number
  torsoD: number
  /** hanging side-arm thickness in voxels (0 = keep nub arms off) */
  arm: number
}

interface LabPerson {
  group: THREE.Group
  headGroup: THREE.Group
  eyeL: THREE.Mesh
  eyeR: THREE.Mesh
  headY: number
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex).multiplyScalar(f)
  return `#${c.getHexString()}`
}

// The experimental head: same 17×14×16 footprint and palette, but the volume
// is a voxel superellipsoid (a rounded cube) — soft crown, chamfered corners,
// round jaw. Changes from the game head, per Paul's notes: no crown highlight
// patch, no side locks or low bang scallops touching the face, no front
// strands on the long style. Features (fringe, blush, mouth) are painted on
// the curved front SURFACE instead of a flat z=15 plane.
function buildHeadV2(opts: PersonOpts): VoxelGrid {
  const g = new VoxelGrid()
  const skin = opts.skin ?? PAL.skin
  const N = 2.8 // 2 = egg, ∞ = box; 2.8 keeps voxel-cube character with soft corners
  const cx = 8
  const cy = 6.6
  const cz = 7.5
  const rx = 8.9
  const ry = 7.6
  const rz = 8.4
  const inside = (x: number, y: number, z: number) =>
    Math.abs((x - cx) / rx) ** N + Math.abs((y - cy) / ry) ** N + Math.abs((z - cz) / rz) ** N <= 1
  for (let x = 0; x <= 16; x++)
    for (let y = 0; y <= 13; y++)
      for (let z = 0; z <= 15; z++) {
        if (!inside(x, y, z)) continue
        // side hair stays BEHIND the face (z <= 10): at eye level the columns
        // beside the face are skin, so no hair pixel ever touches the eyes
        const hair = y >= 9 || z <= 5 || ((x <= 1 || x >= 15) && y >= 3 && z <= 10)
        g.set(x, y, z, hair ? opts.hair : skin)
      }
  /** Nearest-to-camera occupied cell in a front column (the curved face). */
  const front = (x: number, y: number) => {
    for (let z = 15; z >= 8; z--) if (g.has(x, y, z)) return z
    return -1
  }
  // a clean straight fringe, two rows above the eyes — nothing dips to the cheeks
  for (let x = 0; x <= 16; x++)
    for (const y of [7, 8]) {
      const z = front(x, y)
      if (z >= 0) g.set(x, y, z, opts.hair)
    }
  for (const [bx, by] of [[4, 1], [5, 1], [4, 2], [5, 2], [11, 1], [12, 1], [11, 2], [12, 2]] as const) {
    const z = front(bx, by)
    if (z >= 0) g.set(bx, by, z, PAL.blush)
  }
  const mz = front(8, 1)
  if (mz >= 0) g.set(8, 1, mz, '#E08A7A')
  if (opts.hairStyle === 'long') {
    // the back curtain only — no face-framing front strands
    g.fill(2, -7, 0, 14, -1, 3, opts.hair)
    g.fill(4, -10, 0, 12, -8, 2, opts.hair)
  }
  return g
}

function buildPersonV2(opts: PersonOpts, pose: 'sit' | 'stand', P: Proportions): LabPerson {
  const group = new THREE.Group()
  const skin = opts.skin ?? PAL.skin
  const deep = opts.sweaterDeep ?? shade(opts.sweater, 0.78)
  const body = new VoxelGrid()

  const hxL = -Math.floor(P.torsoW / 2) // torso x range [hxL .. hxL+torsoW-1]
  const hxR = hxL + P.torsoW - 1
  const hzL = -Math.floor(P.torsoD / 2)
  const hzR = hzL + P.torsoD - 1
  // two separate legs with a gap between them (the current build fuses them)
  const legW = Math.floor((P.torsoW - 4) / 2)
  const legLx = hxL + 1
  const legRx = hxR - legW

  let torsoY0: number
  if (pose === 'stand') {
    torsoY0 = P.leg
    for (const lx of [legLx, legRx]) {
      body.fill(lx, 0, hzL + 1, lx + legW - 1, P.leg - 1, hzR - 1, PAL.denim)
      // the current build's sneaker: a chunky white toe box poking forward
      body.fill(lx, 0, hzR - 2, lx + legW - 1, 1, hzR + 2, '#FFFFFF')
    }
  } else {
    // origin = cushion top. Thighs rest on it, calves dangle in front,
    // feet hang free (reference chibis dangle — stools are tall to them).
    torsoY0 = 3
    for (const lx of [legLx, legRx]) {
      body.fill(lx, 0, hzL + 1, lx + legW - 1, 2, hzR + 5, PAL.denim) // thighs forward
      body.fill(lx, -8, hzR + 3, lx + legW - 1, -1, hzR + 5, PAL.denim) // calves down
      body.fill(lx, -10, hzR + 4, lx + legW - 1, -9, hzR + 8, '#FFFFFF') // sneaker toe boxes
    }
  }

  // torso: taller than wide, soft corners, deep-tone hem
  body.roundedBox(hxL, torsoY0, hzL, hxR, torsoY0 + P.torsoH - 1, hzR, opts.sweater)
  body.carve(hxL, torsoY0 + P.torsoH - 1, hzL, hxL, torsoY0 + P.torsoH - 1, hzR) // sloped shoulders
  body.carve(hxR, torsoY0 + P.torsoH - 1, hzL, hxR, torsoY0 + P.torsoH - 1, hzR)
  for (let x = hxL; x <= hxR; x++) {
    body.set(x, torsoY0, hzR, deep)
    body.set(x, torsoY0 + 1, hzR, deep)
  }

  // hanging arms outside the torso, skin hands at the ends
  if (P.arm > 0) {
    const armTop = torsoY0 + P.torsoH - 3
    const armBot = pose === 'stand' ? torsoY0 - 4 : torsoY0 - 1
    const az0 = hzL + Math.floor((P.torsoD - P.arm) / 2)
    for (const ax of [hxL - P.arm, hxR + 1]) {
      body.fill(ax, armBot + 2, az0, ax + P.arm - 1, armTop, az0 + P.arm - 1, opts.sweater)
      body.fill(ax, armBot, az0, ax + P.arm - 1, armBot + 1, az0 + P.arm - 1, skin)
    }
  }

  const bodyMesh = body.build()
  bodyMesh.scale.setScalar(VOX)
  bodyMesh.position.set(VOX / 2, 0, 0)
  group.add(bodyMesh)

  // the rounded experimental head, riding higher. AO off + low jitter: on a
  // curved voxel surface every rounding step is a crevice, and the default
  // shading paints dark bands across the hair.
  const headGroup = new THREE.Group()
  const hd = buildHeadV2(opts)
  const headMesh = hd.build({ ao: false, jitter: 0.005 })
  headMesh.scale.setScalar(VOX)
  headMesh.position.set((-17 * VOX) / 2, 0, (-16 * VOX) / 2)
  headGroup.add(headMesh)
  const eyeMat = new THREE.MeshBasicMaterial({ color: PAL.dark })
  const mkEye = () => new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.05), eyeMat)
  const eyeL = mkEye()
  const eyeR = mkEye()
  eyeL.position.set(-0.26, 0.22, (16 * VOX) / 2 + 0.01)
  eyeR.position.set(0.26, 0.22, (16 * VOX) / 2 + 0.01)
  headGroup.add(eyeL, eyeR)
  const headY = (torsoY0 + P.torsoH) * VOX + 0.05
  headGroup.position.set(0, headY, 0)
  group.add(headGroup)

  return { group, headGroup, eyeL, eyeR, headY }
}

/** Soft breathe + blink for the experimental bodies (their arms are voxels,
 *  so the game's arm-swing animators don't apply). */
function labAnimator(p: LabPerson, phase = 0): (dt: number, t: number) => void {
  let blinkT = 2 + Math.random() * 3
  return (dt, t) => {
    p.headGroup.position.y = p.headY + Math.sin(t * 1.2 + phase) * 0.013
    p.headGroup.rotation.z = Math.sin(t * 0.6 + phase) * 0.016
    blinkT -= dt
    if (blinkT < 0) blinkT = 2 + Math.random() * 3.5
    const b = blinkT < 0.12 ? 0.1 : 1
    p.eyeL.scale.y = b
    p.eyeR.scale.y = b
  }
}

// ---------- the stage: one wide room, four stations ----------
const room: RoomDoc = {
  w: 27,
  d: 10,
  floor: 'honey',
  wallStyle: 'cream',
  openings: [
    { id: 'w1', wall: 'back', kind: 'window', start: 2, width: 4 },
    { id: 'w2', wall: 'back', kind: 'window', start: 9, width: 4 },
    { id: 'w3', wall: 'back', kind: 'window', start: 16, width: 4 },
    { id: 'w4', wall: 'back', kind: 'window', start: 23, width: 3 },
  ],
}
const scene = new THREE.Scene()
scene.background = new THREE.Color('#B8E4F6')
scene.add(buildShell(room).group)

const animators: ((dt: number, t: number) => void)[] = []

function furnish(x: number) {
  const table = buildItem('table-s', 'honey')
  table.group.position.set(x, 0, 4.6)
  scene.add(table.group)
  const stool = buildItem('stool', 'pink')
  stool.group.position.set(x - 1.7, 0, 4.6)
  scene.add(stool.group)
  const mug = buildItem('mug')
  mug.group.position.set(x + 0.3, 2.375, 4.3)
  scene.add(mug.group)
}

const LOOKS: PersonOpts[] = [
  { hair: '#7C5940', sweater: '#7383BC', sweaterDeep: '#5A6694' },
  { hair: '#C89058', sweater: '#FF8FAF', sweaterDeep: '#D96F8D', hairStyle: 'long' },
  { hair: '#3A3230', sweater: '#7CC9AC', sweaterDeep: '#58A084' },
  { hair: '#9D8BD0', sweater: '#FFC24D', sweaterDeep: '#D9A140', hairStyle: 'long' },
]

const SEAT_Y = 1.78 // stool cushion top (catalog seatY)

// A · the current build
furnish(3.6)
{
  const sit = buildPerson(LOOKS[0], 'sit')
  sit.group.position.set(1.9, SEAT_Y + 3 * VOX, 4.6)
  sit.group.rotation.y = Math.PI / 2
  scene.add(sit.group)
  animators.push(makeAnimator(sit, 0.7))
  const stand = buildPerson(LOOKS[0], 'stand')
  stand.group.position.set(5.2, 0, 6.6)
  stand.group.rotation.y = 0.73
  scene.add(stand.group)
  animators.push(makeIdleAnimator(stand, 1.9))
}

// B / C / D · the experiments
const VARIANTS: { x: number; P: Proportions }[] = [
  // B · a small step: short true legs, arms at the sides
  { x: 10.2, P: { leg: 12, torsoW: 12, torsoH: 11, torsoD: 7, arm: 3 } },
  // C · reference proportions: ~2.6 units tall, clear legs, hands at mid-thigh
  { x: 16.8, P: { leg: 17, torsoW: 12, torsoH: 12, torsoD: 7, arm: 3 } },
  // D · reference, slimmed: narrower torso so the head reads even bigger
  { x: 23.4, P: { leg: 17, torsoW: 10, torsoH: 12, torsoD: 6, arm: 3 } },
]
VARIANTS.forEach(({ x, P }, i) => {
  furnish(x)
  const look = LOOKS[i + 1]
  const sit = buildPersonV2(look, 'sit', P)
  sit.group.position.set(x - 1.7, SEAT_Y, 4.6)
  sit.group.rotation.y = Math.PI / 2
  scene.add(sit.group)
  animators.push(labAnimator(sit, i * 1.4))
  const stand = buildPersonV2(look, 'stand', P)
  stand.group.position.set(x + 1.6, 0, 6.6)
  stand.group.rotation.y = 0.73
  scene.add(stand.group)
  animators.push(labAnimator(stand, i * 1.4 + 0.8))
})

// ---------- the game's day lighting, roughly ----------
const hemi = new THREE.HemisphereLight('#FFFAF2', '#EBE0D0', 0.55)
const dir = new THREE.DirectionalLight('#FFF4E7', 0.85)
dir.position.set(30, 42, 26)
dir.target.position.set(13, 0, 5)
dir.castShadow = true
dir.shadow.mapSize.set(2048, 2048)
dir.shadow.normalBias = 0.06
dir.shadow.camera.left = -26
dir.shadow.camera.right = 26
dir.shadow.camera.top = 26
dir.shadow.camera.bottom = -26
const wash = new THREE.DirectionalLight('#FFE7C2', 0.5)
wash.position.set(13, 30, 5)
wash.target.position.set(13, 0, 5)
scene.add(hemi, dir, dir.target, wash, wash.target, new THREE.AmbientLight('#FFF3E2', 0.35))

// ---------- camera: the game's iso angle, wheel zoom + drag pan ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
const target = new THREE.Vector3(13.5, 1.6, 5)
const OFFSET = new THREE.Vector3(24, 28.5, 27)
let zoom = 1
function placeCam() {
  cam.position.copy(target).add(OFFSET)
  cam.lookAt(target)
}
placeCam()
window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    zoom = Math.min(8, Math.max(0.6, zoom * Math.exp(-e.deltaY * 0.0012)))
  },
  { passive: false }
)
let dragging = false
let lastX = 0
let lastY = 0
const camRight = new THREE.Vector3()
const camUp = new THREE.Vector3()
window.addEventListener('pointerdown', (e) => {
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
})
window.addEventListener('pointerup', () => (dragging = false))
window.addEventListener('pointermove', (e) => {
  if (!dragging) return
  const wpp = (cam.right - cam.left) / window.innerWidth
  cam.updateMatrixWorld()
  camRight.setFromMatrixColumn(cam.matrixWorld, 0)
  camUp.setFromMatrixColumn(cam.matrixWorld, 1)
  target.addScaledVector(camRight, -(e.clientX - lastX) * wpp)
  target.addScaledVector(camUp, (e.clientY - lastY) * wpp)
  lastX = e.clientX
  lastY = e.clientY
  placeCam()
})

const clock = new THREE.Clock()
function frame() {
  const W = window.innerWidth
  const H = window.innerHeight
  renderer.setSize(W, H, false)
  const t = clock.elapsedTime
  const dt = Math.min(clock.getDelta(), 0.05)
  for (const a of animators) a(dt, t)
  const aspect = W / H
  const halfW = 15 / zoom
  cam.left = -halfW
  cam.right = halfW
  cam.top = halfW / aspect
  cam.bottom = -halfW / aspect
  cam.updateProjectionMatrix()
  renderer.render(scene, cam)
  requestAnimationFrame(frame)
}
frame()

// scripted framing for screenshots
;(window as unknown as { __charlab: object }).__charlab = {
  look(x: number, y: number, z: number, zm: number) {
    target.set(x, y, z)
    zoom = zm
    placeCam()
  },
}
