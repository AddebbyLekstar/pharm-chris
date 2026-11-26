import * as THREE from 'three';
import { textures, type RoughnessKind } from '../textures';

/**
 * Six material families, and no seventh.
 *
 * The old scene had ~40 one-off `MeshStandardMaterial`s, so every prop was its own
 * draw state and nothing in the room agreed on how rough a surface should be. Six
 * families derived from the concept frame's palette give the room a consistent
 * material grammar: plaster is dead matte, tile catches a little sheen, wood is
 * satin, steel is cool, glass is almost mirror-smooth, paper is flat.
 */
export type MaterialFamily = 'plaster' | 'tile' | 'wood' | 'steel' | 'glass' | 'paper';

export interface FamilySpec {
  color: number;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  envMapIntensity?: number;
  /** Roughness varies per texel; `roughness` then carries 1 and the map the value. */
  roughnessMap?: boolean;
}

/**
 * Palette + roughness from the design spec (§6.3). These numbers are the contract,
 * so `tests/arcade/materials_spec.test.ts` asserts them against a literal copy of
 * the table: a family that drifts from the spec is a failing test, not a judgement
 * call at review time.
 */
export const FAMILY_SPECS: Record<MaterialFamily, FamilySpec> = {
  plaster: { color: 0xefe6d6, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.6, roughnessMap: true },
  tile: { color: 0xe8dcc8, roughness: 0.35, metalness: 0.04, envMapIntensity: 0.8 },
  wood: { color: 0x8a5a3b, roughness: 0.55, metalness: 0.04, envMapIntensity: 0.7, roughnessMap: true },
  // Powder-coated, not chrome: the spec puts metalness at 0.15, and 0.55 turned
  // every bracket and shelf upright into a mirror the room does not have light for.
  steel: { color: 0xc9ced2, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.9, roughnessMap: true },
  // §6.3 glass: opacity 0.16, roughness 0.06, env 1.6, depthWrite false. The old
  // 0.28 / 0.16 read as frosted plastic; glass that reflects more than it tints is
  // what makes a sneeze guard legible without hiding the customer behind it.
  glass: { color: 0xd7f0f4, roughness: 0.06, metalness: 0.06, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 },
  paper: { color: 0xf6f1e6, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.5 },
};

function make(family: MaterialFamily, color?: number): THREE.MeshStandardMaterial {
  const spec = FAMILY_SPECS[family];
  const mat = new THREE.MeshStandardMaterial({
    color: color ?? spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
    depthWrite: spec.depthWrite ?? true,
  });
  mat.envMapIntensity = spec.envMapIntensity ?? 0.7;
  if (spec.roughnessMap) {
    // Same pattern as the terrazzo floor: the map carries the value, the scalar
    // stays 1 so three multiplies rather than clamps it.
    const map = textures()?.roughness[family as RoughnessKind];
    if (map) {
      mat.roughnessMap = map;
      mat.roughness = 1;
    }
  }
  mat.name = `kit-${family}`;
  return mat;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Practicals: surfaces that are their own light source.
 *
 * A pendant shade with no lit underside and a fridge with no glowing panel are the
 * two places a warm room reads as a model rather than a place. They stay accents of
 * the six families — same `MeshStandardMaterial` contract, emissive added — so the
 * family count does not move and each one is a single cached material, which means
 * one merged draw for every lamp in the room.
 */
export type PracticalKind = 'lampShade' | 'fridgePanel';

const PRACTICAL_SPECS: Record<
  PracticalKind,
  { name: string; color: number; emissive: number; emissiveIntensity: number; roughness: number }
> = {
  // Warm, and only 0.9: a hotter disc blooms into a white hole at 360 px. The base
  // colour is near-black on purpose — a practical must be emissive *only*. Given a
  // cream base, the 2.6-intensity sun alone took the disc to flat white and the lamp
  // read as off regardless of how bright its emissive was.
  lampShade: { name: 'practical-lamp', color: 0x0b0a08, emissive: 0xff9d3d, emissiveIntensity: 0.9, roughness: 0.6 },
  // §6.3's cold-chain panel: teal at 0.55, bright enough to read as refrigeration
  // through the glass door without lighting the aisle like a fifth point light. Same
  // rule: no albedo, or the sun bleaches the teal out of it.
  fridgePanel: { name: 'practical-fridge', color: 0x04191a, emissive: 0x2e8b8b, emissiveIntensity: 0.55, roughness: 0.6 },
};

/** The shared practical material. One instance per kind, so all lamps batch. */
export function practical(kind: PracticalKind): THREE.MeshStandardMaterial {
  const key = `practical:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = PRACTICAL_SPECS[kind];
  const mat = new THREE.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    roughness: spec.roughness,
    metalness: 0,
    // The pendant's diffuser is a disc seen from below by the physics and from above
    // by the only camera the game has. Single-sided, the lamp's own light source was
    // invisible in every frame: backface-culled by the shade and by the disc's own
    // winding.
    side: kind === 'lampShade' ? THREE.DoubleSide : THREE.FrontSide,
  });
  mat.name = spec.name;
  cache.set(key, mat);
  return mat;
}

/**
 * The shared family material. Callers may pass an accent colour (deep green wall,
 * terracotta trim) and still share one instance per family+colour pair, so the
 * renderer batches them together instead of binding a new material per prop.
 */
export function material(family: MaterialFamily, color?: number): THREE.MeshStandardMaterial {
  const key = color === undefined ? family : `${family}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const created = make(family, color);
  cache.set(key, created);
  return created;
}

/** The six base materials, for tests and for the material budget check. */
export const MATERIALS: Record<MaterialFamily, THREE.MeshStandardMaterial> = {
  plaster: material('plaster'),
  tile: material('tile'),
  wood: material('wood'),
  steel: material('steel'),
  glass: material('glass'),
  paper: material('paper'),
};

/**
 * Brass is an accent of steel, not a seventh family.
 *
 * The spec allows six families; a seventh would be a new shader contract and a new
 * thing to keep consistent. Brass is the same powder-coat mesh with different
 * numbers, so it stays inside `steel` and the family count stays six. One cached
 * instance, used on handles and sign frames only — anything more and the room turns
 * gold.
 */
export function brassAccent(): THREE.MeshStandardMaterial {
  const key = 'steel:brass';
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = make('steel', PALETTE.brass);
  mat.metalness = 0.85;
  mat.roughness = 0.3;
  mat.envMapIntensity = 1.0;
  mat.name = 'kit-steel-brass';
  cache.set(key, mat);
  return mat;
}

/** Palette accents from the spec, so colour literals live in one file. */
export const PALETTE = {
  deepGreen: 0x1f4b3f,
  plasterCream: 0xefe6d6,
  terracotta: 0xc2683f,
  brass: 0xb08a4a,
  coldTeal: 0x2e8b8b,
  terrazzo: 0xe8dcc8,
  inkNavy: 0x22303a,
} as const;
