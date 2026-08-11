# Asset Credits

- **Moon surface texture** — `public/assets/textures/moon.jpg`, from the
  [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets)
  (MIT license), derived from NASA public-domain lunar photography.
- **Ground textures** — `public/assets/textures/`: grass from
  [ambientCG Grass004](https://ambientcg.com/view?id=Grass004) (CC0) and cobblestone from
  [Poly Haven cobblestone_floor_08](https://polyhaven.com/a/cobblestone_floor_08) (CC0).
- **3D models (GLB)** — `public/assets/models/`, all Creative Commons CC0 from Kenney:
  [Nature Kit](https://kenney.nl/assets/nature-kit) (trees, flowers, rocks, mushrooms,
  statues, pots, stump), [Car Kit](https://kenney.nl/assets/car-kit) (van),
  [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) (garden gate),
  [Graveyard Kit](https://kenney.nl/assets/graveyard-kit) (lamp posts),
  [Furniture Kit](https://kenney.nl/assets/furniture-kit) (drawer chests, benches,
  bookcase, books, floor lamp, tea table), and
  [Food Kit](https://kenney.nl/assets/food-kit) (teacups, plate, croissant, cookie).
- **Music** — `public/assets/audio/music/`:
  - *Clair de Lune* (Claude Debussy) — public-domain recording via
    [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Clair_de_Lune_by_Claude_Debussy_(1905,_piano_solo).opus)
    (Public Domain Mark 1.0).
  - *Nocturne Op. 9 No. 2* (Frédéric Chopin) — performed by **Martha Goldstein**, via
    [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Frederic_Chopin_-_Nocturne_Eb_major_Opus_9,_number_2.ogg)
    (CC-BY-SA 2.0, Pandora Records/Al Goldstein archive). Attribution required — kept here.
- **UI sound effects** — `public/assets/audio/kenney/`, from the
  [Kenney UI Audio pack](https://kenney.nl/assets/ui-audio) (CC0). See the bundled `License.txt`.
- **Fallback ambient music** — if the recordings cannot play, a small lullaby is generated at
  runtime with the Web Audio API (`src/ambientMusic.ts`), no external assets.
- **Fonts** — Cormorant Garamond, Inter, and Parisienne via Google Fonts (Open Font License).
- **Remaining 3D props** (teddy, gate, cabinet, arch, lanterns, book, padel ball) — built
  procedurally in code (`src/SceneCanvas.tsx`).
