import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeOem } from '../utils/normalize';
import { Provider, ProviderContext } from './base';

export class FallbackSearchProvider implements Provider {
  id: OemCandidate['provider'] = 'FALLBACK';
  supportedBrands: string[] = [];

  canHandle(input: ParsedInput): boolean {
    return !!input.partQuery || !!input.rawQuery;
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

              // TODO: Replace with actual result parsing + follow-up requests to EPC detail pages.
              const extractedRows: Array<{
                oem: string;
                url?: string;
                description?: string;
                rawOem?: string;
              }> = [];

              for (const row of extractedRows) {
                const normalizedOem = normalizeOem(row.oem);
                if (!normalizedOem) continue;
                results.push({
                  oem: normalizedOem,
                  rawOem: row.rawOem ?? row.oem,
                  description: row.description,
                  provider: this.id,
                  url: row.url ?? page.url(),
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
