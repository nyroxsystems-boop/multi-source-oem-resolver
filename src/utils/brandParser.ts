import { ParsedInput } from '../types';
import { brandAliasMap, normalizeBrand, normalizeText } from './normalize';

export interface BrandParseResult {
  brand?: string;
  normalizedBrand?: string;
  remainingText: string;
}

const brandKeywords = Object.keys(brandAliasMap);

export function parseBrand(rawQuery: string, explicitBrand?: string): BrandParseResult {
  if (explicitBrand) {
    const normalized = normalizeBrand(explicitBrand);
    const remaining = removeBrandTokens(rawQuery, normalized);
    return { brand: explicitBrand, normalizedBrand: normalized, remainingText: remaining };
  }

  const normalizedText = normalizeText(rawQuery);
  let found: string | undefined;

  for (const keyword of brandKeywords) {
    const token = normalizeText(keyword);
    if (normalizedText.includes(token)) {
      found = brandAliasMap[keyword];
      break;
    }
  }

  if (found) {
    const remaining = removeBrandTokens(rawQuery, found);
    return { brand: found, normalizedBrand: found, remainingText: remaining };
  }

  return { remainingText: rawQuery };
}

function removeBrandTokens(text: string, normalizedBrand: string): string {
  const tokensToStrip = [normalizedBrand, ...Object.keys(brandAliasMap).filter((k) => brandAliasMap[k] === normalizedBrand)];
  let result = text;
  for (const token of tokensToStrip) {
    const regex = new RegExp(token, 'ig');
    result = result.replace(regex, ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

export function enrichParsedInput(input: ParsedInput, overrides: Partial<ParsedInput> = {}): ParsedInput {
  return {
    ...input,
    ...overrides,
    brand: overrides.brand ?? input.brand,
    normalizedBrand: overrides.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : input.normalizedBrand),
  };
}
