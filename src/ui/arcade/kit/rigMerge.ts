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

/**
 * Four-step ramp. `MeshToonMaterial` quantises the diffuse term into bands, which is
 * what makes a form read as painted rather than rendered: the concept art has two or
 * three tones per surface and no specular at all.
 */
function toonRamp(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([96, 158, 214, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Shared by every character in the scene: one material, many coloured vertices. */
export const CHARACTER_MATERIAL = new THREE.MeshToonMaterial({
  vertexColors: true,
  gradientMap: toonRamp(),
  name: 'character-toon',
});

/** Attributes kept on a merged rig: the material needs nothing else. */
const KEEP = new Set(['position', 'normal']);

function isMergeable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh) return false;
  const material = mesh.material as THREE.MeshStandardMaterial;
  if (Array.isArray(mesh.material)) return false;
  // Only lit surfaces merge. Unlit markers (the symptom bubble, ground rings) keep
  // their own material because baking them would freeze them into the rig: their
  // spin and hover are driven by their own transform, which the merge consumes.
  if (!material.isMeshStandardMaterial) return false;
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
 *
 * `matrix` overrides the mesh's own local matrix — used when flattening a whole rig
 * into one mesh, where each part has to be expressed relative to the rig root rather
 * than relative to its own parent.
 */
function bake(mesh: THREE.Mesh, matrix?: THREE.Matrix4): THREE.BufferGeometry {
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

  if (matrix) {
    geo.applyMatrix4(matrix);
  } else {
    mesh.updateMatrix();
    geo.applyMatrix4(mesh.matrix);
  }
  return geo;
}

/** Replaces a group's mergeable mesh children with one vertex-coloured mesh. */
function mergeGroup(group: THREE.Object3D): void {
  const targets = group.children.filter((child) => isMergeable(child as THREE.Mesh)) as THREE.Mesh[];
  // One child still gets converted: it moves onto the shared vertex-coloured
  // material, so the whole crowd batches instead of binding a colour per part.
  if (targets.length < 1) return;

  const geos = targets.map((mesh) => bake(mesh));
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

/**
 * Flatten an entire rig into one mesh, joints included.
 *
 * Correct only for characters that never animate per joint — staff and any other
 * static figure. A character that walks must keep `mergeRigVertexColors`, because
 * collapsing its limbs would freeze the walk cycle into a T-pose silhouette.
 *
 * Transparent and unlit children (the ground shadow) are left alone: they need their
 * own material, and one of them needs its own transform.
 */
export function mergeRigSingleMesh(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (obj !== root && mesh.isMesh && isMergeable(mesh)) targets.push(mesh);
  });
  if (targets.length < 2) return;

  const geos = targets.map((mesh) => {
    const relative = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    return bake(mesh, relative);
  });
  const merged = mergeGeometries(geos, false);
  for (const geo of geos) geo.dispose();
  if (!merged) return;

  const castShadow = targets.some((m) => m.castShadow);
  const receiveShadow = targets.some((m) => m.receiveShadow);
  for (const mesh of targets) mesh.removeFromParent();

  const out = new THREE.Mesh(merged, CHARACTER_MATERIAL);
  out.castShadow = castShadow;
  out.receiveShadow = receiveShadow;
  out.name = 'rig-flat';
  root.add(out);
}
