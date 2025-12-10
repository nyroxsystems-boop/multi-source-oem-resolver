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

    const targetUrl = this.buildTargetUrl(input, normalizedBrand);
    const hasVin = !!input.vin;
    const baseConfidence = hasVin ? 0.94 : 0.87;

    await ctx.crawler.run([
      {
        url: targetUrl,
        userData: {
          label: 'PARTSOUQ_START',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`Partsouq: start ${normalizedBrand} ${input.partQuery || ''}`, { url: targetUrl });

            try {
              await page.waitForSelector('table', { timeout: 15_000 });
            } catch {
              ctx.log('Partsouq: table not found within timeout', { url: page.url() });
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
                sourceType: 'EPC',
                meta: {
                  brand: normalizedBrand,
                  vin: input.vin,
                  model: input.model,
                  year: input.year,
                },
              });
            }

            if (!results.length) {
              // Fallback: scan body text for OEM-like tokens.
              const bodyText = (await page.textContent('body')) || '';
              const tokens = bodyText.match(/[A-Z0-9][A-Z0-9\-\s]{6,}/gi) || [];
              for (const raw of tokens) {
                if (!looksLikeOem(raw)) continue;
                const normalizedOem = normalizeOem(raw);
                if (!normalizedOem) continue;
                results.push({
                  oem: normalizedOem,
                  rawOem: raw.trim(),
                  description: 'Partsouq fallback text hit',
                  groupPath: input.partGroupPath,
                  provider: this.id,
                  url: page.url(),
                  confidence: baseConfidence * 0.8,
                  sourceType: 'EPC',
                  meta: {
                    brand: normalizedBrand,
                    vin: input.vin,
                    model: input.model,
                    year: input.year,
                    fallback: true,
                  },
                });
              }
            }

            ctx.log(`Partsouq: parsed ${results.length} candidates`, {
              url: page.url(),
              sample: results.slice(0, 3).map((r) => r.oem),
            });
          },
        },
      },
    ]);

    return results;
  }

  private buildTargetUrl(input: ParsedInput, normalizedBrand: string): string {
    if (input.vin) {
      return `https://partsouq.com/en/vin?v=${encodeURIComponent(input.vin)}`;
    }

    const terms = [normalizedBrand, input.model, input.partQuery].filter(Boolean).join(' ');
    if (terms) {
      return `https://partsouq.com/en/search/all?q=${encodeURIComponent(terms)}`;
    }

    return 'https://partsouq.com';
  }
}
