/**
 * Device quality tiers.
 *
 * The real player device is a 2GB Tecno/Infinix at 360x800, not a desktop. On
 * those devices we drop the shadow pass and cap the pixel ratio to 1: the game
 * keeps its silhouette (contact shadows are geometry, not a shadow map) and loses
 * a frame-time cost it cannot afford.
 *
 * Override for testing: ?quality=low | ?quality=high
 */

export type QualityTier = 'low' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  shadows: boolean;
  maxPixelRatio: number;
  antialias: boolean;
}

function detectTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  const q = new URLSearchParams(window.location.search).get('quality');
  if (q === 'low' || q === 'high') return q;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (memory <= 2 || cores <= 4) return 'low';
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'low';
  }
  return 'high';
}

let cached: QualitySettings | null = null;

export function quality(): QualitySettings {
  if (cached) return cached;
  const tier = detectTier();
  cached =
    tier === 'low'
      ? { tier, shadows: false, maxPixelRatio: 1, antialias: false }
      : { tier, shadows: true, maxPixelRatio: 2, antialias: true };
  return cached;
}
