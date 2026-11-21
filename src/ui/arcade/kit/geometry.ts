import * as THREE from 'three';

/**
 * The kit's one geometric idea: nothing in this room is a bare `BoxGeometry`.
 *
 * A raw box has twelve 90° edges, and under a directional light each one catches
 * a hard, aliased highlight that reads as "programmer art". Cutting every edge
 * with a 3–5 cm chamfer costs 32 extra triangles and gives the room an actual
 * edge highlight, which is most of what makes Sims Mobile props look made.
 */
export interface ChamferOptions {
  /** Chamfer width in metres. Clamped to 49 % of the smallest half-extent. */
  chamfer?: number;
}

/**
 * A box with every edge and corner cut.
 *
 * Built from an explicit 24-point hull (8 corners x 3 points each) rather than a
 * subdivision library: 6 face quads + 12 edge quads + 8 corner triangles = 44
 * triangles, always, at any size. Winding is fixed per face by testing the face
 * normal against its centroid, so no face can end up inside-out for a negative
 * or mirrored size.
 */
export function chamferBox(width: number, height: number, depth: number, chamfer = 0.035): THREE.BufferGeometry {
  const hx = Math.abs(width) / 2;
  const hy = Math.abs(height) / 2;
  const hz = Math.abs(depth) / 2;
  const c = Math.max(0, Math.min(chamfer, Math.min(hx, hy, hz) * 0.49));

  // points[signIndex][fullAxis] — one coordinate keeps the full extent, the other
  // two are pulled in by the chamfer.
  const points: THREE.Vector3[][] = [];
  for (let s = 0; s < 8; s++) {
    const sx = s & 1 ? 1 : -1;
    const sy = s & 2 ? 1 : -1;
    const sz = s & 4 ? 1 : -1;
    points[s] = [
      new THREE.Vector3(sx * hx, sy * (hy - c), sz * (hz - c)),
      new THREE.Vector3(sx * (hx - c), sy * hy, sz * (hz - c)),
      new THREE.Vector3(sx * (hx - c), sy * (hy - c), sz * hz),
    ];
  }

  const sign = (x: number, y: number, z: number): number => (x > 0 ? 1 : 0) | (y > 0 ? 2 : 0) | (z > 0 ? 4 : 0);
  const at = (x: number, y: number, z: number, k: 0 | 1 | 2): THREE.Vector3 => points[sign(x, y, z)][k];

  const tris: THREE.Vector3[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3): void => {
    // Outward winding: flip if the face normal points back at the origin.
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c2, a));
    const centroid = new THREE.Vector3().add(a).add(b).add(c2).multiplyScalar(1 / 3);
    if (normal.dot(centroid) < 0) tris.push(a, c2, b);
    else tris.push(a, b, c2);
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3, d: THREE.Vector3): void => {
    push(a, b, c2);
    push(a, c2, d);
  };

  // 6 face quads
  for (const sx of [-1, 1]) quad(at(sx, 1, 1, 0), at(sx, -1, 1, 0), at(sx, -1, -1, 0), at(sx, 1, -1, 0));
  for (const sy of [-1, 1]) quad(at(1, sy, 1, 1), at(-1, sy, 1, 1), at(-1, sy, -1, 1), at(1, sy, -1, 1));
  for (const sz of [-1, 1]) quad(at(1, 1, sz, 2), at(-1, 1, sz, 2), at(-1, -1, sz, 2), at(1, -1, sz, 2));

  // 12 edge quads
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) quad(at(1, sy, sz, 0), at(1, sy, sz, 1), at(-1, sy, sz, 1), at(-1, sy, sz, 0));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) quad(at(sx, 1, sz, 1), at(sx, 1, sz, 2), at(sx, -1, sz, 2), at(sx, -1, sz, 1));
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) quad(at(sx, sy, 1, 0), at(sx, sy, 1, 2), at(sx, sy, -1, 2), at(sx, sy, -1, 0));
  }

  // 8 corner triangles
  for (let s = 0; s < 8; s++) {
    const [p0, p1, p2] = points[s];
    push(p0, p1, p2);
  }

  const positions = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => {
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Flat normals: a chamfer wants a crisp facet per face, not a smoothed blob.
  geometry.computeVertexNormals();

  // UVs and an index, because primitives get merged: BufferGeometryUtils refuses
  // geometries whose attribute sets differ, and BoxGeometry has both. Without this
  // every mergeMeshes() call logged "failed with geometry at index 1" on the boot
  // of each page (Instabox PC boxes, two errors per viewport).
  const normals = geometry.getAttribute('normal');
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    const nx = Math.abs(normals.getX(i));
    const ny = Math.abs(normals.getY(i));
    const nz = Math.abs(normals.getZ(i));
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    // Planar projection on the dominant axis, normalised by the box extents.
    const u = nx >= ny && nx >= nz ? pz / (hz * 2 || 1) + 0.5 : px / (hx * 2 || 1) + 0.5;
    const v = ny >= nx && ny >= nz ? pz / (hz * 2 || 1) + 0.5 : py / (hy * 2 || 1) + 0.5;
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const index: number[] = [];
  for (let i = 0; i < positions.length / 3; i++) index.push(i);
  geometry.setIndex(index);

  geometry.computeBoundingBox();
  geometry.userData.tris = positions.length / 9;
  return geometry;
}

/**
 * A single leaf blade: a tapered strip with a raised midrib and a droop.
 *
 * A flat quad reads as a paper cut-out from the isometric camera, which is the
 * one angle this game is ever seen from. Three segments and a V-fold cost 12
 * triangles and give the leaf a highlight down its spine plus a silhouette that
 * curls away from the pot. The blade grows along +Y from the origin, so the
 * caller only has to yaw it around the pot and tilt it outward.
 */
export function leafBlade(length: number, width: number, droop = 0.18, fold = 0.05): THREE.BufferGeometry {
  const segments = 3;
  const positions: number[] = [];
  const indices: number[] = [];
  const half = width / 2;

  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    // Lanceolate taper: widest at 45 %, pinched at the stem and the tip.
    const taper = Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.7;
    const w = Math.max(0.012, half * (0.35 + 0.65 * taper));
    const y = t * length;
    // Arch: the blade rises then falls away from the crown.
    const z = -droop * t * t * length;
    const cup = fold * (taper * 0.6 + 0.4);
    // left edge, midrib, right edge
    positions.push(-w, y, z + cup, 0, y, z, w, y, z + cup);
  }

  for (let s = 0; s < segments; s++) {
    const a = s * 3;
    const b = a + 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((segments + 1) * 3 * 2).fill(0), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

/** Triangle count of any geometry, indexed or not. */
export function triCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}
