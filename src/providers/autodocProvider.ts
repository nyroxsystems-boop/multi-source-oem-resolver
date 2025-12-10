import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { looksLikeOem, normalizeOem } from '../utils/oem';
import { Provider, ProviderContext } from './base';

export class AutodocProvider implements Provider {
  id: OemCandidate['provider'] = 'AUTODOC';

  supportedBrands: string[] = []; // Works as cross-reference for most brands.

  canHandle(input: ParsedInput): boolean {
    if (!input.partQuery) return false;
    const looksLikeOemQuery = /\d{5,}/.test(input.partQuery);
    return !!input.normalizedBrand || looksLikeOemQuery;
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

            // Try to expand OEM section if present.
            const trigger = await page.$('text=/OEM numbers/i');
            if (trigger) {
              await trigger.click().catch(() => {});
              await page.waitForTimeout(500);
            }

            const texts = await page.$$eval('*', (nodes) => {
              const res: string[] = [];
              for (const node of nodes as HTMLElement[]) {
                const text = (node.textContent || '').trim();
                if (!text) continue;
                if (/OEM/i.test(text) || /OE\s*number/i.test(text)) {
                  res.push(text);
                }
              }
              return res;
            });

            const seen = new Set<string>();
            for (const block of texts) {
              const tokens = block.split(/[\s,;\/]+/);
              for (const token of tokens) {
                if (!looksLikeOem(token)) continue;
                const normalizedOem = normalizeOem(token);
                if (!normalizedOem || seen.has(normalizedOem)) continue;
                seen.add(normalizedOem);

                results.push({
                  oem: normalizedOem,
                  rawOem: token,
                  description: 'Autodoc cross-reference',
                  provider: this.id,
                  url: page.url(),
                  confidence: baseConfidence,
                  sourceType: 'CROSSREF',
                  meta: {
                    brand: input.normalizedBrand ?? input.brand,
                    model: input.model,
                    year: input.year,
                  },
                });
              }
            }
          },
        },
      },
    ]);

    return results;
  }
}
