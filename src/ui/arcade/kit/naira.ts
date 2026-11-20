/**
 * Naira glyph rendering.
 *
 * AOSP WebViews (Tecno/Infinix class devices) ship a system font without
 * U+20A6, so `₦` falls back to a plain "N" or a tofu box. The game text stays
 * authored as `₦` (readable in tests, logs and save data); this module is the
 * render boundary that swaps every occurrence for an inline SVG mark.
 *
 * The mark is drawn from a path, not a font: no download, no FOUT, no glyph
 * fallback. It is sized in `em` and filled with `currentColor`, so it inherits
 * the surrounding font size and colour wherever it is placed.
 */

/** The character the game authors. Kept in one place for tests and greps. */
export const NAIRA_CHAR = '\u20A6';

/**
 * 7.9 x 10 viewBox: the ink is 0.79em wide and 0.72em tall, matching a bold
 * system sans (measured 79 x 70 at 100px). The 1.4 units below the baseline are
 * cancelled by the -0.14em vertical alignment, so the stems sit on the text
 * baseline and the cap height lines up with the digits beside them.
 */
export const NAIRA_VIEWBOX = '0 0 7.9 10';

export const NAIRA_MARK_SVG =
  `<svg class="naira-mark" viewBox="${NAIRA_VIEWBOX}" width="0.79em" height="1em" fill="currentColor" role="img" aria-label="naira" focusable="false"` +
  ` style="display:inline-block;width:0.79em;height:1em;vertical-align:-0.14em;margin-right:0.05em">` +
  `<path d="M0 1.4h.95v7.2H0zM6.95 1.4H7.9v7.2H6.95zM.95 1.4h1l5 7.2h-1zM0 3.45h7.9v.8H0zM0 5.85h7.9v.8H0z"/>` +
  `</svg>`;

/** The bare inline mark, for template strings that already hold a number. */
export const nairaMark = (): string => NAIRA_MARK_SVG;

/**
 * Converts a trusted markup string. Only `₦` is touched, so existing tags,
 * attributes and dialogue punctuation pass through untouched. Idempotent.
 */
export const nairaToSvgMarkup = (markup: string): string => markup.split(NAIRA_CHAR).join(NAIRA_MARK_SVG);

/** Escapes user/game text before it is placed in an HTML sink. */
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Converts plain text at a textContent-style sink: escape first, then mark. */
export const nairaTextToSvg = (text: string): string => nairaToSvgMarkup(escapeHtml(text));

/** `₦4,200` -> `NGN 4,200`, for title/tooltip strings that cannot hold markup. */
export const nairaPlainText = (text: string): string => text.split(NAIRA_CHAR).join('NGN ');

/** Render boundary for markup sinks (innerHTML). */
export function setNairaHtml(el: HTMLElement, markup: string): void {
  el.innerHTML = nairaToSvgMarkup(markup);
}

/** Render boundary for plain-text sinks (innerHTML with escaping). */
export function setNairaText(el: HTMLElement, text: string): void {
  el.innerHTML = nairaTextToSvg(text);
}
