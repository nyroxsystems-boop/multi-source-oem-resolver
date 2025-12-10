import type { Page } from 'playwright';

export async function logOEMResult(
  ctx: { log: (msg: string, data?: any) => void },
  providerName: string,
  page: Page,
  rows: any[] = [],
): Promise<void> {
  const url = page.url();
  const count = rows.length;

  if (count === 0) {
    ctx.log(`Provider ${providerName}: ❌ no OEM rows at ${url}`);
    return;
  }

  const sample = rows
    .map((r) => r?.oemNumber || r?.oem || r?.partNumber || r?.number || r?.rawOem)
    .filter(Boolean)
    .slice(0, 3);

  ctx.log(`Provider ${providerName}: ✅ parsed ${count} OEM row(s) at ${url}`);
  ctx.log('Sample OEM(s):', sample.length ? sample : '(no OEM fields found)');
}
