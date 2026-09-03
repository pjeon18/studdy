// Renders public/og.png (1200x630) with the game's own pixel wordmark.
// Run with the dev server up: node scripts/gen-og.mjs
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('http://localhost:5230/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500) // fonts + modules settle
const data = await page.evaluate(async () => {
  const { makeLogo } = await import('/src/pixelui.ts')
  const { url, w, h } = await makeLogo('Studdy')
  const img = new Image()
  await new Promise((res) => { img.onload = res; img.src = url })
  await document.fonts.load('700 34px "Pixelify Sans"')
  const c = document.createElement('canvas')
  c.width = 1200; c.height = 630
  const x = c.getContext('2d')
  x.fillStyle = '#BCD9EE'
  x.fillRect(0, 0, 1200, 630)
  x.fillStyle = '#C9E2F3'
  const T = 42
  for (let i = 0; i < 1200 / T; i++) for (let j = 0; j < 630 / T; j++) if ((i + j) % 2 === 0) x.fillRect(i * T, j * T, T, T)
  x.imageSmoothingEnabled = false
  const s = 7
  const lw = w * s, lh = h * s
  x.globalAlpha = 0.25
  x.drawImage(img, (1200 - lw) / 2 + 10, 200, lw, lh)
  x.globalAlpha = 1
  x.drawImage(img, (1200 - lw) / 2, 190, lw, lh)
  x.font = '700 34px "Pixelify Sans", monospace'
  x.textAlign = 'center'
  x.fillStyle = '#3E3428'
  x.fillText('a study spot that never closes ♪', 600, 470)
  x.font = '500 26px "Pixelify Sans", monospace'
  x.fillStyle = '#6B5D4A'
  x.fillText('sit down with real people · one shared 25/5 clock', 600, 516)
  return c.toDataURL('image/png')
})
writeFileSync('public/og.png', Buffer.from(data.split(',')[1], 'base64'))
console.log('public/og.png written,', data.length, 'chars')
await browser.close()
