import { Actor } from 'apify';
import { PlaywrightCrawler, PlaywrightCrawlingContext } from 'crawlee';
import { z } from 'zod';
import { createLogger } from './utils/log';
import { normalizeBrand, normalizeOem, normalizeText } from './utils/normalize';
import { parseBrand } from './utils/brandParser';
import { parsePart } from './utils/partParser';
import { scoreCandidates } from './utils/scoring';
import { OemCandidate, OemResolverInput, OemResolverOutput, ParsedInput } from './types';
import { AutodocProvider } from './providers/autodocProvider';
import { FallbackSearchProvider } from './providers/fallbackSearchProvider';
import { PartsouqProvider } from './providers/partsouqProvider';
import { Provider, ProviderContext } from './providers/base';
import { RealOemProvider } from './providers/realOemProvider';
import { SevenZapProvider } from './providers/sevenZapProvider';

type UserDataHandler = (ctx: PlaywrightCrawlingContext) => Promise<void>;

const singleInputSchema = z.object({
  rawQuery: z.string(),
  vin: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  engineCode: z.string().optional(),
  partQuery: z.string().optional(),
  locale: z.string().optional(),
  countryCode: z.string().optional(),
});

const inputSchema = z.union([singleInputSchema, z.object({ queries: z.array(singleInputSchema) })]);

const providers: Provider[] = [
  new RealOemProvider(),
  new SevenZapProvider(),
  new PartsouqProvider(),
  new AutodocProvider(),
  new FallbackSearchProvider(),
];

Actor.main(async () => {
  const rawInput = await Actor.getInput();
  const parsedInput = inputSchema.parse(rawInput);
  const inputs: OemResolverInput[] = 'queries' in parsedInput ? parsedInput.queries : [parsedInput];

const globalLog = createLogger('OEM-ULTRA-RESOLVER');

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 100,
    maxConcurrency: 1,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 60,
    browserPoolOptions: {
      maxOpenPagesPerBrowser: 1,
      retireBrowserAfterPageCount: 1,
    },
    launchContext: {
      launchOptions: {
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      },
    },
    async requestHandler(crawlingCtx) {
      const handler = (crawlingCtx.request.userData as { handler?: UserDataHandler }).handler;
      if (handler) {
        await handler(crawlingCtx);
      }
    },
  });

  const outputs: OemResolverOutput[] = [];

  for (const input of inputs) {
    const parsed = buildParsedInput(input);
    const queryLog = createLogger(`Query-${parsed.normalizedBrand || parsed.brand || 'UNKNOWN'}-${parsed.partQuery || ''}`);
    queryLog('Parsed input', parsed);

    const providerCtx: ProviderContext = { crawler, log: queryLog };
    const selectedProviders = pickProviders(parsed);
    if (!selectedProviders.length) {
      globalLog(`No provider could handle brand=${parsed.brand} vin=${parsed.vin}`);
      outputs.push({ parsedInput: parsed, candidates: [] });
      continue;
    }

    const allCandidates: OemCandidate[] = [];

    for (const provider of selectedProviders) {
      try {
        queryLog(`Running provider ${provider.id}`);
        const providerResults = await provider.fetch(parsed, providerCtx);
        allCandidates.push(...providerResults);
      } catch (err: any) {
        queryLog(`Provider ${provider.id} failed: ${err?.message || err}`, { err });
      }
    }

    const { scored, primary } = scoreCandidates(allCandidates, parsed.partGroupPath);

    const output: OemResolverOutput = {
      parsedInput: {
        brand: parsed.brand ?? parsed.normalizedBrand,
        model: parsed.model,
        year: parsed.year,
        engineCode: parsed.engineCode,
        partQuery: parsed.partQuery,
        vin: parsed.vin,
      },
      candidates: scored,
      primary,
    };

    outputs.push(output);
  }

  await Actor.pushData(outputs);
});

function buildParsedInput(input: OemResolverInput): ParsedInput {
  const brandResult = parseBrand(input.rawQuery, input.brand);
  const partResult = parsePart(input.rawQuery, input.partQuery);

  const year = input.year ?? extractYear(input.rawQuery);
  const engineCode = input.engineCode ?? extractEngineCode(input.rawQuery);

  const remainderParts = [brandResult.remainingText, partResult.remainingText].filter(Boolean).join(' ');
  const model = (input.model ?? deriveModel(remainderParts, year, engineCode)) || input.model;

  const normalizedBrand = brandResult.normalizedBrand ?? (brandResult.brand ? normalizeBrand(brandResult.brand) : undefined);
  const normalizedPartQuery = partResult.normalizedPartQuery ?? (input.partQuery ? normalizeText(input.partQuery) : undefined);

  return {
    rawQuery: input.rawQuery,
    vin: input.vin,
    brand: brandResult.brand ?? input.brand,
    normalizedBrand,
    model: model || undefined,
    year: year || undefined,
    engineCode: engineCode || undefined,
    partQuery: partResult.partQuery ?? input.partQuery,
    normalizedPartQuery,
    partGroupPath: partResult.groupPath,
    locale: input.locale,
    countryCode: input.countryCode,
  };
}

function extractYear(text: string): number | undefined {
  const match = text.match(/(20\\d{2}|19\\d{2})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  if (year < 1980 || year > 2035) return undefined;
  return year;
}

function extractEngineCode(text: string): string | undefined {
  const tokens = text.split(/\\s+/).map((t) => t.replace(/[^a-zA-Z0-9-]/g, ''));
  const candidate = tokens.find((t) => /^[A-Z0-9-]{3,8}$/.test(t) && /[0-9]/.test(t) && /[A-Z]/i.test(t));
  return candidate;
}

function deriveModel(text: string, year?: number, engineCode?: string): string | undefined {
  let cleaned = text;
  if (year) cleaned = cleaned.replace(new RegExp(String(year), 'g'), ' ');
  if (engineCode) cleaned = cleaned.replace(new RegExp(engineCode, 'ig'), ' ');
  cleaned = cleaned.replace(/\\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  const tokens = cleaned.split(' ');
  if (!tokens.length) return undefined;
  return tokens.slice(0, Math.min(tokens.length, 5)).join(' ').toUpperCase();
}

function pickProviders(parsed: ParsedInput): Provider[] {
  return providers.filter((provider) => {
    if (provider.supportedBrands.length) {
      if (!parsed.normalizedBrand) return false;
      if (!provider.supportedBrands.includes(parsed.normalizedBrand)) return false;
    }
    return provider.canHandle(parsed);
  });
}
