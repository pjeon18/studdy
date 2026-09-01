// The communal sprint clock. Anchored to wall-clock time so every café —
// and every person in every café — is always on the same phase.
export const SPRINT_MS = 25 * 60_000
export const BREAK_MS = 5 * 60_000
export const CYCLE_MS = SPRINT_MS + BREAK_MS

// local debug offset (skip-to-next-phase); never persisted
let offset = 0

export interface Phase {
  mode: 'sprint' | 'break'
  /** ms until the phase flips */
  remaining: number
}

export function phase(now = Date.now()): Phase {
  const t = (((now + offset) % CYCLE_MS) + CYCLE_MS) % CYCLE_MS
  return t < SPRINT_MS
    ? { mode: 'sprint', remaining: SPRINT_MS - t }
    : { mode: 'break', remaining: CYCLE_MS - t }
}

/** Debug: jump the communal clock to the start of the next phase. */
export function skipPhase() {
  offset += phase().remaining + 500
}
