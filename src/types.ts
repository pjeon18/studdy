// Data model for the room-as-data renderer and furnish loop (build plan §4).

export interface Opening {
  id: string
  wall: 'back' | 'left'
  kind: 'window' | 'door'
  /** Left edge along the wall, in world units. */
  start: number
  /** Width in world units. */
  width: number
  /** Doors only: slab color (hex) and construction. */
  doorColor?: string
  doorKind?: 'classic' | 'glass'
}

/** The player's look — edited at the barbershop & boutique. */
export interface Avatar {
  skin: string
  hair: string
  hairStyle: 'short' | 'long'
  sweater: string
  glasses: boolean
  /** Floating name-tag color (hex). Default white. */
  nameColor?: string
}

// Open-ended: the shell resolves ids from its FLOORS/WALLS catalogs (with fallback)
export type FloorStyle = string
export type WallStyle = string

export interface RoomDoc {
  w: number // world units, 10..32
  d: number // world units, 8..24
  floor: FloorStyle
  wallStyle: WallStyle
  openings: Opening[]
}

export type Placement = 'floor' | 'surface'

export interface CatalogItem {
  id: string
  name: string
  category: 'seating' | 'tables' | 'counter' | 'decor' | 'rugs' | 'plants' | 'things'
  /** Price in beans. */
  price: number
  /** Footprint in world units, before rotation (w along x, d along z). */
  footprint: [number, number]
  placement: Placement
  /** Seats this item provides (offsets in local units from center). */
  seats?: { dx: number; dz: number }[]
  /** Height of the seat top in world units (where a person sits). */
  seatY?: number
  /** 'item': sitters face the item's forward (+z at rot 0) — seats with backrests.
   *  Absent (backless seats): sitters face the nearest table instead. */
  seatFaces?: 'item'
  /** This item's top is a work surface (things can be placed on it). */
  surface?: { h: number; radius?: number } // height of the top in units; radius for round tops
  variants?: string[]
}

export interface PlacedItem {
  uid: string
  itemId: string
  variant?: string
  /** Center position in world units. */
  x: number
  z: number
  rot: 0 | 1 | 2 | 3
  /** uid of the surface item this sits on (for placement 'surface'). */
  on?: string
}

export interface Package {
  id: string
  items: Record<string, number>
  /** Epoch ms when the box lands at the door. */
  arriveAt: number
}

/** The café's public face: shown in the marquee + expandable info card. */
export interface CafeInfo {
  /** The owner's username — the marquee reads "{name}'s café". Empty = not onboarded yet. */
  name: string
  open: boolean
  rules: string
  desc: string
  /** Radio station id ('lofi' | 'rain' | 'off'). */
  music: string
  /** Visitors may sign the guestbook / leave hand-drawn notes. */
  guestbook: boolean
}

/** A self-set goal — honor system, claimable the NEXT day (no impulse-claiming). */
export interface CustomGoal {
  id: string
  text: string
  /** Self-chosen bean reward (small, capped in the UI). */
  beans: number
  cadence: 'daily' | 'weekly'
  createdAt: number
  /** When you marked it done (honor system). */
  doneAt?: number
  /** Last claim — daily/weekly goals re-arm after claiming. */
  claimedAt?: number
}

export interface GoalsState {
  custom: CustomGoal[]
  /** Built-in mission ids already claimed. */
  missionsClaimed: string[]
  /** Feature-usage counters missions read (visits, focusMin, chats, …). */
  counters: Record<string, number>
}

/** A hand-drawn note left in a café's guestbook. */
export interface GuestNote {
  id: string
  from: string
  /** PNG data URL of the drawing. */
  art: string
  at: number
}

export interface SaveDoc {
  v: number
  room: RoomDoc
  placed: PlacedItem[]
  inventory: Record<string, number>
  beans: number
  packages: Package[]
  info: CafeInfo
  /** Notes visitors left in YOUR guestbook. */
  guestbook: GuestNote[]
  /** When the gallery was last opened — later notes show a "new" pill. */
  guestbookSeenAt: number
  avatar: Avatar
  /** Item ids with not-yet-inspected additions (the red "new" pills). */
  newItems: string[]
  /** Lifetime experience — earned by studying and playing. */
  xp: number
  /** Every bean ever earned (spending doesn't reduce it). */
  lifetimeBeans: number
  goals: GoalsState
  /** Daily focus streak. One rest day pauses it; longer gaps start over. */
  streak: { count: number; best: number; lastDay: string }
}
