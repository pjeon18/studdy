// The session-complete card: standing up from a real sitting (10+ focused
// minutes) earns a proper moment — bean confetti and a receipt — instead of
// a train of toasts. Short sits keep the quiet toast; this is for sessions.
export interface SummaryData {
  minutes: number
  beans: number
  checkin: boolean
  checkinBeans: number
  streakAdvanced: boolean
  streakCount: number
  streakBeans: number
  cafeName: string
}

const CONFETTI = ['#FF7A9E', '#FFC24D', '#58A084', '#A5D8F0', '#8A5A34']

export function showSessionSummary(ui: HTMLElement, d: SummaryData) {
  ui.querySelector('.sum-overlay')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'sum-overlay'

  let confetti = ''
  for (let i = 0; i < 26; i++) {
    const left = Math.round(Math.random() * 100)
    const delay = (Math.random() * 1.1).toFixed(2)
    const dur = (2.4 + Math.random() * 1.6).toFixed(2)
    const size = 5 + Math.round(Math.random() * 5)
    const c = CONFETTI[i % CONFETTI.length]
    confetti += `<i style="left:${left}%;width:${size}px;height:${size}px;background:${c};animation-delay:${delay}s;animation-duration:${dur}s"></i>`
  }

  const time = d.minutes >= 60 ? `${Math.floor(d.minutes / 60)}h ${String(d.minutes % 60).padStart(2, '0')}m` : `${d.minutes} minutes`
  const rows: string[] = [`<div class="sum-row"><span>focused time</span><b>${time}</b></div>`]
  rows.push(`<div class="sum-row"><span>beans earned</span><b>+${d.beans} ◍</b></div>`)
  if (d.checkin) rows.push(`<div class="sum-row"><span>first study today</span><b>+${d.checkinBeans} ◍</b></div>`)
  if (d.streakAdvanced && d.streakBeans > 0)
    rows.push(`<div class="sum-row"><span>${d.streakCount} day streak ★</span><b>+${d.streakBeans} ◍</b></div>`)
  if (d.cafeName && d.cafeName !== 'your café') rows.push(`<div class="sum-row"><span>studied at</span><b>${escHtml(d.cafeName)}</b></div>`)

  overlay.innerHTML = `
    <div class="sum-confetti">${confetti}</div>
    <div class="y2k-window sum-window">
      <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">session complete ♪</span><button class="tb-close">×</button></div>
      <div class="y2k-body sum-body">
        <div class="sum-big">${time} of focus</div>
        <div class="sum-rows">${rows.join('')}</div>
        <button class="glossy-btn btn-pink sum-done">back to the café ♪</button>
      </div>
    </div>
  `
  ui.appendChild(overlay)
  const done = () => overlay.remove()
  overlay.querySelector('.sum-done')!.addEventListener('click', done)
  overlay.querySelector('.tb-close')!.addEventListener('click', done)
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
