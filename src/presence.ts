// Realtime presence: real people visibly studying together, via Supabase
// Realtime channels (no tables involved). One channel per café carries who's
// here (presence) and the café chat (broadcast); a global lobby channel
// carries only "who is at which café" for the directory's live counts.
//
// Everything that arrives from the network is untrusted: every field is
// re-validated, length-capped, and colors must be #rrggbb before any of it
// reaches the scene or the DOM.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase, cloudUser, cloudConfigured } from './cloud'
import * as store from './store'

export interface PatronState {
  /** Full user id — lets profile cards offer real friend requests. */
  uid: string
  name: string
  hair: string
  sweater: string
  skin: string
  hairStyle: 'short' | 'long'
  glasses: boolean
  /** Their chosen name-tag color. */
  nameColor: string
  /** Their current level (shown beside the name tag). */
  level: number
  /** Seat they're on in the current café (null = wandering). */
  seatKey: string | null
  napkin: string
  headphones: boolean
  /** Epoch ms when they sat down (earliest claim wins a contested seat). */
  since: number
}

export interface RemotePatron extends PatronState {
  /** Stable per-tab presence key. */
  key: string
}

interface Handlers {
  onPatrons: (patrons: RemotePatron[]) => void
  onChat: (from: string, text: string) => void
  onLobby: (counts: Record<string, number>) => void
}

const NAME_MAX = 20
const CHAT_MAX = 80
const HEX = /^#[0-9a-fA-F]{6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// one presence identity per tab: same account in two tabs still reads as two
// patrons, which is both honest and what makes local testing possible
const tabNonce = Math.random().toString(36).slice(2, 8)

let handlers: Handlers | null = null
let channel: RealtimeChannel | null = null
let lobby: RealtimeChannel | null = null
let joinedPlace: string | undefined // channel topic currently subscribed
let wantPlace: string | null = null // cafe id, or null = my own home
let subscribed = false
let lobbyTracked = ''
let lastChatAt = 0

function myKey(): string | null {
  const u = cloudUser()
  return u ? `${u.id.slice(0, 12)}:${tabNonce}` : null
}

function myState(): PatronState {
  const a = store.save.avatar
  return {
    uid: cloudUser()?.id ?? '',
    name: (store.save.info.name || 'someone').slice(0, NAME_MAX),
    hair: a.hair,
    sweater: a.sweater,
    skin: a.skin,
    hairStyle: a.hairStyle,
    glasses: a.glasses,
    nameColor: a.nameColor && HEX.test(a.nameColor) ? a.nameColor : '#FFFFFF',
    level: store.levelInfo().level,
    seatKey: null,
    napkin: '',
    headphones: true,
    since: Date.now(),
    ...statePatch,
  }
}
// the live session bits (seat, napkin) layered over the avatar basics
let statePatch: Partial<PatronState> = {}

/** Re-validate a presence payload from the wire. Null = ignore it. */
function cleanPatron(key: string, raw: unknown): RemotePatron | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const color = (v: unknown, fb: string) => (typeof v === 'string' && HEX.test(v) ? v : fb)
  const name = str(r.name, NAME_MAX).trim()
  if (!name) return null
  return {
    key,
    uid: typeof r.uid === 'string' && UUID.test(r.uid) ? r.uid : '',
    name,
    hair: color(r.hair, '#7C5940'),
    sweater: color(r.sweater, '#7383BC'),
    skin: color(r.skin, '#FFDCBD'),
    hairStyle: r.hairStyle === 'long' ? 'long' : 'short',
    glasses: r.glasses === true,
    nameColor: color(r.nameColor, '#FFFFFF'),
    level: typeof r.level === 'number' && isFinite(r.level) ? Math.min(999, Math.max(1, Math.round(r.level))) : 1,
    seatKey: typeof r.seatKey === 'string' ? r.seatKey.slice(0, 48) : null,
    napkin: str(r.napkin, 40),
    headphones: r.headphones !== false,
    since: typeof r.since === 'number' && isFinite(r.since) ? r.since : Date.now(),
  }
}

/** Place tokens: a dream-café id, `user:{ownerId}` for a real user's café,
 *  or null for my own home. A real café shares its OWNER's home channel,
 *  so owner and visitors always see each other. */
function topicFor(place: string | null): string | null {
  if (place?.startsWith('user:')) return `home:${place.slice(5)}`
  if (place) return `cafe:${place}`
  const u = cloudUser()
  return u ? `home:${u.id}` : null
}

/** The lobby token for the current place (homes unify as user:{ownerId}). */
function lobbyAt(): string | null {
  if (wantPlace) return wantPlace
  const u = cloudUser()
  return u ? `user:${u.id}` : null
}

function emitPatrons() {
  if (!channel || !handlers) return
  const me = myKey()
  const state = channel.presenceState<PatronState>()
  const out: RemotePatron[] = []
  for (const [key, metas] of Object.entries(state)) {
    if (key === me) continue
    const p = cleanPatron(key, metas[0])
    if (p) out.push(p)
  }
  handlers.onPatrons(out)
}

function ensureJoined() {
  const supa = getSupabase()
  if (!supa || !handlers) return
  const topic = topicFor(wantPlace)
  if (!topic) return
  if (channel && joinedPlace === topic) return

  if (channel) {
    supa.removeChannel(channel)
    channel = null
    subscribed = false
  }
  joinedPlace = topic
  const ch = supa.channel(`studdy:${topic}`, {
    config: { presence: { key: myKey() ?? tabNonce }, broadcast: { self: false } },
  })
  channel = ch
  ch.on('presence', { event: 'sync' }, () => {
    if (channel === ch) emitPatrons()
  })
  ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
    if (channel !== ch || !handlers) return
    const p = payload as Record<string, unknown>
    const from = typeof p?.n === 'string' ? p.n.slice(0, NAME_MAX).trim() : ''
    const text = typeof p?.t === 'string' ? p.t.slice(0, CHAT_MAX).trim() : ''
    if (from && text) handlers.onChat(from, text)
  })
  ch.subscribe((status) => {
    if (channel !== ch) return
    subscribed = status === 'SUBSCRIBED'
    if (subscribed) ch.track(myState())
  })
}

/** uid → place token, from the latest lobby sync (for the friends list). */
const lobbyByUid = new Map<string, string>()

function ensureLobby() {
  const supa = getSupabase()
  if (!supa || !handlers || lobby) return
  const ch = supa.channel('studdy:lobby', {
    config: { presence: { key: myKey() ?? tabNonce } },
  })
  lobby = ch
  ch.on('presence', { event: 'sync' }, () => {
    if (lobby !== ch || !handlers) return
    const counts: Record<string, number> = {}
    lobbyByUid.clear()
    for (const metas of Object.values(ch.presenceState<{ at: string; uid: string }>())) {
      const at = typeof metas[0]?.at === 'string' ? metas[0].at.slice(0, 48) : ''
      if (!at) continue
      counts[at] = (counts[at] ?? 0) + 1
      const uid = metas[0]?.uid
      if (typeof uid === 'string' && UUID.test(uid)) lobbyByUid.set(uid, at)
    }
    handlers.onLobby(counts)
  })
  ch.subscribe((status) => {
    if (lobby === ch && status === 'SUBSCRIBED') {
      lobbyTracked = ''
      trackLobby()
    }
  })
}

function trackLobby() {
  if (!lobby) return
  const at = lobbyAt()
  if (!at || at === lobbyTracked) return
  lobbyTracked = at
  lobby.track({ at, uid: cloudUser()?.id ?? '' })
}

/** Where a user is right now: a place token, or null when offline. */
export function whereIs(userId: string): string | null {
  return lobbyByUid.get(userId) ?? null
}

/** Boot the presence layer. Safe to call always; waits for the cloud session. */
export function initPresence(h: Handlers) {
  if (!cloudConfigured()) return // local-only build: nobody to be present with
  handlers = h
  // the cloud session arrives asynchronously (captcha etc.) — keep trying gently
  const iv = setInterval(() => {
    if (!getSupabase()) return
    clearInterval(iv)
    ensureJoined()
    ensureLobby()
  }, 1500)
}

/** Move my presence to a café (null = my own home café). */
export function setPlace(cafeId: string | null) {
  wantPlace = cafeId
  statePatch = {} // a new room always starts standing
  ensureJoined()
  trackLobby()
}

/** Update what others see about me (seat, napkin, headphones, avatar). */
export function updateState(patch: Partial<PatronState>) {
  statePatch = { ...statePatch, ...patch }
  if (channel && subscribed) channel.track(myState())
}

/** Say something to the room. Returns false when offline (chat is then local-only). */
export function sendChat(text: string): boolean {
  const t = text.trim().slice(0, CHAT_MAX)
  if (!t || !channel || !subscribed) return false
  const now = Date.now()
  if (now - lastChatAt < 1200) return false // gentle send rate cap
  lastChatAt = now
  channel.send({
    type: 'broadcast',
    event: 'chat',
    payload: { n: (store.save.info.name || 'someone').slice(0, NAME_MAX), t },
  })
  return true
}
