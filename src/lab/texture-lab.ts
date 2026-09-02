// TEXTURE LAB — dev-only playground, completely separate from the game.
// One tiny vignette (floor + walls + table + mug + seat) rendered four ways
// side by side, to judge anti-"plastic" treatments before touching the game:
//   A baseline: flat Lambert fills (how the game shades today)
//   B grain albedo: procedural canvas textures (planks / paper / weave)
//   C toon ramp: 3-step quantized lighting (MeshToonMaterial)
//   D the combo, rendered low-res and upscaled nearest (chunky pixels)
import * as THREE from 'three'

// ---------- procedural pixel textures ----------
function tex(draw: (g: CanvasRenderingContext2D) => void, size = 64): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Deterministic tiny rng so the lab is stable frame to frame. */
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

function plankTexture(base: string, dark: string): THREE.Texture {
  return tex((g) => {
    const r = rng(7)
    for (let row = 0; row < 8; row++) {
      // each board gets its own value, like hand-picked palette variation
      const v = 0.92 + r() * 0.16
      g.fillStyle = shade(base, v)
      g.fillRect(0, row * 8, 64, 8)
      // sparse grain dashes
      g.fillStyle = shade(base, v * 0.9)
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(r() * 60)
        g.fillRect(x, row * 8 + 1 + Math.floor(r() * 6), 2 + Math.floor(r() * 4), 1)
      }
      // seam
      g.fillStyle = dark
      g.fillRect(0, row * 8 + 7, 64, 1)
      // staggered board ends
      const end = Math.floor(r() * 64)
      g.fillRect(end, row * 8, 1, 8)
    }
  })
}

function paperTexture(base: string): THREE.Texture {
  return tex((g) => {
    const r = rng(23)
    g.fillStyle = base
    g.fillRect(0, 0, 64, 64)
    for (let i = 0; i < 900; i++) {
      const v = 0.96 + r() * 0.08
      g.fillStyle = shade(base, v)
      g.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 1, 1)
    }
    // the faintest vertical panelling
    g.fillStyle = 'rgba(0,0,0,0.05)'
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 1, 64)
  })
}

function weaveTexture(base: string): THREE.Texture {
  return tex((g) => {
    const r = rng(41)
    g.fillStyle = base
    g.fillRect(0, 0, 64, 64)
    for (let y = 0; y < 64; y += 2) {
      g.fillStyle = shade(base, y % 4 === 0 ? 1.05 : 0.95)
      for (let x = (y % 4 === 0 ? 0 : 1); x < 64; x += 2) g.fillRect(x, y, 1, 1)
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = shade(base, 0.9)
      g.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 1, 1)
    }
  })
}

function shade(hex: string, v: number): string {
  const c = new THREE.Color(hex).multiplyScalar(v)
  return '#' + c.getHexString()
}

// 3-step ramp for MeshToonMaterial (quantized pixel-game shading)
function toonRamp(): THREE.Texture {
  const data = new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255])
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}

// ---------- the vignette ----------
type MatMaker = (kind: 'floor' | 'wall' | 'wood' | 'fabric' | 'china', hex: string) => THREE.Material

const PALETTE = { floor: '#EAD1A6', wall: '#FAF2E3', wood: '#D9A868', fabric: '#7CC9AC', china: '#FFB3C7' }

function vignette(mat: MatMaker): THREE.Scene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#B8E4F6')
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }
  add(new THREE.BoxGeometry(8, 0.3, 8), mat('floor', PALETTE.floor), 0, -0.15, 0)
  add(new THREE.BoxGeometry(8, 5, 0.3), mat('wall', PALETTE.wall), 0, 2.5, -4.15)
  add(new THREE.BoxGeometry(0.3, 5, 8), mat('wall', PALETTE.wall), -4.15, 2.5, 0)
  // table
  add(new THREE.CylinderGeometry(1.6, 1.6, 0.25, 24), mat('wood', PALETTE.wood), 0.4, 2.1, 0.2)
  add(new THREE.CylinderGeometry(0.22, 0.3, 2, 12), mat('wood', PALETTE.wood), 0.4, 1, 0.2)
  // seat cube (fabric)
  add(new THREE.BoxGeometry(1.3, 1.1, 1.3), mat('fabric', PALETTE.fabric), -2.2, 0.55, 1.6)
  // mug on the table
  add(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 14), mat('china', PALETTE.china), 0.9, 2.5, -0.2)

  const hemi = new THREE.HemisphereLight('#FFFAF2', '#EBE0D0', 0.7)
  const dir = new THREE.DirectionalLight('#FFF4E7', 0.85)
  dir.position.set(6, 9, 5)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  dir.shadow.normalBias = 0.05
  const warm = new THREE.PointLight('#FFC276', 6, 12, 1.4)
  warm.position.set(-1.5, 3.4, 1.5)
  scene.add(hemi, dir, warm, new THREE.AmbientLight('#FFF3E2', 0.25))
  return scene
}

// ---------- the four material treatments ----------
const lam = (opts: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(opts)

const A: MatMaker = (_k, hex) => lam({ color: new THREE.Color(hex).convertSRGBToLinear() })

const grainMaps = {
  floor: plankTexture(PALETTE.floor, '#DCC298'),
  wall: paperTexture(PALETTE.wall),
  wood: plankTexture(PALETTE.wood, '#C08F52'),
  fabric: weaveTexture(PALETTE.fabric),
  china: paperTexture(PALETTE.china),
}
for (const [k, t] of Object.entries(grainMaps)) t.repeat.set(k === 'floor' || k === 'wall' ? 3 : 1, k === 'floor' || k === 'wall' ? 3 : 1)

const B: MatMaker = (k) => lam({ map: grainMaps[k] })

const ramp = toonRamp()
const C: MatMaker = (_k, hex) =>
  new THREE.MeshToonMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), gradientMap: ramp })

const D: MatMaker = (k) => new THREE.MeshToonMaterial({ map: grainMaps[k], gradientMap: ramp })

// ---------- render four scissored quadrants ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const scenes = [vignette(A), vignette(B), vignette(C), vignette(D)]
const cams = scenes.map(() => {
  const cam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
  cam.position.set(9, 8.2, 9)
  cam.lookAt(0, 1.2, 0)
  return cam
})

// D renders tiny then upscales nearest — the chunky-pixel treatment
const lowRT = new THREE.WebGLRenderTarget(180, 180)
lowRT.texture.magFilter = THREE.NearestFilter
const blitScene = new THREE.Scene()
const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: lowRT.texture })))

function frame() {
  const W = window.innerWidth
  const H = window.innerHeight
  renderer.setSize(W, H, false)
  const q = W / 4
  renderer.setScissorTest(true)
  scenes.forEach((scene, i) => {
    const cam = cams[i]
    // fit ~11 world units across each quadrant, square pixels
    const aspect = q / H
    cam.left = -5.5
    cam.right = 5.5
    cam.top = 5.5 / aspect
    cam.bottom = -5.5 / aspect
    cam.updateProjectionMatrix()
    if (i === 3) {
      renderer.setScissorTest(false)
      renderer.setRenderTarget(lowRT)
      renderer.setViewport(0, 0, 180, 180)
      renderer.render(scene, cam)
      renderer.setRenderTarget(null)
      renderer.setScissorTest(true)
      renderer.setViewport(i * q, 0, q, H)
      renderer.setScissor(i * q, 0, q, H)
      renderer.render(blitScene, blitCam)
    } else {
      renderer.setViewport(i * q, 0, q, H)
      renderer.setScissor(i * q, 0, q, H)
      renderer.render(scene, cam)
    }
  })
  requestAnimationFrame(frame)
}
frame()
