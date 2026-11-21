import { describe, it, expect } from 'vitest';
import {
  customerLook,
  staffLook,
  type CharacterLook,
  OUTFITS,
  HAIRSTYLES,
} from '../../src/ui/arcade/kit/look';

const ids = Array.from({ length: 60 }, (_, i) => `cust_${i.toString(36).padStart(3, '0')}`);

const storyData = (id: string) =>
  ({
    id,
    name: id,
    title: 'x',
    avatarKey: id,
    initialQuote: '',
    symptoms: [],
    symptomLabel: '',
    matchedProductIds: [],
    budget: 1000,
    mood: 'Patient',
    patienceMax: 3,
    preferredPayment: 'cash',
    dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
  }) as never;

describe('character look', () => {
  it('is deterministic for the same customer id', () => {
    const a = customerLook(storyData('cust_x1'));
    const b = customerLook(storyData('cust_x1'));
    expect(b).toEqual(a);
  });

  it('does not hand every customer the same silhouette', () => {
    const looks = ids.map((id) => customerLook(storyData(id)));
    const outfits = new Set(looks.map((l) => l.outfit));
    const hairs = new Set(looks.map((l) => l.hair));
    const builds = new Set(looks.map((l) => `${l.build.toFixed(2)}x${l.height.toFixed(2)}`));
    const tops = new Set(looks.map((l) => l.top));

    expect(outfits.size).toBeGreaterThanOrEqual(4);
    expect(hairs.size).toBeGreaterThanOrEqual(4);
    expect(builds.size).toBeGreaterThanOrEqual(8);
    expect(tops.size).toBeGreaterThanOrEqual(8);
  });

  it('spreads the cast across outfits instead of piling into one', () => {
    const looks = ids.map((id) => customerLook(storyData(id)));
    const counts = new Map<string, number>();
    for (const look of looks) counts.set(look.outfit, (counts.get(look.outfit) ?? 0) + 1);
    const worst = Math.max(...counts.values());
    // No outfit may swallow more than half the queue; that is what "variety" means
    // at the scale the player actually sees it.
    expect(worst).toBeLessThanOrEqual(Math.ceil(ids.length / 2));
  });

  it('keeps generated proportions inside the range the camera solves for', () => {
    for (const id of ids) {
      const look = customerLook(storyData(id));
      expect(look.build).toBeGreaterThanOrEqual(0.86);
      expect(look.build).toBeLessThanOrEqual(1.2);
      expect(look.height).toBeGreaterThanOrEqual(0.86);
      expect(look.height).toBeLessThanOrEqual(1.12);
      // A skin tone so pale it reads as a hole in the crowd is worse than repetition.
      expect(look.skin).toBeLessThan(0x7a5a44);
    }
  });

  it('keeps the authored story cast in character', () => {
    const mama = customerLook(storyData('cust_mama_ngozi'));
    const emeka = customerLook(storyData('cust_emeka'));
    const bayo = customerLook(storyData('cust_bayo'));
    const danjuma = customerLook(storyData('cust_danjuma'));

    expect(mama.hair).toBe('headwrap');
    expect(mama.outfit).toBe('wrapper');
    expect(emeka.hair).toBe('helmet');
    expect(emeka.outfit).toBe('tee');
    expect(bayo.hair).toBe('cap');
    expect(danjuma.hair).toBe('cap');
    expect(danjuma.outfit).toBe('agbada');
    // Danjuma's gold trim must survive: it is the only gold in the room.
    expect(danjuma.accent).toBe(0xd4af37);
  });

  it('only emits looks from the declared vocabulary', () => {
    for (const id of ids) {
      const look = customerLook(storyData(id));
      expect(OUTFITS).toContain(look.outfit);
      expect(HAIRSTYLES).toContain(look.hair);
    }
  });

  it('gives each staff role a distinct uniform', () => {
    const looks: CharacterLook[] = [staffLook('stocker'), staffLook('cashier'), staffLook('cleaner')];
    expect(new Set(looks.map((l) => l.top)).size).toBe(3);
    // One is visibly shorter than the others: a uniform line-up of identical bodies
    // reads as a bug, not as staff.
    expect(new Set(looks.map((l) => l.height)).size).toBeGreaterThanOrEqual(2);
  });
});
