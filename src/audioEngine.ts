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

// A gentle, tender piano melody for the garden piano. Returns its length in ms.
//
// Some things are easier to say in a melody than out loud — so this one quietly
// carries what the letter left unsaid. That stays here, in the source, and
// nowhere else. 🌹
export function playMelody(): number {
  const context = getContext()

  if (!context) {
    return 0
  }

  unlockAudio()
  const start = context.currentTime + 0.12
  const beat = 0.46

  // a shared delay so the notes bloom with a little space
  const delay = context.createDelay(1)
  delay.delayTime.setValueAtTime(0.29, start)
  const feedback = context.createGain()
  feedback.gain.setValueAtTime(0.3, start)
  const delayOut = context.createGain()
  delayOut.gain.setValueAtTime(0.45, start)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(delayOut)
  delayOut.connect(context.destination)

  const piano = (frequency: number, at: number, duration: number, volume = 0.06) => {
    const osc = context.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(frequency, at)
    const overtone = context.createOscillator()
    overtone.type = 'sine'
    overtone.frequency.setValueAtTime(frequency * 2, at)
    const overtoneGain = context.createGain()
    overtoneGain.gain.setValueAtTime(0.28, at)

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    osc.connect(gain)
    overtone.connect(overtoneGain)
    overtoneGain.connect(gain)
    gain.connect(context.destination)
    gain.connect(delay)
    osc.start(at)
    overtone.start(at)
    osc.stop(at + duration + 0.05)
    overtone.stop(at + duration + 0.05)
  }

  const N = {
    C3: 130.81, F3: 174.61, G3: 196, A3: 220,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25,
  }

  const melody: Array<[number, number, number]> = [
    [N.E4, 0, 1.5], [N.G4, 1.5, 0.5], [N.C5, 2, 2], [N.B4, 4, 1], [N.A4, 5, 1.5], [N.G4, 6.5, 0.5], [N.E4, 7, 2],
    [N.D4, 9, 1], [N.F4, 10, 1], [N.A4, 11, 1], [N.G4, 12, 3],
    [N.C5, 15, 1], [N.D5, 16, 1], [N.E5, 17, 3],
  ]
  melody.forEach(([frequency, b, d]) => piano(frequency, start + b * beat, d * beat))

  const bass: Array<[number, number, number]> = [
    [N.C3, 0, 3.5], [N.A3, 4, 3], [N.F3, 9, 3], [N.G3, 12, 3], [N.C3, 15, 5],
  ]
  bass.forEach(([frequency, b, d]) => piano(frequency, start + b * beat, d * beat, 0.03))

  return 21 * beat * 1000
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
