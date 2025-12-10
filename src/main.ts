import { Actor, log } from 'apify';
import { PlaywrightCrawler, PlaywrightCrawlingContext } from 'crawlee';
import { z } from 'zod';
import { logOEMResult } from './utils/oemLog';
import { normalizeBrand, normalizeOem, normalizeText } from './utils/normalize';
import { SevenZapInput, SevenZapOutput, VehicleResolved, OemEntry } from './types';
import { looksLikeOem } from './utils/oem';

type UserDataHandler = (ctx: PlaywrightCrawlingContext) => Promise<void>;

const inputSchema = z.union([
  z.object({
    brand: z.string(),
    region: z.string().optional(),
    vin: z.string().nullable().optional(),
    modelName: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    partGroup: z.string(),
    partName: z.string(),
  }),
  z.object({
    queries: z.array(
      z.object({
        brand: z.string(),
        region: z.string().optional(),
        vin: z.string().nullable().optional(),
        modelName: z.string().nullable().optional(),
        year: z.number().nullable().optional(),
        partGroup: z.string(),
        partName: z.string(),
      }),
    ),
  }),
]);

const BRAND_CONFIG: Record<string, { baseUrl: string }> = {
  VOLKSWAGEN: { baseUrl: 'https://volkswagen.7zap.com/en/europe/' },
  AUDI: { baseUrl: 'https://audi.7zap.com/en/europe/' },
  SKODA: { baseUrl: 'https://skoda.7zap.com/en/europe/' },
  SEAT: { baseUrl: 'https://seat.7zap.com/en/europe/' },
  RENAULT: { baseUrl: 'https://renault.7zap.com/en/europe/' },
  PEUGEOT: { baseUrl: 'https://peugeot.7zap.com/en/europe/' },
  CITROEN: { baseUrl: 'https://citroen.7zap.com/en/europe/' },
  FORD: { baseUrl: 'https://ford.7zap.com/en/europe/' },
};

Actor.main(async () => {
  const rawInput = await Actor.getInput();
  const parsed = inputSchema.parse(rawInput);
  const inputs: SevenZapInput[] = 'queries' in parsed ? parsed.queries : [parsed];

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1000,
    maxConcurrency: 2,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 90,
    proxyConfiguration: await Actor.createProxyConfiguration({
      proxyUrls: ['http://scraperapi:30cb9073f3273243a3134450b038857a@proxy-server.scraperapi.com:8001'],
    }),
    browserPoolOptions: {
      maxOpenPagesPerBrowser: 2,
      retireBrowserAfterPageCount: 10,
    },
    launchContext: {
      launchOptions: {
        headless: true,
        ignoreHTTPSErrors: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      },
    },
    preNavigationHooks: [
      async (ctx, goToOptions) => {
        await ctx.page.setExtraHTTPHeaders({
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        });
        goToOptions.waitUntil = 'domcontentloaded';
        goToOptions.timeout = 60_000;
      },
    ],
    async requestHandler(crawlingCtx) {
      const handler = (crawlingCtx.request.userData as { handler?: UserDataHandler }).handler;
      if (handler) {
        await handler(crawlingCtx);
      }
    },
  });

  for (const input of inputs) {
    const logger = log.child({ prefix: `7ZAP-${input.brand}-${input.partName}` });
    const { baseUrl } = resolveBrandConfig(input);
    const resultBucket: SevenZapOutput[] = [];

    await crawler.run([
      {
        url: baseUrl,
        userData: {
          handler: async (ctx: PlaywrightCrawlingContext) => {
            const { page } = ctx;
            const vehicleResolved: VehicleResolved = {};

            logger.info(`Opening brand catalog ${baseUrl}`);
            await openBrandCatalog(page, baseUrl, logger);

            if (input.vin) {
              await tryVinSearch(page, input.vin, vehicleResolved, logger);
            }
            if (!vehicleResolved.model) {
              await selectVehicleByModel(page, input, vehicleResolved, logger);
            }

            await openPartGroup(page, input.partGroup, logger);
            await openDiagramForPart(page, input.partName, logger);

            const { oems, diagramUrl } = await extractOemFromDiagram(page, input.partName, logger);
            await logOEMResult({ log: (msg: string, data?: any) => logger.info(msg, data) }, '7ZAP', page, oems);

            const confidence: SevenZapOutput['meta']['confidence'] = oems.length ? 'high' : 'medium';
            resultBucket.push({
              brand: input.brand,
              vin: input.vin,
              vehicleResolved,
              partGroup: input.partGroup,
              partName: input.partName,
              diagramUrl,
              oemNumbers: oems,
              meta: {
                source: '7zap',
                confidence,
                timestamp: new Date().toISOString(),
              },
            });
          },
        },
      },
    ]);

    for (const item of resultBucket) {
      await Actor.pushData(item);
    }
  }
});

const resolveBrandConfig = (input: SevenZapInput) => {
  const norm = normalizeBrand(input.brand);
  return BRAND_CONFIG[norm] ?? { baseUrl: 'https://7zap.com/en/catalog/cars/' };
};

async function openBrandCatalog(page: PlaywrightCrawlingContext['page'], url: string, logger: any) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  logger.info(`Opened brand catalog`, { url: page.url() });
}

async function tryVinSearch(
  page: PlaywrightCrawlingContext['page'],
  vin: string,
  vehicleResolved: VehicleResolved,
  logger: any,
) {
  try {
    const vinInput = await page.$('input[name*="vin"], input[placeholder*="VIN"], input[id*="vin"]');
    if (vinInput) {
      await vinInput.fill(vin);
      await vinInput.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      vehicleResolved.extra = { vinDecoded: true };
      logger.info('VIN search submitted');
    } else {
      logger.info('VIN input not found; falling back to manual selection');
    }
  } catch (err: any) {
    logger.warning(`VIN search failed: ${err?.message || err}`);
  }
}

async function selectVehicleByModel(
  page: PlaywrightCrawlingContext['page'],
  input: SevenZapInput,
  vehicleResolved: VehicleResolved,
  logger: any,
) {
  try {
    const cards = await page.$$('a, li');
    const targets: { handle: any; score: number; text: string }[] = [];
    const modelNeedle = normalizeText(input.modelName || '');
    const year = input.year || undefined;

    for (const c of cards) {
      const text = (await c.textContent())?.trim() || '';
      const norm = normalizeText(text);
      if (!norm) continue;
      let score = 0;
      if (modelNeedle && norm.includes(modelNeedle)) score += 2;
      if (year && /\d{4}/.test(text)) score += 1;
      if (score > 0) targets.push({ handle: c, score, text });
    }

    targets.sort((a, b) => b.score - a.score);
    const best = targets[0];
    if (best) {
      await best.handle.click();
      await page.waitForLoadState('domcontentloaded');
      vehicleResolved.model = best.text;
      logger.info('Selected model', { text: best.text });
    } else {
      logger.info('No model match found; staying on catalog page');
    }
  } catch (err: any) {
    logger.warning(`Model selection failed: ${err?.message || err}`);
  }
}

async function openPartGroup(page: PlaywrightCrawlingContext['page'], partGroup: string, logger: any) {
  const target = normalizeText(partGroup);
  try {
    const entries = await page.$$('a, li');
    const scored: { handle: any; score: number; text: string }[] = [];
    for (const e of entries) {
      const text = (await e.textContent())?.trim() || '';
      const norm = normalizeText(text);
      if (!norm) continue;
      let score = 0;
      if (norm.includes('engine') && target.includes('engine')) score += 2;
      if (norm.includes('brake') && target.includes('brake')) score += 2;
      if (norm.includes('suspension') && target.includes('suspension')) score += 2;
      if (norm.includes(target)) score += 1;
      if (score > 0) scored.push({ handle: e, score, text });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) {
      await best.handle.click();
      await page.waitForLoadState('domcontentloaded');
      logger.info('Opened part group', { text: best.text });
    } else {
      logger.info('No matching part group; staying on page');
    }
  } catch (err: any) {
    logger.warning(`Part group navigation failed: ${err?.message || err}`);
  }
}

async function openDiagramForPart(page: PlaywrightCrawlingContext['page'], partName: string, logger: any) {
  const target = normalizeText(partName);
  try {
    const entries = await page.$$('a, li, tr');
    const scored: { handle: any; score: number; text: string }[] = [];
    for (const e of entries) {
      const text = (await e.textContent())?.trim() || '';
      const norm = normalizeText(text);
      if (!norm) continue;
      let score = 0;
      if (norm.includes(target)) score += 2;
      if (norm.includes('spark') && target.includes('spark')) score += 1;
      if (norm.includes('plug') && target.includes('plug')) score += 1;
      if (score > 0) scored.push({ handle: e, score, text });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) {
      await best.handle.click();
      await page.waitForLoadState('domcontentloaded');
      logger.info('Opened diagram', { text: best.text });
    } else {
      logger.info('No diagram match; staying on page');
    }
  } catch (err: any) {
    logger.warning(`Diagram navigation failed: ${err?.message || err}`);
  }
}

async function extractOemFromDiagram(
  page: PlaywrightCrawlingContext['page'],
  partName: string,
  logger: any,
): Promise<{ oems: OemEntry[]; diagramUrl: string }> {
  const oems: OemEntry[] = [];
  try {
    await page.waitForSelector('table', { timeout: 15000 });
  } catch {
    logger.info('Diagram table not found within timeout', { url: page.url() });
  }

  const rows = await page.$$eval('table tr', (trs) => {
    return trs
      .map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
        if (!tds.length) return null;
        const position = tds[0] || null;
        const number = tds.find((t) => /[A-Z0-9]{5,}/i.test(t)) || null;
        const description = tds.find((t, idx) => idx > 0 && t.length > 2) || null;
        const extra = tds.slice(-1)[0] || null;
        if (!number) return null;
        return { position, number, description, extra };
      })
      .filter(Boolean) as { position: string | null; number: string; description: string | null; extra: string | null }[];
  });

  for (const row of rows) {
    const oem = normalizeOem(row.number);
    if (!oem || !looksLikeOem(oem)) continue;
    const descMatch = row.description ? normalizeText(row.description).includes(normalizeText(partName)) : false;
    oems.push({
      oem,
      description: row.description,
      extraInfo: row.extra,
      position: row.position,
    });
    // optional: could score descMatch, but kept simple
  }

  return { oems, diagramUrl: page.url() };
}
