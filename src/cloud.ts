// Cloud saves + accounts (Supabase). Entirely optional: without env vars the
// game stays local-only. When configured: guests sign in anonymously and get
// cloud saves immediately; a magic-link email upgrades the same account.
// localStorage stays the source of truth locally — the cloud is a mirror,
// last write wins by timestamp.
import { createClient, type SupabaseClient, type Session as AuthSession } from '@supabase/supabase-js'
import * as store from './store'
import { toast } from './ui'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let supa: SupabaseClient | null = null
let session: AuthSession | null = null
let pushT: ReturnType<typeof setTimeout> | undefined
let lastPushedAt = 0

const SAVED_AT_KEY = 'studdy-saved-at'

export function cloudConfigured(): boolean {
  return !!(url && anonKey)
}

export function cloudUser(): { id: string; email?: string; anonymous: boolean } | null {
  if (!session) return null
  return { id: session.user.id, email: session.user.email ?? undefined, anonymous: !session.user.email }
}

const MAX_DOC_BYTES = 1_500_000 // the DB enforces 2MB; stay well under it

/** Queue a debounced upload of the current save. */
function schedulePush() {
  if (!supa || !session) return
  if (!store.save.info.name) return // nothing worth syncing before onboarding
  clearTimeout(pushT)
  pushT = setTimeout(pushNow, 2500)
}

async function pushNow() {
  if (!supa || !session || !store.save.info.name) return
  const body = JSON.stringify(store.save)
  if (body.length > MAX_DOC_BYTES) {
    console.warn('[cloud] save too large to sync — trimming guestbook may help')
    return
  }
  const now = Date.now()
  lastPushedAt = now
  localStorage.setItem(SAVED_AT_KEY, String(now))
  const { error } = await supa.from('saves').upsert({
    user_id: session.user.id,
    doc: store.save,
    updated_at: new Date(now).toISOString(),
  })
  if (error) console.warn('[cloud] push failed:', error.message)
}

/** Minimal shape check so a corrupt cloud row can never brick the client. */
function looksLikeSave(doc: unknown): boolean {
  const d = doc as Record<string, unknown>
  return (
    !!d &&
    typeof d === 'object' &&
    d.v === 1 &&
    typeof d.room === 'object' &&
    Array.isArray(d.placed) &&
    typeof d.info === 'object'
  )
}

/** On sign-in: adopt the remote save if it's newer than the local one. */
async function pullOnce(): Promise<void> {
  if (!supa || !session) return
  const { data, error } = await supa.from('saves').select('doc, updated_at').eq('user_id', session.user.id).maybeSingle()
  if (error) {
    console.warn('[cloud] pull failed:', error.message)
    return
  }
  if (!data) {
    // first time in the cloud: seed it with whatever we have locally
    if (store.save.info.name) pushNow()
    return
  }
  if (!looksLikeSave(data.doc)) {
    console.warn('[cloud] remote save failed validation — ignoring it')
    return
  }
  const remoteAt = new Date(data.updated_at).getTime()
  const localAt = Number(localStorage.getItem(SAVED_AT_KEY) ?? 0)
  const localFresh = !store.save.info.name // never onboarded here
  if (localFresh || remoteAt > localAt + 1000) {
    localStorage.setItem('studdy-save-v1', JSON.stringify(data.doc))
    localStorage.setItem(SAVED_AT_KEY, String(remoteAt))
    toast('cloud save loaded ♪')
    setTimeout(() => location.reload(), 600)
  }
}

/** Boot the cloud layer. Safe to call always; no-ops when unconfigured. */
export async function initCloud() {
  if (!cloudConfigured()) return
  supa = createClient(url!, anonKey!)

  // mirror every store change up (debounced)
  const events: store.StoreEvent[] = ['room', 'placed', 'inventory', 'beans', 'packages', 'info', 'guestbook', 'avatar', 'newitems', 'xp']
  for (const ev of events) store.on(ev, schedulePush)
  window.addEventListener('beforeunload', () => {
    if (Date.now() - lastPushedAt > 3000) pushNow()
  })

  supa.auth.onAuthStateChange((_evt, s) => {
    session = s
  })

  const { data } = await supa.auth.getSession()
  session = data.session
  if (!session) {
    const { data: anon, error } = await supa.auth.signInAnonymously()
    if (error) {
      console.warn('[cloud] anonymous sign-in unavailable:', error.message)
      return
    }
    session = anon.session
  }
  await pullOnce()
}

/** Send a magic sign-in link (upgrades an anonymous account to a real one). */
export async function linkEmail(email: string): Promise<string> {
  if (!supa) return 'cloud is not configured'
  if (session && !session.user.email) {
    // anonymous → attach the email to THIS account so the save comes along
    const { error } = await supa.auth.updateUser({ email })
    return error ? error.message : 'check your inbox to confirm ♪'
  }
  const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } })
  return error ? error.message : 'magic link sent — check your inbox ♪'
}

export async function signOut() {
  if (!supa) return
  await supa.auth.signOut()
  session = null
}
