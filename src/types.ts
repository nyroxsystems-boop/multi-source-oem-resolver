export interface OemResolverInput {
  rawQuery: string;
  vin?: string;
  brand?: string;
  model?: string;
  year?: number;
  engineCode?: string;
  partQuery?: string;
  locale?: string;
  countryCode?: string;
}

export interface OemCandidate {
  oem: string;
  rawOem?: string;
  description?: string;
  groupPath?: string[];
  provider: '7ZAP' | 'PARTSOUQ' | 'REALOEM' | 'AUTODOC' | 'FALLBACK';
  url?: string;
  confidence: number;
  meta?: Record<string, any>;
}

export interface OemResolverOutput {
  parsedInput: {
    brand?: string;
    model?: string;
    year?: number;
    engineCode?: string;
    partQuery?: string;
    vin?: string;
  };
  candidates: OemCandidate[];
  primary?: OemCandidate;
}

export interface ParsedInput {
  rawQuery: string;
  vin?: string;
  brand?: string;
  normalizedBrand?: string;
  model?: string;
  year?: number;
  engineCode?: string;
  partQuery?: string;
  normalizedPartQuery?: string;
  partGroupPath?: string[];
  locale?: string;
  countryCode?: string;
}
