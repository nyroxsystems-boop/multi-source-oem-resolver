import { Actor, log } from 'apify';
import { chromium, Page } from 'playwright';
import { z } from 'zod';
import { normalizeOem, normalizeText } from './utils/normalize';
import { looksLikeOem } from './utils/oem';
import { logOEMResult } from './utils/oemLog';
import { OemEntry } from './types';

type VehicleInfo = {
  vin?: string;
  modelName?: string;
  productionYear?: number;
};

type PartInfo = {
  mainGroupName: string;
  partName: string;
};

const inputSchema = z.object({
  brand: z.string(),
  vehicle: z
    .object({
      vin: z.string().optional().nullable(),
      modelName: z.string().optional().nullable(),
      productionYear: z.number().optional().nullable(),
    })
    .optional(),
  part: z.object({
    mainGroupName: z.string(),
    partName: z.string(),
  }),
});

const BRAND_CONFIG: Record<string, string> = {
  VOLKSWAGEN: 'https://volkswagen.7zap.com/en/europe/',
  AUDI: 'https://audi.7zap.com/en/europe/',
  SKODA: 'https://skoda.7zap.com/en/europe/',
  SEAT: 'https://seat.7zap.com/en/europe/',
  RENAULT: 'https://renault.7zap.com/en/europe/',
  PEUGEOT: 'https://peugeot.7zap.com/en/europe/',
  CITROEN: 'https://citroen.7zap.com/en/europe/',
  FORD: 'https://ford.7zap.com/en/europe/',
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

Actor.main(async () => {
  const rawInput = await Actor.getInput();
  const parsed = inputSchema.parse(rawInput);

  const brand = parsed.brand;
  const vehicle = parsed.vehicle || {};
  const part = parsed.part;
  const vehicleResolved: Record<string, any> = {};

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9',
    },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    const baseUrl = resolveBrandUrl(brand);
    log.info('Starting 7zap scraper', { baseUrl, brand, vehicle, part });

    await safeGoto(page, 'https://7zap.com/en/catalog/cars/');
    if (baseUrl !== 'https://7zap.com/en/catalog/cars/') {
      await safeGoto(page, baseUrl);
    } else {
      await clickBrandOnCatalog(page, brand);
    }
    await sleep(rand(500, 1500));

    // VIN selection if possible
    let vehicleSelected = false;
    if (vehicle.vin) {
      vehicleSelected = await tryVin(page, vehicle.vin, vehicleResolved);
      await sleep(rand(500, 1500));
    }

    if (!vehicleSelected) {
      await selectModel(page, vehicle.modelName, vehicle.productionYear, vehicleResolved);
      await sleep(rand(500, 1500));
    }

    await openMainGroup(page, part.mainGroupName);
    await sleep(rand(500, 1500));
    await openDiagram(page, part.partName);
    await sleep(rand(500, 1500));

    const { entries, diagramUrl } = await extractOems(page, part.partName);

    await Actor.pushData({
      brand,
      vehicleResolved,
      diagramUrl,
      partGroup: part.mainGroupName,
      partName: part.partName,
      oemNumbers: entries,
      meta: {
        source: '7zap',
        confidence: entries.length ? 'high' : 'medium',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    log.error('Scraper failed', { error: err?.message || err });
  } finally {
    await browser.close();
  }
});

function resolveBrandUrl(brand: string): string {
  const norm = normalizeText(brand).toUpperCase();
  return BRAND_CONFIG[norm] ?? 'https://7zap.com/en/catalog/cars/';
}

async function safeGoto(page: Page, url: string) {
  log.info(`Navigating to ${url}`);
  await page.goto(url, { timeout: 180_000, waitUntil: 'domcontentloaded' });
}

async function clickBrandOnCatalog(page: Page, brand: string) {
  const norm = normalizeText(brand);
  const links = await page.$$('a, .brand, .item');
  for (const link of links) {
    const text = normalizeText((await link.textContent()) || '');
    if (text.includes(norm)) {
      await link.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
      log.info('Brand clicked from catalog', { text });
      return;
    }
  }
  log.warning('Brand not found in catalog; staying on page');
}

async function tryVin(page: Page, vin: string, vehicleResolved: Record<string, any>) {
  try {
    const vinInput = await page.$('input[name*="vin"], input[id*="vin"], input[placeholder*="VIN"]');
    if (vinInput) {
      await vinInput.fill(vin);
      await vinInput.press('Enter');
      await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
      vehicleResolved.vinDecoded = true;
      log.info('VIN submitted');
      return true;
    }
    log.info('VIN input not present; fallback to model selection');
    return false;
  } catch (err: any) {
    log.warning('VIN selection failed', { error: err?.message || err });
    return false;
  }
}

async function selectModel(page: Page, modelName?: string | null, year?: number | null, vehicleResolved: Record<string, any> = {}) {
  const normModel = normalizeText(modelName || '');
  const candidates = await page.$$('a, li, .item');
  let best: { handle: any; score: number; text: string } | null = null;
  for (const c of candidates) {
    const txt = (await c.textContent())?.trim() || '';
    const norm = normalizeText(txt);
    if (!norm) continue;
    let score = 0;
    if (normModel && norm.includes(normModel)) score += 2;
    if (year && /\d{4}/.test(txt)) score += 1;
    if (score > 0 && (!best || score > best.score)) {
      best = { handle: c, score, text: txt };
    }
  }
  if (best) {
    await best.handle.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
    vehicleResolved.model = best.text;
    log.info('Selected model', { text: best.text });
  } else {
    log.warning('No model selected; proceeding without vehicle details');
  }
}

async function openMainGroup(page: Page, mainGroupName: string) {
  const target = normalizeText(mainGroupName);
  const entries = await page.$$('a, li, .category, .item');
  let best: { handle: any; score: number; text: string } | null = null;
  for (const e of entries) {
    const txt = (await e.textContent())?.trim() || '';
    const norm = normalizeText(txt);
    if (!norm) continue;
    let score = 0;
    if (norm.includes(target)) score += 2;
    if (norm.includes('engine') && target.includes('engine')) score += 1;
    if (norm.includes('brake') && target.includes('brake')) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { handle: e, score, text: txt };
  }
  if (best) {
    await best.handle.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
    log.info('Opened main group', { text: best.text });
  } else {
    log.warning('No matching main group found');
  }
}

async function openDiagram(page: Page, partName: string) {
  const target = normalizeText(partName);
  const entries = await page.$$('a, li, tr');
  let best: { handle: any; score: number; text: string } | null = null;
  for (const e of entries) {
    const txt = (await e.textContent())?.trim() || '';
    const norm = normalizeText(txt);
    if (!norm) continue;
    let score = 0;
    if (norm.includes(target)) score += 2;
    if (norm.includes('spark') && target.includes('spark')) score += 1;
    if (norm.includes('plug') && target.includes('plug')) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { handle: e, score, text: txt };
  }
  if (best) {
    await best.handle.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 180_000 });
    log.info('Opened diagram', { text: best.text });
  } else {
    log.warning('No diagram found for partName');
  }
}

async function extractOems(page: Page, partName: string): Promise<{ entries: OemEntry[]; diagramUrl: string }> {
  const entries: OemEntry[] = [];
  try {
    await page.waitForSelector('table', { timeout: 180_000 });
  } catch {
    log.warning('No table found on diagram page', { url: page.url() });
  }

  const rows = await page.$$eval('table tr', (trs) => {
    return trs
      .map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
        if (!tds.length) return null;
        const position = tds[0] || null;
        const number = tds.find((t) => /[A-Z0-9]{5,}/i.test(t)) || null;
        const description = tds.find((t, idx) => idx > 0 && t.length > 2) || null;
        const extraInfo = tds.slice(-1)[0] || null;
        if (!number) return null;
        return { position, number, description, extraInfo };
      })
      .filter(Boolean) as { position: string | null; number: string; description: string | null; extraInfo: string | null }[];
  });

  const normTarget = normalizeText(partName);
  for (const row of rows) {
    const oem = normalizeOem(row.number);
    if (!oem || !looksLikeOem(oem)) continue;
    const descMatch = row.description ? normalizeText(row.description).includes(normTarget) : false;
    entries.push({
      oem,
      description: row.description,
      extraInfo: row.extraInfo,
      position: row.position,
    });
  }

  await logOEMResult({ log: (msg: string, data?: any) => log.info(msg, data) }, '7ZAP', page, entries);
  return { entries, diagramUrl: page.url() };
}
