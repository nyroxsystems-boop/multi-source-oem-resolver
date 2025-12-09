export const brandAliasMap: Record<string, string> = {
  VW: 'VOLKSWAGEN',
  VOLKSWAGEN: 'VOLKSWAGEN',
  VAG: 'VOLKSWAGEN',
  'MERCEDES-BENZ': 'MERCEDES-BENZ',
  'MERCEDES BENZ': 'MERCEDES-BENZ',
  MERCEDES: 'MERCEDES-BENZ',
  BENZ: 'MERCEDES-BENZ',
  MB: 'MERCEDES-BENZ',
  BMW: 'BMW',
  AUDI: 'AUDI',
  SEAT: 'SEAT',
  SKODA: 'SKODA',
  OPEL: 'OPEL',
  GM: 'OPEL',
  FORD: 'FORD',
  PEUGEOT: 'PEUGEOT',
  CITROEN: 'CITROEN',
  RENAULT: 'RENAULT',
  DACIA: 'DACIA',
  FIAT: 'FIAT',
  ALFA: 'ALFA ROMEO',
  'ALFA ROMEO': 'ALFA ROMEO',
  LANCIA: 'LANCIA',
  TOYOTA: 'TOYOTA',
  LEXUS: 'LEXUS',
  NISSAN: 'NISSAN',
  INFINITI: 'INFINITI',
  HYUNDAI: 'HYUNDAI',
  KIA: 'KIA',
  MITSUBISHI: 'MITSUBISHI',
  SUBARU: 'SUBARU',
  MAZDA: 'MAZDA',
  HONDA: 'HONDA',
  SUZUKI: 'SUZUKI',
  ISUZU: 'ISUZU',
  CHEVROLET: 'CHEVROLET',
  CHEVY: 'CHEVROLET',
  CADILLAC: 'CADILLAC',
  BUICK: 'BUICK',
  GMC: 'GMC',
  VOLVO: 'VOLVO',
  SAAB: 'SAAB',
  TESLA: 'TESLA',
  PORSCHE: 'PORSCHE',
  JAGUAR: 'JAGUAR',
  LANDROVER: 'LAND ROVER',
  'LAND ROVER': 'LAND ROVER',
  MINI: 'MINI',
};

export function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeBrand(value: string): string {
  const cleaned = stripDiacritics(value).trim().toUpperCase();
  return brandAliasMap[cleaned] || cleaned;
}

export function normalizeOem(str: string): string {
  return str.toUpperCase().replace(/[^0-9A-Z]/g, '').trim();
}

export function normalizeText(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
