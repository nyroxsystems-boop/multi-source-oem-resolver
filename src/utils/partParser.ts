import { normalizeText } from './normalize';

export interface PartParseResult {
  partQuery?: string;
  normalizedPartQuery?: string;
  groupPath?: string[];
  remainingText: string;
}

const partSynonyms: Record<string, string> = {
  'spark plug': 'spark plug',
  zundkerze: 'spark plug',
  'zündkerze': 'spark plug',
  'ignition plug': 'spark plug',
  'oil filter': 'oil filter',
  olfilter: 'oil filter',
  'ölfilter': 'oil filter',
  luftfilter: 'air filter',
  'air filter': 'air filter',
  'cabin filter': 'cabin filter',
  pollenfilter: 'cabin filter',
  'fuel filter': 'fuel filter',
  'bremsbelag': 'brake pad',
  bremsbelage: 'brake pad',
  'brake pad': 'brake pad',
  'brake pads': 'brake pad',
  'bremsscheibe': 'brake disc',
  'bremsscheiben': 'brake disc',
  'brake disc': 'brake disc',
  'brake rotor': 'brake disc',
  'shock absorber': 'shock absorber',
  'stoßdämpfer': 'shock absorber',
  'stossdampfer': 'shock absorber',
  'rear shocks': 'shock absorber',
  'front shocks': 'shock absorber',
  motorlager: 'engine mount',
  'engine mount': 'engine mount',
  'aircon compressor': 'ac compressor',
  'ac compressor': 'ac compressor',
  'wasserpumpe': 'water pump',
  'water pump': 'water pump',
};

const partGroupMap: Record<string, string[]> = {
  'spark plug': ['Engine', 'Ignition', 'Spark plug'],
  'oil filter': ['Engine', 'Lubrication', 'Oil filter'],
  'air filter': ['Engine', 'Air intake', 'Air filter'],
  'cabin filter': ['HVAC', 'Filter'],
  'fuel filter': ['Fuel system', 'Filter'],
  'brake pad': ['Brakes', 'Pads'],
  'brake disc': ['Brakes', 'Discs'],
  'shock absorber': ['Suspension', 'Shock absorber'],
  'engine mount': ['Engine', 'Mounting'],
  'water pump': ['Engine', 'Cooling', 'Water pump'],
  'ac compressor': ['HVAC', 'Compressor'],
};

export function parsePart(rawQuery: string, explicitPart?: string): PartParseResult {
  if (explicitPart) {
    const normalized = normalizeToCanonical(explicitPart);
    return {
      partQuery: explicitPart,
      normalizedPartQuery: normalized ?? normalizeText(explicitPart),
      groupPath: normalized ? partGroupMap[normalized] : undefined,
      remainingText: removePartTokens(rawQuery, normalized || normalizeText(explicitPart)),
    };
  }

  const normalizedText = normalizeText(rawQuery);
  for (const [alias, canonical] of Object.entries(partSynonyms)) {
    const aliasNorm = normalizeText(alias);
    if (normalizedText.includes(aliasNorm)) {
      return {
        partQuery: canonical,
        normalizedPartQuery: canonical,
        groupPath: partGroupMap[canonical],
        remainingText: removePartTokens(rawQuery, alias),
      };
    }
  }

  return { remainingText: rawQuery };
}

function normalizeToCanonical(value: string): string | undefined {
  const norm = normalizeText(value);
  if (partSynonyms[norm]) return partSynonyms[norm];
  const direct = Object.entries(partSynonyms).find(([alias]) => normalizeText(alias) === norm);
  return direct ? direct[1] : undefined;
}

function removePartTokens(text: string, token: string): string {
  const normToken = normalizeText(token);
  const pattern = new RegExp(normToken.split(' ').join('\\s+'), 'ig');
  return text.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
}
