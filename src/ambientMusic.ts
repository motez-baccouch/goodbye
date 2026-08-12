// Music for the garden.
//
// Primary: real piano recordings (public-domain / CC performances, see CREDITS.md).
//   - Debussy, Clair de Lune — loops while exploring the garden.
//   - Chopin, Nocturne Op. 9 No. 2 — crossfades in for the final letter.
// Fallback: a small generative WebAudio lullaby, used if the files cannot play
//   (offline dev, decode failure, exotic browsers).
//
// iOS note: iOS Safari ignores the HTMLMediaElement `volume` property, so we
// never rely on volume for muting or crossfades. Exactly ONE track plays at a
// time; every pause()/play() transition happens inside a user tap (Start,
// Interact, the Music toggle), which Safari always allows.

const GARDEN_TRACK = '/assets/audio/music/clair-de-lune.mp3'
const FINALE_TRACK = '/assets/audio/music/nocturne-op9-2.mp3'

let gardenAudio: HTMLAudioElement | null = null
let finaleAudio: HTMLAudioElement | null = null
let started = false
let muted = false
let finale = false

function currentAudio() {
  return finale ? (finaleAudio ?? gardenAudio) : gardenAudio
}

export function startMusic() {
  if (started) return
  started = true

  startWind()

  gardenAudio = new Audio(GARDEN_TRACK)
  gardenAudio.loop = true
  gardenAudio.preload = 'auto'
  gardenAudio.addEventListener(
    'error',
    () => {
      gardenAudio = null
      if (!finale) startGenerativeMusic()
    },
    { once: true },
  )

  // preload only; playback starts at the finale, inside that tap
  finaleAudio = new Audio(FINALE_TRACK)
  finaleAudio.loop = true
  finaleAudio.preload = 'auto'
  finaleAudio.addEventListener(
    'error',
    () => {
      finaleAudio = null
    },
    { once: true },
  )

  if (!muted) {
    gardenAudio.play().catch(() => {
      startGenerativeMusic()
    })
  }
}

export function notifyFinale() {
  if (finale) return
  finale = true

  // called from inside the Interact tap, so play() is gesture-initiated
  gardenAudio?.pause()

  if (finaleAudio && !muted) {
    try {
      finaleAudio.currentTime = 0
    } catch {
      // ignore seek errors on partially-loaded media
    }
    finaleAudio.play().catch(() => undefined)
  }

  generativeSetFinale()
}

export function setMusicMuted(nextMuted: boolean) {
  muted = nextMuted

  // called from the Music toggle tap, so play() is gesture-initiated
  if (nextMuted) {
    gardenAudio?.pause()
    finaleAudio?.pause()
  } else {
    currentAudio()?.play().catch(() => undefined)
  }

  generativeSetMuted(nextMuted)
  windSetMuted(nextMuted)
}

export function isMusicMuted() {
  return muted
}

// Duck the ambient music while the garden piano plays a piece, then restore it.
// (called inside user taps / short timeouts; on iOS the element is already
// unlocked from Start, so resume is allowed)
export function setMusicDucked(ducked: boolean) {
  if (ducked) {
    gardenAudio?.pause()
    finaleAudio?.pause()
    generativeSetMuted(true)
  } else if (!muted) {
    currentAudio()?.play().catch(() => undefined)
    generativeSetMuted(false)
  }
}

// ---------------------------------------------------------------------------
// Wind: soft filtered-noise gusts that swell and fade under the music
// ---------------------------------------------------------------------------

let windStarted = false
let windMuteGain: GainNode | null = null
let windGustGain: GainNode | null = null
let windGustTimer: number | null = null

const WIND_LEVEL = 0.05

function startWind() {
  const ctx = getContext()
  if (!ctx || windStarted) return
  windStarted = true

  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  // two seconds of looped noise
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0

  for (let index = 0; index < length; index += 1) {
    // lightly lowpassed random walk sounds closer to air than white noise
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.12
    data[index] = last
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true

  const tone = ctx.createBiquadFilter()
  tone.type = 'bandpass'
  tone.frequency.setValueAtTime(520, ctx.currentTime)
  tone.Q.setValueAtTime(0.55, ctx.currentTime)

  windGustGain = ctx.createGain()
  windGustGain.gain.setValueAtTime(0.25, ctx.currentTime)

  windMuteGain = ctx.createGain()
  windMuteGain.gain.setValueAtTime(muted ? 0.0001 : WIND_LEVEL, ctx.currentTime)

  source.connect(tone)
  tone.connect(windGustGain)
  windGustGain.connect(windMuteGain)
  windMuteGain.connect(ctx.destination)
  source.start()

  const scheduleGust = () => {
    if (!windGustGain || !context) return
    const now = context.currentTime
    const rise = 1.4 + Math.random() * 2
    const strength = 0.45 + Math.random() * 0.55
    windGustGain.gain.cancelScheduledValues(now)
    windGustGain.gain.setValueAtTime(Math.max(windGustGain.gain.value, 0.05), now)
    windGustGain.gain.linearRampToValueAtTime(strength, now + rise)
    windGustGain.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.1, now + rise + 2.5 + Math.random() * 2)
  }

  scheduleGust()
  windGustTimer = window.setInterval(scheduleGust, 7000 + Math.random() * 4000)
}

function windSetMuted(nextMuted: boolean) {
  const ctx = context
  if (!ctx || !windMuteGain) return
  windMuteGain.gain.cancelScheduledValues(ctx.currentTime)
  windMuteGain.gain.setValueAtTime(Math.max(windMuteGain.gain.value, 0.0001), ctx.currentTime)
  windMuteGain.gain.linearRampToValueAtTime(nextMuted ? 0.0001 : WIND_LEVEL, ctx.currentTime + 0.8)
}

// ---------------------------------------------------------------------------
// Generative fallback (small WebAudio lullaby pad + sparkle plucks)
// ---------------------------------------------------------------------------

let context: AudioContext | null = null
let masterGain: GainNode | null = null
let padFilter: BiquadFilterNode | null = null
let delayNode: DelayNode | null = null
let schedulerId: number | null = null
let chordIndex = 0
let nextChordTime = 0
let nextSparkleTime = 0
let generativeStarted = false

const PAD_LEVEL = 0.16
const CHORD_LENGTH = 9
const CHORD_OVERLAP = 3.2

// Gentle, hopeful progression: Cmaj7 -> Am9 -> Fmaj7 -> G6
const CHORDS: number[][] = [
  [130.81, 196.0, 246.94, 329.63, 392.0],
  [110.0, 164.81, 246.94, 329.63, 440.0],
  [87.31, 174.61, 220.0, 261.63, 329.63],
  [98.0, 196.0, 246.94, 293.66, 329.63],
]

// C major pentatonic, two high octaves, for the sparkle plucks.
const SPARKLE_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]

type AudioContextWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }

function getContext() {
  if (context) return context
  const Ctor = window.AudioContext ?? (window as AudioContextWithWebkit).webkitAudioContext
  if (!Ctor) return null
  context = new Ctor()
  return context
}

function buildGraph(ctx: AudioContext) {
  masterGain = ctx.createGain()
  masterGain.gain.setValueAtTime(0.0001, ctx.currentTime)
  masterGain.connect(ctx.destination)

  padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.setValueAtTime(1050, ctx.currentTime)
  padFilter.Q.setValueAtTime(0.4, ctx.currentTime)
  padFilter.connect(masterGain)

  delayNode = ctx.createDelay(2)
  delayNode.delayTime.setValueAtTime(0.62, ctx.currentTime)
  const feedback = ctx.createGain()
  feedback.gain.setValueAtTime(0.34, ctx.currentTime)
  const delayTone = ctx.createBiquadFilter()
  delayTone.type = 'lowpass'
  delayTone.frequency.setValueAtTime(2400, ctx.currentTime)
  delayNode.connect(delayTone)
  delayTone.connect(feedback)
  feedback.connect(delayNode)
  delayTone.connect(masterGain)
}

function scheduleChord(ctx: AudioContext, frequencies: number[], startTime: number) {
  if (!padFilter) return
  const voiceLevel = PAD_LEVEL / frequencies.length

  frequencies.forEach((frequency, index) => {
    const detunes = [-4, 3]
    detunes.forEach((detune) => {
      const oscillator = ctx.createOscillator()
      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.setValueAtTime(frequency, startTime)
      oscillator.detune.setValueAtTime(detune, startTime)

      const gain = ctx.createGain()
      const duration = CHORD_LENGTH + CHORD_OVERLAP
      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.linearRampToValueAtTime(voiceLevel * 0.5, startTime + 2.6)
      gain.gain.setValueAtTime(voiceLevel * 0.5, startTime + duration - 3)
      gain.gain.linearRampToValueAtTime(0.0001, startTime + duration)

      oscillator.connect(gain)
      gain.connect(padFilter as BiquadFilterNode)
      oscillator.start(startTime)
      oscillator.stop(startTime + duration + 0.1)
    })
  })
}

function scheduleSparkle(ctx: AudioContext, startTime: number) {
  if (!delayNode || !masterGain) return
  const note = SPARKLE_NOTES[Math.floor(Math.random() * SPARKLE_NOTES.length)]

  const oscillator = ctx.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(note, startTime)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(0.035, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4)

  oscillator.connect(gain)
  gain.connect(masterGain)
  gain.connect(delayNode)
  oscillator.start(startTime)
  oscillator.stop(startTime + 1.6)
}

function schedulerTick() {
  const ctx = context
  if (!ctx) return

  const horizon = ctx.currentTime + 1.5

  while (nextChordTime < horizon) {
    scheduleChord(ctx, CHORDS[chordIndex % CHORDS.length], nextChordTime)
    chordIndex += 1
    nextChordTime += CHORD_LENGTH
  }

  while (nextSparkleTime < horizon) {
    scheduleSparkle(ctx, nextSparkleTime)
    nextSparkleTime += 3.5 + Math.random() * 5
  }
}

function startGenerativeMusic() {
  const ctx = getContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  if (generativeStarted) return
  generativeStarted = true

  buildGraph(ctx)
  chordIndex = 0
  nextChordTime = ctx.currentTime + 0.15
  nextSparkleTime = ctx.currentTime + 4

  schedulerTick()
  schedulerId = window.setInterval(schedulerTick, 500)

  if (!muted && masterGain) {
    masterGain.gain.cancelScheduledValues(ctx.currentTime)
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 4)
  }
}

function generativeSetMuted(nextMuted: boolean) {
  const ctx = context
  if (!ctx || !masterGain) return
  const target = nextMuted ? 0.0001 : 1
  masterGain.gain.cancelScheduledValues(ctx.currentTime)
  masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), ctx.currentTime)
  masterGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.8)
}

function generativeSetFinale() {
  // the generative pad simply keeps playing for the finale
}

export function stopMusic() {
  if (schedulerId !== null) {
    window.clearInterval(schedulerId)
    schedulerId = null
  }
  if (windGustTimer !== null) {
    window.clearInterval(windGustTimer)
    windGustTimer = null
  }
  generativeStarted = false
  gardenAudio?.pause()
  finaleAudio?.pause()
  started = false
}
