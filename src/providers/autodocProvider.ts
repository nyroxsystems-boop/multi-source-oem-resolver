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

    const terms = [input.partQuery, input.normalizedBrand || input.brand, input.model, input.engineCode]
      .filter(Boolean)
      .join(' ');
    const searchUrl = `https://www.autodoc.de/search?keyword=${encodeURIComponent(terms)}`;
    const baseConfidence = 0.65;

    await ctx.crawler.run([
      {
        url: searchUrl,
        userData: {
          label: 'AUTODOC_SEARCH',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`Autodoc: searching terms "${terms}"`, { url: searchUrl });

            // Allow page to load search results.
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);

            // Try to expand OEM sections if visible on the page.
            const triggers = await page.$$('text=/OEM numbers|OE numbers/i');
            for (const trig of triggers) {
              await trig.click().catch(() => {});
            }
            await page.waitForTimeout(500);

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
