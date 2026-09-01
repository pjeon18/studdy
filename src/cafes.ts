// The dream cafés: prebuilt model rooms anyone can visit and study in.
// Each is a room document + placed items + the regulars who study there.
import { PAL } from './build'
import type { PlacedItem, RoomDoc } from './types'

export interface SimPersona {
  name: string
  status: string
  working: string
  headphones: boolean
  streak: string
  hair: string
  sweater: string
  sweaterDeep: string
}

export interface DreamCafe {
  id: string
  name: string
  vibe: string
  ruleset: string
  desc: string
  /** Radio station id ('lofi' | 'rain' | 'off') — the owner's pick. */
  music: string
  /** Special venues: the styling mirror inside opens this customizer. */
  shop?: 'barber' | 'boutique'
  room: RoomDoc
  placed: PlacedItem[]
  sims: SimPersona[]
}

export type FriendState = 'studying' | 'online' | 'idle' | 'offline'

export interface Friend {
  name: string
  hair: string
  sweater: string
  state: FriendState
  /** DreamCafe id they're at right now, if any. */
  where?: string
  detail: string
  /** How long they've been at it (shown on its own line). */
  time?: string
}

let n = 0
function p(itemId: string, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0, variant?: string, on?: string): PlacedItem & { uid: string } {
  return { uid: `dc${n++}`, itemId, variant, x, z, rot, on }
}

// ---------- moon_latte's (the flagship, ported from the style showcase) ----------
const m: Record<string, PlacedItem> = {}
m.c1 = p('counter', 1.3, 6.5, 1)
m.c2 = p('counter', 1.3, 8.5, 1)
m.c3 = p('counter', 1.3, 10.5, 1)
m.esp = p('espresso', 1.3, 8.5, 1, undefined, m.c2.uid)
m.reg = p('register', 1.3, 6.4, 1, undefined, m.c1.uid)
m.cake = p('cake-stand', 1.3, 10.5, 0, undefined, m.c3.uid)
m.rug = p('rug-round', 9, 7.5, 0, 'pink')
m.t1 = p('table-m', 9, 7.5)
m.s1 = p('stool', 6.9, 7.5, 0, 'pink')
m.s2 = p('stool', 11.1, 7.5, 0, 'lavender')
m.ch1 = p('chair', 9, 5.2, 0, 'mint')
m.s3 = p('stool', 9, 9.8, 0, 'mint')
m.t2 = p('table-s', 15.5, 10.5)
m.ch2 = p('chair', 15.5, 8.6, 0, 'pink')
m.s4 = p('stool', 15.5, 12.3, 0, 'butter')
m.t3 = p('table-s', 14.5, 3.4)
m.s5 = p('stool', 12.7, 3.4, 0, 'mint')
m.s6 = p('stool', 16.3, 3.4, 0, 'pink')
m.shelf = p('bookshelf', 17.6, 1.1)
m.lamp = p('floor-lamp', 18.9, 3.6)
m.mon = p('monstera', 18.9, 12.9)
m.runner = p('rug-runner', 3.6, 8.5, 0, 'mint')
m.cat = p('cat-cushion', 4.6, 12.4)
m.lap = p('laptop-closed', 9, 6.9, 0, undefined, m.t1.uid)
m.mug1 = p('mug', 9.9, 8, 0, 'butter', m.t1.uid)
m.book1 = p('open-book', 15.5, 10.4, 0, undefined, m.t2.uid)
m.mug2 = p('mug', 14.1, 3.3, 0, 'mint', m.t3.uid)
m.plant1 = p('plant-s', 8.1, 8.2, 0, undefined, m.t1.uid)
m.menu = p('menu-board', 4.4, 1.2)
m.tree = p('fiddle-tree', 18.9, 6.2)
m.stack = p('book-stack', 16, 11.2, 0, undefined, m.t2.uid)
m.candle = p('candle', 15.2, 3.9, 0, 'cream', m.t3.uid)
m.gb = p('guestbook', 6.3, 1.2)

export const DREAM_CAFES: DreamCafe[] = [
  {
    id: 'moon-latte',
    name: "moon_latte's",
    vibe: 'rainy day regulars ☂',
    ruleset: '25 / 5',
    desc: 'the corner spot with the good window light. regulars keep their mugs on the middle table — take any seat, stay as long as you like.',
    music: 'lofi',
    room: {
      w: 20,
      d: 14,
      floor: 'honey',
      wallStyle: 'cream',
      openings: [
        { id: 'd', wall: 'left', kind: 'door', start: 1.5, width: 2.5 },
        { id: 'w1', wall: 'back', kind: 'window', start: 3, width: 5 },
        { id: 'w2', wall: 'back', kind: 'window', start: 11, width: 5 },
        { id: 'w3', wall: 'left', kind: 'window', start: 6.5, width: 4 },
      ],
    },
    placed: Object.values(m),
    sims: [
      {
        name: 'moon_latte',
        status: '"finals in 3 days… fighting ✩"',
        working: 'orgo pset 4',
        headphones: true,
        streak: '12 days ★',
        hair: PAL.hairCocoa,
        sweater: PAL.pink,
        sweaterDeep: PAL.pinkDeep,
      },
      {
        name: 'mochi_bear',
        status: '"thesis szn, send snacks"',
        working: 'lit review ch. 2',
        headphones: true,
        streak: '4 days ★',
        hair: '#4E3B30',
        sweater: PAL.lavender,
        sweaterDeep: PAL.lavenderDeep,
      },
      {
        name: 'study_owl',
        status: '"night shift ☾"',
        working: 'flashcards',
        headphones: false,
        streak: '21 days ★',
        hair: '#C89058',
        sweater: PAL.mint,
        sweaterDeep: PAL.mintDeep,
      },
    ],
  },
  (() => {
    const h: PlacedItem[] = []
    const grid: [number, number][] = [[7, 5], [7, 11], [14, 5], [14, 11]]
    for (const [gx, gz] of grid) {
      const t = p('table-s', gx, gz)
      h.push(t)
      h.push(p('stool', gx - 1.8, gz, 0, 'mint'))
      h.push(p('stool', gx + 1.8, gz, 0, 'lavender'))
      h.push(p('open-book', gx, gz - 0.1, 0, undefined, t.uid))
    }
    const tm = p('table-m', 20, 8)
    h.push(tm)
    h.push(p('stool', 17.9, 8, 0, 'mint'))
    h.push(p('stool', 22.1, 8, 0, 'mint'))
    h.push(p('chair', 20, 5.7, 0, 'lavender'))
    h.push(p('laptop-closed', 20, 7.4, 0, undefined, tm.uid))
    h.push(p('bookshelf', 16, 1.1), p('bookshelf', 20.8, 1.1))
    h.push(p('floor-lamp', 2.2, 14.5), p('floor-lamp', 22.6, 14.6))
    h.push(p('rug-runner', 10.5, 8, 1, 'lavender'))
    h.push(p('monstera', 1.4, 1.6))
    h.push(p('plant-s', 7, 4.9, 0, undefined, h[0].uid))
    h.push(p('piano', 11, 15, 2))
    h.push(p('cactus', 23.2, 1.3))
    h.push(p('guestbook', 4.6, 1.2))
    return {
      id: 'harbor-light',
      name: 'harbor light',
      vibe: 'deep work, quiet please',
      ruleset: '50 / 10',
      desc: 'long sprints, low voices. the piano only gets played on breaks. seats by the windows go first — come early.',
      music: 'rain',
      room: {
        w: 24,
        d: 16,
        floor: 'pale',
        wallStyle: 'mint',
        openings: [
          { id: 'd', wall: 'back', kind: 'door', start: 2, width: 2.5 },
          { id: 'w1', wall: 'back', kind: 'window', start: 7, width: 5 },
          { id: 'w2', wall: 'back', kind: 'window', start: 15.5, width: 5 },
          { id: 'w3', wall: 'left', kind: 'window', start: 3, width: 4.5 },
          { id: 'w4', wall: 'left', kind: 'window', start: 10, width: 4.5 },
        ],
      } as RoomDoc,
      placed: h,
      sims: [
        {
          name: 'quiet_quokka',
          status: '"one more chapter"',
          working: 'MCAT bio',
          headphones: true,
          streak: '33 days ★',
          hair: '#A25B3C',
          sweater: PAL.denim,
          sweaterDeep: '#5A6AA0',
        },
        {
          name: 'latte_luna',
          status: '"citations are my villain arc"',
          working: 'bibliography',
          headphones: true,
          streak: '7 days ★',
          hair: PAL.hairCocoa,
          sweater: PAL.butter,
          sweaterDeep: '#EEC06A',
        },
        {
          name: 'pixel_prof',
          status: '"office hours, but cozy"',
          working: 'grading',
          headphones: false,
          streak: '2 days ★',
          hair: '#4E3B30',
          sweater: PAL.mint,
          sweaterDeep: PAL.mintDeep,
        },
      ],
    }
  })(),
  (() => {
    const q: PlacedItem[] = []
    const st1 = p('side-table', 3.4, 9.9)
    const ls = p('loveseat', 7.2, 9.3, 2, 'pink')
    const ac1 = p('armchair', 3.4, 5.2, 1, 'lavender')
    const st2 = p('side-table', 3.4, 7.3)
    const t = p('table-s', 11.5, 4.4)
    q.push(p('rug-round', 7.2, 7.6, 0, 'pink'), p('rug-round', 11.5, 4.4, 0, 'lavender'))
    q.push(st1, ls, ac1, st2, t)
    q.push(p('chair', 11.5, 2.6, 0, 'pink'), p('chair', 11.5, 6.2, 2, 'butter'))
    q.push(p('mug', 3.4, 9.8, 0, 'pink', st1.uid))
    q.push(p('mug', 3.4, 7.2, 0, 'lavender', st2.uid))
    q.push(p('open-book', 11.5, 4.3, 0, undefined, t.uid))
    q.push(p('floor-lamp', 15, 6.6))
    q.push(p('monstera', 14.6, 10.8))
    q.push(p('cat-cushion', 13.4, 8.6))
    q.push(p('bookshelf', 13.8, 0.9))
    const ct = p('coffee-table', 7.2, 6.3)
    q.push(ct)
    q.push(p('floor-cushion', 9.8, 6.3, 0, 'butter'))
    q.push(p('teapot', 7.6, 6.2, 0, 'berry', ct.uid))
    q.push(p('jukebox', 1.6, 10.4, 1, undefined))
    q.push(p('guestbook', 1.4, 5.4))
    return {
      id: 'petal-bean',
      name: 'petal & bean',
      vibe: 'soft chairs, soft music ♪',
      ruleset: '25 / 5',
      desc: 'reading-chair energy. the jukebox hums all day and the cat picks who it sits with. gentle work only — no deadlines allowed past the door.',
      music: 'lofi',
      room: {
        w: 16,
        d: 12,
        floor: 'checker',
        wallStyle: 'pink',
        openings: [
          { id: 'd', wall: 'left', kind: 'door', start: 1.5, width: 2.5 },
          { id: 'w1', wall: 'back', kind: 'window', start: 3.5, width: 4.5 },
          { id: 'w2', wall: 'back', kind: 'window', start: 10, width: 4.5 },
        ],
      } as RoomDoc,
      placed: q,
      sims: [
        {
          name: 'peach_pit',
          status: '"reading for fun (allegedly)"',
          working: 'a novel',
          headphones: true,
          streak: '9 days ★',
          hair: '#C89058',
          sweater: PAL.pink,
          sweaterDeep: PAL.pinkDeep,
        },
        {
          name: 'clover_club',
          status: '"gentle grind hours"',
          working: 'journaling',
          headphones: false,
          streak: '15 days ★',
          hair: '#7C5940',
          sweater: PAL.lavender,
          sweaterDeep: PAL.lavenderDeep,
        },
      ],
    }
  })(),
]

// ---------- the high street: shops where you restyle your character ----------
function makeShop(kind: 'barber' | 'boutique'): DreamCafe {
  const items: PlacedItem[] = []
  const barber = kind === 'barber'
  const shopCounter = p('counter', 1.3, 7, 1, barber ? 'white' : 'pale')
  items.push(p('salon-mirror', 4, 1.6), p('salon-mirror', 7, 1.6))
  items.push(shopCounter)
  items.push(p('register', 1.3, 6.9, 1, undefined, shopCounter.uid))
  items.push(p('chair', 4, 3.4, 2, barber ? 'sky' : 'berry'))
  items.push(p('chair', 7, 3.4, 2, barber ? 'sky' : 'berry'))
  items.push(p('bench', 8.5, 8.6, 0, 'cream'))
  items.push(p('plant-s', 1.4, 7.6, 0, undefined, shopCounter.uid))
  if (barber) {
    const st = p('side-table', 5.5, 3.4)
    items.push(st, p('vase-flowers', 5.5, 3.3, 0, 'sky', st.uid))
  } else {
    items.push(p('coat-rack', 10.2, 2), p('coat-rack', 10.2, 4), p('coat-rack', 10.2, 6))
    items.push(p('rug-runner', 5.5, 6, 1, 'berry'))
  }
  return {
    id: kind === 'barber' ? 'snip-snip' : 'thread-thimble',
    name: barber ? 'snip snip ✂' : 'thread & thimble',
    vibe: barber ? 'walk-ins welcome' : 'try something new ♪',
    ruleset: 'no sprints here',
    desc: barber
      ? 'the neighborhood barbershop. sit down, look in the mirror, and pick a new you — hair, length, the works.'
      : 'a tiny boutique. sweaters in every color, and frames if you want them. the mirror never lies, but it is kind.',
    music: 'lofi',
    shop: kind,
    room: {
      w: 12,
      d: 10,
      floor: barber ? 'checker-sky' : 'white',
      wallStyle: barber ? 'sky' : 'pink',
      openings: [
        { id: 'd', wall: 'back', kind: 'door', start: 1.2, width: 2.2, doorKind: 'glass', doorColor: barber ? '#7383BC' : '#E77E9F' },
        { id: 'w1', wall: 'back', kind: 'window', start: 6.5, width: 4 },
      ],
    },
    placed: items,
    sims: [
      barber
        ? { name: 'buzz_barista', status: '"next!"', working: 'a fresh trim', headphones: false, streak: '∞ ★', hair: '#3A3230', sweater: PAL.denim, sweaterDeep: '#5A6AA0' }
        : { name: 'stitch_witch', status: '"that color suits you"', working: 'hemming', headphones: false, streak: '∞ ★', hair: '#C89058', sweater: PAL.pink, sweaterDeep: PAL.pinkDeep },
    ],
  }
}
DREAM_CAFES.push(makeShop('barber'), makeShop('boutique'))

// ---------- the friends list (simulated presence) ----------
export const FRIENDS: Friend[] = [
  { name: 'moon_latte', hair: PAL.hairCocoa, sweater: PAL.pink, state: 'studying', where: 'moon-latte', detail: 'orgo pset 4', time: '1h 46m' },
  { name: 'quiet_quokka', hair: '#A25B3C', sweater: PAL.denim, state: 'studying', where: 'harbor-light', detail: 'MCAT bio', time: '33m' },
  { name: 'latte_luna', hair: PAL.hairCocoa, sweater: PAL.butter, state: 'idle', where: 'harbor-light', detail: 'on break ♪' },
  { name: 'peach_pit', hair: '#C89058', sweater: PAL.pink, state: 'online', where: 'petal-bean', detail: 'picking a seat…' },
  { name: 'mochi_bear', hair: '#4E3B30', sweater: PAL.lavender, state: 'idle', where: 'moon-latte', detail: 'refilling coffee' },
  { name: 'study_owl', hair: '#C89058', sweater: PAL.mint, state: 'offline', detail: 'last seen 2h ago ☾' },
  { name: 'pixel_prof', hair: '#4E3B30', sweater: PAL.mint, state: 'offline', detail: 'last seen yesterday' },
]
