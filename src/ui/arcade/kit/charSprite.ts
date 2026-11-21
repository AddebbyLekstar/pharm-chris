import type { CharacterLook, HeadShape } from './look';

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

/** One decimal, no trailing .0: keeps the markup readable and the tests exact. */
const num = (n: number): string => {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/** Blend two packed RGB colours, t towards b. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number): number =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Skull metrics per head shape, in sprite coordinates. Width and jaw do the reading
 * at 80 px; the chin rise is what separates a soft round jaw from a squared one.
 */
interface HeadMetrics {
  w: number;
  top: number;
  chin: number;
  /** Jaw width as a fraction of skull width. */
  jaw: number;
  /** How far the jaw corners sit above the chin. */
  chinRise: number;
}

const HEAD_METRICS: Record<HeadShape, HeadMetrics> = {
  round: { w: 15.2, top: 11.6, chin: 45.4, jaw: 0.62, chinRise: 2.4 },
  long: { w: 12.6, top: 10.2, chin: 45.8, jaw: 0.52, chinRise: 1.2 },
  square: { w: 15.8, top: 12.0, chin: 45.2, jaw: 0.86, chinRise: 0.8 },
};

/** Symmetric head outline: temples at full width, jaw tapered by the shape. */
function headOutline(m: HeadMetrics): string {
  const h = m.chin - m.top;
  const rx = m.w;
  const jaw = rx * m.jaw;
  const right = 32 + rx;
  const left = 32 - rx;
  const yTemple = m.top + h * 0.34;
  const yWide = m.top + h * 0.62;
  const yJaw = m.top + h * 0.92;
  const corner = m.chin - m.chinRise;
  return [
    `M32 ${num(m.top)}`,
    `C ${num(32 + rx * 0.62)} ${num(m.top)}, ${num(right)} ${num(m.top + h * 0.1)}, ${num(right)} ${num(yTemple)}`,
    `C ${num(right)} ${num(yWide)}, ${num(32 + jaw)} ${num(yJaw)}, ${num(32 + jaw * 0.8)} ${num(corner)}`,
    `Q ${num(32 + jaw * 0.42)} ${num(m.chin)}, 32 ${num(m.chin)}`,
    `Q ${num(32 - jaw * 0.42)} ${num(m.chin)}, ${num(32 - jaw * 0.8)} ${num(corner)}`,
    `C ${num(32 - jaw)} ${num(yJaw)}, ${num(left)} ${num(yWide)}, ${num(left)} ${num(yTemple)}`,
    `C ${num(left)} ${num(m.top + h * 0.1)}, ${num(32 - rx * 0.62)} ${num(m.top)}, 32 ${num(m.top)}`,
    'Z',
  ].join(' ');
}

/** The lit side: a narrow crescent down the right cheek and jaw, inside the outline. */
function cheekShadow(m: HeadMetrics): string {
  const h = m.chin - m.top;
  const rx = m.w;
  const jaw = rx * m.jaw;
  const corner = m.chin - m.chinRise;
  return `M${num(32 + rx * 0.52)} ${num(m.top + 1)} C ${num(32 + rx * 0.92)} ${num(m.top + h * 0.12)}, ${num(32 + rx * 0.99)} ${num(m.top + h * 0.34)}, ${num(32 + rx * 0.94)} ${num(m.top + h * 0.52)} C ${num(32 + rx * 0.88)} ${num(m.top + h * 0.74)}, ${num(32 + jaw * 0.95)} ${num(corner - 1)}, ${num(32 + jaw * 0.6)} ${num(corner)} Q ${num(32 + jaw * 0.3)} ${num(m.chin - 1.8)}, 32 ${num(m.chin - 3)} C ${num(32 + jaw * 0.5)} ${num(m.chin - 5.4)}, ${num(32 + rx * 0.55)} ${num(m.top + h * 0.6)}, ${num(32 + rx * 0.52)} ${num(m.top + 1)} Z`;
}


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
      <path d="M21 112 h9 l2 12 h-11 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>
      <path d="M34 112 h9 l1 12 h-11 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>`;
  }
  return `
    <path d="M22 84 h9 v34 h-9 z" fill="${trouser}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M33 84 h9 v34 h-9 z" fill="${trouser}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M31 84 h2 v34 h-2 z" fill="${trouserDark}"/>
    <path d="M19 117 h12 l3 7 h-13 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M33 117 h12 l2 7 h-13 z" fill="${hex(0x2a2320)}" stroke="${INK}" stroke-width="1.1"/>`;
}

function arms(
  outfit: CharacterLook['outfit'],
  top: number,
  skin: number,
  armOut: -1 | 0 | 1,
): string {
  const sleeve = hex(top);
  const sleeveDark = shade(top, 0.16);
  const bareArm = outfit === 'tee' || outfit === 'wrapper' || outfit === 'hoodie';
  const lower = bareArm ? hex(skin) : sleeve;
  const lowerDark = bareArm ? shade(skin, 0.18) : sleeveDark;

  const left = `
    <path d="M17 50 c-3 0 -5 2 -5 5 l-1 22 c0 2 1 4 3 4 c2 0 4 -2 4 -4 l1 -20 z" fill="${sleeve}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M12 76 c-2 0 -3 2 -3 4 l0 14 c0 2 1 3 3 3 c2 0 3 -1 3 -3 l0 -14 c0 -2 -1 -4 -3 -4 z" fill="${lower}" stroke="${INK}" stroke-width="1.1"/>`;
  const right = `
    <path d="M47 50 c3 0 5 2 5 5 l1 22 c0 2 -1 4 -3 4 c-2 0 -4 -2 -4 -4 l-1 -20 z" fill="${sleeve}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M52 76 c2 0 3 2 3 4 l0 14 c0 2 -1 3 -3 3 c-2 0 -3 -1 -3 -3 l0 -14 c0 -2 1 -4 3 -4 z" fill="${lower}" stroke="${INK}" stroke-width="1.1"/>`;

  // One arm hangs a few degrees away from the body. It is a six-degree rotation
  // around the shoulder: enough to break the outline at 80 px, small enough that the
  // hand never reaches the edge of the box.
  const tilt = (side: 'left' | 'right'): string => {
    const angle = side === 'left' ? (armOut === -1 ? 6 : 0) : armOut === 1 ? -6 : 0;
    if (!angle) return '';
    const pivot = side === 'left' ? '15 53' : '49 53';
    return `rotate(${angle} ${pivot})`;
  };

  return `
    <g${tilt('left') ? ` transform="${tilt('left')}"` : ''}>${left}</g>
    <g${tilt('right') ? ` transform="${tilt('right')}"` : ''}>${right}</g>
    <path d="M45 52 l1 20 l2 0 l-1 -20 z" fill="${sleeveDark}" opacity="0.7"/>
    <path d="M49 78 l0 14 l2 0 l0 -14 z" fill="${lowerDark}" opacity="0.7"/>`;
}

function head(look: CharacterLook): string {
  const skin = hex(look.skin);
  const skinDark = shade(look.skin, 0.16);
  const hair = hex(look.hairColor);
  const accent = hex(look.accent);
  const f = look.face;
  const m = HEAD_METRICS[f.headShape];
  const h = m.chin - m.top;
  const rx = m.w;
  const eyeY = m.top + h * 0.47;
  const eyeGap = f.eyeSpacing === 'wide' ? 13 : 9;
  const eyeCx = 32.8;
  const eyeR =
    (f.headShape === 'long' ? 2.75 : 3.1) +
    (f.age === 'young' ? 0.12 : f.age === 'elder' ? -0.22 : 0);
  const eyeRy = eyeR + 0.3;
  const leftEye = eyeCx - eyeGap / 2;
  const rightEye = eyeCx + eyeGap / 2;
  const mouthY = m.chin - 6.2;
  const mouthW = Math.min(9.2, rx * 0.58);
  const mouthX = 32.4;
  const lip = mix(look.skin, 0xb0563f, 0.38);

  const browY =
    eyeY - (f.browWeight === 'heavy' ? 4.3 : f.browWeight === 'medium' ? 5 : 5.5);
  const browW = f.browWeight === 'heavy' ? 2.9 : f.browWeight === 'medium' ? 2 : 1.3;
  const browArch = f.browWeight === 'heavy' ? -0.5 : f.browWeight === 'thin' ? -2.2 : -1.6;

  const mouth =
    f.mouth === 'smile'
      ? `<path data-part="mouth" d="M${num(mouthX - mouthW / 2)} ${num(mouthY)} q${num(mouthW / 2)} ${num(mouthW * 0.34)} ${num(mouthW)} 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`
      : f.mouth === 'flat'
        ? `<path data-part="mouth" d="M${num(mouthX - mouthW / 2)} ${num(mouthY + 0.5)} h${num(mouthW)}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`
        : `<path data-part="mouth" d="M${num(mouthX - mouthW / 2)} ${num(mouthY)} q${num(mouthW / 2)} -2.3 ${num(mouthW)} 0 q${num(-mouthW / 2)} 4.8 ${num(-mouthW)} 0 Z" fill="${lip}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>`;

  const cheekCut =
    f.cheek === 'cut'
      ? `
        <path data-part="cheek-left" d="M${num(32 - rx * 0.62)} ${num(eyeY + 4.2)} q-1.4 3.2 0.2 5.6" fill="none" stroke="${shade(look.skin, 0.34)}" stroke-width="1" opacity="0.55" stroke-linecap="round"/>
        <path data-part="cheek-right" d="M${num(32 + rx * 0.62)} ${num(eyeY + 4.2)} q1.4 3.2 -0.2 5.6" fill="none" stroke="${shade(look.skin, 0.34)}" stroke-width="1" opacity="0.55" stroke-linecap="round"/>`
      : '';

  // Age is legible at this size through the set of the mouth and the marks around
  // it, not through wrinkles. Two short nasolabial strokes and a heavier lid line.
  const ageMarks =
    f.age === 'elder'
      ? `
        <path d="M${num(32 + rx * 0.3)} ${num(mouthY - 3.4)} q-1.4 3.2 0.3 5.2" fill="none" stroke="${skinDark}" stroke-width="0.9" opacity="0.6" stroke-linecap="round"/>
        <path d="M${num(32 - rx * 0.3)} ${num(mouthY - 3.4)} q1.4 3.2 -0.3 5.2" fill="none" stroke="${skinDark}" stroke-width="0.9" opacity="0.6" stroke-linecap="round"/>
        <path d="M${num(leftEye - 2.6)} ${num(eyeY + eyeRy + 0.8)} q2.6 1.2 5.2 0" fill="none" stroke="${skinDark}" stroke-width="0.8" opacity="0.45" stroke-linecap="round"/>
        <path d="M${num(rightEye - 2.6)} ${num(eyeY + eyeRy + 0.8)} q2.6 1.2 5.2 0" fill="none" stroke="${skinDark}" stroke-width="0.8" opacity="0.45" stroke-linecap="round"/>`
      : '';

  const lensW = Math.min(7.4, eyeGap - 2.2);
  const glasses = look.glasses
    ? `<g data-part="glasses">
        <rect x="${num(leftEye - lensW / 2)}" y="${num(eyeY - 3)}" width="${num(lensW)}" height="6" rx="1.6" fill="${WHITE}" fill-opacity="0.12" stroke="${INK}" stroke-width="1.5"/>
        <rect x="${num(rightEye - lensW / 2)}" y="${num(eyeY - 3)}" width="${num(lensW)}" height="6" rx="1.6" fill="${WHITE}" fill-opacity="0.12" stroke="${INK}" stroke-width="1.5"/>
        <path d="M${num(leftEye + lensW / 2)} ${num(eyeY - 0.4)} h${num(eyeGap - lensW)}" stroke="${INK}" stroke-width="1.2"/>
        <path d="M${num(leftEye - lensW / 2)} ${num(eyeY - 1)} h-3 M${num(rightEye + lensW / 2)} ${num(eyeY - 1)} h3" stroke="${INK}" stroke-width="1.2"/>
      </g>`
    : '';

  const face = `
    <path data-part="head" d="${headOutline(m)}" fill="${skin}" stroke="${INK}" stroke-width="1.5"/>
    <path d="${cheekShadow(m)}" fill="${skinDark}" opacity="0.45"/>
    <ellipse data-part="eye-left" cx="${num(leftEye)}" cy="${num(eyeY)}" rx="${num(eyeR)}" ry="${num(eyeRy)}" fill="${WHITE}" stroke="${INK}" stroke-width="0.9"/>
    <ellipse data-part="eye-right" cx="${num(rightEye)}" cy="${num(eyeY)}" rx="${num(eyeR)}" ry="${num(eyeRy)}" fill="${WHITE}" stroke="${INK}" stroke-width="0.9"/>
    <circle cx="${num(leftEye + 0.5)}" cy="${num(eyeY + 0.3)}" r="1.7" fill="${INK}"/>
    <circle cx="${num(rightEye + 0.5)}" cy="${num(eyeY + 0.3)}" r="1.7" fill="${INK}"/>
    <circle cx="${num(leftEye + 1.1)}" cy="${num(eyeY - 0.5)}" r="0.5" fill="${WHITE}" opacity="0.9"/>
    <circle cx="${num(rightEye + 1.1)}" cy="${num(eyeY - 0.5)}" r="0.5" fill="${WHITE}" opacity="0.9"/>
    <path data-part="brow-left" d="M${num(leftEye - 3.9)} ${num(browY + 0.4)} q3.9 ${num(browArch)} 7.6 0" fill="none" stroke="${INK}" stroke-width="${browW}" stroke-linecap="round"/>
    <path data-part="brow-right" d="M${num(rightEye - 3.7)} ${num(browY)} q3.9 ${num(browArch)} 7.6 0" fill="none" stroke="${INK}" stroke-width="${browW}" stroke-linecap="round"/>
    <path data-part="nose" d="M${num(32.8)} ${num(eyeY + 2.6)} q0.3 ${num(f.age === 'elder' ? 4 : 3.4)} -1.6 ${num(f.age === 'elder' ? 5 : 4.4)}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
    ${ageMarks}
    ${mouth}
    ${cheekCut}
    ${glasses}
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

  // A styled crop follows the skull: the long head gets a narrower haircut, and age
  // takes volume off the top. Authored headgear is left exactly as drawn, because a
  // gele or a helmet is the identifying feature, not a hairstyle.
  if (!look.headpiece) {
    const volume = f.age === 'young' ? 1.04 : f.age === 'elder' ? 0.95 : 1;
    const squeeze = rx / 15.2;
    const dy = (m.top - 11.6) * 0.6;
    hairShape = `<g data-part="hair" transform="translate(0 ${num(dy)}) translate(32 20) scale(${num(squeeze * volume)} ${num(volume)}) translate(-32 -20)">${hairShape}</g>`;
  } else {
    hairShape = `<g data-part="hair">${hairShape}</g>`;
  }

  return `${face}${hairShape}`;
}

/** A soft hairline tone for bald characters, so the crown is not a flat blob. */
const inkish = (look: CharacterLook): string => shade(look.skin, 0.35);

export function characterSprite(look: CharacterLook, options: SpriteOptions = {}): SpriteGeometry {
  const width = options.width ?? 80;
  const height = width * 2;
  const flip = options.flip ? '<g transform="scale(-1,1) translate(-64,0)">' : '';
  const flipEnd = options.flip ? '</g>' : '';
  const shadow = options.shadow === false
    ? ''
    : `<ellipse cx="32" cy="123.4" rx="19" ry="4.2" fill="#000" opacity="0.16"/>`;

  const tilt = look.posture.headTilt;
  const headMarkup = tilt
    ? `<g transform="rotate(${num(tilt)} 32 46)">${head(look)}</g>`
    : head(look);

  // Posture: the upper body leans from the hem, not the hips, so the shoulder line
  // tilts while the legs and shoes stay planted on y = 124.
  const lean = look.posture.shoulderTilt;
  const upper = `
    ${torsoPaths(look.outfit, look.top, look.bottom)}
    ${arms(look.outfit, look.top, look.skin, look.posture.armOut)}
    ${headMarkup}
  `;

  const body = `
    ${legs(look.outfit, look.bottom)}
    ${lean ? `<g transform="rotate(${num(lean)} 32 112)">${upper}</g>` : upper}
  `;

  // Foreshorten for a camera 43 degrees above the floor, and let the look's build
  // and height reach the drawing: a crowd of identically-proportioned sprites is
  // the same clone problem in a different renderer. 0.93 rather than 0.94 leaves a
  // pixel of headroom so the tallest, fullest-haired figure still fits the box.
  const sx = 0.94 * look.build;
  const sy = 0.93 * look.height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 128" width="${width}" height="${height}" class="char-sprite" style="overflow:visible">
    ${shadow}
    ${flip}<g transform="translate(32 124) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-32 -124)">${body}</g>${flipEnd}
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
