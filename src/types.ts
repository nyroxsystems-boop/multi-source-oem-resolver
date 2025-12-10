export interface SevenZapInput {
  brand: string;
  region?: string;
  vin?: string | null;
  modelName?: string | null;
  year?: number | null;
  partGroup: string;
  partName: string;
}

export interface VehicleResolved {
  model?: string;
  series?: string;
  year?: string;
  engine?: string;
  prCodes?: string[];
  extra?: Record<string, any>;
}

export interface OemEntry {
  oem: string;
  description: string | null;
  extraInfo: string | null;
  position: string | null;
}

export interface SevenZapOutput {
  brand: string;
  vin?: string | null;
  vehicleResolved?: VehicleResolved;
  partGroup: string;
  partName: string;
  diagramUrl?: string;
  oemNumbers: OemEntry[];
  meta: {
    source: '7zap';
    confidence: 'very_high' | 'high' | 'medium';
    timestamp: string;
  };
}
