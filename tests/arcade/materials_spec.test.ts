import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FAMILY_SPECS, MATERIALS, brassAccent, material, PALETTE } from '../../src/ui/arcade/kit/materials';
import { ROUGHNESS_BANDS, roughnessField } from '../../src/ui/arcade/textures';

/**
 * The spec table, copied by hand from
 * `docs/superpowers/specs/2026-11-19-graphics-redesign-design.md` §6.3.
 *
 * Written as literals on purpose: importing FAMILY_SPECS and comparing it to itself
 * would pass forever. If the spec changes, this table changes in the same commit.
 */
const SPEC = {
  plaster: { roughness: 0.86, metalness: 0.0, envMapIntensity: 0.6 },
  tile: { roughness: 0.35, metalness: 0.04, envMapIntensity: 0.8 },
  wood: { roughness: 0.55, metalness: 0.04, envMapIntensity: 0.7 },
  steel: { roughness: 0.42, metalness: 0.15, envMapIntensity: 0.9 },
  glass: { roughness: 0.06, metalness: 0.06, envMapIntensity: 1.6, opacity: 0.16 },
  paper: { roughness: 0.9, metalness: 0.0, envMapIntensity: 0.5 },
} as const;

describe('material families against spec §6.3', () => {
  for (const [family, spec] of Object.entries(SPEC)) {
    it(`${family} matches the spec numbers`, () => {
      const actual = FAMILY_SPECS[family as keyof typeof SPEC];
      expect(actual.roughness).toBeCloseTo(spec.roughness, 2);
      expect(actual.metalness).toBeCloseTo(spec.metalness, 2);
      expect(actual.envMapIntensity ?? 0.7).toBeCloseTo(spec.envMapIntensity, 2);
      if ('opacity' in spec) expect(actual.opacity).toBeCloseTo(spec.opacity, 2);
    });
  }

  it('glass does not write depth, so it cannot punch holes in what is behind it', () => {
    expect(MATERIALS.glass.transparent).toBe(true);
    expect(MATERIALS.glass.depthWrite).toBe(false);
  });

  it('stays six families — brass is an accent of steel', () => {
    expect(Object.keys(FAMILY_SPECS)).toHaveLength(6);
    expect(brassAccent()).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(brassAccent()).toBe(brassAccent());
    expect(brassAccent().metalness).toBeGreaterThan(MATERIALS.steel.metalness);
    expect(brassAccent().color.getHex()).toBe(PALETTE.brass);
  });

  it('shares one instance per family+colour, so unrelated props batch', () => {
    expect(material('steel', 0x123456)).toBe(material('steel', 0x123456));
    expect(material('steel', 0x123456)).not.toBe(material('steel', 0x654321));
  });
});

/**
 * P4: a single roughness number per family is why plaster, wood and steel read as
 * three tints of the same plastic. The maps carry the value (material roughness 1)
 * the way the terrazzo floor already does.
 */
describe('per-family roughness maps', () => {
  it('marks exactly the three matte families as mapped', () => {
    expect(FAMILY_SPECS.plaster.roughnessMap).toBe(true);
    expect(FAMILY_SPECS.wood.roughnessMap).toBe(true);
    expect(FAMILY_SPECS.steel.roughnessMap).toBe(true);
    expect(FAMILY_SPECS.tile.roughnessMap).toBeUndefined();
    expect(FAMILY_SPECS.glass.roughnessMap).toBeUndefined();
    expect(FAMILY_SPECS.paper.roughnessMap).toBeUndefined();
  });

  for (const kind of ['plaster', 'wood', 'steel'] as const) {
    it(`${kind} field stays inside its band`, () => {
      const field = roughnessField(kind, 256);
      expect(field).toHaveLength(256 * 256);
      let sum = 0;
      let min = 1;
      let max = 0;
      for (const value of field) {
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      const mean = sum / field.length;
      const band = ROUGHNESS_BANDS[kind];
      expect(mean).toBeGreaterThanOrEqual(band.min);
      expect(mean).toBeLessThanOrEqual(band.max);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1);
      // A field that is all one value is a constant dressed as a map.
      expect(max - min).toBeGreaterThan(0.05);
    });
  }

  it('is deterministic, so two boots shade identically', () => {
    expect(Array.from(roughnessField('wood', 64))).toEqual(Array.from(roughnessField('wood', 64)));
  });
});

