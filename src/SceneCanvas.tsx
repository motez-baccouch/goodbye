import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Clone, Float, Line, RoundedBox, Sparkles, Stars, Text, useGLTF } from '@react-three/drei'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { haptic, playFootstep, playMelody, playTone, unlockAudio } from './audioEngine'
import { isMusicMuted, notifyFinale, setMusicDucked, setMusicMuted, startMusic } from './ambientMusic'
import { chapters, finalLetter } from './experienceData'
import { OptionalGame, SparkBurst, StationMiniGame } from './MiniGames'

type StationId =
  | 'gate'
  | 'archive'
  | 'lanterns'
  | 'path'
  | 'reading'
  | 'final'
  | 'piano'
  | 'lighthouse'
  | 'petanque'
  | 'cafe'
type SecretId = 'moon' | 'teddy' | 'padel' | 'book' | 'maze' | 'boss' | 'france' | 'cart'

const TOTAL_SECRETS = 8
type Vec3 = [number, number, number]
type DeviceProfile = {
  mobile: boolean
  appleMobile: boolean
  dpr: number
  stars: number
  sparkles: number
  enableShadows: boolean
  landscape: boolean
}

type MovementInput = { x: number; y: number }
type LookInput = { dx: number; dy: number }
type PlayerSample = { x: number; z: number; yaw: number }

type Interactable = {
  id: StationId
  distance: number
}

type MemoryReveal = {
  title: string
  detail: string
  keepsake: string
  keepsakeKind: 'jewel' | 'flower' | 'toy' | 'dandelion' | 'letter'
  kicker?: string
}

const archiveMemories = chapters.find((chapter) => chapter.id === 'archive')?.memories ?? []
const lanternMemories = chapters.find((chapter) => chapter.id === 'bitbox')?.memories ?? []
const pathMemories = chapters.find((chapter) => chapter.id === 'drive')?.memories ?? []
const readingMemories = chapters.find((chapter) => chapter.id === 'reading')?.memories ?? []

const stationPositions: Record<StationId, Vec3> = {
  gate: [0, 0, 6],
  archive: [-11, 0, -2],
  lanterns: [11, 0, -2],
  path: [-9, 0, -33],
  reading: [9, 0, -33],
  final: [0, 0, -42],
  piano: [-5, 0, -0.5],
  lighthouse: [-18, 0, -16],
  petanque: [-22.5, 0, -8],
  cafe: [22.5, 0, -6],
}

// fixed-position secrets the guiding arrow can point to once the memories are done
const guidableSecrets: Array<{ id: SecretId; pos: Vec3; label: string }> = [
  { id: 'teddy', pos: [-12.2, 0, -3.9], label: 'a hidden teddy ✦' },
  { id: 'book', pos: [9, 0, -32.45], label: 'the unfinished book ✦' },
  { id: 'cart', pos: [6.8, 0, 3.2], label: 'the flower cart ✦' },
  { id: 'maze', pos: [0, 0, -18], label: 'the heart of the maze ✦' },
  { id: 'boss', pos: [0, 0, -46], label: 'a certain statue ✦' },
  { id: 'moon', pos: [9, 15.5, -58], label: 'the moon ✦' },
]

type WallBox = { x: number; z: number; w: number; d: number }
type BenchSeat = { x: number; z: number; yaw: number; label: string }

const benchSeats: BenchSeat[] = [
  // tea corner benches, facing each other across the table
  { x: -1.7, z: -2, yaw: Math.PI / 2, label: 'the tea table' },
  { x: 1.7, z: -2, yaw: -Math.PI / 2, label: 'the tea table' },
  // reading nook bench, facing back over the garden
  { x: 9, z: -32.4, yaw: Math.PI, label: 'the moon bench' },
  // garden bench with the best view of the white-rose arch and the moon
  { x: 3.4, z: -38.8, yaw: -0.7, label: 'the arch bench' },
  // north bench looking over the tea garden
  { x: -6.5, z: 3.6, yaw: 0.5, label: 'the garden bench' },
]

function getNearbySeat(player: PlayerSample): BenchSeat | null {
  let nearest: BenchSeat | null = null
  let nearestDistance = 1.9

  benchSeats.forEach((seatOption) => {
    const distance = Math.hypot(player.x - seatOption.x, player.z - seatOption.z)

    if (distance < nearestDistance) {
      nearest = seatOption
      nearestDistance = distance
    }
  })

  return nearest
}

// Versailles-style hedge labyrinth: three nested rings.
// Solution: enter north -> east outer corridor -> east gap -> around the heart
// -> south gap -> exit pocket -> out south. The west corridor is a long dead
// end, and the heart (west gap) hides a reward.
const mazeWalls: WallBox[] = [
  // outer ring
  { x: -6.6, z: -10, w: 10.8, d: 0.7 },
  { x: 6.6, z: -10, w: 10.8, d: 0.7 },
  { x: -6.6, z: -26, w: 10.8, d: 0.7 },
  { x: 6.6, z: -26, w: 10.8, d: 0.7 },
  { x: -12, z: -18, w: 0.7, d: 16.7 },
  { x: 12, z: -18, w: 0.7, d: 16.7 },
  // middle ring
  { x: 0, z: -13, w: 16.7, d: 0.7 },
  { x: -4.6, z: -23, w: 6.8, d: 0.7 },
  { x: 4.6, z: -23, w: 6.8, d: 0.7 },
  { x: -8, z: -19.3, w: 0.7, d: 13.3 },
  { x: 8, z: -14.8, w: 0.7, d: 4.3 },
  { x: 8, z: -22.45, w: 0.7, d: 6.9 },
  // heart ring
  { x: 0, z: -15.7, w: 8.7, d: 0.7 },
  { x: 0, z: -20.3, w: 8.7, d: 0.7 },
  { x: 4, z: -18, w: 0.7, d: 5.3 },
  { x: -4, z: -16.2, w: 0.7, d: 1.7 },
  { x: -4, z: -19.8, w: 0.7, d: 1.7 },
]

// hedge rows either side of the moon gate so the garden has a clear front wall
// (wide enough to seal the whole enlarged front, leaving only the central gate)
const gateHedgeWalls: WallBox[] = [
  { x: -16.5, z: 6, w: 27.6, d: 1.4 },
  { x: 16.5, z: 6, w: 27.6, d: 1.4 },
]

const collisionWalls: WallBox[] = [...mazeWalls, ...gateHedgeWalls]

// stagger the final letter so each line begins once the previous is written
const letterWriteDelays = (() => {
  const delays: number[] = []
  let accumulated = 900

  finalLetter.forEach((line) => {
    delays.push(accumulated)
    accumulated += (line.length / 42) * 1000 + 320
  })

  return delays
})()

function Handwritten({
  text,
  speed = 42,
  delay = 0,
}: {
  text: string
  speed?: number
  delay?: number
}) {
  const [count, setCount] = useState(0)
  const done = count >= text.length

  useEffect(() => {
    let intervalId: number | null = null
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setCount((current) => {
          if (current >= text.length) {
            if (intervalId !== null) {
              window.clearInterval(intervalId)
              intervalId = null
            }
            return current
          }

          return current + 1
        })
      }, 1000 / speed)
    }, delay)

    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [text, speed, delay])

  return (
    <span className="handwritten">
      {text.slice(0, count)}
      {!done && count > 0 ? <span className="pen-tip" aria-hidden="true" /> : null}
    </span>
  )
}

type SecretEntry = { id: SecretId; title: string; found: string; locked: string }

// Single source of truth for the tap easter-eggs: their reveal text and the
// teasing hint shown in the Journal before they are found.
const secretCatalog: SecretEntry[] = [
  {
    id: 'moon',
    title: 'The Moon’s Message',
    found: 'You touched the moon, and it sent a comet to deliver one message: go carlos.',
    locked: 'Something bright is hanging in the sky, waiting to be touched…',
  },
  {
    id: 'teddy',
    title: 'The Garden Teddy',
    found: 'A little teddy has been guarding the garden all along. It is very proud of you.',
    locked: 'Something fluffy is hiding near the rose cabinet…',
  },
  {
    id: 'padel',
    title: 'The Padel Ball',
    found: 'Caught it! For the first time in recorded padel history, the ball did not get away.',
    locked: 'Something keeps running away near the starlit path…',
  },
  {
    id: 'book',
    title: 'The Unfinished Book',
    found: 'Page 214 of 480. Six months strong. The bookmark has applied for permanent residency.',
    locked: 'Something unfinished rests on the moon bench…',
  },
  {
    id: 'maze',
    title: 'Heart of the Labyrinth',
    found: 'The heart of the labyrinth keeps a white rose. Of course it does.',
    locked: 'Something waits at the very centre of the maze…',
  },
  {
    id: 'boss',
    title: 'ENSI… MAG',
    found: 'The office’s favourite way to summon the boss: ENSI………… MAG. Some legends need the pause.',
    locked: 'A certain statue behind the arch is begging to be teased…',
  },
  {
    id: 'cart',
    title: 'Coupe do Monde',
    found: 'A tiny trophy rattles in the flower cart: coupe do monde, pronounced exactly like that.',
    locked: 'Something rattles inside the flower cart by the gate…',
  },
  {
    id: 'france',
    title: 'À Bientôt',
    found: 'A little constellation gathered itself over France. Break a leg out there, Noura. We mean it.',
    locked: 'Something only the very ending will reveal…',
  },
]

const secretLookup: Record<SecretId, SecretEntry> = secretCatalog.reduce(
  (accumulator, entry) => {
    accumulator[entry.id] = entry
    return accumulator
  },
  {} as Record<SecretId, SecretEntry>,
)

const archiveKeepsakes = ['Rose Locket', 'Wax Seal', 'Silver Key', 'Halo Charm']
const lanternKeepsakes = ['Game Token', 'Cup Star', 'Blue Lantern']
const pathKeepsakes = ['Padel Ball', 'Toy Car', 'Travel Star', 'Lucky Ticket']
const readingKeepsakes = ['Moon Bookmark', 'White Rose', 'Dandelion Page']

function createTextureCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

// A SMOOTH, low-frequency stone surface (soft overlapping blobs, no hard edges
// or fine lines). Detailed stone textures shred into streaks at grazing angles;
// this stays clean when you look along a path. Deterministic (pseudoRandom).
function createSoftStoneTexture(base: string, stone: string, seedOffset = 0) {
  const canvas = createTextureCanvas(256, 256)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  context.fillStyle = base
  context.fillRect(0, 0, 256, 256)

  // soft, large stones fading into the base — reads as stone, no sharp detail
  for (let index = 0; index < 9; index += 1) {
    const seed = index * 3 + seedOffset
    const x = pseudoRandom(seed + 1) * 256
    const y = pseudoRandom(seed + 2) * 256
    const radius = 42 + pseudoRandom(seed + 3) * 48
    const gradient = context.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius)
    gradient.addColorStop(0, stone)
    gradient.addColorStop(0.62, stone)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.globalAlpha = 0.45 + pseudoRandom(seed + 4) * 0.32
    context.fillStyle = gradient
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 16
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.needsUpdate = true
  return texture
}

function createCobbleTexture() {
  return createSoftStoneTexture('#3a3d52', '#8388a4', 0)
}

function createFlagstoneTexture() {
  return createSoftStoneTexture('#363a4e', '#787d99', 30)
}

function createSteppingPathTexture() {
  return createSoftStoneTexture('#41465e', '#7d8299', 60)
}

function createWoodTexture(primary: string, secondary: string, accent: string) {
  const canvas = createTextureCanvas(512, 512)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, primary)
  gradient.addColorStop(0.5, secondary)
  gradient.addColorStop(1, primary)
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (let index = 0; index < 48; index += 1) {
    context.fillStyle = index % 2 === 0 ? secondary : accent
    context.globalAlpha = 0.11
    context.fillRect(0, index * 12, canvas.width, 3 + (index % 4))
  }

  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.1, 2.1)
  texture.anisotropy = 4
  return texture
}

function createPaperTexture() {
  const canvas = createTextureCanvas(512, 512)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  context.fillStyle = '#fff8ee'
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (let index = 0; index < 1200; index += 1) {
    context.fillStyle = '#d7ceb8'
    context.globalAlpha = 0.03 + Math.random() * 0.03
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1 + Math.random() * 2,
      1 + Math.random() * 2,
    )
  }

  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1.2, 1.2)
  texture.anisotropy = 4
  return texture
}

const MODEL_BASE = '/assets/models/'

const modelTints: Record<string, [number, number, number]> = {
  nature: [0.66, 0.72, 0.82],
  stone: [0.85, 0.87, 1],
  car: [0.9, 0.9, 1],
  flower: [0.92, 0.92, 1.06],
}

const tintedModels = new Set<string>()

function applyNightTint(scene: THREE.Group, url: string, tint: [number, number, number]) {
  if (tintedModels.has(url)) {
    return
  }

  tintedModels.add(url)
  const tintColor = new THREE.Color(tint[0], tint[1], tint[2])

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh

    if (mesh.isMesh) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        const standard = material as THREE.MeshStandardMaterial

        if (standard.color) {
          standard.color.multiply(tintColor)
        }

        // Kenney GLBs export metallicFactor=1, which renders black without an env map
        standard.metalness = 0
        standard.roughness = 0.9
      })
    }
  })
}

type ModelAnchor = { lift: number; cx: number; cz: number }

const modelAnchors = new Map<string, ModelAnchor>()

// Kenney kits mix base pivots, centre pivots and corner pivots; measure each
// model once so everything can be placed by the centre of its footprint with
// its feet on the ground.
function getModelAnchor(scene: THREE.Group, url: string): ModelAnchor {
  const cached = modelAnchors.get(url)

  if (cached !== undefined) {
    return cached
  }

  const box = new THREE.Box3().setFromObject(scene)
  const anchor: ModelAnchor = Number.isFinite(box.min.y)
    ? {
        lift: -box.min.y,
        cx: (box.min.x + box.max.x) / 2,
        cz: (box.min.z + box.max.z) / 2,
      }
    : { lift: 0, cx: 0, cz: 0 }
  modelAnchors.set(url, anchor)
  return anchor
}

function getBaseOffset(scene: THREE.Group, url: string) {
  return getModelAnchor(scene, url).lift
}

function Model({
  file,
  position,
  rotationY = 0,
  scale = 1,
  tint = 'nature',
}: {
  file: string
  position: Vec3
  rotationY?: number
  scale?: number
  tint?: keyof typeof modelTints
}) {
  const url = MODEL_BASE + file
  const { scene } = useGLTF(url)
  const anchor = useMemo(() => getModelAnchor(scene, url), [scene, url])

  useEffect(() => {
    applyNightTint(scene, url, modelTints[tint])
  }, [scene, url, tint])

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Clone
        object={scene}
        position={[-anchor.cx * scale, anchor.lift * scale, -anchor.cz * scale]}
        scale={scale}
      />
    </group>
  )
}

const preloadedModels = [
  'tree_pineRoundB.glb',
  'tree_pineRoundD.glb',
  'tree_pineTallA_detailed.glb',
  'tree_oak.glb',
  'tree_default.glb',
  'tree_thin.glb',
  'plant_bushDetailed.glb',
  'flower_purpleA.glb',
  'flower_yellowA.glb',
  'flower_purpleC.glb',
  'mushroom_redGroup.glb',
  'mushroom_tanGroup.glb',
  'rock_largeA.glb',
  'rock_largeB.glb',
  'rock_smallA.glb',
  'rock_smallE.glb',
  'statue_ring.glb',
  'statue_block.glb',
  'statue_obelisk.glb',
  'stump_roundDetailed.glb',
  'pot_large.glb',
  'van.glb',
  'flower_redA.glb',
  'flower_redB.glb',
  'flower_purpleB.glb',
  'flower_yellowC.glb',
  'grass_leafs.glb',
  'sakura.glb',
  'fountain.glb',
  'lamp_post.glb',
  'tableRound.glb',
  'food/cup-tea.glb',
  'food/plate.glb',
  'food/croissant.glb',
  'food/cookie.glb',
  'town/cart.glb',
  'graveyard/lantern-glass.glb',
  'graveyard/bench.glb',
  'graveyard/urn-round.glb',
  'sideTableDrawers.glb',
  'benchCushion.glb',
  'books.glb',
  'lampRoundFloor.glb',
  'bookcaseOpen.glb',
]

preloadedModels.forEach((file) => useGLTF.preload(MODEL_BASE + file))

let cachedGlowTexture: THREE.Texture | null = null

function createGlowTexture() {
  if (cachedGlowTexture) {
    return cachedGlowTexture
  }

  const canvas = createTextureCanvas(256, 256)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.55)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  cachedGlowTexture = texture
  return texture
}

function getDeviceProfile(): DeviceProfile {
  const width = window.innerWidth
  const height = window.innerHeight
  const touchPoints = navigator.maxTouchPoints || 0
  const userAgent = navigator.userAgent
  const mobile = width <= 900 || touchPoints > 0
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent)

  return {
    mobile,
    appleMobile,
    dpr: appleMobile ? 1.5 : mobile ? 1.4 : 1.8,
    stars: appleMobile ? 1400 : mobile ? 1500 : 2300,
    sparkles: appleMobile ? 70 : mobile ? 90 : 140,
    enableShadows: !mobile,
    landscape: width >= height,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function findNextIndex(items: boolean[]) {
  return items.findIndex((item) => !item)
}

function getDistanceToStation(player: PlayerSample, station: StationId) {
  const [x, , z] = stationPositions[station]
  return Math.hypot(player.x - x, player.z - z)
}

function getNearbyInteractable(player: PlayerSample, gateOpen: boolean): Interactable | null {
  const order: Array<{ id: StationId; radius: number }> = [
    { id: 'gate', radius: 3 },
    { id: 'archive', radius: 3.4 },
    { id: 'lanterns', radius: 3.4 },
    { id: 'path', radius: 3.4 },
    { id: 'reading', radius: 3.4 },
    { id: 'final', radius: 3.6 },
    { id: 'piano', radius: 3 },
    { id: 'lighthouse', radius: 4 },
    { id: 'petanque', radius: 3.4 },
    { id: 'cafe', radius: 3.4 },
  ]

  let nearest: Interactable | null = null

  order.forEach(({ id, radius }) => {
    // once the gate is open it is no longer an interaction, just an archway
    if (id === 'gate' && gateOpen) {
      return
    }

    const distance = getDistanceToStation(player, id)

    if (distance <= radius && (!nearest || distance < nearest.distance)) {
      nearest = { id, distance }
    }
  })

  return nearest
}

function createReveal(
  title: string,
  detail: string,
  keepsake: string,
  keepsakeKind: MemoryReveal['keepsakeKind'],
  kicker?: string,
): MemoryReveal {
  return { title, detail, keepsake, keepsakeKind, kicker }
}

function getAreaLabel(player: PlayerSample) {
  if (player.z > 4.5) return 'Moon Gate'

  if (player.z > -9) {
    if (player.x < -6.5) return 'Rose Cabinet'
    if (player.x > 6.5) return 'Lantern Grove'
    return 'Tea Garden'
  }

  if (player.z > -26.5 && Math.abs(player.x) < 12.5) {
    if (Math.abs(player.x) < 4 && player.z < -16 && player.z > -20) return 'Labyrinth Heart'
    return 'The Labyrinth'
  }

  if (player.z < -38) return 'White-Rose Arch'
  if (player.x < -4) return 'Starlit Path'
  if (player.x > 4) return 'Moon Bench'
  return 'South Walk'
}

function getInteractLabel(
  station: StationId,
  gateOpen: boolean,
  finalUnlocked: boolean,
  finalOpen: boolean,
  archive: boolean[],
  lanterns: boolean[],
  path: boolean[],
  reading: boolean[],
) {
  switch (station) {
    case 'gate':
      return gateOpen ? 'Gate Open' : 'Open Gate'
    case 'archive':
      return archive.every(Boolean) ? 'Cabinet Complete' : 'Open Drawer'
    case 'lanterns':
      return lanterns.every(Boolean) ? 'Lanterns Complete' : 'Light Lantern'
    case 'path':
      return path.every(Boolean) ? 'Path Complete' : 'Gather Star'
    case 'reading':
      return reading.every(Boolean) ? 'Pages Complete' : 'Turn Page'
    case 'final':
      if (!finalUnlocked) return 'Door Locked'
      return finalOpen ? 'Read Again' : 'Reveal Letter'
    case 'piano':
      return 'Play a Melody'
    case 'lighthouse':
      return 'Climb the Lighthouse'
    case 'petanque':
      return 'Play Pétanque'
    case 'cafe':
      return 'Catch Pastries'
    default:
      return 'Interact'
  }
}

// Optional on-device FPS read-out. Off by default; add ?fps=1 to the URL to
// show it while testing on a phone. Uses its own rAF so it costs nothing when
// not mounted.
function FpsMeter() {
  const [fps, setFps] = useState(0)

  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()

    const loop = (now: number) => {
      frames += 1

      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <div className="fps-meter">{fps} fps</div>
}

// Decorative flat-lay props (dip pen, ink pot, flowers) for the aged-parchment
// intro letter — drawn as inline SVG so they stay crisp and self-contained.
function IntroDecor() {
  return (
    <div className="intro-decor" aria-hidden="true">
      <svg className="intro-flower intro-flower-tl" viewBox="0 0 64 64">
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse key={angle} cx="32" cy="14" rx="8.5" ry="15" fill="#5a3ea6" transform={`rotate(${angle} 32 32)`} />
        ))}
        {[36, 108, 180, 252, 324].map((angle) => (
          <ellipse key={angle} cx="32" cy="19" rx="6" ry="11" fill="#472c8c" transform={`rotate(${angle} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="6" fill="#efe6cf" />
        <circle cx="32" cy="32" r="3" fill="#c9a94e" />
      </svg>
      <svg className="intro-flower intro-flower-br" viewBox="0 0 64 64">
        {[20, 92, 164, 236, 308].map((angle) => (
          <ellipse key={angle} cx="32" cy="15" rx="8" ry="14" fill="#5f43ad" transform={`rotate(${angle} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="5.5" fill="#efe6cf" />
        <circle cx="32" cy="32" r="2.6" fill="#c9a94e" />
      </svg>
      <svg className="intro-ink" viewBox="0 0 60 100">
        <ellipse cx="30" cy="93" rx="23" ry="5" fill="rgba(60,45,25,0.2)" />
        <rect x="11" y="36" width="38" height="57" rx="8" fill="#182233" />
        <rect x="11" y="36" width="15" height="57" rx="8" fill="#27334b" />
        <rect x="18" y="20" width="24" height="18" rx="3" fill="#212b3d" />
        <rect x="21" y="8" width="18" height="14" rx="4" fill="#2e3a52" />
        <rect x="27" y="2" width="6" height="8" rx="2" fill="#3c4863" />
      </svg>
      <svg className="intro-pen" viewBox="0 0 170 54">
        <g transform="rotate(-7 85 27)">
          <rect x="50" y="21" width="112" height="10" rx="5" fill="#e4cd82" />
          <rect x="50" y="21" width="112" height="4" rx="2" fill="#f4e2a4" />
          <path d="M20 26 L50 16 L50 36 Z" fill="#9aa0ac" />
          <path d="M8 26 L24 21 L24 31 Z" fill="#c8ccd4" />
          <rect x="5" y="25" width="5" height="2" fill="#24304a" />
        </g>
      </svg>
    </div>
  )
}

function SceneCanvas() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const showFps = useMemo(() => new URLSearchParams(window.location.search).has('fps'), [])
  const forceFireworks = useMemo(() => new URLSearchParams(window.location.search).has('fw'), [])
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>(() => getDeviceProfile())
  const [overlayMode, setOverlayMode] = useState<'intro' | 'help' | 'journal' | 'map' | null>('intro')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pianoPlaying, setPianoPlaying] = useState(false)
  const [secretEnding, setSecretEnding] = useState(false)
  const [climb, setClimb] = useState<'none' | 'up' | 'top' | 'down'>('none')
  const [scoping, setScoping] = useState(false)
  const [wishNonce, setWishNonce] = useState(0)
  const [detailMessage, setDetailMessage] = useState('')
  const [hintIndex, setHintIndex] = useState(0)
  const [hintVisible, setHintVisible] = useState(false)
  const [cameraResetNonce, setCameraResetNonce] = useState(0)
  const [gateOpen, setGateOpen] = useState(false)
  const [finalOpen, setFinalOpen] = useState(false)
  const [letterVisible, setLetterVisible] = useState(false)
  const [creditsVisible, setCreditsVisible] = useState(false)
  const [epilogue, setEpilogue] = useState(false)
  const [seat, setSeat] = useState<BenchSeat | null>(null)
  const [musicOff, setMusicOff] = useState(() => isMusicMuted())
  const [secretsFound, setSecretsFound] = useState<SecretId[]>([])
  const [padelFlees, setPadelFlees] = useState(0)
  const [padelFleeNonce, setPadelFleeNonce] = useState(0)
  const [cometNonce, setCometNonce] = useState(0)
  const [tapNonce, setTapNonce] = useState(0)
  const [memoryReveal, setMemoryReveal] = useState<MemoryReveal | null>(null)
  const [activeMiniGame, setActiveMiniGame] = useState<'archive' | 'lanterns' | 'path' | 'reading' | null>(null)
  const [optionalGame, setOptionalGame] = useState<'petanque' | 'cafe' | null>(null)
  const [archiveOpened, setArchiveOpened] = useState([false, false, false, false])
  const [lanternsLit, setLanternsLit] = useState([false, false, false])
  const [pathCollected, setPathCollected] = useState([false, false, false, false])
  const [pagesTurned, setPagesTurned] = useState([false, false, false])
  const [playerSample, setPlayerSample] = useState<PlayerSample>({ x: 0, z: 9, yaw: 0 })

  const movementRef = useRef<MovementInput>({ x: 0, y: 0 })
  const lookRef = useRef<LookInput>({ dx: 0, dy: 0 })
  const tapPointRef = useRef<{ x: number; y: number } | null>(null)
  const playerPosRef = useRef<PlayerSample>({ x: 0, z: 9, yaw: 0 })

  const padelTired = padelFlees >= 4
  const padelCaught = secretsFound.includes('padel')

  const archiveCount = archiveOpened.filter(Boolean).length
  const lanternCount = lanternsLit.filter(Boolean).length
  const pathCount = pathCollected.filter(Boolean).length
  const readingCount = pagesTurned.filter(Boolean).length
  const awakenedMemories = archiveCount + lanternCount + pathCount + readingCount
  const totalMemories = archiveOpened.length + lanternsLit.length + pathCollected.length + pagesTurned.length
  const finalUnlocked =
    archiveOpened.every(Boolean) &&
    lanternsLit.every(Boolean) &&
    pathCollected.every(Boolean) &&
    pagesTurned.every(Boolean)

  const currentArea = useMemo(() => getAreaLabel(playerSample), [playerSample])
  const interactable = useMemo(() => getNearbyInteractable(playerSample, gateOpen), [playerSample, gateOpen])
  const nearbySeat = useMemo(() => getNearbySeat(playerSample), [playerSample])

  // where the guiding arrow should point: the gate first, then the nearest
  // unfinished landmark, then the white-rose arch once everything is awake
  const guideTarget = useMemo(() => {
    if (!gateOpen) {
      return { pos: stationPositions.gate, label: 'the Moon Gate' }
    }

    const remaining: Array<{ id: StationId; label: string }> = []
    if (!archiveOpened.every(Boolean)) remaining.push({ id: 'archive', label: 'Rose Cabinet' })
    if (!lanternsLit.every(Boolean)) remaining.push({ id: 'lanterns', label: 'Lantern Grove' })
    if (!pathCollected.every(Boolean)) remaining.push({ id: 'path', label: 'Starlit Path' })
    if (!pagesTurned.every(Boolean)) remaining.push({ id: 'reading', label: 'Moon Bench' })

    if (remaining.length === 0) {
      // everything is awake: guide to the nearest undiscovered secret, then the arch
      const unfound = guidableSecrets.filter((entry) => !secretsFound.includes(entry.id))

      if (unfound.length > 0) {
        let bestSecret = unfound[0]
        let bestSecretDistance = Math.hypot(bestSecret.pos[0] - playerSample.x, bestSecret.pos[2] - playerSample.z)
        unfound.forEach((entry) => {
          const distance = Math.hypot(entry.pos[0] - playerSample.x, entry.pos[2] - playerSample.z)
          if (distance < bestSecretDistance) {
            bestSecret = entry
            bestSecretDistance = distance
          }
        })
        return { pos: bestSecret.pos, label: bestSecret.label }
      }

      return { pos: stationPositions.final, label: 'the White-Rose Arch' }
    }

    let best = remaining[0]
    let bestDistance = getDistanceToStation(playerSample, best.id)
    remaining.forEach((entry) => {
      const distance = getDistanceToStation(playerSample, entry.id)
      if (distance < bestDistance) {
        best = entry
        bestDistance = distance
      }
    })

    return { pos: stationPositions[best.id], label: best.label }
  }, [gateOpen, archiveOpened, lanternsLit, pathCollected, pagesTurned, playerSample, secretsFound])

  const guideAngle = useMemo(() => {
    const dx = guideTarget.pos[0] - playerSample.x
    const dz = guideTarget.pos[2] - playerSample.z
    return Math.atan2(dx, -dz) - playerSample.yaw
  }, [guideTarget, playerSample])

  const guideDistance = useMemo(
    () => Math.hypot(guideTarget.pos[0] - playerSample.x, guideTarget.pos[2] - playerSample.z),
    [guideTarget, playerSample],
  )

  useEffect(() => {
    const syncProfile = () => setDeviceProfile(getDeviceProfile())

    syncProfile()
    window.addEventListener('resize', syncProfile)
    window.addEventListener('orientationchange', syncProfile)

    return () => {
      window.removeEventListener('resize', syncProfile)
      window.removeEventListener('orientationchange', syncProfile)
    }
  }, [])

  useEffect(() => {
    const element = sceneRef.current

    if (!element) {
      return
    }

    const preventTouchScroll = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null

      // let buttons work and let scrollable panels (letter, journal, map) scroll
      if (target?.closest('button, a, input, textarea, select, .letter-paper, .garden-panel, .collect-card')) {
        return
      }

      event.preventDefault()
    }

    element.addEventListener('touchmove', preventTouchScroll, { passive: false })

    return () => {
      element.removeEventListener('touchmove', preventTouchScroll)
    }
  }, [])

  const hintContextKey = `${currentArea}|${interactable?.id ?? ''}`
  const [lastHintContextKey, setLastHintContextKey] = useState(hintContextKey)

  if (hintContextKey !== lastHintContextKey) {
    setLastHintContextKey(hintContextKey)
    setHintIndex(0)
    setHintVisible(false)
  }

  useEffect(() => {
    if (!detailMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDetailMessage('')
    }, 3400)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [detailMessage])

  useEffect(() => {
    if (!finalOpen) {
      return
    }

    const franceId = window.setTimeout(() => {
      playTone('france')
    }, 1200)
    const timeoutId = window.setTimeout(() => {
      playTone('letter')
      setLetterVisible(true)
    }, 2200)

    return () => {
      window.clearTimeout(franceId)
      window.clearTimeout(timeoutId)
    }
  }, [finalOpen])

  useEffect(() => {
    if (!finalUnlocked || finalOpen) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDetailMessage(
        'Every memory is awake. The arrow now points to the white-rose arch — or wander first and gather the hidden secrets.',
      )
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [finalUnlocked, finalOpen])

  // the secret ending: find every hidden light, and the sky spells her name
  useEffect(() => {
    if (secretsFound.length < TOTAL_SECRETS) {
      return
    }

    const soundId = window.setTimeout(() => {
      playTone('france')
      haptic([16, 60, 16, 60, 40])
      setCometNonce((current) => current + 1)
    }, 300)
    const revealId = window.setTimeout(() => setSecretEnding(true), 1600)

    return () => {
      window.clearTimeout(soundId)
      window.clearTimeout(revealId)
    }
  }, [secretsFound.length])

  const padelFleeCountRef = useRef(0)
  const creditsShownRef = useRef(false)

  const handlePadelFlee = () => {
    padelFleeCountRef.current += 1
    const count = padelFleeCountRef.current
    setPadelFlees(count)

    if (count === 1) {
      setDetailMessage('…the padel ball just ran away from you. Some things never change.')
    } else if (count === 4) {
      setDetailMessage('The padel ball looks exhausted. Now is your chance — tap it.')
    }
  }

  const revealSecretCard = (secret: SecretId) => {
    const entry = secretLookup[secret]
    setMemoryReveal(
      createReveal(entry.title, entry.found, 'Hidden Secret', 'jewel', '✦ Secret found'),
    )
  }

  const foundSecret = (secret: SecretId, message: string) => {
    playTone('secret')
    haptic([10, 30, 10])
    setDetailMessage(message)
    setSecretsFound((current) => (current.includes(secret) ? current : [...current, secret]))
    revealSecretCard(secret)
  }

  const handleWish = () => {
    const wishes = [
      'Wish granted: an infinite supply of pain au chocolat. 🥐',
      'May your French boss be nicer than the last one. (Low bar.)',
      "That one's for you. Don't tell ENSI we made a wish without a permission slip.",
      "Bon courage — and it's 'pain au chocolat', never 'chocolatine'. Pick your battles.",
      'Sacré bleu, a wish! Spend it wisely. Or on cheese.',
      "Go be brilliant. Try not to say 'omelette du fromage' to actual French people.",
      'May the metro always be on time. (Okay — that one won’t come true.)',
    ]
    const wish = wishes[Math.floor(Math.random() * wishes.length)]
    playTone('secret')
    haptic(16)
    setDetailMessage(wish)
    setWishNonce((current) => current + 1)
  }

  const handleSecretTap = (secret: SecretId) => {
    if (secret === 'moon') {
      setCometNonce((current) => current + 1)
      foundSecret('moon', secretLookup.moon.found)
      return
    }

    if (secret === 'teddy') {
      foundSecret('teddy', secretLookup.teddy.found)
      return
    }

    if (secret === 'book') {
      foundSecret('book', secretLookup.book.found)
      return
    }

    if (secret === 'maze') {
      foundSecret('maze', secretLookup.maze.found)
      return
    }

    if (secret === 'boss') {
      // the office's favourite way to tease the boss — delivered with the
      // legendary dramatic pause: "ENSI…" then, a beat later, "MAG."
      playTone('boss')
      haptic([10, 30, 10])
      setSecretsFound((current) => (current.includes('boss') ? current : [...current, 'boss']))
      setDetailMessage('ENSI…')
      window.setTimeout(() => {
        playTone('boss')
        setDetailMessage(secretLookup.boss.found)
        revealSecretCard('boss')
      }, 1300)
      return
    }

    if (secret === 'cart') {
      foundSecret('cart', secretLookup.cart.found)
      return
    }

    if (secret === 'france') {
      playTone('france')
      haptic([10, 30, 10])
      setSecretsFound((current) => (current.includes('france') ? current : [...current, 'france']))
      setDetailMessage(secretLookup.france.found)
      revealSecretCard('france')
      return
    }

    if (secret === 'padel') {
      if (padelCaught) {
        playTone('focus')
        setDetailMessage('The padel ball has accepted its fate. Mohamed would demand a rematch.')
        return
      }

      if (padelTired) {
        foundSecret('padel', 'Caught it! For the first time in recorded padel history, the ball did not get away.')
        return
      }

      playTone('focus')
      setPadelFleeNonce((current) => current + 1)
      return
    }
  }

  const sceneTitle = gateOpen ? currentArea : 'Moon Gate'
  const hints = useMemo(() => {
    if (!gateOpen) {
      return [
        'Walk up to the wooden gate and use the Interact button to open it.',
        'Use the left thumb joystick to walk and drag anywhere on the screen to look around.',
        'This experience is built for phone landscape. Rotate the phone horizontally for the intended view.',
      ]
    }

    if (interactable?.id === 'archive') {
      return [
        'The rose cabinet is a memory-match game: find the four pairs of office legends.',
        'Use Interact to open it, then tap two drawers at a time to find a matching pair.',
      ]
    }

    if (interactable?.id === 'lanterns') {
      return [
        'The lantern grove plays a light-the-sequence game. Watch, then repeat the order.',
        'Three rounds, each a little longer. Interact to begin.',
      ]
    }

    if (interactable?.id === 'path') {
      return [
        'The little car takes a short drive. Steer left and right to gather four star fragments.',
        'Use the arrows (or arrow keys) to change lanes and catch the falling stars.',
      ]
    }

    if (interactable?.id === 'reading') {
      return [
        'The moon bench holds the unfinished book joke and the warmest lines. Turn all three pages.',
        'Interact to open the book, then turn each page gently.',
      ]
    }

    if (interactable?.id === 'final') {
      return finalUnlocked
        ? [
            'The garden is complete. Use Interact at the white-rose arch to reveal the letter.',
            'After the letter opens, walk closer to read it and use Recenter if the angle feels wrong.',
          ]
        : [
            `The arch is locked until all ${totalMemories} memories are awake. You have ${awakenedMemories} so far.`,
          ]
    }

    return [
      'The rose cabinet and lantern grove sit either side of the tea garden. The starlit path and moon bench wait beyond the labyrinth.',
      'A hedge labyrinth guards the south half of the garden. When in doubt inside it, favour the east.',
      'When you get close to a glowing landmark, the Interact button will tell you what it can do.',
      'The white-rose arch at the very back opens only after every landmark is complete.',
      `Rumor says the garden hides ${TOTAL_SECRETS} secrets: in the sky, something fluffy, something that runs, something unfinished, one at the heart of the maze, a statue that summons the boss, a trophy in the cart — and one more that only appears at the very end.`,
    ]
  }, [awakenedMemories, finalUnlocked, gateOpen, interactable?.id, totalMemories])

  const activeHint = hints[hintIndex % hints.length]
  const subtitleText = hintVisible ? activeHint : detailMessage
  const openIntroLetter = () => {
    unlockAudio()
    startMusic()
    setDetailMessage('Walk to the wooden gate ahead and open it.')
    setOverlayMode(null)
  }

  // Note: the lighthouse climb deliberately does NOT block controls — the player
  // needs the joystick (to ascend/descend) and free look active while climbing.
  const controlsBlocked =
    Boolean(overlayMode) ||
    Boolean(memoryReveal) ||
    Boolean(activeMiniGame) ||
    Boolean(optionalGame) ||
    letterVisible ||
    creditsVisible ||
    (deviceProfile.mobile && !deviceProfile.landscape)

  const miniGameProgress = (station: 'archive' | 'lanterns' | 'path' | 'reading') => {
    if (station === 'archive') return { progress: archiveCount, total: archiveOpened.length }
    if (station === 'lanterns') return { progress: lanternCount, total: lanternsLit.length }
    if (station === 'path') return { progress: pathCount, total: pathCollected.length }
    return { progress: readingCount, total: pagesTurned.length }
  }

  const journalEntries = useMemo(() => {
    const sections = [
      { memories: archiveMemories, keepsakes: archiveKeepsakes, flags: archiveOpened, place: 'Rose Cabinet' },
      { memories: lanternMemories, keepsakes: lanternKeepsakes, flags: lanternsLit, place: 'Lantern Grove' },
      { memories: pathMemories, keepsakes: pathKeepsakes, flags: pathCollected, place: 'Starlit Path' },
      { memories: readingMemories, keepsakes: readingKeepsakes, flags: pagesTurned, place: 'Moon Bench' },
    ]

    return sections.flatMap((section) =>
      section.memories.map((memory, index) => ({
        id: `${section.place}-${memory.id}`,
        title: memory.title,
        detail: memory.detail,
        keepsake: section.keepsakes[index] ?? '',
        place: section.place,
        found: Boolean(section.flags[index]),
      })),
    )
  }, [archiveOpened, lanternsLit, pathCollected, pagesTurned])

  const interactLabel = seat
    ? 'Stand Up'
    : interactable
      ? interactable.id === 'piano' && pianoPlaying
        ? 'Playing…'
        : getInteractLabel(
            interactable.id,
            gateOpen,
            finalUnlocked,
            finalOpen,
            archiveOpened,
            lanternsLit,
            pathCollected,
            pagesTurned,
          )
      : nearbySeat
        ? 'Sit Down'
        : 'Walk Closer'

  // Award the next memory for a station. Called once per mini-game sub-goal
  // (a matched pair, a lit round, a collected star, a turned page). Keeps the
  // handwritten memory card, the progress flags, and the per-step sound.
  const advanceStation = (station: 'archive' | 'lanterns' | 'path' | 'reading') => {
    if (station === 'archive') {
      const nextIndex = findNextIndex(archiveOpened)
      if (nextIndex === -1) return

      playTone(nextIndex === archiveOpened.length - 1 ? 'success' : 'drawer')
      setArchiveOpened((current) => {
        const next = [...current]
        next[nextIndex] = true
        return next
      })
      const memory = archiveMemories[nextIndex]
      setDetailMessage(memory?.detail ?? 'Another drawer opens in the cabinet.')
      setMemoryReveal(
        createReveal(
          memory?.title ?? 'Rose Cabinet Note',
          memory?.detail ?? 'Another drawer opens in the cabinet.',
          archiveKeepsakes[nextIndex] ?? 'Rose Keepsake',
          nextIndex === 1 ? 'letter' : nextIndex === 2 ? 'jewel' : 'flower',
        ),
      )
      return
    }

    if (station === 'lanterns') {
      const nextIndex = findNextIndex(lanternsLit)
      if (nextIndex === -1) return

      playTone(nextIndex === lanternsLit.length - 1 ? 'success' : 'lantern')
      setLanternsLit((current) => {
        const next = [...current]
        next[nextIndex] = true
        return next
      })
      const memory = lanternMemories[nextIndex]
      setDetailMessage(memory?.detail ?? 'Another lantern joins the glow.')
      setMemoryReveal(
        createReveal(
          memory?.title ?? 'Lantern Note',
          memory?.detail ?? 'Another lantern joins the glow.',
          lanternKeepsakes[nextIndex] ?? 'Lantern Keepsake',
          nextIndex === 0 ? 'toy' : 'jewel',
        ),
      )
      return
    }

    if (station === 'path') {
      const nextIndex = findNextIndex(pathCollected)
      if (nextIndex === -1) return

      playTone(nextIndex === pathCollected.length - 1 ? 'success' : 'road')
      setPathCollected((current) => {
        const next = [...current]
        next[nextIndex] = true
        return next
      })
      const memory = pathMemories[nextIndex]
      setDetailMessage(memory?.detail ?? 'A star settles onto the path.')
      setMemoryReveal(
        createReveal(
          memory?.title ?? 'Path Note',
          memory?.detail ?? 'A star settles onto the path.',
          pathKeepsakes[nextIndex] ?? 'Star Keepsake',
          nextIndex === 0 ? 'toy' : nextIndex === 3 ? 'letter' : 'jewel',
        ),
      )
      return
    }

    if (station === 'reading') {
      const nextIndex = findNextIndex(pagesTurned)
      if (nextIndex === -1) return

      playTone(nextIndex === pagesTurned.length - 1 ? 'success' : 'page')
      setPagesTurned((current) => {
        const next = [...current]
        next[nextIndex] = true
        return next
      })
      const memory = readingMemories[nextIndex]
      setDetailMessage(memory?.detail ?? 'A page turns under the moonlight.')
      setMemoryReveal(
        createReveal(
          memory?.title ?? 'Moon Bench Note',
          memory?.detail ?? 'A page turns under the moonlight.',
          readingKeepsakes[nextIndex] ?? 'Page Keepsake',
          nextIndex === 0 ? 'letter' : nextIndex === 1 ? 'flower' : 'dandelion',
        ),
      )
      return
    }
  }

  const handleInteract = () => {
    if (seat) {
      playTone('sit')
      setSeat(null)
      setDetailMessage('Back on your feet.')
      return
    }

    if (!interactable && nearbySeat) {
      playTone('sit')
      setSeat(nearbySeat)
      setDetailMessage(`You sit by ${nearbySeat.label}. Take in the view — the garden can wait.`)
      return
    }

    if (!interactable) {
      playTone('focus')
      setDetailMessage('Walk a little closer to a glowing landmark first.')
      return
    }

    if (interactable.id === 'gate') {
      if (gateOpen) {
        playTone('focus')
        setDetailMessage('The gate is already open. The garden is waiting for you.')
        return
      }

      playTone('door')
      setGateOpen(true)
      setDetailMessage('The moon gate opens. The garden begins.')
      return
    }

    if (interactable.id === 'archive') {
      if (archiveOpened.every(Boolean)) {
        playTone('focus')
        setDetailMessage('Every drawer is open. The rose cabinet has told all its secrets.')
        return
      }

      playTone('whoosh')
      setActiveMiniGame('archive')
      return
    }

    if (interactable.id === 'lanterns') {
      if (lanternsLit.every(Boolean)) {
        playTone('focus')
        setDetailMessage('The lantern grove is fully awake now.')
        return
      }

      playTone('whoosh')
      setActiveMiniGame('lanterns')
      return
    }

    if (interactable.id === 'path') {
      if (pathCollected.every(Boolean)) {
        playTone('focus')
        setDetailMessage('The starlit path is complete and the little car has made its run.')
        return
      }

      playTone('whoosh')
      setActiveMiniGame('path')
      return
    }

    if (interactable.id === 'reading') {
      if (pagesTurned.every(Boolean)) {
        playTone('focus')
        setDetailMessage('The moon bench has turned every page it wanted to keep.')
        return
      }

      playTone('whoosh')
      setActiveMiniGame('reading')
      return
    }

    if (interactable.id === 'final') {
      if (!finalUnlocked) {
        playTone('focus')
        setDetailMessage('The white-rose arch still wants every landmark awake before it opens.')
        return
      }

      if (finalOpen) {
        playTone('letter')
        setLetterVisible(true)
        return
      }

      playTone('final')
      haptic([16, 60, 16, 60, 30])
      notifyFinale()
      setFinalOpen(true)
      setDetailMessage('For Noura.')
      return
    }

    if (interactable.id === 'piano') {
      if (pianoPlaying) {
        playTone('focus')
        setDetailMessage('The melody is still playing. Let it breathe.')
        return
      }

      const duration = playMelody()
      haptic(12)
      setPianoPlaying(true)
      setMusicDucked(true)
      setDetailMessage('A quiet melody drifts out across the moonlit garden.')
      window.setTimeout(() => {
        setPianoPlaying(false)
        setMusicDucked(false)
      }, duration || 12000)
      return
    }

    if (interactable.id === 'petanque' || interactable.id === 'cafe') {
      playTone('arcade')
      haptic(12)
      setMenuOpen(false)
      setOptionalGame(interactable.id)
      return
    }

    if (interactable.id === 'lighthouse') {
      playTone('door')
      haptic(14)
      setMenuOpen(false)
      setClimb('up')
      setDetailMessage('Hold forward to climb the stairs — drag to look around.')
    }
  }

  return (
    <div
      ref={sceneRef}
      className="scene-shell immersive-scene garden-scene"
      role="presentation"
      onPointerDown={() => unlockAudio()}
    >
      <Canvas
        camera={{ position: [0, 1.6, 9], fov: deviceProfile.mobile ? 72 : 66, near: 0.35, far: 150 }}
        dpr={[1, deviceProfile.dpr]}
        shadows={deviceProfile.enableShadows ? 'percentage' : false}
        gl={{
          antialias: !deviceProfile.mobile,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
        }}
      >
        <color attach="background" args={[epilogue ? '#160e22' : '#060915']} />
        <fog attach="fog" args={[epilogue ? '#1d1226' : '#09101d', 16, 82]} />
        <ambientLight intensity={epilogue ? 1.65 : 1.5} color={epilogue ? '#ffe7d2' : '#ffffff'} />
        <directionalLight
          position={[7, 14, -14]}
          intensity={epilogue ? 2.9 : 2.6}
          color={epilogue ? '#ffddb5' : '#e9efff'}
          castShadow={deviceProfile.enableShadows}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[0, 9, -2]} intensity={24} distance={34} color="#c5cbff" />
        <pointLight position={[-11, 3, -2]} intensity={11} distance={15} color="#ffadd8" />
        <pointLight position={[11, 3, -2]} intensity={11} distance={15} color="#8cc8ff" />
        <pointLight position={[0, 4, -18]} intensity={12} distance={20} color="#b9c9ff" />
        <pointLight position={[0, 5, -38]} intensity={14} distance={22} color="#ffd9ec" />
        <Stars
          radius={75}
          depth={30}
          count={deviceProfile.stars}
          factor={deviceProfile.mobile ? 2.3 : 3.1}
          saturation={0}
          fade
          speed={0.45}
        />
        <Sparkles
          count={deviceProfile.sparkles}
          scale={[42, 13, 60]}
          position={[0, 5, -20]}
          size={deviceProfile.mobile ? 2.2 : 3.2}
          speed={0.22}
          color="#ffd7ef"
        />
        <FirstPersonRig
          movementRef={movementRef}
          lookRef={lookRef}
          resetNonce={cameraResetNonce}
          gateOpen={gateOpen}
          inputBlocked={controlsBlocked}
          seat={seat}
          climb={climb}
          scope={scoping}
          onClimbTop={() => {
            setClimb('top')
            playTone('lantern')
            haptic(18)
          }}
          onClimbLeaveTop={() => {
            setClimb('up')
            setScoping(false)
          }}
          onClimbBottom={() => {
            setClimb('none')
            setScoping(false)
            setDetailMessage('Back on the ground. The lighthouse keeps watch.')
          }}
          onSample={(sample) => {
            playerPosRef.current = sample
            setPlayerSample(sample)
          }}
        />
        <NightGarden deviceProfile={deviceProfile} />
        <Suspense fallback={null}>
          <MoonRig />
          <GardenTrees />
          <GardenModels />
        </Suspense>
        <SkyConstellations />
        <AuroraBorealis />
        <OuterGardens mobile={deviceProfile.mobile} />
        <Petals count={deviceProfile.mobile ? 55 : 110} />
        <MoonPond />
        <BannerPlane />
        <WishingStars burstNonce={wishNonce} />
        <NouraConstellation visible={secretEnding} />
        <Comet nonce={cometNonce} />
        <ShootingStars />
        <Fireworks active={forceFireworks || secretEnding || (finalOpen && !letterVisible && !creditsVisible && !epilogue)} />
        <FranceConstellation visible={finalOpen} />
        <group>
          {/* far-horizon Eiffel, out past the village, lit up golden at night */}
          <SafeModel
            file="eiffel.glb"
            position={[-15.5, 0, -74]}
            scale={0.2}
            rotationY={0.35}
            tint="stone"
            fallback={<EiffelTower position={[-15.5, 0, -74]} scale={1.35} />}
          />
          <pointLight position={[-15.5, 4, -74]} intensity={12} distance={24} color="#ffcf8a" />
          <pointLight position={[-15.5, 14, -74]} intensity={8} distance={20} color="#ffdca0" />
          <LampGlow position={[-15.5, 22, -74]} scale={4.5} color="#ffe9a8" opacity={0.5} />
          <mesh position={[-15.5, 24.5, -74]}>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshStandardMaterial color="#fff3c8" emissive="#ffe27a" emissiveIntensity={2.4} toneMapped={false} fog={false} />
          </mesh>
        </group>
        <SakuraTrees />
        <GardenLamps />
        <SafeModel file="fountain.glb" position={[20, 0, -12]} scale={0.55} rotationY={0.4} tint="stone" />
        <Lighthouse />
        <FarLighthouse />
        <PetanqueCourt highlighted={interactable?.id === 'petanque'} />
        <CafeCart highlighted={interactable?.id === 'cafe'} />
        <SecretHitbox secret="boss" position={[0, 1.9, -46]} radius={1.9} />
        <SecretHitbox secret="cart" position={[6.8, 0.7, 3.2]} radius={1.1} />
        <SecretMarker position={[-12.2, 1.15, -3.9]} found={secretsFound.includes('teddy')} />
        <SecretMarker position={[9, 1.55, -32.45]} found={secretsFound.includes('book')} />
        <SecretMarker position={[0, 2.7, -46]} found={secretsFound.includes('boss')} />
        <SecretMarker position={[6.8, 1.2, 3.2]} found={secretsFound.includes('cart')} />
        <SecretMarker position={[0, 4.2, -18]} found={secretsFound.includes('maze')} />
        <SecretMarker position={[9, 17, -58]} found={secretsFound.includes('moon')} />
        <WishLanterns />
        <Fireflies count={deviceProfile.mobile ? (epilogue ? 40 : 26) : epilogue ? 60 : 42} />
        <WindPetals count={deviceProfile.mobile ? (epilogue ? 34 : 22) : epilogue ? 50 : 34} />
        <Teddy />
        <PadelBall
          playerRef={playerPosRef}
          tired={padelTired}
          caught={padelCaught}
          fleeNonce={padelFleeNonce}
          onFlee={handlePadelFlee}
        />
        <TapRaycaster nonce={tapNonce} pointRef={tapPointRef} onHit={handleSecretTap} onWish={handleWish} />
        <GardenGate open={gateOpen} highlighted={interactable?.id === 'gate'} />
        <RoseCabinet progress={archiveCount} complete={archiveOpened.every(Boolean)} highlighted={interactable?.id === 'archive'} />
        <LanternGrove progress={lanternCount} complete={lanternsLit.every(Boolean)} highlighted={interactable?.id === 'lanterns'} />
        <StarlitPath progress={pathCount} complete={pathCollected.every(Boolean)} highlighted={interactable?.id === 'path'} />
        <ReadingNook progress={readingCount} complete={pagesTurned.every(Boolean)} highlighted={interactable?.id === 'reading'} />
        <FinalArch open={finalOpen} unlocked={finalUnlocked} highlighted={interactable?.id === 'final'} />
        {finalOpen && !letterVisible ? <LetterDisplay /> : null}
        {interactable ? <InteractionBeacon station={interactable.id} /> : null}
      </Canvas>

      <div className="scene-vignette" aria-hidden="true" />

      <FreeLookSurface
        disabled={controlsBlocked}
        onLook={(delta) => {
          lookRef.current.dx += delta.dx
          lookRef.current.dy += delta.dy
        }}
        onTap={(x, y) => {
          tapPointRef.current = { x, y }
          setTapNonce((current) => current + 1)
        }}
      />

      <div className="garden-hud garden-hud-top">
        <div className="hud-card garden-status-card compact-status">
          <p className="hud-kicker">{sceneTitle}</p>
          <p className="progress-value">{awakenedMemories}/{totalMemories}</p>
          <div className="hud-progress-bar" aria-hidden="true">
            <span style={{ width: `${(awakenedMemories / totalMemories) * 100}%` }} />
          </div>
          {secretsFound.length > 0 ? (
            <p className="secrets-value">✦ {secretsFound.length}/{TOTAL_SECRETS} secrets</p>
          ) : null}
        </div>
        <div className="garden-menu">
          <button
            type="button"
            className="hud-icon-button"
            aria-label="Map"
            onClick={() => {
              playTone('map')
              setOverlayMode('map')
              setMenuOpen(false)
            }}
          >
            🗺️
          </button>
          <button
            type="button"
            className={`menu-toggle${menuOpen ? ' open' : ''}`}
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => {
              playTone('focus')
              setMenuOpen((open) => !open)
            }}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="menu-dropdown">
              <button
                type="button"
                onClick={() => {
                  playTone('page')
                  setOverlayMode('journal')
                  setMenuOpen(false)
                }}
              >
                <span className="menu-icon">📖</span> Journal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (hintVisible) {
                    setHintIndex((current) => current + 1)
                  } else {
                    setHintVisible(true)
                  }
                  setMenuOpen(false)
                }}
              >
                <span className="menu-icon">❓</span> Hint
              </button>
              <button
                type="button"
                onClick={() => {
                  setCameraResetNonce((current) => current + 1)
                  setMenuOpen(false)
                }}
              >
                <span className="menu-icon">🧭</span> Recenter
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !musicOff
                  setMusicOff(next)
                  setMusicMuted(next)
                }}
              >
                <span className="menu-icon">{musicOff ? '🔇' : '🎵'}</span> Music {musicOff ? 'off' : 'on'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverlayMode('help')
                  setMenuOpen(false)
                }}
              >
                <span className="menu-icon">ℹ️</span> Help
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {menuOpen ? (
        <button
          type="button"
          className="menu-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {showFps ? <FpsMeter /> : null}

      {climb === 'up' || climb === 'down' ? (
        <div className="climb-hint">
          <p>Hold ▲ to climb the stairs · hold ▼ to come back down</p>
        </div>
      ) : null}

      {climb === 'top' ? (
        <div className="climb-hud">
          <p className="climb-message">
            {scoping
              ? "Paris, right there on the horizon. Try not to say 'omelette du fromage' to actual French people. 🥖"
              : 'The aurora over the whole moonlit garden — worth every step. Look around, then just walk back down the stairs when you’re ready.'}
          </p>
          <div className="climb-buttons">
            <button
              type="button"
              className="interact-button"
              onClick={() => {
                playTone(scoping ? 'focus' : 'secret')
                haptic(12)
                setScoping((current) => !current)
              }}
            >
              {scoping ? 'Lower telescope' : '🔭 Look toward Paris'}
            </button>
          </div>
        </div>
      ) : null}

      {!controlsBlocked && climb === 'none' && gateOpen && !finalOpen ? (
        <div className="compass-hud">
          <svg className="compass-arrow" viewBox="0 0 24 24" style={{ transform: `rotate(${guideAngle}rad)` }} aria-hidden="true">
            <path d="M12 2 L19 20 L12 15 L5 20 Z" fill="#ffe6a1" />
          </svg>
          <span className="compass-label">
            {guideDistance < 4 ? `You’re at ${guideTarget.label}` : `To ${guideTarget.label}`}
          </span>
        </div>
      ) : null}

      <div className="crosshair" aria-hidden="true" />

      <div className="garden-hud garden-hud-bottom">
        <VirtualJoystick
          disabled={controlsBlocked}
          onChange={(value) => {
            movementRef.current = value
          }}
        />
        <div className="control-stack">
          {subtitleText ? (
            <div className="subtitle-caption" key={subtitleText}>
              {subtitleText}
            </div>
          ) : null}
          <button
            type="button"
            className="interact-button"
            disabled={(!interactable && !nearbySeat && !seat) || climb !== 'none'}
            onClick={handleInteract}
          >
            {interactLabel}
          </button>
        </div>
        <div className="look-helper" aria-hidden="true" />
      </div>

      {overlayMode === 'map' ? (
        <div className="experience-overlay map-overlay">
          <button
            type="button"
            className="overlay-close"
            onClick={() => {
              playTone('map')
              setOverlayMode(null)
            }}
            aria-label="Close map"
          >
            ✕
          </button>
          <div className="map-fullscreen">
            <div className="map-fullscreen-info">
              <p className="overlay-kicker">Garden Map</p>
              <div className="map-next-banner">
                <span className="map-next-arrow" aria-hidden="true">➤</span>
                <span>
                  {gateOpen ? 'Next stop: ' : 'Start here: '}
                  <strong>{guideTarget.label}</strong>
                </span>
              </div>
              <ul className="map-guide-list">
                {[
                  { name: 'Moon Gate', where: 'The entrance — open it to begin', done: gateOpen },
                  { name: 'Rose Cabinet', where: 'West of the tea garden · memory match', done: archiveOpened.every(Boolean) },
                  { name: 'Lantern Grove', where: 'East of the tea garden · light the sequence', done: lanternsLit.every(Boolean) },
                  { name: 'Starlit Path', where: 'South-west, past the labyrinth · a little drive', done: pathCollected.every(Boolean) },
                  { name: 'Moon Bench', where: 'South-east, past the labyrinth · turn the pages', done: pagesTurned.every(Boolean) },
                  {
                    name: 'White-Rose Arch',
                    where: finalUnlocked ? 'The very back · the last letter awaits' : 'The very back · opens once all is awake',
                    done: finalOpen,
                  },
                  { name: 'The Piano', where: 'By the tea garden · sit and play a melody', done: false },
                  { name: 'The Lighthouse', where: 'Far west corridor · climb it for the view', done: false },
                  { name: 'La Pétanque', where: 'Far west lawn · a French boules game', done: false },
                  { name: 'Le Petit Café', where: 'Far east lawn · catch the pastries', done: false },
                ].map((place) => {
                  const isNext = place.name === guideTarget.label || `the ${place.name}` === guideTarget.label
                  return (
                    <li key={place.name} className={`map-guide-item${place.done ? ' done' : ''}${isNext ? ' next' : ''}`}>
                      <span className="map-guide-check" aria-hidden="true">{place.done ? '✓' : isNext ? '➤' : '○'}</span>
                      <span className="map-guide-text">
                        <strong>{place.name}</strong>
                        <span className="map-guide-where">{place.where}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="map-fullscreen-canvas">
              {/* map covers the enlarged garden: world x[-30,30] -> 10..210,
                  world z[11,-63] -> 12..308 (mx = x*3.333+110, my = (11-z)*4+12) */}
              <svg className="garden-map-full" viewBox="0 0 220 320" role="img" aria-label="Garden map">
                <rect x="4" y="4" width="212" height="312" rx="14" fill="#14241a" stroke="#3d5c46" strokeWidth="2" />
                {/* central spine + cross paths */}
                <line x1="110" y1="34" x2="110" y2="96" stroke="#8d92b4" strokeWidth="5" strokeLinecap="round" />
                <line x1="110" y1="160" x2="110" y2="224" stroke="#8d92b4" strokeWidth="5" strokeLinecap="round" />
                <line x1="73" y1="64" x2="147" y2="64" stroke="#8d92b4" strokeWidth="3.5" strokeLinecap="round" />
                <line x1="80" y1="188" x2="140" y2="188" stroke="#8d92b4" strokeWidth="3.5" strokeLinecap="round" />
                {/* front hedge with the gate gap */}
                <line x1="12" y1="34" x2="100" y2="34" stroke="#2c523a" strokeWidth="6" strokeLinecap="round" />
                <line x1="120" y1="34" x2="208" y2="34" stroke="#2c523a" strokeWidth="6" strokeLinecap="round" />
                {/* the hedge labyrinth */}
                <rect x="70" y="96" width="80" height="64" rx="5" fill="none" stroke="#3d5c46" strokeWidth="4" />
                <rect x="86" y="112" width="48" height="32" rx="4" fill="none" stroke="#3d5c46" strokeWidth="3" />
                <circle cx="110" cy="128" r="3.5" fill="#f9b9d8" />
                {/* tea plaza */}
                <circle cx="110" cy="52" r="6" fill="none" stroke="#8d92b4" strokeWidth="1.5" />
                <text x="110" y="20" textAnchor="middle" className="map-label">Moon Gate</text>

                {/* memory stations */}
                <circle cx="73" cy="64" r="6" fill={archiveOpened.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="73" y="80" textAnchor="middle" className="map-label">Cabinet</text>
                <circle cx="147" cy="64" r="6" fill={lanternsLit.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="147" y="80" textAnchor="middle" className="map-label">Lanterns</text>
                <circle cx="80" cy="188" r="6" fill={pathCollected.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="80" y="204" textAnchor="middle" className="map-label">Drive</text>
                <circle cx="140" cy="188" r="6" fill={pagesTurned.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="140" y="204" textAnchor="middle" className="map-label">Bench</text>
                <circle cx="110" cy="224" r="7" fill={finalUnlocked ? '#ffd56f' : '#8d92b4'} />
                <text x="110" y="240" textAnchor="middle" className="map-label">The Arch</text>

                {/* landmarks & optional stops */}
                <circle cx="93" cy="58" r="4" fill="#ffcf8a" />
                <text x="93" y="49" textAnchor="middle" className="map-label">Piano</text>
                <circle cx="50" cy="120" r="5" fill="#ffe27a" />
                <text x="50" y="136" textAnchor="middle" className="map-label">Lighthouse</text>
                <circle cx="35" cy="88" r="5" fill="#d8a24a" />
                <text x="35" y="104" textAnchor="middle" className="map-label">Pétanque</text>
                <circle cx="185" cy="80" r="5" fill="#e0705a" />
                <text x="185" y="96" textAnchor="middle" className="map-label">Café</text>
                <circle cx="165" cy="136" r="6" fill="#5aa0d8" />
                <text x="165" y="152" textAnchor="middle" className="map-label">Pond</text>

                <circle
                  cx={clamp(playerSample.x * 3.333 + 110, 8, 212)}
                  cy={clamp((11 - playerSample.z) * 4 + 12, 8, 312)}
                  r="6"
                  fill="#fff6de"
                  stroke="#3f2d1d"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>
        </div>
      ) : overlayMode ? (
        <div className="experience-overlay garden-overlay">
          {overlayMode !== 'intro' ? (
            <button
              type="button"
              className="overlay-close"
              onClick={() => {
                playTone('map')
                setOverlayMode(null)
              }}
              aria-label="Close"
            >
              ✕
            </button>
          ) : null}
          <div className={`overlay-panel garden-panel${overlayMode === 'intro' ? ' intro-letter-panel' : ''}`}>
            {overlayMode === 'intro' ? (
              <>
                <IntroDecor />
                <div className="intro-letter" onClick={openIntroLetter} role="button" tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openIntroLetter()
                    }
                  }}
                >
                  <p className="overlay-kicker">For Nour</p>
                  <h1>Nour's Grand Départ</h1>
                  <p className="intro-script">
                    Un jardin de souvenirs, de blagues douteuses, et d'un très gros au revoir.
                  </p>
                  <p>
                    Collect every keepsake. The last letter will arrive from the sky.
                  </p>
                  <p className="intro-secret-hint">
                    And little secrets glow all around the garden — find every one for a secret
                    ending. Tap anything that shimmers. ✦
                  </p>
                  <p className="intro-sound-hint">Best with sound on.</p>
                </div>
                <div className="overlay-actions intro-actions">
                  <button
                    type="button"
                    className="primary-letter-button"
                    onClick={openIntroLetter}
                  >
                    Start
                  </button>
                </div>
              </>
            ) : overlayMode === 'help' ? (
              <>
                <p className="overlay-kicker">Guide</p>
                <h1>Nour's Grand Départ</h1>
                <p>
                  Walk through the moonlit garden, stop by each landmark, and use Interact to open the
                  next memory note.
                </p>
                <ul className="overlay-list">
                  <li>Left thumb: walk.</li>
                  <li>Right thumb: look around.</li>
                  <li>Interact near a landmark to play its little game and collect a keepsake.</li>
                  <li>Each landmark is a tiny game: match the drawers, light the lanterns, drive for stars, turn the pages.</li>
                  <li>A hedge labyrinth guards the south half — the way through favours the east.</li>
                  <li>You can sit on the benches. The tea table seats two.</li>
                  <li>Finish every keepsake to call the final letter down from the sky.</li>
                  <li>The garden also hides little secrets. Tap anything that seems curious.</li>
                </ul>
              </>
            ) : overlayMode === 'journal' ? (
              <>
                <p className="overlay-kicker">Journal</p>
                <h1>Collected Letters</h1>
                <p className="journal-count">
                  {awakenedMemories}/{totalMemories} memories · ✦ {secretsFound.length}/{TOTAL_SECRETS} secrets
                </p>
                <div className="journal-list">
                  {journalEntries.map((entry) => (
                    <div key={entry.id} className={`journal-entry${entry.found ? '' : ' journal-locked'}`}>
                      {entry.found ? (
                        <>
                          <p className="journal-place">{entry.place} · ✦ {entry.keepsake}</p>
                          <h3>{entry.title}</h3>
                          <p className="journal-detail">{entry.detail}</p>
                        </>
                      ) : (
                        <p className="journal-locked-text">Still waiting somewhere in the {entry.place.toLowerCase()}…</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="journal-section-title">
                  Hidden Secrets · ✦ {secretsFound.length}/{TOTAL_SECRETS}
                </p>
                <div className="journal-list">
                  {secretCatalog.map((entry) => {
                    const found = secretsFound.includes(entry.id)
                    return (
                      <div key={entry.id} className={`journal-entry${found ? '' : ' journal-locked'}`}>
                        {found ? (
                          <>
                            <p className="journal-place">Secret found</p>
                            <h3>{entry.title}</h3>
                            <p className="journal-detail">{entry.found}</p>
                          </>
                        ) : (
                          <p className="journal-locked-text">{entry.locked}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeMiniGame ? (
        <StationMiniGame
          station={activeMiniGame}
          progress={miniGameProgress(activeMiniGame).progress}
          total={miniGameProgress(activeMiniGame).total}
          paused={Boolean(memoryReveal)}
          onStep={() => advanceStation(activeMiniGame)}
          onClose={() => {
            const label = activeMiniGame
            setActiveMiniGame(null)
            playTone('focus')
            if (label) {
              setDetailMessage('Back in the garden. Follow the glowing envelopes to what is left.')
            }
          }}
        />
      ) : null}

      {optionalGame ? (
        <OptionalGame
          game={optionalGame}
          onClose={() => {
            setOptionalGame(null)
            playTone('focus')
          }}
        />
      ) : null}

      {memoryReveal ? (
        <div className="collect-overlay">
          <div className="collect-card">
            <div className="collect-icon" aria-hidden="true">
              <div className={`keepsake-badge keepsake-${memoryReveal.keepsakeKind}`} />
            </div>
            <div className="collect-text">
              <p className="collect-kicker">{memoryReveal.kicker ?? 'A letter for you'} · {memoryReveal.keepsake}</p>
              <h2>{memoryReveal.title}</h2>
              <p className="collect-detail">
                <Handwritten key={memoryReveal.title} text={memoryReveal.detail} speed={48} delay={300} />
              </p>
            </div>
            <button type="button" className="collect-button" onClick={() => setMemoryReveal(null)}>
              Keep walking
            </button>
          </div>
        </div>
      ) : null}

      {letterVisible ? (
        <div className="experience-overlay final-letter-overlay">
          <div className="letter-hand-perspective">
            <SparkBurst count={34} />
            <span className="letter-thumb letter-thumb-left" aria-hidden="true" />
            <span className="letter-thumb letter-thumb-right" aria-hidden="true" />
            <div className="letter-paper">
              <p className="overlay-kicker">The last letter</p>
              <h1>For Noura</h1>
              <div className="letter-lines">
                {finalLetter.map((line, index) => (
                  <p
                    key={index}
                    className={`letter-line${index === 0 ? ' letter-opening' : ''}${
                      index === finalLetter.length - 1 ? ' letter-signature' : ''
                    }`}
                  >
                    <Handwritten text={line} delay={letterWriteDelays[index]} speed={42} />
                  </p>
                ))}
              </div>
              <button
                type="button"
                className="primary-letter-button letter-keep-button"
                style={{ animationDelay: '2.6s' }}
                onClick={() => {
                  setLetterVisible(false)

                  if (!creditsShownRef.current) {
                    creditsShownRef.current = true
                    playTone('final')
                    setCreditsVisible(true)
                  } else {
                    setDetailMessage('This garden stays open for you, always.')
                  }
                }}
              >
                Keep this garden forever
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {creditsVisible ? (
        <div className="experience-overlay credits-overlay">
          <div className="credits-inner">
            <p className="credits-line credits-the-end" style={{ animationDelay: '0.8s' }}>The End</p>
            <p className="credits-line credits-sub" style={{ animationDelay: '2.6s' }}>
              — or, for Noura, a beginning —
            </p>
            <p className="credits-line credits-script" style={{ animationDelay: '4.4s' }}>
              Good luck with your journey.
            </p>
            <p className="credits-line credits-script" style={{ animationDelay: '6.2s' }}>
              Break a leg in France.
            </p>
            <p className="credits-line credits-carlos" style={{ animationDelay: '8s' }}>go carlos ✦</p>
            <button
              type="button"
              className="credits-return"
              style={{ animationDelay: '9.6s' }}
              onClick={() => {
                setCreditsVisible(false)
                setEpilogue(true)
                setDetailMessage('A golden dawn settles over the garden. It stays open for you, always.')
              }}
            >
              Return to the garden
            </button>
          </div>
        </div>
      ) : null}

      {secretEnding ? (
        <div className="experience-overlay secret-ending-overlay">
          <div className="secret-ending-inner">
            <SparkBurst count={40} />
            <p className="secret-ending-kicker" style={{ animationDelay: '2.2s' }}>The secret ending</p>
            <p className="secret-ending-line" style={{ animationDelay: '2.6s' }}>
              You found every hidden light in the garden.
            </p>
            <p className="secret-ending-line secret-ending-cue" style={{ animationDelay: '3.2s' }}>
              Look up — the sky is spelling your name.
            </p>
            <p className="secret-ending-line" style={{ animationDelay: '4s' }}>
              Some people simply pass through a place. You lit the whole thing up — and it will keep
              glowing long after you go.
            </p>
            <p className="secret-ending-line" style={{ animationDelay: '4.8s' }}>
              Thank you for everything, Noura.
            </p>
            <p className="credits-carlos" style={{ animationDelay: '5.6s' }}>go carlos ✦</p>
            <button
              type="button"
              className="credits-return"
              style={{ animationDelay: '6.4s' }}
              onClick={() => setSecretEnding(false)}
            >
              Back to the garden
            </button>
          </div>
        </div>
      ) : null}

      {deviceProfile.mobile && !deviceProfile.landscape ? (
        <div className="experience-overlay orientation-overlay">
          <div className="overlay-panel garden-panel orientation-panel">
            <p className="overlay-kicker">Rotate</p>
            <h1>Use Landscape Mode</h1>
            <p>
              This garden is designed for phone landscape so walking and first-person look feel natural.
            </p>
            <div className="rotate-icon" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// reusable scratch vectors so the movement loop never allocates per frame
const tmpForward = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpVelocity = new THREE.Vector3()
const tmpDirection = new THREE.Vector3()
const tmpLookTarget = new THREE.Vector3()

function FirstPersonRig({
  movementRef,
  lookRef,
  resetNonce,
  gateOpen,
  inputBlocked,
  seat,
  climb,
  scope,
  onClimbTop,
  onClimbLeaveTop,
  onClimbBottom,
  onSample,
}: {
  movementRef: React.MutableRefObject<MovementInput>
  lookRef: React.MutableRefObject<LookInput>
  resetNonce: number
  gateOpen: boolean
  inputBlocked: boolean
  seat: BenchSeat | null
  climb: 'none' | 'up' | 'top' | 'down'
  scope: boolean
  onClimbTop: () => void
  onClimbLeaveTop: () => void
  onClimbBottom: () => void
  onSample: (sample: PlayerSample) => void
}) {
  const { camera, clock } = useThree()
  const positionRef = useRef(new THREE.Vector3(0, 1.55, 9))
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.03)
  const sampleTimeRef = useRef(0)
  const strideRef = useRef(0)
  const climbTRef = useRef(0)
  const climbRef = useRef<'none' | 'up' | 'top' | 'down'>('none')
  const scopeRef = useRef(false)
  const fovBaseRef = useRef(0)
  const perspRef = useRef<THREE.PerspectiveCamera | null>(null)
  const keysRef = useRef({ forward: false, back: false, left: false, right: false })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'w' || event.key === 'ArrowUp') keysRef.current.forward = true
      if (event.key === 's' || event.key === 'ArrowDown') keysRef.current.back = true
      if (event.key === 'a' || event.key === 'ArrowLeft') keysRef.current.left = true
      if (event.key === 'd' || event.key === 'ArrowRight') keysRef.current.right = true
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'w' || event.key === 'ArrowUp') keysRef.current.forward = false
      if (event.key === 's' || event.key === 'ArrowDown') keysRef.current.back = false
      if (event.key === 'a' || event.key === 'ArrowLeft') keysRef.current.left = false
      if (event.key === 'd' || event.key === 'ArrowRight') keysRef.current.right = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const targetX = 0
    const targetZ = gateOpen ? -2 : 6
    const directionX = targetX - positionRef.current.x
    const directionZ = targetZ - positionRef.current.z
    yawRef.current = Math.atan2(directionX, -directionZ)
    pitchRef.current = -0.04
  }, [gateOpen, resetNonce])

  useEffect(() => {
    if (seat) {
      yawRef.current = seat.yaw
      pitchRef.current = -0.02
    }
  }, [seat])

  useEffect(() => {
    scopeRef.current = scope
  }, [scope])

  useEffect(() => {
    // hold the perspective camera in a ref so the telescope can adjust its FOV
    // in the frame loop (mutating a ref-held object is allowed by the compiler)
    const persp = camera as THREE.PerspectiveCamera
    perspRef.current = persp
    if (fovBaseRef.current === 0) {
      fovBaseRef.current = persp.fov
    }
  }, [camera])

  useEffect(() => {
    climbRef.current = climb
    // starting a fresh rise from the ground: lift a hair off zero so the exit
    // check doesn't fire instantly, and face out over the moonlit garden
    if (climb === 'up' && climbTRef.current < 0.03) {
      climbTRef.current = 0.02
      const startAngle = 0.02 * LIGHTHOUSE_TURNS * Math.PI * 2 - Math.PI / 2
      yawRef.current = startAngle + Math.PI
      pitchRef.current = 0.0
    }
  }, [climb])

  useFrame((_, delta) => {
    // manual lighthouse climb: the player walks up the outer spiral stairs at
    // their own pace — hold forward to ascend, back to descend — with full free
    // look the whole way up, so they discover the view themselves.
    const climbNow = climbRef.current
    if (climbNow !== 'none') {
      // manual climb: hold forward to walk UP the outer stairs, back to descend.
      // The camera steers itself up the spiral (forward always = upward), then
      // eases onto the gallery walkway at the very top for the view.
      const scoping = climbNow === 'top' && scopeRef.current
      const keyY = (keysRef.current.forward ? 1 : 0) - (keysRef.current.back ? 1 : 0)
      const climbInput = scoping ? 0 : clamp(movementRef.current.y + keyY, -1, 1)

      if (climbNow === 'down') {
        climbTRef.current = THREE.MathUtils.damp(climbTRef.current, 0, 2.6, delta)
      } else {
        climbTRef.current = clamp(climbTRef.current + climbInput * delta * 0.2, 0, 1)
      }

      const t = climbTRef.current
      const angle = t * LIGHTHOUSE_TURNS * Math.PI * 2 - Math.PI / 2
      const gallery = clamp((t - 0.9) / 0.1, 0, 1)

      // look: vertical drag always tilts; horizontal free-look only once you're
      // up on the gallery (during the climb the camera follows the stairs)
      pitchRef.current = clamp(pitchRef.current - lookRef.current.dy * 0.0022, -0.6, 0.6)
      if (gallery > 0.5) {
        yawRef.current += lookRef.current.dx * 0.0032
      }
      lookRef.current.dx = 0
      lookRef.current.dy = 0

      if (gallery < 0.5) {
        // gently steer to face up the spiral so "forward" reads as climbing
        const tangentYaw = angle + Math.PI
        let dyaw = tangentYaw - yawRef.current
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
        yawRef.current += dyaw * Math.min(1, delta * 4)
      }

      const height = t * LIGHTHOUSE_TOP
      const camRadius = THREE.MathUtils.lerp(LIGHTHOUSE_STAIR_RADIUS, 1.85, gallery)
      const cx = LIGHTHOUSE_POS[0] + Math.cos(angle) * camRadius
      const cz = LIGHTHOUSE_POS[2] + Math.sin(angle) * camRadius
      const eyeY = THREE.MathUtils.lerp(1.5 + height, LIGHTHOUSE_TOP + 2.0, gallery)
      const bob = Math.sin(clock.elapsedTime * 7) * Math.abs(climbInput) * 0.03 * (1 - gallery)

      const persp = perspRef.current
      if (scoping) {
        // telescope: zoom in and aim at the Eiffel on the far horizon
        if (persp) {
          persp.fov = THREE.MathUtils.damp(persp.fov, 26, 3.5, delta)
          persp.updateProjectionMatrix()
        }
        camera.position.set(cx, eyeY, cz)
        camera.lookAt(-15.5, 12, -72)
      } else {
        if (persp && Math.abs(persp.fov - fovBaseRef.current) > 0.05) {
          persp.fov = THREE.MathUtils.damp(persp.fov, fovBaseRef.current, 4, delta)
          persp.updateProjectionMatrix()
        }
        const direction = tmpDirection.set(
          Math.sin(yawRef.current) * Math.cos(pitchRef.current),
          Math.sin(pitchRef.current),
          -Math.cos(yawRef.current) * Math.cos(pitchRef.current),
        )
        camera.position.set(cx, eyeY + bob, cz)
        camera.lookAt(tmpLookTarget.copy(camera.position).add(direction))
      }

      if (t <= 0.004 && (climbNow === 'down' || climbInput < 0)) {
        // stepped back down to the ground: hand control back on the base landing
        positionRef.current.set(LIGHTHOUSE_POS[0] + 2.9, 1.55, LIGHTHOUSE_POS[2] + 2.9)
        onClimbBottom()
        return
      }
      if (climbNow === 'up' && t >= 0.985) onClimbTop()
      else if (climbNow === 'top' && t < 0.9) onClimbLeaveTop()
      return
    }

    if (!inputBlocked) {
      yawRef.current += lookRef.current.dx * 0.0032
      pitchRef.current = clamp(pitchRef.current - lookRef.current.dy * 0.0022, -0.42, 0.32)
    }

    lookRef.current.dx = 0
    lookRef.current.dy = 0

    if (seat) {
      // sitting: glide to the seat and only allow looking around
      positionRef.current.x = THREE.MathUtils.damp(positionRef.current.x, seat.x, 5, delta)
      positionRef.current.z = THREE.MathUtils.damp(positionRef.current.z, seat.z, 5, delta)
      positionRef.current.y = THREE.MathUtils.damp(positionRef.current.y, 1.14, 5, delta)

      const seatedDirection = tmpDirection.set(
        Math.sin(yawRef.current) * Math.cos(pitchRef.current),
        Math.sin(pitchRef.current),
        -Math.cos(yawRef.current) * Math.cos(pitchRef.current),
      )
      camera.position.copy(positionRef.current)
      camera.lookAt(tmpLookTarget.copy(positionRef.current).add(seatedDirection))

      if (clock.elapsedTime - sampleTimeRef.current > 0.08) {
        sampleTimeRef.current = clock.elapsedTime
        onSample({ x: positionRef.current.x, z: positionRef.current.z, yaw: yawRef.current })
      }
      return
    }

    positionRef.current.y = THREE.MathUtils.damp(positionRef.current.y, 1.55, 5, delta)

    const keyX = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0)
    const keyY = (keysRef.current.forward ? 1 : 0) - (keysRef.current.back ? 1 : 0)
    const moveX = inputBlocked ? 0 : clamp(movementRef.current.x + keyX, -1, 1)
    const moveY = inputBlocked ? 0 : clamp(movementRef.current.y + keyY, -1, 1)
    const forward = tmpForward.set(Math.sin(yawRef.current), 0, -Math.cos(yawRef.current))
    const right = tmpRight.set(-forward.z, 0, forward.x)
    const velocity = tmpVelocity.set(0, 0, 0)

    velocity.addScaledVector(forward, moveY)
    velocity.addScaledVector(right, moveX)

    if (velocity.lengthSq() > 1) {
      velocity.normalize()
    }

    positionRef.current.addScaledVector(velocity, delta * 4.4)

    // soft grass footsteps while actually moving
    if (velocity.lengthSq() > 0.2) {
      strideRef.current += velocity.length() * delta * 4.4

      if (strideRef.current > 0.62) {
        strideRef.current = 0
        playFootstep()
      }
    }

    positionRef.current.x = clamp(positionRef.current.x, -28.8, 28.8)
    positionRef.current.z = clamp(positionRef.current.z, -61.5, 10.2)

    if (!gateOpen && positionRef.current.z < 7 && Math.abs(positionRef.current.x) < 2.6) {
      positionRef.current.z = 7
    }

    // keep the player from walking through the tea table and the back monument
    const colliders = [
      { x: 0, z: -2, radius: 1.2 },
      { x: 0, z: -46, radius: 1.35 },
      { x: -5, z: -0.5, radius: 1.1 },
      { x: LIGHTHOUSE_POS[0], z: LIGHTHOUSE_POS[2], radius: 3.3 },
      { x: POND_POS[0], z: POND_POS[2], radius: POND_RADIUS + 0.4 },
      { x: stationPositions.cafe[0], z: stationPositions.cafe[2], radius: 1.0 },
      { x: 20, z: -12, radius: 2.4 },
    ]

    colliders.forEach((collider) => {
      const dx = positionRef.current.x - collider.x
      const dz = positionRef.current.z - collider.z
      const distance = Math.hypot(dx, dz)

      if (distance < collider.radius && distance > 0.0001) {
        const push = collider.radius / distance
        positionRef.current.x = collider.x + dx * push
        positionRef.current.z = collider.z + dz * push
      }
    })

    // hedge walls (labyrinth + gate rows): axis-aligned push-out
    const playerRadius = 0.42

    collisionWalls.forEach((wall) => {
      const minX = wall.x - wall.w / 2 - playerRadius
      const maxX = wall.x + wall.w / 2 + playerRadius
      const minZ = wall.z - wall.d / 2 - playerRadius
      const maxZ = wall.z + wall.d / 2 + playerRadius
      const px = positionRef.current.x
      const pz = positionRef.current.z

      if (px > minX && px < maxX && pz > minZ && pz < maxZ) {
        const pushLeft = px - minX
        const pushRight = maxX - px
        const pushNorth = maxZ - pz
        const pushSouth = pz - minZ
        const smallest = Math.min(pushLeft, pushRight, pushNorth, pushSouth)

        if (smallest === pushLeft) positionRef.current.x = minX
        else if (smallest === pushRight) positionRef.current.x = maxX
        else if (smallest === pushSouth) positionRef.current.z = minZ
        else positionRef.current.z = maxZ
      }
    })

    const direction = tmpDirection.set(
      Math.sin(yawRef.current) * Math.cos(pitchRef.current),
      Math.sin(pitchRef.current),
      -Math.cos(yawRef.current) * Math.cos(pitchRef.current),
    )

    // a soft head-bob only while actually walking (stable when standing still)
    const speed = Math.min(1, velocity.length())
    const bob = Math.sin(clock.elapsedTime * 8.5) * speed * 0.022
    camera.position.set(positionRef.current.x, positionRef.current.y + bob, positionRef.current.z)
    camera.lookAt(tmpLookTarget.copy(positionRef.current).add(direction))

    if (clock.elapsedTime - sampleTimeRef.current > 0.08) {
      sampleTimeRef.current = clock.elapsedTime
      onSample({ x: positionRef.current.x, z: positionRef.current.z, yaw: yawRef.current })

      if (import.meta.env.DEV) {
        // dev-only probe for the automated walkthrough tests
        ;(window as Window & { __gardenPos?: PlayerSample }).__gardenPos = {
          x: positionRef.current.x,
          z: positionRef.current.z,
          yaw: yawRef.current,
        }
      }
    }
  })

  return null
}

// A deliberately SMOOTH, low-frequency lawn. A detailed grass photo shreds into
// streaks at grazing angles no matter the anisotropy; this has no fine detail to
// alias, so the ground stays clean when you look along it. Grass tufts + flowers
// on top supply the actual detail.
let cachedMeadowTexture: THREE.Texture | null = null

function createMeadowTexture() {
  if (cachedMeadowTexture) {
    return cachedMeadowTexture
  }

  const canvas = createTextureCanvas(512, 512)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  const gradient = context.createLinearGradient(0, 0, 0, 512)
  gradient.addColorStop(0, '#20402a')
  gradient.addColorStop(0.5, '#1a3524')
  gradient.addColorStop(1, '#24462e')
  context.fillStyle = gradient
  context.fillRect(0, 0, 512, 512)

  // large, soft moonlight pools
  for (let index = 0; index < 7; index += 1) {
    const x = pseudoRandom(index * 2 + 1) * 512
    const y = pseudoRandom(index * 2 + 2) * 512
    const radius = 130 + pseudoRandom(index * 3 + 5) * 150
    const pool = context.createRadialGradient(x, y, 0, x, y, radius)
    pool.addColorStop(0, 'rgba(150, 182, 214, 0.1)')
    pool.addColorStop(1, 'rgba(150, 182, 214, 0)')
    context.fillStyle = pool
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  // large, soft shadow patches for gentle depth
  for (let index = 0; index < 8; index += 1) {
    const x = pseudoRandom(index * 5 + 40) * 512
    const y = pseudoRandom(index * 5 + 41) * 512
    const radius = 110 + pseudoRandom(index * 5 + 42) * 170
    const shade = context.createRadialGradient(x, y, 0, x, y, radius)
    shade.addColorStop(0, 'rgba(8, 18, 12, 0.16)')
    shade.addColorStop(1, 'rgba(8, 18, 12, 0)')
    context.fillStyle = shade
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 4)
  texture.anisotropy = 16
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.needsUpdate = true
  cachedMeadowTexture = texture
  return texture
}

function GroundPlane() {
  // smooth procedural surfaces — never streak at grazing angles
  const grass = useMemo(() => createMeadowTexture(), [])
  const cobble = useMemo(() => {
    const texture = createCobbleTexture()
    texture.repeat.set(3, 3)
    texture.needsUpdate = true
    return texture
  }, [])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -34]} receiveShadow>
        <planeGeometry args={[74, 116]} />
        {/* base ground pushed back in depth so every decal above it wins cleanly */}
        <meshStandardMaterial
          color="#dbe3d4"
          map={grass}
          roughness={1}
          polygonOffset
          polygonOffsetFactor={1.5}
          polygonOffsetUnits={1.5}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]}>
        <circleGeometry args={[6.5, 64]} />
        <meshStandardMaterial color="#aeb2cf" map={cobble} roughness={0.92} />
      </mesh>
    </group>
  )
}

function GroundFallback() {
  const grassTexture = useMemo(() => createMeadowTexture(), [])
  const cobbleTexture = useMemo(() => createCobbleTexture(), [])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -34]} receiveShadow>
        <planeGeometry args={[74, 116]} />
        <meshStandardMaterial
          color="#dbe3d4"
          map={grassTexture}
          roughness={1}
          polygonOffset
          polygonOffsetFactor={1.5}
          polygonOffsetUnits={1.5}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]}>
        <circleGeometry args={[6.5, 64]} />
        <meshStandardMaterial color="#cdd0e2" map={cobbleTexture} roughness={0.92} />
      </mesh>
    </group>
  )
}

function Labyrinth() {
  return (
    <group>
      {mazeWalls.map((wall, index) => (
        <group key={index}>
          <mesh position={[wall.x, 1, wall.z]}>
            <boxGeometry args={[wall.w, 2, wall.d]} />
            <meshStandardMaterial color="#1f3d2a" roughness={0.96} />
          </mesh>
          <mesh position={[wall.x, 2.02, wall.z]}>
            <boxGeometry args={[wall.w + 0.14, 0.22, wall.d + 0.14]} />
            <meshStandardMaterial color="#2a4f36" roughness={0.96} />
          </mesh>
        </group>
      ))}
      {/* lamps marking the way in and out */}
      {[
        [-1.9, -9.3],
        [1.9, -9.3],
        [-1.9, -26.7],
        [1.9, -26.7],
      ].map(([x, z], index) => (
        <group key={`maze-lamp-${index}`} position={[x, 0, z]}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.05, 0.08, 1.8, 8]} />
            <meshStandardMaterial color="#3b4741" roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <sphereGeometry args={[0.14, 14, 14]} />
            <meshStandardMaterial color="#ffe9ad" emissive="#ffe9ad" emissiveIntensity={1.3} transparent opacity={0.9} />
          </mesh>
          <LampGlow position={[0, 1.85, 0]} scale={1.6} opacity={0.5} />
        </group>
      ))}
      <MazeHeart />
    </group>
  )
}

function FallingBlossoms({ count = 14 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const petalTexture = useMemo(() => createPetalTexture(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        angle: pseudoRandom(index * 3 + 60) * Math.PI * 2,
        radius: 0.4 + pseudoRandom(index * 3 + 61) * 1.5,
        speed: 0.28 + pseudoRandom(index * 3 + 62) * 0.25,
        phase: index * 2.399,
      })),
    [count],
  )

  useFrame(({ clock }) => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const time = clock.elapsedTime

    seeds.forEach((seed, index) => {
      const fall = 1 - ((time * seed.speed + seed.phase) % 1)
      const drift = seed.angle + time * 0.25
      dummy.position.set(
        Math.cos(drift) * seed.radius,
        0.3 + fall * 3,
        Math.sin(drift) * seed.radius,
      )
      dummy.rotation.set(time * 1.6 + seed.phase, seed.phase, time * 1.2)
      dummy.scale.setScalar(0.7 + pseudoRandom(index + 91) * 0.4)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[0.13, 0.16]} />
      <meshBasicMaterial
        map={petalTexture}
        color="#ffb8d9"
        side={THREE.DoubleSide}
        transparent
        alphaTest={0.35}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

function MazeHeart() {
  const blossomColors = ['#ffd9ea', '#ffe6f2', '#f9c4de', '#fff0f6', '#ffcbe2']

  return (
    <group position={[0, 0, -18]} userData={{ secret: 'maze' }}>
      <mesh visible={false} position={[0, 1.6, 0]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshBasicMaterial />
      </mesh>
      {/* cherry blossom tree, tall enough to peek over the hedges */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.14, 0.22, 2, 10]} />
        <meshStandardMaterial color="#5a4436" roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 1.9, 0.1]} rotation={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.07, 0.11, 1, 8]} />
        <meshStandardMaterial color="#5a4436" roughness={0.9} />
      </mesh>
      <mesh position={[-0.35, 2, -0.15]} rotation={[0.3, 0, 0.75]}>
        <cylinderGeometry args={[0.06, 0.1, 0.9, 8]} />
        <meshStandardMaterial color="#5a4436" roughness={0.9} />
      </mesh>
      {[
        { position: [0, 2.95, 0] as Vec3, radius: 0.6 },
        { position: [0.6, 2.75, 0.2] as Vec3, radius: 0.48 },
        { position: [-0.6, 2.8, -0.2] as Vec3, radius: 0.5 },
        { position: [0.35, 3.2, -0.3] as Vec3, radius: 0.42 },
        { position: [-0.35, 3.15, 0.35] as Vec3, radius: 0.44 },
        { position: [0.82, 3.0, -0.35] as Vec3, radius: 0.36 },
        { position: [-0.78, 3.05, 0.3] as Vec3, radius: 0.38 },
        { position: [0.15, 3.48, 0.1] as Vec3, radius: 0.4 },
        { position: [-0.2, 2.6, 0.55] as Vec3, radius: 0.4 },
        { position: [0.28, 2.62, -0.55] as Vec3, radius: 0.4 },
        { position: [0.98, 2.85, 0.15] as Vec3, radius: 0.32 },
        { position: [-0.95, 2.9, -0.1] as Vec3, radius: 0.34 },
      ].map((cluster, index) => (
        <mesh key={index} position={cluster.position} rotation={[index * 0.7, index * 1.1, 0]}>
          <icosahedronGeometry args={[cluster.radius, 0]} />
          <meshStandardMaterial
            color={blossomColors[index % blossomColors.length]}
            emissive="#ffb3d6"
            emissiveIntensity={0.13}
            roughness={0.92}
            flatShading
          />
        </mesh>
      ))}
      <FallingBlossoms />
      {/* the white rose resting at the roots */}
      <mesh position={[0.55, 0.14, 0.4]}>
        <sphereGeometry args={[0.14, 14, 14]} />
        <meshStandardMaterial color="#fdfaff" emissive="#ffd7ec" emissiveIntensity={0.6} roughness={0.4} />
      </mesh>
      <Sparkles count={12} scale={[2.6, 2.4, 2.6]} position={[0, 2.2, 0]} size={1.7} speed={0.2} color="#ffd7ef" />
      <pointLight position={[0, 2.4, 0]} intensity={5} distance={7} color="#ffbede" />
    </group>
  )
}

function NightGarden({ deviceProfile }: { deviceProfile: DeviceProfile }) {
  const flagstoneTexture = useMemo(() => createFlagstoneTexture(), [])
  const flowerPositions = useMemo(
    () =>
      Array.from({ length: 46 }, (_, index) => {
        if (index < 26) {
          // ring around the tea plaza
          const angle = index * 0.72
          const radius = 7 + (index % 5) * 0.9
          return {
            x: Math.cos(angle) * radius,
            z: -2 + Math.sin(angle) * radius * 0.7,
            scale: 0.7 + (index % 5) * 0.08,
            hue: index % 3,
          }
        }

        // southern meadow around the junction and the arch
        const angle = index * 1.13
        const radius = 5 + (index % 6) * 1.6
        return {
          x: Math.cos(angle) * radius,
          z: -35 + Math.sin(angle) * radius * 0.8,
          scale: 0.7 + (index % 5) * 0.08,
          hue: index % 3,
        }
      }),
    [],
  )

  return (
    <group>
      <Suspense fallback={<GroundFallback />}>
        <GroundPlane />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[9, 0.015, -33]}>
        <planeGeometry args={[8, 7]} />
        <meshStandardMaterial color="#c9cbdd" map={flagstoneTexture} roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9, 0.015, -33]}>
        <planeGeometry args={[8, 7]} />
        <meshStandardMaterial color="#c9cbdd" map={flagstoneTexture} roughness={0.92} />
      </mesh>
      <PathRibbon start={[0, 0.02, 4.8]} end={[0, 0.02, -2]} width={2.2} />
      <PathRibbon start={[-2.2, 0.02, -2]} end={[-9.4, 0.02, -2]} width={1.5} />
      <PathRibbon start={[2.2, 0.02, -2]} end={[9.4, 0.02, -2]} width={1.5} />
      <PathRibbon start={[0, 0.02, -2]} end={[0, 0.02, -9.8]} width={2} />
      <PathRibbon start={[0, 0.02, -26.2]} end={[0, 0.02, -30.5]} width={2} />
      <PathRibbon start={[0, 0.02, -30.5]} end={[-8.6, 0.02, -32.8]} width={1.5} />
      <PathRibbon start={[0, 0.02, -30.5]} end={[8.6, 0.02, -32.8]} width={1.5} />
      <PathRibbon start={[0, 0.02, -30.5]} end={[0, 0.02, -41.6]} width={1.8} />
      <GardenHedges />
      <Labyrinth />
      {flowerPositions.map((flower, index) => (
        <Sway key={index} seed={index * 1.3} strength={0.08} position={[flower.x, 0, flower.z]}>
          <FlowerCluster position={[0, 0, 0]} scale={flower.scale} palette={flower.hue} />
        </Sway>
      ))}
      <LanternPosts />
      <RoseBush position={[-2.6, 0, 2.4]} scale={1.1} />
      <RoseBush position={[2.6, 0, 2.4]} scale={1.1} />
      <RoseBush position={[-2, 0, -40.9]} scale={1} />
      <RoseBush position={[2, 0, -40.9]} scale={1} />
      <Sparkles
        count={deviceProfile.mobile ? 16 : 24}
        scale={[22, 4.5, 40]}
        position={[0, 1.8, -20]}
        size={4}
        speed={0.15}
        color="#fff0bd"
      />
    </group>
  )
}

function PathRibbon({ start, end, width }: { start: Vec3; end: Vec3; width: number }) {
  const midpoint: Vec3 = [
    (start[0] + end[0]) * 0.5,
    start[1],
    (start[2] + end[2]) * 0.5,
  ]
  const length = Math.hypot(end[0] - start[0], end[2] - start[2])
  const angle = Math.atan2(end[0] - start[0], end[2] - start[2])
  const texture = useMemo(() => {
    const pathTexture = createSteppingPathTexture()
    pathTexture.repeat.set(1, Math.max(1, Math.round(length / 2.4)))
    return pathTexture
  }, [length])

  return (
    <mesh position={midpoint} rotation={[-Math.PI / 2, 0, angle]} renderOrder={2}>
      <planeGeometry args={[width, length]} />
      {/* a ground decal: depthWrite off so overlapping ribbons layer without z-fighting */}
      <meshStandardMaterial
        color="#d3d6e8"
        map={texture}
        roughness={0.94}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        depthWrite={false}
      />
    </mesh>
  )
}

const moonCraters: Array<{ p: Vec3; r: number }> = [
  { p: [1.8, 1.5, 5.4], r: 0.8 },
  { p: [-2.2, -0.6, 5.35], r: 1.1 },
  { p: [0.6, -2.4, 5.25], r: 0.6 },
  { p: [2.6, -1.5, 4.95], r: 0.7 },
  { p: [-1.1, 2.6, 5.05], r: 0.5 },
  { p: [-0.2, 0.3, 5.9], r: 0.9 },
]

function MoonRig() {
  const glowTexture = useMemo(() => createGlowTexture(), [])

  return (
    <group position={[9, 16, -58]} userData={{ secret: 'moon' }}>
      {/* stylised, flat-shaded low-poly moon to match the rest of the garden */}
      <mesh>
        <icosahedronGeometry args={[6, 3]} />
        <meshStandardMaterial color="#f2ead2" emissive="#fff2d2" emissiveIntensity={0.7} roughness={1} flatShading fog={false} />
      </mesh>
      {/* simple crater discs on the visible face */}
      {moonCraters.map((crater, index) => (
        <mesh key={index} position={crater.p}>
          <circleGeometry args={[crater.r, 18]} />
          <meshStandardMaterial color="#dccfb2" emissive="#e6dabb" emissiveIntensity={0.35} roughness={1} fog={false} />
        </mesh>
      ))}
      {/* layered corona: tight warm core → gold bloom → wide cool atmosphere */}
      <sprite scale={[14, 14, 1]}>
        <spriteMaterial map={glowTexture} color="#fff6d8" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </sprite>
      <sprite scale={[24, 24, 1]}>
        <spriteMaterial map={glowTexture} color="#ffe9b0" transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </sprite>
      <sprite scale={[46, 46, 1]}>
        <spriteMaterial map={glowTexture} color="#bcccff" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </sprite>
      {/* a faint dusting of stars right around the moon */}
      <Sparkles count={16} scale={[16, 16, 4]} size={2.4} speed={0.1} color="#fff4d6" />
    </group>
  )
}

// Occasional, gentle shooting stars drifting across the upper sky — pure
// ambience, one at a time, mostly invisible. A little "make a wish" magic.
function ShootingStars() {
  const groupRef = useRef<THREE.Group>(null)
  const glowTexture = useMemo(() => createGlowTexture(), [])
  const stateRef = useRef({ active: false, t: 0, timer: 4, x0: 0, y0: 16, z: -50, dx: 14, dy: -5 })

  useFrame((_, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const state = stateRef.current

    if (!state.active) {
      state.timer -= delta

      if (state.timer <= 0) {
        state.active = true
        state.t = 0
        state.y0 = 15 + Math.random() * 10
        state.x0 = -32 + Math.random() * 64
        state.z = -46 - Math.random() * 18
        const leftward = Math.random() < 0.5
        state.dx = (leftward ? -1 : 1) * (12 + Math.random() * 9)
        state.dy = -(3.5 + Math.random() * 4)
      } else {
        group.visible = false
        return
      }
    }

    state.t += delta / 0.9

    if (state.t >= 1) {
      state.active = false
      state.timer = 7 + Math.random() * 13
      group.visible = false
      return
    }

    const p = state.t
    group.visible = true
    group.position.set(state.x0 + state.dx * p, state.y0 + state.dy * p, state.z)
    group.rotation.z = Math.atan2(state.dy, state.dx)
    group.scale.setScalar(Math.max(0.01, Math.sin(p * Math.PI)))
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshBasicMaterial color="#fff6d8" fog={false} />
      </mesh>
      <sprite scale={[2.2, 2.2, 1]}>
        <spriteMaterial map={glowTexture} color="#fff3cd" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </sprite>
      {[1, 2, 3, 4, 5, 6].map((step) => (
        <mesh key={step} position={[-step * 0.5, 0, 0]}>
          <sphereGeometry args={[Math.max(0.02, 0.11 - step * 0.015), 6, 6]} />
          <meshBasicMaterial color="#ffeebb" transparent opacity={Math.max(0, 0.5 - step * 0.075)} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

// A single paper wish-lantern that drifts slowly up into the night and loops.
function WishLantern({ x, z, seed, speed }: { x: number; z: number; seed: number; speed: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const glowTexture = useMemo(() => createGlowTexture(), [])

  useFrame(({ clock }) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const cycle = (clock.elapsedTime * speed + seed) % 1
    group.position.set(
      x + Math.sin(clock.elapsedTime * 0.3 + seed * 6) * 0.9,
      0.6 + cycle * 21,
      z + Math.cos(clock.elapsedTime * 0.25 + seed * 4) * 0.6,
    )
    // fade in low, fade out high via scale so the loop is seamless
    group.scale.setScalar(Math.max(0.05, Math.sin(cycle * Math.PI) * 1.1))
    group.rotation.y = clock.elapsedTime * 0.4 + seed
  })

  return (
    <group ref={groupRef} position={[x, 0.6, z]}>
      <mesh>
        <boxGeometry args={[0.26, 0.36, 0.26]} />
        <meshStandardMaterial color="#ffcf8a" emissive="#ffb45a" emissiveIntensity={1.7} toneMapped={false} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.14, 0.05, 0.14]} />
        <meshStandardMaterial color="#5a4436" roughness={0.8} />
      </mesh>
      <sprite scale={[1.5, 1.5, 1]}>
        <spriteMaterial map={glowTexture} color="#ffcf8a" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </sprite>
    </group>
  )
}

function WishLanterns() {
  const lanterns = useMemo(
    () => [
      { x: -10, z: -6, seed: 0.05, speed: 0.03 },
      { x: 8, z: -12, seed: 0.32, speed: 0.026 },
      { x: -4, z: -20, seed: 0.58, speed: 0.034 },
      { x: 11, z: -30, seed: 0.14, speed: 0.028 },
      { x: -12, z: -34, seed: 0.77, speed: 0.031 },
      { x: 3, z: -4, seed: 0.9, speed: 0.024 },
    ],
    [],
  )

  return (
    <group>
      {lanterns.map((lantern, index) => (
        <WishLantern key={index} x={lantern.x} z={lantern.z} seed={lantern.seed} speed={lantern.speed} />
      ))}
    </group>
  )
}

function Comet({ nonce }: { nonce: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const progressRef = useRef({ active: false, t: 0 })
  const glowTexture = useMemo(() => createGlowTexture(), [])

  useEffect(() => {
    if (nonce > 0) {
      progressRef.current = { active: true, t: 0 }
    }
  }, [nonce])

  useFrame((_, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const progress = progressRef.current

    if (!progress.active) {
      group.visible = false
      return
    }

    progress.t += delta / 4.4

    if (progress.t >= 1) {
      progress.active = false
      group.visible = false
      return
    }

    const t = progress.t
    group.visible = true
    group.position.set(-34 + t * 64, 18 - t * 5 + Math.sin(t * Math.PI) * 1.8, -42)
    group.rotation.z = -0.1
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshBasicMaterial color="#fff6d8" fog={false} />
      </mesh>
      <sprite scale={[3.4, 3.4, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#ffe9a8"
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      {[1, 2, 3, 4].map((step) => (
        <mesh key={step} position={[-step * 0.85, step * 0.15, 0]}>
          <sphereGeometry args={[0.3 - step * 0.055, 10, 10]} />
          <meshBasicMaterial color="#ffe9a8" transparent opacity={0.55 - step * 0.11} fog={false} />
        </mesh>
      ))}
      <Text position={[0.4, -1.3, 0]} fontSize={0.95} anchorX="center" anchorY="middle">
        <meshBasicMaterial color="#ffedb3" fog={false} transparent />
        go carlos
      </Text>
    </group>
  )
}

// A tappable, otherwise-invisible hitbox for the easter-egg secrets.
function SecretHitbox({ secret, position, radius = 1 }: { secret: SecretId; position: Vec3; radius?: number }) {
  return (
    <group position={position} userData={{ secret }}>
      <mesh visible={false}>
        <sphereGeometry args={[radius, 8, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}

// A bright, bobbing beacon-gem that clearly says "tap here" — it vanishes once
// the secret has been discovered.
function SecretMarker({ position, found }: { position: Vec3; found: boolean }) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const gemRef = useRef<THREE.Mesh>(null)
  const glowTexture = useMemo(() => createGlowTexture(), [])

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    const sprite = spriteRef.current

    if (sprite) {
      const material = sprite.material as THREE.SpriteMaterial
      material.opacity = found ? 0 : 0.5 + Math.sin(time * 2.6) * 0.28
      const scale = 1.8 + Math.sin(time * 2.6) * 0.4
      sprite.scale.set(scale, scale, 1)
    }

    if (gemRef.current) {
      gemRef.current.position.y = Math.sin(time * 1.8) * 0.12
      gemRef.current.rotation.y = time * 1.6
    }
  })

  return (
    <group position={position} visible={!found}>
      <sprite ref={spriteRef}>
        <spriteMaterial
          map={glowTexture}
          color="#ffe4a0"
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      <mesh ref={gemRef}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color="#fff3c8" emissive="#ffe27a" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {!found ? <Sparkles count={8} scale={[0.8, 1.1, 0.8]} size={2} speed={0.45} color="#fff0bd" /> : null}
    </group>
  )
}

// The Eiffel-tower constellation that gathers itself over the garden at the
// finale — the "break a leg in France" send-off. Tap it for a hidden note.
const EIFFEL_OUTLINE: Vec3[] = [
  [-1.1, 0, 0],
  [-0.62, 1.2, 0],
  [-0.42, 2.2, 0],
  [-0.22, 3.4, 0],
  [-0.09, 4.4, 0],
  [0, 5, 0],
  [0.09, 4.4, 0],
  [0.22, 3.4, 0],
  [0.42, 2.2, 0],
  [0.62, 1.2, 0],
  [1.1, 0, 0],
]
const EIFFEL_BARS: Vec3[][] = [
  [[-1.1, 0, 0], [1.1, 0, 0]],
  [[-0.62, 1.2, 0], [0.62, 1.2, 0]],
  [[-0.42, 2.2, 0], [0.42, 2.2, 0]],
]
const EIFFEL_STARS: Vec3[] = [
  [0, 5, 0],
  [-0.62, 1.2, 0],
  [0.62, 1.2, 0],
  [-1.1, 0, 0],
  [1.1, 0, 0],
  [-0.42, 2.2, 0],
  [0.42, 2.2, 0],
  [0, 1.2, 0],
]

// Faint, glowing constellations scattered high in the night sky for ambience.
const CONSTELLATION_STAR: Vec3[] = [
  [0, 2, 0],
  [-1.18, -1.62, 0],
  [1.9, 0.62, 0],
  [-1.9, 0.62, 0],
  [1.18, -1.62, 0],
  [0, 2, 0],
]
const CONSTELLATION_EIFFEL: Vec3[] = [
  [-1, 0, 0],
  [-0.5, 1.3, 0],
  [-0.22, 2.5, 0],
  [0, 3.4, 0],
  [0.22, 2.5, 0],
  [0.5, 1.3, 0],
  [1, 0, 0],
  [-0.5, 1.3, 0],
  [0.5, 1.3, 0],
  [-0.28, 2.3, 0],
  [0.28, 2.3, 0],
]
const CONSTELLATION_W: Vec3[] = [
  [-2, 0.5, 0],
  [-1, -0.4, 0],
  [0, 0.4, 0],
  [1, -0.5, 0],
  [2, 0.3, 0],
]

function SkyConstellation({
  points,
  position,
  scale = 1,
  color = '#cfe0ff',
}: {
  points: Vec3[]
  position: Vec3
  scale?: number
  color?: string
}) {
  const glowTexture = useMemo(() => createGlowTexture(), [])

  return (
    <group position={position} scale={scale}>
      <Line points={points} color={color} lineWidth={1} transparent opacity={0.32} />
      {points.slice(0, -1).map((point, index) => (
        <group key={index} position={point}>
          <mesh>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#fff6d8" fog={false} />
          </mesh>
          <sprite scale={[0.85, 0.85, 1]}>
            <spriteMaterial map={glowTexture} color={color} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
          </sprite>
        </group>
      ))}
    </group>
  )
}

// a cheeky little smiley in the stars, hanging over the lantern grove
const SMILEY_SMILE: Vec3[] = [[-1, -0.1, 0], [-0.6, -0.7, 0], [0, -0.95, 0], [0.6, -0.7, 0], [1, -0.1, 0]]
const SMILEY_EYES: Vec3[] = [[-0.5, 0.6, 0], [0.5, 0.6, 0]]

function SmileyConstellation({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  const glowTexture = useMemo(() => createGlowTexture(), [])
  const stars = useMemo(() => [...SMILEY_SMILE, ...SMILEY_EYES], [])

  return (
    <group position={position} scale={scale}>
      <Line points={SMILEY_SMILE} color="#ffe6a1" lineWidth={1.4} transparent opacity={0.34} />
      {stars.map((point, index) => (
        <group key={index} position={point}>
          <mesh>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshBasicMaterial color="#fff6d8" fog={false} />
          </mesh>
          <sprite scale={[0.8, 0.8, 1]}>
            <spriteMaterial map={glowTexture} color="#ffe6a1" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
          </sprite>
        </group>
      ))}
    </group>
  )
}

function SkyConstellations() {
  return (
    <group>
      {/* scattered far across the night sky, well beyond the aurora */}
      <SkyConstellation points={CONSTELLATION_STAR} position={[-48, 34, -104]} scale={2.4} color="#ffe6a1" />
      <SkyConstellation points={CONSTELLATION_EIFFEL} position={[42, 40, -114]} scale={2.9} color="#cfe0ff" />
      <SkyConstellation points={CONSTELLATION_W} position={[-10, 50, -110]} scale={2.6} color="#bcccff" />
      <SkyConstellation points={CONSTELLATION_STAR} position={[56, 28, -100]} scale={1.7} color="#e7d9ff" />
      <SkyConstellation points={CONSTELLATION_W} position={[-60, 44, -118]} scale={2} color="#ffd9c0" />
      {/* a cheeky smiley hung high and far over the east sky */}
      <SmileyConstellation position={[26, 46, -100]} scale={2.4} />
    </group>
  )
}

// Letters drawn as star-strokes for the secret ending: the sky spells N O U R A.
const LETTER_N: Vec3[] = [[0, 0, 0], [0, 2, 0], [0.9, 0, 0], [0.9, 2, 0]]
const LETTER_O: Vec3[] = [
  [0.1, 0.5, 0], [0, 1.2, 0], [0.15, 1.8, 0], [0.5, 2, 0], [0.85, 1.8, 0], [1, 1.2, 0], [0.9, 0.5, 0], [0.5, 0, 0], [0.1, 0.5, 0],
]
const LETTER_U: Vec3[] = [[0, 2, 0], [0, 0.5, 0], [0.25, 0.05, 0], [0.65, 0.05, 0], [0.9, 0.5, 0], [0.9, 2, 0]]
const LETTER_R: Vec3[] = [[0, 0, 0], [0, 2, 0], [0.7, 2, 0], [0.95, 1.55, 0], [0.7, 1.05, 0], [0, 1.05, 0], [0.55, 1.05, 0], [0.95, 0, 0]]
const LETTER_A: Vec3[] = [[0, 0, 0], [0.45, 2, 0], [0.9, 0, 0], [0.68, 0.9, 0], [0.22, 0.9, 0]]
const NOURA_LETTERS = [LETTER_N, LETTER_O, LETTER_U, LETTER_R, LETTER_A]

function NouraConstellation({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const glowTexture = useMemo(() => createGlowTexture(), [])

  useFrame((_, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const scale = THREE.MathUtils.damp(group.scale.x, visible ? 2 : 0.0001, 2, delta)
    group.scale.setScalar(scale)
    group.visible = scale > 0.02
  })

  return (
    <group ref={groupRef} position={[-6.5, 20, -60]} scale={0.0001} visible={false}>
      {NOURA_LETTERS.map((points, index) => (
        <group key={index} position={[index * 1.6, 0, 0]}>
          <Line points={points} color="#ffe9a8" lineWidth={1.8} transparent opacity={0.9} />
          {points.map((point, pointIndex) => (
            <group key={pointIndex} position={point}>
              <mesh>
                <sphereGeometry args={[0.07, 8, 8]} />
                <meshBasicMaterial color="#fff6d8" fog={false} />
              </mesh>
              <sprite scale={[0.6, 0.6, 1]}>
                <spriteMaterial map={glowTexture} color="#ffe9a8" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
              </sprite>
            </group>
          ))}
        </group>
      ))}
      <Sparkles count={30} scale={[9, 3.5, 2]} position={[3.5, 1, 0]} size={2.6} speed={0.18} color="#fff0bd" />
    </group>
  )
}

// Aurora borealis: flowing curtains of light across the northern sky. Each
// curtain is a big plane with a hand-written shader — value-noise ray streaks
// that drift and shimmer, green at the base rising to teal and violet tips.
// Raw ShaderMaterial, so scene fog never touches it: it stays visible from the
// ground and, especially, from the top of the lighthouse.
const AURORA_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const AURORA_FRAG = `
  precision mediump float;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.06 + uSeed;
    // the whole sheet drifts slowly sideways
    float drift = fbm(vec2(uv.x * 3.0 + t, uSeed)) * 0.35;
    float x = uv.x + drift * 0.15;
    // vertical ray streaks that flicker over time
    float rays = fbm(vec2(x * 22.0, t * 1.5 + uSeed * 3.0));
    rays = pow(rays, 1.6);
    rays *= smoothstep(0.02, 0.28, rays);
    // bright near the base, fading up; soft edges left/right
    float vert = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.35, 1.0, uv.y));
    float edge = smoothstep(0.0, 0.08, uv.x) * (1.0 - smoothstep(0.92, 1.0, uv.x));
    float shimmer = 0.7 + 0.3 * sin(uv.x * 10.0 + uTime * 1.2 + uSeed);
    float intensity = vert * rays * edge * shimmer;
    // green low -> teal mid -> violet tips
    vec3 col = mix(vec3(0.15, 0.95, 0.45), vec3(0.15, 0.7, 0.85), smoothstep(0.0, 0.5, uv.y));
    col = mix(col, vec3(0.55, 0.25, 0.9), smoothstep(0.45, 1.0, uv.y));
    gl_FragColor = vec4(col * intensity * 1.4, clamp(intensity, 0.0, 1.0) * 0.55);
  }
`

function AuroraCurtain({
  position,
  rotation,
  seed,
  width,
}: {
  position: Vec3
  rotation: Vec3
  seed: number
  width: number
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSeed: { value: seed } }),
    [seed],
  )

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <mesh position={position} rotation={rotation} frustumCulled={false}>
      <planeGeometry args={[width, 46, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={AURORA_VERT}
        fragmentShader={AURORA_FRAG}
      />
    </mesh>
  )
}

function AuroraBorealis() {
  return (
    <group>
      <AuroraCurtain position={[-8, 26, -72]} rotation={[0.1, 0.14, 0.03]} seed={0.4} width={120} />
      <AuroraCurtain position={[16, 30, -82]} rotation={[0.14, -0.2, -0.05]} seed={2.3} width={140} />
    </group>
  )
}

// Drifting blossom petals across the whole garden — instanced quads that fall,
// sway, tumble, and recycle to the top. One draw call; cheap enough for iPhone.
function Petals({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const petalsRef = useRef<
    Array<{
      x: number
      y: number
      z: number
      vy: number
      sway: number
      phase: number
      rot: number
      rotSpeed: number
      scale: number
    }>
  >([])

  useEffect(() => {
    const arr = []
    for (let i = 0; i < count; i += 1) {
      arr.push({
        x: (Math.random() - 0.5) * 46,
        y: Math.random() * 18,
        z: -6 - Math.random() * 46,
        vy: 0.35 + Math.random() * 0.5,
        sway: 0.4 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 1.6,
        scale: 0.09 + Math.random() * 0.13,
      })
    }
    petalsRef.current = arr
  }, [count])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }
    const t = state.clock.elapsedTime
    const arr = petalsRef.current
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]
      p.y -= p.vy * delta
      p.rot += p.rotSpeed * delta
      if (p.y < 0.06) {
        p.y += 18 // recycle to the top, no per-frame randomness
      }
      const sx = p.x + Math.sin(t * 0.8 + p.phase) * p.sway
      const sz = p.z + Math.cos(t * 0.6 + p.phase) * p.sway * 0.5
      dummy.position.set(sx, p.y, sz)
      dummy.rotation.set(p.rot * 0.6, p.rot, p.rot * 0.3)
      dummy.scale.setScalar(p.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffd3e4" transparent opacity={0.82} side={THREE.DoubleSide} depthWrite={false} />
    </instancedMesh>
  )
}

// A still reflecting pond on the open east flank — a hand-written water shader:
// deep teal base, a wobbling moon streak, ripple rings and a faint aurora-green
// shimmer. Sits flat on the ground with a low stone rim.
const POND_POS: Vec3 = [16.5, 0.03, -20]
const POND_RADIUS = 3.8

const POND_VERT = `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const POND_FRAG = `
  precision mediump float;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    vec3 col = mix(vec3(0.05, 0.12, 0.16), vec3(0.02, 0.05, 0.09), r);
    // wobbling vertical moon reflection
    float streak = p.x + sin(vWorld.z * 1.5 + uTime * 0.8) * 0.04 + sin(vWorld.x * 3.0 + uTime) * 0.02;
    float moon = exp(-pow(streak * 6.0, 2.0)) * smoothstep(1.0, 0.0, r);
    float ripple = 0.5 + 0.5 * sin(r * 26.0 - uTime * 2.0);
    moon *= 0.6 + 0.4 * ripple;
    col += vec3(0.92, 0.94, 0.82) * moon * 0.9;
    // faint aurora-green shimmer
    float aur = (0.5 + 0.5 * sin(vWorld.x * 0.5 + uTime * 0.6)) * smoothstep(0.85, 0.0, r) * 0.16;
    col += vec3(0.1, 0.5, 0.35) * aur;
    float edge = smoothstep(1.0, 0.86, r);
    gl_FragColor = vec4(col, edge * 0.94);
  }
`

function MoonPond() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <group position={POND_POS}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[POND_RADIUS, 48]} />
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          uniforms={uniforms}
          vertexShader={POND_VERT}
          fragmentShader={POND_FRAG}
        />
      </mesh>
      {/* low stone rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[POND_RADIUS, POND_RADIUS + 0.5, 48]} />
        <meshStandardMaterial color="#3a4150" roughness={0.9} />
      </mesh>
    </group>
  )
}

// A slow wishing star that drifts across the northern sky. Tap it (its generous
// invisible hitbox) to make a wish; it bursts, rests, then returns.
function WishingStars({ burstNonce }: { burstNonce: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const tRef = useRef(0.12)
  const stateRef = useRef<'run' | 'wait'>('run')
  const waitRef = useRef(0)

  useEffect(() => {
    if (burstNonce === 0) {
      return
    }
    stateRef.current = 'wait'
    waitRef.current = 7
  }, [burstNonce])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) {
      return
    }
    if (stateRef.current === 'wait') {
      g.visible = false
      waitRef.current -= delta
      if (waitRef.current <= 0) {
        stateRef.current = 'run'
        tRef.current = 0
      }
      return
    }
    g.visible = true
    tRef.current += delta * 0.05
    const t = tRef.current
    if (t >= 1) {
      stateRef.current = 'wait'
      waitRef.current = 9
      return
    }
    g.position.set(THREE.MathUtils.lerp(-26, 26, t), 19 + Math.sin(t * Math.PI) * 7, -48)
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh userData={{ wish: true }}>
        <sphereGeometry args={[3.2, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshBasicMaterial color="#fff3c8" />
      </mesh>
      <LampGlow position={[0, 0, 0]} scale={3} color="#ffe9a8" opacity={0.5} />
    </group>
  )
}

// A little low-poly plane that periodically tows a "BON VOYAGE NOUR" banner
// across the far sky. Silhouetted against the aurora.
function BannerPlane() {
  const groupRef = useRef<THREE.Group>(null)
  const tRef = useRef(0)
  const bannerTex = useMemo(() => {
    const canvas = createTextureCanvas(1024, 256)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'rgba(20, 16, 30, 0.85)'
      ctx.fillRect(0, 0, 1024, 256)
      ctx.strokeStyle = '#ffd98a'
      ctx.lineWidth = 8
      ctx.strokeRect(10, 10, 1004, 236)
      ctx.fillStyle = '#ffe9a8'
      ctx.font = 'bold 116px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('BON VOYAGE NOUR ✦', 512, 138)
    }
    return new THREE.CanvasTexture(canvas)
  }, [])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) {
      return
    }
    tRef.current += delta
    const phase = (tRef.current % 40) / 12 // ~12s crossing, then hidden until the cycle repeats
    if (phase > 1) {
      g.visible = false
      return
    }
    g.visible = true
    g.position.set(THREE.MathUtils.lerp(-46, 46, phase), 24 + Math.sin(phase * Math.PI) * 2.5, -50)
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <boxGeometry args={[2.2, 0.5, 0.5]} />
        <meshStandardMaterial color="#ece6d4" emissive="#332b1a" emissiveIntensity={0.35} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.6, 0.1, 3.4]} />
        <meshStandardMaterial color="#d9d2bd" />
      </mesh>
      <mesh position={[-1.0, 0.35, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.1]} />
        <meshStandardMaterial color="#d9d2bd" />
      </mesh>
      <mesh position={[-2.0, 0, 0]}>
        <boxGeometry args={[1.6, 0.03, 0.03]} />
        <meshBasicMaterial color="#ffe9a8" />
      </mesh>
      <mesh position={[-4.3, 0, 0]}>
        <planeGeometry args={[5.4, 1.35]} />
        <meshBasicMaterial map={bannerTex} transparent side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={3} distance={9} color="#ffe9c0" />
    </group>
  )
}

// The wider world beyond the garden: a Provence-style ring of cypress trees, a
// lavender field on the far west lawn, and a tiny French village silhouetted on
// the northern horizon with warm-lit windows. All procedural, all cheap.
const CYPRESS_SPOTS: Array<[number, number]> = [
  [-29.6, 2], [-29.6, -12], [-29.6, -28], [-29.6, -44], [-29.6, -58],
  [29.6, 2], [29.6, -12], [29.6, -28], [29.6, -44], [29.6, -58],
  [-20, -66], [-8, -67], [8, -67], [20, -66],
  [-27, 9.6], [27, 9.6],
]

function Cypress({ position, tall }: { position: [number, number]; tall: number }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.18, 0.26, 0.8, 6]} />
        <meshStandardMaterial color="#3b2a1c" roughness={1} />
      </mesh>
      <mesh position={[0, tall * 0.45 + 0.7, 0]}>
        <coneGeometry args={[0.95, tall, 7]} />
        <meshStandardMaterial color="#20402a" roughness={1} />
      </mesh>
      <mesh position={[0, tall * 0.78 + 0.7, 0]}>
        <coneGeometry args={[0.6, tall * 0.5, 7]} />
        <meshStandardMaterial color="#274a31" roughness={1} />
      </mesh>
    </group>
  )
}

function Cottage({ x, z, color, rotation }: { x: number; z: number; color: string; rotation: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[2.6, 2, 2.1]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 2.55, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2.05, 1.5, 4]} />
        <meshStandardMaterial color="#6b3b2e" roughness={1} />
      </mesh>
      <mesh position={[0, 0.95, 1.06]}>
        <planeGeometry args={[0.5, 0.6]} />
        <meshStandardMaterial color="#ffd98a" emissive="#ffcf6e" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      <mesh position={[0.8, 0.95, 1.06]}>
        <planeGeometry args={[0.4, 0.5]} />
        <meshStandardMaterial color="#ffd98a" emissive="#ffcf6e" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Village() {
  return (
    <group>
      <Cottage x={-11} z={-66} color="#b7a98f" rotation={0.2} />
      <Cottage x={-4.5} z={-67.5} color="#c8b89a" rotation={-0.15} />
      <Cottage x={4} z={-66.5} color="#b09a80" rotation={0.1} />
      <Cottage x={11.5} z={-67.5} color="#c2b394" rotation={-0.22} />
      {/* a little village church with a steeple */}
      <group position={[18, 0, -66]} rotation={[0, -0.2, 0]}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[2.2, 2.4, 2.6]} />
          <meshStandardMaterial color="#c9bda2" roughness={1} />
        </mesh>
        <mesh position={[0, 3.1, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.8, 1.3, 4]} />
          <meshStandardMaterial color="#5b3a30" roughness={1} />
        </mesh>
        <mesh position={[0, 3.4, 1.0]}>
          <boxGeometry args={[0.7, 1.6, 0.7]} />
          <meshStandardMaterial color="#c9bda2" roughness={1} />
        </mesh>
        <mesh position={[0, 4.6, 1.0]}>
          <coneGeometry args={[0.6, 1.3, 4]} />
          <meshStandardMaterial color="#5b3a30" roughness={1} />
        </mesh>
        <mesh position={[0, 1.1, 1.31]}>
          <planeGeometry args={[0.5, 0.9]} />
          <meshStandardMaterial color="#ffd98a" emissive="#ffcf6e" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[2, 3, -66]} intensity={9} distance={40} color="#ffcf8a" />
    </group>
  )
}

function LavenderField({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(-25 + Math.random() * 12, 0.55, -44 - Math.random() * 14)
      dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2)
      dummy.scale.setScalar(0.7 + Math.random() * 0.6)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count, dummy])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <coneGeometry args={[0.14, 1.1, 5]} />
      <meshStandardMaterial color="#8a6fc4" emissive="#3d2f66" emissiveIntensity={0.3} roughness={1} />
    </instancedMesh>
  )
}

function OuterGardens({ mobile }: { mobile: boolean }) {
  return (
    <group>
      {CYPRESS_SPOTS.map((spot, index) => (
        <Cypress key={index} position={spot} tall={5.4 + (index % 4) * 0.7} />
      ))}
      <Village />
      <LavenderField count={mobile ? 40 : 70} />
    </group>
  )
}

// A pétanque piste on the west lawn — a sandy court with a wooden border, a
// small cluster of steel boules and the little wooden cochonnet.
function PetanqueCourt({ highlighted }: { highlighted: boolean }) {
  const [x, , z] = stationPositions.petanque
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[5, 7]} />
        <meshStandardMaterial color="#b9a37a" roughness={1} />
      </mesh>
      {[3.5, -3.5].map((bz) => (
        <mesh key={`edge-${bz}`} position={[0, 0.1, bz]}>
          <boxGeometry args={[5.2, 0.2, 0.2]} />
          <meshStandardMaterial color="#5a3f28" roughness={0.9} />
        </mesh>
      ))}
      {[2.5, -2.5].map((bx) => (
        <mesh key={`side-${bx}`} position={[bx, 0.1, 0]}>
          <boxGeometry args={[0.2, 0.2, 7.2]} />
          <meshStandardMaterial color="#5a3f28" roughness={0.9} />
        </mesh>
      ))}
      {[[0.4, 1.2], [-0.6, 1.8], [0.9, 2.2]].map(([bx, bz], index) => (
        <mesh key={`boule-${index}`} position={[bx, 0.16, bz]}>
          <sphereGeometry args={[0.16, 14, 14]} />
          <meshStandardMaterial color="#9aa0aa" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0.2, 0.11, 2.5]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshStandardMaterial color="#d8a24a" roughness={0.7} />
      </mesh>
      <StationTitle position={[0, 3.4, 0]} title="La Pétanque" subtitle="Tu tires ou tu pointes ?" highlighted={highlighted} />
    </group>
  )
}

// A bistro corner on the east lawn — a parasol table with a few pastries.
function CafeCart({ highlighted }: { highlighted: boolean }) {
  const [x, , z] = stationPositions.cafe
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.78, 8]} />
        <meshStandardMaterial color="#3a4150" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.08, 20]} />
        <meshStandardMaterial color="#c9bda2" roughness={0.8} />
      </mesh>
      {[[0.25, 0.2], [-0.2, 0.25], [0.1, -0.28]].map(([px, pz], index) => (
        <mesh key={`pastry-${index}`} position={[px, 0.87, pz]}>
          <torusGeometry args={[0.08, 0.04, 8, 14]} />
          <meshStandardMaterial color="#d9a24a" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.9, 8]} />
        <meshStandardMaterial color="#5a3f28" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <coneGeometry args={[1.7, 0.7, 14]} />
        <meshStandardMaterial color="#c0392b" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.62, 0]}>
        <coneGeometry args={[1.72, 0.2, 14]} />
        <meshStandardMaterial color="#eceae2" roughness={0.8} />
      </mesh>
      <pointLight position={[0, 1.5, 0]} intensity={5} distance={8} color="#ffcf8a" />
      <StationTitle position={[0, 3.1, 0]} title="Le Petit Café" subtitle="Catch the pastries" highlighted={highlighted} />
    </group>
  )
}

// The giant lighthouse: a spiral staircase winds up a tall tower to a lantern
// room with a slowly-sweeping beam. The player climbs it themselves — hold
// forward to walk up the outer stairs, back to come down, free look throughout.
const LIGHTHOUSE_POS: Vec3 = [-18, 0, -16]
// the climbable lighthouse is procedural: its camera walks the exact stairs, so
// the climb makes sense and never floats. (The imported lighthouse.glb has no
// walkable stairs, so it lives on the far horizon as scenery — see FarLighthouse.)
const LIGHTHOUSE_TOP = 16.5
const LIGHTHOUSE_TURNS = 2.0
const LIGHTHOUSE_STAIR_RADIUS = 3.05
const FAR_LIGHTHOUSE_POS: Vec3 = [26, 0, -70]
const FAR_LIGHTHOUSE_SCALE = 0.55

function Lighthouse() {
  const beamRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (beamRef.current) {
      beamRef.current.rotation.y += delta * 0.5
    }
  })

  const stepCount = 96

  return (
    <group position={LIGHTHOUSE_POS}>
      {/* wide stone base the staircase lands on */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[3.5, 3.9, 0.9, 26]} />
        <meshStandardMaterial color="#4a4e64" roughness={0.85} />
      </mesh>
      {/* slim, solid tapered tower — double-sided so a wall is never see-through */}
      <mesh position={[0, LIGHTHOUSE_TOP / 2 + 0.6, 0]}>
        <cylinderGeometry args={[1.35, 2.1, LIGHTHOUSE_TOP, 26]} />
        <meshStandardMaterial color="#eae6f0" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* two soft accent bands */}
      {[0.36, 0.68].map((f, index) => (
        <mesh key={index} position={[0, 0.6 + f * LIGHTHOUSE_TOP, 0]}>
          <cylinderGeometry args={[2.1 - f * 0.75 + 0.03, 2.1 - f * 0.75 + 0.03, 1.1, 26]} />
          <meshStandardMaterial color="#c58a86" roughness={0.7} />
        </mesh>
      ))}
      {/* clean external spiral staircase: overlapping radial treads that form a
          continuous ramp, an outer parapet wall and a handrail cap. Local axes
          after the y-rotation: +x is radial (outward), +z is tangential. */}
      {Array.from({ length: stepCount }).map((_, index) => {
        const t = index / stepCount
        const angle = t * LIGHTHOUSE_TURNS * Math.PI * 2 - Math.PI / 2
        const height = t * LIGHTHOUSE_TOP + 0.5
        const cx = Math.cos(angle) * LIGHTHOUSE_STAIR_RADIUS
        const cz = Math.sin(angle) * LIGHTHOUSE_STAIR_RADIUS
        return (
          <group key={index} position={[cx, height, cz]} rotation={[0, -angle, 0]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.5, 0.12, 0.62]} />
              <meshStandardMaterial color="#b8adc6" roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.16, 0]}>
              <boxGeometry args={[1.5, 0.3, 0.5]} />
              <meshStandardMaterial color="#8f85a3" roughness={0.85} />
            </mesh>
            <mesh position={[0.72, 0.42, 0]}>
              <boxGeometry args={[0.1, 0.72, 0.66]} />
              <meshStandardMaterial color="#9a90ae" roughness={0.75} />
            </mesh>
            <mesh position={[0.72, 0.82, 0]}>
              <boxGeometry args={[0.22, 0.1, 0.66]} />
              <meshStandardMaterial color="#6f6684" roughness={0.7} />
            </mesh>
          </group>
        )
      })}
      {/* gallery platform + railing */}
      <mesh position={[0, LIGHTHOUSE_TOP + 0.7, 0]}>
        <cylinderGeometry args={[2.3, 2.3, 0.3, 22]} />
        <meshStandardMaterial color="#4a4e64" roughness={0.8} />
      </mesh>
      <mesh position={[0, LIGHTHOUSE_TOP + 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.2, 0.06, 8, 26]} />
        <meshStandardMaterial color="#3a3e52" roughness={0.7} />
      </mesh>
      {/* lantern room */}
      <mesh position={[0, LIGHTHOUSE_TOP + 1.9, 0]}>
        <cylinderGeometry args={[1.35, 1.5, 1.7, 16]} />
        <meshStandardMaterial color="#2a2e3e" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, LIGHTHOUSE_TOP + 1.9, 0]}>
        <sphereGeometry args={[0.85, 18, 18]} />
        <meshStandardMaterial color="#fff3c8" emissive="#ffe27a" emissiveIntensity={2.6} toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, LIGHTHOUSE_TOP + 3, 0]}>
        <coneGeometry args={[1.55, 1, 16]} />
        <meshStandardMaterial color="#3a3e52" roughness={0.7} />
      </mesh>
      <group ref={beamRef} position={[0, LIGHTHOUSE_TOP + 1.9, 0]}>
        <mesh position={[4.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[1.6, 9, 18, 1, true]} />
          <meshBasicMaterial color="#fff3cd" transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
        </mesh>
      </group>
      <LampGlow position={[0, LIGHTHOUSE_TOP + 1.9, 0]} scale={6} color="#ffe9a8" opacity={0.4} />
      <pointLight position={[0, LIGHTHOUSE_TOP + 1.9, 0]} intensity={18} distance={34} color="#ffe9c0" />
    </group>
  )
}

// The imported lighthouse.glb, placed far on the horizon (behind the hedges, out
// of reach) as a grand coastal landmark with a glowing beacon.
function FarLighthouse() {
  return (
    <group position={FAR_LIGHTHOUSE_POS}>
      <SafeModel file="lighthouse_hero.glb" position={[0, 0, 0]} scale={FAR_LIGHTHOUSE_SCALE} rotationY={-0.4} tint="stone" />
      <mesh position={[0, 21, 0]}>
        <sphereGeometry args={[0.9, 14, 14]} />
        <meshStandardMaterial color="#fff3c8" emissive="#ffe27a" emissiveIntensity={2.6} toneMapped={false} fog={false} />
      </mesh>
      <LampGlow position={[0, 21, 0]} scale={7} color="#ffe9a8" opacity={0.45} />
      <pointLight position={[0, 21, 0]} intensity={16} distance={40} color="#ffe9c0" />
    </group>
  )
}

// warm golden-iron material for the Eiffel tower (fresh instance per mesh)
function EiffelIron() {
  return <meshStandardMaterial color="#7a6446" roughness={0.65} emissive="#3a2c18" emissiveIntensity={0.35} flatShading />
}

// A clean low-poly Eiffel tower: four curved splayed legs, the iconic base
// arches, three platforms and a smooth tapering square-lattice shaft (faceted
// frustums, no noisy braces). Golden night glow. Far horizon, "break a leg."
function EiffelTower({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  const corners: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]
  const faces: Array<{ pos: [number, number]; rot: number }> = [
    { pos: [0, 0.9], rot: 0 },
    { pos: [0, -0.9], rot: Math.PI },
    { pos: [0.9, 0], rot: Math.PI / 2 },
    { pos: [-0.9, 0], rot: -Math.PI / 2 },
  ]

  return (
    <group position={position} scale={scale}>
      {/* four curved splayed legs (lower + upper segment) */}
      {corners.map(([sx, sz], index) => (
        <group key={index}>
          <mesh position={[sx * 0.92, 0.95, sz * 0.92]} rotation={[sz * 0.24, 0, -sx * 0.24]}>
            <cylinderGeometry args={[0.16, 0.28, 2.3, 4]} />
            <EiffelIron />
          </mesh>
          <mesh position={[sx * 0.58, 2.95, sz * 0.58]} rotation={[sz * 0.1, 0, -sx * 0.1]}>
            <cylinderGeometry args={[0.12, 0.17, 2.0, 4]} />
            <EiffelIron />
          </mesh>
        </group>
      ))}
      {/* iconic base arch on each of the four faces */}
      {faces.map((face, index) => (
        <mesh key={`arch-${index}`} position={[face.pos[0], 1.55, face.pos[1]]} rotation={[0, face.rot, 0]}>
          <torusGeometry args={[0.82, 0.08, 8, 20, Math.PI]} />
          <EiffelIron />
        </mesh>
      ))}
      {/* first platform */}
      <mesh position={[0, 3.95, 0]}>
        <boxGeometry args={[1.85, 0.22, 1.85]} />
        <EiffelIron />
      </mesh>
      {/* lower shaft — clean tapering faceted square frustum */}
      <mesh position={[0, 5.75, 0]}>
        <cylinderGeometry args={[0.5, 0.82, 3.5, 4]} />
        <EiffelIron />
      </mesh>
      {/* second platform */}
      <mesh position={[0, 7.6, 0]}>
        <boxGeometry args={[1.02, 0.18, 1.02]} />
        <EiffelIron />
      </mesh>
      {/* upper shaft */}
      <mesh position={[0, 9.5, 0]}>
        <cylinderGeometry args={[0.16, 0.44, 3.7, 4]} />
        <EiffelIron />
      </mesh>
      {/* top platform */}
      <mesh position={[0, 11.35, 0]}>
        <boxGeometry args={[0.42, 0.13, 0.42]} />
        <EiffelIron />
      </mesh>
      {/* spire */}
      <mesh position={[0, 12.25, 0]}>
        <cylinderGeometry args={[0.03, 0.12, 1.7, 6]} />
        <EiffelIron />
      </mesh>
      {/* beacon at the very top */}
      <mesh position={[0, 13.25, 0]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color="#fff3c8" emissive="#ffe27a" emissiveIntensity={2.2} toneMapped={false} fog={false} />
      </mesh>
      <LampGlow position={[0, 13.25, 0]} scale={2.8} color="#ffe9a8" opacity={0.6} />
    </group>
  )
}

function FranceConstellation({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const glowTexture = useMemo(() => createGlowTexture(), [])

  useFrame((_, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const target = visible ? 1 : 0.0001
    const scale = THREE.MathUtils.damp(group.scale.x, target, 2.4, delta)
    group.scale.setScalar(scale)
    group.visible = scale > 0.02
  })

  return (
    <group ref={groupRef} position={[-12, 12.5, -55]} scale={0.0001} userData={{ secret: 'france' }}>
      <group scale={1.5}>
        <Line points={EIFFEL_OUTLINE} color="#ffe9a8" lineWidth={1.6} transparent opacity={0.85} />
        {EIFFEL_BARS.map((bar, index) => (
          <Line key={index} points={bar} color="#ffe9a8" lineWidth={1.2} transparent opacity={0.7} />
        ))}
        {EIFFEL_STARS.map((position, index) => (
          <group key={index} position={position}>
            <mesh>
              <sphereGeometry args={[0.11, 10, 10]} />
              <meshBasicMaterial color="#fff6d8" fog={false} />
            </mesh>
            <sprite scale={[1.1, 1.1, 1]}>
              <spriteMaterial
                map={glowTexture}
                color="#ffe9a8"
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                fog={false}
              />
            </sprite>
          </group>
        ))}
        <Sparkles count={18} scale={[3.2, 6, 2]} position={[0, 2.6, 0]} size={2.4} speed={0.16} color="#fff0bd" />
        <Text position={[0, -0.9, 0]} fontSize={0.62} anchorX="center" anchorY="middle">
          <meshBasicMaterial color="#ffedb3" fog={false} transparent />
          à bientôt
        </Text>
      </group>
    </group>
  )
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

// slow gust cycle shared by everything that leans with the wind
function windStrength(time: number, seed = 0) {
  return (
    Math.sin(time * 0.5 + seed) * 0.55 +
    Math.sin(time * 0.23 + seed * 1.7 + 1.3) * 0.35 +
    Math.sin(time * 1.9 + seed * 0.6) * 0.1
  )
}

function Sway({
  children,
  seed,
  strength = 0.06,
  position,
}: {
  children: React.ReactNode
  seed: number
  strength?: number
  position?: Vec3
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const group = groupRef.current

    if (group) {
      const lean = windStrength(clock.elapsedTime, seed)
      group.rotation.z = lean * strength
      group.rotation.x = lean * strength * 0.35
    }
  })

  // The outer group carries the world position; the inner (rotated) group sits
  // at the local origin so the sway pivots at the plant's own base — otherwise
  // far-away objects swing in huge arcs and dip below the ground.
  return (
    <group position={position}>
      <group ref={groupRef}>{children}</group>
    </group>
  )
}

let cachedPetalTexture: THREE.Texture | null = null

function createPetalTexture() {
  if (cachedPetalTexture) {
    return cachedPetalTexture
  }

  const canvas = createTextureCanvas(128, 128)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  context.clearRect(0, 0, 128, 128)

  // a soft rose petal: teardrop with a blush gradient
  const gradient = context.createRadialGradient(64, 76, 6, 64, 70, 58)
  gradient.addColorStop(0, 'rgba(255, 244, 250, 1)')
  gradient.addColorStop(0.6, 'rgba(255, 224, 240, 0.95)')
  gradient.addColorStop(1, 'rgba(248, 194, 224, 0.9)')
  context.fillStyle = gradient
  context.beginPath()
  context.moveTo(64, 8)
  context.bezierCurveTo(100, 30, 108, 76, 64, 118)
  context.bezierCurveTo(20, 76, 28, 30, 64, 8)
  context.closePath()
  context.fill()

  // centre crease
  context.strokeStyle = 'rgba(236, 170, 205, 0.5)'
  context.lineWidth = 2.4
  context.beginPath()
  context.moveTo(64, 18)
  context.quadraticCurveTo(60, 66, 64, 110)
  context.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  cachedPetalTexture = texture
  return texture
}

function WindPetals({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const petalTexture = useMemo(() => createPetalTexture(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        x: -20 + pseudoRandom(index * 5 + 40) * 40,
        z: -47 + pseudoRandom(index * 5 + 41) * 56,
        y: 0.5 + pseudoRandom(index * 5 + 42) * 2.4,
        drift: 0.6 + pseudoRandom(index * 5 + 43) * 0.9,
        flutter: 1.4 + pseudoRandom(index * 5 + 44) * 1.8,
        phase: index * 2.399,
      })),
    [count],
  )

  useFrame(({ clock }) => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const time = clock.elapsedTime
    const gust = 1 + windStrength(time) * 0.8

    seeds.forEach((seed, index) => {
      // petals ride the wind eastwards and wrap around the garden
      const travel = (seed.x + 20 + time * seed.drift * gust) % 40
      dummy.position.set(
        -20 + travel,
        seed.y + Math.sin(time * seed.flutter * 0.4 + seed.phase) * 0.5,
        seed.z + Math.sin(time * 0.35 + seed.phase) * 1.8,
      )
      dummy.rotation.set(
        Math.sin(time * seed.flutter + seed.phase) * 1.1,
        seed.phase + time * 0.3,
        Math.sin(time * seed.flutter * 0.8 + seed.phase * 2) * 0.9,
      )
      dummy.scale.setScalar(0.8 + pseudoRandom(index + 77) * 0.5)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[0.16, 0.2]} />
      <meshBasicMaterial
        map={petalTexture}
        side={THREE.DoubleSide}
        transparent
        alphaTest={0.35}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

function Fireflies({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null)
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        cx: -18 + pseudoRandom(index * 4 + 1) * 36,
        cz: -46 + pseudoRandom(index * 4 + 2) * 54,
        baseY: 0.5 + pseudoRandom(index * 4 + 3) * 1.6,
        radius: 0.6 + pseudoRandom(index * 4 + 4) * 1.8,
        speed: 0.2 + pseudoRandom(index * 7 + 5) * 0.4,
        phase: index * 2.399,
      })),
    [count],
  )
  const positions = useMemo(() => new Float32Array(count * 3), [count])

  useFrame(({ clock }) => {
    const time = clock.elapsedTime

    seeds.forEach((seed, index) => {
      positions[index * 3] = seed.cx + Math.cos(time * seed.speed + seed.phase) * seed.radius
      positions[index * 3 + 1] = seed.baseY + Math.sin(time * seed.speed * 1.7 + seed.phase) * 0.35
      positions[index * 3 + 2] = seed.cz + Math.sin(time * seed.speed + seed.phase * 1.3) * seed.radius
    })

    const geometry = pointsRef.current?.geometry

    if (geometry) {
      geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.16}
        color="#ffe6a1"
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

// ---- fireworks over the arch at the finale ----
const FW_COUNT = 260
const fwDummy = new THREE.Object3D()
const fwColor = new THREE.Color()
const FW_PALETTE: Array<[number, number, number]> = [
  [1, 0.85, 0.4],
  [1, 0.5, 0.72],
  [0.62, 0.82, 1],
  [0.8, 1, 0.72],
  [1, 0.72, 0.34],
  [0.86, 0.72, 1],
]

type Spark = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  r: number
  g: number
  b: number
}

function Fireworks({ active }: { active: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const sparksRef = useRef<Spark[]>([])
  const timerRef = useRef(0.5)

  useEffect(() => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    sparksRef.current = Array.from({ length: FW_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      r: 1,
      g: 1,
      b: 1,
    }))

    // hide every instance and allocate the instanceColor buffer up front
    for (let index = 0; index < FW_COUNT; index += 1) {
      fwDummy.position.set(0, -999, 0)
      fwDummy.scale.setScalar(0.0001)
      fwDummy.updateMatrix()
      mesh.setMatrixAt(index, fwDummy.matrix)
      mesh.setColorAt(index, fwColor.setRGB(0, 0, 0))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [])

  useFrame((_, delta) => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const dt = Math.min(delta, 0.05)
    const sparks = sparksRef.current

    if (sparks.length === 0) {
      return
    }

    if (active) {
      timerRef.current -= dt

      if (timerRef.current <= 0) {
        timerRef.current = 0.75 + Math.random() * 1.1
        const originX = -7 + Math.random() * 14
        const originY = 8.5 + Math.random() * 5.5
        const originZ = -44 + (Math.random() - 0.5) * 7
        const palette = FW_PALETTE[Math.floor(Math.random() * FW_PALETTE.length)]
        let launched = 0

        for (let index = 0; index < FW_COUNT && launched < 42; index += 1) {
          const spark = sparks[index]

          if (spark.life > 0) {
            continue
          }

          const theta = Math.random() * Math.PI * 2
          const phi = Math.acos(2 * Math.random() - 1)
          const speed = 2.4 + Math.random() * 2.6
          spark.x = originX
          spark.y = originY
          spark.z = originZ
          spark.vx = Math.sin(phi) * Math.cos(theta) * speed
          spark.vy = Math.cos(phi) * speed
          spark.vz = Math.sin(phi) * Math.sin(theta) * speed
          spark.maxLife = 1.1 + Math.random() * 0.9
          spark.life = spark.maxLife
          spark.r = palette[0]
          spark.g = palette[1]
          spark.b = palette[2]
          launched += 1
        }

        if (launched > 0) {
          playTone('star')
        }
      }
    }

    for (let index = 0; index < FW_COUNT; index += 1) {
      const spark = sparks[index]

      if (spark.life <= 0) {
        continue
      }

      spark.life -= dt

      if (spark.life <= 0) {
        fwDummy.position.set(0, -999, 0)
        fwDummy.scale.setScalar(0.0001)
        fwDummy.updateMatrix()
        mesh.setMatrixAt(index, fwDummy.matrix)
        continue
      }

      spark.vy -= 3.1 * dt
      spark.vx *= 0.985
      spark.vz *= 0.985
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
      spark.z += spark.vz * dt

      const ratio = spark.life / spark.maxLife
      // stay vivid for most of the life, then fade at the very end
      const glow = Math.min(1, ratio * 1.9)
      fwDummy.position.set(spark.x, spark.y, spark.z)
      fwDummy.scale.setScalar(0.45 + 0.85 * ratio)
      fwDummy.updateMatrix()
      mesh.setMatrixAt(index, fwDummy.matrix)
      mesh.setColorAt(index, fwColor.setRGB(spark.r * glow, spark.g * glow, spark.b * glow))
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, FW_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.14, 8, 8]} />
      <meshBasicMaterial
        transparent
        opacity={0.95}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </instancedMesh>
  )
}

const gardenTrees: Array<{ file: string; position: Vec3; scale: number; rotationY: number }> = [
  { file: 'tree_pineRoundB.glb', position: [-16, 0, 2], scale: 3.4, rotationY: 0.4 },
  { file: 'tree_oak.glb', position: [16, 0, 2], scale: 3.2, rotationY: 2.1 },
  { file: 'tree_pineTallA_detailed.glb', position: [-17, 0, -10], scale: 3.8, rotationY: 1.2 },
  { file: 'tree_default.glb', position: [17, 0, -10], scale: 3.4, rotationY: 3.6 },
  { file: 'tree_pineRoundD.glb', position: [-16.5, 0, -22], scale: 3.8, rotationY: 5.1 },
  { file: 'tree_oak.glb', position: [16.5, 0, -22], scale: 3.5, rotationY: 0.9 },
  { file: 'tree_thin.glb', position: [-15, 0, -36], scale: 3.6, rotationY: 2.8 },
  { file: 'tree_pineRoundB.glb', position: [15, 0, -36], scale: 3.4, rotationY: 4.2 },
  { file: 'tree_default.glb', position: [-6, 0, -47.5], scale: 3.3, rotationY: 1.7 },
  { file: 'tree_pineTallA_detailed.glb', position: [6, 0, -47.5], scale: 3.7, rotationY: 5.8 },
  { file: 'tree_oak.glb', position: [-13.5, 0, -45], scale: 3.2, rotationY: 3.3 },
  { file: 'tree_pineRoundD.glb', position: [13.5, 0, -45], scale: 3.4, rotationY: 0.7 },
  { file: 'tree_default.glb', position: [-16, 0, 8.5], scale: 3, rotationY: 2.5 },
  { file: 'tree_pineRoundB.glb', position: [16, 0, 8.5], scale: 3.2, rotationY: 4.8 },
]

function GardenTrees() {
  return (
    <group>
      {gardenTrees.map((tree, index) => (
        <SafeModel
          key={index}
          file={tree.file}
          position={tree.position}
          scale={tree.scale}
          rotationY={tree.rotationY}
        />
      ))}
    </group>
  )
}

// Feature cherry-blossom trees (imported low-poly sakura) at scenic spots.
const sakuraTrees: Array<{ position: Vec3; scale: number; rotationY: number }> = [
  { position: [-8.5, 0, 3.6], scale: 1.5, rotationY: 0.4 },
  { position: [8.5, 0, 3.6], scale: 1.4, rotationY: 2.3 },
  { position: [-19, 0, -30], scale: 1.6, rotationY: 1.1 },
  { position: [19, 0, -30], scale: 1.5, rotationY: 4.0 },
  { position: [-25, 0, -40], scale: 1.4, rotationY: 2.7 },
  { position: [0, 0, -55], scale: 1.8, rotationY: 5.2 },
]

function SakuraTrees() {
  return (
    <group>
      {sakuraTrees.map((tree, index) => (
        <SafeModel key={index} file="sakura.glb" position={tree.position} scale={tree.scale} rotationY={tree.rotationY} tint="flower" />
      ))}
    </group>
  )
}

// Imported low-poly lamp posts (modelled ~469u tall, so scaled way down) lining
// the paths, each with a warm glow at the bulb.
const gardenLamps: Array<{ position: Vec3; rotationY: number }> = [
  { position: [-3, 0, 4.8], rotationY: 0 },
  { position: [3, 0, 4.8], rotationY: 0 },
  { position: [-3.4, 0, -7], rotationY: 0.5 },
  { position: [3.4, 0, -7], rotationY: -0.5 },
]

function GardenLamps() {
  return (
    <group>
      {gardenLamps.map((lamp, index) => (
        <group key={index} position={lamp.position}>
          <SafeModel file="lamp_post.glb" position={[0, 0, 0]} scale={0.008} rotationY={lamp.rotationY} tint="stone" />
          <LampGlow position={[0, 3.5, 0]} scale={1.5} color="#ffe9a8" opacity={0.5} />
          <pointLight position={[0, 3.5, 0]} intensity={3.5} distance={7} color="#ffdfa0" />
        </group>
      ))}
    </group>
  )
}

class ModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? null
    }

    return this.props.children
  }
}

function SafeModel({
  fallback,
  ...modelProps
}: {
  file: string
  position: Vec3
  rotationY?: number
  scale?: number
  tint?: keyof typeof modelTints
  fallback?: ReactNode
}) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback ?? null}>
        <Model {...modelProps} />
      </Suspense>
    </ModelBoundary>
  )
}

const plazaFlowerRing: Array<{ file: string; angle: number }> = [
  { file: 'flower_redA.glb', angle: 0 },
  { file: 'flower_purpleB.glb', angle: 0.55 },
  { file: 'flower_yellowC.glb', angle: 1.05 },
  { file: 'flower_redB.glb', angle: 2.15 },
  { file: 'flower_purpleA.glb', angle: 2.7 },
  { file: 'flower_yellowA.glb', angle: 3.25 },
  { file: 'flower_redA.glb', angle: 4.3 },
  { file: 'flower_purpleC.glb', angle: 5.15 },
  { file: 'flower_yellowC.glb', angle: 5.95 },
]

const pathsideFlowers: Array<{ file: string; position: Vec3 }> = [
  { file: 'flower_redA.glb', position: [-1.5, 0, 3.4] },
  { file: 'flower_purpleB.glb', position: [1.5, 0, 2.2] },
  { file: 'flower_yellowC.glb', position: [-1.6, 0, -5] },
  { file: 'flower_redB.glb', position: [1.6, 0, -6.2] },
  { file: 'flower_purpleB.glb', position: [-1.4, 0, -28] },
  { file: 'flower_yellowA.glb', position: [1.4, 0, -29.3] },
  { file: 'flower_redA.glb', position: [-1.5, 0, -38.5] },
  { file: 'flower_purpleA.glb', position: [1.5, 0, -39.5] },
]

const grassTufts: Array<{ position: Vec3; scale: number }> = [
  { position: [-4.5, 0, 0.5], scale: 1.6 },
  { position: [4.6, 0, -4.8], scale: 1.5 },
  { position: [-13.4, 0, -5], scale: 1.8 },
  { position: [13.6, 0, -5.2], scale: 1.6 },
  { position: [-6.4, 0, -29.6], scale: 1.7 },
  { position: [6.8, 0, -30.2], scale: 1.5 },
  { position: [-3.4, 0, 4], scale: 1.4 },
  { position: [3.6, 0, 4.2], scale: 1.5 },
]

function Teapot({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.13, 0]} scale={[1, 0.82, 1]}>
        <sphereGeometry args={[0.155, 20, 16]} />
        <meshStandardMaterial color="#f7f1ff" emissive="#e0ccf5" emissiveIntensity={0.12} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0.265, 0]}>
        <cylinderGeometry args={[0.05, 0.085, 0.05, 14]} />
        <meshStandardMaterial color="#f7f1ff" roughness={0.24} />
      </mesh>
      <mesh position={[0, 0.305, 0]}>
        <sphereGeometry args={[0.026, 10, 10]} />
        <meshStandardMaterial color="#ffd9ec" emissive="#ffd9ec" emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0.17, 0.16, 0]} rotation={[0, 0, -0.9]}>
        <cylinderGeometry args={[0.024, 0.038, 0.17, 10]} />
        <meshStandardMaterial color="#f7f1ff" roughness={0.24} />
      </mesh>
      <mesh position={[-0.17, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.016, 10, 20, Math.PI * 1.4]} />
        <meshStandardMaterial color="#f7f1ff" roughness={0.24} />
      </mesh>
      {/* a rose painted as a blush on the pot: tiny pink dot */}
      <mesh position={[0, 0.15, 0.15]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshStandardMaterial color="#ffc9e2" emissive="#ffc9e2" emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

function ProceduralTeaTable() {
  return (
    <group>
      <mesh position={[0, 1.02, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.1, 24]} />
        <meshStandardMaterial color="#cfbfae" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1, 12]} />
        <meshStandardMaterial color="#a8977f" roughness={0.7} />
      </mesh>
    </group>
  )
}

function TeaCorner() {
  return (
    <group position={[0, 0, -2]}>
      <SafeModel file="tableRound.glb" position={[0, 0, 0]} scale={3} tint="stone" fallback={<ProceduralTeaTable />} />
      <SafeModel file="benchCushion.glb" position={[-1.6, 0, 0]} scale={3} rotationY={Math.PI / 2} tint="stone" />
      <SafeModel file="benchCushion.glb" position={[1.6, 0, 0]} scale={3} rotationY={-Math.PI / 2} tint="stone" />
      <group position={[0, 1.11, 0]}>
        <Teapot position={[0, 0, 0]} />
        <SafeModel file="food/cup-tea.glb" position={[0.34, 0, 0.16]} scale={1.3} rotationY={0.6} tint="stone" />
        <SafeModel file="food/cup-tea.glb" position={[-0.36, 0, 0.18]} scale={1.3} rotationY={2.5} tint="stone" />
        <SafeModel file="food/plate.glb" position={[0.02, 0, -0.34]} scale={1.3} tint="stone" />
        <SafeModel file="food/croissant.glb" position={[0.06, 0.04, -0.34]} scale={1.3} rotationY={1} tint="stone" />
        <SafeModel file="food/cookie.glb" position={[-0.1, 0.04, -0.3]} scale={1.3} tint="stone" />
      </group>
      <Sparkles count={6} scale={[2.2, 1.2, 2.2]} position={[0, 2, 0]} size={1.3} speed={0.16} color="#ffeccf" />
    </group>
  )
}

// A low-poly upright piano the visitor can play, candlelit for a little magic.
function Piano({ position, rotationY = 0 }: { position: Vec3; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* body */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[1.7, 1.3, 0.55]} />
        <meshStandardMaterial color="#2b2233" roughness={0.5} metalness={0.1} />
      </mesh>
      {/* top lid */}
      <mesh position={[0, 1.6, 0.06]}>
        <boxGeometry args={[1.82, 0.12, 0.7]} />
        <meshStandardMaterial color="#221b29" roughness={0.5} />
      </mesh>
      {/* front panel accent */}
      <mesh position={[0, 1.15, 0.29]}>
        <boxGeometry args={[1.4, 0.55, 0.02]} />
        <meshStandardMaterial color="#392b41" roughness={0.4} emissive="#241a2c" emissiveIntensity={0.2} />
      </mesh>
      {/* keyboard shelf */}
      <mesh position={[0, 0.9, 0.35]}>
        <boxGeometry args={[1.55, 0.12, 0.3]} />
        <meshStandardMaterial color="#f5f1e6" roughness={0.35} />
      </mesh>
      {/* black keys */}
      {Array.from({ length: 11 }).map((_, index) => (
        <mesh key={index} position={[-0.66 + index * 0.132, 0.98, 0.33]}>
          <boxGeometry args={[0.05, 0.03, 0.16]} />
          <meshStandardMaterial color="#141019" />
        </mesh>
      ))}
      {/* legs */}
      {[-0.76, 0.76].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]}>
          <boxGeometry args={[0.16, 0.25, 0.5]} />
          <meshStandardMaterial color="#221b29" roughness={0.55} />
        </mesh>
      ))}
      {/* candelabra glow on top */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={`candle-${x}`} position={[x, 1.74, 0]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#ffe9ad" emissive="#ffe9ad" emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      ))}
      <LampGlow position={[-0.5, 1.77, 0]} scale={0.9} color="#ffe9ad" opacity={0.4} />
      <LampGlow position={[0.5, 1.77, 0]} scale={0.9} color="#ffe9ad" opacity={0.4} />
      <Sparkles count={8} scale={[1.8, 1.2, 1]} position={[0, 1.95, 0]} size={1.3} speed={0.2} color="#fff0bd" />
      {/* bench */}
      <mesh position={[0, 0.42, 1.0]}>
        <boxGeometry args={[1, 0.1, 0.34]} />
        <meshStandardMaterial color="#3a2e42" roughness={0.6} />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={`bench-leg-${x}`} position={[x, 0.18, 1.0]}>
          <boxGeometry args={[0.08, 0.36, 0.08]} />
          <meshStandardMaterial color="#2b2233" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function GardenModels() {
  return (
    <group>
      {/* tea for two at the plaza centre */}
      <TeaCorner />
      {/* a candlelit piano you can play */}
      <Piano position={stationPositions.piano} rotationY={1.7} />

      {/* the moon-ring monument watches from behind the white-rose arch */}
      <SafeModel file="statue_block.glb" position={[0, 0, -46]} scale={3} tint="stone" />
      <SafeModel file="statue_ring.glb" position={[0, 1.2, -46]} scale={2.5} tint="stone" />

      {/* flower ring around the plaza */}
      {plazaFlowerRing.map((flower, index) => (
        <Sway
          key={`plaza-flower-${index}`}
          seed={index * 1.7}
          strength={0.06}
          position={[Math.cos(flower.angle) * 5.4, 0, -2 + Math.sin(flower.angle) * 5.4]}
        >
          <SafeModel file={flower.file} position={[0, 0, 0]} scale={1.5} rotationY={flower.angle * 2} tint="flower" />
        </Sway>
      ))}

      {/* flowers along the walks */}
      {pathsideFlowers.map((flower, index) => (
        <Sway key={`path-flower-${index}`} seed={index * 2.3 + 9} strength={0.07} position={flower.position}>
          <SafeModel file={flower.file} position={[0, 0, 0]} scale={1.45} rotationY={index * 1.9} tint="flower" />
        </Sway>
      ))}

      {/* grass tufts that lean with the wind */}
      {grassTufts.map((tuft, index) => (
        <Sway key={`tuft-${index}`} seed={index * 3.1 + 20} strength={0.12} position={tuft.position}>
          <SafeModel file="grass_leafs.glb" position={[0, 0, 0]} scale={tuft.scale} rotationY={index * 2.4} />
        </Sway>
      ))}

      <SafeModel file="pot_large.glb" position={[-2.6, 0, -0.2]} scale={1.2} tint="stone" />
      <SafeModel file="pot_large.glb" position={[2.6, 0, -3.8]} scale={1.2} tint="stone" />
      <SafeModel file="flower_purpleA.glb" position={[-2.6, 0.24, -0.2]} scale={1.1} />
      <SafeModel file="flower_yellowA.glb" position={[2.6, 0.24, -3.8]} scale={1.1} />

      {/* obelisks flanking the moon gate */}
      <SafeModel file="statue_obelisk.glb" position={[-3.6, 0, 4.9]} scale={2.2} tint="stone" />
      <SafeModel file="statue_obelisk.glb" position={[3.6, 0, 4.9]} scale={2.2} tint="stone" />

      {/* the teddy's mushroom corner behind the rose cabinet */}
      <SafeModel file="mushroom_redGroup.glb" position={[-12.7, 0, -3.2]} scale={1.3} rotationY={0.8} />
      <SafeModel file="mushroom_tanGroup.glb" position={[-11.3, 0, -4.4]} scale={1.2} rotationY={2.4} />

      {/* rocks, stump and bushes scattered off the paths */}
      <SafeModel file="rock_largeA.glb" position={[4.4, 0, -6.8]} scale={1.4} rotationY={1.1} tint="stone" />
      <SafeModel file="rock_largeB.glb" position={[-4.2, 0, -7]} scale={1.2} rotationY={4.3} tint="stone" />
      <SafeModel file="rock_smallA.glb" position={[2.4, 0, 1.2]} scale={1.3} rotationY={2.2} tint="stone" />
      <SafeModel file="rock_smallE.glb" position={[-2.6, 0, -30.8]} scale={1.4} rotationY={0.6} tint="stone" />
      <SafeModel file="stump_roundDetailed.glb" position={[10.6, 0, -30.4]} scale={1.4} rotationY={1.9} />
      <SafeModel file="plant_bushDetailed.glb" position={[-3.4, 0, -9.2]} scale={1.5} rotationY={0.7} />
      <SafeModel file="plant_bushDetailed.glb" position={[3.4, 0, -9.2]} scale={1.4} rotationY={3.9} />

      {/* small flower accents in the south meadow */}
      <SafeModel file="flower_purpleC.glb" position={[-4.6, 0, -35.4]} scale={1.4} rotationY={1.3} />
      <SafeModel file="flower_yellowA.glb" position={[4.8, 0, -35.8]} scale={1.3} rotationY={4.4} />
      <SafeModel file="flower_purpleA.glb" position={[-3.2, 0, -44]} scale={1.4} rotationY={2.6} />
      <SafeModel file="flower_yellowA.glb" position={[3.4, 0, -44.2]} scale={1.3} rotationY={0.2} />

      {/* garden benches you can actually sit on */}
      <SafeModel file="graveyard/bench.glb" position={[3.4, 0, -39.2]} scale={0.9} rotationY={-0.7 + Math.PI} tint="stone" />
      <SafeModel file="graveyard/bench.glb" position={[-6.5, 0, 4]} scale={0.9} rotationY={0.5 + Math.PI} tint="stone" />

      {/* a little flower cart resting by the gate */}
      <SafeModel file="town/cart.glb" position={[6.8, 0, 3.2]} scale={0.85} rotationY={-0.6} />
      <Sway seed={31} strength={0.05} position={[6.6, 0.62, 3.1]}>
        <SafeModel file="flower_purpleA.glb" position={[0, 0, 0]} scale={1} tint="flower" />
      </Sway>
      <Sway seed={32} strength={0.05} position={[7.1, 0.62, 3.4]}>
        <SafeModel file="flower_yellowA.glb" position={[0, 0, 0]} scale={0.95} tint="flower" />
      </Sway>

      {/* urns with night blooms flanking the labyrinth mouth and exit */}
      <SafeModel file="graveyard/urn-round.glb" position={[-2.6, 0, -9.1]} scale={0.7} tint="stone" />
      <SafeModel file="graveyard/urn-round.glb" position={[2.6, 0, -9.1]} scale={0.7} tint="stone" />
      <SafeModel file="graveyard/urn-round.glb" position={[-2.6, 0, -26.9]} scale={0.7} tint="stone" />
      <SafeModel file="graveyard/urn-round.glb" position={[2.6, 0, -26.9]} scale={0.7} tint="stone" />
    </group>
  )
}

function Teddy() {
  const fur = '#b07f4f'
  const muzzleColor = '#e6c79c'

  return (
    <group position={[-12.2, 0, -3.9]} rotation={[0, 2.6, 0]} userData={{ secret: 'teddy' }}>
      <mesh visible={false} position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.75, 8, 8]} />
        <meshBasicMaterial />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={fur} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={fur} roughness={0.9} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshStandardMaterial color={fur} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.68, 0.17]}>
        <sphereGeometry args={[0.095, 12, 12]} />
        <meshStandardMaterial color={muzzleColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.71, 0.255]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshStandardMaterial color="#3c2415" roughness={0.6} />
      </mesh>
      {[-0.085, 0.085].map((x) => (
        <mesh key={`eye-${x}`} position={[x, 0.78, 0.185]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color="#241407" roughness={0.4} />
        </mesh>
      ))}
      {[-0.26, 0.26].map((x) => (
        <mesh key={`arm-${x}`} position={[x, 0.42, 0.06]} rotation={[0, 0, x > 0 ? -0.5 : 0.5]}>
          <capsuleGeometry args={[0.07, 0.16, 4, 8]} />
          <meshStandardMaterial color={fur} roughness={0.9} />
        </mesh>
      ))}
      {[-0.15, 0.15].map((x) => (
        <mesh key={`leg-${x}`} position={[x, 0.12, 0.18]} rotation={[1.2, 0, 0]}>
          <capsuleGeometry args={[0.08, 0.14, 4, 8]} />
          <meshStandardMaterial color={fur} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0.3, 0.52, 0.16]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#fdfaff" emissive="#ffd9ec" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.3, 0.44, 0.16]} rotation={[0.3, 0, 0.2]}>
        <cylinderGeometry args={[0.008, 0.012, 0.14, 6]} />
        <meshStandardMaterial color="#4c7a52" />
      </mesh>
    </group>
  )
}

function PadelBall({
  playerRef,
  tired,
  caught,
  fleeNonce,
  onFlee,
}: {
  playerRef: React.MutableRefObject<PlayerSample>
  tired: boolean
  caught: boolean
  fleeNonce: number
  onFlee: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const stateRef = useRef({
    x: -7,
    z: -30,
    fromX: -7,
    fromZ: -30,
    toX: -7,
    toZ: -30,
    hop: 1,
    cooldown: 0,
  })
  const propsRef = useRef({ tired, caught, onFlee })

  useEffect(() => {
    propsRef.current = { tired, caught, onFlee }
  }, [tired, caught, onFlee])

  useEffect(() => {
    if (fleeNonce === 0) {
      return
    }

    const state = stateRef.current

    if (state.hop < 1 || propsRef.current.tired || propsRef.current.caught) {
      return
    }

    const player = playerRef.current
    const awayAngle = Math.atan2(state.x - player.x, state.z - player.z) + (Math.random() - 0.5) * 1.4
    const distance = 3 + Math.random() * 2
    state.fromX = state.x
    state.fromZ = state.z
    state.toX = clamp(state.x + Math.sin(awayAngle) * distance, -14, -3.6)
    state.toZ = clamp(state.z + Math.cos(awayAngle) * distance, -37, -28)
    state.hop = 0
    state.cooldown = 1.1
    propsRef.current.onFlee()
  }, [fleeNonce, playerRef])

  useFrame(({ clock }, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const state = stateRef.current
    state.cooldown = Math.max(0, state.cooldown - delta)

    if (state.hop < 1) {
      state.hop = Math.min(1, state.hop + delta / 0.55)
      const eased = 1 - (1 - state.hop) * (1 - state.hop)
      state.x = THREE.MathUtils.lerp(state.fromX, state.toX, eased)
      state.z = THREE.MathUtils.lerp(state.fromZ, state.toZ, eased)
    } else if (!propsRef.current.tired && !propsRef.current.caught && state.cooldown <= 0) {
      const player = playerRef.current

      if (Math.hypot(player.x - state.x, player.z - state.z) < 2.1) {
        const awayAngle =
          Math.atan2(state.x - player.x, state.z - player.z) + (Math.random() - 0.5) * 1.4
        const distance = 3 + Math.random() * 2
        state.fromX = state.x
        state.fromZ = state.z
        state.toX = clamp(state.x + Math.sin(awayAngle) * distance, -14, -3.6)
        state.toZ = clamp(state.z + Math.cos(awayAngle) * distance, -37, -28)
        state.hop = 0
        state.cooldown = 1.1
        propsRef.current.onFlee()
      }
    }

    const bounce = state.hop < 1 ? Math.sin(state.hop * Math.PI) * 1.1 : 0
    const breathing = propsRef.current.tired && !propsRef.current.caught
      ? Math.sin(clock.elapsedTime * 6) * 0.06
      : 0
    group.position.set(state.x, 0.16 + bounce, state.z)
    group.scale.set(1, 1 + breathing, 1)
  })

  return (
    <group ref={groupRef} userData={{ secret: 'padel' }}>
      <mesh visible={false}>
        <sphereGeometry args={[0.7, 8, 8]} />
        <meshBasicMaterial />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial
          color="#d8f24e"
          emissive="#b6d431"
          emissiveIntensity={caught ? 0.15 : 0.5}
          roughness={0.6}
        />
      </mesh>
      {caught ? (
        <Float speed={2} floatIntensity={0.3} position={[0, 0.55, 0]}>
          <mesh>
            <octahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial color="#ffe680" emissive="#ffe680" emissiveIntensity={1.4} />
          </mesh>
        </Float>
      ) : null}
    </group>
  )
}

function TapRaycaster({
  nonce,
  pointRef,
  onHit,
  onWish,
}: {
  nonce: number
  pointRef: React.MutableRefObject<{ x: number; y: number } | null>
  onHit: (secret: SecretId) => void
  onWish: () => void
}) {
  const { camera, scene, gl } = useThree()
  const handledRef = useRef(0)

  useEffect(() => {
    if (nonce === 0 || handledRef.current === nonce) {
      return
    }

    handledRef.current = nonce
    const point = pointRef.current

    if (!point) {
      return
    }

    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((point.x - rect.left) / rect.width) * 2 - 1,
      -((point.y - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)

    const targets: THREE.Object3D[] = []
    scene.traverse((object) => {
      if (object.visible && (object.userData.secret || object.userData.wish)) {
        targets.push(object)
      }
    })

    const hits = raycaster.intersectObjects(targets, true)

    if (hits.length === 0) {
      return
    }

    let object: THREE.Object3D | null = hits[0].object

    while (object) {
      if (object.userData.wish) {
        onWish()
        return
      }

      if (object.userData.secret) {
        onHit(object.userData.secret as SecretId)
        return
      }

      object = object.parent
    }
  }, [nonce, camera, scene, gl, pointRef, onHit, onWish])

  return null
}

// a tidy continuous hedge wall around the garden (far nicer than scattered spheres)
// perimeter hedges, grown to enclose the enlarged garden (the old ones sat at
// ±21 and cut through the new far lawns / landmarks)
const hedgeWallSegments: Array<{ pos: Vec3; size: [number, number, number] }> = [
  { pos: [0, 0.9, 11], size: [61, 1.8, 1.4] },
  { pos: [0, 0.9, -63], size: [61, 1.8, 1.4] },
  { pos: [-30, 0.9, -26], size: [1.4, 1.8, 75] },
  { pos: [30, 0.9, -26], size: [1.4, 1.8, 75] },
]

function HedgeWalls() {
  return (
    <group>
      {hedgeWallSegments.map((wall, index) => (
        <group key={index}>
          <mesh position={wall.pos} castShadow={false}>
            <boxGeometry args={wall.size} />
            <meshStandardMaterial color="#1f3a29" roughness={0.95} />
          </mesh>
          <mesh position={[wall.pos[0], 1.92, wall.pos[2]]}>
            <boxGeometry args={[wall.size[0] + 0.16, 0.26, wall.size[2] + 0.16]} />
            <meshStandardMaterial color="#2c523a" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// instanced grass tufts scattered on the lawn for a lusher, less bare ground
// Low-poly grass: flat blade quads (not cone/sphere tufts), scattered across the
// whole enlarged lawn. Two instanced meshes crossed 90° so blades read from any
// angle without ever looking edge-on-invisible.
function GrassBlades({ count = 340 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const dummy = new THREE.Object3D()
    for (let index = 0; index < count; index += 1) {
      const seed = index * 4
      const side = pseudoRandom(seed + 1) < 0.5 ? -1 : 1
      const x = side * (3.5 + pseudoRandom(seed + 2) * 23.5)
      const z = -60 + pseudoRandom(seed + 3) * 69
      const scale = 0.7 + pseudoRandom(seed + 5) * 0.9
      dummy.position.set(x, 0.3 * scale, z)
      dummy.rotation.set((pseudoRandom(seed + 6) - 0.5) * 0.25, pseudoRandom(seed + 4) * Math.PI, (pseudoRandom(seed + 7) - 0.5) * 0.22)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      // a second blade crossed 90° at the same spot for fuller, non-flat tufts
      dummy.rotation.y += Math.PI / 2
      dummy.updateMatrix()
      mesh.setMatrixAt(index + count, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count * 2]} frustumCulled={false} castShadow={false}>
      <planeGeometry args={[0.16, 0.62]} />
      <meshStandardMaterial color="#3f6b46" emissive="#16301c" emissiveIntensity={0.25} roughness={0.95} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

// A cheap, fully-instanced scatter of low-poly pebbles along the garden edges.
// One draw call, so it adds ground detail without touching the frame budget.
function ScatterPebbles({ count = 40 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const dummy = new THREE.Object3D()
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1
      const x = side * (12.5 + pseudoRandom(index * 5 + 2) * 6.5)
      const z = -49 + pseudoRandom(index * 5 + 3) * 58
      const size = 0.14 + pseudoRandom(index * 5 + 4) * 0.34
      dummy.position.set(x, size * 0.4, z)
      dummy.scale.set(size, size * (0.6 + pseudoRandom(index) * 0.4), size)
      dummy.rotation.set(
        pseudoRandom(index * 7) * Math.PI,
        pseudoRandom(index * 11) * Math.PI,
        pseudoRandom(index * 13) * Math.PI,
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#6b6f86" roughness={0.95} flatShading />
    </instancedMesh>
  )
}

function GardenHedges() {
  return (
    <group>
      <HedgeWalls />
      <GrassBlades />
      <ScatterPebbles />
      {/* the front hedge wall either side of the moon gate */}
      {gateHedgeWalls.map((wall, index) => (
        <group key={`gate-hedge-${index}`}>
          <mesh position={[wall.x, 1, wall.z]}>
            <boxGeometry args={[wall.w, 2, wall.d]} />
            <meshStandardMaterial color="#22422e" roughness={0.96} />
          </mesh>
          <mesh position={[wall.x, 2.04, wall.z]}>
            <boxGeometry args={[wall.w + 0.16, 0.24, wall.d + 0.16]} />
            <meshStandardMaterial color="#2c523a" roughness={0.96} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FlowerCluster({ position, scale, palette }: { position: Vec3; scale: number; palette: number }) {
  // nocturnal blooms: moon-white, pale rose, and wisteria violet, all softly luminous
  const petalColor = palette === 0 ? '#f8faff' : palette === 1 ? '#ffdff0' : '#ece2ff'
  const glowColor = palette === 0 ? '#cfe4ff' : palette === 1 ? '#ffb3dc' : '#c9b3ff'

  return (
    <group position={position} scale={scale}>
      {[-0.18, 0, 0.18].map((x, index) => (
        <group key={index} position={[x, 0, index % 2 === 0 ? -0.12 : 0.12]} rotation={[0, index * 1.3, 0]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.016, 0.028, 0.36, 6]} />
            <meshStandardMaterial color="#4c7a52" roughness={0.9} />
          </mesh>
          {/* a soft faceted bloom head — gently lit, not a glowing orb */}
          <mesh position={[0, 0.4, 0]} rotation={[0.35, index, 0]} scale={[1, 0.5, 1]}>
            <icosahedronGeometry args={[0.12, 0]} />
            <meshStandardMaterial
              color={petalColor}
              emissive={glowColor}
              emissiveIntensity={0.16}
              roughness={0.5}
              flatShading
            />
          </mesh>
          {/* bright pollen centre */}
          <mesh position={[0, 0.43, 0]}>
            <sphereGeometry args={[0.036, 8, 8]} />
            <meshStandardMaterial color="#ffe89a" emissive="#ffe89a" emissiveIntensity={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function LampGlow({ position, scale = 1.7, color = '#ffe9ad', opacity = 0.5 }: { position: Vec3; scale?: number; color?: string; opacity?: number }) {
  const glowTexture = useMemo(() => createGlowTexture(), [])

  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial
        map={glowTexture}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  )
}

function GardenLamp({
  position,
  rotationY = 0,
  lit = true,
  glowScale = 1.9,
}: {
  position: Vec3
  rotationY?: number
  lit?: boolean
  glowScale?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.055, 0.085, 2.3, 10]} />
        <meshStandardMaterial color="#46554c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.32, 0]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshStandardMaterial color="#46554c" roughness={0.85} />
      </mesh>
      <mesh position={[0.24, 2.28, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.032, 0.032, 0.52, 8]} />
        <meshStandardMaterial color="#46554c" roughness={0.85} />
      </mesh>
      <SafeModel file="graveyard/lantern-glass.glb" position={[0.46, 1.8, 0]} scale={0.55} tint="stone" />
      <mesh position={[0.46, 2.02, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial
          color={lit ? '#ffe9ad' : '#907ba3'}
          emissive={lit ? '#ffe9ad' : '#907ba3'}
          emissiveIntensity={lit ? 1.4 : 0.12}
          transparent
          opacity={lit ? 0.9 : 0.5}
        />
      </mesh>
      {lit ? <LampGlow position={[0.46, 2.02, 0]} scale={glowScale} opacity={0.55} /> : null}
    </group>
  )
}

function LanternPosts() {
  return (
    <group>
      {(
        [
          { position: [-2.8, 0, 1.6], rotationY: -0.5 },
          { position: [2.8, 0, 1.6], rotationY: Math.PI + 0.5 },
          { position: [-3.8, 0, -6.9], rotationY: -0.4 },
          { position: [3.8, 0, -6.9], rotationY: Math.PI + 0.4 },
          { position: [-2.4, 0, -28.4], rotationY: -0.4 },
          { position: [2.4, 0, -28.4], rotationY: Math.PI + 0.4 },
          { position: [-3.2, 0, -37.6], rotationY: -0.4 },
          { position: [3.2, 0, -37.6], rotationY: Math.PI + 0.4 },
        ] as Array<{ position: Vec3; rotationY: number }>
      ).map((lamp, index) => (
        <GardenLamp key={index} position={lamp.position} rotationY={lamp.rotationY} />
      ))}
    </group>
  )
}

function RoseBush({ position, scale }: { position: Vec3; scale: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.85, 16, 16]} />
        <meshStandardMaterial color="#1e3724" roughness={0.95} />
      </mesh>
      {[-0.35, 0, 0.35].map((x, index) => (
        <mesh key={index} position={[x, 0.72, index % 2 === 0 ? 0.18 : -0.18]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial color="#f5f4ff" emissive="#ffd7ec" emissiveIntensity={0.22} />
        </mesh>
      ))}
    </group>
  )
}

// One swinging gate leaf, hinged at the local origin, spanning to the centre.
// One elegant wrought-iron gate leaf: two stiles, two rails, vertical bars that
// rise toward the centre into an arch, spear finials, and a little moon scroll.
function GateLeaf({ dir }: { dir: 1 | -1 }) {
  const s = dir
  const iron = '#bcc0d8'
  const barX = [0.5, 0.95, 1.4, 1.85, 2.3]

  return (
    <group>
      {/* stiles at the hinge and meeting edges */}
      {[0.18, 2.42].map((x, index) => (
        <mesh key={`stile-${index}`} position={[s * x, 1.2, 0]}>
          <boxGeometry args={[0.09, 2.5, 0.09]} />
          <meshStandardMaterial color={iron} metalness={0.25} roughness={0.45} emissive="#3a3c58" emissiveIntensity={0.18} />
        </mesh>
      ))}
      {/* horizontal rails */}
      {[0.35, 1.55].map((y, index) => (
        <mesh key={`rail-${index}`} position={[s * 1.3, y, 0]}>
          <boxGeometry args={[2.4, 0.08, 0.07]} />
          <meshStandardMaterial color={iron} metalness={0.25} roughness={0.45} />
        </mesh>
      ))}
      {/* vertical bars with spear finials, arching toward the centre */}
      {barX.map((x, index) => {
        const tip = 1.95 + (x / 2.42) * 0.55
        const barBottom = 0.25
        const barHeight = tip - barBottom
        return (
          <group key={`bar-${index}`} position={[s * x, 0, 0]}>
            <mesh position={[0, barBottom + barHeight / 2, 0]}>
              <cylinderGeometry args={[0.026, 0.026, barHeight, 6]} />
              <meshStandardMaterial color={iron} metalness={0.25} roughness={0.45} emissive="#3a3c58" emissiveIntensity={0.15} />
            </mesh>
            <mesh position={[0, tip + 0.08, 0]}>
              <coneGeometry args={[0.045, 0.16, 6]} />
              <meshStandardMaterial color="#e8e6f4" emissive="#ffe9ad" emissiveIntensity={0.25} metalness={0.3} roughness={0.4} />
            </mesh>
          </group>
        )
      })}
      {/* a little moon-scroll motif near the meeting edge */}
      <mesh position={[s * 2.05, 0.95, 0.04]}>
        <torusGeometry args={[0.2, 0.03, 8, 20]} />
        <meshStandardMaterial color={iron} metalness={0.25} roughness={0.45} emissive="#6a6c8a" emissiveIntensity={0.22} />
      </mesh>
    </group>
  )
}

// A clean double gate that fully seals the opening when closed and swings
// outward toward the player when opened.
function ProceduralGateDoors({ open }: { open: boolean }) {
  const leftRef = useRef<THREE.Group>(null)
  const rightRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (leftRef.current) {
      leftRef.current.rotation.y = THREE.MathUtils.lerp(leftRef.current.rotation.y, open ? -1.45 : 0, 0.07)
    }
    if (rightRef.current) {
      rightRef.current.rotation.y = THREE.MathUtils.lerp(rightRef.current.rotation.y, open ? 1.45 : 0, 0.07)
    }
  })

  return (
    <group>
      {/* left leaf hinged at the left post, spanning to the centre */}
      <group ref={leftRef} position={[-2.6, 0, 0]}>
        <GateLeaf dir={1} />
      </group>
      {/* right leaf hinged at the right post, spanning to the centre */}
      <group ref={rightRef} position={[2.6, 0, 0]}>
        <GateLeaf dir={-1} />
      </group>
    </group>
  )
}

function GardenGate({ open, highlighted }: { open: boolean; highlighted: boolean }) {
  return (
    <group position={[0, 0, 6]}>
      {/* glowing moon-ring arch above the gateway */}
      <mesh position={[0, 4.1, 0]}>
        <torusGeometry args={[1.7, 0.1, 16, 48, Math.PI]} />
        <meshStandardMaterial color="#f8f0ff" emissive="#ffd9ef" emissiveIntensity={0.6} />
      </mesh>
      {[-2.7, 2.7].map((x) => (
        <mesh key={x} position={[x, 1.25, 0]}>
          <cylinderGeometry args={[0.16, 0.2, 2.5, 10]} />
          <meshStandardMaterial color="#c6bfd8" roughness={0.7} />
        </mesh>
      ))}
      {[-2.7, 2.7].map((x) => (
        <mesh key={`cap-${x}`} position={[x, 2.62, 0]}>
          <sphereGeometry args={[0.24, 14, 14]} />
          <meshStandardMaterial color="#ffe9ad" emissive="#ffe9ad" emissiveIntensity={0.9} />
        </mesh>
      ))}
      <ProceduralGateDoors open={open} />
      <RoseBush position={[-2.2, 0, 0.6]} scale={1} />
      <RoseBush position={[2.2, 0, 0.6]} scale={1} />
      <StationTitle position={[0, 5.2, 0]} title="Moon Gate" subtitle="The garden begins here" highlighted={highlighted} />
    </group>
  )
}

function DrawerChest({ progress }: { progress: number }) {
  const url = MODEL_BASE + 'sideTableDrawers.glb'
  const { scene } = useGLTF(url)
  const units = useMemo(() => [scene.clone(true), scene.clone(true)], [scene])
  const drawersRef = useRef<Array<{ node: THREE.Object3D; restZ: number }>>([])

  useEffect(() => {
    applyNightTint(scene, url, modelTints.stone)

    const found: Array<{ node: THREE.Object3D; restZ: number }> = []
    units.forEach((unit) => {
      const left = unit.getObjectByName('drawerLeft')
      const right = unit.getObjectByName('drawerRight')

      if (left) found.push({ node: left, restZ: left.position.z })
      if (right) found.push({ node: right, restZ: right.position.z })
    })
    drawersRef.current = found
  }, [scene, url, units])

  useFrame(() => {
    drawersRef.current.forEach((drawer, index) => {
      const opened = index < progress
      drawer.node.position.z = THREE.MathUtils.lerp(
        drawer.node.position.z,
        opened ? drawer.restZ + 0.17 : drawer.restZ,
        0.08,
      )
    })
  })

  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    return {
      lift: -box.min.y * 2.8,
      height: (box.max.y - box.min.y) * 2.8,
      cx: ((box.min.x + box.max.x) / 2) * 2.8,
      cz: ((box.min.z + box.max.z) / 2) * 2.8,
    }
  }, [scene])

  return (
    <group rotation={[0, 1.2, 0]}>
      <primitive object={units[0]} position={[-bounds.cx, bounds.lift, -bounds.cz]} scale={2.8} />
      <primitive
        object={units[1]}
        position={[-bounds.cx, bounds.lift + bounds.height, -bounds.cz]}
        scale={2.8}
      />
    </group>
  )
}

function RoseCabinet({ progress, complete, highlighted }: { progress: number; complete: boolean; highlighted: boolean }) {
  return (
    <group position={stationPositions.archive}>
      <Suspense fallback={null}>
        <DrawerChest progress={progress} />
      </Suspense>
      <Sparkles count={10} scale={[2.6, 2.2, 1.6]} position={[0, 1.8, 0.4]} size={2.6} speed={0.2} color="#ffd7ef" />
      <RoseBush position={[-1.7, 0, 0.2]} scale={0.9} />
      <RoseBush position={[1.7, 0, 0.2]} scale={0.9} />
      <LetterEnvelope position={[0, 2.9, 0.4]} visible={!complete} />
      <CompletionHalo active={complete} position={[0, 3.65, 0]} />
      <StationTitle position={[0, 4.3, 0]} title="Rose Cabinet" subtitle="Drawers of shared jokes" highlighted={highlighted} />
    </group>
  )
}

function LanternGrove({ progress, complete, highlighted }: { progress: number; complete: boolean; highlighted: boolean }) {
  return (
    <group position={stationPositions.lanterns}>
      {[-1.6, 0, 1.6].map((x, index) => {
        const lit = index < progress
        return (
          <GardenLamp
            key={index}
            position={[x, 0, 0]}
            rotationY={-Math.PI / 2}
            lit={lit}
            glowScale={2.3}
          />
        )
      })}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.3, 28]} />
        <meshStandardMaterial color="#3b2848" emissive="#6d4a88" emissiveIntensity={0.18} transparent opacity={0.75} />
      </mesh>
      <LetterEnvelope position={[0, 3.1, 0.4]} visible={!complete} />
      <CompletionHalo active={complete} position={[0, 4.2, 0]} />
      <StationTitle position={[0, 4.85, 0]} title="Lantern Grove" subtitle="Bitbox, but fairy-lit" highlighted={highlighted} />
    </group>
  )
}

function StarlitPath({ progress, complete, highlighted }: { progress: number; complete: boolean; highlighted: boolean }) {
  return (
    <group position={stationPositions.path}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 6.8]} />
        <meshStandardMaterial color="#6f748c" roughness={0.96} />
      </mesh>
      {[-2.3, -0.8, 0.7, 2.2].map((z, index) => {
        const active = index < progress
        return (
          <group key={index} position={[0, 0, z]}>
            <mesh position={[0, 0.18, 0]}>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial
                color={active ? '#ffe680' : '#88c8ff'}
                emissive={active ? '#ffe680' : '#88c8ff'}
                emissiveIntensity={active ? 1.4 : 0.45}
              />
            </mesh>
          </group>
        )
      })}
      <ModelBoundary fallback={<StaticTinyCar />}>
        <Suspense fallback={<StaticTinyCar />}>
          <DrivingVan progress={progress} />
        </Suspense>
      </ModelBoundary>
      <LetterEnvelope position={[0, 2.5, -0.2]} visible={!complete} />
      <CompletionHalo active={complete} position={[0, 3.3, -0.2]} />
      <StationTitle position={[0, 4, -0.2]} title="Starlit Path" subtitle="A little drive under flowers" highlighted={highlighted} />
    </group>
  )
}

function ReadingNook({ progress, complete, highlighted }: { progress: number; complete: boolean; highlighted: boolean }) {
  const paperTexture = useMemo(() => createPaperTexture(), [])

  return (
    <group position={stationPositions.reading}>
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[2.8, 0.16, 2.2]} />
        <meshStandardMaterial color="#ead8f2" roughness={0.42} />
      </mesh>
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]}>
          <boxGeometry args={[0.16, 2.1, 0.16]} />
          <meshStandardMaterial color="#f0e7f7" roughness={0.32} />
        </mesh>
      ))}
      <SafeModel file="benchCushion.glb" position={[-0.55, 0, 0.55]} scale={3} tint="stone" />
      <SafeModel file="benchCushion.glb" position={[0.55, 0, 0.55]} scale={3} tint="stone" />
      <SafeModel file="lampRoundFloor.glb" position={[-1.85, 0, 0.7]} scale={2.2} rotationY={0.4} tint="stone" />
      <SafeModel file="bookcaseOpen.glb" position={[1.95, 0, -0.5]} scale={2.4} rotationY={-0.5} tint="stone" />
      <SafeModel file="books.glb" position={[-1.1, 0, 1.3]} scale={4} rotationY={1.1} tint="stone" />
      <SafeModel file="books.glb" position={[1.2, 0, 1.5]} scale={3.4} rotationY={4.2} tint="stone" />
      <group userData={{ secret: 'book' }}>
        <Book position={[0, 1.05, 0.55]} scale={1.22} />
      </group>
      {[-0.95, 0, 0.95].map((x, index) => {
        const turned = index < progress
        return (
          <Float key={index} position={[x, 1.85 + index * 0.2, 0]} speed={1.1 + index * 0.18} floatIntensity={0.18}>
            <mesh rotation={[0.08, 0.25 - index * 0.2, 0]}>
              <boxGeometry args={[0.58, 0.78, 0.03]} />
              <meshStandardMaterial
                color={turned ? '#ffe9bf' : '#f6ddff'}
                map={paperTexture}
                emissive={turned ? '#ffe8b6' : '#eac6ff'}
                emissiveIntensity={turned ? 0.4 : 0.12}
                roughness={0.18}
              />
            </mesh>
          </Float>
        )
      })}
      <LetterEnvelope position={[0, 3, 0.6]} visible={!complete} />
      <CompletionHalo active={complete} position={[0, 4.1, 0]} />
      <StationTitle position={[0, 4.75, 0]} title="Moon Bench" subtitle="Pages, pauses, and the famous book" highlighted={highlighted} />
    </group>
  )
}

function FinalArch({ open, unlocked, highlighted }: { open: boolean; unlocked: boolean; highlighted: boolean }) {
  return (
    <group position={stationPositions.final}>
      <mesh position={[-1.35, 1.75, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 3.5, 14]} />
        <meshStandardMaterial color="#f2e9f6" roughness={0.3} />
      </mesh>
      <mesh position={[1.35, 1.75, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 3.5, 14]} />
        <meshStandardMaterial color="#f2e9f6" roughness={0.3} />
      </mesh>
      <mesh position={[0, 3.45, 0]}>
        <torusGeometry args={[1.35, 0.16, 18, 48, Math.PI]} />
        <meshStandardMaterial
          color={unlocked ? '#fff0fb' : '#6c607a'}
          emissive={unlocked ? '#ffd9f0' : '#6c607a'}
          emissiveIntensity={unlocked ? 0.65 : 0.08}
        />
      </mesh>
      {[-0.9, -0.3, 0.3, 0.9].map((x, index) => (
        <mesh key={index} position={[x, 2.8 + Math.abs(x) * 0.2, 0.18]}>
          <sphereGeometry args={[0.17, 12, 12]} />
          <meshStandardMaterial
            color={unlocked ? '#ffffff' : '#9587a8'}
            emissive={unlocked ? '#ffd7ec' : '#9587a8'}
            emissiveIntensity={unlocked ? 0.3 : 0.05}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.9, -0.5]} scale={[open ? 1.2 : 0.6, open ? 1.15 : 0.65, 1]}>
        <planeGeometry args={[2.15, 2.9]} />
        <meshStandardMaterial
          color={open ? '#fff7d3' : '#c7bbf0'}
          emissive={open ? '#fff4bf' : '#c7bbf0'}
          emissiveIntensity={open ? 1.3 : 0.12}
          transparent
          opacity={open ? 0.78 : 0.18}
        />
      </mesh>
      {unlocked
        ? [0.25, 0.7, 1.15, 1.57, 2.0, 2.45, 2.9].map((angle, index) => (
            <group
              key={`rose-${index}`}
              position={[Math.cos(angle) * 1.35, 3.45 + Math.sin(angle) * 1.35, 0.1]}
            >
              <mesh>
                <sphereGeometry args={[0.12, 10, 10]} />
                <meshStandardMaterial color="#fdfaff" emissive="#ffddee" emissiveIntensity={0.55} />
              </mesh>
              <mesh position={[0.08, -0.08, 0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="#4c7a52" roughness={0.9} />
              </mesh>
            </group>
          ))
        : null}
      <CompletionHalo active={unlocked} position={[0, 4.9, 0]} />
      <StationTitle position={[0, 5.55, 0]} title="White-Rose Arch" subtitle={unlocked ? 'The last letter waits here' : 'Still sleeping'} highlighted={highlighted} />
    </group>
  )
}

function InteractionBeacon({ station }: { station: StationId }) {
  const [x, y, z] = stationPositions[station]

  return (
    <Float position={[x, y + 4.6, z]} speed={1.5} floatIntensity={0.18}>
      <group>
        <RoundedBox args={[2.2, 0.62, 0.08]} radius={0.16} smoothness={4}>
          <meshStandardMaterial color="#121829" transparent opacity={0.9} />
        </RoundedBox>
        <Text fontSize={0.13} color="#fff6de" anchorX="center" anchorY="middle">
          Interact Here
        </Text>
      </group>
    </Float>
  )
}

function StationTitle({
  position,
  title,
  subtitle,
  highlighted,
}: {
  position: Vec3
  title: string
  subtitle: string
  highlighted: boolean
}) {
  const cullRef = useRef<THREE.Group>(null)
  const billboardRef = useRef<THREE.Group>(null)
  const worldPosition = useMemo(() => new THREE.Vector3(), [])

  // only show titles for nearby stations, and always turn them to face the
  // camera so the label is upright and readable from any approach angle
  useFrame(({ camera }) => {
    const group = cullRef.current

    if (group) {
      group.getWorldPosition(worldPosition)
      group.visible = worldPosition.distanceTo(camera.position) < 18
    }

    if (billboardRef.current) {
      billboardRef.current.quaternion.copy(camera.quaternion)
    }
  })

  return (
    <group ref={cullRef} position={position}>
      <group ref={billboardRef}>
        <Float speed={1.2} floatIntensity={0.14}>
          <Text
            fontSize={0.26}
            color={highlighted ? '#fff8d7' : '#f6ecff'}
            anchorX="center"
            outlineWidth={0.014}
            outlineColor="#0a0c18"
            outlineOpacity={0.9}
          >
            {title}
          </Text>
          <Text
            fontSize={0.12}
            position={[0, -0.34, 0]}
            color="#e4dcff"
            anchorX="center"
            outlineWidth={0.008}
            outlineColor="#0a0c18"
            outlineOpacity={0.85}
          >
            {subtitle}
          </Text>
        </Float>
      </group>
    </group>
  )
}

function LetterEnvelope({ position, visible }: { position: Vec3; visible: boolean }) {
  if (!visible) {
    return null
  }

  return (
    <Float position={position} speed={1.7} floatIntensity={0.3} rotationIntensity={0.25}>
      <group rotation={[-0.25, 0.35, 0.05]}>
        <mesh>
          <boxGeometry args={[0.54, 0.38, 0.03]} />
          <meshStandardMaterial color="#fdf6e9" emissive="#ffe9c9" emissiveIntensity={0.28} roughness={0.4} />
        </mesh>
        <mesh position={[-0.135, 0.1, 0.017]} rotation={[0, 0, -0.62]}>
          <boxGeometry args={[0.31, 0.014, 0.004]} />
          <meshStandardMaterial color="#dcc9a5" roughness={0.5} />
        </mesh>
        <mesh position={[0.135, 0.1, 0.017]} rotation={[0, 0, 0.62]}>
          <boxGeometry args={[0.31, 0.014, 0.004]} />
          <meshStandardMaterial color="#dcc9a5" roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.02, 0.02]}>
          <circleGeometry args={[0.07, 16]} />
          <meshStandardMaterial color="#a34a5f" emissive="#c25a72" emissiveIntensity={0.4} roughness={0.4} />
        </mesh>
        <LampGlow position={[0, 0, -0.02]} scale={1.1} color="#fff2d8" opacity={0.3} />
      </group>
    </Float>
  )
}

function CompletionHalo({ active, position }: { active: boolean; position: Vec3 }) {
  if (!active) {
    return null
  }

  return (
    <Float position={position} speed={1.5} floatIntensity={0.18}>
      <mesh>
        <torusGeometry args={[0.42, 0.08, 18, 40]} />
        <meshStandardMaterial color="#ffe58a" emissive="#ffe58a" emissiveIntensity={1.7} />
      </mesh>
    </Float>
  )
}

function LetterDisplay() {
  const paperTexture = useMemo(() => createPaperTexture(), [])
  const letterRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!letterRef.current) {
      return
    }

    letterRef.current.position.y = THREE.MathUtils.lerp(letterRef.current.position.y, 2.2, 0.05)
    letterRef.current.rotation.z = THREE.MathUtils.lerp(letterRef.current.rotation.z, 0, 0.04)
  })

  return (
    <group ref={letterRef} position={[0, 9.5, -43.6]} rotation={[0, 0, 0.18]}>
      <mesh position={[0, 0, -0.08]} scale={[1.25, 1.35, 1]}>
        <planeGeometry args={[4.8, 5.2]} />
        <meshStandardMaterial color="#fff5c5" emissive="#fff1b0" emissiveIntensity={0.85} transparent opacity={0.28} />
      </mesh>
      <RoundedBox args={[4.9, 5.4, 0.12]} radius={0.18} smoothness={4}>
        <meshStandardMaterial color="#fff8ee" map={paperTexture} roughness={0.22} />
      </RoundedBox>
      <Text
        position={[0, 0, 0.08]}
        fontSize={0.14}
        maxWidth={4.1}
        lineHeight={1.45}
        anchorX="center"
        color="#2d2340"
      >
        {finalLetter.join('\n\n')}
      </Text>
    </group>
  )
}

function Book({ position, scale }: { position: Vec3; scale: number }) {
  const coverTexture = useMemo(() => createWoodTexture('#d6b4f1', '#f4e8ff', '#fffefe'), [])
  const paperTexture = useMemo(() => createPaperTexture(), [])

  return (
    <group position={position} scale={scale}>
      <mesh>
        <boxGeometry args={[2.2, 0.22, 1.55]} />
        <meshStandardMaterial color="#f4edff" map={coverTexture} roughness={0.24} />
      </mesh>
      <mesh position={[-0.36, 0.12, 0]} rotation={[0, 0.16, 0]}>
        <boxGeometry args={[1.2, 0.16, 1.38]} />
        <meshStandardMaterial color="#ceb0ef" map={coverTexture} roughness={0.24} />
      </mesh>
      <mesh position={[0.56, 0.14, 0]} rotation={[0.05, -0.18, 0]}>
        <boxGeometry args={[1.02, 0.1, 1.26]} />
        <meshStandardMaterial color="#fff8ef" map={paperTexture} roughness={0.16} />
      </mesh>
    </group>
  )
}

function DrivingVan({ progress }: { progress: number }) {
  const url = MODEL_BASE + 'van.glb'
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const wheelsRef = useRef<THREE.Object3D[]>([])
  const groupRef = useRef<THREE.Group>(null)
  const animRef = useRef(0)
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.4, 0.14, 3),
        new THREE.Vector3(-0.4, 0.14, 1.5),
        new THREE.Vector3(0.45, 0.14, 0),
        new THREE.Vector3(-0.35, 0.14, -1.5),
        new THREE.Vector3(0.2, 0.14, -2.9),
      ]),
    [],
  )

  useEffect(() => {
    applyNightTint(scene, url, modelTints.car)
    wheelsRef.current = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']
      .map((name) => cloned.getObjectByName(name))
      .filter((node): node is THREE.Object3D => Boolean(node))
  }, [scene, url, cloned])

  useFrame((_, delta) => {
    const group = groupRef.current

    if (!group) {
      return
    }

    const target = clamp(progress / 4, 0, 1)
    animRef.current = THREE.MathUtils.damp(animRef.current, target, 2.2, delta)
    const t = clamp(animRef.current, 0.001, 0.999)
    const point = curve.getPoint(t)
    const tangent = curve.getTangent(t)
    group.position.set(point.x, point.y + getBaseOffset(scene, url) * 0.45, point.z)
    group.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI

    if (Math.abs(target - animRef.current) > 0.004) {
      wheelsRef.current.forEach((wheel) => {
        wheel.rotation.x += delta * 10
      })
    }
  })

  return (
    <group ref={groupRef} position={[0.4, 0.14, 3]}>
      <primitive object={cloned} scale={0.45} />
    </group>
  )
}

function StaticTinyCar() {
  return (
    <group position={[0.38, 0.14, 2.75]} rotation={[0, 0.42, 0]}>
      <TinyCar />
    </group>
  )
}

function TinyCar() {
  return (
    <group>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.95, 0.22, 0.52]} />
        <meshStandardMaterial color="#69c6ff" roughness={0.22} metalness={0.32} />
      </mesh>
      <mesh position={[0.06, 0.28, 0]}>
        <boxGeometry args={[0.48, 0.2, 0.44]} />
        <meshStandardMaterial color="#daf4ff" roughness={0.15} metalness={0.18} />
      </mesh>
      {[-0.16, 0.16].map((z) => (
        <mesh key={`headlight-${z}`} position={[0.49, 0.12, z]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#fff6c8" emissive="#ffedb0" emissiveIntensity={1.6} />
        </mesh>
      ))}
      {[-0.3, 0.3].flatMap((x) =>
        [-0.26, 0.26].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, -0.08, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.08, 18]} />
            <meshStandardMaterial color="#0b1020" roughness={0.95} />
          </mesh>
        )),
      )}
    </group>
  )
}

function VirtualJoystick({
  disabled,
  onChange,
}: {
  disabled: boolean
  onChange: (value: MovementInput) => void
}) {
  const radius = 42
  const pointerIdRef = useRef<number | null>(null)
  const centerRef = useRef({ x: 0, y: 0 })
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const updateKnob = (x: number, y: number) => {
    const distance = Math.hypot(x, y)
    const limited = distance > radius ? radius / distance : 1
    const nextX = x * limited
    const nextY = y * limited
    setKnob({ x: nextX, y: nextY })
    onChange({ x: nextX / radius, y: -(nextY / radius) })
  }

  const reset = () => {
    pointerIdRef.current = null
    setKnob({ x: 0, y: 0 })
    onChange({ x: 0, y: 0 })
  }

  return (
    <div
      className={`control-pad joystick-pad${disabled ? ' disabled' : ''}`}
      onPointerDown={(event) => {
        if (disabled) return
        pointerIdRef.current = event.pointerId
        centerRef.current = { x: event.clientX - knob.x, y: event.clientY - knob.y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (disabled || pointerIdRef.current !== event.pointerId) return
        updateKnob(event.clientX - centerRef.current.x, event.clientY - centerRef.current.y)
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <span className="control-label">Walk</span>
      <span className="control-ring" />
      <span
        className="control-knob"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  )
}

function FreeLookSurface({
  disabled,
  onLook,
  onTap,
}: {
  disabled: boolean
  onLook: (value: LookInput) => void
  onTap: (x: number, y: number) => void
}) {
  const pointerIdRef = useRef<number | null>(null)
  const lastRef = useRef({ x: 0, y: 0 })
  const gestureRef = useRef({ startTime: 0, travelled: 0 })
  const [active, setActive] = useState(false)

  const reset = () => {
    pointerIdRef.current = null
    setActive(false)
  }

  return (
    <div
      className={`look-surface${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onPointerDown={(event) => {
        if (disabled) return
        pointerIdRef.current = event.pointerId
        lastRef.current = { x: event.clientX, y: event.clientY }
        gestureRef.current = { startTime: performance.now(), travelled: 0 }
        setActive(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (disabled || pointerIdRef.current !== event.pointerId) return
        const dx = event.clientX - lastRef.current.x
        const dy = event.clientY - lastRef.current.y
        gestureRef.current.travelled += Math.abs(dx) + Math.abs(dy)
        onLook({ dx, dy })
        lastRef.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        if (
          !disabled &&
          pointerIdRef.current === event.pointerId &&
          gestureRef.current.travelled < 12 &&
          performance.now() - gestureRef.current.startTime < 420
        ) {
          onTap(event.clientX, event.clientY)
        }
        reset()
      }}
      onPointerCancel={reset}
    />
  )
}

export default SceneCanvas
