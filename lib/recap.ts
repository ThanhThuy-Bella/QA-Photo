import ExcelJS from 'exceljs';

export interface RecapRow {
  go_no: string | null;
  cust_style: string;
  jo_no: string;
  lot: string;
  color_code: string;
  order_qty: number;
  sew_start: string | null;
  bpo_date: string | null;
  category: 'Men' | 'Ladies';
}

const REQUIRED = ['GO No', 'Cust. Style No', 'JO No', 'Color Code', 'Order Qty', 'Sewing Start Date', 'BPO Del Date', 'Style Desc(EN)'];

function cellValue(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in o) return o.text;
  }
  return v;
}

function toText(v: unknown): string {
  const x = cellValue(v);
  return x === null || x === undefined ? '' : String(x).trim();
}

function toDate(v: unknown): string | null {
  const x = cellValue(v);
  if (x instanceof Date && !isNaN(x.getTime())) return x.toISOString().slice(0, 10);
  if (typeof x === 'number') {
    const d = new Date(Math.round((x - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof x === 'string' && x.trim()) {
    const d = new Date(x.trim());
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

/** 26M05665KR01::V::-  ->  { jo: 26M05665KR01, lot: KR01 } */
export function normalizeJo(raw: string) {
  const s = raw.trim();
  const m = s.match(/^(.*?KR\d+)/i);
  const jo = (m ? m[1] : s.split('::')[0]).toUpperCase();
  const lot = (jo.match(/KR\d+/i)?.[0] || jo.slice(-4)).toUpperCase();
  return { jo, lot };
}

export function categoryOf(desc: string): 'Men' | 'Ladies' {
  return desc.trim().toUpperCase().startsWith('MEN') ? 'Men' : 'Ladies';
}

/** Đọc sheet "Prod" của file Hazzys Order Recap (dòng tiêu đề = dòng 2). */
export async function parseRecap(file: File): Promise<RecapRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet('Prod');
  if (!ws) throw new Error('Không tìm thấy sheet "Prod" trong file recap.');

  let headerRow = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const names: Record<string, number> = {};
    ws.getRow(r).eachCell((c, n) => {
      names[toText(c.value)] = n;
    });
    if (names['JO No'] && names['Color Code']) {
      headerRow = r;
      Object.assign(col, names);
      break;
    }
  }
  if (!headerRow) throw new Error('Không tìm thấy dòng tiêu đề (cần cột "JO No", "Color Code").');
  const missing = REQUIRED.filter((k) => !col[k]);
  if (missing.length) throw new Error('File recap thiếu cột: ' + missing.join(', '));

  const map = new Map<string, RecapRow>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: string) => row.getCell(col[k]).value;
    const joRaw = toText(get('JO No'));
    const color = toText(get('Color Code'));
    const style = toText(get('Cust. Style No'));
    if (!joRaw || !color || !style) continue;
    const { jo, lot } = normalizeJo(joRaw);
    const key = `${jo}|${color}`;
    const qty = Number(cellValue(get('Order Qty'))) || 0;
    const prev = map.get(key);
    if (prev) {
      prev.order_qty += qty;
      continue;
    }
    map.set(key, {
      go_no: toText(get('GO No')) || null,
      cust_style: style,
      jo_no: jo,
      lot,
      color_code: color,
      order_qty: qty,
      sew_start: toDate(get('Sewing Start Date')),
      bpo_date: toDate(get('BPO Del Date')),
      category: categoryOf(toText(get('Style Desc(EN)'))),
    });
  }
  return Array.from(map.values());
}
