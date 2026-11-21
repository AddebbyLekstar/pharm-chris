import type { CharacterLook } from './look';

/**
 * Characters as vector illustration, not geometry.
 *
 * The concept frame is a painted 2.5D diorama: the room has depth, but the people
 * are drawn. Rebuilding them as boxes inside WebGL was chasing that look with the
 * wrong tool — every edge had to be modelled, lit and merged, and it still read as
 * programmer art.
 *
 * An SVG figure costs no draw calls, no triangles, no texture memory and no merge
 * pass. It scales crisply on a 2x phone, and it can carry the two things boxes can
 * never afford: an ink outline and painted two-tone shading.
 *
 * The camera looks down 43 degrees from the south-east, so the figure is drawn in a
 * three-quarter view with the head largest and the feet foreshortened. Everything is
 * authored in a 64 x 128 box with the feet on y = 124, so one `width` scales the
 * whole cast consistently.
 */

export interface SpriteOptions {
  /** Rendered width in CSS pixels. Height is 2x. */
  width?: number;
  /** Adds a soft contact shadow ellipse. */
  shadow?: boolean;
  /** Flip horizontally so a queued customer can face the counter. */
  flip?: boolean;
}

export interface SpriteGeometry {
  svg: string;
  width: number;
  height: number;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Darken a colour by a fraction, for the shadow side of a form. */
export function shade(color: number, amount: number): string {
  const r = Math.round((((color >> 16) & 0xff) * (1 - amount)));
  const g = Math.round((((color >> 8) & 0xff) * (1 - amount)));
  const b = Math.round((color & 0xff) * (1 - amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function lighten(color: number, amount: number): string {
  const r = Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * amount);
  const g = Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * amount);
  const b = Math.round((color & 0xff) + (255 - (color & 0xff)) * amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const INK = '#241a14';
const WHITE = '#f6f1e6';

/** Torso + hips, per outfit family. All coordinates sit inside the 64 x 128 box. */
function torsoPaths(outfit: CharacterLook['outfit'], top: number, bottom: number): string {
  const topFill = hex(top);
  const shadowFill = shade(top, 0.16);
  const bottomFill = hex(bottom);
  const bottomShadow = shade(bottom, 0.16);

  switch (outfit) {
    case 'agbada':
      return `
        <path d="M18 46 h28 c3 0 5 2 5 5 l6 62 c0 3 -2 5 -5 5 h-40 c-3 0 -5 -2 -5 -5 l6 -62 c0 -3 2 -5 5 -5 z" fill="${topFill}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M36 46 h10 c3 0 5 2 5 5 l6 62 c0 3 -2 5 -5 5 h-10 z" fill="${shadowFill}"/>
        <path d="M24 44 l8 8 l8 -8" fill="none" stroke="${hex(top)}" stroke-width="3"/>
        <path d="M22 108 h24" stroke="${INK}" stroke-width="0.8" opacity="0.25"/>`;
    case 'wrapper':
      return `
        <path d="M20 46 h24 c2 0 4 2 4 4 v20 h-32 v-20 c0 -2 2 -4 4 -4 z" fill="${topFill}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M32 46 h12 c2 0 4 2 4 4 v20 h-16 z" fill="${shadowFill}"/>
        <path d="M15 70 h34 c2 0 3 2 3 4 l3 40 c0 3 -2 4 -4 4 h-38 c-2 0 -4 -1 -4 -4 l3 -40 c0 -2 1 -4 3 -4 z" fill="${bottomFill}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M32 70 h17 c2 0 3 2 3 4 l3 40 c0 3 -2 4 -4 4 h-19 z" fill="${bottomShadow}"/>
        <path d="M14 72 h36" stroke="${hex(top)}" stroke-width="2.4" opacity="0.8"/>`;
    case 'kaftan':
      return `
        <path d="M19 46 h26 c3 0 4 2 4 4 l4 66 c0 3 -2 4 -5 4 h-32 c-3 0 -5 -1 -5 -4 l4 -66 c0 -2 1 -4 4 -4 z" fill="${topFill}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M32 46 h13 c3 0 4 2 4 4 l4 66 c0 3 -2 4 -5 4 h-16 z" fill="${shadowFill}"/>
        <path d="M22 50 h20 v5 h-20 z" fill="${hex(0xd8c9a8)}" opacity="0.75"/>
        <path d="M26 116 h12" stroke="${INK}" stroke-width="0.8" opacity="0.3"/>`;
    case 'hoodie':
      return `
        <path d="M19 48 h26 c3 0 4 2 4 4 l1 36 c0 2 -1 4 -4 4 h-28 c-3 0 -4 -2 -4 -4 l1 -36 c0 -2 1 -4 4 -4 z" fill="${topFill}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M32 48 h13 c3 0 4 2 4 4 l1 36 c0 2 -1 4 -4 4 h-14 z" fill="${shadowFill}"/>
        <path d="M23 34 c-4 2 -5 8 -4 12 c1 3 5 4 7 3 l2 -13 z" fill="${topFill}" stroke="${INK}" stroke-width="1.2"/>
        <path d="M26 58 h-6 v14 h12 v-14 z" fill="${shade(top, 0.1)}" stroke="${INK}" stroke-width="0.8"/>
        <path d="M29 50 v10 M35 50 v10" stroke="${hex(0xd8c9a8)}" stroke-width="1.2"/>`;
    case 'tunic':
      return `
        <path d="M19 46 h26 c3 0 5 2 5 5 l1 30 c0 3 -2 5 -5 5 h-28 c-3 0 -5 -2 -5 -5 l1 -30 c0 -3 2 -5 5 -5 z" fill="${topFill}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M32 46 h13 c3 0 5 2 5 5 l1 30 c0 3 -2 5 -5 5 h-14 z" fill="${shadowFill}"/>
        <path d="M17 78 h30 l-1 8 h-28 z" fill="${shadowFill}" stroke="${INK}" stroke-width="1"/>`;
    case 'tee':
    default:
      return `
        <path d="M20 47 h24 c3 0 4 2 4 4 l1 30 c0 2 -2 4 -4 4 h-26 c-2 0 -4 -2 -4 -4 l1 -30 c0 -2 1 -4 4 -4 z" fill="${topFill}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M32 47 h12 c3 0 4 2 4 4 l1 30 c0 2 -2 4 -4 4 h-13 z" fill="${shadowFill}"/>`;
  }
}

function legs(outfit: CharacterLook['outfit'], bottom: number): string {
  const covered = outfit === 'agbada' || outfit === 'wrapper' || outfit === 'kaftan';
  const trouser = hex(bottom);
  const trouserDark = shade(bottom, 0.18);
  if (covered) {
    // Feet only: the garment hem hides the legs, exactly as it does in the reference.
    return `
      <path d="M21 112 h9 l2 10 h-11 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>
      <path d="M34 112 h9 l1 10 h-11 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>`;
  }
  return `
    <path d="M22 84 h9 v34 h-9 z" fill="${trouser}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M33 84 h9 v34 h-9 z" fill="${trouser}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M31 84 h2 v34 h-2 z" fill="${trouserDark}"/>
    <path d="M19 117 h12 l3 7 h-13 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M33 117 h12 l2 7 h-13 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>`;
}

function arms(outfit: CharacterLook['outfit'], top: number, skin: number): string {
  const sleeve = hex(top);
  const sleeveDark = shade(top, 0.16);
  const bareArm = outfit === 'tee' || outfit === 'wrapper' || outfit === 'hoodie';
  const lower = bareArm ? hex(skin) : sleeve;
  const lowerDark = bareArm ? shade(skin, 0.18) : sleeveDark;

  return `
    <path d="M17 50 c-3 0 -5 2 -5 5 l-1 22 c0 2 1 4 3 4 c2 0 4 -2 4 -4 l1 -20 z" fill="${sleeve}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M12 76 c-2 0 -3 2 -3 4 l0 14 c0 2 1 3 3 3 c2 0 3 -1 3 -3 l0 -14 c0 -2 -1 -4 -3 -4 z" fill="${lower}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M47 50 c3 0 5 2 5 5 l1 22 c0 2 -1 4 -3 4 c-2 0 -4 -2 -4 -4 l-1 -20 z" fill="${sleeve}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M52 76 c2 0 3 2 3 4 l0 14 c0 2 -1 3 -3 3 c-2 0 -3 -1 -3 -3 l0 -14 c0 -2 1 -4 3 -4 z" fill="${lower}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M45 52 l1 20 l2 0 l-1 -20 z" fill="${sleeveDark}" opacity="0.7"/>
    <path d="M49 78 l0 14 l2 0 l0 -14 z" fill="${lowerDark}" opacity="0.7"/>`;
}

function head(look: CharacterLook): string {
  const skin = hex(look.skin);
  const skinDark = shade(look.skin, 0.16);
  const hair = hex(look.hairColor);
  const accent = hex(look.accent);

  const face = `
    <path d="M32 12 c9 0 15 6 15 15 c0 10 -7 18 -15 18 c-8 0 -15 -8 -15 -18 c0 -9 6 -15 15 -15 z" fill="${skin}" stroke="${INK}" stroke-width="1.5"/>
    <path d="M38 13 c6 3 9 8 9 14 c0 10 -7 18 -15 18 c-2 0 -4 -1 -5 -2 c9 -1 14 -8 14 -17 c0 -5 -1 -9 -3 -13 z" fill="${skinDark}" opacity="0.5"/>
    <path d="M17 12 c9 0 15 6 15 15 c0 10 -7 18 -15 18 c-8 0 -15 -8 -15 -18 c0 -9 6 -15 15 -15 z" fill="none"/>
    <ellipse cx="27" cy="28" rx="3.4" ry="3.7" fill="${WHITE}" stroke="${INK}" stroke-width="0.9"/>
    <ellipse cx="39" cy="28" rx="3.4" ry="3.7" fill="${WHITE}" stroke="${INK}" stroke-width="0.9"/>
    <circle cx="28" cy="28.4" r="1.8" fill="${INK}"/>
    <circle cx="40" cy="28.4" r="1.8" fill="${INK}"/>
    <path d="M22.4 23 q3.8 -2.4 7.4 -0.6" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path d="M36 22.6 q3.6 -1.6 7.2 0.6" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path d="M33 30.5 q0 4 -2.4 5.5" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
    <path d="M28 38.6 q4.5 3 9 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>
  `;

  let hairShape = '';
  switch (look.headpiece ?? look.hair) {
    case 'gele':
    case 'headwrap':
      hairShape = `
        <path d="M17 20 c-2 -9 5 -16 15 -16 c10 0 17 7 15 16 c-1 5 -6 3 -15 3 c-9 0 -14 2 -15 -3 z" fill="${accent}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M20 12 c6 -5 18 -5 24 0" fill="none" stroke="${shade(look.accent, 0.25)}" stroke-width="1.6"/>`;
      break;
    case 'helmet':
      hairShape = `
        <path d="M16 22 c0 -10 7 -16 16 -16 c9 0 16 6 16 16 c0 3 -4 4 -6 2 c-3 -3 -7 -4 -10 -4 c-4 0 -8 1 -11 4 c-2 2 -5 1 -5 -2 z" fill="${accent}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M19 17 q13 -8 26 1" fill="none" stroke="${WHITE}" stroke-width="1.4" opacity="0.7"/>`;
      break;
    case 'cap':
      hairShape = `
        <path d="M17 21 c0 -9 7 -15 15 -15 c8 0 15 6 15 15 z" fill="${accent}" stroke="${INK}" stroke-width="1.4"/>
        <path d="M47 21 q6 1 6 4 h-14 q5 -1 8 -4 z" fill="${shade(look.accent, 0.2)}" stroke="${INK}" stroke-width="1.2"/>`;
      break;
    case 'fula':
      hairShape = `
        <path d="M19 20 c0 -8 6 -13 13 -13 c7 0 13 5 13 13 z" fill="${hair}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M19 19 h26" stroke="${accent}" stroke-width="2"/>`;
      break;
    case 'hijab':
      hairShape = `
        <path d="M16 30 c-1 -12 6 -20 16 -20 c10 0 17 8 16 20 c0 6 -4 10 -6 12 c-3 -6 -6 -8 -10 -8 c-4 0 -7 2 -10 8 c-2 -2 -6 -6 -6 -12 z" fill="${accent}" stroke="${INK}" stroke-width="1.4"/>`;
      break;
    case 'braids':
      hairShape = `
        <path d="M17 22 c0 -10 7 -16 15 -16 c8 0 15 6 15 16 c0 3 -3 4 -5 2 c-3 -3 -6 -4 -10 -4 c-4 0 -7 1 -10 4 c-2 2 -5 1 -5 -2 z" fill="${hair}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M15 26 q-3 8 1 12 q3 -4 2 -12 z" fill="${hair}" stroke="${INK}" stroke-width="1.1"/>
        <path d="M49 26 q3 8 -1 12 q-3 -4 -2 -12 z" fill="${hair}" stroke="${INK}" stroke-width="1.1"/>`;
      break;
    case 'fade':
      hairShape = `
        <path d="M17 22 c0 -10 7 -16 15 -16 c8 0 15 6 15 16 c0 2 -2 3 -4 2 c-3 -3 -7 -4 -11 -4 c-4 0 -8 1 -11 4 c-2 1 -4 0 -4 -2 z" fill="${hair}" stroke="${INK}" stroke-width="1.3"/>`;
      break;
    case 'lowcut':
      hairShape = `
        <path d="M18 21 c1 -9 6 -14 14 -14 c8 0 13 5 14 14 c-4 -4 -8 -5 -14 -5 c-6 0 -10 1 -14 5 z" fill="${hair}" stroke="${INK}" stroke-width="1.2"/>`;
      break;
    case 'bald':
    default:
      hairShape = `<path d="M19 18 q13 -6 26 0" fill="none" stroke="${inkish(look)}" stroke-width="1.2" opacity="0.5"/>`;
      break;
  }

  return `${face}${hairShape}`;
}

/** A soft hairline tone for bald characters, so the crown is not a flat blob. */
const inkish = (look: CharacterLook): string => shade(look.skin, 0.35);

export function characterSprite(look: CharacterLook, options: SpriteOptions = {}): SpriteGeometry {
  const width = options.width ?? 80;
  const height = width * 2;
  const flip = options.flip ? ' scale(-1,1) translate(-64,0)' : '';
  const shadow = options.shadow === false
    ? ''
    : `<ellipse cx="32" cy="124" rx="19" ry="4.4" fill="#000" opacity="0.16"/>`;

  const body = `
    ${legs(look.outfit, look.bottom)}
    ${torsoPaths(look.outfit, look.top, look.bottom)}
    ${arms(look.outfit, look.top, look.skin)}
    ${head(look)}
    ${look.glasses ? `<path d="M22 27 h7 M35 27 h7" stroke="${hex(look.accent)}" stroke-width="1.4" opacity="0.9"/>` : ''}
  `;

  // Foreshorten for a camera 43 degrees above the floor, and let the look's build
  // and height reach the drawing: a crowd of identically-proportioned sprites is
  // the same clone problem in a different renderer.
  const sx = 0.94 * look.build;
  const sy = 0.94 * look.height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 128" width="${width}" height="${height}" class="char-sprite" style="overflow:visible">
    ${shadow}
    <g transform="${flip}"><g transform="translate(32 124) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-32 -124)">${body}</g></g>
  </svg>`;

  return { svg, width, height };
}

/** Inline the sprite as DOM rather than an <img>: no network, no decode, crisp at 2x. */
export function spriteElement(look: CharacterLook, options: SpriteOptions = {}): HTMLSpanElement {
  const { svg, width, height } = characterSprite(look, options);
  const el = document.createElement('span');
  el.className = 'char-sprite-host';
  el.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;will-change:transform`;
  el.innerHTML = svg;
  return el;
}
