import { useEffect, useMemo, useRef, useState } from 'react'
import { haptic, playNote, playPickup, playTone } from './audioEngine'

// A small moonlit car drawn as SVG so it matches the garden palette (the emoji
// car clashed with the blues/golds). Viewed from behind, headlights forward.
function CarSprite() {
  return (
    <svg className="drive-car-svg" viewBox="0 0 44 60" width="40" height="54" aria-hidden="true">
      <ellipse cx="22" cy="54" rx="15" ry="5" fill="rgba(133,147,255,0.35)" />
      <rect x="7" y="10" width="30" height="42" rx="10" fill="#6fb2ff" />
      <rect x="7" y="10" width="30" height="42" rx="10" fill="url(#carShade)" opacity="0.35" />
      <rect x="12" y="16" width="20" height="13" rx="5" fill="#d9f0ff" />
      <rect x="12" y="34" width="20" height="12" rx="5" fill="#bfe4ff" opacity="0.8" />
      <circle cx="13" cy="13" r="3.4" fill="#fff6c8" />
      <circle cx="31" cy="13" r="3.4" fill="#fff6c8" />
      <circle cx="13" cy="13" r="6.5" fill="#fff2b0" opacity="0.5" />
      <circle cx="31" cy="13" r="6.5" fill="#fff2b0" opacity="0.5" />
      <defs>
        <linearGradient id="carShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#2a4a8f" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// Real little mini-games that sit on top of the 3D garden. Each one is a
// controlled component: it plays out an interaction and calls `onStep` every
// time the player earns the next memory for that station. The parent owns the
// progress flags, the handwritten memory card, and the per-step sound, so these
// components only worry about *play*. While a memory card is showing the parent
// passes `paused` so input is ignored until the player dismisses it.

const SPARK_COLORS = ['#ffe6a1', '#ff9ecb', '#8cc8ff', '#b7f7c0', '#ffd27a', '#c9b3ff']

// A little celebratory firework burst rendered in the DOM. Directions are
// derived from the index (no Math.random during render) so it stays lint-clean.
export function SparkBurst({ count = 30 }: { count?: number }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.35
        const distance = 70 + ((index * 37) % 70)
        return {
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance,
          color: SPARK_COLORS[index % SPARK_COLORS.length],
          delay: (index % 6) * 0.04,
        }
      }),
    [count],
  )

  return (
    <div className="spark-burst" aria-hidden="true">
      {sparks.map((spark, index) => (
        <span
          key={index}
          className="spark"
          style={
            {
              '--tx': `${spark.tx}px`,
              '--ty': `${spark.ty}px`,
              background: spark.color,
              color: spark.color,
              animationDelay: `${spark.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export type MiniGameProps = {
  progress: number
  total: number
  paused: boolean
  onStep: () => void
  onClose: () => void
}

type StationKind = 'archive' | 'lanterns' | 'path' | 'reading'

function CompleteBanner({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children?: React.ReactNode
}) {
  useEffect(() => {
    playTone('win')
    haptic([14, 40, 14])
  }, [])

  return (
    <div className="minigame-complete">
      <SparkBurst count={26} />
      <div className="minigame-complete-badge" aria-hidden="true">
        ✦
      </div>
      <h2>{label}</h2>
      {children}
      <button type="button" className="collect-button" onClick={onClose}>
        Back to the garden
      </button>
    </div>
  )
}

// The gift-givers "held" every garden record — but left them easy, so Noura can
// take the crown.
const RECORD_HOLDER = 'Motez'
const PLAYER_NAME = 'Noura'

const RECORD_PRESETS: Record<string, Array<{ name: string; detail: string }>> = {
  archive: [
    { name: RECORD_HOLDER, detail: '9 moves' },
    { name: 'Hassen', detail: '13 moves' },
    { name: RECORD_HOLDER, detail: '11 moves' },
  ],
  lanterns: [
    { name: RECORD_HOLDER, detail: '2 slips' },
    { name: 'Hassen', detail: '5 slips' },
    { name: RECORD_HOLDER, detail: '3 slips' },
  ],
  path: [
    { name: RECORD_HOLDER, detail: '4 stars' },
    { name: 'Hassen', detail: '3 stars' },
    { name: RECORD_HOLDER, detail: '4 stars' },
  ],
}

function Leaderboard({ game, stat }: { game: keyof typeof RECORD_PRESETS; stat: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(`garden-champ-${game}`, PLAYER_NAME)
    } catch {
      // private mode etc. — the crown is still yours in spirit
    }
  }, [game])

  const presets = RECORD_PRESETS[game] ?? []

  return (
    <div className="leaderboard">
      <p className="leaderboard-title">Garden Records ✦</p>
      <ol className="leaderboard-list">
        <li className="leaderboard-you">
          <span>1. {PLAYER_NAME}</span>
          <span>{stat} · new record!</span>
        </li>
        {presets.map((row, index) => (
          <li key={index}>
            <span>
              {index + 2}. {row.name}
            </span>
            <span>{row.detail}</span>
          </li>
        ))}
      </ol>
      <p className="leaderboard-note">You just dethroned {RECORD_HOLDER}. As it should be. 👑</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rose Cabinet — a memory-match game with the office in-jokes
// ---------------------------------------------------------------------------

type MatchTile = { id: number; kind: string; glyph: string; label: string }

const MATCH_PAIRS: Array<{ kind: string; glyph: string; label: string }> = [
  { kind: 'carole', glyph: '📄', label: 'HTML, 5 months in' },
  { kind: 'wael', glyph: '🌧️', label: 'Wael’s weather excuse' },
  { kind: 'ali', glyph: '😇', label: 'Ali’s halo' },
  { kind: 'michal', glyph: '🏅', label: 'Michal, best man' },
]

// small pure PRNG so the deck can be shuffled inside a useState initializer
// without an impure Math.random during render (React Compiler lint)
function seededShuffle<T>(items: T[], seed: number): T[] {
  const next = [...items]
  let state = seed
  for (let index = next.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const swap = Math.floor((state / 4294967296) * (index + 1))
    ;[next[index], next[swap]] = [next[swap], next[index]]
  }
  return next
}

function buildDeck(): MatchTile[] {
  const deck = MATCH_PAIRS.flatMap((pair, pairIndex) => [
    { id: pairIndex * 2, kind: pair.kind, glyph: pair.glyph, label: pair.label },
    { id: pairIndex * 2 + 1, kind: pair.kind, glyph: pair.glyph, label: pair.label },
  ])
  return seededShuffle(deck, 20260810)
}

function MatchGame({ progress, total, paused, onStep, onClose }: MiniGameProps) {
  const [tiles] = useState<MatchTile[]>(buildDeck)
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<string>>(() => new Set())
  const [locked, setLocked] = useState(false)
  const [moves, setMoves] = useState(0)

  const done = progress >= total

  const handleFlip = (tileIndex: number) => {
    if (paused || locked || done) return
    const tile = tiles[tileIndex]
    if (!tile || matched.has(tile.kind) || flipped.includes(tileIndex)) return

    playTone('drawer')
    const nextFlipped = [...flipped, tileIndex]
    setFlipped(nextFlipped)

    if (nextFlipped.length < 2) return

    setMoves((current) => current + 1)
    const [firstIndex, secondIndex] = nextFlipped
    const first = tiles[firstIndex]
    const second = tiles[secondIndex]
    setLocked(true)

    if (first.kind === second.kind) {
      window.setTimeout(() => {
        setMatched((current) => {
          const next = new Set(current)
          next.add(first.kind)
          return next
        })
        setFlipped([])
        setLocked(false)
        playTone('match')
        haptic(16)
        onStep()
      }, 360)
    } else {
      playTone('mismatch')
      window.setTimeout(() => {
        setFlipped([])
        setLocked(false)
      }, 780)
    }
  }

  if (done) {
    return (
      <CompleteBanner label="Every drawer remembered." onClose={onClose}>
        <Leaderboard game="archive" stat={`${moves} moves`} />
      </CompleteBanner>
    )
  }

  return (
    <>
      <p className="minigame-instruction">
        Match the office legends. Find all four pairs to open the rose cabinet.
      </p>
      <div className="match-grid">
        {tiles.map((tile, tileIndex) => {
          const isOpen = flipped.includes(tileIndex) || matched.has(tile.kind)
          return (
            <button
              key={tile.id}
              type="button"
              className={`match-tile${isOpen ? ' open' : ''}${matched.has(tile.kind) ? ' matched' : ''}`}
              onClick={() => handleFlip(tileIndex)}
              aria-label={isOpen ? tile.label : 'Hidden drawer'}
            >
              <span className="match-face match-back" aria-hidden="true">
                ✿
              </span>
              <span className="match-face match-front" aria-hidden="true">
                <span className="match-glyph">{tile.glyph}</span>
                {matched.has(tile.kind) ? <span className="match-label">{tile.label}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
      <p className="minigame-progress">{progress}/{total} pairs found</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Lantern Grove — a "light the sequence" (Simon-says) game
// ---------------------------------------------------------------------------

const LANTERN_NOTES = [392, 493.88, 587.33, 659.25]
const LANTERN_COLORS = ['#ffd27a', '#ff9ecb', '#8cc8ff', '#b7f7c0']

function LanternGame({ progress, total, paused, onStep, onClose }: MiniGameProps) {
  const orderRef = useRef<number[]>([])
  const [phase, setPhase] = useState<'idle' | 'showing' | 'input'>('idle')
  const [litLantern, setLitLantern] = useState<number | null>(null)
  const [inputCount, setInputCount] = useState(0)
  const [wrong, setWrong] = useState(false)
  const [slips, setSlips] = useState(0)
  const timeoutsRef = useRef<number[]>([])

  const done = progress >= total
  const sequenceLength = progress + 2 // rounds grow: 2, 3, 4

  useEffect(() => {
    // one long random master sequence; each round uses a growing prefix
    orderRef.current = Array.from({ length: total + 3 }, () => Math.floor(Math.random() * 4))
    return () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id))
    }
  }, [total])

  const playSequence = () => {
    if (paused || done) return
    setPhase('showing')
    setInputCount(0)
    setWrong(false)
    const sequence = orderRef.current.slice(0, sequenceLength)
    timeoutsRef.current.forEach((id) => window.clearTimeout(id))
    timeoutsRef.current = []

    sequence.forEach((lantern, step) => {
      const onId = window.setTimeout(() => {
        setLitLantern(lantern)
        playNote(LANTERN_NOTES[lantern], 0.32, 0.024)
      }, step * 620 + 400)
      const offId = window.setTimeout(() => {
        setLitLantern(null)
      }, step * 620 + 400 + 360)
      timeoutsRef.current.push(onId, offId)
    })

    const doneId = window.setTimeout(() => {
      setPhase('input')
    }, sequenceLength * 620 + 500)
    timeoutsRef.current.push(doneId)
  }

  const handleTap = (lantern: number) => {
    if (paused || phase !== 'input' || done) return
    setLitLantern(lantern)
    window.setTimeout(() => setLitLantern(null), 200)
    playNote(LANTERN_NOTES[lantern], 0.28, 0.022)

    const expected = orderRef.current[inputCount]
    if (lantern !== expected) {
      setWrong(true)
      setSlips((current) => current + 1)
      playTone('mismatch')
      setPhase('idle')
      return
    }

    const nextCount = inputCount + 1
    setInputCount(nextCount)

    if (nextCount >= sequenceLength) {
      setPhase('idle')
      playTone('chimeUp')
      haptic(16)
      onStep()
    }
  }

  if (done) {
    return (
      <CompleteBanner label="The whole grove is glowing." onClose={onClose}>
        <Leaderboard game="lanterns" stat={slips === 0 ? 'flawless' : `${slips} slips`} />
      </CompleteBanner>
    )
  }

  return (
    <>
      <p className="minigame-instruction">
        {phase === 'showing'
          ? 'Watch the lanterns…'
          : phase === 'input'
            ? `Repeat the sequence — ${inputCount}/${sequenceLength}`
            : wrong
              ? 'Not quite — try that round again.'
              : `Round ${progress + 1} of ${total}. Light the lanterns in order.`}
      </p>
      <div className="lantern-row">
        {LANTERN_COLORS.map((color, lantern) => (
          <button
            key={lantern}
            type="button"
            className={`lantern-button${litLantern === lantern ? ' lit' : ''}`}
            style={{ '--lantern-color': color } as React.CSSProperties}
            onClick={() => handleTap(lantern)}
            disabled={phase === 'showing'}
            aria-label={`Lantern ${lantern + 1}`}
          />
        ))}
      </div>
      <button
        type="button"
        className="collect-button minigame-action"
        onClick={playSequence}
        disabled={phase !== 'idle' || paused}
      >
        {wrong ? 'Show me again' : progress === 0 ? 'Begin' : 'Next round'}
      </button>
      <p className="minigame-progress">{progress}/{total} rounds lit</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Starlit Path — a tiny lane drive, collect the star fragments
// ---------------------------------------------------------------------------

type FallingStar = { id: number; lane: number; y: number; kind: 'star' | 'petal'; counted: boolean }

const LANE_X = [18, 50, 82]

function DriveGame({ progress, total, paused, onStep, onClose }: MiniGameProps) {
  const [lane, setLane] = useState(1)
  const [stars, setStars] = useState<FallingStar[]>([])
  const [petals, setPetals] = useState(0)
  const laneRef = useRef(1)
  const pausedRef = useRef(paused)
  const progressRef = useRef(progress)
  const onStepRef = useRef(onStep)
  const idRef = useRef(0)
  const spawnRef = useRef(0)

  useEffect(() => {
    laneRef.current = lane
  }, [lane])
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  useEffect(() => {
    progressRef.current = progress
    onStepRef.current = onStep
  }, [progress, onStep])

  const done = progress >= total

  useEffect(() => {
    if (done) return

    const interval = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return

      spawnRef.current += 1
      setStars((current) => {
        let next = current.map((star) => ({ ...star, y: star.y + 4.4 }))

        // spawn a new star / occasional petal every few ticks
        if (spawnRef.current % 8 === 0) {
          idRef.current += 1
          const isPetal = Math.random() < 0.28
          next.push({
            id: idRef.current,
            lane: Math.floor(Math.random() * 3),
            y: -8,
            kind: isPetal ? 'petal' : 'star',
            counted: false,
          })
        }

        // collection at the car line
        next = next.map((star) => {
          if (!star.counted && star.y >= 74 && star.y <= 88 && star.lane === laneRef.current) {
            if (star.kind === 'star' && progressRef.current < total) {
              playPickup(progressRef.current)
              haptic(18)
              onStepRef.current()
            } else if (star.kind === 'petal') {
              playTone('star')
              haptic(8)
              setPetals((current) => current + 1)
            }
            return { ...star, counted: true }
          }
          return star
        })

        return next.filter((star) => star.y < 108)
      })
    }, 36)

    return () => window.clearInterval(interval)
  }, [done, total])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'a') setLane((current) => Math.max(0, current - 1))
      if (event.key === 'ArrowRight' || event.key === 'd') setLane((current) => Math.min(2, current + 1))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  if (done) {
    return (
      <CompleteBanner label="The little car made its run." onClose={onClose}>
        <Leaderboard game="path" stat={petals > 0 ? `4 stars + ${petals} petals` : '4 stars'} />
      </CompleteBanner>
    )
  }

  return (
    <>
      <p className="minigame-instruction">
        Quick — the stars fall fast. Steer to catch {total} fragments before they slip past.
      </p>
      <div
        className="drive-field"
        aria-label="Driving mini-game"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const fraction = (event.clientX - rect.left) / rect.width
          setLane(fraction < 0.34 ? 0 : fraction > 0.66 ? 2 : 1)
        }}
      >
        <div className="drive-road" aria-hidden="true" />
        {[34, 66].map((x) => (
          <span key={x} className="drive-lane-line" style={{ left: `${x}%` }} aria-hidden="true" />
        ))}
        {stars.map((star) => (
          <span
            key={star.id}
            className={`drive-item drive-${star.kind}${star.counted ? ' collected' : ''}`}
            style={{ left: `${LANE_X[star.lane]}%`, top: `${star.y}%` }}
            aria-hidden="true"
          >
            {star.kind === 'star' ? '✦' : '❁'}
          </span>
        ))}
        <span className="drive-car" style={{ left: `${LANE_X[lane]}%` }} aria-hidden="true">
          <CarSprite />
        </span>
      </div>
      <div className="drive-controls">
        <button
          type="button"
          className="collect-button drive-steer"
          onClick={() => setLane((current) => Math.max(0, current - 1))}
        >
          ◀
        </button>
        <p className="minigame-progress">{progress}/{total} stars</p>
        <button
          type="button"
          className="collect-button drive-steer"
          onClick={() => setLane((current) => Math.min(2, current + 1))}
        >
          ▶
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Moon Bench — turning the pages of the famous unfinished book
// ---------------------------------------------------------------------------

const READING_LINES = [
  'Page 214 of 480. Still going. No rush.',
  'A cheerful, talented friend is a rare kind of bookmark.',
  'Some people are not easy to replace. Some are not replaceable at all.',
]

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const STATION_TITLES: Record<StationKind, string> = {
  archive: 'Rose Cabinet',
  lanterns: 'Lantern Grove',
  path: 'Starlit Path',
  reading: 'Moon Bench',
}

export function StationMiniGame({
  station,
  ...props
}: MiniGameProps & { station: StationKind }) {
  return (
    <div className="experience-overlay minigame-overlay">
      <div className="overlay-panel garden-panel minigame-panel">
        <p className="overlay-kicker">{STATION_TITLES[station]}</p>
        {station === 'archive' ? (
          <MatchGame {...props} />
        ) : station === 'lanterns' ? (
          <LanternGame {...props} />
        ) : station === 'path' ? (
          <DriveGame {...props} />
        ) : (
          <ReadingGameControlled {...props} />
        )}
        {props.progress < props.total ? (
          <button type="button" className="minigame-leave" onClick={props.onClose}>
            Leave for now
          </button>
        ) : null}
      </div>
    </div>
  )
}

// Reading game needs onStep wired to its turn button; kept controlled here.
function ReadingGameControlled({ progress, total, paused, onStep, onClose }: MiniGameProps) {
  const done = progress >= total
  const line = READING_LINES[Math.min(progress, READING_LINES.length - 1)]
  const fakePage = 214 + progress * 3
  const [turning, setTurning] = useState(false)

  if (done) {
    return (
      <CompleteBanner
        label="Every page turned. The book, of course, is still unfinished."
        onClose={onClose}
      />
    )
  }

  return (
    <>
      <p className="minigame-instruction">
        The moon bench and the six-month book. Turn all {total} pages, gently.
      </p>
      <div className={`reading-book${turning ? ' turning' : ''}`}>
        <p className="reading-page-num">Page {fakePage} / 480</p>
        <p className="reading-line">{line}</p>
      </div>
      <button
        type="button"
        className="collect-button minigame-action"
        disabled={paused || turning}
        onClick={() => {
          if (paused || turning) return
          setTurning(true)
          playTone('pageFlip')
          haptic(10)
          window.setTimeout(() => {
            setTurning(false)
            onStep()
          }, 420)
        }}
      >
        Turn the page
      </button>
      <p className="minigame-progress">{progress}/{total} pages</p>
    </>
  )
}
