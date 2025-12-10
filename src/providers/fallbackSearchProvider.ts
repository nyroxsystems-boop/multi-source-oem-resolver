import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { looksLikeOem, normalizeOem } from '../utils/oem';
import { Provider, ProviderContext } from './base';

export class FallbackSearchProvider implements Provider {
  id: OemCandidate['provider'] = 'FALLBACK';
  supportedBrands: string[] = [];

  canHandle(input: ParsedInput): boolean {
    const hasText = !!input.partQuery || !!input.rawQuery;
    const hasBrandOrVin = !!input.vin || !!input.normalizedBrand || !!input.brand;
    return hasText && !hasBrandOrVin;
  }

  async fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]> {
    const results: OemCandidate[] = [];
    const baseConfidence = 0.4;

    const searchTerms = [
      `${input.normalizedBrand || input.brand || ''} ${input.model || ''} ${input.partQuery || ''}`,
      `${input.partQuery || ''} ${input.model || ''}`,
    ]
      .map((s) => s.trim())
      .filter(Boolean);

    const uniqueTerms = Array.from(new Set(searchTerms));

    for (const term of uniqueTerms) {
      const searchUrl = `https://www.google.com/search?q=site%3A7zap.com+${encodeURIComponent(term)}`;
      await ctx.crawler.run([
        {
          url: searchUrl,
          userData: {
            label: 'FALLBACK_SEARCH',
            handler: async (playCtx: PlaywrightCrawlingContext) => {
              const { page } = playCtx;
              ctx.log(`Fallback search for term: ${term}`);

              // TODO: Confirm allowance for scraping search result pages or switch to custom EPC search endpoint.

              const bodyText = await page.textContent('body');
              if (!bodyText) return;

              const matches = bodyText.match(/[A-Z0-9][A-Z0-9\-\s]{6,}/gi) || [];
              const seen = new Set<string>();

              for (const raw of matches) {
                const trimmed = raw.trim();
                if (!looksLikeOem(trimmed)) continue;
                const normalizedOem = normalizeOem(trimmed);
                if (!normalizedOem || seen.has(normalizedOem)) continue;
                seen.add(normalizedOem);

                results.push({
                  oem: normalizedOem,
                  rawOem: trimmed,
                  description: 'Fallback extracted OEM-like string',
                  provider: this.id,
                  url: page.url(),
                  confidence: baseConfidence,
                  meta: {
                    term,
                  },
                });
              }
            },
          },
        },
      ]);
    }

    return results;
  }
}
