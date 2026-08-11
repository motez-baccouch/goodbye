import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Clone, Float, Line, RoundedBox, Sparkles, Stars, Text, useGLTF, useTexture } from '@react-three/drei'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { haptic, playFootstep, playTone, unlockAudio } from './audioEngine'
import { isMusicMuted, notifyFinale, setMusicMuted, startMusic } from './ambientMusic'
import { chapters, finalLetter } from './experienceData'
import { SparkBurst, StationMiniGame } from './MiniGames'

type StationId = 'gate' | 'archive' | 'lanterns' | 'path' | 'reading' | 'final'
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
}

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
const gateHedgeWalls: WallBox[] = [
  { x: -12, z: 6, w: 18.6, d: 1.4 },
  { x: 12, z: 6, w: 18.6, d: 1.4 },
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

function createGrassTexture() {
  const canvas = createTextureCanvas(1024, 1024)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#20402a')
  gradient.addColorStop(0.55, '#16301f')
  gradient.addColorStop(1, '#254a31')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  // soft moonlight pools
  for (let index = 0; index < 7; index += 1) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 120 + Math.random() * 190
    const pool = context.createRadialGradient(x, y, 0, x, y, radius)
    pool.addColorStop(0, 'rgba(190, 214, 235, 0.11)')
    pool.addColorStop(1, 'rgba(190, 214, 235, 0)')
    context.fillStyle = pool
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  // dark mottling for depth
  for (let index = 0; index < 10; index += 1) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 90 + Math.random() * 160
    const shade = context.createRadialGradient(x, y, 0, x, y, radius)
    shade.addColorStop(0, 'rgba(6, 14, 10, 0.16)')
    shade.addColorStop(1, 'rgba(6, 14, 10, 0)')
    context.fillStyle = shade
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  // grass blades
  for (let index = 0; index < 3600; index += 1) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const length = 5 + Math.random() * 14
    const shade = index % 9 === 0 ? '#7fae74' : index % 4 === 0 ? '#3f6b46' : '#2a4c32'
    context.strokeStyle = shade
    context.globalAlpha = 0.1 + Math.random() * 0.14
    context.lineWidth = 1 + Math.random()
    context.beginPath()
    context.moveTo(x, y)
    context.quadraticCurveTo(x + (Math.random() - 0.5) * 6, y - length * 0.6, x + (Math.random() - 0.5) * 9, y - length)
    context.stroke()
  }

  // tiny baked micro-flowers and dew glints
  for (let index = 0; index < 130; index += 1) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    context.fillStyle = index % 3 === 0 ? '#f4e9ff' : index % 3 === 1 ? '#ffdff0' : '#fdfbe8'
    context.globalAlpha = 0.25 + Math.random() * 0.3
    context.beginPath()
    context.arc(x, y, 1 + Math.random() * 1.6, 0, Math.PI * 2)
    context.fill()
  }

  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(6, 6)
  texture.anisotropy = 8
  return texture
}

function drawStone(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  fill: string,
) {
  context.save()
  context.translate(x, y)
  context.rotate(rotation)
  context.fillStyle = fill
  context.beginPath()
  context.roundRect(-width / 2, -height / 2, width, height, Math.min(width, height) * 0.4)
  context.fill()
  // top-light bevel
  context.fillStyle = 'rgba(255, 255, 255, 0.09)'
  context.beginPath()
  context.roundRect(-width / 2, -height / 2, width, height * 0.4, Math.min(width, height) * 0.4)
  context.fill()
  context.restore()
}

const stonePalette = ['#8f92ac', '#9a94b4', '#83879f', '#a09cb8', '#8b8ea6']

function createCobbleTexture() {
  const canvas = createTextureCanvas(1024, 1024)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  // grout
  context.fillStyle = '#3c3f55'
  context.fillRect(0, 0, canvas.width, canvas.height)

  // concentric rings of cobblestones around the canvas centre
  const cx = canvas.width / 2
  const cy = canvas.height / 2

  for (let ring = 1; ring <= 11; ring += 1) {
    const radius = ring * 46
    const count = Math.max(6, Math.round(ring * 7.2))

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + ring * 0.35
      const x = cx + Math.cos(angle) * radius
      const y = cy + Math.sin(angle) * radius
      const size = 30 + Math.random() * 12
      drawStone(
        context,
        x,
        y,
        size * 1.25,
        size * 0.85,
        angle + Math.PI / 2,
        stonePalette[(ring + index) % stonePalette.length],
      )
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function createFlagstoneTexture() {
  const canvas = createTextureCanvas(1024, 1024)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  context.fillStyle = '#3a3d52'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const cols = 7
  const rows = 9

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = ((col + 0.5 + (row % 2 ? 0.35 : 0)) / cols) * canvas.width
      const y = ((row + 0.5) / rows) * canvas.height
      const width = (canvas.width / cols) * (0.82 + Math.random() * 0.14)
      const height = (canvas.height / rows) * (0.78 + Math.random() * 0.16)
      drawStone(context, x, y, width, height, (Math.random() - 0.5) * 0.1, stonePalette[(row * cols + col) % stonePalette.length])
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function createSteppingPathTexture() {
  const canvas = createTextureCanvas(256, 512)
  const context = canvas.getContext('2d')

  if (!context) {
    return new THREE.Texture()
  }

  context.fillStyle = '#42465e'
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (let index = 0; index < 4; index += 1) {
    const y = ((index + 0.5) / 4) * canvas.height
    const x = canvas.width / 2 + (index % 2 ? 16 : -16)
    drawStone(context, x, y, 176 + Math.random() * 30, 96, (Math.random() - 0.5) * 0.16, stonePalette[index % stonePalette.length])
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
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
  'tableRound.glb',
  'food/cup-tea.glb',
  'food/plate.glb',
  'food/croissant.glb',
  'food/cookie.glb',
  'town/fence-gate.glb',
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

function getNearbyInteractable(player: PlayerSample): Interactable | null {
  const order: Array<{ id: StationId; radius: number }> = [
    { id: 'gate', radius: 3 },
    { id: 'archive', radius: 3.4 },
    { id: 'lanterns', radius: 3.4 },
    { id: 'path', radius: 3.4 },
    { id: 'reading', radius: 3.4 },
    { id: 'final', radius: 3.6 },
  ]

  let nearest: Interactable | null = null

  order.forEach(({ id, radius }) => {
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

function SceneCanvas() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const showFps = useMemo(() => new URLSearchParams(window.location.search).has('fps'), [])
  const forceFireworks = useMemo(() => new URLSearchParams(window.location.search).has('fw'), [])
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>(() => getDeviceProfile())
  const [overlayMode, setOverlayMode] = useState<'intro' | 'help' | 'journal' | 'map' | null>('intro')
  const [menuOpen, setMenuOpen] = useState(false)
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
  const interactable = useMemo(() => getNearbyInteractable(playerSample), [playerSample])
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
  }, [gateOpen, archiveOpened, lanternsLit, pathCollected, pagesTurned, playerSample])

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

  const controlsBlocked =
    Boolean(overlayMode) ||
    Boolean(memoryReveal) ||
    Boolean(activeMiniGame) ||
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
      ? getInteractLabel(
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
        camera={{ position: [0, 1.6, 9], fov: deviceProfile.mobile ? 72 : 66, near: 0.35, far: 110 }}
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
        <fog attach="fog" args={[epilogue ? '#1d1226' : '#09101d', 14, 64]} />
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
        <Comet nonce={cometNonce} />
        <Fireworks active={forceFireworks || (finalOpen && !letterVisible && !creditsVisible && !epilogue)} />
        <FranceConstellation visible={finalOpen} />
        <SecretHitbox secret="boss" position={[0, 1.9, -46]} radius={1.9} />
        <SecretHitbox secret="cart" position={[6.8, 0.7, 3.2]} radius={1.1} />
        <SecretMarker position={[-12.2, 1.15, -3.9]} found={secretsFound.includes('teddy')} />
        <SecretMarker position={[9, 1.55, -32.45]} found={secretsFound.includes('book')} />
        <SecretMarker position={[0, 2.7, -46]} found={secretsFound.includes('boss')} />
        <SecretMarker position={[6.8, 1.2, 3.2]} found={secretsFound.includes('cart')} />
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
        <TapRaycaster nonce={tapNonce} pointRef={tapPointRef} onHit={handleSecretTap} />
        <GardenGate open={gateOpen} highlighted={interactable?.id === 'gate'} />
        <RoseCabinet progress={archiveCount} complete={archiveOpened.every(Boolean)} highlighted={interactable?.id === 'archive'} />
        <LanternGrove progress={lanternCount} complete={lanternsLit.every(Boolean)} highlighted={interactable?.id === 'lanterns'} />
        <StarlitPath progress={pathCount} complete={pathCollected.every(Boolean)} highlighted={interactable?.id === 'path'} />
        <ReadingNook progress={readingCount} complete={pagesTurned.every(Boolean)} highlighted={interactable?.id === 'reading'} />
        <FinalArch open={finalOpen} unlocked={finalUnlocked} highlighted={interactable?.id === 'final'} />
        {finalOpen ? <LetterDisplay /> : null}
        {interactable ? <InteractionBeacon station={interactable.id} /> : null}
      </Canvas>

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
                  playTone('map')
                  setOverlayMode('map')
                  setMenuOpen(false)
                }}
              >
                <span className="menu-icon">🗺️</span> Map
              </button>
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

      {!controlsBlocked && gateOpen && !finalOpen ? (
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
            disabled={!interactable && !nearbySeat && !seat}
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
              <svg className="garden-map-full" viewBox="0 0 220 320" role="img" aria-label="Garden map">
                <rect x="4" y="4" width="212" height="312" rx="14" fill="#14241a" stroke="#3d5c46" strokeWidth="2" />
                <line x1="110" y1="30" x2="110" y2="120" stroke="#8d92b4" strokeWidth="5" strokeLinecap="round" />
                <line x1="55" y1="70" x2="165" y2="70" stroke="#8d92b4" strokeWidth="4" strokeLinecap="round" />
                <line x1="110" y1="190" x2="110" y2="270" stroke="#8d92b4" strokeWidth="5" strokeLinecap="round" />
                <line x1="110" y1="212" x2="65" y2="225" stroke="#8d92b4" strokeWidth="4" strokeLinecap="round" />
                <line x1="110" y1="212" x2="155" y2="225" stroke="#8d92b4" strokeWidth="4" strokeLinecap="round" />
                <line x1="14" y1="30" x2="97" y2="30" stroke="#2c523a" strokeWidth="6" strokeLinecap="round" />
                <line x1="123" y1="30" x2="206" y2="30" stroke="#2c523a" strokeWidth="6" strokeLinecap="round" />
                <circle cx="110" cy="70" r="32" fill="#232c4b" stroke="#8d92b4" strokeWidth="2" />
                <circle cx="110" cy="70" r="5" fill="#e8d9b8" />
                <rect x="50" y="110" width="120" height="80" rx="6" fill="none" stroke="#3d5c46" strokeWidth="5" />
                <rect x="70" y="125" width="80" height="50" rx="5" fill="none" stroke="#3d5c46" strokeWidth="4" />
                <rect x="90" y="138" width="40" height="24" rx="4" fill="none" stroke="#3d5c46" strokeWidth="3" />
                <circle cx="110" cy="150" r="4.5" fill="#f9b9d8" />
                <rect x="104" y="106" width="12" height="8" fill="#14241a" />
                <rect x="104" y="186" width="12" height="8" fill="#14241a" />
                <circle cx="55" cy="70" r="7" fill={archiveOpened.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="55" y="90" textAnchor="middle" className="map-label">Cabinet</text>
                <circle cx="165" cy="70" r="7" fill={lanternsLit.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="165" y="90" textAnchor="middle" className="map-label">Lanterns</text>
                <circle cx="65" cy="225" r="7" fill={pathCollected.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="65" y="245" textAnchor="middle" className="map-label">Drive</text>
                <circle cx="155" cy="225" r="7" fill={pagesTurned.every(Boolean) ? '#ffd56f' : '#c9b3ff'} />
                <text x="155" y="245" textAnchor="middle" className="map-label">Bench</text>
                <circle cx="110" cy="270" r="7" fill={finalUnlocked ? '#ffd56f' : '#8d92b4'} />
                <text x="110" y="290" textAnchor="middle" className="map-label">The Arch</text>
                <text x="110" y="22" textAnchor="middle" className="map-label">Moon Gate</text>
                <circle
                  cx={clamp(playerSample.x * 5 + 110, 8, 212)}
                  cy={clamp((12 - playerSample.z) * 5, 8, 312)}
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
                <div className="envelope-shell">
                  <button type="button" className="envelope-card envelope-trigger" onClick={openIntroLetter}>
                    <div className="envelope-flap" />
                    <div className="wax-seal" />
                  </button>
                  <div className="intro-letter" onClick={openIntroLetter} role="button" tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openIntroLetter()
                      }
                    }}
                  >
                    <p className="overlay-kicker">For Nour</p>
                    <h1>The Light She Left Behind</h1>
                    <p className="intro-script">
                      Un jardin de souvenirs, de lettres anciennes, et d'un peu de lumiere.
                    </p>
                    <p>
                      Collect every keepsake. The last letter will arrive from the sky.
                    </p>
                    <p className="intro-sound-hint">Best with sound on.</p>
                  </div>
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
                <h1>The Light She Left Behind</h1>
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
            <p className="credits-line credits-script" style={{ animationDelay: '8s' }}>
              From Hassen &amp; me, always.
            </p>
            <p className="credits-line credits-carlos" style={{ animationDelay: '9.4s' }}>go carlos ✦</p>
            <button
              type="button"
              className="credits-return"
              style={{ animationDelay: '11s' }}
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
  onSample,
}: {
  movementRef: React.MutableRefObject<MovementInput>
  lookRef: React.MutableRefObject<LookInput>
  resetNonce: number
  gateOpen: boolean
  inputBlocked: boolean
  seat: BenchSeat | null
  onSample: (sample: PlayerSample) => void
}) {
  const { camera, clock } = useThree()
  const positionRef = useRef(new THREE.Vector3(0, 1.55, 9))
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.03)
  const sampleTimeRef = useRef(0)
  const strideRef = useRef(0)
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

  useFrame((_, delta) => {
    if (!inputBlocked) {
      yawRef.current += lookRef.current.dx * 0.0032
      pitchRef.current = clamp(pitchRef.current - lookRef.current.dy * 0.0022, -0.55, 0.32)
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

    positionRef.current.x = clamp(positionRef.current.x, -20.5, 20.5)
    positionRef.current.z = clamp(positionRef.current.z, -50.5, 10.5)

    if (!gateOpen && positionRef.current.z < 7 && Math.abs(positionRef.current.x) < 2.6) {
      positionRef.current.z = 7
    }

    // keep the player from walking through the tea table and the back monument
    const colliders = [
      { x: 0, z: -2, radius: 1.2 },
      { x: 0, z: -46, radius: 1.35 },
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

    camera.position.copy(positionRef.current)
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

function configureGrassTexture(texture: THREE.Texture | THREE.Texture[]) {
  const textures = Array.isArray(texture) ? texture : [texture]
  textures.forEach((entry) => {
    entry.colorSpace = THREE.SRGBColorSpace
    entry.wrapS = THREE.RepeatWrapping
    entry.wrapT = THREE.RepeatWrapping
    entry.anisotropy = 8
    entry.needsUpdate = true
  })
}

function GroundPlane() {
  const grassMap = useTexture('/assets/textures/grass.jpg', configureGrassTexture)
  const cobbleMap = useTexture('/assets/textures/cobblestone.jpg', configureGrassTexture)
  const grass = useMemo(() => {
    const cloned = grassMap.clone()
    cloned.repeat.set(9, 13)
    cloned.needsUpdate = true
    return cloned
  }, [grassMap])
  const cobble = useMemo(() => {
    const cloned = cobbleMap.clone()
    cloned.repeat.set(5, 5)
    cloned.needsUpdate = true
    return cloned
  }, [cobbleMap])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
        <planeGeometry args={[44, 64]} />
        {/* base ground pushed back in depth so every decal above it wins cleanly */}
        <meshStandardMaterial
          color="#7e94a4"
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
  const grassTexture = useMemo(() => createGrassTexture(), [])
  const cobbleTexture = useMemo(() => createCobbleTexture(), [])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
        <planeGeometry args={[44, 64]} />
        <meshStandardMaterial
          color="#c2cdbf"
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
  const blossomColors = ['#f9b9d8', '#ffcbe2', '#f3a5cd', '#ffd9ea']

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
        { position: [0, 2.85, 0] as Vec3, radius: 0.85 },
        { position: [0.75, 2.5, 0.25] as Vec3, radius: 0.6 },
        { position: [-0.7, 2.6, -0.25] as Vec3, radius: 0.62 },
        { position: [0.3, 3.25, -0.35] as Vec3, radius: 0.5 },
        { position: [-0.3, 3.2, 0.4] as Vec3, radius: 0.52 },
      ].map((cluster, index) => (
        <mesh key={index} position={cluster.position}>
          <sphereGeometry args={[cluster.radius, 16, 16]} />
          <meshStandardMaterial
            color={blossomColors[index % blossomColors.length]}
            emissive="#ff9ecb"
            emissiveIntensity={0.24}
            roughness={0.85}
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
        <Sway key={index} seed={index * 1.3} strength={0.08}>
          <FlowerCluster
            position={[flower.x, 0, flower.z]}
            scale={flower.scale}
            palette={flower.hue}
          />
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
    <mesh position={midpoint} rotation={[-Math.PI / 2, 0, angle]}>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial
        color="#d3d6e8"
        map={texture}
        roughness={0.94}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

function configureMoonTexture(texture: THREE.Texture | THREE.Texture[]) {
  const single = Array.isArray(texture) ? texture[0] : texture
  single.colorSpace = THREE.SRGBColorSpace
  single.anisotropy = 4
  single.needsUpdate = true
}

function MoonRig() {
  const moonTexture = useTexture('/assets/textures/moon.jpg', configureMoonTexture)
  const glowTexture = useMemo(() => createGlowTexture(), [])
  const moonRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (moonRef.current) {
      moonRef.current.rotation.y += delta * 0.008
    }
  })

  return (
    <group position={[9, 15.5, -58]} userData={{ secret: 'moon' }}>
      <mesh ref={moonRef} rotation={[0.35, 2.2, 0.12]}>
        <sphereGeometry args={[5.6, 48, 48]} />
        <meshStandardMaterial
          map={moonTexture}
          emissiveMap={moonTexture}
          emissive="#fef7e2"
          emissiveIntensity={1.18}
          color="#10131f"
          roughness={1}
          fog={false}
        />
      </mesh>
      <sprite scale={[16, 16, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#fff3cd"
          transparent
          opacity={0.72}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      <sprite scale={[32, 32, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#cdd8ff"
          transparent
          opacity={0.26}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
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

// A soft, gently-pulsing sparkle that hints "this is tappable" — it fades away
// once the secret has been discovered.
function SecretMarker({ position, found }: { position: Vec3; found: boolean }) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const glowTexture = useMemo(() => createGlowTexture(), [])

  useFrame(({ clock }) => {
    const sprite = spriteRef.current

    if (sprite) {
      const material = sprite.material as THREE.SpriteMaterial
      material.opacity = found ? 0 : 0.22 + Math.sin(clock.elapsedTime * 2.3) * 0.16
      const scale = 0.75 + Math.sin(clock.elapsedTime * 2.3) * 0.12
      sprite.scale.set(scale, scale, 1)
    }
  })

  return (
    <group position={position} visible={!found}>
      <sprite ref={spriteRef}>
        <spriteMaterial
          map={glowTexture}
          color="#ffe9a8"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      {!found ? <Sparkles count={5} scale={[0.5, 0.7, 0.5]} size={1.3} speed={0.3} color="#fff0bd" /> : null}
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
}: {
  children: React.ReactNode
  seed: number
  strength?: number
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

  return <group ref={groupRef}>{children}</group>
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

function GardenModels() {
  return (
    <group>
      {/* tea for two at the plaza centre */}
      <TeaCorner />

      {/* the moon-ring monument watches from behind the white-rose arch */}
      <SafeModel file="statue_block.glb" position={[0, 0, -46]} scale={3} tint="stone" />
      <SafeModel file="statue_ring.glb" position={[0, 1.2, -46]} scale={2.5} tint="stone" />

      {/* flower ring around the plaza */}
      {plazaFlowerRing.map((flower, index) => (
        <Sway key={`plaza-flower-${index}`} seed={index * 1.7} strength={0.06}>
          <SafeModel
            file={flower.file}
            position={[Math.cos(flower.angle) * 5.4, 0, -2 + Math.sin(flower.angle) * 5.4]}
            scale={1.5}
            rotationY={flower.angle * 2}
            tint="flower"
          />
        </Sway>
      ))}

      {/* flowers along the walks */}
      {pathsideFlowers.map((flower, index) => (
        <Sway key={`path-flower-${index}`} seed={index * 2.3 + 9} strength={0.07}>
          <SafeModel file={flower.file} position={flower.position} scale={1.45} rotationY={index * 1.9} tint="flower" />
        </Sway>
      ))}

      {/* grass tufts that lean with the wind */}
      {grassTufts.map((tuft, index) => (
        <Sway key={`tuft-${index}`} seed={index * 3.1 + 20} strength={0.12}>
          <SafeModel file="grass_leafs.glb" position={tuft.position} scale={tuft.scale} rotationY={index * 2.4} />
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
      <Sway seed={31} strength={0.05}>
        <SafeModel file="flower_purpleA.glb" position={[6.6, 0.62, 3.1]} scale={1} tint="flower" />
      </Sway>
      <Sway seed={32} strength={0.05}>
        <SafeModel file="flower_yellowA.glb" position={[7.1, 0.62, 3.4]} scale={0.95} tint="flower" />
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
}: {
  nonce: number
  pointRef: React.MutableRefObject<{ x: number; y: number } | null>
  onHit: (secret: SecretId) => void
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
      if (object.userData.secret) {
        targets.push(object)
      }
    })

    const hits = raycaster.intersectObjects(targets, true)

    if (hits.length === 0) {
      return
    }

    let object: THREE.Object3D | null = hits[0].object

    while (object) {
      if (object.userData.secret) {
        onHit(object.userData.secret as SecretId)
        return
      }

      object = object.parent
    }
  }, [nonce, camera, scene, gl, pointRef, onHit])

  return null
}

const perimeterHedges: Vec3[] = (() => {
  const spots: Vec3[] = []

  for (let z = -50; z <= 10; z += 4) {
    spots.push([-21, 0.55, z], [21, 0.55, z])
  }

  for (let x = -20; x <= 20; x += 4) {
    spots.push([x, 0.55, 11], [x, 0.55, -51])
  }

  return spots
})()

function PerimeterHedges() {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const dummy = new THREE.Object3D()
    perimeterHedges.forEach((position, index) => {
      dummy.position.set(position[0], position[1], position[2])
      dummy.scale.setScalar(0.9 + pseudoRandom(index * 2 + 5) * 0.35)
      dummy.rotation.y = pseudoRandom(index * 3 + 1) * Math.PI
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, perimeterHedges.length]}
      castShadow={false}
      frustumCulled={false}
    >
      <sphereGeometry args={[1.6, 12, 12]} />
      <meshStandardMaterial color="#1f3427" roughness={0.95} />
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
      <PerimeterHedges />
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
        <group key={index} position={[x, 0, index % 2 === 0 ? -0.12 : 0.12]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.02, 0.03, 0.36, 8]} />
            <meshStandardMaterial color="#5f9d72" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.39, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={petalColor} emissive={glowColor} emissiveIntensity={0.5} roughness={0.52} />
          </mesh>
          <mesh position={[0, 0.39, 0]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshStandardMaterial color="#fff2a6" emissive="#fff2a6" emissiveIntensity={1.1} />
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

function GateModel({ open }: { open: boolean }) {
  const url = MODEL_BASE + 'town/fence-gate.glb'
  const { scene } = useGLTF(url)
  const leftHalf = useMemo(() => scene.clone(true), [scene])
  const rightHalf = useMemo(() => scene.clone(true), [scene])
  const gatesRef = useRef<THREE.Object3D[]>([])
  const lift = useMemo(() => getBaseOffset(scene, url) * 2.6, [scene, url])

  useEffect(() => {
    applyNightTint(scene, url, modelTints.nature)
    gatesRef.current = [leftHalf.getObjectByName('gate'), rightHalf.getObjectByName('gate')].filter(
      (node): node is THREE.Object3D => Boolean(node),
    )
  }, [scene, url, leftHalf, rightHalf])

  useFrame(() => {
    gatesRef.current.forEach((gate) => {
      gate.rotation.y = THREE.MathUtils.lerp(gate.rotation.y, open ? -1.5 : 0, 0.055)
    })
  })

  // two mirrored halves make a symmetric double door meeting at the centre
  return (
    <group>
      <primitive object={leftHalf} position={[-2.6, lift, 0]} scale={2.6} />
      <group position={[2.6, lift, 0]} scale={[-2.6, 2.6, 2.6]}>
        <primitive object={rightHalf} />
      </group>
    </group>
  )
}

function ProceduralGateDoors({ open }: { open: boolean }) {
  const leftRef = useRef<THREE.Group>(null)
  const rightRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (leftRef.current) {
      leftRef.current.rotation.y = THREE.MathUtils.lerp(leftRef.current.rotation.y, open ? 1.5 : 0, 0.06)
    }
    if (rightRef.current) {
      rightRef.current.rotation.y = THREE.MathUtils.lerp(rightRef.current.rotation.y, open ? -1.5 : 0, 0.06)
    }
  })

  return (
    <group>
      <group ref={leftRef} position={[-1.25, 0, 0]}>
        <mesh position={[0.62, 1.05, 0]}>
          <boxGeometry args={[1.25, 2.1, 0.14]} />
          <meshStandardMaterial color="#9a7f63" roughness={0.7} />
        </mesh>
      </group>
      <group ref={rightRef} position={[1.25, 0, 0]}>
        <mesh position={[-0.62, 1.05, 0]}>
          <boxGeometry args={[1.25, 2.1, 0.14]} />
          <meshStandardMaterial color="#9a7f63" roughness={0.7} />
        </mesh>
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
      <ModelBoundary fallback={<ProceduralGateDoors open={open} />}>
        <Suspense fallback={<ProceduralGateDoors open={open} />}>
          <GateModel open={open} />
        </Suspense>
      </ModelBoundary>
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
  const worldPosition = useMemo(() => new THREE.Vector3(), [])

  // only show titles for nearby stations so the skyline stays uncluttered
  useFrame(({ camera }) => {
    const group = cullRef.current

    if (group) {
      group.getWorldPosition(worldPosition)
      group.visible = worldPosition.distanceTo(camera.position) < 17
    }
  })

  return (
    <group ref={cullRef} position={position}>
      <Float speed={1.2} floatIntensity={0.14}>
        <group>
          <Text fontSize={0.24} color={highlighted ? '#fff8d7' : '#f6ecff'} anchorX="center">
            {title}
          </Text>
          <Text fontSize={0.11} position={[0, -0.32, 0]} color="#d8cef6" anchorX="center">
            {subtitle}
          </Text>
        </group>
      </Float>
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
