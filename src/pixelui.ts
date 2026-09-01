// Pixel-art UI chrome, authored the same way we author voxels: tiny sprite
// maps rendered to canvases and served to CSS as 9-slice border-images.
// Hard edges only — no blur, no gradients, no anti-aliasing.

const C = {
  O: '#4A3226', // cocoa outline
  h: '#FFFFFF', // highlight
  w: '#FFFFFF', // solid white (glove)
  f: '#FFF7E8', // cream face
  s: '#EBD3AE', // cream shade
  d: '#E2C79E', // inset face
  p: '#FFA9C1', // pink face
  P: '#FF7A9E', // deep pink
  q: '#FFD3E0', // pink highlight
  m: '#93DEC2', // mint face
  M: '#58A084', // mint deep
  b: '#FFD98E', // butter
  '.': null,
} as const
type Key = keyof typeof C

// night chrome: dark plum faces, same pink accents
const N: Record<string, string | null> = {
  ...C,
  O: '#221D2C',
  h: '#6B6178',
  f: '#453D52',
  s: '#37303F',
  d: '#3C3547',
}

function sprite(rows: string[], pal: Record<string, string | null> = C): string {
  const h = rows.length
  const w = rows[0].length
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = pal[row[x] as Key]
      if (!c) continue
      g.fillStyle = c
      g.fillRect(x, y, 1, 1)
    }
  })
  return `url("${cv.toDataURL()}")`
}

// 12x12, slice 4 — raised panel
const PANEL = [
  '..OOOOOOOO..',
  '.OhhhhhhhhO.',
  'OhffffffffhO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OsffffffffsO',
  '.OssssssssO.',
  '..OOOOOOOO..',
]

// 12x12, slice 4 — raised cream button
const BTN = [
  '..OOOOOOOO..',
  '.OhhhhhhhhO.',
  'OhffffffffhO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OffffffffffO',
  'OsffffffffsO',
  'OssssssssssO',
  '.OssssssssO.',
  '..OOOOOOOO..',
]

// pressed / active pink button: shade on top, no lift
const BTN_ACTIVE = [
  '..OOOOOOOO..',
  '.OPPPPPPPPO.',
  'OPppppppppPO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OqppppppppqO',
  '.OqqqqqqqqO.',
  '..OOOOOOOO..',
]

// primary pink CTA (raised)
const BTN_PINK = [
  '..OOOOOOOO..',
  '.OqqqqqqqqO.',
  'OqppppppppqO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OPppppppppPO',
  'OPPPPPPPPPPO',
  '.OPPPPPPPPO.',
  '..OOOOOOOO..',
]

// mint CTA (raised)
const BTN_MINT = [
  '..OOOOOOOO..',
  '.OhhhhhhhhO.',
  'OhmmmmmmmmhO',
  'OmmmmmmmmmmO',
  'OmmmmmmmmmmO',
  'OmmmmmmmmmmO',
  'OmmmmmmmmmmO',
  'OmmmmmmmmmmO',
  'OMmmmmmmmmMO',
  'OMMMMMMMMMMO',
  '.OMMMMMMMMO.',
  '..OOOOOOOO..',
]

// pink title band, slice 4 (flat, joins the panel below)
const TITLE = [
  '..OOOOOOOO..',
  '.OqqqqqqqqO.',
  'OqppppppppqO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OPppppppppPO',
  'OPPPPPPPPPPO',
  'OOOOOOOOOOOO',
]

// slider track, 8 tall, slice 3 (inset groove)
const TRACK = [
  '.OOOOOOOOOO.',
  'OssssssssssO',
  'OsddddddddsO',
  'OddddddddddO',
  'OddddddddddO',
  'OdhhhhhhhhdO',
  '.OOOOOOOOOO.',
]

// slider knob 12x12
const KNOB = [
  '...OOOOOO...',
  '..OqqqqqqO..',
  '.OqqppppqqO.',
  'OqpppppppppO',
  'OqpppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OppppppppppO',
  'OPpppppppPPO',
  '.OPppppppPO.',
  '..OPPPPPPO..',
  '...OOOOOO...',
]

// close button 12x12 (butter, cocoa X)
const CLOSE = [
  '...OOOOOO...',
  '..ObbbbbbO..',
  '.ObbbbbbbbO.',
  'ObbObbbbObbO',
  'ObbbObbObbbO',
  'ObbbbOObbbbO',
  'ObbbbOObbbbO',
  'ObbbObbObbbO',
  'ObbObbbbObbO',
  '.ObbbbbbbbO.',
  '..ObbbbbbO..',
  '...OOOOOO...',
]

// classic Y2K glove pointer, two frames (idle / pressed), pink cuff
const CURSOR_IDLE = [
  '...OO.........',
  '..OwwO........',
  '..OwwO........',
  '..OwwO........',
  '..OwwO........',
  '..OwwOOO......',
  '..OwwOwwOO....',
  '..OwwOwwOwwO..',
  '.OOwwwwwwwwOO.',
  'OwwwwwwwwwwwwO',
  'OwwwwwwwwwwwwO',
  'OwwwwwwwwwwwO.',
  '.OwwwwwwwwwwO.',
  '.OwwwwwwwwwO..',
  '..OwwwwwwwwO..',
  '..OOOOOOOOOO..',
  '..OqqqqqqqqO..',
  '..OPPPPPPPPO..',
  '...OOOOOOOO...',
]
const CURSOR_DOWN = [
  '..............',
  '..............',
  '..OOOO........',
  '..OwwO........',
  '..OwwO........',
  '..OwwOOO......',
  '..OwwOwwOO....',
  '..OwwOwwOwwO..',
  '.OOwwwwwwwwOO.',
  'OwwwwwwwwwwwwO',
  'OwwwwwwwwwwwwO',
  'OwwwwwwwwwwwO.',
  '.OwwwwwwwwwwO.',
  '.OwwwwwwwwwO..',
  '..OwwwwwwwwO..',
  '..OOOOOOOOOO..',
  '..OqqqqqqqqO..',
  '..OPPPPPPPPO..',
  '...OOOOOOOO...',
]

/** Oversized Y2K glove cursor that replaces the native pointer. */
/** The coffee-bean currency sprite (raw data URL, render with image-rendering: pixelated). */
export const beanURL = (() => {
  const rows = [
    '....ooooo....',
    '..oobbbbboo..',
    '.obbbcbbhhbo.',
    '.obbbcbbhhbo.',
    'obbbbccbbhbbo',
    'obbbbbcbbbbbo',
    'obbbbbccbbbbo',
    'obbbbbbcbbbbo',
    'obbbbbccbbbbo',
    'obbbbbcbbbbbo',
    '.obbbccbbbbo.',
    '.obbbcbbbbbo.',
    '..oobbbbboo..',
    '....ooooo....',
  ]
  const pal: Record<string, string> = { o: '#1E1610', b: '#B57A4A', c: '#6E4426', h: '#E0B587' }
  const cv = document.createElement('canvas')
  cv.width = rows[0].length
  cv.height = rows.length
  const g = cv.getContext('2d')!
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]]
      if (!c) continue
      g.fillStyle = c
      g.fillRect(x, y, 1, 1)
    }
  })
  return cv.toDataURL()
})()

/** Inline <img> HTML for the bean icon at a given CSS height. */
export function beanImg(h = 15): string {
  return `<img class="bean-ico" src="${beanURL}" style="height:${h}px" alt="beans" />`
}

export function installCursor() {
  const idle = sprite(CURSOR_IDLE)
  const down = sprite(CURSOR_DOWN)
  const el = document.createElement('div')
  el.id = 'px-cursor'
  el.style.backgroundImage = idle
  document.body.appendChild(el)
  const HOT_X = 10 // fingertip in CSS px (sprite col 3.5 x scale 3)
  const HOT_Y = 2
  let shown = false
  window.addEventListener('pointermove', (e) => {
    if (!shown) {
      el.style.opacity = '1'
      shown = true
    }
    el.style.transform = `translate3d(${e.clientX - HOT_X}px, ${e.clientY - HOT_Y}px, 0)`
  }, { passive: true })
  window.addEventListener('pointerdown', (e) => {
    el.style.backgroundImage = down
    el.classList.remove('cursor-pop')
    el.classList.add('cursor-press')
    el.style.transform = `translate3d(${e.clientX - HOT_X}px, ${e.clientY - HOT_Y}px, 0)`
  })
  window.addEventListener('pointerup', () => {
    el.style.backgroundImage = idle
    el.classList.remove('cursor-press')
    el.classList.add('cursor-pop')
  })
  document.documentElement.addEventListener('mouseleave', () => {
    el.style.opacity = '0'
    shown = false
  })
}

/**
 * Rasterize text into a pixel-art logo sprite: Pixelify letterforms → pixel
 * mask → pink fill with top highlight / bottom shade → 1px cocoa outline via
 * dilation. Returns a data URL sized in raw pixels (scale it up with
 * image-rendering: pixelated).
 */
export async function makeLogo(text: string): Promise<{ url: string; w: number; h: number }> {
  // rasterize large enough that letter counters (the holes in S, d, y) stay open
  await document.fonts.load('700 32px "Pixelify Sans"')
  const meas = document.createElement('canvas').getContext('2d')!
  meas.font = '700 32px "Pixelify Sans"'
  const w = Math.ceil(meas.measureText(text).width) + 2
  const h = 42
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const g = src.getContext('2d')!
  g.font = '700 32px "Pixelify Sans"'
  g.fillStyle = '#000'
  g.fillText(text, 1, 32)
  const data = g.getImageData(0, 0, w, h).data
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 128

  const W = w + 2
  const H = h + 2
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const o = out.getContext('2d')!
  for (let y = -1; y < h + 1; y++)
    for (let x = -1; x < w + 1; x++) {
      if (filled(x, y)) {
        let c: string = C.p!
        if (!filled(x, y - 1)) c = C.q! // top highlight
        else if (!filled(x, y + 1)) c = C.P! // bottom shade
        o.fillStyle = c
        o.fillRect(x + 1, y + 1, 1, 1)
      } else if (
        filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1) ||
        filled(x - 1, y - 1) || filled(x + 1, y - 1) || filled(x - 1, y + 1) || filled(x + 1, y + 1)
      ) {
        o.fillStyle = C.O
        o.fillRect(x + 1, y + 1, 1, 1)
      }
    }
  return { url: out.toDataURL(), w: W, h: H }
}

export function installPixelUI() {
  const r = document.documentElement.style
  r.setProperty('--px-panel', sprite(PANEL))
  r.setProperty('--px-btn', sprite(BTN))
  r.setProperty('--px-btn-active', sprite(BTN_ACTIVE))
  r.setProperty('--px-btn-pink', sprite(BTN_PINK))
  r.setProperty('--px-btn-mint', sprite(BTN_MINT))
  r.setProperty('--px-title', sprite(TITLE))
  r.setProperty('--px-track', sprite(TRACK))
  r.setProperty('--px-knob', sprite(KNOB))
  r.setProperty('--px-close', sprite(CLOSE))
  // night variants (body.ui-night swaps these in)
  r.setProperty('--px-panel-n', sprite(PANEL, N))
  r.setProperty('--px-btn-n', sprite(BTN, N))
  r.setProperty('--px-track-n', sprite(TRACK, N))
}
