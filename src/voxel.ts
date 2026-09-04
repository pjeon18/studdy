import * as THREE from 'three'
import { toonRamp } from './build'

type Face = {
  dir: [number, number, number]
  corners: [number, number, number][]
  shade: number
}
const FACES: Face[] = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], shade: 0.88 },
  { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], shade: 0.92 },
  { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], shade: 0.7 },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], shade: 1.0 },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], shade: 0.85 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], shade: 0.95 },
]

// AO levels: 3 = open, 0 = tight corner. Crevice-only darkness keeps flats clean.
const AO_MULT = [0.55, 0.72, 0.88, 1.0]

// numeric key: coords offset by +96, each < 1024, packed arithmetically (safe integers)
const OFF = 96
const SY = 1024
const SZ = 1024 * 1024
const keyOf = (x: number, y: number, z: number) => x + OFF + (y + OFF) * SY + (z + OFF) * SZ

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

export class VoxelGrid {
  private cells = new Map<number, string>()

  set(x: number, y: number, z: number, color: string) {
    this.cells.set(keyOf(x, y, z), color)
  }

  /** Inclusive box fill. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
          this.cells.set(keyOf(x, y, z), color)
  }

  carve(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
          this.cells.delete(keyOf(x, y, z))
  }

  /** Vertical cylinder, inclusive y range, centered on (cx, cz). */
  cylinder(cx: number, cz: number, y0: number, y1: number, r: number, color: string) {
    const ri = Math.ceil(r)
    for (let x = Math.floor(cx - ri); x <= Math.ceil(cx + ri); x++)
      for (let z = Math.floor(cz - ri); z <= Math.ceil(cz + ri); z++) {
        const dx = x + 0.5 - cx
        const dz = z + 0.5 - cz
        if (dx * dx + dz * dz > r * r) continue
        for (let y = y0; y <= y1; y++) this.cells.set(keyOf(x, y, z), color)
      }
  }

  disc(cx: number, cz: number, y: number, r: number, color: string) {
    this.cylinder(cx, cz, y, y, r, color)
  }

  /** Hollow out a vertical cylinder (for cup and jar openings). */
  carveCylinder(cx: number, cz: number, y0: number, y1: number, r: number) {
    const ri = Math.ceil(r)
    for (let x = Math.floor(cx - ri); x <= Math.ceil(cx + ri); x++)
      for (let z = Math.floor(cz - ri); z <= Math.ceil(cz + ri); z++) {
        const dx = x + 0.5 - cx
        const dz = z + 0.5 - cz
        if (dx * dx + dz * dz > r * r) continue
        for (let y = y0; y <= y1; y++) this.cells.delete(keyOf(x, y, z))
      }
  }

  /** Ring (one voxel tall) between radii. */
  ring(cx: number, cz: number, y: number, rOuter: number, rInner: number, color: string) {
    const ri = Math.ceil(rOuter)
    for (let x = Math.floor(cx - ri); x <= Math.ceil(cx + ri); x++)
      for (let z = Math.floor(cz - ri); z <= Math.ceil(cz + ri); z++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz)
        if (d <= rOuter && d >= rInner) this.cells.set(keyOf(x, y, z), color)
      }
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: string) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const dx = (x + 0.5 - cx) / rx
          const dy = (y + 0.5 - cy) / ry
          const dz = (z + 0.5 - cz) / rz
          if (dx * dx + dy * dy + dz * dz <= 1) this.cells.set(keyOf(x, y, z), color)
        }
  }

  sphere(cx: number, cy: number, cz: number, r: number, color: string) {
    this.ellipsoid(cx, cy, cz, r, r, r, color)
  }

  roundedBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string) {
    this.fill(x0, y0, z0, x1, y1, z1, color)
    for (const [cx, cz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]] as const) {
      for (let y = y0; y <= y1; y++) this.cells.delete(keyOf(cx, y, cz))
    }
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(keyOf(x, y, z))
  }

  /** Iterate cells as [x, y, z, color] — lets the 2D sprite painter project
   *  the exact same voxels the 3D mesh is built from. */
  *entries(): IterableIterator<[number, number, number, string]> {
    for (const [key, hex] of this.cells) {
      const x = (key % SY) - OFF
      const y = (Math.floor(key / SY) % 1024) - OFF
      const z = Math.floor(key / SZ) - OFF
      yield [x, y, z, hex]
    }
  }

  build(opts: { jitter?: number; ao?: boolean; noBottom?: boolean; material?: THREE.Material } = {}): THREE.Mesh {
    const jitter = opts.jitter ?? 0.014
    const useAO = opts.ao ?? true
    const noBottom = opts.noBottom ?? false
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const c = new THREE.Color()

    for (const [key, hex] of this.cells) {
      const x = (key % SY) - OFF
      const y = (Math.floor(key / SY) % 1024) - OFF
      const z = Math.floor(key / SZ) - OFF
      const j = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter
      for (const face of FACES) {
        const [nx, ny, nz] = face.dir
        if (noBottom && ny === -1) continue
        if (this.has(x + nx, y + ny, z + nz)) continue

        const ao: number[] = [1, 1, 1, 1]
        if (useAO) {
          for (let i = 0; i < 4; i++) {
            const corner = face.corners[i]
            let s1: [number, number, number], s2: [number, number, number]
            if (nx !== 0) {
              s1 = [0, corner[1] ? 1 : -1, 0]
              s2 = [0, 0, corner[2] ? 1 : -1]
            } else if (ny !== 0) {
              s1 = [corner[0] ? 1 : -1, 0, 0]
              s2 = [0, 0, corner[2] ? 1 : -1]
            } else {
              s1 = [corner[0] ? 1 : -1, 0, 0]
              s2 = [0, corner[1] ? 1 : -1, 0]
            }
            const side1 = this.has(x + nx + s1[0], y + ny + s1[1], z + nz + s1[2]) ? 1 : 0
            const side2 = this.has(x + nx + s2[0], y + ny + s2[1], z + nz + s2[2]) ? 1 : 0
            const cornerOcc = this.has(
              x + nx + s1[0] + s2[0],
              y + ny + s1[1] + s2[1],
              z + nz + s1[2] + s2[2]
            ) ? 1 : 0
            const level = side1 && side2 ? 0 : 3 - (side1 + side2 + cornerOcc)
            ao[i] = AO_MULT[level]
          }
        }

        const ndx = positions.length / 3
        for (let i = 0; i < 4; i++) {
          const corner = face.corners[i]
          positions.push(x + corner[0], y + corner[1], z + corner[2])
          normals.push(nx, ny, nz)
          c.set(hex).convertSRGBToLinear().multiplyScalar(face.shade * j * ao[i])
          colors.push(c.r, c.g, c.b)
        }
        if (ao[0] + ao[3] > ao[1] + ao[2]) {
          indices.push(ndx + 1, ndx + 3, ndx + 0, ndx + 0, ndx + 3, ndx + 2)
        } else {
          indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3)
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)

    const mat = opts.material ?? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
}
