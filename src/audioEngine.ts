type ToneKind =
  | 'focus'
  | 'door'
  | 'drawer'
  | 'arcade'
  | 'road'
  | 'page'
  | 'success'
  | 'secret'
  | 'letter'
  | 'lantern'
  | 'sit'
  | 'map'
  | 'final'
  // mini-game and expanded UI palette
  | 'match'
  | 'mismatch'
  | 'sequence'
  | 'star'
  | 'engine'
  | 'crash'
  | 'pageFlip'
  | 'chimeUp'
  | 'whoosh'
  | 'boss'
  | 'france'
  | 'hover'
  | 'win'

type AudioContextWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | null = null
let audioUnlocked = false
const audioCache = new Map<ToneKind, HTMLAudioElement>()

const soundMap: Record<ToneKind, string> = {
  focus: '/assets/audio/kenney/pack/Audio/rollover4.ogg',
  door: '/assets/audio/kenney/pack/Audio/switch34.ogg',
  drawer: '/assets/audio/kenney/pack/Audio/switch22.ogg',
  arcade: '/assets/audio/kenney/pack/Audio/click3.ogg',
  road: '/assets/audio/kenney/pack/Audio/switch11.ogg',
  page: '/assets/audio/kenney/pack/Audio/click1.ogg',
  success: '/assets/audio/kenney/pack/Audio/switch26.ogg',
  secret: '/assets/audio/kenney/pack/Audio/mouseclick1.ogg',
  letter: '/assets/audio/kenney/pack/Audio/rollover2.ogg',
  lantern: '/assets/audio/kenney/pack/Audio/switch16.ogg',
  sit: '/assets/audio/kenney/pack/Audio/rollover1.ogg',
  map: '/assets/audio/kenney/pack/Audio/click2.ogg',
  final: '/assets/audio/kenney/pack/Audio/switch20.ogg',
  match: '/assets/audio/kenney/pack/Audio/switch30.ogg',
  mismatch: '/assets/audio/kenney/pack/Audio/switch2.ogg',
  sequence: '/assets/audio/kenney/pack/Audio/rollover3.ogg',
  star: '/assets/audio/kenney/pack/Audio/click4.ogg',
  engine: '/assets/audio/kenney/pack/Audio/switch7.ogg',
  crash: '/assets/audio/kenney/pack/Audio/switch4.ogg',
  pageFlip: '/assets/audio/kenney/pack/Audio/click5.ogg',
  chimeUp: '/assets/audio/kenney/pack/Audio/rollover6.ogg',
  whoosh: '/assets/audio/kenney/pack/Audio/switch14.ogg',
  boss: '/assets/audio/kenney/pack/Audio/switch18.ogg',
  france: '/assets/audio/kenney/pack/Audio/switch28.ogg',
  hover: '/assets/audio/kenney/pack/Audio/switch10.ogg',
  win: '/assets/audio/kenney/pack/Audio/switch26.ogg',
}

// per-kind playback volume for the sampled OGGs (synth stays quiet on its own)
const volumeMap: Partial<Record<ToneKind, number>> = {
  hover: 0.16,
  star: 0.32,
  sequence: 0.34,
  match: 0.4,
  mismatch: 0.34,
  engine: 0.22,
  pageFlip: 0.3,
  whoosh: 0.3,
  boss: 0.4,
  france: 0.5,
}

function getContext() {
  if (audioContext) {
    return audioContext
  }

  const AudioContextCtor =
    window.AudioContext ?? (window as AudioContextWithWebkit).webkitAudioContext

  if (!AudioContextCtor) {
    return null
  }

  audioContext = new AudioContextCtor()
  return audioContext
}

export function unlockAudio() {
  const context = getContext()

  if (!context) {
    return
  }

  if (context.state === 'suspended') {
    void context.resume()
  }

  if (audioUnlocked) {
    return
  }

  const silentBuffer = context.createBuffer(1, 1, context.sampleRate)
  silentBuffer.getChannelData(0).set([0])

  const source = context.createBufferSource()
  source.buffer = silentBuffer
  source.connect(context.destination)
  source.start(0)

  audioUnlocked = true

  Object.entries(soundMap).forEach(([kind, path]) => {
    if (audioCache.has(kind as ToneKind)) {
      return
    }

    const audio = new Audio(path)
    audio.preload = 'auto'
    audio.volume = volumeMap[kind as ToneKind] ?? 0.45
    audioCache.set(kind as ToneKind, audio)
  })
}

function createEnvelope(
  context: AudioContext,
  destination: AudioNode,
  startTime: number,
  duration: number,
  peak = 0.05,
) {
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  gain.connect(destination)
  return gain
}

function createTone(
  context: AudioContext,
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  volume: number,
  detune = 0,
) {
  const oscillator = context.createOscillator()
  const envelope = createEnvelope(context, context.destination, startTime, duration, volume)

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)
  oscillator.detune.setValueAtTime(detune, startTime)
  oscillator.connect(envelope)
  oscillator.start(startTime)
  oscillator.stop(startTime + duration + 0.02)
}

export function playTone(kind: ToneKind) {
  const context = getContext()
  const cachedAudio = audioCache.get(kind)

  if (cachedAudio) {
    const audioInstance = cachedAudio.cloneNode(true) as HTMLAudioElement
    audioInstance.volume = cachedAudio.volume
    void audioInstance.play().catch(() => {
      // Safari can still refuse occasional plays, so the synth fallback remains active.
    })
  }

  if (!context) {
    return
  }

  unlockAudio()

  const start = context.currentTime + 0.005

  switch (kind) {
    case 'focus':
      createTone(context, 587.33, 'triangle', start, 0.18, 0.024)
      createTone(context, 880, 'sine', start + 0.03, 0.14, 0.012)
      break
    case 'door':
      createTone(context, 220, 'triangle', start, 0.46, 0.045)
      createTone(context, 329.63, 'sine', start + 0.09, 0.32, 0.028, -4)
      break
    case 'drawer':
      createTone(context, 392, 'square', start, 0.12, 0.018)
      createTone(context, 523.25, 'triangle', start + 0.05, 0.18, 0.014)
      break
    case 'arcade':
      createTone(context, 659.25, 'square', start, 0.1, 0.02)
      createTone(context, 783.99, 'square', start + 0.06, 0.12, 0.018)
      createTone(context, 987.77, 'triangle', start + 0.12, 0.18, 0.016)
      break
    case 'road':
      createTone(context, 440, 'triangle', start, 0.12, 0.018)
      createTone(context, 659.25, 'sine', start + 0.07, 0.18, 0.014)
      break
    case 'page':
      createTone(context, 523.25, 'triangle', start, 0.16, 0.017)
      createTone(context, 698.46, 'sine', start + 0.05, 0.14, 0.012)
      break
    case 'success':
      createTone(context, 523.25, 'triangle', start, 0.18, 0.02)
      createTone(context, 659.25, 'triangle', start + 0.08, 0.2, 0.018)
      createTone(context, 783.99, 'sine', start + 0.16, 0.28, 0.02)
      break
    case 'secret':
      createTone(context, 880, 'sine', start, 0.14, 0.02)
      createTone(context, 1174.66, 'sine', start + 0.07, 0.16, 0.018)
      createTone(context, 1567.98, 'triangle', start + 0.15, 0.3, 0.016)
      createTone(context, 2093, 'sine', start + 0.26, 0.34, 0.012)
      break
    case 'letter': {
      // paper unfolding: a soft noise swish, then a warm chime
      const noiseLength = Math.floor(context.sampleRate * 0.4)
      const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate)
      const noiseData = noiseBuffer.getChannelData(0)
      for (let index = 0; index < noiseLength; index += 1) {
        const fade = Math.sin((index / noiseLength) * Math.PI)
        noiseData[index] = (Math.random() * 2 - 1) * fade * 0.35
      }
      const noiseSource = context.createBufferSource()
      noiseSource.buffer = noiseBuffer
      const swishFilter = context.createBiquadFilter()
      swishFilter.type = 'bandpass'
      swishFilter.frequency.setValueAtTime(2600, start)
      swishFilter.frequency.exponentialRampToValueAtTime(900, start + 0.35)
      const swishGain = context.createGain()
      swishGain.gain.setValueAtTime(0.05, start)
      noiseSource.connect(swishFilter)
      swishFilter.connect(swishGain)
      swishGain.connect(context.destination)
      noiseSource.start(start)
      createTone(context, 659.25, 'sine', start + 0.28, 0.4, 0.02)
      createTone(context, 987.77, 'sine', start + 0.4, 0.55, 0.016)
      break
    }
    case 'lantern':
      createTone(context, 987.77, 'sine', start, 0.3, 0.02)
      createTone(context, 1318.51, 'sine', start + 0.05, 0.5, 0.014)
      createTone(context, 1975.53, 'sine', start + 0.05, 0.7, 0.006)
      break
    case 'sit':
      createTone(context, 196, 'triangle', start, 0.28, 0.02)
      createTone(context, 293.66, 'sine', start + 0.08, 0.24, 0.014)
      break
    case 'map':
      createTone(context, 523.25, 'triangle', start, 0.1, 0.016)
      createTone(context, 783.99, 'sine', start + 0.06, 0.14, 0.012)
      break
    case 'final':
      createTone(context, 329.63, 'triangle', start, 0.4, 0.025)
      createTone(context, 493.88, 'triangle', start + 0.11, 0.46, 0.02)
      createTone(context, 659.25, 'sine', start + 0.24, 0.7, 0.018)
      break
    case 'match':
      createTone(context, 659.25, 'triangle', start, 0.16, 0.02)
      createTone(context, 987.77, 'sine', start + 0.08, 0.24, 0.018)
      break
    case 'mismatch':
      createTone(context, 174.61, 'sawtooth', start, 0.22, 0.02, -6)
      createTone(context, 138.59, 'triangle', start + 0.04, 0.2, 0.016)
      break
    case 'sequence':
      createTone(context, 783.99, 'sine', start, 0.2, 0.02)
      break
    case 'star':
      createTone(context, 1046.5, 'sine', start, 0.14, 0.02)
      createTone(context, 1567.98, 'sine', start + 0.05, 0.22, 0.014)
      break
    case 'engine':
      createTone(context, 110, 'sawtooth', start, 0.3, 0.012, -8)
      createTone(context, 146.83, 'triangle', start + 0.02, 0.26, 0.01)
      break
    case 'crash':
      createTone(context, 98, 'square', start, 0.2, 0.02)
      createTone(context, 73.42, 'sawtooth', start + 0.03, 0.24, 0.018)
      break
    case 'pageFlip': {
      const flipLength = Math.floor(context.sampleRate * 0.22)
      const flipBuffer = context.createBuffer(1, flipLength, context.sampleRate)
      const flipData = flipBuffer.getChannelData(0)
      for (let index = 0; index < flipLength; index += 1) {
        const fade = Math.sin((index / flipLength) * Math.PI)
        flipData[index] = (Math.random() * 2 - 1) * fade * 0.3
      }
      const flipSource = context.createBufferSource()
      flipSource.buffer = flipBuffer
      const flipFilter = context.createBiquadFilter()
      flipFilter.type = 'highpass'
      flipFilter.frequency.setValueAtTime(1800, start)
      const flipGain = context.createGain()
      flipGain.gain.setValueAtTime(0.06, start)
      flipSource.connect(flipFilter)
      flipFilter.connect(flipGain)
      flipGain.connect(context.destination)
      flipSource.start(start)
      break
    }
    case 'chimeUp':
      createTone(context, 659.25, 'sine', start, 0.16, 0.016)
      createTone(context, 830.61, 'sine', start + 0.07, 0.18, 0.016)
      createTone(context, 1046.5, 'sine', start + 0.14, 0.3, 0.016)
      break
    case 'whoosh': {
      const whooshLength = Math.floor(context.sampleRate * 0.5)
      const whooshBuffer = context.createBuffer(1, whooshLength, context.sampleRate)
      const whooshData = whooshBuffer.getChannelData(0)
      for (let index = 0; index < whooshLength; index += 1) {
        const fade = Math.sin((index / whooshLength) * Math.PI)
        whooshData[index] = (Math.random() * 2 - 1) * fade * 0.32
      }
      const whooshSource = context.createBufferSource()
      whooshSource.buffer = whooshBuffer
      const whooshFilter = context.createBiquadFilter()
      whooshFilter.type = 'bandpass'
      whooshFilter.frequency.setValueAtTime(500, start)
      whooshFilter.frequency.exponentialRampToValueAtTime(2400, start + 0.45)
      const whooshGain = context.createGain()
      whooshGain.gain.setValueAtTime(0.05, start)
      whooshSource.connect(whooshFilter)
      whooshFilter.connect(whooshGain)
      whooshGain.connect(context.destination)
      whooshSource.start(start)
      break
    }
    case 'boss':
      // a playful "wah-wah" tease for the ENSI... MAG boss joke
      createTone(context, 233.08, 'sawtooth', start, 0.24, 0.02, 12)
      createTone(context, 207.65, 'sawtooth', start + 0.22, 0.28, 0.02, -14)
      createTone(context, 174.61, 'triangle', start + 0.48, 0.4, 0.022, -20)
      break
    case 'france':
      // a small bright fanfare for the send-off
      createTone(context, 523.25, 'triangle', start, 0.22, 0.02)
      createTone(context, 659.25, 'triangle', start + 0.12, 0.24, 0.02)
      createTone(context, 783.99, 'triangle', start + 0.24, 0.28, 0.02)
      createTone(context, 1046.5, 'sine', start + 0.36, 0.5, 0.02)
      break
    case 'hover':
      createTone(context, 880, 'sine', start, 0.08, 0.008)
      break
    case 'win':
      createTone(context, 523.25, 'triangle', start, 0.16, 0.02)
      createTone(context, 659.25, 'triangle', start + 0.09, 0.18, 0.02)
      createTone(context, 783.99, 'triangle', start + 0.18, 0.2, 0.02)
      createTone(context, 1046.5, 'sine', start + 0.28, 0.4, 0.022)
      break
  }
}

// A pitched blip for mini-games that need specific notes (Simon-says lanterns,
// memory-match reveals). Uses the synth so it can hit any frequency.
export function playNote(frequency: number, duration = 0.28, volume = 0.02) {
  const context = getContext()

  if (!context) {
    return
  }

  unlockAudio()
  const start = context.currentTime + 0.005
  createTone(context, frequency, 'sine', start, duration, volume)
  createTone(context, frequency * 2, 'sine', start + 0.02, duration * 0.7, volume * 0.5)
}

// Light haptic feedback for touch devices. iOS Safari ignores navigator.vibrate,
// so this is a graceful no-op there and a small buzz on Android/other browsers.
export function haptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // some browsers throw if called outside a user gesture; ignore
  }
}

// The garden piano plays the opening of Beethoven's "Moonlight" Sonata
// (Op. 27 No. 2, Adagio sostenuto) — a real piece, transcribed by hand from the
// public-domain score: the C#-minor triplet ostinato, the descending octave
// ground in the bass, and the sighing dotted melody, closing quietly on the
// minor tonic that never resolves to major.
//
// It is here for its own reasons — a song written around a love the composer
// could not keep, and an ending that stays sad on purpose. That reading lives
// in this comment and nowhere the visitor can read it. 🌹
//
// Returns its length in ms.
export function playMelody(): number {
  const context = getContext()

  if (!context) {
    return 0
  }

  unlockAudio()
  const start = context.currentTime + 0.15
  const tnote = 0.28 // one triplet eighth — the slow Adagio pulse
  const beat = tnote * 3 // a quarter-note beat = three triplet notes

  // a long, dark bloom so each note rings out in the space
  const delay = context.createDelay(1)
  delay.delayTime.setValueAtTime(0.33, start)
  const feedback = context.createGain()
  feedback.gain.setValueAtTime(0.26, start)
  const delayOut = context.createGain()
  delayOut.gain.setValueAtTime(0.4, start)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(delayOut)
  delayOut.connect(context.destination)

  // a struck-string voice: fundamental + harmonics, soft attack, a lowpass that
  // closes over the note's life and a touch of detune for warmth
  const piano = (frequency: number, at: number, duration: number, volume = 0.05) => {
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.4), at + 0.2)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(3600, at)
    filter.frequency.exponentialRampToValueAtTime(720, at + duration)

    gain.connect(filter)
    filter.connect(context.destination)
    filter.connect(delay)

    const harmonics: Array<[number, number]> = [
      [1, 1],
      [2, 0.3],
      [3, 0.12],
      [4, 0.05],
    ]
    harmonics.forEach(([mult, amp], index) => {
      const osc = context.createOscillator()
      osc.type = index === 0 ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(frequency * mult, at)
      osc.detune.setValueAtTime((index - 1.5) * 1.5, at)
      const partial = context.createGain()
      partial.gain.setValueAtTime(amp, at)
      osc.connect(partial)
      partial.connect(gain)
      osc.start(at)
      osc.stop(at + duration + 0.12)
    })
  }

  // the notes the piece needs (C# minor)
  const N = {
    Fs1: 46.25, Gs1: 51.91, A1: 55.0, B1: 61.74, Cs2: 69.3,
    Gs2: 103.83, Cs3: 138.59, E3: 164.81, Gs3: 207.65, A3: 220.0,
    Bs3: 261.63, Cs4: 277.18, Ds4: 311.13, D4: 293.66, E4: 329.63,
    Fs4: 369.99, Gs4: 415.3, A4: 440.0, B4: 493.88, Cs5: 554.37,
  }

  // --- the right-hand triplet ostinato, four groups to a bar, eight bars ---
  // each bar (mod 4) is one harmony: i, i/B, VI→II, V — the famous ground
  const bar0: number[][] = [
    [N.Gs3, N.Cs4, N.E4], [N.Gs3, N.Cs4, N.E4], [N.Gs3, N.Cs4, N.E4], [N.Gs3, N.Cs4, N.E4],
  ]
  const bar2: number[][] = [
    [N.A3, N.Cs4, N.E4], [N.A3, N.Cs4, N.E4], [N.A3, N.D4, N.Fs4], [N.A3, N.D4, N.Fs4],
  ]
  const bar3: number[][] = [
    [N.Gs3, N.Bs3, N.E4], [N.Gs3, N.Bs3, N.E4], [N.Gs3, N.Cs4, N.E4], [N.Gs3, N.Cs4, N.Ds4],
  ]
  const bars = [bar0, bar0, bar2, bar3, bar0, bar0, bar2, bar3]

  bars.forEach((groups, barIndex) => {
    groups.forEach((triplet, groupIndex) => {
      triplet.forEach((frequency, tripletIndex) => {
        const at = start + (barIndex * 4 + groupIndex) * beat + tripletIndex * tnote
        piano(frequency, at, beat * 0.95, 0.02)
      })
    })
  })

  // --- the left-hand octave ground: the slow descent C# – B – A/F# – G# ---
  const bass: Array<[number, number, number]> = [
    [N.Cs2, 0, 4], [N.B1, 4, 4], [N.A1, 8, 2], [N.Fs1, 10, 2], [N.Gs1, 12, 4],
    [N.Cs2, 16, 4], [N.B1, 20, 4], [N.A1, 24, 2], [N.Fs1, 26, 2], [N.Gs1, 28, 4],
  ]
  bass.forEach(([frequency, b, d]) => {
    piano(frequency, start + b * beat, d * beat, 0.03)
    piano(frequency * 2, start + b * beat, d * beat, 0.02)
  })

  // --- the melody, entering after the four-bar introduction (bar 5) ---
  // the dotted line that rises once and then keeps sinking, unanswered
  const melody: Array<[number, number, number]> = [
    [N.Gs4, 16, 1.5], [N.Gs4, 17.5, 0.5], [N.Gs4, 18, 1], [N.A4, 19, 0.5], [N.Gs4, 19.5, 0.5],
    [N.Gs4, 20, 1], [N.Fs4, 21, 1], [N.E4, 22, 1], [N.Ds4, 23, 1],
    [N.E4, 24, 1.5], [N.Gs4, 25.5, 0.5], [N.Cs5, 26, 2],
    [N.B4, 28, 1], [N.A4, 29, 1], [N.Gs4, 30, 2],
  ]
  melody.forEach(([frequency, b, d]) => piano(frequency, start + b * beat, d * beat, 0.055))

  // --- the close: V resolves to a bare C# minor that just fades, never lifting ---
  const endAt = start + 32 * beat
  ;[N.Cs2, N.Cs3, N.E3, N.Gs3, N.Cs4].forEach((frequency) =>
    piano(frequency, endAt, beat * 7, 0.028),
  )

  return Math.round((39 * beat) * 1000)
}

// A quick ascending sparkle used when the drive collects a star fragment.
export function playPickup(step = 0) {
  const context = getContext()

  if (!context) {
    return
  }

  unlockAudio()
  const start = context.currentTime + 0.005
  const base = 880 + step * 90
  createTone(context, base, 'sine', start, 0.12, 0.02)
  createTone(context, base * 1.5, 'sine', start + 0.05, 0.2, 0.014)
}

let footstepCounter = 0

export function playFootstep() {
  const context = getContext()

  if (!context || !audioUnlocked) {
    return
  }

  footstepCounter += 1
  const start = context.currentTime + 0.002
  const duration = 0.075
  const bufferLength = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, bufferLength, context.sampleRate)
  const data = buffer.getChannelData(0)

  for (let index = 0; index < bufferLength; index += 1) {
    const decay = 1 - index / bufferLength
    data[index] = (Math.random() * 2 - 1) * decay * decay
  }

  const source = context.createBufferSource()
  source.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(footstepCounter % 2 === 0 ? 360 : 310, start)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.055, start)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(start)
}
