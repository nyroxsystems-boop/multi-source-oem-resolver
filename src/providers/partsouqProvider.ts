import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeBrand, normalizeOem } from '../utils/normalize';
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

            // TODO: Replace with actual selector parsing for parts list/diagram.
            const extractedRows: Array<{
              oem: string;
              description?: string;
              groupPath?: string[];
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
                groupPath: row.groupPath ?? input.partGroupPath,
                provider: this.id,
                url: row.url ?? page.url(),
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
