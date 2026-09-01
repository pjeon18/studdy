// Item snapshot thumbnails for the shop: each catalog item rendered once to a
// small offscreen canvas from the game's iso angle, cached as a data URL.
import * as THREE from 'three'
import { buildItem } from './items'

const SIZE = 96
const cache = new Map<string, string>()
let renderer: THREE.WebGLRenderer | null = null

export function itemThumb(itemId: string, variant?: string): string {
  const key = `${itemId}|${variant ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit

  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIZE, SIZE)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
  }

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#FFFAF2', '#D8CBB8', 1.05))
  const dir = new THREE.DirectionalLight('#FFF4E7', 1.5)
  dir.position.set(3, 5, 4)
  scene.add(dir)

  const built = buildItem(itemId, variant)
  built.group.traverse((o) => {
    if ((o as THREE.Light).isLight) o.visible = false
  })
  scene.add(built.group)

  const box = new THREE.Box3().setFromObject(built.group)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.12
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 100)
  const az = Math.PI / 4
  const el = 0.56
  cam.position.set(
    center.x + Math.cos(el) * Math.sin(az) * 20,
    center.y + Math.sin(el) * 20,
    center.z + Math.cos(el) * Math.cos(az) * 20
  )
  cam.lookAt(center)

  renderer.render(scene, cam)
  const url = renderer.domElement.toDataURL()
  cache.set(key, url)

  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
  })
  return url
}
