import { describe, it, expect } from 'vitest';
import {
  customerLook,
  staffLook,
  HEAD_SHAPES,
  EYE_SPACINGS,
  BROW_WEIGHTS,
  MOUTHS,
  CHEEKS,
  AGES,
  BEARD_STYLES,
  type CharacterLook,
} from '../../src/ui/arcade/kit/look';
import { characterSprite } from '../../src/ui/arcade/kit/charSprite';

const data = (id: string) =>
  ({
    id,
    name: id,
    title: 'x',
    avatarKey: id,
    initialQuote: '',
    symptoms: [],
    symptomLabel: '',
    matchedProductIds: [],
    budget: 1000,
    mood: 'Patient',
    patienceMax: 3,
    preferredPayment: 'cash',
    dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
  }) as never;

const faceOf = (id: string) => customerLook(data(id)).face;

const signature = (look: CharacterLook): string => {
  const f = look.face;
  return [f.headShape, f.eyeSpacing, f.browWeight, f.mouth, f.cheek, f.age].join('/');
};

const forty = Array.from({ length: 40 }, (_, i) => `cust_face_${i.toString(36)}`);
/** Every point a path actually visits (endpoints + control points), absolute. */
function pathPoints(d: string): Array<{ x: number; y: number }> {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const pts: Array<{ x: number; y: number }> = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let cmd = '';
  const num = (): number => Number(tokens[i++]);
  const add = (x: number, y: number): void => {
    cx = x;
    cy = y;
    pts.push({ x, y });
  };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    // Relative control points are measured from where the command started, not from
    // the previous control point.
    const bx = cx;
    const by = cy;
    const dx = (): number => num() + (rel ? bx : 0);
    const dy = (): number => num() + (rel ? by : 0);
    switch (cmd.toUpperCase()) {
      case 'M': {
        const x = dx();
        const y = dy();
        add(x, y);
        startX = x;
        startY = y;
        // Subsequent pairs are implicit lineto.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        add(dx(), dy());
        break;
      case 'H':
        add(dx(), cy);
        break;
      case 'V':
        add(cx, dy());
        break;
      case 'C':
        add(dx(), dy());
        add(dx(), dy());
        add(dx(), dy());
        break;
      case 'S':
      case 'Q':
        add(dx(), dy());
        add(dx(), dy());
        break;
      case 'T':
        add(dx(), dy());
        break;
      case 'Z':
        cx = startX;
        cy = startY;
        break;
      default:
        i++;
        break;
    }
  }
  return pts;
}

const attr = (markup: string, part: string, name: string): string | null => {
  const tag = markup.match(new RegExp(`<[^>]*data-part="${part}"[^>]*>`));
  if (!tag) return null;
  const m = tag[0].match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

describe('face traits', () => {
  it('derives the same face for the same id', () => {
    for (const id of forty.slice(0, 8)) {
      expect(customerLook(data(id))).toEqual(customerLook(data(id)));
    }
  });

  it('gives forty customers at least six distinct faces', () => {
    const signatures = new Set(forty.map((id) => signature(customerLook(data(id)))));
    expect(signatures.size).toBeGreaterThanOrEqual(6);
  });

  it('draws every trait value from the declared vocabulary', () => {
    const looks = Array.from({ length: 160 }, (_, i) => customerLook(data(`cust_vocab_${i}`)));
    const values = {
      headShape: new Set(looks.map((l) => l.face.headShape)),
      eyeSpacing: new Set(looks.map((l) => l.face.eyeSpacing)),
      browWeight: new Set(looks.map((l) => l.face.browWeight)),
      mouth: new Set(looks.map((l) => l.face.mouth)),
      cheek: new Set(looks.map((l) => l.face.cheek)),
      age: new Set(looks.map((l) => l.face.age)),
    };
    expect([...values.headShape].every((v) => HEAD_SHAPES.includes(v))).toBe(true);
    expect([...values.eyeSpacing].every((v) => EYE_SPACINGS.includes(v))).toBe(true);
    expect([...values.browWeight].every((v) => BROW_WEIGHTS.includes(v))).toBe(true);
    expect([...values.mouth].every((v) => MOUTHS.includes(v))).toBe(true);
    expect([...values.cheek].every((v) => CHEEKS.includes(v))).toBe(true);
    expect([...values.age].every((v) => AGES.includes(v))).toBe(true);
    // No single head shape may own the crowd.
    for (const [shape, set] of Object.entries(values)) {
      expect(set.size, `${shape} never varies`).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not let one head shape swallow the crowd', () => {
    const looks = Array.from({ length: 160 }, (_, i) => customerLook(data(`cust_shape_${i}`)));
    for (const shape of HEAD_SHAPES) {
      const count = looks.filter((l) => l.face.headShape === shape).length;
      expect(count, `${shape} is ${count}/160`).toBeGreaterThan(20);
    }
  });

  it('keeps the four authored characters as four different people', () => {
    const cast = ['cust_mama_ngozi', 'cust_emeka', 'cust_bayo', 'cust_danjuma'].map((id) =>
      customerLook(data(id)),
    );
    expect(new Set(cast.map(signature)).size).toBe(4);
    expect(cast[0].headpiece).toBe('gele');
    expect(cast[0].accent).toBe(0xbf360c);
    expect(cast[1].headpiece).toBe('helmet');
    expect(cast[2].headpiece).toBe('newsboy');
    expect(cast[3].headpiece).toBe('fula');
    expect(cast[3].accent).toBe(0xd4af37);
  });

  it('gives staff faces too', () => {
    for (const role of ['stocker', 'cashier', 'cleaner'] as const) {
      const look = staffLook(role);
      expect(look.face).toBeTruthy();
      expect(HEAD_SHAPES).toContain(look.face.headShape);
      expect(new Set([staffLook('stocker'), staffLook('cashier'), staffLook('cleaner')].map(signature)).size).toBe(3);
    }
  });
});

describe('posture', () => {
  it('varies stance across the crowd, not just clothes', () => {
    const looks = forty.map((id) => customerLook(data(id)));
    const leans = new Set(looks.map((l) => `${l.posture.shoulderTilt}/${l.posture.headTilt}`));
    expect(leans.size).toBeGreaterThanOrEqual(8);
    expect(new Set(looks.map((l) => l.posture.armOut)).size).toBeGreaterThanOrEqual(2);
  });

  it('keeps posture subtle enough to stay inside the box', () => {
    for (const id of forty) {
      const p = customerLook(data(id)).posture;
      expect(Math.abs(p.shoulderTilt)).toBeLessThanOrEqual(4);
      expect(Math.abs(p.headTilt)).toBeLessThanOrEqual(6);
      expect([-1, 0, 1]).toContain(p.armOut);
    }
  });

  it('stoops the elders more than the young', () => {
    const looks = Array.from({ length: 200 }, (_, i) => customerLook(data(`cust_age_${i}`)));
    const mean = (age: string): number => {
      const group = looks.filter((l) => l.face.age === age);
      return group.reduce((n, l) => n + Math.abs(l.posture.shoulderTilt), 0) / group.length;
    };
    expect(mean('elder')).toBeGreaterThan(mean('young'));
  });
});

describe('face markup', () => {
  const base = (): CharacterLook => customerLook(data('cust_markup'));

  it('draws three genuinely different head silhouettes', () => {
    const heads = HEAD_SHAPES.map((headShape) => {
      const look = { ...base(), face: { ...base().face, headShape } };
      const svg = characterSprite(look).svg;
      return attr(svg, 'head', 'd');
    });
    expect(new Set(heads).size).toBe(3);
    // Across the crowd, all three shapes actually reach the renderer.
    const drawn = new Set(
      forty.map((id) => attr(characterSprite(customerLook(data(id))).svg, 'head', 'd')),
    );
    expect(drawn.size).toBe(3);
  });

  it('moves the eyes apart when the trait says wide', () => {
    const close = { ...base(), face: { ...base().face, eyeSpacing: 'close' as const } };
    const wide = { ...base(), face: { ...base().face, eyeSpacing: 'wide' as const } };
    const gap = (look: CharacterLook): number => {
      const svg = characterSprite(look).svg;
      const l = Number(attr(svg, 'eye-left', 'cx'));
      const r = Number(attr(svg, 'eye-right', 'cx'));
      return r - l;
    };
    expect(attr(characterSprite(close).svg, 'eye-left', 'cx')).not.toBeNull();
    expect(gap(wide)).toBeGreaterThan(gap(close) + 2);
  });

  it('changes brow weight, mouth and cheek, not just colour', () => {
    const mouthPaths = MOUTHS.map((mouth) => {
      const look = { ...base(), face: { ...base().face, mouth } };
      return attr(characterSprite(look).svg, 'mouth', 'd');
    });
    expect(new Set(mouthPaths).size).toBe(3);

    const brows = BROW_WEIGHTS.map((browWeight) => {
      const look = { ...base(), face: { ...base().face, browWeight } };
      return Number(attr(characterSprite(look).svg, 'brow-left', 'stroke-width'));
    });
    expect(brows[0]).toBeLessThan(brows[1]);
    expect(brows[1]).toBeLessThan(brows[2]);

    const soft = characterSprite({ ...base(), face: { ...base().face, cheek: 'soft' } }).svg;
    const cut = characterSprite({ ...base(), face: { ...base().face, cheek: 'cut' } }).svg;
    expect(attr(soft, 'cheek-left', 'd')).toBeNull();
    expect(attr(cut, 'cheek-left', 'd')).not.toBeNull();
  });

  it('tilts the head and shoulders without moving the feet', () => {
    const look = {
      ...base(),
      posture: { shoulderTilt: 3, headTilt: -4, armOut: 1 as const },
    };
    const svg = characterSprite(look).svg;
    expect(svg).toMatch(/rotate\(3 32 112\)/);
    expect(svg).toMatch(/rotate\(-4 32 46\)/);
    // The outer transform still pivots on the floor line.
    expect(svg).toContain('translate(32 124)');
  });

  it('keeps every generated figure inside the 64 x 128 box, feet on 124', () => {
    // 160 ids, not 40: the wide hairstyles (afro) and the beards are new geometry and
    // the tallest/fullest combination is what overflows a box.
    const crowd = [...forty, ...Array.from({ length: 120 }, (_, i) => `cust_bounds_${i}`)];
    for (const id of [...crowd, 'cust_mama_ngozi', 'cust_emeka', 'cust_bayo', 'cust_danjuma']) {
      const svg = characterSprite(customerLook(data(id))).svg;
      expect(svg).toContain('viewBox="0 0 64 128"');

      const scale = svg.match(/scale\(([\d.]+) ([\d.]+)\)/);
      expect(scale, `${id} lost its scale`).not.toBeNull();
      const sx = Number(scale![1]);
      const sy = Number(scale![2]);

      const ds = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
      expect(ds.length).toBeGreaterThan(5);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const d of ds) {
        for (const p of pathPoints(d)) {
          // Art coordinates are scaled about (32, 124) by the outer transform.
          const x = 32 + (p.x - 32) * sx;
          const y = 124 + (p.y - 124) * sy;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      expect(minX, `${id} overflows left`).toBeGreaterThanOrEqual(0);
      expect(maxX, `${id} overflows right`).toBeLessThanOrEqual(64);
      expect(minY, `${id} overflows the top`).toBeGreaterThanOrEqual(0);
      expect(maxY, `${id} sinks through the floor`).toBeLessThanOrEqual(128);
      // Shoes are authored on the floor line, so the standing height is exact.
      expect(Math.abs(maxY - 124), `${id} floats or sinks`).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('silhouette: beard, bag and hair mass', () => {
  const base = (): CharacterLook => customerLook(data('cust_silhouette'));

  const hairPoints = (svg: string): Array<{ x: number; y: number }> => {
    const start = svg.indexOf('data-part="hair"');
    expect(start, 'no hair group in the sprite').toBeGreaterThan(-1);
    const end = svg.indexOf('</g>', start);
    const block = svg.slice(start, end);
    const ds = [...block.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    expect(ds.length).toBeGreaterThan(0);
    return ds.flatMap(pathPoints);
  };

  it('draws a beard only when the look has one, in three different shapes', () => {
    const bare = characterSprite({ ...base(), beard: false }).svg;
    expect(bare).not.toContain('data-part="beard"');

    const shapes = BEARD_STYLES.map((beardStyle) =>
      characterSprite({ ...base(), beard: true, beardStyle }).svg,
    );
    const marks = shapes.map((svg) => attr(svg, 'beard', 'data-beard'));
    expect(marks).toEqual(['boxed', 'chin', 'goatee']);
    // Three shapes, not three tints of one path.
    const outlines = shapes.map((svg) => {
      const at = svg.indexOf('data-part="beard"');
      return svg.slice(at, svg.indexOf('</g>', at)).replace(/#[0-9a-f]{6}/gi, '');
    });
    expect(new Set(outlines).size).toBe(3);
  });

  it('keeps the mouth readable on top of a beard', () => {
    const bearded = characterSprite({ ...base(), beard: true, beardStyle: 'boxed' }).svg;
    const beardAt = bearded.indexOf('data-part="beard"');
    const mouthAt = bearded.indexOf('data-part="mouth"');
    expect(beardAt).toBeGreaterThan(-1);
    expect(mouthAt).toBeGreaterThan(beardAt);
  });

  it('hangs a shoulder bag only when the look carries one', () => {
    const without = characterSprite({ ...base(), bag: false }).svg;
    expect(without).not.toContain('data-part="bag-strap"');

    const withBag = characterSprite({ ...base(), bag: true }).svg;
    expect(attr(withBag, 'bag-strap', 'd')).not.toBeNull();
    // The strap crosses the body, so it breaks the outline the torso would keep.
    const points = pathPoints(attr(withBag, 'bag-strap', 'd')!);
    expect(Math.min(...points.map((p) => p.x))).toBeLessThan(24);
    expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(40);
  });

  it('gives the afro more width than the skull and the braids a length', () => {
    const headMetricsRx = 15.8;
    const afro = hairPoints(
      characterSprite({ ...base(), hair: 'afro', headpiece: null }).svg,
    );
    const fade = hairPoints(
      characterSprite({ ...base(), hair: 'fade', headpiece: null }).svg,
    );
    const spread = Math.max(...afro.map((p) => Math.abs(p.x - 32)));
    const tight = Math.max(...fade.map((p) => Math.abs(p.x - 32)));
    expect(spread).toBeGreaterThan(headMetricsRx);
    expect(spread).toBeGreaterThan(tight + 3);

    const braided = hairPoints(
      characterSprite({ ...base(), hair: 'braids', headpiece: null }).svg,
    );
    expect(Math.max(...braided.map((p) => p.y))).toBeGreaterThan(55);
  });

  it('draws every hairstyle without throwing and without leaving the box', () => {
    for (const hair of ['fade', 'lowcut', 'braids', 'afro', 'headwrap', 'cap', 'bald', 'helmet'] as const) {
      const svg = characterSprite({ ...base(), hair, headpiece: null, build: 1.2, height: 1.12 }).svg;
      expect(svg).toContain('data-part="hair"');
      const scale = svg.match(/scale\(([\d.]+) ([\d.]+)\)/)!;
      const sx = Number(scale[1]);
      const sy = Number(scale[2]);
      for (const point of hairPoints(svg)) {
        const x = 32 + (point.x - 32) * sx;
        const y = 124 + (point.y - 124) * sy;
        expect(x, `${hair} overflows left`).toBeGreaterThanOrEqual(0);
        expect(x, `${hair} overflows right`).toBeLessThanOrEqual(64);
        expect(y, `${hair} overflows the top`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
