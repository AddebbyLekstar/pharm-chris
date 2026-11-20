import { describe, expect, it } from 'vitest';
import {
  NAIRA_CHAR,
  NAIRA_MARK_SVG,
  NAIRA_VIEWBOX,
  nairaMark,
  nairaPlainText,
  nairaTextToSvg,
  nairaToSvgMarkup,
  setNairaHtml,
  setNairaText,
} from '../../src/ui/arcade/kit/naira';
import { drawerHtml, hudShellHtml } from '../../src/ui/arcade/ArcadeStoreHud';
import { dialogueCardHtml } from '../../src/ui/arcade/DialogueModal';
import { CUSTOMERS_ROSTER } from '../../src/sim/customers';
import { StoreRun } from '../../src/sim/progression';
import type { Customer, Product } from '../../src/sim/types';

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;
const marks = (html: string): number => count(html, '<svg class="naira-mark"');

describe('naira glyph — no font fallback at the render boundary', () => {
  it('ships a fixed-viewBox path filled with currentColor and sized in em', () => {
    expect(NAIRA_VIEWBOX).toBe('0 0 7.9 10');
    expect(NAIRA_MARK_SVG).toContain(`viewBox="${NAIRA_VIEWBOX}"`);
    expect(NAIRA_MARK_SVG).toContain('fill="currentColor"');
    expect(NAIRA_MARK_SVG).toContain('width="0.79em"');
    expect(NAIRA_MARK_SVG).toContain('height="1em"');
    expect(NAIRA_MARK_SVG).toContain('vertical-align:-0.14em');
    expect(NAIRA_MARK_SVG).toContain('<path d="');
    // A font-family or a text node would put us back at the mercy of the device font.
    expect(NAIRA_MARK_SVG).not.toContain('font-family');
    expect(NAIRA_MARK_SVG).not.toContain(NAIRA_CHAR);
    expect(nairaMark()).toBe(NAIRA_MARK_SVG);
  });

  it('converts every occurrence in a mixed currency string', () => {
    const raw = `CASH ${NAIRA_CHAR}84,200 · DEBT ${NAIRA_CHAR}4,200,000 · ${NAIRA_CHAR}{price}`;
    const out = nairaToSvgMarkup(raw);

    expect(count(raw, NAIRA_CHAR)).toBe(3);
    expect(marks(out)).toBe(3);
    expect(out).not.toContain(NAIRA_CHAR);
    expect(out).toContain('84,200');
    expect(out).toContain('{price}');
  });

  it('is idempotent, so a converted template can pass through another sink', () => {
    const once = nairaToSvgMarkup(`${NAIRA_CHAR}1,200`);
    expect(nairaToSvgMarkup(once)).toBe(once);
  });

  it('escapes plain text before marking it up', () => {
    const out = nairaTextToSvg(`<b>${NAIRA_CHAR}5</b> & "x"`);
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('&amp;');
    expect(marks(out)).toBe(1);
    expect(out).not.toContain(NAIRA_CHAR);
  });

  it('offers a plain NGN fallback for title attributes', () => {
    const out = nairaPlainText(`${NAIRA_CHAR}4.2M`);
    expect(out).toBe('NGN 4.2M');
    expect(out).not.toContain(NAIRA_CHAR);
  });

  it('wires both DOM helpers through the same conversion', () => {
    const htmlSink = { innerHTML: '' } as unknown as HTMLElement;
    const textSink = { innerHTML: '' } as unknown as HTMLElement;

    setNairaHtml(htmlSink, `<b>Pay ${NAIRA_CHAR}8,000</b>`);
    setNairaText(textSink, `Paid ${NAIRA_CHAR}8,000 <today>`);

    expect(marks(htmlSink.innerHTML)).toBe(1);
    expect(marks(textSink.innerHTML)).toBe(1);
    expect(textSink.innerHTML).toContain('&lt;today&gt;');
    expect(htmlSink.innerHTML).not.toContain(NAIRA_CHAR);
    expect(textSink.innerHTML).not.toContain(NAIRA_CHAR);
  });
});

describe('shipped HUD markup renders naira as SVG', () => {
  it('converts both starting chips in the HUD shell', () => {
    const raw = hudShellHtml();
    const rendered = nairaToSvgMarkup(raw);

    expect(count(raw, NAIRA_CHAR)).toBe(2);
    expect(marks(rendered)).toBe(2);
    expect(rendered).not.toContain(NAIRA_CHAR);
    expect(rendered).toContain('id="hud-cash"');
    expect(rendered).toContain('id="hud-debt"');
  });

  it('converts every price, wage and debt in the investment drawer', () => {
    const run = StoreRun.create({ cash: 123456, debt: 4200000 });
    const raw = drawerHtml(run);
    const rendered = nairaToSvgMarkup(raw);
    const rawCount = count(raw, NAIRA_CHAR);

    expect(rawCount).toBeGreaterThanOrEqual(10);
    expect(marks(rendered)).toBe(rawCount);
    expect(rendered).not.toContain(NAIRA_CHAR);
    expect(rendered).toContain('123,456');
    expect(rendered).toContain('4,200,000');
    expect(rendered).toContain('data-buy="license"');
  });
});

describe('shipped dialogue markup renders naira as SVG', () => {
  const customer: Customer = {
    ...CUSTOMERS_ROSTER[0],
    budget: 2500,
    initialQuote: `${NAIRA_CHAR}{price}?! I only brought ${NAIRA_CHAR}{budget} from house.`,
  };
  const product = { name: 'Malaguard Forte' } as Product;

  it('converts the budget chip, quote, price and collect button', () => {
    const raw = dialogueCardHtml(customer, product, 1800);
    const rendered = nairaToSvgMarkup(raw);

    // budget + two in the quote + product price + collect button
    expect(count(raw, NAIRA_CHAR)).toBe(5);
    expect(marks(rendered)).toBe(5);
    expect(rendered).not.toContain(NAIRA_CHAR);
    expect(rendered).toContain('Budget: ');
    expect(rendered).toContain('2500');
    expect(rendered).toContain('Dispense & Collect ');
    expect(rendered).toContain('1800');
  });

  it('converts every naira-bearing line in the shipped customer roster', () => {
    const strings: string[] = [];
    for (const c of CUSTOMERS_ROSTER) {
      strings.push(
        c.initialQuote,
        ...c.dialogue.fairPrice,
        ...c.dialogue.overpriced,
        ...c.dialogue.wrongProduct,
        ...c.dialogue.exceedsBudget,
        ...(c.dialogue.fractionalOffer ?? [])
      );
    }
    const withNaira = strings.filter((s) => s.includes(NAIRA_CHAR));

    expect(withNaira.length).toBeGreaterThan(0);
    for (const line of withNaira) {
      const rendered = nairaToSvgMarkup(line);
      expect(rendered).not.toContain(NAIRA_CHAR);
      expect(marks(rendered)).toBe(count(line, NAIRA_CHAR));
    }
  });
});

describe('render-boundary wiring guard', () => {
  it('leaves no raw innerHTML or textContent currency sink in the HUD and dialogue', async () => {
    const files = ['../../src/ui/arcade/ArcadeStoreHud.ts', '../../src/ui/arcade/DialogueModal.ts'];
    const { readFile } = await import('node:fs/promises');

    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8');
      for (const line of source.split('\n')) {
        if (line.includes('.innerHTML =')) {
          expect(
            line.includes('setNairaHtml') || line.includes('nairaToSvgMarkup') || line.includes("innerHTML = ''"),
            `${file}: unguarded innerHTML sink -> ${line.trim()}`
          ).toBe(true);
        }
        if (line.includes('.textContent =')) {
          expect(line.includes('money(') || line.includes(NAIRA_CHAR), `${file}: currency in textContent -> ${line.trim()}`).toBe(false);
        }
      }
      expect(source).toContain("from './kit/naira'");
    }
  });
});
