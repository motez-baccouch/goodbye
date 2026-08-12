export type ChapterMemory = {
  id: string
  label: string
  title: string
  detail: string
}

export type Chapter = {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  instruction: string
  prompt: string
  completionHint: string
  sceneLabel: string
  memories: ChapterMemory[]
}

export const chapters: Chapter[] = [
  {
    id: 'arrival',
    eyebrow: 'Chapter 01',
    title: 'Wake The Sky',
    subtitle:
      'A little pocket universe waits for Nour, held together by stars, a rose glow, and the softest kind of magic.',
    instruction: 'Tap the scene three times to wake the light.',
    prompt: 'Every touch wakes another star for Noura.',
    completionHint: 'When the sky is awake, the journey opens.',
    sceneLabel: 'Constellation Atrium',
    memories: [
      {
        id: 'light',
        label: 'Touch 1',
        title: 'First light',
        detail: 'Some people join a team. Some quietly change the atmosphere of it.',
      },
      {
        id: 'rose',
        label: 'Touch 2',
        title: 'White rose',
        detail: 'The world here borrows its softness from white roses and its glow from Nour.',
      },
      {
        id: 'door',
        label: 'Touch 3',
        title: 'The door opens',
        detail: 'Now that the sky is listening, the memories can come out and play.',
      },
    ],
  },
  {
    id: 'archive',
    eyebrow: 'Chapter 02',
    title: 'The Memory Archive',
    subtitle:
      'A magical archive opens. Every drawer hides a joke, a habit, or one of those moments that only make sense to your people.',
    instruction: 'Open the memory drawers one by one.',
    prompt: 'Each drawer reveals a shared work legend.',
    completionHint: 'All four drawers need to be opened to unlock the next stop.',
    sceneLabel: 'Rosewood Archive',
    memories: [
      {
        id: 'carlos',
        label: 'Open drawer',
        title: 'Go Carlos',
        detail:
          'The archive refuses to continue without paying proper respect to the eternal classic: go carlos.',
      },
      {
        id: 'carole',
        label: 'Open drawer',
        title: 'Carole and HTML',
        detail:
          'A page appears in tribute to Carole trying to learn HTML five months into the job like it was a surprise side quest.',
      },
      {
        id: 'wael',
        label: 'Open drawer',
        title: 'Wael review weather report',
        detail:
          'Another note blames late PR review on floods, food poisoning, or dramatic weather. Naturally.',
      },
      {
        id: 'ali-michal',
        label: 'Open drawer',
        title: 'Office mythology',
        detail:
          'Ali gets his halo. Michal gets crowned best man for absolutely everything. Balance is restored.',
      },
    ],
  },
  {
    id: 'bitbox',
    eyebrow: 'Chapter 03',
    title: 'Bitbox Champions',
    subtitle:
      'The arcade corner hums back to life. Every win, every laugh, every ridiculous round gets its own tiny monument.',
    instruction: 'Collect three playful wins.',
    prompt: 'Tap each play button to lock in a victory memory.',
    completionHint: 'Three wins are enough to move on, even if everyone is still arguing about the score.',
    sceneLabel: 'Bitbox Arcade',
    memories: [
      {
        id: 'bitbox-win',
        label: 'Play round',
        title: 'Bitbox supremacy',
        detail:
          'A glowing scoreboard confirms what history already knows: you beat them all in the Bitbox social games.',
      },
      {
        id: 'coupe',
        label: 'Play round',
        title: 'Coupe do monde',
        detail:
          'A tiny trophy spins in the air and announces itself exactly as it should be said: coupe do monde.',
      },
      {
        id: 'izz',
        label: 'Play round',
        title: 'GoCardless diplomacy',
        detail:
          'Izzy from GoCardless gets a cameo because some jokes are too embedded in the timeline to leave behind.',
      },
    ],
  },
  {
    id: 'drive',
    eyebrow: 'Chapter 04',
    title: 'Little Drive Under The Stars',
    subtitle:
      'A tiny car glides through a moonlit road while petals and starlight collect around it like all the good parts of a chapter refusing to disappear.',
    instruction: 'Guide the drive and collect four star fragments.',
    prompt: 'Tap the road controls to advance the ride.',
    completionHint: 'Four fragments complete the constellation.',
    sceneLabel: 'Midnight Road',
    memories: [
      {
        id: 'padel',
        label: 'Drive onward',
        title: 'Padel physics',
        detail:
          'Mohamed invited everyone to padel. The ball, however, chose a separate life path and kept running away from you.',
      },
      {
        id: 'france',
        label: 'Drive onward',
        title: 'Heading toward France',
        detail:
          'The road bends toward what comes next, and the whole sky seems committed to wishing Nour the very best there.',
      },
      {
        id: 'talent',
        label: 'Drive onward',
        title: 'Bright company',
        detail:
          'Not every friend makes work lighter. Nour somehow made it brighter and funnier at the same time.',
      },
      {
        id: 'future',
        label: 'Drive onward',
        title: 'Break a leg',
        detail:
          'One more star locks in the send-off: break a leg in France, Noura. The road ahead suits you.',
      },
    ],
  },
  {
    id: 'reading',
    eyebrow: 'Chapter 05',
    title: 'Moonlit Reading Corner',
    subtitle:
      'The pace softens. Books float in quiet orbit, pages turn in the dark, and the most patient unfinished book in the world finally gets its own scene.',
    instruction: 'Turn three pages.',
    prompt: 'Tap the page buttons to reveal the final warm-up notes.',
    completionHint: 'When all three pages are turned, the letter arrives.',
    sceneLabel: 'Luna Library',
    memories: [
      {
        id: 'book',
        label: 'Turn page',
        title: 'The legendary unfinished book',
        detail:
          'A respectful note is filed here for the same book that somehow remained in progress for six months and still held its ground.',
      },
      {
        id: 'cheer',
        label: 'Turn page',
        title: 'Cheerful and talented',
        detail:
          'This page keeps the plain truth: working with someone this cheerful and this talented is rare, and everybody knows it.',
      },
      {
        id: 'best-colleague',
        label: 'Turn page',
        title: 'The quiet truth',
        detail:
          'There is a reason this chapter slows down here. Some people are not easy to replace, and some are not replaceable at all.',
      },
    ],
  },
]

export const finalLetter = [
  'Noura,',
  'Working alongside you has been one of the brightest parts of this chapter.',
  'You brought cheer, talent, warmth, and that rare kind of presence that makes even ordinary days feel lighter.',
  'I am truly happy that I got to work with someone like you, and honestly, I do not think I will ever have a better friend and partner.',
  'Thank you for the laughs, the memories, the inside jokes, and for making this place feel more alive than it would have without you.',
  'I wish you nothing but the best in France. Break a leg, keep shining, and please do not forget the classics.',
  'Go carlos.',
]
