// The real social loop (Phase 3): publish your café so others can visit it,
// friend requests, and the cross-user guestbook — all on the Supabase tables
// in supabase/phase3.sql. Everything here no-ops quietly when the cloud (or
// the phase-3 schema) isn't there: the game stays fully playable local-only.
//
// Trust boundary: café documents, names, and notes fetched here are written
// by OTHER USERS. Every field is re-validated and capped before it reaches
// the renderer or the DOM (rendering also esc()'s all strings).
import { getSupabase, cloudUser } from './cloud'
import * as store from './store'
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
function sanitizeCafe(ownerId: string, handle: string, ownerName: string, raw: unknown): DreamCafe | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Record<string, unknown>
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
      placed.push(item)
    }
  }
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

async function fetchProfiles(userIds: string[]): Promise<Map<string, PersonRef>> {
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
export async function listOpenCafes(): Promise<PersonRef[]> {
  const supa = getSupabase()
  const me = cloudUser()
  if (!supa || !me) return []
  const { data, error } = await supa
    .from('cafes')
    .select('user_id')
    .eq('open', true)
    .neq('user_id', me.id)
    .order('updated_at', { ascending: false })
    .limit(12)
  if (error || !data) {
    missingSchema(error)
    return []
  }
  const profiles = await fetchProfiles(data.map((r) => r.user_id))
  return data.map((r) => profiles.get(r.user_id)).filter((p): p is PersonRef => !!p)
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

// ---------- boot ----------

/** Start the social layer: publish my café on changes, watch for requests. */
export function initSocial(handlers: { onRequestCount: (n: number) => void }) {
  onRequestCount = handlers.onRequestCount
  const events: store.StoreEvent[] = ['room', 'placed', 'info', 'avatar']
  for (const ev of events) store.on(ev, schedulePublish)
  // the cloud session arrives asynchronously — publish + poll once it's up
  const iv = setInterval(() => {
    if (!getSupabase()) return
    clearInterval(iv)
    publishNow()
    pollRequests()
    setInterval(pollRequests, 60_000)
  }, 2000)
}

export function socialReady(): boolean {
  return schemaOk
}
