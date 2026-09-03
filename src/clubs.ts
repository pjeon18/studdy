// Study clubs (Build Plan 2 · T4): five-seat clans for level-10+ players.
// One shared clubhouse every member can furnish, a pooled treasury that
// pays for its furniture, and a +10% xp warmth bonus while a clubmate
// studies (granted server-side in session_beat). All writes go through
// the phase-6 RPCs; everything here no-ops quietly pre-migration or
// offline, like the rest of the social layer.
import { getSupabase, cloudUser } from './cloud'
import { sanitizeRoomPlaced, fetchProfiles, type PersonRef } from './social'
import type { DreamCafe } from './cafes'
import type { PlacedItem, RoomDoc } from './types'

export interface ClubMember extends PersonRef {
  role: 'leader' | 'member'
}

export interface Club {
  id: string
  handle: string
  name: string
  treasury: number
  room: RoomDoc
  placed: PlacedItem[]
  members: ClubMember[]
  myRole: 'leader' | 'member'
  updatedAt: number
}

const str = (v: unknown, max: number, fb = '') => (typeof v === 'string' ? v.slice(0, max) : fb)

let cached: Club | null = null
let checkedAt = 0

/** A cozy starter clubhouse: 16×12, a big table, seats, warm corners. */
function starterDoc(): { room: RoomDoc; placed: PlacedItem[] } {
  const room: RoomDoc = {
    w: 16,
    d: 12,
    floor: 'honey',
    wallStyle: 'cream',
    openings: [
      { id: 'd', wall: 'left', kind: 'door', start: 4, width: 2.5 },
      { id: 'w1', wall: 'back', kind: 'window', start: 3, width: 4 },
      { id: 'w2', wall: 'back', kind: 'window', start: 9, width: 4 },
    ],
  }
  let n = 0
  const p = (itemId: string, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0, variant?: string): PlacedItem => ({
    uid: `cb${n++}`,
    itemId,
    variant,
    x,
    z,
    rot,
  })
  const placed = [
    p('table-l', 8, 6),
    p('chair', 6.2, 6, 1),
    p('chair', 9.8, 6, 3),
    p('chair', 8, 4.2, 0),
    p('chair', 8, 7.8, 2),
    p('bookshelf', 2, 1.2),
    p('floor-lamp', 14.5, 1.4),
    p('monstera', 1.2, 10.5),
    p('rug-round', 8, 6),
  ]
  return { room, placed }
}

function rowToClub(row: Record<string, unknown>, members: ClubMember[], myRole: 'leader' | 'member'): Club {
  const { room, placed } = sanitizeRoomPlaced(row.doc)
  return {
    id: String(row.id),
    handle: str(row.handle, 20, '?'),
    name: str(row.name, 24, 'a club'),
    treasury: typeof row.treasury === 'number' ? Math.max(0, row.treasury) : 0,
    room,
    placed,
    members,
    myRole,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).getTime() : 0,
  }
}

/** My club, fresh from the server (null = not in one / offline / pre-phase6). */
export async function fetchMyClub(force = false): Promise<Club | null> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return cached
  if (!force && cached && Date.now() - checkedAt < 15_000) return cached
  const { data: mem, error } = await supa.from('club_members').select('club_id, role').eq('user_id', me.id).maybeSingle()
  if (error || !mem) {
    if (!error || error.code === '42P01' || error.code === 'PGRST205') cached = null
    checkedAt = Date.now()
    return error ? null : (cached = null)
  }
  const [{ data: club }, { data: roster }] = await Promise.all([
    supa.from('clubs').select('*').eq('id', mem.club_id).maybeSingle(),
    supa.from('club_members').select('user_id, role').eq('club_id', mem.club_id),
  ])
  if (!club) return (cached = null)
  const profiles = await fetchProfiles((roster ?? []).map((r) => r.user_id))
  const members: ClubMember[] = (roster ?? [])
    .map((r) => {
      const p = profiles.get(r.user_id)
      return p ? { ...p, role: (r.role === 'leader' ? 'leader' : 'member') as 'leader' | 'member' } : null
    })
    .filter((m): m is ClubMember => !!m)
  cached = rowToClub(club, members, mem.role === 'leader' ? 'leader' : 'member')
  checkedAt = Date.now()
  return cached
}

export function myClubCached(): Club | null {
  return cached
}

/** The uids of my clubmates (for the "clubmate is studying" warmth check). */
export function clubmateIds(): string[] {
  const me = cloudUser()
  if (!cached || !me) return []
  return cached.members.map((m) => m.userId).filter((id) => id !== me.id)
}

export async function createClub(handle: string, name: string): Promise<string | null> {
  const supa = getSupabase()
  if (!supa) return 'cloud is not configured'
  const { error } = await supa.rpc('club_create', { p_handle: handle, p_name: name })
  if (error) return friendly(error.message)
  const club = await fetchMyClub(true)
  if (club) await saveClubDoc(starterDoc()) // furnish the new clubhouse
  return null
}

export async function joinClub(handle: string): Promise<string | null> {
  const supa = getSupabase()
  if (!supa) return 'cloud is not configured'
  const { error } = await supa.rpc('club_join', { p_handle: handle })
  if (error) return friendly(error.message)
  await fetchMyClub(true)
  return null
}

export async function leaveClub(): Promise<void> {
  const supa = getSupabase()
  if (!supa) return
  await supa.rpc('club_leave')
  cached = null
}

export async function kickMember(userId: string): Promise<void> {
  const supa = getSupabase()
  if (!supa) return
  await supa.rpc('club_kick', { p_user: userId })
  await fetchMyClub(true)
}

/** Donate beans to the treasury. Returns the new balance, or -1. */
export async function donate(beans: number): Promise<number> {
  const supa = getSupabase()
  if (!supa) return -1
  const { data, error } = await supa.rpc('club_donate', { p_beans: beans })
  if (error || typeof data !== 'number' || data < 0) return -1
  if (cached) cached.treasury = data
  return data
}

/** Spend from the treasury. Returns the new balance, or -1 if it can't pay. */
export async function spendTreasury(cost: number): Promise<number> {
  const supa = getSupabase()
  if (!supa) return -1
  const { data, error } = await supa.rpc('club_spend', { p_cost: cost })
  if (error || typeof data !== 'number' || data < 0) return -1
  if (cached) cached.treasury = data
  return data
}

/** Push the shared room (last write wins). */
export async function saveClubDoc(doc: { room: RoomDoc; placed: PlacedItem[] }): Promise<void> {
  const supa = getSupabase()
  if (!supa || !cached) return
  cached.room = doc.room
  cached.placed = doc.placed
  await supa.rpc('club_save_doc', { p_doc: { v: 1, room: doc.room, placed: doc.placed } })
}

/** The clubhouse as a visitable café doc. */
export function clubhouseCafe(club: Club): DreamCafe {
  return {
    id: `club:${club.id}`,
    name: club.name,
    vibe: `@${club.handle} · club`,
    ruleset: '25 / 5 sprints',
    desc: 'the clubhouse — members make it home ♪',
    music: 'lofi',
    room: club.room,
    placed: club.placed,
    sims: [], // clubhouses are peopled by real members
  }
}

function friendly(msg: string): string {
  if (/level 10/.test(msg)) return 'clubs unlock at level 10 ♪'
  if (/already in a club/.test(msg)) return "you're already in a club ♪"
  if (/full/.test(msg)) return 'that club is full (5 seats)'
  if (/no such club/.test(msg)) return 'no club by that handle'
  if (/duplicate key/.test(msg)) return 'that handle is taken — try another ♪'
  if (/violates check/.test(msg)) return 'handles are 3–20 letters, numbers, - or _'
  if (/does not exist|schema cache/.test(msg)) return 'clubs are almost ready — try again soon ♪'
  return 'that didn’t work — try again ♪'
}
