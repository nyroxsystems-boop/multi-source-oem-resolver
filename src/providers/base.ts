import { PlaywrightCrawler } from 'crawlee';
import { OemCandidate, ParsedInput } from '../types';

export interface ProviderContext {
  crawler: PlaywrightCrawler;
  log: (msg: string, data?: any) => void;
}

export interface Provider {
  id: OemCandidate['provider'];
  supportedBrands: string[];
  canHandle(input: ParsedInput): boolean;
  fetch(input: ParsedInput, ctx: ProviderContext): Promise<OemCandidate[]>;
}
