import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeBrand } from '../utils/normalize';
import { looksLikeOem, normalizeOem } from '../utils/oem';
import { Provider, ProviderContext } from './base';

export class PartsouqProvider implements Provider {
  id: OemCandidate['provider'] = 'PARTSOUQ';

  supportedBrands = ['TOYOTA', 'LEXUS', 'NISSAN', 'INFINITI', 'HYUNDAI', 'KIA', 'MITSUBISHI', 'SUBARU', 'MAZDA', 'HONDA', 'SUZUKI'];

  canHandle(input: ParsedInput): boolean {
    const brand = input.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : undefined);
    return !!input.partQuery && !!brand && this.supportedBrands.includes(brand);
  }

  async fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]> {
    const results: OemCandidate[] = [];
    const normalizedBrand = input.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : undefined);
    if (!normalizedBrand) return results;

    const baseUrl = 'https://partsouq.com';
    const vinUrl = 'https://partsouq.com/en/vin';
    const hasVin = !!input.vin;
    const baseConfidence = hasVin ? 0.94 : 0.87;

    await ctx.crawler.run([
      {
        url: hasVin ? vinUrl : baseUrl,
        userData: {
          label: 'PARTSOUQ_START',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`Partsouq: start ${normalizedBrand} ${input.partQuery || ''}`);

            // TODO: Validate Partsouq ToS/robots before scraping at scale.

            if (input.vin) {
              // TODO: Fill VIN field with input.vin, submit, and wait for vehicle parts catalog page.
            } else {
              // TODO: Use brand/model/year/engine selectors to reach diagram list for ${normalizedBrand}.
            }

            // TODO: Navigate to specific part group or search for input.partQuery within the catalog UI.

            try {
              await page.waitForSelector('table', { timeout: 15_000 });
            } catch {
              ctx.log('Partsouq: table not found within timeout');
            }

            type Row = { rawOem: string; name: string };
            const rows = (await page.$$eval('table tr', (trs) => {
              return trs
                .map((tr) => {
                  const cells = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[];
                  if (cells.length < 2) return null;

                  const numberLink = cells[0].querySelector('a');
                  const rawOem = (numberLink?.textContent || '').trim();
                  const name = (cells[1].textContent || '').trim();

                  if (!rawOem) return null;
                  return { rawOem, name };
                })
                .filter(Boolean) as Row[];
            })) as Row[];

            for (const row of rows) {
              if (!looksLikeOem(row.rawOem)) continue;

              const nameLower = row.name.toLowerCase();
              const pq = (input.normalizedPartQuery || '').toLowerCase();
              if (
                pq &&
                !nameLower.includes(pq) &&
                !nameLower.includes('spark plug') &&
                !nameLower.includes('air filter') &&
                !nameLower.includes('element')
              )
                continue;

              const normalizedOem = normalizeOem(row.rawOem);
              if (!normalizedOem) continue;

              results.push({
                oem: normalizedOem,
                rawOem: row.rawOem,
                description: row.name,
                groupPath: input.partGroupPath,
                provider: this.id,
                url: page.url(),
                confidence: baseConfidence,
                meta: {
                  brand: normalizedBrand,
                  vin: input.vin,
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
