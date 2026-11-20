import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * One material per character joint.
 *
 * A character is built from ~20 boxes in six colours, and `mergeRig` merges them per
 * material *within each socket* — which is correct for animation, but leaves a
 * customer at 10-12 draw calls because every socket keeps three or four materials.
 * At ten simultaneous characters that is the whole headline draw-call budget on the
 * desktop tier (measured: 287 against a 240 ceiling).
 *
 * The fix is not skinning or a new asset pipeline: it is to stop using one material
 * per colour. Each vertex carries its part's colour instead, every socket collapses
 * to a single mesh, and the whole crowd shares one material. Animation is untouched
 * because joints stay separate objects.
 *
 * Trade-off, stated plainly: the rig loses per-part roughness (satin skin vs matte
 * shoes) and per-part metalness (the gele's sheen). At 46-90 px those differences are
 * not visible; the silhouette and colour blocking are what read.
 */

/** Shared by every character in the scene: one material, many coloured vertices. */
export const CHARACTER_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.02,
  name: 'character-vertex',
});

/** Attributes kept on a merged rig: the material needs nothing else. */
const KEEP = new Set(['position', 'normal']);

function isMergeable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh) return false;
  const material = mesh.material as THREE.MeshStandardMaterial;
  if (Array.isArray(mesh.material)) return false;
  // Transparent parts (glass, glow markers) must keep their own material.
  if (material.transparent) return false;
  // Anything textured needs its UVs and its own material.
  if (material.map || material.alphaMap) return false;
  if (!(mesh.geometry as THREE.BufferGeometry).attributes?.position) return false;
  return true;
}

/**
 * Bake `material.color` into a per-vertex colour attribute.
 *
 * Geometry is made non-indexed first: primitives in these rigs mix indexed and
 * non-indexed sources (BoxGeometry vs RoundedBox), and mergeGeometries refuses
 * attribute sets that do not line up.
 */
function bake(mesh: THREE.Mesh): THREE.BufferGeometry {
  const material = mesh.material as THREE.MeshStandardMaterial;
  const source = mesh.geometry as THREE.BufferGeometry;
  let geo = source.index ? source.toNonIndexed() : source.clone();

  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP.has(name)) geo.deleteAttribute(name);
  }

  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const { r, g, b } = material.color;
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  mesh.updateMatrix();
  geo.applyMatrix4(mesh.matrix);
  return geo;
}

/** Replaces a group's mergeable mesh children with one vertex-coloured mesh. */
function mergeGroup(group: THREE.Object3D): void {
  const targets = group.children.filter((child) => isMergeable(child as THREE.Mesh)) as THREE.Mesh[];
  // One child still gets converted: it moves onto the shared vertex-coloured
  // material, so the whole crowd batches instead of binding a colour per part.
  if (targets.length < 1) return;

  const geos = targets.map(bake);
  const merged = mergeGeometries(geos, false);
  for (const geo of geos) geo.dispose();
  if (!merged) return;

  const castShadow = targets.some((m) => m.castShadow);
  const receiveShadow = targets.some((m) => m.receiveShadow);
  for (const mesh of targets) group.remove(mesh);

  const out = new THREE.Mesh(merged, CHARACTER_MATERIAL);
  out.castShadow = castShadow;
  out.receiveShadow = receiveShadow;
  out.name = 'rig-merged';
  group.add(out);
}

/**
 * Merge every joint of a procedural character rig into one vertex-coloured mesh.
 *
 * Call after the model is built and before it is added to the scene. Joints keep
 * their transforms, so idle/walk/carry animations behave exactly as before.
 */
export function mergeRigVertexColors(root: THREE.Object3D): void {
  const groups: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj !== root) groups.push(obj);
  });

  // Children first: merging a parent does not touch a grandchild's geometry.
  for (const group of [...groups].reverse()) mergeGroup(group);
  mergeGroup(root);
}

/** Number of meshes in a rig — the unit the draw-call budget is spent in. */
export function rigMeshCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) n++;
  });
  return n;
}
