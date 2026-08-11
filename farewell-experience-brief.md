# Nour Farewell Experience Brief

## Goal

Create a mobile-first interactive farewell website for Nour that opens from a QR code and feels magical, premium, playful, and deeply heartfelt.

The experience should:

- feel professionally designed, not gimmicky
- be emotional without reading like a direct love letter
- include inside jokes, shared work memories, and soft magical symbolism
- last around 8 to 12 minutes through multiple small scenes
- work well on mobile with mostly tap interactions

## Core Emotional Direction

Nour should feel like:

- a source of light
- a white rose
- a star
- soft, elegant, playful, bookish, and memorable

Target emotional arc:

1. curiosity
2. delight
3. laughter from inside jokes
4. warmth and nostalgia
5. emotional landing with the final letter

## Personal Inputs From User

### Identity

- Name: Nour
- Nickname used by user: Noura

### Final Message Intent

The final message should communicate:

- happiness and gratitude for getting to work with someone as cheerful and talented as Nour
- wishing her nothing but the best
- that there will never be a better colleague
- encouragement to "break a leg in France"
- a nod to the inside joke: "go carlos"

### Tone Constraints

- deeply heartfelt
- not full love-letter mode
- elegant and magical
- funny in parts
- emotionally strong by the ending

### Personal Symbols

- white roses
- stars
- moon
- soft light
- flowers
- books

### Media Constraints

- no real photos
- no recorded voice needed

## Inside Jokes And Memory Bank

These should be spread across scenes as hidden notes, dialogue fragments, collectible memories, or interactive props.

- "go carlos"
- Carole trying to learn HTML 5 months into the job
- Wael pretending to do PR review and always having a flood, food poisoning, or terrible weather
- Ali looking like Jesus
- Michal being the best man for everything
- "coupe do monde" pronounced that way
- Bitbox social games and the user beating everyone
- Izzy from GoCardless / "go carlos"
- Mohamed inviting everyone to padel and the user being terrible at padel because the ball runs away
- Nour not finishing the same book for 6 months

## Proposed Experience Structure

Working title:

- The Light She Left Behind

Alternate titles:

- Noura and the Little Constellations
- The White Rose Archive
- A Small Journey For Nour

## Experience Flow

### Scene 1: Arrival

A magical object floats in a dark dreamy sky:

- a glowing storybook
- a rose-shaped memory box
- or a teddy carrying a little folder

User action:

- tap to wake the world
- particles, stars, and soft music begin
- a short intro line appears

Suggested intro line:

"Some people pass through work. Some leave light behind."

### Scene 2: The Memory Box

The main object opens into small interactive compartments.

Each compartment reveals one joke or memory:

- glowing note cards
- tiny props
- soft sound cues
- floating text fragments

Examples:

- a mini HTML card for Carole
- a rain cloud icon for Wael excuses
- a halo or glowing frame for Ali
- a universal helper badge for Michal
- a tiny world cup prop for "coupe do monde"

Interaction style:

- mostly tap
- occasional drag to open drawers or rotate objects

### Scene 3: Bitbox Memory

A playful micro-scene dedicated to social games.

Concept:

- a tiny arcade corner or glowing board game table
- the user taps through a fast playful sequence
- Nour unlocks funny "victory memories"

This scene should feel lighter and more playful before the emotional middle section.

### Scene 4: The Tiny Drive

A simplified mobile-friendly driving section inspired by playful 3D portfolio experiences.

Concept:

- a tiny floating road under the stars
- she guides a small car through memory fragments
- movement should be very simple and short

Controls:

- optional touch steering or left/right buttons
- short duration only
- designed as a polished set piece, not a full game

Collectibles:

- stars
- white rose petals
- small text memories

### Scene 5: The Reading Corner

A soft moonlit scene with books, stars, and a nearly-finished book that still is not finished after 6 months.

This scene should transition from funny to tender.

Possible beats:

- a floating book opens
- pages reveal short warm lines
- one line teasing the unfinished book
- one line praising her cheerfulness and talent

### Scene 6: Final Letter Reveal

The world slows down.

The stars gathered from previous scenes assemble into a final constellation or rose-shaped glow.

Then the letter appears in a premium cinematic way:

- elegant typography
- subtle animation
- soft shimmer
- strongest musical cue

Final note should be editable late in the project once the rest of the experience is complete.

## Design Direction

Visual blend:

- dreamy night sky
- premium magical UI
- soft glow and bloom
- white rose palette
- gold highlights
- moonlight blues

Avoid:

- clutter
- harsh neon
- heavy realism
- awkward desktop-style controls on mobile

## Technical Plan

Recommended stack:

- Vite
- React
- React Three Fiber
- Drei
- GSAP

Implementation principles:

- mobile-first
- short loading time
- compressed 3D assets
- mostly tap interactions
- one strong 3D scene at a time
- layered audio and transitions for emotional impact

## Internet-Sourced Asset Plan

We can source a large part of this from the internet, but only from libraries with clear licenses.

### Likely Asset Sources

- 3D models: Poly Pizza, Kenney, selected Sketchfab assets with compatible licenses
- music: Pixabay Music or Scott Buckley tracks if attribution is acceptable
- sound effects: Pixabay Sound Effects, Kenney audio packs, Freesound with CC0 or carefully tracked attribution

### Asset Types Needed

- 1 hero object:
  - teddy bear, magical book, rose box, or folder
- 1 tiny car model
- 1 reading/book prop set
- 1 star or particle visual kit
- 1 ambient emotional music track
- 8 to 15 small sound effects:
  - sparkle
  - reveal
  - page turn
  - tap
  - unlock
  - soft success chime

### Licensing Notes

- Prefer no-attribution or simple-attribution assets
- Keep a credits file for anything that requires attribution
- Avoid assets with unclear redistribution or trademark issues
- Convert and optimize all models before shipping to mobile

## Content Writing Needs

Still needed from user before final production copy:

- final approved closing letter
- whether "France" should be a subtle motif in the final scene
- whether the experience should include a direct mention of "I will miss you"
- any specific line Nour says often
- favorite colors beyond white / moon / stars
- favorite flower details beyond white roses

## Build Plan

### Phase 1: Concept Lock

- confirm main hero object
- confirm title
- confirm emotional level of final letter
- confirm if France appears visually

### Phase 2: Prototype

- scaffold the app
- build the landing scene
- build the memory box scene
- build the final letter scene

### Phase 3: Adventure Expansion

- add Bitbox scene
- add tiny driving scene
- add reading corner scene
- connect scenes with polished transitions

### Phase 4: Polish

- final writing pass
- mobile performance pass
- audio balance
- credits and asset cleanup
- hosting and QR test

## Open Decisions

- hero object:
  - teddy
  - magical book
  - rose box
  - folder
  - combination of more than one
- final project deadline
- final hosting choice
- exact ending text
- whether the final screen includes the word "miss"
- whether to include French visual references

## My Current Recommendation

Build around this combination:

- hero object: magical book plus rose-light motif
- support prop: small teddy charm
- scenes: memory box, Bitbox, tiny drive, reading corner, final letter

Reason:

- this gives variety without making the project visually messy
- the book fits the unfinished-book joke
- the rose and star motifs fit Nour naturally
- the teddy can still appear as a cute emotional anchor without carrying the full experience alone

## Immediate Next Step

After this brief, the next practical move is to:

1. lock the hero object combination
2. gather the first asset pack from the internet
3. scaffold the project
4. build the intro scene and final letter scene first
