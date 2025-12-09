import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeBrand, normalizeOem } from '../utils/normalize';
import { Provider, ProviderContext } from './base';

export class SevenZapProvider implements Provider {
  id: OemCandidate['provider'] = '7ZAP';

  supportedBrands = [
    'VOLKSWAGEN',
    'AUDI',
    'SEAT',
    'SKODA',
    'MERCEDES-BENZ',
    'OPEL',
    'FORD',
    'RENAULT',
    'PEUGEOT',
    'CITROEN',
    'FIAT',
    'MAZDA',
    'TOYOTA',
  ];

  canHandle(input: ParsedInput): boolean {
    const brand = input.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : undefined);
    return !!input.partQuery && !!brand && this.supportedBrands.includes(brand);
  }

  async fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]> {
    const results: OemCandidate[] = [];
    const normalizedBrand = input.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : undefined);
    if (!normalizedBrand) return results;

    const baseUrl = 'https://7zap.com';
    const hasVin = !!input.vin;
    const baseConfidence = hasVin ? 0.93 : 0.84;

    await ctx.crawler.run([
      {
        url: baseUrl,
        userData: {
          label: 'SEVENZAP_START',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`7zap: start ${normalizedBrand} ${input.partQuery || ''}`);

            // TODO: Ensure 7zap ToS/robots compliance before production scraping.

            if (input.vin) {
              // TODO: Locate VIN input field, fill input.vin, submit, and wait for vehicle context.
            } else {
              // TODO: Navigate brand -> model -> year/engine using UI selectors for ${normalizedBrand}.
            }

            // TODO: Navigate to part group using input.partGroupPath or search for input.partQuery.

            // TODO: Replace this placeholder extraction with real selectors for 7zap parts table rows.
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
