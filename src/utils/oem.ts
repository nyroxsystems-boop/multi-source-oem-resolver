import { normalizeOem as baseNormalizeOem } from './normalize';

export function normalizeOem(raw: string): string {
  return baseNormalizeOem(raw);
}

export function looksLikeOem(raw: string): boolean {
  const cleaned = normalizeOem(raw);
  if (cleaned.length < 7) return false;
  return true;
}
