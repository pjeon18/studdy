// Generates public/studdy-digits.otf: just '2' and '5', drawn as chunky
// pixel glyphs on Pixelify Sans's exact metrics (advance 603/1000em,
// cap height 638) so they never cause width/height jitter.
import opentype from 'opentype.js'
import { writeFileSync } from 'node:fs'

const ADV = 603 // Pixelify digit advance per 1000 em
const CAP = 638 // Pixelify cap height
const COLS = 5
const ROWS = 7
const CW = 100 // cell width -> glyph 500 wide + ~50 bearings
const CH = CAP / ROWS
const X0 = (ADV - COLS * CW) / 2

// row 0 = top
const TWO = [
  '.XXX.',
  'X...X',
  '....X',
  '...X.',
  '..X..',
  '.X...',
  'XXXXX',
]
const FIVE = [
  'XXXXX',
  'X....',
  'XXXX.',
  '....X',
  '....X',
  'X...X',
  '.XXX.',
]

function glyphFromGrid(name, unicode, grid) {
  const path = new opentype.Path()
  grid.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      if (row[c] !== 'X') continue
      const x = X0 + c * CW
      const y = CAP - (r + 1) * CH // font Y-up, row 0 at top
      // tiny overlap so adjacent cells merge without hairlines
      const e = 1
      path.moveTo(x - e, y - e)
      path.lineTo(x + CW + e, y - e)
      path.lineTo(x + CW + e, y + CH + e)
      path.lineTo(x - e, y + CH + e)
      path.close()
    }
  })
  return new opentype.Glyph({ name, unicode, advanceWidth: ADV, path })
}

const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: ADV, path: new opentype.Path() })
const font = new opentype.Font({
  familyName: 'Studdy Digits',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs: [notdef, glyphFromGrid('two', 0x32, TWO), glyphFromGrid('five', 0x35, FIVE)],
})
writeFileSync('public/studdy-digits.otf', Buffer.from(font.toArrayBuffer()))
console.log('wrote public/studdy-digits.otf')
