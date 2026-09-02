// ROOM LAB — dev-only, the game itself is untouched. Builds a big café from
// the REAL shell + REAL furniture builders, then applies treatment D:
// hue-shifted quantized shading (painterly ramp), shown crisp on the left
// and gently pixelated on the right, with day/dusk/night ramp tints.
import * as THREE from 'three'
import { buildShell } from '../shell'
import { buildItem } from '../items'
import { buildPerson, makeAnimator, makeIdleAnimator } from '../people'
import type { RoomDoc } from '../types'

// ---------- the shared hue-shift ramp (mutated per time of day) ----------
const rampData = new Float32Array(16)
const ramp = new THREE.DataTexture(rampData, 4, 1, THREE.RGBAFormat, THREE.FloatType)
ramp.magFilter = THREE.NearestFilter
ramp.minFilter = THREE.NearestFilter

type Mode = 'day' | 'dusk' | 'night'
const RAMPS: Record<Mode, number[]> = {
  // deep shadow · shadow · mid · highlight (rgb each)
  day: [0.36, 0.29, 0.88, 0.56, 0.5, 0.98, 1.0, 0.94, 0.86, 1.32, 1.19, 0.9],
  dusk: [0.3, 0.22, 0.75, 0.62, 0.44, 0.86, 1.02, 0.87, 0.8, 1.34, 1.06, 0.82],
  night: [0.2, 0.18, 0.55, 0.4, 0.4, 0.74, 0.74, 0.73, 0.92, 1.14, 0.98, 0.74],
}
function setRamp(mode: Mode) {
  const src = RAMPS[mode]
  for (let i = 0; i < 4; i++) {
    rampData[i * 4] = src[i * 3]
    rampData[i * 4 + 1] = src[i * 3 + 1]
    rampData[i * 4 + 2] = src[i * 3 + 2]
    rampData[i * 4 + 3] = 1
  }
  ramp.needsUpdate = true
}
setRamp('day')

// ---------- toonify: swap every Lambert for a Toon sharing the ramp ----------
const converted = new Map<THREE.Material, THREE.Material>()
function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const conv = (mat: THREE.Material): THREE.Material => {
      const lam = mat as THREE.MeshLambertMaterial
      if (!lam.isMeshLambertMaterial) return mat // Basic (eyes, glass, shines) stay as-is
      let t = converted.get(mat)
      if (!t) {
        t = new THREE.MeshToonMaterial({
          color: lam.color.clone(),
          vertexColors: lam.vertexColors,
          map: lam.map ?? undefined,
          emissive: lam.emissive.clone(),
          emissiveIntensity: lam.emissiveIntensity,
          transparent: lam.transparent,
          opacity: lam.opacity,
          gradientMap: ramp,
        })
        converted.set(mat, t)
      }
      return t
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material)
  })
}

// ---------- the big room ----------
const room: RoomDoc = {
  w: 20,
  d: 14,
  floor: 'honey',
  wallStyle: 'cream',
  openings: [
    { id: 'd', wall: 'left', kind: 'door', start: 2, width: 2.5 },
    { id: 'w1', wall: 'back', kind: 'window', start: 3, width: 5 },
    { id: 'w2', wall: 'back', kind: 'window', start: 12, width: 5 },
    { id: 'w3', wall: 'left', kind: 'window', start: 7.5, width: 4 },
  ],
}

const scene = new THREE.Scene()
scene.background = new THREE.Color('#B8E4F6')
const shell = buildShell(room)
scene.add(shell.group)

const animators: ((dt: number, t: number) => void)[] = []
const lampPoints: THREE.PointLight[] = []

function place(id: string, x: number, z: number, rot = 0, variant?: string, y = 0) {
  const built = buildItem(id, variant)
  built.group.position.set(x, y, z)
  built.group.rotation.y = (rot * Math.PI) / 2
  scene.add(built.group)
  if (built.update) animators.push(built.update)
  if (built.lampLight) lampPoints.push(built.lampLight)
  return built
}

// a believable café: counter zone, two study tables, a lounge corner
place('counter-l', 3.4, 2.2, 0, 'honey')
place('espresso', 2.2, 2.2, 0, undefined, 2.75)
place('pastry-case', 7.6, 2.1)
place('menu-board', 10.6, 1.6)
place('table-m', 6.5, 7.5, 0, 'honey')
place('stool', 4.8, 7.5, 0, 'pink')
place('stool', 8.2, 7.5, 0, 'mint')
place('stool', 6.5, 9.2, 0, 'butter')
place('mug', 6.1, 7.2, 0, undefined, 2.375)
place('open-book', 7.1, 7.9, 1, undefined, 2.375)
place('table-s', 13.5, 6.5, 0, 'walnut')
place('chair', 13.5, 8.1, 2, 'sky')
place('chair', 12, 6.5, 1, 'lavender')
place('book-stack', 13.7, 6.3, 0, undefined, 2.375)
place('loveseat', 16.8, 11.2, 3, 'peach')
place('coffee-table', 14, 11.4, 0, 'honey')
place('armchair', 11.3, 12, 2, 'sage')
place('rug-round', 6.5, 7.6, 0, 'pink')
place('rug-l', 15, 11.3, 0, 'butter')
place('floor-lamp', 18.6, 8.6, 0, 'butter')
place('floor-lamp', 1.6, 9.5, 0, 'sky')
place('bookshelf', 18.6, 2.4, 0, 'walnut')
place('fiddle-tree', 16.9, 1.8)
place('palm-plant', 1.8, 12.2)
place('guestbook', 4.3, 1.4)
place('fairy-garland', 12.8, 0.9)

// people: two seated, one standing
const p1 = buildPerson({ hair: '#7C5940', sweater: '#7383BC', sweaterDeep: '#5A6694' }, 'sit')
p1.group.position.set(4.8, 1.9675, 7.5)
p1.group.rotation.y = Math.PI / 2
scene.add(p1.group)
animators.push(makeAnimator(p1, 1.3))
const p2 = buildPerson({ hair: '#C89058', sweater: '#FF8FAF', sweaterDeep: '#D96F8D', hairStyle: 'long' }, 'sit')
p2.group.position.set(13.5, 1.9175, 8.1)
p2.group.rotation.y = Math.PI
scene.add(p2.group)
animators.push(makeAnimator(p2, 3.1))
const p3 = buildPerson({ hair: '#3A3230', sweater: '#7CC9AC', sweaterDeep: '#58A084', glasses: true }, 'stand')
p3.group.position.set(9.5, 0, 4.5)
p3.group.rotation.y = Math.PI * 0.85
scene.add(p3.group)
animators.push(makeIdleAnimator(p3, 0.6))

toonify(scene)

// ---------- lighting, roughly the game rig ----------
const hemi = new THREE.HemisphereLight('#FFFAF2', '#EBE0D0', 0.55)
const dir = new THREE.DirectionalLight('#FFF4E7', 0.85)
dir.position.set(30, 42, 26)
dir.target.position.set(10, 0, 7)
dir.castShadow = true
dir.shadow.mapSize.set(2048, 2048)
dir.shadow.normalBias = 0.06
dir.shadow.camera.left = -24
dir.shadow.camera.right = 24
dir.shadow.camera.top = 24
dir.shadow.camera.bottom = -24
const wash = new THREE.DirectionalLight('#FFE7C2', 0.5)
wash.position.set(10, 30, 7)
wash.target.position.set(10, 0, 7)
const amb = new THREE.AmbientLight('#FFF3E2', 0.35)
const pendants: THREE.PointLight[] = []
for (const [px, pz] of [[5, 4], [15, 4], [5, 10], [15, 10]] as const) {
  const l = new THREE.PointLight('#FFDCA6', 3, 26, 1.05)
  l.position.set(px, 6.75, pz)
  pendants.push(l)
  scene.add(l)
}
scene.add(hemi, dir, dir.target, wash, wash.target, amb)

const LIGHTS: Record<Mode, { hemi: number; dir: number; dirC: string; wash: number; amb: number; pend: number; lamp: number; bg: string }> = {
  day: { hemi: 0.55, dir: 0.85, dirC: '#FFF4E7', wash: 0.5, amb: 0.35, pend: 3, lamp: 2, bg: '#B8E4F6' },
  dusk: { hemi: 0.35, dir: 0.3, dirC: '#FFB27A', wash: 0.4, amb: 0.22, pend: 2.6, lamp: 6, bg: '#CDBBE8' },
  night: { hemi: 0.22, dir: 0.1, dirC: '#9FB2D8', wash: 0.28, amb: 0.14, pend: 2, lamp: 10, bg: '#8A90C4' },
}
function setMode(mode: Mode) {
  setRamp(mode)
  const L = LIGHTS[mode]
  hemi.intensity = L.hemi
  dir.intensity = L.dir
  dir.color.set(L.dirC)
  wash.intensity = L.wash
  amb.intensity = L.amb
  pendants.forEach((p) => (p.intensity = L.pend))
  lampPoints.forEach((p) => (p.intensity = L.lamp))
  scene.background = new THREE.Color(L.bg)
  document.body.style.background = L.bg
}
document.querySelectorAll<HTMLButtonElement>('#hud button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#hud button').forEach((x) => x.classList.remove('on'))
    b.classList.add('on')
    setMode(b.dataset.mode as Mode)
  })
)

// ---------- one full-screen view: crisp OR pixelated, zoom + pan ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

let view: 'crisp' | 'pixel' = 'crisp'
document.querySelectorAll<HTMLButtonElement>('#hud button[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#hud button[data-view]').forEach((x) => x.classList.remove('on'))
    b.classList.add('on')
    view = b.dataset.view as 'crisp' | 'pixel'
  })
)

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
const target = new THREE.Vector3(10, 1.5, 7)
const OFFSET = new THREE.Vector3(24, 28.5, 27)
let zoom = 1
function placeCam() {
  cam.position.copy(target).add(OFFSET)
  cam.lookAt(target)
}
placeCam()

// wheel zoom (cursor-ish centered) + drag pan, like the game
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
  if ((e.target as HTMLElement).closest('#hud')) return
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

let lowRT = new THREE.WebGLRenderTarget(4, 4)
lowRT.texture.magFilter = THREE.NearestFilter
const blitScene = new THREE.Scene()
const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
const blitMat = new THREE.MeshBasicMaterial({ map: lowRT.texture })
blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat))

const clock = new THREE.Clock()
function frame() {
  const W = window.innerWidth
  const H = window.innerHeight
  renderer.setSize(W, H, false)
  const t = clock.elapsedTime
  const dt = Math.min(clock.getDelta(), 0.05)
  for (const a of animators) a(dt, t)

  const aspect = W / H
  const halfW = 14 / zoom
  cam.left = -halfW
  cam.right = halfW
  cam.top = halfW / aspect
  cam.bottom = -halfW / aspect
  cam.updateProjectionMatrix()

  if (view === 'crisp') {
    renderer.setScissorTest(false)
    renderer.setRenderTarget(null)
    renderer.setViewport(0, 0, W, H)
    renderer.render(scene, cam)
  } else {
    // pixel size stays constant on screen; zooming reveals detail
    const rw = Math.max(4, Math.floor(W / 1.6))
    const rh = Math.max(4, Math.floor(H / 1.6))
    if (lowRT.width !== rw || lowRT.height !== rh) {
      lowRT.dispose()
      lowRT = new THREE.WebGLRenderTarget(rw, rh)
      lowRT.texture.magFilter = THREE.NearestFilter
      blitMat.map = lowRT.texture
      blitMat.needsUpdate = true
    }
    renderer.setScissorTest(false)
    renderer.setRenderTarget(lowRT)
    renderer.setViewport(0, 0, rw, rh)
    renderer.render(scene, cam)
    renderer.setRenderTarget(null)
    renderer.setViewport(0, 0, W, H)
    renderer.render(blitScene, blitCam)
  }
  requestAnimationFrame(frame)
}
frame()
