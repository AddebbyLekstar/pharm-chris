import * as THREE from 'three';

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
}

/** Palette + roughness from the design spec (§3). These numbers are the contract. */
export const FAMILY_SPECS: Record<MaterialFamily, FamilySpec> = {
  plaster: { color: 0xefe6d6, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.6 },
  tile: { color: 0xe8dcc8, roughness: 0.35, metalness: 0.04, envMapIntensity: 0.8 },
  wood: { color: 0x8a5a3b, roughness: 0.55, metalness: 0.04, envMapIntensity: 0.7 },
  steel: { color: 0xc9ced2, roughness: 0.42, metalness: 0.55, envMapIntensity: 0.9 },
  glass: { color: 0xd7f0f4, roughness: 0.16, metalness: 0.06, transparent: true, opacity: 0.28, depthWrite: false },
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
  mat.name = `kit-${family}`;
  return mat;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

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
