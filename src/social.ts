// The real social loop (Phase 3): publish your café so others can visit it,
// friend requests, and the cross-user guestbook — all on the Supabase tables
// in supabase/phase3.sql. Everything here no-ops quietly when the cloud (or
// the phase-3 schema) isn't there: the game stays fully playable local-only.
//
// Trust boundary: café documents, names, and notes fetched here are written
// by OTHER USERS. Every field is re-validated and capped before it reaches
// the renderer or the DOM (rendering also esc()'s all strings).
import { getSupabase, cloudUser, cloudConfigured } from './cloud'
import * as store from './store'
import { toast } from './ui'
import { CATALOG } from './items'
import type { DreamCafe } from './cafes'
import type { Opening, PlacedItem, RoomDoc } from './types'

const HEX = /^#[0-9a-fA-F]{6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface PersonRef {
  userId: string
  handle: string
  name: string
  avatar: { hair: string; sweater: string; skin?: string; glasses?: boolean; long?: boolean }
}
export interface FriendEntry extends PersonRef {
  rowId: number
}
export interface RequestEntry extends PersonRef {
  rowId: number
}
export interface CloudNote {
  id: number
  from: string
  art: string
  authorId: string
  at: number
}

let myHandle: string | null = null
let publishT: ReturnType<typeof setTimeout> | undefined
let warnedMissing = false
let onRequestCount: ((n: number) => void) | null = null

/** True once the phase-3 tables answered at least one query. */
let schemaOk = false

function missingSchema(err: { code?: string; message?: string } | null): boolean {
  // 42P01 = relation does not exist; PGRST205 = table not in schema cache
  const missing = !!err && (err.code === '42P01' || err.code === 'PGRST205')
  if (missing && !warnedMissing) {
    warnedMissing = true
    console.warn('[social] phase-3 tables not found — run supabase/phase3.sql to enable the social loop')
  }
  return missing
}

// ---------- profile + handle ----------

function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16)
  return s.length >= 3 ? s : (s + '-cafe').slice(0, 16)
}

function myAvatarBlob() {
  const a = store.save.avatar
  return { hair: a.hair, sweater: a.sweater, skin: a.skin, glasses: a.glasses, long: a.hairStyle === 'long' }
}

/** Make sure my profile row exists (claims a handle on first publish). */
async function ensureProfile(): Promise<boolean> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me || !store.save.info.name) return false
  if (myHandle) {
    // keep name/avatar fresh; the handle never changes on its own
    const { error } = await supa
      .from('profiles')
      .update({ name: store.save.info.name.slice(0, 20), avatar: myAvatarBlob(), updated_at: new Date().toISOString() })
      .eq('user_id', me.id)
    if (error) console.warn('[social] profile update failed:', error.message)
    return !error
  }
  const { data, error } = await supa.from('profiles').select('handle').eq('user_id', me.id).maybeSingle()
  if (error) {
    missingSchema(error)
    return false
  }
  schemaOk = true
  if (data?.handle) {
    myHandle = data.handle
    return ensureProfile() // refresh name/avatar through the update path
  }
  // claim a handle: the name slug, then salted retries on collision
  const base = slugify(store.save.info.name)
  for (let attempt = 0; attempt < 4; attempt++) {
    const salt = attempt === 0 ? '' : '-' + Math.random().toString(36).slice(2, 4)
    const handle = (base.slice(0, 19 - salt.length) + salt).replace(/-+$/, attempt === 0 ? '' : 'x')
    const { error: insErr } = await supa.from('profiles').insert({
      user_id: me.id,
      handle,
      name: store.save.info.name.slice(0, 20),
      avatar: myAvatarBlob(),
    })
    if (!insErr) {
      myHandle = handle
      return true
    }
    if (insErr.code !== '23505') {
      console.warn('[social] profile insert failed:', insErr.message)
      return false
    }
  }
  return false
}

export function getMyHandle(): string | null {
  return myHandle
}

/** The shareable "come study at my café" link. */
export function shareUrl(): string | null {
  if (!myHandle) return null
  return `${location.origin}${location.pathname}?cafe=${myHandle}`
}

// ---------- publishing my café ----------

/** The public slice of the save: room + furniture + info. Never inventory,
 *  beans, packages, xp, or guestbook contents. */
function publicDoc() {
  return {
    v: 1,
    room: store.save.room,
    placed: store.save.placed,
    info: store.save.info,
  }
}

async function publishNow() {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me || !store.save.info.name) return
  if (!(await ensureProfile())) return
  const doc = publicDoc()
  if (JSON.stringify(doc).length > 400_000) {
    console.warn('[social] café doc too large to publish')
    return
  }
  const { error } = await supa.from('cafes').upsert({
    user_id: me.id,
    open: !!store.save.info.open,
    doc,
    updated_at: new Date().toISOString(),
  })
  if (error && !missingSchema(error)) console.warn('[social] café publish failed:', error.message)
}

function schedulePublish() {
  clearTimeout(publishT)
  publishT = setTimeout(publishNow, 3000)
}

// ---------- fetching + sanitizing someone else's café ----------

function num(v: unknown, lo: number, hi: number, fb: number): number {
  return typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb
}
function str(v: unknown, max: number, fb = ''): string {
  return typeof v === 'string' ? v.slice(0, max) : fb
}

function sanitizeOpenings(raw: unknown, w: number, d: number): Opening[] {
  if (!Array.isArray(raw)) return []
  const out: Opening[] = []
  for (const o of raw.slice(0, 12)) {
    if (!o || typeof o !== 'object') continue
    const r = o as Record<string, unknown>
    const wall = r.wall === 'left' ? 'left' : r.wall === 'back' ? 'back' : null
    const kind = r.kind === 'door' ? 'door' : r.kind === 'window' ? 'window' : null
    if (!wall || !kind) continue
    const along = wall === 'left' ? d : w
    const op: Opening = {
      id: str(r.id, 24, `o${out.length}`),
      wall,
      kind,
      start: num(r.start, 0, along, 1),
      width: num(r.width, 1, along, 2),
    }
    if (kind === 'door') {
      if (typeof r.doorColor === 'string' && HEX.test(r.doorColor)) op.doorColor = r.doorColor
      if (r.doorKind === 'glass' || r.doorKind === 'classic') op.doorKind = r.doorKind
    }
    out.push(op)
  }
  return out
}

/** Rebuild a stranger's café doc into something the renderer can trust. */
/** Sanitize an untrusted {room, placed} doc (cafés and clubhouses alike). */
export function sanitizeRoomPlaced(raw: unknown): { room: RoomDoc; placed: PlacedItem[] } {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const roomRaw = (doc.room ?? {}) as Record<string, unknown>
  const w = num(roomRaw.w, 8, 40, 16)
  const d = num(roomRaw.d, 6, 30, 12)
  const room: RoomDoc = {
    w,
    d,
    floor: str(roomRaw.floor, 24, 'honey'), // shell falls back on unknown styles
    wallStyle: str(roomRaw.wallStyle, 24, 'cream'),
    openings: sanitizeOpenings(roomRaw.openings, w, d),
  }
  const placed: PlacedItem[] = []
  if (Array.isArray(doc.placed)) {
    for (const p of doc.placed.slice(0, 500)) {
      if (!p || typeof p !== 'object') continue
      const r = p as Record<string, unknown>
      const itemId = str(r.itemId, 32)
      if (!CATALOG[itemId]) continue // unknown furniture can't crash the builder
      const item: PlacedItem = {
        uid: str(r.uid, 40, `x${placed.length}`),
        itemId,
        x: num(r.x, 0, w, 1),
        z: num(r.z, 0, d, 1),
        rot: ([0, 1, 2, 3] as const).includes(r.rot as 0) ? (r.rot as 0 | 1 | 2 | 3) : 0,
      }
      const variant = str(r.variant, 24)
      if (variant) item.variant = variant
      const on = str(r.on, 40)
      if (on) item.on = on
      if (r.wall === 'back' || r.wall === 'left') {
        item.wall = r.wall
        item.y = num(r.y, 0.5, 8, 3.4)
      }
      placed.push(item)
    }
  }
  return { room, placed }
}

function sanitizeCafe(ownerId: string, handle: string, ownerName: string, raw: unknown): DreamCafe | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Record<string, unknown>
  const { room, placed } = sanitizeRoomPlaced(raw)
  const infoRaw = (doc.info ?? {}) as Record<string, unknown>
  const music = ['lofi', 'rain', 'off'].includes(infoRaw.music as string) ? (infoRaw.music as string) : 'lofi'
  const name = (ownerName || 'someone').slice(0, 20)
  return {
    id: `user:${ownerId}`,
    name: `${name}'s café`,
    vibe: `@${handle}`,
    ruleset: str(infoRaw.rules, 60, '25 / 5 sprints'),
    desc: str(infoRaw.desc, 200, 'a cozy corner to get things done ♪'),
    music,
    room,
    placed,
    sims: [], // real cafés are peopled by real presence, not sims
  }
}

export async function fetchProfiles(userIds: string[]): Promise<Map<string, PersonRef>> {
  const out = new Map<string, PersonRef>()
  const supa = getSupabase()
  if (!supa || !userIds.length) return out
  const { data, error } = await supa.from('profiles').select('user_id, handle, name, avatar').in('user_id', userIds)
  if (error || !data) return out
  for (const row of data) {
    const av = (row.avatar ?? {}) as Record<string, unknown>
    out.set(row.user_id, {
      userId: row.user_id,
      handle: str(row.handle, 20, '?'),
      name: str(row.name, 20, 'someone'),
      avatar: {
        hair: typeof av.hair === 'string' && HEX.test(av.hair) ? av.hair : '#7C5940',
        sweater: typeof av.sweater === 'string' && HEX.test(av.sweater) ? av.sweater : '#7383BC',
        skin: typeof av.skin === 'string' && HEX.test(av.skin) ? av.skin : undefined,
        glasses: av.glasses === true,
        long: av.long === true,
      },
    })
  }
  return out
}

export async function fetchCafeByUser(userId: string): Promise<DreamCafe | null> {
  const supa = getSupabase()
  if (!supa || !UUID.test(userId)) return null
  const [{ data, error }, profiles] = await Promise.all([
    supa.from('cafes').select('doc, open').eq('user_id', userId).maybeSingle(),
    fetchProfiles([userId]),
  ])
  if (error) {
    missingSchema(error)
    return null
  }
  if (!data || !data.open) return null
  const p = profiles.get(userId)
  return sanitizeCafe(userId, p?.handle ?? '?', p?.name ?? 'someone', data.doc)
}

export async function fetchCafeByHandle(handle: string): Promise<DreamCafe | null> {
  const supa = getSupabase()
  const h = handle.toLowerCase().slice(0, 20)
  if (!supa || !/^[a-z0-9][a-z0-9_-]{2,19}$/.test(h)) return null
  const { data, error } = await supa.from('profiles').select('user_id').eq('handle', h).maybeSingle()
  if (error) {
    missingSchema(error)
    return null
  }
  return data ? fetchCafeByUser(data.user_id) : null
}

/** Recently active open cafés (for the directory), newest first, minus me. */
export async function listOpenCafes(): Promise<(PersonRef & { minutes: number })[]> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return []
  const q = (cols: string) =>
    supa.from('cafes').select(cols).eq('open', true).neq('user_id', me.id).order('updated_at', { ascending: false }).limit(12)
  let { data, error } = await q('user_id, study_minutes')
  if (error) ({ data, error } = await q('user_id')) // pre-phase-4 schema: no stars yet
  if (error || !data) {
    missingSchema(error)
    return []
  }
  const rows = data as unknown as { user_id: string; study_minutes?: number }[]
  const profiles = await fetchProfiles(rows.map((r) => r.user_id))
  return rows
    .map((r) => {
      const p = profiles.get(r.user_id)
      return p ? { ...p, minutes: typeof r.study_minutes === 'number' ? r.study_minutes : 0 } : null
    })
    .filter((p): p is PersonRef & { minutes: number } => !!p)
}

// ---------- friends ----------

export async function requestFriend(userId: string): Promise<string> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return 'cloud is off — playing local ♪'
  if (!UUID.test(userId) || userId === me.id) return 'hmm, that didn’t work'
  const { error } = await supa.from('friends').insert({ requester: me.id, addressee: userId })
  if (!error) return 'friend request sent ♪'
  if (error.code === '23505') return 'already asked ♪'
  if (missingSchema(error)) return 'friends aren’t set up yet'
  return 'they’re not taking requests right now'
}

export async function listFriends(): Promise<{ friends: FriendEntry[]; requests: RequestEntry[] }> {
  const empty = { friends: [] as FriendEntry[], requests: [] as RequestEntry[] }
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return empty
  const { data, error } = await supa
    .from('friends')
    .select('id, requester, addressee, status')
    .or(`requester.eq.${me.id},addressee.eq.${me.id}`)
  if (error || !data) {
    missingSchema(error)
    return empty
  }
  schemaOk = true
  const others = data.map((r) => (r.requester === me.id ? r.addressee : r.requester))
  const profiles = await fetchProfiles(others)
  const friends: FriendEntry[] = []
  const requests: RequestEntry[] = []
  for (const r of data) {
    const otherId = r.requester === me.id ? r.addressee : r.requester
    const p = profiles.get(otherId)
    if (!p) continue
    if (r.status === 'accepted') friends.push({ ...p, rowId: r.id })
    else if (r.addressee === me.id) requests.push({ ...p, rowId: r.id })
    // my own outgoing pending asks stay invisible here (they show as "already asked")
  }
  return { friends, requests }
}

export async function acceptRequest(rowId: number): Promise<boolean> {
  const supa = getSupabase()
  if (!supa) return false
  const { error } = await supa.from('friends').update({ status: 'accepted' }).eq('id', rowId)
  return !error
}

export async function declineRequest(rowId: number): Promise<boolean> {
  return removeFriend(rowId)
}

export async function removeFriend(rowId: number): Promise<boolean> {
  const supa = getSupabase()
  if (!supa) return false
  const { error } = await supa.from('friends').delete().eq('id', rowId)
  return !error
}

async function pollRequests() {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me || !onRequestCount) return
  const { count, error } = await supa
    .from('friends')
    .select('id', { count: 'exact', head: true })
    .eq('addressee', me.id)
    .eq('status', 'pending')
  if (!error && typeof count === 'number') onRequestCount(count)
  else missingSchema(error)
}

// ---------- the cross-user guestbook ----------

export async function leaveNote(ownerId: string, art: string): Promise<string> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return 'cloud is off — your note stayed on the napkin ♪'
  if (!UUID.test(ownerId) || !art.startsWith('data:image/png;base64,') || art.length > 79_000) {
    return 'that note didn’t fit ♪'
  }
  if (!(await ensureProfile())) return 'set up your café first ♪'
  const { error } = await supa.from('guest_notes').insert({
    cafe_owner: ownerId,
    author: me.id,
    author_name: store.save.info.name.slice(0, 20),
    art,
  })
  if (!error) return 'ok'
  if (missingSchema(error)) return 'guestbooks aren’t set up yet'
  return 'their book is closed right now ♪' // blocked / disabled / too soon — same polite answer
}

/** Notes real visitors left in MY guestbook (newest first). */
export async function listMyNotes(): Promise<CloudNote[]> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return []
  const { data, error } = await supa
    .from('guest_notes')
    .select('id, author, author_name, art, created_at')
    .eq('cafe_owner', me.id)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error || !data) {
    missingSchema(error)
    return []
  }
  return data
    .filter((r) => typeof r.art === 'string' && r.art.startsWith('data:image/png;base64,'))
    .map((r) => ({
      id: r.id,
      from: str(r.author_name, 20, 'someone'),
      art: r.art as string,
      authorId: r.author,
      at: new Date(r.created_at).getTime(),
    }))
}

export async function deleteNote(id: number): Promise<boolean> {
  const supa = getSupabase()
  if (!supa) return false
  const { error } = await supa.from('guest_notes').delete().eq('id', id)
  return !error
}

/** Block someone: their notes disappear and they can't ask or sign again. */
export async function blockUser(userId: string): Promise<boolean> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me || !UUID.test(userId)) return false
  const { error } = await supa.from('blocks').insert({ owner: me.id, blocked: userId })
  if (error && error.code !== '23505') return false
  // sweep everything they've left, and any friendship either way
  await supa.from('guest_notes').delete().eq('cafe_owner', me.id).eq('author', userId)
  await supa
    .from('friends')
    .delete()
    .or(`and(requester.eq.${me.id},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me.id})`)
  return true
}

// ---------- verified focus sessions (phase 5: server-authoritative xp) ----------
// While seated, a heartbeat a minute proves presence to the server, which
// grants leaderboard xp and host credit from wall-clock-verified time.
// Pre-phase-5 (or offline) this quietly does nothing and the legacy
// client-side push below still works.

let liveSession: { id: number; timer: ReturnType<typeof setInterval> } | null = null
let sessionGen = 0

/** Sat down: open a server-witnessed session (placeUid = a real café owner). */
export function focusSessionStart(placeUid: string | null) {
  focusSessionStop()
  const supa = getSupabase()
  if (!supa) return
  const gen = ++sessionGen
  const p_place = placeUid && UUID.test(placeUid) ? placeUid : null
  supa.rpc('session_begin', { p_place }).then(({ data, error }) => {
    if (error || typeof data !== 'number') return // phase-5 fns not there yet — legacy path covers it
    if (gen !== sessionGen) {
      // stood up before the server answered: settle the orphan right away
      supa.rpc('session_end', { p_id: data }).then(() => {})
      return
    }
    const timer = setInterval(() => {
      getSupabase()
        ?.rpc('session_beat', { p_id: data })
        .then(() => {})
    }, 60_000)
    liveSession = { id: data, timer }
  })
}

/** Stood up: settle the session (the server pays the host from verified time). */
export function focusSessionStop() {
  sessionGen++
  if (!liveSession) return
  const { id, timer } = liveSession
  liveSession = null
  clearInterval(timer)
  getSupabase()
    ?.rpc('session_end', { p_id: id })
    .then(() => {})
}

// ---------- leaderboard (xp lives on the public profile) ----------

let xpT: ReturnType<typeof setTimeout> | undefined
function schedulePushXp() {
  clearTimeout(xpT)
  xpT = setTimeout(async () => {
    const supa = getSupabase()
    const me = cloudUser()
    if (!supa || !me || !myHandle) return
    // pre-phase-5 compatibility: once the xp column is server-locked this
    // update is denied and ignored — session_beat grants xp instead
    const { error } = await supa.from('profiles').update({ xp: store.save.xp }).eq('user_id', me.id)
    if (error) missingSchema(error) // column locked or not there yet — fine
  }, 4000)
}

export interface Leader extends PersonRef {
  xp: number
}

/** Top studiers by xp, for the leaderboard. */
export async function fetchLeaders(): Promise<Leader[]> {
  const supa = getSupabase()
  if (!supa) return []
  const { data, error } = await supa
    .from('profiles')
    .select('user_id, handle, name, avatar, xp')
    .order('xp', { ascending: false })
    .limit(15)
  if (error || !data) {
    missingSchema(error)
    return []
  }
  const profiles = await fetchProfiles(data.map((r) => r.user_id))
  return data
    .map((r) => {
      const p = profiles.get(r.user_id)
      return p ? { ...p, xp: typeof r.xp === 'number' ? Math.max(0, r.xp) : 0 } : null
    })
    .filter((p): p is Leader => !!p)
}

// ---------- host earnings: your café pays you for hosting focus ----------

/** Café rating from lifetime hosted minutes: ★ → ★★★★★. */
export function starsFor(minutes: number): number {
  if (minutes >= 4000) return 5
  if (minutes >= 1500) return 4
  if (minutes >= 500) return 3
  if (minutes >= 100) return 2
  return 1
}

/** Tell a real café's owner you studied there (they earn beans for hosting). */
export async function logStudy(ownerId: string, minutes: number) {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me || !UUID.test(ownerId) || ownerId === me.id) return
  const m = Math.min(180, Math.max(1, Math.round(minutes)))
  const { error } = await supa.from('study_log').insert({ cafe_owner: ownerId, visitor: me.id, minutes: m })
  if (error) missingSchema(error) // rate-limited or pre-migration — quietly fine
}

/** On boot: collect what your café earned while you were away (1◍ / 10 hosted min). */
async function collectHostEarnings() {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return
  const c = store.save.goals.counters
  const since = new Date(c.hostAt ?? 0).toISOString()
  const { data, error } = await supa
    .from('study_log')
    .select('minutes, created_at')
    .eq('cafe_owner', me.id)
    .gt('created_at', since)
    .limit(500)
  if (error || !data) {
    missingSchema(error)
    return
  }
  if (!data.length) return
  const hosted = data.reduce((s, r) => s + (typeof r.minutes === 'number' ? Math.min(180, Math.max(0, r.minutes)) : 0), 0)
  const total = (c.hostCarry ?? 0) + hosted
  const beans = Math.floor(total / 10)
  store.setCounter('hostCarry', total % 10)
  store.setCounter('hostTotal', (c.hostTotal ?? 0) + hosted)
  store.setCounter('hostAt', Math.max(...data.map((r) => new Date(r.created_at).getTime())))
  if (beans > 0) {
    store.addBeans(beans)
    toast(`your café hosted ${hosted} focused minutes — +${beans} beans ♪`)
  }
  // keep the public star rating current (owner-writable column)
  await supa.from('cafes').update({ study_minutes: store.save.goals.counters.hostTotal ?? 0 }).eq('user_id', me.id)
}

// ---------- bean gifts: a little generosity loop ----------

const GIFTED_KEY = 'studdy-gifted'

/** First tap on a person each day sends them a bean (3/day total, server-enforced). */
export async function giftBean(userId: string): Promise<boolean> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me || !UUID.test(userId) || userId === me.id) return false
  const today = new Date().toDateString()
  let given: Record<string, string> = {}
  try {
    given = JSON.parse(localStorage.getItem(GIFTED_KEY) ?? '{}')
  } catch {
    /* fresh book */
  }
  if (given[userId] === today) return false
  if (Object.values(given).filter((d) => d === today).length >= 3) return false
  const { error } = await supa.from('gifts').insert({ sender: me.id, recipient: userId, beans: 1 })
  if (error) {
    missingSchema(error)
    return false // out of gifts today / blocked / pre-migration
  }
  given[userId] = today
  localStorage.setItem(GIFTED_KEY, JSON.stringify(given))
  store.addXp(5) // generosity pays
  return true
}

/** On boot: pick up beans friends left for you. */
async function collectGifts() {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return
  const c = store.save.goals.counters
  const since = new Date(c.giftAt ?? 0).toISOString()
  const { data, error } = await supa
    .from('gifts')
    .select('sender, created_at')
    .eq('recipient', me.id)
    .gt('created_at', since)
    .limit(100)
  if (error || !data || !data.length) {
    missingSchema(error)
    return
  }
  store.setCounter('giftAt', Math.max(...data.map((r) => new Date(r.created_at).getTime())))
  store.addBeans(data.length)
  const senders = await fetchProfiles([...new Set(data.map((r) => r.sender))])
  const names = [...senders.values()].map((p) => p.name).slice(0, 3).join(', ')
  toast(`${names || 'friends'} sent you ${data.length} bean${data.length > 1 ? 's' : ''} ♪`)
}

// ---------- boot ----------

/** Start the social layer: publish my café on changes, watch for requests. */
export function initSocial(handlers: { onRequestCount: (n: number) => void }) {
  if (!cloudConfigured()) return // local-only build: no social loop
  onRequestCount = handlers.onRequestCount
  const events: store.StoreEvent[] = ['room', 'placed', 'info', 'avatar']
  for (const ev of events) store.on(ev, schedulePublish)
  // the cloud session arrives asynchronously — publish + poll once it's up
  store.on('xp', schedulePushXp)
  const iv = setInterval(() => {
    if (!getSupabase()) return
    clearInterval(iv)
    publishNow().then(() => {
      schedulePushXp()
      collectHostEarnings()
      collectGifts()
    })
    pollRequests()
    setInterval(pollRequests, 60_000)
  }, 2000)
}

export function socialReady(): boolean {
  return schemaOk
}
