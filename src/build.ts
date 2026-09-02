// Shared build vocabulary: scale, palette, outline layer, smooth-shape helpers.
import * as THREE from 'three'

export const VOX = 0.0625 // 1 voxel = 0.0625 world units
export const UNIT = 16 // voxels per world unit
export const GRID = 8 // voxels per placement cell (0.5 world units)

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

/** Layer 1 marks objects for the retro outline pass (furniture + creatures). */
export const OUTLINE_LAYER = 1
export function outlined<T extends THREE.Object3D>(o: T): T {
  o.traverse((m) => m.layers.enable(OUTLINE_LAYER))
  o.layers.enable(OUTLINE_LAYER)
  return o
}

const matCache = new Map<string, THREE.MeshLambertMaterial>()
export function smoothMat(hex: string): THREE.MeshLambertMaterial {
  let m = matCache.get(hex)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() })
    matCache.set(hex, m)
  }
  return m
}

/** Solid cylinder in voxel coordinates (yBottom..yBottom+h voxels tall). */
export function puck(cx: number, cz: number, yBottom: number, h: number, r: number, hex: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r * VOX, r * VOX, h * VOX, 40)
  const mesh = new THREE.Mesh(geo, smoothMat(hex))
  mesh.position.set(cx * VOX, (yBottom + h / 2) * VOX, cz * VOX)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return outlined(mesh)
}

/** Tapered cone shade in voxel coordinates. */
export function cone(cx: number, cz: number, yBottom: number, h: number, rBottom: number, rTop: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop * VOX, rBottom * VOX, h * VOX, 40)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(cx * VOX, (yBottom + h / 2) * VOX, cz * VOX)
  mesh.castShadow = true
  return outlined(mesh)
}

export function blobTexture(): THREE.Texture {
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

/** The floor lamp's shade material — its emissive is driven by the lighting rig. */
export const lampShadeMat = new THREE.MeshLambertMaterial({
  color: new THREE.Color(PAL.mustard).convertSRGBToLinear(),
  emissive: new THREE.Color(PAL.mustard).convertSRGBToLinear(),
  emissiveIntensity: 0.06,
})

/** Every lamp-shade material ever made — the lighting rig drives all their emissives. */
export const lampShadeMats: THREE.MeshLambertMaterial[] = [lampShadeMat]
const shadeCache = new Map<string, THREE.MeshLambertMaterial>()
export function shadeMat(hex: string): THREE.MeshLambertMaterial {
  if (hex === PAL.mustard) return lampShadeMat
  let m = shadeCache.get(hex)
  if (!m) {
    const c = new THREE.Color(hex).convertSRGBToLinear()
    // a lit shade glows LAMPLIGHT-warm whatever its color — a blue shade
    // emitting pure blue reads as "off" next to a cream one at night
    const glow = c.clone().lerp(new THREE.Color('#FFD9A0').convertSRGBToLinear(), 0.6)
    m = new THREE.MeshLambertMaterial({ color: c, emissive: glow, emissiveIntensity: 0.06 })
    shadeCache.set(hex, m)
    lampShadeMats.push(m)
  }
  return m
}
