import { characterSprite } from '../src/ui/arcade/kit/charSprite';
import { customerLook, staffLook, type CharacterLook } from '../src/ui/arcade/kit/look';

const CHRIS: CharacterLook = {
  skin: 0x3e2312,
  top: 0x1b4a3c,
  bottom: 0xe8dcc4,
  accent: 0xb08a4a,
  hairColor: 0x1b1512,
  outfit: 'tunic',
  hair: 'fade',
  headpiece: null,
  build: 1,
  height: 1,
  beard: false,
  glasses: true,
  bag: false,
  face: { headShape: 'long', eyeSpacing: 'close', browWeight: 'medium', mouth: 'flat', cheek: 'cut', age: 'middle' },
  posture: { shoulderTilt: 0.6, headTilt: -1.2, armOut: 1 },
};

const mount = (hostId: string, entries: Array<{ look: CharacterLook; label: string; width: number }>): void => {
  const host = document.getElementById(hostId);
  if (!host) return;
  for (const entry of entries) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const frame = document.createElement('div');
    const { svg } = characterSprite(entry.look, { width: entry.width });
    frame.innerHTML = svg;
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = entry.label;
    cell.append(frame, cap);
    host.append(cell);
  }
};

const ids = ['cust_mama_ngozi', 'cust_emeka', 'cust_bayo', 'cust_danjuma', 'cust_a1', 'cust_b2', 'cust_c3', 'cust_d4'];
const looks = ids.map((id) => ({ look: customerLook({ id } as never), id }));

mount('phone', looks.map(({ look, id }) => ({ look, label: id.replace('cust_', ''), width: 80 })));
mount('large', looks.map(({ look, id }) => ({ look, label: look.outfit, width: 190 })));

mount('cast', [
  { look: CHRIS, label: 'chris', width: 190 },
  { look: staffLook('stocker'), label: 'stocker', width: 190 },
  { look: staffLook('cashier'), label: 'cashier', width: 190 },
  { look: staffLook('cleaner'), label: 'cleaner', width: 190 },
]);

(window as unknown as Record<string, unknown>).charSvgReady = true;
