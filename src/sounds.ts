// Tiny synthesized SFX — no audio assets, everything WebAudio primitives.
// Soft, low-mix, cozy: blips and plucks, never harsh.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let rainGain: GainNode | null = null
let enabled = localStorage.getItem('studdy-sound') !== 'off'

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = enabled ? 1 : 0
      master.connect(ctx.destination)
      startRain()
      applyStation() // pick up a station chosen before the ctx existed
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** Call from the first user gesture (autoplay policy). */
export function unlock() {
  ac()
}

export function isEnabled() {
  return enabled
}

export function setEnabled(v: boolean) {
  enabled = v
  localStorage.setItem('studdy-sound', v ? 'on' : 'off')
  if (ctx && master) master.gain.linearRampToValueAtTime(v ? 1 : 0, ctx.currentTime + 0.15)
  if (v) ac()
}

/** Soft looping rain patter: filtered noise, very quiet. */
function startRain() {
  if (!ctx || !master) return
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random())
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 250
  rainGain = ctx.createGain()
  rainGain.gain.value = 0.018
  src.connect(lp).connect(hp).connect(rainGain).connect(master)
  src.start()
}

/** One decaying tone. */
function tone(freq: number, t0: number, dur: number, peak: number, type: OscillatorType = 'sine', glideTo?: number, dest?: AudioNode) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur)
  o.connect(g).connect(dest ?? master)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

let noiseBuf: AudioBuffer | null = null
function noise(): AudioBuffer {
  if (!noiseBuf) {
    const len = ctx!.sampleRate
    noiseBuf = ctx!.createBuffer(1, len, ctx!.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

/** Short filtered noise burst (clicks, hats, snare hush). */
function burst(t0: number, dur: number, peak: number, freq: number, q = 1.2, dest?: AudioNode) {
  if (!ctx || !master) return
  const src = ctx.createBufferSource()
  src.buffer = noise()
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur)
  src.connect(bp).connect(g).connect(dest ?? master)
  src.start(t0)
  src.stop(t0 + dur + 0.03)
}

const now = () => (ac() ? ctx!.currentTime : 0)
const ok = () => enabled && !!ac()

export const sfx = {
  /** UI press: a dry mechanical click, not a beep. */
  tick() {
    if (!ok()) return
    const t = now()
    burst(t, 0.016, 0.16, 3400, 0.8) // the click transient
    tone(230, t, 0.035, 0.1, 'sine', 130) // the body knock
  },
  /** Sitting down / gentle positive pop. */
  pop() {
    if (!ok()) return
    const t = now()
    tone(520, t, 0.1, 0.12, 'sine', 390)
    tone(1040, t + 0.02, 0.08, 0.05, 'sine')
  },
  /** Furniture set down. */
  place() {
    if (!ok()) return
    const t = now()
    tone(190, t, 0.09, 0.16, 'sine', 120)
    tone(95, t, 0.12, 0.1, 'triangle', 70)
  },
  /** Package unboxed — little rising arpeggio. */
  unbox() {
    if (!ok()) return
    const t = now()
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.22, 0.09, 'triangle'))
  },
  /** Beans spent. */
  coin() {
    if (!ok()) return
    const t = now()
    tone(988, t, 0.07, 0.09, 'square')
    tone(1319, t + 0.07, 0.16, 0.09, 'square')
  },
  /** Beans earned. */
  earn() {
    if (!ok()) return
    const t = now()
    ;[784, 988, 1175].forEach((f, i) => tone(f, t + i * 0.08, 0.2, 0.08, 'triangle'))
  },
  /** Communal clock phase change — soft bell dyad. */
  bell() {
    if (!ok()) return
    const t = now()
    tone(880, t, 0.9, 0.07, 'sine')
    tone(1320, t + 0.02, 0.7, 0.04, 'sine')
    tone(660, t + 0.25, 0.9, 0.05, 'sine')
  },
}

// ====================================================================
// Café music: a per-café "radio station" the owner picks. 'lofi' is a
// real radio — six curated CC tracks (Pixabay content license, credits
// in README) on a deterministic shared schedule: the café's seed
// shuffles the playlist and the wall clock picks the track AND the
// position, so everyone in the room hears the same thing at the same
// moment, like the communal sprint clock. 'rain' stays generative.
// ====================================================================

export type Station = 'lofi' | 'rain' | 'off'
export const STATIONS: { id: Station; label: string }[] = [
  { id: 'lofi', label: 'lofi radio' },
  { id: 'rain', label: 'rainy piano' },
  { id: 'off', label: 'quiet' },
]

let station: Station = 'off'
let musicGain: GainNode | null = null
let musicLP: BiquadFilterNode | null = null
let musicVol = Number(localStorage.getItem('studdy-music-vol') ?? 0.6)
let nextBar = 0
let barIndex = 0

const BPM = 74
const BAR = (60 / BPM) * 4

// Cmaj7 · Am7 · Dm7 · G7 — warm and unresolved forever
const CHORDS = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [146.83, 174.61, 220.0, 261.63],
  [98.0, 123.47, 146.83, 174.61],
]

function ensureMusicGraph() {
  if (!ctx || !master || musicGain) return
  musicLP = ctx.createBiquadFilter()
  musicLP.type = 'lowpass'
  musicLP.frequency.value = 1050
  musicGain = ctx.createGain()
  musicGain.gain.value = musicVol
  musicLP.connect(musicGain).connect(master)
  nextBar = ctx.currentTime + 0.15
  setInterval(scheduleAhead, 400)
}

function scheduleAhead() {
  if (!ctx || station !== 'rain' || !enabled) {
    if (ctx) nextBar = Math.max(nextBar, ctx.currentTime + 0.1)
    return
  }
  while (nextBar < ctx.currentTime + 1.6) {
    scheduleRainBar(nextBar, barIndex)
    nextBar += BAR
    barIndex++
  }
}

function scheduleRainBar(t0: number, bar: number) {
  const dest = musicLP!
  const chord = CHORDS[bar % 4]
  // sparse, soft piano-ish notes over the rain
  if ((bar * 11) % 5 < 3) {
    const f = chord[(bar * 3) % 4] * 2
    const at = t0 + ((bar * 7) % 4) * (BAR / 4)
    tone(f, at, 2.6, 0.05, 'sine', undefined, dest)
    tone(f * 2, at, 1.6, 0.014, 'sine', undefined, dest)
  }
}

// ---------- the lofi radio ----------

interface RadioTrack {
  file: string
  dur: number
  title: string
}
const TRACKS: RadioTrack[] = [
  { file: 'lofi-1.m4a', dur: 126.2, title: 'first draft' },
  { file: 'lofi-2.m4a', dur: 131.3, title: 'window seat' },
  { file: 'lofi-3.m4a', dur: 147.2, title: 'warm static' },
  { file: 'lofi-4.m4a', dur: 128.0, title: 'margin notes' },
  { file: 'lofi-5.m4a', dur: 143.4, title: 'slow steam' },
  { file: 'lofi-6.m4a', dur: 147.1, title: 'midnight desk' },
]
const TRACK_GAP = 3 // a breath of quiet between tracks

let radioSeed = 0
let radioEl: HTMLAudioElement | null = null
let radioTrack = -1
let radioT: ReturnType<typeof setInterval> | undefined

function hashSeed(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/** This café's playlist order (stable shuffle per seed). */
function radioOrder(seed: number): number[] {
  const order = TRACKS.map((_, i) => i)
  let x = seed || 1
  for (let i = order.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0
    const j = x % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** Where this station is right now: track index + seconds into it. */
function radioNow(): { idx: number; offset: number } {
  const order = radioOrder(radioSeed)
  const cycle = order.reduce((s, i) => s + TRACKS[i].dur + TRACK_GAP, 0)
  let pos = (Date.now() / 1000 + (radioSeed % 1009)) % cycle
  for (const i of order) {
    if (pos < TRACKS[i].dur + TRACK_GAP) return { idx: i, offset: pos }
    pos -= TRACKS[i].dur + TRACK_GAP
  }
  return { idx: order[0], offset: 0 }
}

function ensureRadio() {
  if (!ctx || !master || radioEl) return
  ensureMusicGraph()
  radioEl = new Audio()
  radioEl.preload = 'auto'
  // through the shared music chain: same warmth, volume, and ducking
  ctx.createMediaElementSource(radioEl).connect(musicLP!)
  radioT = setInterval(syncRadio, 4000)
}

/** Keep the audio element on the station's schedule (track + position). */
function syncRadio() {
  if (!ctx || !radioEl) return
  if (station !== 'lofi' || !enabled) {
    if (!radioEl.paused) radioEl.pause()
    radioTrack = -1
    return
  }
  const { idx, offset } = radioNow()
  if (offset >= TRACKS[idx].dur - 0.1) {
    // the quiet gap between tracks
    if (!radioEl.paused) radioEl.pause()
    radioTrack = -1
    return
  }
  if (radioTrack !== idx) {
    radioTrack = idx
    radioEl.src = import.meta.env.BASE_URL + 'music/' + TRACKS[idx].file
    radioEl.onloadedmetadata = () => {
      const at = radioNow() // recompute: loading took real time
      if (at.idx !== idx || !radioEl) return
      radioEl.currentTime = Math.min(at.offset, TRACKS[idx].dur - 0.1)
      radioEl.play().catch(() => {
        radioTrack = -1 // autoplay blocked — retry on the next sync
      })
    }
  } else {
    if (Math.abs(radioEl.currentTime - offset) > 3) radioEl.currentTime = offset
    if (radioEl.paused)
      radioEl.play().catch(() => {
        radioTrack = -1
      })
  }
}

/** The track on air at this café right now (null unless on lofi). */
export function nowPlaying(): string | null {
  if (station !== 'lofi') return null
  const { idx, offset } = radioNow()
  return offset >= TRACKS[idx].dur - 0.1 ? null : TRACKS[idx].title
}

/** A chat bubble popped: dip the music for a breath so the words land. */
export function duckMusic() {
  if (!ctx || !musicGain || station === 'off') return
  const g = musicGain.gain
  const t = ctx.currentTime
  g.cancelScheduledValues(t)
  g.setTargetAtTime(musicVol * 0.35, t, 0.08)
  g.setTargetAtTime(musicVol, t + 1.3, 0.4)
}

function applyStation() {
  if (!ctx || !rainGain) return
  ensureMusicGraph()
  ensureRadio()
  const rainTarget = station === 'rain' ? 0.05 : 0.018
  rainGain.gain.linearRampToValueAtTime(rainTarget, ctx.currentTime + 1.2)
  syncRadio()
}

/** The café you're in sets the station; its seed keys the radio schedule. */
export function setStation(s: Station, seed?: string) {
  station = s
  if (seed !== undefined) {
    radioSeed = hashSeed(seed)
    radioTrack = -1 // new schedule: resync on the next tick
  }
  applyStation()
}

export function getStation(): Station {
  return station
}

export function setMusicVolume(v: number) {
  musicVol = Math.min(1, Math.max(0, v))
  localStorage.setItem('studdy-music-vol', String(musicVol))
  if (ctx && musicGain) musicGain.gain.linearRampToValueAtTime(musicVol, ctx.currentTime + 0.1)
}

export function getMusicVolume(): number {
  return musicVol
}
