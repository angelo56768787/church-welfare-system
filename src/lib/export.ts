import * as XLSX from 'xlsx';
import { get } from './api';

export interface ExportCol { header: string; value: (row: any) => string | number | null | undefined }

export function exportXlsx(filename: string, cols: ExportCol[], rows: any[], totalsRow?: (string | number)[]) {
  const data = [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => c.value(r) ?? '')), ...(totalsRow ? [totalsRow] : [])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.header.length + 4) }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Fetch every page of a paginated list endpoint with the same filters (max 20 pages). */
export async function fetchAll(path: string, query: Record<string, unknown>) {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await get(path, { ...query, page, pageSize: 200 });
    out.push(...r.items);
    if (page >= r.pages) break;
  }
  return out;
}
