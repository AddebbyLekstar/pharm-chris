import { characterSprite } from '../src/ui/arcade/kit/charSprite';
import { customerLook, type CharacterLook, type Hairstyle, type BeardStyle } from '../src/ui/arcade/kit/look';

const base = customerLook({ id: 'cust_variant_base' } as never);

const strip = (hostId: string, entries: Array<{ look: CharacterLook; label: string }>): void => {
  const host = document.getElementById(hostId);
  if (!host) return;
  for (const entry of entries) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const frame = document.createElement('div');
    frame.innerHTML = characterSprite(entry.look, { width: 150 }).svg;
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = entry.label;
    cell.append(frame, cap);
    host.append(cell);
  }
};

const HAIR: Hairstyle[] = ['fade', 'lowcut', 'braids', 'afro', 'headwrap', 'cap', 'bald', 'helmet'];
strip(
  'hair',
  HAIR.map((hair) => ({ look: { ...base, hair, headpiece: null, bag: false, beard: false }, label: hair })),
);

const BEARDS: BeardStyle[] = ['boxed', 'chin', 'goatee'];
strip(
  'beards',
  BEARDS.map((beardStyle) => ({
    look: { ...base, hair: 'lowcut', headpiece: null, beard: true, beardStyle, face: { ...base.face, mouth: 'flat' as const } },
    label: beardStyle,
  })),
);

(window as unknown as Record<string, unknown>).charVariantsReady = true;
