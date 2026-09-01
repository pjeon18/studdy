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
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
    }
  }
}

/** Solve a Cloudflare Turnstile challenge (invisible widget). Undefined when not configured. */
async function getCaptchaToken(): Promise<string | undefined> {
  if (!turnstileSiteKey) return undefined
  if (!window.turnstile) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('turnstile load failed'))
      document.head.appendChild(s)
    }).catch(() => undefined)
  }
  if (!window.turnstile) return undefined
  return new Promise((resolve) => {
    // centered near the bottom, so a managed/interactive challenge is actually usable
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:200'
    document.body.appendChild(el)
    let widgetId: string | undefined
    let settled = false
    const done = (t?: string) => {
      if (settled) return
      settled = true
      resolve(t)
      try {
        if (widgetId) window.turnstile!.remove(widgetId)
      } catch {
        /* widget already gone */
      }
      el.remove()
    }
    try {
      widgetId = window.turnstile!.render(el, {
        sitekey: turnstileSiteKey,
        appearance: 'interaction-only', // stay invisible unless Cloudflare needs a click
        callback: (t: string) => done(t),
        'error-callback': (code: unknown) => {
          console.warn('[cloud] turnstile error:', code)
          done(undefined)
        },
        'expired-callback': () => done(undefined),
      })
      setTimeout(() => done(undefined), 25000) // never hang sign-in on a stuck challenge
    } catch {
      done(undefined)
    }
  })
}

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

/** The live client, for realtime features (null when unconfigured/offline). */
export function getSupabase(): SupabaseClient | null {
  return session ? supa : null
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
    // up to two attempts, each with a freshly solved challenge
    for (let attempt = 0; attempt < 2 && !session; attempt++) {
      const captchaToken = await getCaptchaToken()
      const { data: anon, error } = await supa.auth.signInAnonymously({ options: { captchaToken } })
      if (!error) {
        session = anon.session
        break
      }
      console.warn(`[cloud] anonymous sign-in attempt ${attempt + 1} failed:`, error.message)
    }
    if (!session) return // playing local-only this visit
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
  const captchaToken = await getCaptchaToken()
  const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href, captchaToken } })
  return error ? error.message : 'magic link sent — check your inbox ♪'
}

export async function signOut() {
  if (!supa) return
  await supa.auth.signOut()
  session = null
}
