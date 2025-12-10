import { looksLikeOem, normalizeOem } from './oem';

export function extractOemTokensFromText(
  text: string,
): { oem: string; rawOem: string }[] {
  const matches = text.match(/[A-Z0-9][A-Z0-9\-\s]{5,}/gi) || [];
  const seen = new Set<string>();
  const res: { oem: string; rawOem: string }[] = [];

  for (const raw of matches) {
    const trimmed = raw.trim();
    if (!looksLikeOem(trimmed)) continue;
    const oem = normalizeOem(trimmed);
    if (!oem || seen.has(oem)) continue;
    seen.add(oem);
    res.push({ oem, rawOem: trimmed });
  }

  return res;
}
