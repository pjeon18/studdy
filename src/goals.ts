// Goals: built-in mission CHAINS (one visible tier at a time — finish it and
// the next stage appears, with stars marking the stage) plus self-set
// daily/weekly goals on the honor system. Self-set goals can only be claimed
// the NEXT day — no impulse-claiming — and their rewards are slider-capped
// (daily ≤ 10◍, weekly ≤ 30◍, three of each at a time).
import * as store from './store'
import { toggleRightWindow, esc, toast } from './ui'
import { listFriends } from './social'
import { sfx } from './sounds'

interface Tier {
  goal: number
  beans: number
  xp: number
}
interface Chain {
  key: string
  label: (goal: number) => string
  /** goals.counters key — chains without one read the live friend count. */
  counter?: string
  tiers: Tier[]
}

const CHAINS: Chain[] = [
  {
    key: 'friends',
    label: (n) => `make ${n} friends`,
    tiers: [
      { goal: 3, beans: 100, xp: 15 },
      { goal: 10, beans: 250, xp: 45 },
      { goal: 15, beans: 500, xp: 100 },
    ],
  },
  {
    key: 'visits',
    label: (n) => `visit ${n} cafés`,
    counter: 'visits',
    tiers: [
      { goal: 5, beans: 50, xp: 10 },
      { goal: 15, beans: 120, xp: 25 },
      { goal: 40, beans: 300, xp: 60 },
    ],
  },
  {
    key: 'focus',
    label: (n) => `study ${n} focused minutes`,
    counter: 'focusMin',
    tiers: [
      { goal: 60, beans: 60, xp: 10 },
      { goal: 300, beans: 150, xp: 30 },
      { goal: 1000, beans: 400, xp: 80 },
    ],
  },
  {
    key: 'chat',
    label: (n) => `say hi ${n} times in café chat`,
    counter: 'chats',
    tiers: [
      { goal: 5, beans: 25, xp: 5 },
      { goal: 25, beans: 60, xp: 15 },
      { goal: 100, beans: 150, xp: 30 },
    ],
  },
  { key: 'salon', label: () => 'change your look at a salon', counter: 'salon', tiers: [{ goal: 1, beans: 30, xp: 5 }] },
  { key: 'note', label: () => 'sign a guestbook out in the world', counter: 'notes', tiers: [{ goal: 1, beans: 40, xp: 5 }] },
]

const missionId = (chain: Chain, tier: Tier) => `${chain.key}-${tier.goal}`

export function buildGoals(ui: HTMLElement) {
  const tab = document.createElement('button')
  tab.className = 'glossy-btn goals-tab rslot-tab'
  tab.textContent = '✔ goals'
  ui.appendChild(tab)
  const badge = document.createElement('span')
  badge.className = 'px-badge hidden'
  tab.appendChild(badge)

  const win = document.createElement('div')
  win.className = 'y2k-window goals-window rslot-window hidden'
  win.innerHTML = `
    <div class="y2k-titlebar"><span class="tb-dots"><i></i><i></i></span><span class="tb-title">goals</span><button class="tb-close">×</button></div>
    <div class="y2k-body goals-body">
      <div class="fr-head">missions ♪</div>
      <div class="gl-missions"></div>
      <div class="fr-head">your own goals ♪</div>
      <div class="gl-custom"></div>
      <div class="gl-add">
        <input class="px-input gl-text" placeholder="a goal for yourself…" maxlength="60" />
        <div class="gl-add-row">
          <span class="gl-opts gl-cad"></span>
          <label class="gl-slider-row">
            <input type="range" class="lights-slider gl-range" min="1" max="10" value="5" />
            <b class="gl-val">5◍</b>
          </label>
          <button class="glossy-btn btn-pink ed-mini gl-save">add ♪</button>
        </div>
      </div>
      <div class="ed-note">your goals are on your honor — rewards unlock the next day ♪</div>
    </div>
  `
  ui.appendChild(win)
  win.querySelector('.tb-close')!.addEventListener('click', () => win.classList.add('hidden'))
  const missionsEl = win.querySelector('.gl-missions') as HTMLElement
  const customEl = win.querySelector('.gl-custom') as HTMLElement
  const textIn = win.querySelector('.gl-text') as HTMLInputElement

  // cadence toggle + reward slider (the cap follows the cadence)
  let pickCad: 'daily' | 'weekly' = 'daily'
  const cadEl = win.querySelector('.gl-cad') as HTMLElement
  const range = win.querySelector('.gl-range') as HTMLInputElement
  const valEl = win.querySelector('.gl-val') as HTMLElement
  const paintPickers = () => {
    cadEl.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.v === pickCad))
    range.max = String(store.GOAL_CAP[pickCad])
    if (Number(range.value) > store.GOAL_CAP[pickCad]) range.value = range.max
    valEl.textContent = `${range.value}◍`
  }
  for (const v of ['daily', 'weekly'] as const) {
    const b = document.createElement('button')
    b.className = 'glossy-btn ed-mini gl-opt'
    b.dataset.v = v
    b.textContent = v
    b.addEventListener('click', () => {
      pickCad = v
      paintPickers()
    })
    cadEl.appendChild(b)
  }
  range.addEventListener('input', paintPickers)
  paintPickers()
  win.querySelector('.gl-save')!.addEventListener('click', () => {
    const problem = store.addGoal(textIn.value, Number(range.value), pickCad)
    if (problem) {
      toast(problem)
      return
    }
    textIn.value = ''
    sfx.tick()
    render()
  })

  let friendCount = 0

  const chainProgress = (c: Chain): number => (c.counter ? store.save.goals.counters[c.counter] ?? 0 : friendCount)

  /** The first unclaimed tier of a chain (null = the whole chain is done). */
  const currentTier = (c: Chain): { tier: Tier; idx: number } | null => {
    const claimed = store.save.goals.missionsClaimed
    for (let i = 0; i < c.tiers.length; i++) if (!claimed.includes(missionId(c, c.tiers[i]))) return { tier: c.tiers[i], idx: i }
    return null
  }

  /** Rewards ready to collect right now (missions + next-day custom goals). */
  const claimableCount = (): number => {
    let n = 0
    for (const c of CHAINS) {
      const cur = currentTier(c)
      if (cur && chainProgress(c) >= cur.tier.goal) n++
    }
    for (const g of store.save.goals.custom) if (store.goalClaimable(g)) n++
    return n
  }

  const paintBadge = () => {
    const n = claimableCount()
    badge.textContent = String(Math.min(n, 9))
    badge.classList.toggle('hidden', n <= 0)
  }

  function render() {
    missionsEl.textContent = ''
    for (const c of CHAINS) {
      const cur = currentTier(c)
      const row = document.createElement('div')
      const stars =
        c.tiers.length > 1
          ? cur
            ? '★'.repeat(cur.idx + 1) + '☆'.repeat(c.tiers.length - cur.idx - 1)
            : '★'.repeat(c.tiers.length)
          : ''
      if (!cur) {
        // the whole chain is finished — a quiet full-star receipt
        const last = c.tiers[c.tiers.length - 1]
        row.className = 'gl-row gl-done'
        row.innerHTML = `
          <span class="gl-label">${c.label(last.goal)}<i>all done ♪</i></span>
          ${stars ? `<span class="gl-stars">${stars}</span>` : ''}
        `
        missionsEl.appendChild(row)
        continue
      }
      const n = Math.min(cur.tier.goal, chainProgress(c))
      row.className = 'gl-row'
      row.innerHTML = `
        <span class="gl-label">${c.label(cur.tier.goal)}<i>${n} / ${cur.tier.goal}</i></span>
        ${stars ? `<span class="gl-stars">${stars}</span>` : ''}
        <span class="gl-reward">${cur.tier.beans}◍ · ${cur.tier.xp}xp</span>
      `
      if (n >= cur.tier.goal) {
        const b = document.createElement('button')
        b.className = 'glossy-btn btn-pink ed-mini'
        b.textContent = 'claim ♪'
        b.addEventListener('click', () => {
          if (store.claimMission(missionId(c, cur.tier), cur.tier.beans, cur.tier.xp)) {
            sfx.earn()
            const next = currentTier(c)
            toast(next ? `+${cur.tier.beans}◍ — next up: ${c.label(next.tier.goal)} ♪` : `+${cur.tier.beans}◍ — chain complete ♪`)
            render()
          }
        })
        row.appendChild(b)
      }
      missionsEl.appendChild(row)
    }

    // self-set goals
    customEl.textContent = ''
    if (!store.save.goals.custom.length) {
      const note = document.createElement('div')
      note.className = 'ed-note'
      note.textContent = 'nothing yet — set a study goal below ♪'
      customEl.appendChild(note)
    }
    for (const g of store.save.goals.custom) {
      const row = document.createElement('div')
      row.className = 'gl-row'
      row.innerHTML = `
        <span class="gl-label">${esc(g.text)}<i>${g.cadence} · ${g.beans}◍</i></span>
      `
      const right = document.createElement('span')
      right.className = 'gl-actions'
      if (!g.doneAt) {
        const b = document.createElement('button')
        b.className = 'glossy-btn btn-mint ed-mini'
        b.textContent = 'did it ♪'
        b.addEventListener('click', () => {
          store.markGoalDone(g.id)
          sfx.pop()
          toast('marked done — claim it tomorrow ♪')
          render()
        })
        right.appendChild(b)
      } else if (store.goalClaimable(g)) {
        const b = document.createElement('button')
        b.className = 'glossy-btn btn-pink ed-mini'
        b.textContent = `claim ${g.beans}◍`
        b.addEventListener('click', () => {
          const beans = store.claimGoal(g.id)
          if (beans) {
            sfx.earn()
            toast(`+${beans} beans · +5xp for keeping your word ♪`)
          }
          render()
        })
        right.appendChild(b)
      } else {
        const wait = document.createElement('span')
        wait.className = 'gl-wait'
        wait.textContent = 'claim tomorrow ♪'
        right.appendChild(wait)
      }
      const del = document.createElement('button')
      del.className = 'glossy-btn ed-mini gl-del'
      del.textContent = '×'
      del.addEventListener('click', () => {
        store.removeGoal(g.id)
        render()
      })
      right.appendChild(del)
      row.appendChild(right)
      customEl.appendChild(row)
    }
    paintBadge()
  }

  tab.addEventListener('click', () => {
    toggleRightWindow(win, tab)
    if (!win.classList.contains('hidden')) {
      render()
      // friend missions read the live friend list
      listFriends().then(({ friends }) => {
        friendCount = friends.length
        if (!win.classList.contains('hidden')) render()
        paintBadge()
      })
    }
  })

  // the badge stays honest while the window is closed
  store.on('goals', paintBadge)
  setInterval(() => {
    listFriends().then(({ friends }) => {
      friendCount = friends.length
      paintBadge()
    })
  }, 120_000)
  setTimeout(paintBadge, 4000) // after boot settles

  // clubs: the tab lives with the club window in editor.ts now
}
