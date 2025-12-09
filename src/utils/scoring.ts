import { OemCandidate } from '../types';
import { normalizeOem } from './normalize';

function clamp(value: number, min = 0, max = 0.99): number {
  return Math.max(min, Math.min(max, value));
}

const providerWeights: Record<OemCandidate['provider'], number> = {
  'REALOEM': 0.92,
  '7ZAP': 0.88,
  'PARTSOUQ': 0.9,
  'AUTODOC': 0.72,
  'FALLBACK': 0.45,
};

export function scoreCandidates(candidates: OemCandidate[], expectedGroupPath?: string[]): {
  scored: OemCandidate[];
  primary?: OemCandidate;
} {
  const grouped = new Map<string, OemCandidate[]>();

  for (const candidate of candidates) {
    const norm = normalizeOem(candidate.oem);
    if (!norm) continue;
    const existing = grouped.get(norm) ?? [];
    grouped.set(norm, [...existing, { ...candidate, oem: norm }]);
  }

  const scored: OemCandidate[] = [];

  for (const [, groupItems] of grouped.entries()) {
    const providers = new Set(groupItems.map((c) => c.provider));
    const base = Math.max(...groupItems.map((c) => c.confidence || providerWeights[c.provider] || 0.4));
    const confirmationBonus = Math.min((groupItems.length - 1) * 0.05, 0.15);
    const diversityBonus = providers.size > 1 ? 0.05 : 0;

    let groupBonus = 0;
    if (expectedGroupPath?.length) {
      const match = groupItems.some((c) => c.groupPath?.some((p) => expectedGroupPath.includes(p)));
      groupBonus = match ? 0.03 : 0;
    }

    // TODO: Add penalties for engine/model/year mismatches when metadata is available.

    const combinedConfidence = clamp(base + confirmationBonus + diversityBonus + groupBonus);

    const best = groupItems.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    scored.push({
      ...best,
      confidence: combinedConfidence,
    });
  }

  const sorted = scored.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return { scored: sorted, primary: sorted[0] };
}
