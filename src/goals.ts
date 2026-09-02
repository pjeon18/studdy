// Goals: built-in missions (explore the game, make friends) plus self-set
// daily/weekly goals on the honor system. Self-set goals can only be claimed
// the NEXT day — no impulse-claiming your own rewards.
import * as store from './store'
import { toggleRightWindow, esc, toast } from './ui'
import { listFriends } from './social'
import { sfx } from './sounds'

interface Mission {
  id: string
  label: string
  beans: number
  xp: number
  goal: number
  /** goals.counters key — missions without one read the live friend count. */
  counter?: string
}

const MISSIONS: Mission[] = [
  { id: 'friends-3', label: 'make 3 friends', beans: 100, xp: 15, goal: 3 },
  { id: 'friends-10', label: 'make 10 friends', beans: 250, xp: 45, goal: 10 },
  { id: 'friends-15', label: 'make 15 friends', beans: 500, xp: 100, goal: 15 },
  { id: 'visits-5', label: 'visit 5 cafés', beans: 50, xp: 10, goal: 5, counter: 'visits' },
  { id: 'salon-1', label: 'change your look at a salon', beans: 30, xp: 5, goal: 1, counter: 'salon' },
  { id: 'note-1', label: 'sign a guestbook out in the world', beans: 40, xp: 5, goal: 1, counter: 'notes' },
  { id: 'chat-5', label: 'say hi 5 times in café chat', beans: 25, xp: 5, goal: 5, counter: 'chats' },
  { id: 'focus-60', label: 'study 60 focused minutes', beans: 60, xp: 10, goal: 60, counter: 'focusMin' },
  { id: 'focus-300', label: 'study 300 focused minutes', beans: 150, xp: 30, goal: 300, counter: 'focusMin' },
]

export function buildGoals(ui: HTMLElement) {
  const tab = document.createElement('button')
  tab.className = 'glossy-btn goals-tab rslot-tab'
  tab.textContent = '✔ goals'
  ui.appendChild(tab)

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
          <span class="gl-opts gl-beans"></span>
          <span class="gl-opts gl-cad"></span>
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

  // reward + cadence pickers for the add row
  let pickBeans = 15
  let pickCad: 'daily' | 'weekly' = 'daily'
  const beansEl = win.querySelector('.gl-beans') as HTMLElement
  const cadEl = win.querySelector('.gl-cad') as HTMLElement
  const paintPickers = () => {
    beansEl.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.v) === pickBeans))
    cadEl.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.v === pickCad))
  }
  for (const v of [5, 15, 25, 50]) {
    const b = document.createElement('button')
    b.className = 'glossy-btn ed-mini gl-opt'
    b.dataset.v = String(v)
    b.textContent = `${v}◍`
    b.addEventListener('click', () => {
      pickBeans = v
      paintPickers()
    })
    beansEl.appendChild(b)
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
  paintPickers()
  win.querySelector('.gl-save')!.addEventListener('click', () => {
    if (!textIn.value.trim()) {
      toast('write the goal first ♪')
      return
    }
    store.addGoal(textIn.value, pickBeans, pickCad)
    textIn.value = ''
    sfx.tick()
    render()
  })

  let friendCount = 0

  const missionProgress = (m: Mission): number =>
    m.counter ? store.save.goals.counters[m.counter] ?? 0 : friendCount

  function render() {
    // missions: unclaimed first, claimed sink to the bottom as receipts
    missionsEl.textContent = ''
    const claimed = store.save.goals.missionsClaimed
    const ordered = [...MISSIONS].sort((a, b) => Number(claimed.includes(a.id)) - Number(claimed.includes(b.id)))
    for (const m of ordered) {
      const done = claimed.includes(m.id)
      const n = Math.min(m.goal, missionProgress(m))
      const row = document.createElement('div')
      row.className = 'gl-row' + (done ? ' gl-done' : '')
      row.innerHTML = `
        <span class="gl-label">${m.label}<i>${done ? 'claimed ♪' : `${n} / ${m.goal}`}</i></span>
        <span class="gl-reward">${m.beans}◍ · ${m.xp}xp</span>
      `
      if (!done && n >= m.goal) {
        const b = document.createElement('button')
        b.className = 'glossy-btn btn-pink ed-mini'
        b.textContent = 'claim ♪'
        b.addEventListener('click', () => {
          if (store.claimMission(m.id, m.beans, m.xp)) {
            sfx.earn()
            toast(`+${m.beans} beans · +${m.xp}xp — nice ♪`)
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
  }

  tab.addEventListener('click', () => {
    toggleRightWindow(win, tab)
    if (!win.classList.contains('hidden')) {
      render()
      // friend missions read the live friend list
      listFriends().then(({ friends }) => {
        friendCount = friends.length
        if (!win.classList.contains('hidden')) render()
      })
    }
  })

  // clubs: coming later — the door is visible, just locked
  const clubs = document.createElement('button')
  clubs.className = 'glossy-btn clubs-tab rslot-tab locked'
  clubs.textContent = '♜ clubs'
  clubs.addEventListener('click', () => toast('study clubs unlock at level 10 — coming soon ♪'))
  ui.appendChild(clubs)
}
