import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Art direction switch.
 *
 *   ?art=v1  the original look (flat ambient, no environment lighting)
 *   ?art=v2  environment lighting, rebalanced lights, matte surfaces, baked
 *            contact ambient occlusion
 *   ?art=v3  v2 plus procedural surface textures, signage, a staged backdrop and
 *            restrained interaction rings — the default
 *
 * Every version is reachable from one build so a look can be screenshotted
 * against its predecessor without a branch.
 */
export type ArtVersion = 'v1' | 'v2' | 'v3' | 'v4';

export function artVersion(search?: string): ArtVersion {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const value = new URLSearchParams(query).get('art');
  if (value === 'v1' || value === 'v2' || value === 'v3' || value === 'v4') return value;
  // v4 is the shipped look: dollhouse shell, six material families, one key plus a
  // pendant and the fridge. The older passes stay reachable so a regression can be
  // screenshotted against them from the same build.
  return 'v4';
}

export interface LightSetup {
  ambient: { color: number; intensity: number };
  sun: { color: number; intensity: number };
  hemisphere: { sky: number; ground: number; intensity: number };
  counterSpot: { color: number; intensity: number; distance: number } | null;
  fridgeGlow: { color: number; intensity: number; distance: number } | null;
}

/**
 * Light budgets. v2 spends fewer lights and less ambient, because an environment
 * map now carries the fill: five punctual lights on MeshStandardMaterial cost a
 * fragment loop each, and flat ambient at 0.9 erases every form.
 */
export const LIGHTS: Record<ArtVersion, LightSetup> = {
  v1: {
    ambient: { color: 0xfff7ec, intensity: 0.9 },
    sun: { color: 0xffeed6, intensity: 1.75 },
    hemisphere: { sky: 0xb5e2ff, ground: 0x3d2716, intensity: 0.45 },
    counterSpot: { color: 0xfff3db, intensity: 1.5, distance: 14 },
    fridgeGlow: { color: 0x00e676, intensity: 0.65, distance: 10 },
  },
  v2: {
    ambient: { color: 0xf2f6ff, intensity: 0.1 },
    sun: { color: 0xfff1d8, intensity: 2.6 },
    hemisphere: { sky: 0x9fd4ff, ground: 0x5a3a20, intensity: 0.2 },
    counterSpot: null,
    fridgeGlow: { color: 0x00e676, intensity: 0.3, distance: 9 },
  },
  v3: {
    // Same physical budget as v2. v3 adds detail to the surfaces, not light to
    // the room: another light would only flatten what the textures just built.
    ambient: { color: 0xf2f6ff, intensity: 0.1 },
    sun: { color: 0xfff1d8, intensity: 2.6 },
    hemisphere: { sky: 0x9fd4ff, ground: 0x5a3a20, intensity: 0.2 },
    counterSpot: null,
    fridgeGlow: { color: 0x00e676, intensity: 0.3, distance: 9 },
  },
  v4: {
    // Three lights, each with a job: the sun comes through the front door and is
    // the only shadow caster; a pendant lamp warms the counter so the two metres
    // where the player spends the session read as interior; the fridge spills cool
    // teal on the cold chain so the room has a second colour temperature.
    ambient: { color: 0xf4f1ea, intensity: 0.08 },
    sun: { color: 0xffe9c9, intensity: 2.6 },
    hemisphere: { sky: 0xa8d4ff, ground: 0x8a6440, intensity: 0.24 },
    counterSpot: { color: 0xffd9a0, intensity: 2.4, distance: 9 },
    fridgeGlow: { color: 0x2e8b8b, intensity: 1.0, distance: 6 },
  },
};

/**
 * Build the environment map once and hang it on the scene. This is the single
 * biggest shading change available: without it, metallic and low-roughness
 * surfaces have nothing to reflect and every PBR material reads as plastic.
 */
export function applyEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer | null, version: ArtVersion): void {
  if (version === 'v1' || !renderer) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.14;
  room.dispose?.();
  pmrem.dispose();
}

/**
 * v2 surface pass: matte the surfaces that should be matte and let the few that
 * should be glossy keep their sheen. Colour stays untouched — this changes how
 * light sits on a surface, not what colour it is.
 */
export function tuneSurfaceMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const mat = material as THREE.MeshStandardMaterial;
      if (!mat || mat.type !== 'MeshStandardMaterial') continue;
      mat.envMapIntensity = 1.15;
      // Anything mid-rough and non-metallic is a painted/plastic surface: push it
      // matte. Deliberately glossy things (counter slab at 0.2) are left alone.
      if (!mat.metalness && mat.roughness >= 0.5 && mat.roughness <= 0.75) {
        mat.roughness = 0.88;
      }
      mat.needsUpdate = true;
    }
  });
}

/**
 * Cheap contact occlusion, baked at build time.
 *
 * Every vertex of a standing object is darkened by its height above the floor, so
 * walls, counters and fixtures meet the ground with a gradient instead of a hard
 * edge. No depth pass, no SSAO, no per-frame cost — the attribute is static.
 *
 * Flat sheets (the floor, runner, street) are skipped: their vertices all sit at
 * floor level and would be uniformly darkened.
 */
export function bakeContactAO(root: THREE.Object3D, floorY = 0, falloff = 0.9): void {
  const box = new THREE.Box3();
  const world = new THREE.Vector3();

  // Collect first: adding vertex colours mutates geometry, and we do not want to
  // bake into an object we have already touched twice.
  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry?.attributes?.position) return;
    if (mesh.geometry.attributes.color) return; // already baked
    box.setFromObject(mesh);
    if (!Number.isFinite(box.min.y)) return;
    if (box.max.y - box.min.y < 0.3) return; // flat sheet
    targets.push(mesh);
  });

  for (const mesh of targets) {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    mesh.updateWorldMatrix(true, false);

    for (let i = 0; i < position.count; i++) {
      world.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const height = world.y - floorY;
      const t = Math.min(1, Math.max(0, height / falloff));
      // smoothstep so the gradient dies out rather than banding
      const k = 0.58 + 0.42 * (t * t * (3 - 2 * t));
      colors[i * 3] = k;
      colors[i * 3 + 1] = k;
      colors[i * 3 + 2] = k;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const mat = material as THREE.MeshStandardMaterial;
      if (!mat) continue;
      mat.vertexColors = true;
      mat.needsUpdate = true;
    }
  }
}

/** One call from the director once the renderer exists. */
export function applyArtDirection(
  scene: THREE.Scene,
  root: THREE.Object3D,
  renderer: THREE.WebGLRenderer | null,
  version: ArtVersion
): void {
  if (version === 'v1') return;
  applyEnvironment(scene, renderer, version);
  tuneSurfaceMaterials(root);
  if (renderer) {
    // v2 lights the room with the sun and the environment map instead of a flat
    // ambient wash, so it needs a little less exposure, not more.
    renderer.toneMappingExposure = 1.0;
  }
}
