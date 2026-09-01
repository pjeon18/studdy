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
// Café music: a per-café "radio station" the owner picks. Prototype
// backing is generative ambience (pads + dusty crackle + soft beat) —
// the production path is curated lofi files / bring-your-own-Spotify.
// ====================================================================

export type Station = 'lofi' | 'rain' | 'off'
export const STATIONS: { id: Station; label: string }[] = [
  { id: 'lofi', label: 'lofi beats' },
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
  if (!ctx || station === 'off' || !enabled) {
    if (ctx) nextBar = Math.max(nextBar, ctx.currentTime + 0.1)
    return
  }
  while (nextBar < ctx.currentTime + 1.6) {
    if (station === 'lofi') scheduleLofiBar(nextBar, barIndex)
    else scheduleRainBar(nextBar, barIndex)
    nextBar += BAR
    barIndex++
  }
}

function scheduleLofiBar(t0: number, bar: number) {
  const dest = musicLP!
  const beat = BAR / 4
  const chord = CHORDS[bar % 4]
  // pad: slow-attack detuned triangles
  for (const f of chord) {
    tone(f, t0, BAR + 0.5, 0.028, 'triangle', undefined, dest)
    tone(f * 1.004, t0 + 0.03, BAR + 0.4, 0.016, 'triangle', undefined, dest)
  }
  tone(chord[0] / 2, t0, BAR, 0.05, 'sine', undefined, dest) // bass root
  // dusty beat, mixed low
  for (const b of [0, 2]) tone(115, t0 + b * beat, 0.1, 0.1, 'sine', 42, dest)
  for (const b of [1, 3]) burst(t0 + b * beat, 0.07, 0.03, 1700, 0.9, dest)
  for (const b of [0.5, 1.5, 2.5, 3.5]) burst(t0 + b * beat, 0.02, 0.014, 6200, 1.4, dest)
  // an occasional mellow pluck, one octave up
  if ((bar * 7) % 3 !== 0) {
    const pool = chord.map((f) => f * 2)
    const n1 = pool[(bar * 5) % 4]
    tone(n1, t0 + ((bar % 3) + 1) * beat, 0.6, 0.045, 'sine', undefined, dest)
    if (bar % 2 === 0) tone(pool[(bar * 3 + 1) % 4], t0 + 3.5 * beat, 0.5, 0.035, 'sine', undefined, dest)
  }
  // vinyl crackle
  for (let i = 0; i < 5; i++) burst(t0 + (((bar * 13 + i * 29) % 32) / 32) * BAR, 0.008, 0.012, 4200, 2, dest)
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

function applyStation() {
  if (!ctx || !rainGain) return
  ensureMusicGraph()
  const rainTarget = station === 'rain' ? 0.05 : 0.018
  rainGain.gain.linearRampToValueAtTime(rainTarget, ctx.currentTime + 1.2)
}

/** The café you're in sets the station (owner-configured). */
export function setStation(s: Station) {
  station = s
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
