import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapses a procedural rig's meshes into one mesh per material.
 *
 * The characters are built from ~25 box primitives each, which is 25 draw calls
 * per customer on a phone. Merging inside each animated socket keeps the rig
 * (head, arms, legs still rotate as groups) while cutting draws by roughly 5x.
 */
export function mergeChildMeshes(group: THREE.Group): void {
  const byMaterial = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const toRemove: THREE.Mesh[] = [];

  for (const child of [...group.children]) {
    if (!(child as THREE.Mesh).isMesh) continue;
    const mesh = child as THREE.Mesh;
    if (Array.isArray(mesh.material)) continue;
    const key = mesh.material.uuid;
    const bucket = byMaterial.get(key) ?? { material: mesh.material, geometries: [] };
    mesh.updateMatrix();
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrix);
    bucket.geometries.push(geo);
    byMaterial.set(key, bucket);
    toRemove.push(mesh);
  }

  if (!toRemove.length) return;

  for (const mesh of toRemove) group.remove(mesh);

  let added = 0;
  for (const { material, geometries } of byMaterial.values()) {
    if (geometries.length === 1) {
      const mesh = new THREE.Mesh(geometries[0], material);
      mesh.castShadow = true;
      group.add(mesh);
      added++;
      continue;
    }
    const merged = mergeGeometries(geometries, false);
    for (const geo of geometries) geo.dispose();
    if (!merged) {
      // Fall back to individual meshes rather than losing the model.
      for (const geo of geometries) {
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        group.add(mesh);
      }
      continue;
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    group.add(mesh);
    added++;
  }
  void added;
}

/** Recursively merges every group in a rig, then the parent. */
export function mergeRig(root: THREE.Group): void {
  for (const child of [...root.children]) {
    if ((child as THREE.Group).isGroup) mergeRig(child as THREE.Group);
  }
  mergeChildMeshes(root);
}
