import * as THREE from 'three'
import { lampShadeMats } from './build'

/** What the lighting rig needs from a world (showcase or game). */
export interface LightingWorld {
  group: THREE.Group
  skyMat: THREE.MeshBasicMaterial
  glassMat: THREE.MeshBasicMaterial
  fairyMats: THREE.MeshBasicMaterial[]
  lampShadeMat: THREE.MeshLambertMaterial
  pendantPositions: THREE.Vector3[]
  lampPos?: THREE.Vector3
  screenGlowPos?: THREE.Vector3
  /** Live array — the game pushes/removes lamp lights as floor lamps are placed. */
  lampLights?: THREE.PointLight[]
}

export type Mode = 'day' | 'dusk' | 'night'

interface ModeState {
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  dirColor: string
  dirIntensity: number
  fillIntensity: number
  lampIntensity: number
  pendantIntensity: number
  washIntensity: number
  /** How much of the pendant light bleeds into the flat ambient floor. */
  ambientScale: number
  screenGlow: number
  sky: string
  roof: string
  glassOpacity: number
  fairy: number
  shadeGlow: number
  bg: [string, string]
}

const STATES: Record<Mode, ModeState> = {
  day: {
    hemiSky: '#FFFAF2',
    hemiGround: '#EBE0D0',
    hemiIntensity: 0.7,
    dirColor: '#FFF4E7',
    dirIntensity: 0.75,
    fillIntensity: 0.2,
    lampIntensity: 4,
    pendantIntensity: 9,
    washIntensity: 0.4,
    ambientScale: 1,
    screenGlow: 0.6,
    sky: '#BCD6EC',
    roof: '#97AECB',
    glassOpacity: 0.22,
    fairy: 0.3,
    shadeGlow: 0.06,
    bg: ['#B8E4F6', '#A5D8F0'],
  },
  dusk: {
    hemiSky: '#FFE0CB',
    hemiGround: '#C7AB98',
    hemiIntensity: 0.46,
    dirColor: '#FFB27A',
    dirIntensity: 0.28,
    fillIntensity: 0.1,
    lampIntensity: 9,
    pendantIntensity: 8,
    washIntensity: 0.32,
    ambientScale: 0.42,
    screenGlow: 1.8,
    sky: '#8B87B8',
    roof: '#6C6C99',
    glassOpacity: 0.16,
    fairy: 0.75,
    shadeGlow: 0.55,
    bg: ['#CDBBE8', '#B4A5DA'],
  },
  night: {
    hemiSky: '#98A8CE',
    hemiGround: '#585472',
    hemiIntensity: 0.32,
    dirColor: '#9FB2D8',
    dirIntensity: 0.1,
    fillIntensity: 0.05,
    lampIntensity: 14,
    pendantIntensity: 5.5,
    washIntensity: 0.24,
    ambientScale: 0.3,
    screenGlow: 5,
    sky: '#313857',
    roof: '#252A45',
    glassOpacity: 0.1,
    fairy: 1,
    shadeGlow: 0.85,
    bg: ['#8A90C4', '#767CB2'],
  },
}

const FAIRY_BASE = ['#FF9EBB', '#9FE8CF', '#FFDE8A', '#CDBAFF']

export class Lighting {
  hemi: THREE.HemisphereLight
  dir: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  lampLights: THREE.PointLight[]
  wash: THREE.DirectionalLight
  pendants: THREE.PointLight[] = []
  private pendantNorm = 1
  /** Flat indoor floor light — the "even from the ceiling" part. */
  roomAmbient: THREE.AmbientLight
  screenGlow: THREE.PointLight
  t = 1
  // room lights boot fully "on" (slider max); the slider dims from there.
  // 3 = the bright new max; the old max (2) sits at the slider's two-thirds mark.
  private roomMult = 2.1
  private furnMult = 1
  private lastE = 1
  private scene: THREE.Scene
  private world: LightingWorld
  private roofMat: THREE.MeshBasicMaterial | null = null
  private cur: ModeState
  private target: ModeState
  onBackground?: (a: string, b: string) => void

  constructor(scene: THREE.Scene, world: LightingWorld) {
    this.world = world
    this.scene = scene
    this.hemi = new THREE.HemisphereLight('#FFFAF2', '#EBE0D0', 0.7)
    scene.add(this.hemi)

    this.dir = new THREE.DirectionalLight('#FFF4E7', 0.75)
    this.dir.position.set(44, 56, 34)
    this.dir.target.position.set(14, 0, 10)
    this.dir.castShadow = true
    this.dir.shadow.mapSize.set(4096, 4096)
    this.dir.shadow.camera.left = -34
    this.dir.shadow.camera.right = 34
    this.dir.shadow.camera.top = 34
    this.dir.shadow.camera.bottom = -34
    this.dir.shadow.camera.near = 5
    this.dir.shadow.camera.far = 160
    this.dir.shadow.bias = -0.0006
    this.dir.shadow.normalBias = 0.06
    scene.add(this.dir, this.dir.target)

    // soft pink fill from the camera's left so shadowed faces never go muddy
    this.fill = new THREE.DirectionalLight('#FFE9EF', 0.22)
    this.fill.position.set(-14, 16, 26)
    scene.add(this.fill)

    if (world.lampLights) {
      this.lampLights = world.lampLights
    } else {
      const lamp = new THREE.PointLight('#FFC276', 1.2, 16, 1.7)
      if (world.lampPos) lamp.position.copy(world.lampPos)
      scene.add(lamp)
      this.lampLights = [lamp]
    }

    this.setPendantGrid(world.pendantPositions)

    // straight-down "ceiling wash": the strong, direct component of the café lights
    this.wash = new THREE.DirectionalLight('#FFE7C2', 0.4)
    this.wash.position.set(14, 30, 10)
    this.wash.target.position.set(14, 0, 10)
    scene.add(this.wash, this.wash.target)

    // the even indoor floor: rides the room-light control so corners never
    // fall darker than the middle of the room
    this.roomAmbient = new THREE.AmbientLight('#FFF3E2', 0)
    scene.add(this.roomAmbient)

    this.screenGlow = new THREE.PointLight('#CDE9FF', 0.6, 5, 1.8)
    this.screenGlow.position.copy(world.screenGlowPos ?? new THREE.Vector3(0, -100, 0))
    scene.add(this.screenGlow)

    world.group.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.MeshBasicMaterial).color?.getHexString() === '97aecb')
        this.roofMat = o.material as THREE.MeshBasicMaterial
    })

    this.cur = { ...STATES.day }
    this.target = STATES.day
    this.apply(STATES.day, STATES.day, 1)
  }

  setMode(mode: Mode) {
    this.cur = this.snapshot()
    this.target = STATES[mode]
    this.t = 0
  }

  /** Re-apply current values (e.g. a lamp was placed/removed). */
  refresh() {
    if (this.cur && this.target) this.apply(this.cur, this.target, this.lastE)
  }

  /** Recreate the invisible ceiling-light grid (room resized). */
  setPendantGrid(positions: THREE.Vector3[]) {
    for (const l of this.pendants) this.scene.remove(l)
    this.pendants = []
    // gentle falloff + long reach = the corners get the same light as the
    // center; total brightness is normalized by count so bigger rooms
    // don't blow out
    this.pendantNorm = Math.min(1, 2 / Math.max(1, positions.length))
    for (const p of positions) {
      const light = new THREE.PointLight('#FFDCA6', 3.5, 26, 1.05)
      light.position.copy(p)
      this.scene.add(light)
      this.pendants.push(light)
    }
    if (this.cur && this.target) this.apply(this.cur, this.target, this.lastE)
  }

  /** Café-owner control: 0..2 multiplier on the ceiling (room) lights. */
  setRoomLight(mult: number) {
    this.roomMult = mult
    this.apply(this.cur, this.target, this.lastE)
  }

  /** Café-owner control: 0..2 multiplier on the furniture fixtures (lamps, fairy lights). */
  setFurnitureLight(mult: number) {
    this.furnMult = mult
    this.apply(this.cur, this.target, this.lastE)
  }

  private snapshot(): ModeState {
    const a = this.cur
    const b = this.target
    const k = this.t
    const lc = (x: string, y: string) => '#' + new THREE.Color(x).lerp(new THREE.Color(y), k).getHexString()
    const ln = (x: number, y: number) => x + (y - x) * k
    return {
      hemiSky: lc(a.hemiSky, b.hemiSky),
      hemiGround: lc(a.hemiGround, b.hemiGround),
      hemiIntensity: ln(a.hemiIntensity, b.hemiIntensity),
      dirColor: lc(a.dirColor, b.dirColor),
      dirIntensity: ln(a.dirIntensity, b.dirIntensity),
      fillIntensity: ln(a.fillIntensity, b.fillIntensity),
      lampIntensity: ln(a.lampIntensity, b.lampIntensity),
      pendantIntensity: ln(a.pendantIntensity, b.pendantIntensity),
      washIntensity: ln(a.washIntensity, b.washIntensity),
      ambientScale: ln(a.ambientScale, b.ambientScale),
      screenGlow: ln(a.screenGlow, b.screenGlow),
      sky: lc(a.sky, b.sky),
      roof: lc(a.roof, b.roof),
      glassOpacity: ln(a.glassOpacity, b.glassOpacity),
      fairy: ln(a.fairy, b.fairy),
      shadeGlow: ln(a.shadeGlow, b.shadeGlow),
      bg: [lc(a.bg[0], b.bg[0]), lc(a.bg[1], b.bg[1])],
    }
  }

  update(dt: number) {
    if (this.t >= 1) return
    this.t = Math.min(1, this.t + dt / 1.4)
    const e = this.t < 0.5 ? 2 * this.t * this.t : 1 - Math.pow(-2 * this.t + 2, 2) / 2
    this.apply(this.cur, this.target, e)
  }

  private apply(a: ModeState, b: ModeState, k: number) {
    this.lastE = k
    const lc = (x: string, y: string, out: THREE.Color) => out.set(x).lerp(new THREE.Color(y), k)
    const ln = (x: number, y: number) => x + (y - x) * k

    lc(a.hemiSky, b.hemiSky, this.hemi.color)
    lc(a.hemiGround, b.hemiGround, this.hemi.groundColor)
    this.hemi.intensity = ln(a.hemiIntensity, b.hemiIntensity)
    lc(a.dirColor, b.dirColor, this.dir.color)
    this.dir.intensity = ln(a.dirIntensity, b.dirIntensity)
    this.fill.intensity = ln(a.fillIntensity, b.fillIntensity)
    const lampVal = ln(a.lampIntensity, b.lampIntensity) * this.furnMult
    this.lampLights.forEach((l) => (l.intensity = lampVal))
    const pend = ln(a.pendantIntensity, b.pendantIntensity) * this.roomMult
    this.pendants.forEach((l) => (l.intensity = pend * this.pendantNorm))
    this.roomAmbient.intensity = pend * 0.07 * ln(a.ambientScale, b.ambientScale)
    this.wash.intensity = ln(a.washIntensity, b.washIntensity) * this.roomMult
    this.screenGlow.intensity = ln(a.screenGlow, b.screenGlow)
    lc(a.sky, b.sky, this.world.skyMat.color)
    if (this.roofMat) lc(a.roof, b.roof, this.roofMat.color)
    this.world.glassMat.opacity = ln(a.glassOpacity, b.glassOpacity)
    const shadeGlow = Math.min(ln(a.shadeGlow, b.shadeGlow) * Math.max(this.furnMult, 0.15), 1)
    for (const m of lampShadeMats) m.emissiveIntensity = shadeGlow
    const fairy = ln(a.fairy, b.fairy) * Math.min(Math.max(this.furnMult, 0.3), 1.4)
    this.world.fairyMats.forEach((m, i) => {
      m.color.set(FAIRY_BASE[i % 4]).multiplyScalar(0.45 + fairy * 0.9)
    })
    this.onBackground?.(
      '#' + new THREE.Color(a.bg[0]).lerp(new THREE.Color(b.bg[0]), k).getHexString(),
      '#' + new THREE.Color(a.bg[1]).lerp(new THREE.Color(b.bg[1]), k).getHexString()
    )
  }
}
