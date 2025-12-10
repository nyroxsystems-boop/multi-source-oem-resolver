import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeBrand } from '../utils/normalize';
import { looksLikeOem, normalizeOem } from '../utils/oem';
import { Provider, ProviderContext } from './base';

export class RealOemProvider implements Provider {
  id: OemCandidate['provider'] = 'REALOEM';

  supportedBrands = ['BMW'];

  canHandle(input: ParsedInput): boolean {
    const brand = input.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : undefined);
    return !!input.partQuery && brand === 'BMW';
  }

  async fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]> {
    const results: OemCandidate[] = [];
    const baseUrl = 'https://www.realoem.com';
    const hasVin = !!input.vin;
    const baseConfidence = hasVin ? 0.97 : 0.92;

    try {
      await ctx.crawler.run([
        {
          url: baseUrl,
          userData: {
            label: 'REALOEM_START',
            handler: async (playCtx: PlaywrightCrawlingContext) => {
              const { page } = playCtx;
              ctx.log(`RealOEM: start ${input.partQuery || ''}`);

              await Promise.race([
                (async () => {
                  // TODO: Confirm RealOEM ToS/robots before automation.

                  if (input.vin) {
                    // TODO: Use VIN search form for BMW, submit input.vin, navigate to model landing page.
                  } else {
                    // TODO: Navigate via chassis/model/year selection for BMW (series -> model -> production date).
                  }

                  // TODO: Navigate to appropriate part group or use search box for input.partQuery.

                  // Heuristic extraction from parts table with "Part Number" header.
                  try {
                    await page.waitForSelector('text=Part Number', { timeout: 15_000 });
                  } catch {
                    ctx.log('RealOEM: Part Number header not found within timeout');
                  }

                  type Row = { description: string; rawOem: string };
                  const rows = (await page.$$eval('table tr', (trs) => {
                    return trs
                      .map((tr) => {
                        const cells = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[];
                        if (!cells.length) return null;

                        const textCells = cells
                          .map((c) => (c.textContent || '').trim())
                          .filter(Boolean);
                        if (!textCells.length) return null;

                        const description = textCells[1] || '';
                        const possibleOem =
                          textCells[textCells.length - 2] || textCells[textCells.length - 1] || '';

                        return {
                          description,
                          rawOem: possibleOem,
                        };
                      })
                      .filter(Boolean) as Row[];
                  })) as Row[];

                  for (const row of rows) {
                    if (!row.rawOem) continue;
                    if (!looksLikeOem(row.rawOem)) continue;

                    const descLower = row.description.toLowerCase();
                    const pq = (input.normalizedPartQuery || '').toLowerCase();
                    if (pq && !descLower.includes(pq) && !descLower.includes('spark plug')) {
                      continue;
                    }

                    const oem = normalizeOem(row.rawOem);
                    if (!oem) continue;

                    results.push({
                      oem,
                      rawOem: row.rawOem,
                      description: row.description,
                      groupPath: input.partGroupPath,
                      provider: this.id,
                      url: page.url(),
                      confidence: baseConfidence,
                      sourceType: 'EPC',
                      meta: {
                        brand: 'BMW',
                        vin: input.vin,
                        model: input.model,
                        year: input.year,
                      },
                    });
                  }
                })(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('RealOEM inner timeout')), 15_000),
                ),
              ]);
            },
          },
        },
      ]);
    } catch (err) {
      ctx.log(`RealOEM error: ${(err as Error).message}`);
    }

    return results;
  }
}
