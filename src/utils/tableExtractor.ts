import { Page } from 'playwright';

export interface TableRowDescriptor {
  rawOem: string;
  description: string;
}

export interface TableExtractOptions {
  tableSelector: string;
  headerMustContain?: string[];
  descriptionCellIndex?: number;
  oemCellIndices?: number[];
  descriptionFilter?: (desc: string) => boolean;
}

export async function extractOemFromTable(
  page: Page,
  options: TableExtractOptions,
): Promise<TableRowDescriptor[]> {
  const {
    tableSelector,
    descriptionCellIndex = 1,
    oemCellIndices = [],
    descriptionFilter,
  } = options;

  const rows = await page.$$eval(`${tableSelector} tr`, (trs, opts: { descIdx: number; oemIdx: number[] }) => {
    return (trs as HTMLTableRowElement[])
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[];
        if (!cells.length) return null;

        const texts = cells.map((c) => (c.textContent || '').trim());
        if (!texts.length) return null;

        const description = texts[opts.descIdx] || '';

        let rawOem = '';
        if (opts.oemIdx && opts.oemIdx.length) {
          for (const idx of opts.oemIdx) {
            if (texts[idx]) {
              rawOem = texts[idx];
              break;
            }
          }
        } else {
          rawOem = texts[texts.length - 1];
        }

        if (!rawOem) return null;

        return { rawOem, description };
      })
      .filter(Boolean);
  }, { descIdx: descriptionCellIndex, oemIdx: oemCellIndices });

  const filtered = (rows as TableRowDescriptor[]).filter((row) =>
    descriptionFilter ? descriptionFilter(row.description) : true,
  );
  return filtered;
}
