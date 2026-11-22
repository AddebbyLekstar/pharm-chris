import type { Customer } from '../../../sim/types';

/**
 * Who walks into the shop.
 *
 * Before this module every customer who was not one of the four authored story
 * characters shared one silhouette and picked one of four colour sets by summing
 * character codes. A queue of eight read as one man photocopied, and the "varied
 * Lagos street presets" never varied in the dimension that reads at 46 px: shape.
 *
 * Looks are derived, not stored: the same customer id always produces the same
 * person, so a reload does not reshuffle the crowd. Everything here is pure, so the
 * variety can be asserted in a test instead of eyeballed in a screenshot.
 */

export const OUTFITS = ['tunic', 'agbada', 'wrapper', 'tee', 'hoodie', 'kaftan'] as const;
export type OutfitFamily = (typeof OUTFITS)[number];

export const HAIRSTYLES = [
  'fade',
  'lowcut',
  'braids',
  'afro',
  'headwrap',
  'cap',
  'bald',
  'helmet',
] as const;
export type Hairstyle = (typeof HAIRSTYLES)[number];

/**
 * Beard shapes, not a boolean.
 *
 * `beard` used to be true/false and the sprite renderer ignored it entirely, so a
 * third of the men walked around with a jaw that contradicted their data. At 80 px
 * the *shape* is what reads — a boxed beard squares the jaw, a chin strap draws a
 * line around it, a goatee leaves the cheeks bare — so the field carries the shape.
 */
export const BEARD_STYLES = ['boxed', 'chin', 'goatee'] as const;
export type BeardStyle = (typeof BEARD_STYLES)[number];

/** Authored headgear that outranks the procedural hairstyle. */
export const HEADPIECES = ['gele', 'helmet', 'newsboy', 'fula', 'hijab'] as const;
export type Headpiece = (typeof HEADPIECES)[number];

/**
 * The parts of a face that survive being 30 px wide.
 *
 * Outfit colour and hairstyle were doing all the differentiating, so a queue read as
 * one man photocopied into six shirts. At 80 px nobody resolves a nose; they resolve
 * skull width, jaw, brow bar, eye gap and mouth line. Those are the traits below, and
 * the renderer draws each one as a different path, not a different tint.
 */
export const HEAD_SHAPES = ['round', 'long', 'square'] as const;
export type HeadShape = (typeof HEAD_SHAPES)[number];

export const EYE_SPACINGS = ['close', 'wide'] as const;
export type EyeSpacing = (typeof EYE_SPACINGS)[number];

export const BROW_WEIGHTS = ['thin', 'medium', 'heavy'] as const;
export type BrowWeight = (typeof BROW_WEIGHTS)[number];

export const MOUTHS = ['smile', 'flat', 'full'] as const;
export type Mouth = (typeof MOUTHS)[number];

export const CHEEKS = ['soft', 'cut'] as const;
export type Cheek = (typeof CHEEKS)[number];

export const AGES = ['young', 'middle', 'elder'] as const;
export type Age = (typeof AGES)[number];

export interface FaceTraits {
  /** Skull + jaw silhouette: round, long/narrow, or square-jawed. */
  headShape: HeadShape;
  eyeSpacing: EyeSpacing;
  browWeight: BrowWeight;
  mouth: Mouth;
  /** Soft cheeks read younger; a cut cheekbone line reads leaner and older. */
  cheek: Cheek;
  /** Not a number: it moves posture, hair volume and a few face lines together. */
  age: Age;
}

/**
 * Stance, kept small. All three values are applied to the upper body only, so the
 * feet never leave y = 124 and the sprite never leaves its box.
 */
export interface Posture {
  /** Degrees of shoulder slope, -4..4. */
  shoulderTilt: number;
  /** Degrees of head tilt, -6..6. */
  headTilt: number;
  /** Which arm hangs away from the body: -1 left, 1 right, 0 neither. */
  armOut: -1 | 0 | 1;
}

export interface CharacterLook {
  skin: number;
  /** Garment / uniform colour. */
  top: number;
  bottom: number;
  /** Trim: headtie, cap, bag, beads. */
  accent: number;
  hairColor: number;
  outfit: OutfitFamily;
  hair: Hairstyle;
  headpiece: Headpiece | null;
  /** Width multiplier, 0.86–1.20. Silhouette, not scale: height does not follow it. */
  build: number;
  /** Height multiplier, 0.86–1.12, applied at the hips so feet stay on the floor. */
  height: number;
  beard: boolean;
  /** Which beard, when `beard` is true. Shape reads at 80 px; the boolean alone did not. */
  beardStyle: BeardStyle;
  glasses: boolean;
  /** Carries a shoulder bag; grounds a silhouette that is otherwise a box. */
  bag: boolean;
  /** Skull, brows, eyes, mouth, cheek and age. Drawn, not just coloured. */
  face: FaceTraits;
  /** Shoulder slope, head tilt and the arm that hangs out. */
  posture: Posture;
}

type Gender = 'woman' | 'man';

/** FNV-1a. Stable across runs and platforms; the key the whole cast is derived from. */
export function hashId(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: tiny, deterministic, good enough to draw a crowd from. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length) % list.length];

const SKINS = [0x3b200f, 0x452814, 0x4a2e1b, 0x532e17, 0x3e2312, 0x5b3520] as const;

/**
 * Garment palette, pulled from the concept frame rather than from a colour wheel.
 *
 * The first pass used saturated teal, magenta and cobalt; under flat light they read
 * as plastic toys. The reference is painted with sun-faded Lagos street cloth: olive,
 * cream, terracotta, denim, ochre, sage. Muting the chroma is the single cheapest
 * step toward the illustrated look, and it costs nothing at render time.
 */
const TOPS = [
  0x6f7a4f, // olive
  0xe8dcc4, // unbleached cream
  0xc0704a, // terracotta
  0x6d8098, // faded denim
  0xc59a52, // ochre
  0x35544a, // deep green
  0xb07a6e, // dusty rose
  0x9a9287, // warm grey
  0x44536b, // indigo
  0xa85b42, // brick
  0x8a9a7b, // sage
  0xd8c9a8, // sand
] as const;

const BOTTOMS = [0x4a4a45, 0x3f4a5a, 0x574c3f, 0x2f3a3a, 0x6b5a49, 0x394253] as const;

const ACCENTS = [0xc2683f, 0xb08a4a, 0x7a4a3a, 0x5d6b4a, 0xd8c9a8, 0x8f5b4b] as const;

const HAIR_COLOURS = [0x1b1512, 0x241a14, 0x2e211a] as const;

const WOMAN_OUTFITS: readonly OutfitFamily[] = ['wrapper', 'tunic', 'kaftan', 'wrapper'];
const MAN_OUTFITS: readonly OutfitFamily[] = ['agbada', 'tee', 'hoodie', 'tunic', 'tee'];
const WOMAN_HAIR: readonly Hairstyle[] = ['headwrap', 'braids', 'lowcut', 'afro', 'headwrap'];
const MAN_HAIR: readonly Hairstyle[] = ['fade', 'lowcut', 'cap', 'bald', 'afro', 'fade'];

/**
 * Authored cast. These four have dialogue, a name in the HUD and a recognisable
 * entrance, so their look is fixed rather than derived — a mother-of-the-street in
 * a hoodie would undercut the scene the writing sets up.
 */
const AUTHORED: Array<{ match: string; look: Partial<CharacterLook> & Pick<CharacterLook, 'outfit' | 'hair'> }> = [
  {
    match: 'mama',
    look: {
      skin: 0x532e17,
      top: 0xf57c00,
      bottom: 0xd84315,
      accent: 0xbf360c,
      hairColor: 0x0f0f0f,
      outfit: 'wrapper',
      hair: 'headwrap',
      headpiece: 'gele',
      build: 1.08,
      height: 0.96,
      beard: false,
      beardStyle: 'boxed',
      glasses: false,
      bag: false,
      // Round face, wide-set eyes, full mouth: the aunty who has fed the street.
      face: { headShape: 'round', eyeSpacing: 'wide', browWeight: 'medium', mouth: 'full', cheek: 'soft', age: 'elder' },
      posture: { shoulderTilt: 1.8, headTilt: 3.2, armOut: -1 },
    },
  },
  {
    match: 'emeka',
    look: {
      skin: 0x452814,
      top: 0xfdd835,
      bottom: 0x1a237e,
      accent: 0x1a1a1a,
      hairColor: 0x0f0f0f,
      outfit: 'tee',
      hair: 'helmet',
      headpiece: 'helmet',
      build: 0.96,
      height: 1.02,
      beard: false,
      beardStyle: 'boxed',
      glasses: false,
      bag: true,
      // Long face, close eyes, thin brows: the lean dispatch rider.
      face: { headShape: 'long', eyeSpacing: 'close', browWeight: 'thin', mouth: 'smile', cheek: 'cut', age: 'young' },
      posture: { shoulderTilt: -1.2, headTilt: -2.4, armOut: 1 },
    },
  },
  {
    match: 'bayo',
    look: {
      skin: 0x3b200f,
      top: 0xfbc02d,
      bottom: 0x37474f,
      accent: 0x5d4037,
      hairColor: 0x0f0f0f,
      outfit: 'tee',
      hair: 'cap',
      headpiece: 'newsboy',
      build: 1.04,
      height: 0.99,
      beard: true,
      beardStyle: 'boxed',
      glasses: false,
      bag: false,
      // Square jaw, heavy brow, flat mouth: the newsboy who does not haggle.
      face: { headShape: 'square', eyeSpacing: 'wide', browWeight: 'heavy', mouth: 'flat', cheek: 'cut', age: 'middle' },
      posture: { shoulderTilt: 2.2, headTilt: -1.4, armOut: 0 },
    },
  },
  {
    match: 'danjuma',
    look: {
      skin: 0x4a2e1b,
      top: 0x1e293b,
      bottom: 0x0f172a,
      accent: 0xd4af37,
      hairColor: 0x0f0f0f,
      outfit: 'agbada',
      hair: 'cap',
      headpiece: 'fula',
      build: 1.12,
      height: 1.04,
      beard: true,
      beardStyle: 'chin',
      glasses: false,
      bag: false,
      // Long face under the fula cap, deep-set close eyes, heavy brow, flat mouth.
      face: { headShape: 'long', eyeSpacing: 'close', browWeight: 'heavy', mouth: 'flat', cheek: 'cut', age: 'elder' },
      posture: { shoulderTilt: 3, headTilt: 2, armOut: -1 },
    },
  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Weighted draw from an ordered list; falls through to the last entry. */
function weighted<T>(entries: ReadonlyArray<readonly [T, number]>, r: number): T {
  let acc = 0;
  for (const [value, share] of entries) {
    acc += share;
    if (r < acc) return value;
  }
  return entries[entries.length - 1][0];
}

/**
 * The face is drawn from its own stream, not the outfit stream. If it shared the
 * main rng, face would be a function of garment: every terracotta wrapper would get
 * the same jaw, and the crowd would still be correlated in the dimension that reads.
 */
function generatedFace(id: string): FaceTraits {
  const r = rng(hashId(`${id}:face`));
  const headShape = weighted<HeadShape>(
    [['round', 0.4], ['long', 0.34], ['square', 0.26]],
    r(),
  );
  const eyeSpacing = weighted<EyeSpacing>([['close', 0.56], ['wide', 0.44]], r());
  const browWeight = weighted<BrowWeight>(
    [['thin', 0.32], ['medium', 0.4], ['heavy', 0.28]],
    r(),
  );
  const mouth = weighted<Mouth>([['smile', 0.48], ['flat', 0.3], ['full', 0.22]], r());
  const cheek = weighted<Cheek>([['soft', 0.56], ['cut', 0.44]], r());
  const age = weighted<Age>([['young', 0.38], ['middle', 0.4], ['elder', 0.22]], r());

  return { headShape, eyeSpacing, browWeight, mouth, cheek, age };
}

/** Posture amplitude follows age: the young stand straight, the old settle. */
function generatedPosture(id: string, age: Age): Posture {
  const r = rng(hashId(`${id}:posture`));
  const slope = age === 'elder' ? 3 : age === 'middle' ? 2 : 1.2;
  const nod = age === 'elder' ? 5 : age === 'middle' ? 3.6 : 2.4;
  return {
    shoulderTilt: round1((r() * 2 - 1) * slope),
    headTilt: round1((r() * 2 - 1) * nod),
    armOut: pick([-1, 0, 1, 0, 0], r()) as -1 | 0 | 1,
  };
}

/** Deterministic look for a customer. Same id, same person, every load. */
export function customerLook(customer: Pick<Customer, 'id'>): CharacterLook {
  const id = customer.id.toLowerCase();
  for (const entry of AUTHORED) {
    if (id.includes(entry.match)) return { ...generatedLook(id), ...entry.look };
  }
  return generatedLook(id);
}

function generatedLook(id: string): CharacterLook {
  const seed = hashId(id);
  const r = rng(seed);
  const gender: Gender = r() < 0.52 ? 'woman' : 'man';
  const skin = pick(SKINS, r());
  const top = pick(TOPS, r());
  const bottom = pick(BOTTOMS, r());
  const accent = pick(ACCENTS, r());
  const hairColor = pick(HAIR_COLOURS, r());
  const outfit = pick(gender === 'woman' ? WOMAN_OUTFITS : MAN_OUTFITS, r());
  const hair = pick(gender === 'woman' ? WOMAN_HAIR : MAN_HAIR, r());
  const face = generatedFace(id);

  return {
    skin,
    top,
    bottom,
    accent,
    hairColor,
    outfit,
    hair,
    headpiece: hair === 'headwrap' ? (r() < 0.35 ? 'hijab' : 'gele') : null,
    build: round2(0.86 + r() * 0.34),
    height: round2(0.86 + r() * 0.26),
    beard: gender === 'man' && hair !== 'bald' && r() < 0.34,
    // The beard is drawn, so the shape is decided here and hashed with the rest of
    // the person: a boxed jaw on one man, a thin strap on the next, is the cheapest
    // silhouette break the cast has.
    beardStyle: weighted<BeardStyle>([['boxed', 0.45], ['chin', 0.3], ['goatee', 0.25]], r()),
    glasses: r() < 0.18,
    bag: r() < 0.3,
    face,
    posture: generatedPosture(id, face.age),
  };
}

/**
 * Staff uniforms. Fixed by role: the player has to tell at a glance whether the
 * person behind the counter is theirs, and the three roles should not look like
 * three passing customers.
 */
const STAFF: Record<'stocker' | 'cashier' | 'cleaner', CharacterLook> = {
  stocker: {
    skin: 0x452814,
    top: 0x445a4a,
    bottom: 0x3f4a45,
    accent: 0xe8dcc4,
    hairColor: 0x0f0f0f,
    outfit: 'tee',
    hair: 'fade',
    headpiece: null,
    build: 1.02,
    height: 1.0,
    beard: false,
    beardStyle: 'boxed',
    glasses: false,
    bag: false,
    face: { headShape: 'square', eyeSpacing: 'close', browWeight: 'medium', mouth: 'flat', cheek: 'cut', age: 'young' },
    posture: { shoulderTilt: 1.2, headTilt: -1.6, armOut: 1 },
  },
  cashier: {
    skin: 0x532e17,
    top: 0x41505f,
    bottom: 0x3f4a45,
    accent: 0xe8dcc4,
    hairColor: 0x1a1210,
    outfit: 'tunic',
    hair: 'braids',
    headpiece: null,
    build: 0.94,
    height: 0.95,
    beard: false,
    beardStyle: 'boxed',
    glasses: true,
    bag: false,
    face: { headShape: 'round', eyeSpacing: 'wide', browWeight: 'thin', mouth: 'smile', cheek: 'soft', age: 'middle' },
    posture: { shoulderTilt: -0.8, headTilt: 2.4, armOut: -1 },
  },
  cleaner: {
    skin: 0x3b200f,
    top: 0x6b5340,
    bottom: 0x3f4a45,
    accent: 0xe8dcc4,
    hairColor: 0x0f0f0f,
    outfit: 'tee',
    hair: 'lowcut',
    headpiece: null,
    build: 1.06,
    height: 1.03,
    beard: true,
    beardStyle: 'chin',
    glasses: false,
    bag: false,
    face: { headShape: 'long', eyeSpacing: 'wide', browWeight: 'heavy', mouth: 'flat', cheek: 'cut', age: 'elder' },
    posture: { shoulderTilt: 2.6, headTilt: -3.4, armOut: 0 },
  },
};

export function staffLook(role: 'stocker' | 'cashier' | 'cleaner'): CharacterLook {
  return { ...STAFF[role] };
}
