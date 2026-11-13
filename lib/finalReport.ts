import ExcelJS from 'exceljs';

/** Ảnh đưa vào báo cáo: data URL (jpeg) + kích thước gốc. */
export interface Img {
  dataUrl: string;
  w: number;
  h: number;
}

export interface FinalPhotos {
  front: Img[]; // ảnh thân trước, theo thứ tự màu
  defects: Img[]; // ảnh lỗi
  accessory: Img[]; // mác sườn + thẻ bài, theo lot × màu
  packing: Img[]; // gập gói (Men)
  carton: Img[]; // mặt thùng + nhãn thùng (Men)
}

export interface GqsInfo {
  jos: string[];
  colors: string[];
  gqsStyle: string;
  desc: string;
  category: 'Men' | 'Ladies';
}

const EMU = 9525;
const LADIES_WIDTHS = [32.14, 41.86, 47, 16.29, 34.29, 20.14]; // A–F theo mẫu HSSH6BC30

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('result' in o) return String(o.result ?? '');
    if ('text' in o) return String(o.text);
  }
  return String(v);
}

function findRow(ws: ExcelJS.Worksheet, label: string): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (text(ws.getCell(r, 1).value).trim().toLowerCase() === label.toLowerCase()) return r;
  }
  return 0;
}

/** Đọc thông tin đầu file GQS: JO (B6), màu (B8), style (F5), mô tả (B9). */
export function readGqs(ws: ExcelJS.Worksheet): GqsInfo {
  const val = (label: string, col = 2) => {
    const r = findRow(ws, label);
    return r ? text(ws.getCell(r, col).value).trim() : '';
  };
  const split = (s: string) =>
    s
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const desc = val('Style Description');
  const goRow = findRow(ws, 'GO No.');
  return {
    jos: split(val('JO No.')),
    colors: split(val('Colour')),
    gqsStyle: goRow ? text(ws.getCell(goRow, 6).value).trim() : '',
    desc,
    category: desc.toUpperCase().startsWith('MEN') ? 'Men' : 'Ladies',
  };
}

export async function readGqsFile(buf: ArrayBuffer): Promise<GqsInfo> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return readGqs(wb.worksheets[0]);
}

/** Chèn dòng mà vẫn giữ đúng các ô gộp (exceljs không tự dời ô gộp). */
function insertRows(ws: ExcelJS.Worksheet, at: number, count: number) {
  const merges: string[] = [...((ws.model as unknown as { merges: string[] }).merges || [])];
  merges.forEach((m) => ws.unMergeCells(m));
  const blanks = Array.from({ length: count }, () => [] as ExcelJS.CellValue[]);
  ws.spliceRows(at, 0, ...blanks);
  for (let i = 0; i < count; i++) ws.getRow(at + i).height = 15;
  merges.forEach((m) => {
    const [a, b] = m.split(':');
    const shift = (ref: string) => {
      const mm = ref.match(/^([A-Z]+)(\d+)$/)!;
      const r = Number(mm[2]);
      return `${mm[1]}${r >= at ? r + count : r}`;
    };
    ws.mergeCells(`${shift(a)}:${shift(b || a)}`);
  });
}

function colPx(ws: ExcelJS.Worksheet, c: number) {
  const w = ws.getColumn(c).width ?? 9.14;
  return Math.round(w * 7 + 5);
}

/** Đặt ảnh tại tọa độ px tuyệt đối (x tính từ cột A, y tính từ đầu dòng row). */
function placeAbs(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, img: Img, x: number, row: number, y: number, w: number, h: number) {
  let col = 1;
  let left = x;
  while (left >= colPx(ws, col)) {
    left -= colPx(ws, col);
    col++;
  }
  const id = wb.addImage({ base64: img.dataUrl, extension: 'jpeg' });
  ws.addImage(id, {
    tl: { nativeCol: col - 1, nativeColOff: Math.round(left * EMU), nativeRow: row - 1, nativeRowOff: Math.round(y * EMU) } as unknown as ExcelJS.Anchor,
    ext: { width: Math.round(w), height: Math.round(h) },
    editAs: 'oneCell',
  });
}

function fit(img: Img, bw: number, bh: number) {
  const s = Math.min(bw / img.w, bh / img.h);
  return { w: img.w * s, h: img.h * s };
}

/** Lưới ảnh trong các dòng [startRow..]: mỗi dòng 1 hàng ảnh, chiều cao dòng tự tính. Trả về số dòng đã dùng. */
function gridRows(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  imgs: Img[],
  startRow: number,
  x0: number,
  width: number,
  perRow: number,
  maxH: number,
) {
  const cellW = width / perRow;
  const rows = Math.ceil(imgs.length / perRow);
  for (let r = 0; r < rows; r++) {
    const part = imgs.slice(r * perRow, r * perRow + perRow);
    const sizes = part.map((im) => fit(im, cellW - 12, maxH - 12));
    const rowHpx = Math.max(...sizes.map((s) => s.h)) + 12;
    ws.getRow(startRow + r).height = Math.min(409, (rowHpx * 72) / 96);
    part.forEach((im, i) => {
      const s = sizes[i];
      placeAbs(ws, wb, im, x0 + i * cellW + (cellW - s.w) / 2, startRow + r, (rowHpx - s.h) / 2, s.w, s.h);
    });
  }
  return rows;
}

function copyStyle(ws: ExcelJS.Worksheet, from: ExcelJS.Cell, to: ExcelJS.Cell) {
  to.style = JSON.parse(JSON.stringify(from.style || {}));
}

function header(ws: ExcelJS.Worksheet, row: number, label: string, styleFrom: ExcelJS.Cell) {
  const c = ws.getCell(row, 1);
  c.value = label;
  copyStyle(ws, styleFrom, c);
  ws.getRow(row).height = styleFrom.worksheet.getRow(Number(styleFrom.row)).height || 25.5;
}

/** Ladies: chèn 3 khối Style Photo / Defective Photo / Accessory Photo như mẫu HSSH6BC30. */
function fillLadies(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, p: FinalPhotos) {
  LADIES_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const styleCell = ws.getCell(findRow(ws, 'Judgment Information') || 12, 1);
  const headStyle = JSON.parse(JSON.stringify(styleCell.style || {}));
  const fakeFrom = { style: headStyle, worksheet: ws, row: styleCell.row } as unknown as ExcelJS.Cell;
  const totalW = LADIES_WIDTHS.reduce((n, w) => n + Math.round(w * 7 + 5), 0);

  // B1: chèn dòng từ dưới lên (ảnh chưa đặt, vì exceljs không dời ảnh khi chèn dòng).
  const blocks: { label: string; imgs: Img[]; perRow: number }[] = [];
  const qa = findRow(ws, 'QA Auditor:');
  if (qa && p.accessory.length) {
    insertRows(ws, qa, 1 + Math.ceil(p.accessory.length / 6));
    header(ws, qa, 'Accessory  Photo', fakeFrom);
    blocks.push({ label: 'Accessory  Photo', imgs: p.accessory, perRow: 6 });
  }
  const ii = findRow(ws, 'Inspection Items');
  if (ii && p.defects.length) {
    insertRows(ws, ii, 1 + Math.ceil(p.defects.length / 5));
    header(ws, ii, 'Defective  Photo', fakeFrom);
    blocks.push({ label: 'Defective  Photo', imgs: p.defects, perRow: 5 });
  }
  const fac = findRow(ws, 'Factory');
  if (fac && p.front.length) {
    insertRows(ws, fac + 2, 1 + Math.ceil(p.front.length / 6));
    header(ws, fac + 2, 'Style Photo', fakeFrom);
    blocks.push({ label: 'Style Photo', imgs: p.front, perRow: 6 });
  }
  // B2: khi số dòng đã cố định mới đặt ảnh.
  blocks.forEach((bl) => {
    const r = findRow(ws, bl.label);
    if (r) gridRows(ws, wb, bl.imgs, r + 1, 0, totalW, bl.perRow, 400);
  });
}

function boxHeader(ws: ExcelJS.Worksheet, range: string, label: string) {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(':')[0]);
  c.value = label;
  c.font = { name: 'Arial', size: 10, bold: true };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  const thin = { style: 'thin' as const };
  c.border = { top: thin, left: thin, bottom: thin, right: thin };
}

function rowsHeightPx(ws: ExcelJS.Worksheet, from: number, to: number) {
  let h = 0;
  for (let r = from; r <= to; r++) h += ((ws.getRow(r).height || 15) * 96) / 72;
  return h;
}

/** Lưới ảnh nằm trong 1 khung cố định (cột c1..c2, dòng r1..r2). */
function gridBox(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, imgs: Img[], c1: number, c2: number, r1: number, r2: number) {
  if (!imgs.length) return;
  let x0 = 0;
  for (let c = 1; c < c1; c++) x0 += colPx(ws, c);
  let bw = 0;
  for (let c = c1; c <= c2; c++) bw += colPx(ws, c);
  const bh = rowsHeightPx(ws, r1, r2);
  const cols = Math.ceil(Math.sqrt(imgs.length));
  const rows = Math.ceil(imgs.length / cols);
  const cw = bw / cols;
  const ch = bh / rows;
  imgs.forEach((im, i) => {
    const s = fit(im, cw - 8, ch - 8);
    const gx = i % cols;
    const gy = Math.floor(i / cols);
    // tìm dòng chứa điểm y
    let y = gy * ch + (ch - s.h) / 2;
    let r = r1;
    while (r < r2 && y >= ((ws.getRow(r).height || 15) * 96) / 72) {
      y -= ((ws.getRow(r).height || 15) * 96) / 72;
      r++;
    }
    placeAbs(ws, wb, im, x0 + gx * cw + (cw - s.w) / 2, r, y, s.w, s.h);
  });
}

/** Men: PRESENTATION (gập gói), DEFECT PICTURE (ảnh lỗi), ảnh thùng dưới chữ ký – như mẫu HZSH6E201-T2. */
function fillMen(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, p: FinalPhotos) {
  // PRESENTATION: cột I–L, dòng 3 tiêu đề, dòng 4–10 ảnh
  if (p.packing.length) {
    boxHeader(ws, 'I3:L3', 'PRESENTATION');
    gridBox(ws, wb, p.packing, 9, 12, 4, 10);
  }
  // DEFECT PICTURE: ngang dòng Style Confirmation, cột I–L
  const sc = findRow(ws, 'Style Confirmation') || 22;
  const ii = findRow(ws, 'Inspection Items') || sc + 6;
  if (p.defects.length) {
    boxHeader(ws, `I${sc + 2}:L${sc + 2}`, 'DEFECT PICTURE');
    gridBox(ws, wb, p.defects, 9, 12, sc + 3, Math.max(sc + 8, ii + 2));
  }
  // Ảnh thùng: dưới dòng Date, cột A–F
  const qa = findRow(ws, 'QA Auditor:');
  if (qa && p.carton.length) {
    const start = qa + 4;
    let w = 0;
    for (let c = 1; c <= 6; c++) w += colPx(ws, c);
    gridRows(ws, wb, p.carton, start, 0, w, 2, 330);
  }
}

/** Mở file GQS, chèn ảnh theo nhóm hàng, trả về file Excel mới. */
export async function fillFinalReport(buf: ArrayBuffer, photos: FinalPhotos, category?: 'Men' | 'Ladies'): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const cat = category || readGqs(ws).category;
  if (cat === 'Men') fillMen(ws, wb, photos);
  else fillLadies(ws, wb, photos);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
