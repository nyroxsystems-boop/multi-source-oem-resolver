import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeBrand, normalizeOem } from '../utils/normalize';
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

    await ctx.crawler.run([
      {
        url: baseUrl,
        userData: {
          label: 'REALOEM_START',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`RealOEM: start ${input.partQuery || ''}`);

            // TODO: Confirm RealOEM ToS/robots before automation.

            if (input.vin) {
              // TODO: Use VIN search form for BMW, submit input.vin, navigate to model landing page.
            } else {
              // TODO: Navigate via chassis/model/year selection for BMW (series -> model -> production date).
            }

            // TODO: Navigate to appropriate part group or use search box for input.partQuery.

            // TODO: Replace with parsing of RealOEM parts table rows (OEM number, description, quantity).
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
                  brand: 'BMW',
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
