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
  // Non-indexed on purpose: a chamfer wants a crisp facet per face, not a smoothed
  // blob. computeVertexNormals on an unindexed buffer yields exactly that.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.tris = positions.length / 9;
  return geometry;
}

/** Triangle count of any geometry, indexed or not. */
export function triCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}
