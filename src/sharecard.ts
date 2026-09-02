// The share card: a pixel-art PNG of your café's calling card, sized for
// social posts. Everything is drawn on canvas from the live save — no
// screenshots, no servers.
import * as store from './store'
import { drawPortrait } from './ui'
import { makeLogo } from './pixelui'
import { getMyHandle, shareUrl, starsFor } from './social'

const W = 1080
const H = 1350

export async function makeShareCard(): Promise<string> {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.imageSmoothingEnabled = false

  // sky-blue checkerboard page, like the game's own backdrop
  g.fillStyle = '#B8E4F6'
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(255,255,255,0.16)'
  const sq = 90
  for (let y = 0; y < H / sq; y++)
    for (let x = 0; x < W / sq; x++) if ((x + y) % 2 === 0) g.fillRect(x * sq, y * sq, sq, sq)

  // the wordmark, big
  const { url, w: lw } = await makeLogo('Studdy')
  const logo = new Image()
  await new Promise<void>((res, rej) => {
    logo.onload = () => res()
    logo.onerror = () => rej(new Error('logo'))
    logo.src = url
  })
  const scale = 7
  g.drawImage(logo, (W - lw * scale) / 2, 90, lw * scale, logo.height * scale)

  // paper card
  const cx = 90
  const cy = 330
  const cw = W - 180
  const chh = 760
  g.fillStyle = 'rgba(74,50,38,0.2)'
  g.fillRect(cx + 14, cy + 14, cw, chh)
  g.fillStyle = '#FFF7E8'
  g.fillRect(cx, cy, cw, chh)
  g.lineWidth = 8
  g.strokeStyle = '#4A3226'
  g.strokeRect(cx, cy, cw, chh)
  // pink titlebar
  g.fillStyle = '#FFA9C1'
  g.fillRect(cx + 8, cy + 8, cw - 16, 84)
  g.fillStyle = '#FFFFFF'
  g.font = '700 44px "Studdy Digits", "Pixelify Sans", monospace'
  g.textAlign = 'left'
  g.fillText('come study with me ♪', cx + 40, cy + 66)

  // portrait in a frame
  const pc = document.createElement('canvas')
  pc.width = 96
  pc.height = 96
  const a = store.save.avatar
  drawPortrait(pc, a.hair, a.sweater, a.skin, a.glasses, a.hairStyle === 'long')
  const ps = 3.4
  const px = cx + 60
  const py = cy + 150
  g.fillStyle = '#FFFDF4'
  g.fillRect(px - 10, py - 10, 96 * ps + 20, 96 * ps + 20)
  g.strokeStyle = '#4A3226'
  g.lineWidth = 6
  g.strokeRect(px - 10, py - 10, 96 * ps + 20, 96 * ps + 20)
  g.drawImage(pc, px, py, 96 * ps, 96 * ps)

  // café name + handle + stars
  const name = store.save.info.name || 'my'
  const handle = getMyHandle()
  const tx = px + 96 * ps + 50
  g.fillStyle = '#4A3226'
  g.font = '700 58px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText(`${name}'s café`, tx, py + 80)
  g.fillStyle = '#8A6D52'
  g.font = '700 40px "Studdy Digits", "Pixelify Sans", monospace'
  if (handle) g.fillText(`@${handle}`, tx, py + 140)
  const minutes = store.save.goals.counters.hostTotal ?? 0
  g.fillStyle = '#FFC24D'
  g.font = '700 52px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText('★'.repeat(starsFor(minutes)) + '☆'.repeat(5 - starsFor(minutes)), tx, py + 215)
  g.fillStyle = '#8A6D52'
  g.font = '700 34px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText(`lv ${store.levelInfo().level} studier · ${minutes} min hosted`, tx, py + 270)

  // pitch lines
  g.fillStyle = '#4A3226'
  g.font = '700 42px "Studdy Digits", "Pixelify Sans", monospace'
  g.textAlign = 'center'
  g.fillText('a tiny café where real people', W / 2, cy + 560)
  g.fillText('study together — 25/5 sprints ♪', W / 2, cy + 618)

  // the link, framed like a button
  const link = shareUrl() ?? 'pjeon18.github.io/studdy'
  const short = link.replace(/^https?:\/\//, '')
  g.font = '700 38px "Studdy Digits", "Pixelify Sans", monospace'
  const bw = Math.min(cw - 80, g.measureText(short).width + 90)
  const bx = (W - bw) / 2
  const by = cy + 650
  g.fillStyle = '#FF7A9E'
  g.fillRect(bx, by, bw, 76)
  g.strokeStyle = '#4A3226'
  g.lineWidth = 6
  g.strokeRect(bx, by, bw, 76)
  g.fillStyle = '#FFFFFF'
  g.fillText(short, W / 2, by + 52)

  // footer
  g.fillStyle = '#4A3226'
  g.font = '700 36px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText('studdy · a study spot that never closes ♪', W / 2, H - 90)

  return cv.toDataURL('image/png')
}

/** Build the card and hand it to the browser as a download. */
export async function downloadShareCard() {
  const data = await makeShareCard()
  const aEl = document.createElement('a')
  aEl.href = data
  aEl.download = `studdy-${getMyHandle() ?? 'cafe'}.png`
  aEl.click()
}

/** The weekly recap: how the week of studying actually went. */
export async function makeWeekCard(): Promise<string> {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.imageSmoothingEnabled = false

  // lavender dusk checkerboard for the recap
  g.fillStyle = '#CDBBE8'
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(255,255,255,0.14)'
  const sq = 90
  for (let y = 0; y < H / sq; y++)
    for (let x = 0; x < W / sq; x++) if ((x + y) % 2 === 0) g.fillRect(x * sq, y * sq, sq, sq)

  const { url, w: lw } = await makeLogo('Studdy')
  const logo = new Image()
  await new Promise<void>((res, rej) => {
    logo.onload = () => res()
    logo.onerror = () => rej(new Error('logo'))
    logo.src = url
  })
  g.drawImage(logo, (W - lw * 7) / 2, 90, lw * 7, logo.height * 7)

  const cx = 90
  const cy = 330
  const cw = W - 180
  const chh = 780
  g.fillStyle = 'rgba(58,40,70,0.25)'
  g.fillRect(cx + 14, cy + 14, cw, chh)
  g.fillStyle = '#FFF7E8'
  g.fillRect(cx, cy, cw, chh)
  g.lineWidth = 8
  g.strokeStyle = '#4A3226'
  g.strokeRect(cx, cy, cw, chh)
  g.fillStyle = '#FFA9C1'
  g.fillRect(cx + 8, cy + 8, cw - 16, 84)
  g.fillStyle = '#FFFFFF'
  g.font = '700 44px "Studdy Digits", "Pixelify Sans", monospace'
  g.textAlign = 'left'
  g.fillText('my study week ♪', cx + 40, cy + 66)

  const name = store.save.info.name || 'someone'
  const minutes = store.save.goals.counters[`wk:${store.weekStamp()}:min`] ?? 0
  const hours = Math.floor(minutes / 60)
  const big = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes} min`

  g.fillStyle = '#8A6D52'
  g.font = '700 40px "Studdy Digits", "Pixelify Sans", monospace'
  g.textAlign = 'center'
  g.fillText(`${name} focused for`, W / 2, cy + 200)
  g.fillStyle = '#FF7A9E'
  g.font = '700 130px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText(big, W / 2, cy + 350)
  g.fillStyle = '#8A6D52'
  g.font = '700 40px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText('this week', W / 2, cy + 420)

  const rows: [string, string][] = [
    ['streak', store.save.streak.count > 0 ? `${store.save.streak.count} days ★ (best ${store.save.streak.best})` : 'starts today ♪'],
    ['level', `lv ${store.levelInfo().level}`],
    ['lifetime beans', `${store.save.lifetimeBeans.toLocaleString()} ◍`],
  ]
  g.font = '700 38px "Studdy Digits", "Pixelify Sans", monospace'
  rows.forEach(([k, v], i) => {
    const ry = cy + 510 + i * 66
    g.textAlign = 'left'
    g.fillStyle = '#8A6D52'
    g.fillText(k, cx + 70, ry)
    g.textAlign = 'right'
    g.fillStyle = '#4A3226'
    g.fillText(v, cx + cw - 70, ry)
  })

  const link = shareUrl() ?? 'pjeon18.github.io/studdy'
  g.textAlign = 'center'
  g.fillStyle = '#FF7A9E'
  g.font = '700 36px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText(link.replace(/^https?:\/\//, ''), W / 2, cy + chh - 40)

  g.fillStyle = '#4A3226'
  g.font = '700 36px "Studdy Digits", "Pixelify Sans", monospace'
  g.fillText('studdy · a study spot that never closes ♪', W / 2, H - 90)
  return cv.toDataURL('image/png')
}

export async function downloadWeekCard() {
  const data = await makeWeekCard()
  const aEl = document.createElement('a')
  aEl.href = data
  aEl.download = `studdy-week-${getMyHandle() ?? 'recap'}.png`
  aEl.click()
}
