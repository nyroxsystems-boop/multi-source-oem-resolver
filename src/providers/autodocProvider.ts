import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeOem } from '../utils/normalize';
import { Provider, ProviderContext } from './base';

export class AutodocProvider implements Provider {
  id: OemCandidate['provider'] = 'AUTODOC';

  supportedBrands: string[] = []; // Works as cross-reference for most brands.

  canHandle(input: ParsedInput): boolean {
    return !!input.partQuery;
  }

  async fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]> {
    const results: OemCandidate[] = [];
    if (!input.partQuery) return results;

    const queryParam = encodeURIComponent(input.partQuery);
    const url = `https://www.autodoc.de/auto-teile/${queryParam}`;
    const baseConfidence = 0.7; // Cross-reference stabilizer, boosted later if matched with EPC.

    await ctx.crawler.run([
      {
        url,
        userData: {
          label: 'AUTODOC_SEARCH',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`Autodoc: searching ${input.partQuery}`);

            // TODO: Review Autodoc ToS/robots before scraping or automate via API if available.

            // TODO: Add vehicle filter if model/year/engine info exists.

            // TODO: Replace with actual parsing of Autodoc "OEM reference" blocks per product.
            const extractedRows: Array<{
              oem: string;
              description?: string;
              url?: string;
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
                  brand: input.normalizedBrand ?? input.brand,
                  model: input.model,
                  year: input.year,
                },
              });
            }
          },
        },
      },
    ]);

    return results;
  }
}
