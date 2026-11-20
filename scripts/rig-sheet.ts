import * as THREE from 'three';
import {
  OUTFITS,
  HAIRSTYLES,
  customerLook,
  staffLook,
  type CharacterLook,
  type Headpiece,
  type Hairstyle,
  type OutfitFamily,
} from '../src/ui/arcade/kit/look';
import { buildCharacterRig, type RigOptions, type StaffRole } from '../src/ui/arcade/kit/characterRig';
import { mergeRigVertexColors } from '../src/ui/arcade/kit/rigMerge';

/**
 * Rig reference sheet.
 *
 * The in-game camera makes customers ~80 px tall and queues overlap, so "the cast
 * has variety" is impossible to judge from gameplay screenshots. This page renders
 * every axis of variation separately, at a fixed orthographic scale, on a plain
 * background: outfit families on one neutral body, hairstyles on another, then the
 * authored story cast and the staff roles with their real looks.
 *
 * Rows are controlled on purpose. In the outfit row only `outfit` differs; in the
 * hair row only `hair` differs. Anything shared (build, height, colours) is pinned,
 * so a shape difference cannot be explained by a colour or a scale difference.
 *
 * Metrics are taken from the merged rig — the thing the renderer actually draws —
 * not from authored part sizes, so a merge that drops geometry would show up here.
 */

interface Cell {
  key: string;
  group: GroupKey;
  /** Short DOM label, e.g. "kaftan" or "Mama Ngozi". */
  name: string;
  /** Secondary line: the look fields that matter for this row. */
  meta: string[];
  look: CharacterLook;
  options?: RigOptions;
}

type GroupKey = 'outfit' | 'hair' | 'authored' | 'staff';

const GROUPS: Array<{ key: GroupKey; label: string; colour: string }> = [
  { key: 'outfit', label: 'outfit families (6)', colour: '#6f8f6a' },
  { key: 'hair', label: 'hairstyles / headwear (7)', colour: '#8a7a9c' },
  { key: 'authored', label: 'authored story cast (4)', colour: '#c08a4a' },
  { key: 'staff', label: 'staff roles (3)', colour: '#4a7f96' },
];

/**
 * The control body for the outfit row: mid-height, mid-build, dark hair, no beard,
 * no glasses, no bag, no headpiece. Only the garment may differ between cells.
 */
const NEUTRAL: CharacterLook = {
  skin: 0x4a2e1b,
  top: 0x2f6f6a,
  bottom: 0x24282e,
  accent: 0xd4af37,
  hairColor: 0x121110,
  outfit: 'tee',
  hair: 'lowcut',
  headpiece: null,
  build: 1.0,
  height: 1.0,
  beard: false,
  glasses: false,
  bag: false,
};

const AUTHORED_IDS: Array<[string, string]> = [
  ['cust_mama_ngozi', 'Mama Ngozi'],
  ['cust_emeka', 'Emeka'],
  ['cust_bayo', 'Bayo'],
  ['cust_danjuma', 'Danjuma'],
];

const STAFF_ROLES: Array<[StaffRole, string]> = [
  ['stocker', 'Stocker'],
  ['cashier', 'Cashier'],
  ['cleaner', 'Cleaner'],
];

function headwear(look: CharacterLook): string {
  if (look.headpiece) return look.headpiece as Headpiece;
  return look.hair;
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];

  for (const outfit of OUTFITS as readonly OutfitFamily[]) {
    cells.push({
      key: `outfit-${outfit}`,
      group: 'outfit',
      name: outfit,
      meta: ['outfit · ' + outfit, 'hair · lowcut (pinned)'],
      look: { ...NEUTRAL, outfit },
    });
  }

  for (const hair of HAIRSTYLES as readonly Hairstyle[]) {
    cells.push({
      key: `hair-${hair}`,
      group: 'hair',
      name: hair,
      meta: ['hair · ' + hair, 'outfit · tee (pinned)'],
      look: { ...NEUTRAL, hair },
    });
  }

  for (const [id, label] of AUTHORED_IDS) {
    const look = customerLook({ id });
    cells.push({
      key: id,
      group: 'authored',
      name: label,
      meta: ['outfit · ' + look.outfit, 'head · ' + headwear(look)],
      look,
    });
  }

  for (const [role, label] of STAFF_ROLES) {
    const look = staffLook(role);
    cells.push({
      key: `staff-${role}`,
      group: 'staff',
      name: label,
      meta: ['outfit · ' + look.outfit, 'role prop · ' + role],
      look,
      options: { role },
    });
  }

  return cells;
}

const SPACING = 1.62;
const GROUP_GAP = 0.6;
const SIDE = 0.75;
const VIEW_HEIGHT = 2.9;

interface Placed extends Cell {
  index: number;
  x: number;
  triangles: number;
  meshes: number;
  widthM: number;
  heightM: number;
  depthM: number;
}

function triangleCount(root: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes += 1;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const index = geo.getIndex();
    const position = geo.getAttribute('position');
    if (index) triangles += index.count / 3;
    else if (position) triangles += position.count / 3;
  });
  return { triangles: Math.round(triangles), meshes };
}

function main(): void {
  const canvas = document.getElementById('sheet') as HTMLCanvasElement;
  const host = document.getElementById('canvas-host') as HTMLDivElement;
  const labelRow = document.getElementById('labels') as HTMLDivElement;
  const groupBar = document.getElementById('groupbar') as HTMLDivElement;
  const status = document.getElementById('status') as HTMLParagraphElement;

  const cells = buildCells();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xf4f1ea, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f1ea);

  // One directional + one ambient, exactly as the brief asks. No shadows: a cast
  // shadow would bias the silhouette read the sheet exists to make honest.
  const key = new THREE.DirectionalLight(0xfff6e8, 2.7);
  key.position.set(4, 7, 9);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));

  // Plain ground, large enough that its far edge is out of frame: the sheet reads
  // as one flat field with feet on y = 0, the rig authoring floor. A visible
  // horizon behind the heads would compete with the silhouettes.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0xded7c8, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const placed: Placed[] = [];
  let x = SIDE;
  let previousGroup: GroupKey | null = null;

  for (const cell of cells) {
    if (previousGroup && previousGroup !== cell.group) x += GROUP_GAP;
    x += SPACING / 2;
    previousGroup = cell.group;

    const rig = buildCharacterRig(cell.look, cell.options);
    rig.root.position.set(x, 0, 0);
    // Faces are authored toward +Z and the camera sits on +Z: everyone faces us.
    rig.root.rotation.y = 0;
    scene.add(rig.root);

    // Same post-process the game applies: one vertex-coloured mesh per joint.
    mergeRigVertexColors(rig.root);
    rig.root.updateMatrixWorld(true);

    const { triangles, meshes } = triangleCount(rig.root);
    const box = new THREE.Box3().setFromObject(rig.root);
    const size = box.getSize(new THREE.Vector3());

    placed.push({
      ...cell,
      index: placed.length + 1,
      x,
      triangles,
      meshes,
      widthM: Math.round(size.x * 1000) / 1000,
      heightM: Math.round(size.y * 1000) / 1000,
      depthM: Math.round(size.z * 1000) / 1000,
    });

    x += SPACING / 2;
  }

  // Symmetric margins: `x` ends one half-spacing past the last figure.
  const viewWidth = x + SIDE;

  const camera = new THREE.OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    VIEW_HEIGHT / 2,
    -VIEW_HEIGHT / 2,
    0.1,
    100
  );
  camera.position.set(viewWidth / 2, 2.05, 12);
  camera.lookAt(viewWidth / 2, 0.98, 0);
  camera.updateMatrixWorld(true);

  const layout = (): void => {
    const cssWidth = Math.max(1200, Math.min(3600, Math.floor(host.clientWidth || 3600)));
    const cssHeight = Math.round((cssWidth * VIEW_HEIGHT) / viewWidth);
    host.style.height = `${cssHeight}px`;
    renderer.setSize(cssWidth, cssHeight, false);
    renderer.render(scene, camera);
  };

  layout();
  window.addEventListener('resize', layout);

  // ---- DOM labels, aligned to the same world x as each figure ----------------
  for (const p of placed) {
    const pct = (p.x / viewWidth) * 100;
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.style.left = `${pct.toFixed(4)}%`;
    cell.dataset.group = p.group;
    cell.innerHTML =
      `<span class="idx">${String(p.index).padStart(2, '0')}</span>` +
      `<span class="name">${p.name}</span>` +
      p.meta.map((m) => `<span class="meta">${m}</span>`).join('');
    labelRow.appendChild(cell);
  }

  // Section bands are bounded by the mid-point of the gap between groups, not by
  // the centres of the edge figures, so a band covers exactly its own people.
  const groupsSeen: Array<{ key: GroupKey; start: number; end: number }> = [];
  for (const group of GROUPS) {
    const members = placed.filter((p) => p.group === group.key);
    if (members.length === 0) continue;
    const first = members[0];
    const last = members[members.length - 1];
    const startM = first.x - SPACING / 2 - (first.index > 1 ? GROUP_GAP / 2 : 0);
    const endM = last.x + SPACING / 2 + (last.index < placed.length ? GROUP_GAP / 2 : 0);
    groupsSeen.push({
      key: group.key,
      start: Math.max(0, (startM / viewWidth) * 100),
      end: Math.min(100, (endM / viewWidth) * 100),
    });
  }

  for (const g of groupsSeen) {
    const meta = GROUPS.find((entry) => entry.key === g.key)!;
    const band = document.createElement('div');
    band.style.width = `${(g.end - g.start).toFixed(4)}%`;
    band.style.flex = '0 0 auto';
    band.style.borderTopColor = meta.colour;
    band.style.borderBottomColor = meta.colour;
    band.style.color = meta.colour;
    band.textContent = meta.label;
    groupBar.appendChild(band);
  }
  // The band row is a flex row; reserve the leading/trailing space with spacers so
  // its segments line up with the label columns.
  const lead = document.createElement('div');
  lead.style.width = `${groupsSeen[0].start.toFixed(4)}%`;
  lead.style.border = '0';
  groupBar.insertBefore(lead, groupBar.firstChild);
  const tail = document.createElement('div');
  const lastEnd = groupsSeen[groupsSeen.length - 1].end;
  tail.style.width = `${(100 - lastEnd).toFixed(4)}%`;
  tail.style.border = '0';
  groupBar.appendChild(tail);

  const report = {
    generatedAt: new Date().toISOString(),
    url: location.href,
    viewport: { width: host.clientWidth, height: host.clientHeight },
    camera: { type: 'orthographic', viewWidth: round3(viewWidth), viewHeight: VIEW_HEIGHT },
    controlledRows: {
      outfit: 'body pinned at build 1.0 / height 1.0, lowcut hair, no headpiece; only outfit varies',
      hair: 'body pinned, tee outfit, no headpiece; only hair varies',
    },
    groups: GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      count: placed.filter((p) => p.group === g.key).length,
      startPct: groupsSeen.find((s) => s.key === g.key)!.start,
      endPct: groupsSeen.find((s) => s.key === g.key)!.end,
    })),
    characters: placed.map((p) => ({
      index: p.index,
      key: p.key,
      group: p.group,
      name: p.name,
      outfit: p.look.outfit,
      hair: p.look.hair,
      headpiece: p.look.headpiece,
      build: p.look.build,
      height: p.look.height,
      xPct: +((p.x / viewWidth) * 100).toFixed(4),
      triangles: p.triangles,
      meshesAfterMerge: p.meshes,
      bboxMetres: { width: p.widthM, height: p.heightM, depth: p.depthM },
    })),
    totals: {
      characters: placed.length,
      triangles: placed.reduce((sum, p) => sum + p.triangles, 0),
      distinctSilhouettes: {
        widthM: new Set(placed.map((p) => p.widthM)).size,
        heightM: new Set(placed.map((p) => p.heightM)).size,
      },
    },
  };

  status.textContent =
    `${placed.length} rigs · ${report.totals.triangles} triangles · ` +
    `view ${round3(viewWidth)} m × ${VIEW_HEIGHT} m orthographic`;

  (window as unknown as Record<string, unknown>).__rigSheet = { ready: true, report };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.className = 'error';
  }
  (window as unknown as Record<string, unknown>).__rigSheetError = message;
  console.error(message);
}
