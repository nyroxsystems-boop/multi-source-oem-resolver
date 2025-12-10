import { OemCandidate } from '../types';
import { normalizeOem } from './normalize';

function clamp(value: number, min = 0, max = 0.99): number {
  return Math.max(min, Math.min(max, value));
}

const providerWeights: Record<string, number> = {
  REALOEM: 0.95,
  PARTSOUQ: 0.9,
  '7ZAP': 0.75,
  AUTODOC: 0.7,
  FALLBACK: 0.4,
};

export interface ScoredOem {
  oem: string;
  candidates: OemCandidate[];
  providers: string[];
  confidence: number;
}

export function scoreCandidates(
  candidates: OemCandidate[],
  expectedGroupPath?: string[],
): { scored: ScoredOem[]; primary?: ScoredOem } {
  const map = new Map<string, ScoredOem>();

  for (const c of candidates) {
    const norm = normalizeOem(c.oem);
    if (!norm) continue;
    let e = map.get(norm);
    if (!e) {
      e = { oem: norm, candidates: [], providers: [], confidence: 0 };
      map.set(norm, e);
    }
    e.candidates.push({ ...c, oem: norm });
    e.providers.push(c.provider);
  }

  for (const e of map.values()) {
    const uniqueProviders = [...new Set(e.providers)];
    let score = 0;

    for (const p of uniqueProviders) {
      score += providerWeights[p] ?? 0.5;
    }

    if (e.candidates.some((c) => c.sourceType === 'EPC')) {
      score += 0.1;
    }

    if (uniqueProviders.length > 1) {
      score += (uniqueProviders.length - 1) * 0.05;
    }

    if (expectedGroupPath && expectedGroupPath.length) {
      const canonicalExpected = expectedGroupPath.join('>');
      const hasMatchingPath = e.candidates.some(
        (c) => (c.groupPath || []).join('>') === canonicalExpected,
      );
      if (hasMatchingPath) score += 0.05;
    }

    e.confidence = clamp(score);
  }

  const scored = [...map.values()].sort((a, b) => b.confidence - a.confidence);
  return { scored, primary: scored[0] };
}
