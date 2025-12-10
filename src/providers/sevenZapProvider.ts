import { PlaywrightCrawlingContext } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';
import { normalizeBrand, normalizeOem } from '../utils/normalize';
import { looksLikeOem } from '../utils/oem';
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
    const hasQuery = input.partQuery && input.partQuery.trim().length >= 3;
    return !!hasQuery && !!brand && this.supportedBrands.includes(brand);
  }

  async fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]> {
    const results: OemCandidate[] = [];
    const normalizedBrand = input.normalizedBrand ?? (input.brand ? normalizeBrand(input.brand) : undefined);
    if (!normalizedBrand) return results;

    const targetUrl = this.buildTargetUrl(input, normalizedBrand);
    const hasVin = !!input.vin;
    const baseConfidence = hasVin ? 0.93 : 0.84;

    await ctx.crawler.run([
      {
        url: targetUrl,
        userData: {
          label: 'SEVENZAP_START',
          handler: async (playCtx: PlaywrightCrawlingContext) => {
            const { page } = playCtx;
            ctx.log(`7zap: start ${normalizedBrand} ${input.partQuery || ''}`, { url: targetUrl });

            // TODO: Ensure 7zap ToS/robots compliance before production scraping.

            type ExtractedRow = {
              rawOem: string;
              description: string | null;
              quantity: number | null;
            };

            const tables = page.locator('table');
            const tableCount = await tables.count();
            let extractedRows: ExtractedRow[] = [];

            for (let i = 0; i < tableCount; i++) {
              const tableLocator = tables.nth(i);
              const rows = await tableLocator.evaluateAll<ExtractedRow[]>((tableElements) => {
                const oemPattern = /[0-9A-Z- ]{5,}/i;
                const digitPattern = /\d/;

                const pickOem = (cells: string[]): string | null => {
                  for (const cell of cells) {
                    const text = cell.trim();
                    if (text.length < 5) continue;
                    if (!digitPattern.test(text)) continue;
                    if (oemPattern.test(text)) return text;
                  }
                  return null;
                };

                const pickDescription = (cells: string[], skipValue: string | null): string | null => {
                  for (const cell of cells) {
                    const text = cell.trim();
                    if (!text) continue;
                    if (skipValue && text === skipValue) continue;
                    return text;
                  }
                  return null;
                };

                const pickQuantity = (cells: string[]): number | null => {
                  for (const cell of cells) {
                    const text = cell.trim();
                    if (/^\d+$/.test(text)) return Number(text);
                  }
                  return null;
                };

                for (const table of tableElements) {
                  const rows: ExtractedRow[] = [];
                  const trEls = Array.from(table.querySelectorAll('tr'));
                  for (const tr of trEls) {
                    const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent || '').map((t) => t.trim()).filter(Boolean);
                    if (!cells.length) continue;

                    const rawOem = pickOem(cells);
                    if (!rawOem) continue;

                    const description = pickDescription(cells.filter((c) => c !== rawOem), rawOem);
                    const quantity = pickQuantity(cells);

                    rows.push({
                      rawOem,
                      description: description || null,
                      quantity: Number.isFinite(quantity) ? (quantity as number) : null,
                    });
                  }

                  if (rows.length) return rows;
                }

                return [];
              });

              if (rows.length) {
                extractedRows = rows;
                break;
              }
            }

            if (extractedRows.length) {
              ctx.log(`7zap: extracted ${extractedRows.length} rows`, {
                url: page.url(),
                sample: extractedRows.slice(0, 3).map((r) => r.rawOem),
              });
            } else {
              ctx.log('7zap: no table rows found', { url: page.url() });
            }

            for (const row of extractedRows) {
              const normalizedOem = normalizeOem(row.rawOem);
              if (!normalizedOem || normalizedOem.length < 6) continue;

              results.push({
                oem: normalizedOem,
                rawOem: row.rawOem,
                description: row.description || undefined,
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
                  quantity: row.quantity,
                },
              });
            }

            if (!results.length) {
              const bodyText = (await page.textContent('body')) || '';
              const tokens = bodyText.match(/[A-Z0-9][A-Z0-9\-\s]{6,}/gi) || [];
              for (const raw of tokens) {
                if (!looksLikeOem(raw)) continue;
                const normalizedOem = normalizeOem(raw);
                if (!normalizedOem || normalizedOem.length < 6) continue;
                results.push({
                  oem: normalizedOem,
                  rawOem: raw.trim(),
                  description: '7zap fallback text hit',
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
            ctx.log(`7zap: parsed ${results.length} candidates`, {
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
      return `https://7zap.com/search?keyword=${encodeURIComponent(input.vin)}`;
    }
    const terms = [normalizedBrand, input.model, input.partQuery].filter(Boolean).join(' ');
    if (terms) {
      return `https://7zap.com/search?keyword=${encodeURIComponent(terms)}`;
    }
    return 'https://7zap.com';
  }
}
