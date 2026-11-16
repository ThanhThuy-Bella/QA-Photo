import ExcelJS from 'exceljs';

/** Ảnh đưa vào báo cáo: data URL (jpeg) + kích thước gốc. */
export interface Img {
  dataUrl: string;
  w: number;
  h: number;
  caption?: string; // chú thích in dưới ảnh (màu, lot, tên lỗi…)
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

function colsWidth(ws: ExcelJS.Worksheet, c1: number, c2: number) {
  let w = 0;
  for (let c = c1; c <= c2; c++) w += colPx(ws, c);
  return w;
}

const rowPx = (ws: ExcelJS.Worksheet, r: number) => ((ws.getRow(r).height || 15) * 96) / 72;

/** Đặt ảnh tại tọa độ px tuyệt đối (x tính từ cột A, y tính từ đầu dòng row). */
function placeAbs(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, img: Img, x: number, row: number, y: number, w: number, h: number) {
  let col = 1;
  let left = x;
  while (left >= colPx(ws, col)) {
    left -= colPx(ws, col);
    col++;
  }
  let r = row;
  let top = y;
  while (top >= rowPx(ws, r)) {
    top -= rowPx(ws, r);
    r++;
  }
  const id = wb.addImage({ base64: img.dataUrl, extension: 'jpeg' });
  ws.addImage(id, {
    tl: { nativeCol: col - 1, nativeColOff: Math.round(left * EMU), nativeRow: r - 1, nativeRowOff: Math.round(top * EMU) } as unknown as ExcelJS.Anchor,
    ext: { width: Math.round(w), height: Math.round(h) },
    editAs: 'oneCell',
  });
}

// ---------------- Ô ảnh đồng đều ----------------
const CAPTION_H = 26; // px, dải chú thích dưới ảnh
const GAP = 14; // px giữa các ô ảnh
const SCALE = 2; // vẽ ô ảnh ở độ phân giải gấp đôi cho nét khi in

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Không đọc được ảnh'));
    i.src = src;
  });
}

/**
 * Tạo 1 ô ảnh kích thước cố định tw × th (px): khung viền mảnh, nền trắng,
 * ảnh 'cover' (cắt vừa khung) hoặc 'contain' (giữ trọn ảnh), dải chú thích ở dưới.
 * Ngoài trình duyệt (không có canvas) thì trả lại ảnh gốc.
 */
async function makeTile(img: Img, tw: number, th: number, mode: 'cover' | 'contain'): Promise<Img> {
  if (typeof document === 'undefined') return { ...img, w: tw, h: th };
  const el = await loadImage(img.dataUrl);
  const c = document.createElement('canvas');
  c.width = Math.round(tw * SCALE);
  c.height = Math.round(th * SCALE);
  const ctx = c.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tw, th);
  const cap = img.caption ? CAPTION_H : 0;
  const pad = mode === 'contain' ? 6 : 0;
  const bw = tw - pad * 2;
  const bh = th - cap - pad * 2;
  const iw = el.naturalWidth;
  const ih = el.naturalHeight;
  if (mode === 'cover') {
    const s = Math.max(bw / iw, bh / ih);
    const sw = bw / s;
    const sh = bh / s;
    ctx.drawImage(el, (iw - sw) / 2, (ih - sh) / 2, sw, sh, pad, pad, bw, bh);
  } else {
    const s = Math.min(bw / iw, bh / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(el, pad + (bw - dw) / 2, pad + (bh - dh) / 2, dw, dh);
  }
  if (cap) {
    ctx.fillStyle = '#EEF0F3';
    ctx.fillRect(0, th - cap, tw, cap);
    ctx.fillStyle = '#16202A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 13;
    ctx.font = `bold ${size}px Arial, sans-serif`;
    while (size > 9 && ctx.measureText(img.caption!).width > tw - 10) {
      size--;
      ctx.font = `bold ${size}px Arial, sans-serif`;
    }
    ctx.fillText(img.caption!, tw / 2, th - cap / 2, tw - 8);
  }
  ctx.strokeStyle = '#B8C0CA';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, tw - 1, th - 1);
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), w: tw, h: th };
}

interface TileSpec {
  perRow: number;
  aspect: number; // chiều cao / chiều rộng phần ảnh
  mode: 'cover' | 'contain';
}

/** Kích thước ô ảnh theo bề rộng vùng và số ảnh mỗi hàng. */
function tileSize(totalW: number, spec: TileSpec, hasCaption: boolean) {
  const tw = Math.floor((totalW - GAP * (spec.perRow + 1)) / spec.perRow);
  const th = Math.round(tw * spec.aspect) + (hasCaption ? CAPTION_H : 0);
  return { tw, th };
}

/** Lưới ô ảnh đều nhau, mỗi hàng ảnh = 1 dòng Excel (chiều cao dòng = ô ảnh + khoảng cách). */
async function gridTiles(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, imgs: Img[], startRow: number, totalW: number, spec: TileSpec) {
  const { tw, th } = tileSize(totalW, spec, imgs.some((i) => i.caption));
  const rows = Math.ceil(imgs.length / spec.perRow);
  for (let r = 0; r < rows; r++) {
    ws.getRow(startRow + r).height = Math.min(409, ((th + GAP + 8) * 72) / 96);
    const part = imgs.slice(r * spec.perRow, r * spec.perRow + spec.perRow);
    for (let i = 0; i < part.length; i++) {
      const tile = await makeTile(part[i], tw, th, spec.mode);
      placeAbs(ws, wb, tile, GAP + i * (tw + GAP), startRow + r, GAP / 2, tw, th);
    }
  }
  return rows;
}

/** Dòng trống (cột A–G không có chữ) – dùng để nới chiều cao mà không làm lệch bảng GQS. */
function isBlankRow(ws: ExcelJS.Worksheet, r: number) {
  for (let c = 1; c <= 7; c++) if (text(ws.getCell(r, c).value).trim()) return false;
  return true;
}

/** Bảo đảm khung dòng r1..r2 cao ít nhất needPx: phần thiếu chia cho các dòng trống trong khung (không có thì dòng cuối). */
function ensureHeight(ws: ExcelJS.Worksheet, r1: number, r2: number, needPx: number) {
  let have = 0;
  for (let r = r1; r <= r2; r++) have += rowPx(ws, r);
  if (have >= needPx) return;
  const blanks: number[] = [];
  for (let r = r1; r <= r2; r++) if (isBlankRow(ws, r)) blanks.push(r);
  const targets = blanks.length ? blanks : [r2];
  const add = (needPx - have) / targets.length;
  targets.forEach((r) => {
    ws.getRow(r).height = Math.min(409, ((rowPx(ws, r) + add) * 72) / 96);
  });
}

/**
 * Lưới ô ảnh đều nhau trong khung bên phải (cột c1..c2, bắt đầu dòng r1, kết thúc dự kiến r2).
 * Ô ảnh giữ cỡ dễ nhìn (≥ minTile px); nếu khung không đủ cao thì nới các dòng trống trong khung.
 */
async function gridBox(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, imgs: Img[], c1: number, c2: number, r1: number, r2: number, aspect: number) {
  if (!imgs.length) return;
  const x0 = colsWidth(ws, 1, c1 - 1);
  const bw = colsWidth(ws, c1, c2);
  const n = imgs.length;
  const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cap = imgs.some((i) => i.caption) ? CAPTION_H : 0;
  let tw = Math.floor((bw - GAP * (cols + 1)) / cols);
  if (n === 1) tw = Math.min(tw, 300);
  const th = Math.round(tw * aspect) + cap;
  ensureHeight(ws, r1, r2, rows * th + (rows + 1) * GAP);
  const gridW = cols * tw + (cols - 1) * GAP;
  const left = x0 + (bw - gridW) / 2;
  for (let i = 0; i < n; i++) {
    const tile = await makeTile(imgs[i], tw, th, 'contain');
    placeAbs(ws, wb, tile, left + (i % cols) * (tw + GAP), r1, GAP + Math.floor(i / cols) * (th + GAP), tw, th);
  }
}

function header(ws: ExcelJS.Worksheet, row: number, label: string, style: Partial<ExcelJS.Style>, height: number) {
  const c = ws.getCell(row, 1);
  c.value = label;
  c.style = JSON.parse(JSON.stringify(style || {}));
  ws.getRow(row).height = height;
}

/** Ladies: chèn 3 khối Style Photo / Defective Photo / Accessory Photo như mẫu HSSH6BC30, ảnh đều nhau. */
async function fillLadies(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, p: FinalPhotos) {
  LADIES_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const styleCell = ws.getCell(findRow(ws, 'Judgment Information') || 12, 1);
  const headStyle = styleCell.style;
  const headH = ws.getRow(Number(styleCell.row)).height || 25.5;
  const totalW = colsWidth(ws, 1, 6);
  const SPEC = {
    style: { perRow: 6, aspect: 4 / 3, mode: 'cover' as const },
    defect: { perRow: 4, aspect: 3 / 4, mode: 'contain' as const },
    accessory: { perRow: 6, aspect: 1, mode: 'contain' as const },
  };

  // B1: chèn dòng từ dưới lên (chưa đặt ảnh, vì exceljs không dời ảnh khi chèn dòng).
  const blocks: { label: string; imgs: Img[]; spec: TileSpec }[] = [];
  const qa = findRow(ws, 'QA Auditor:');
  if (qa && p.accessory.length) {
    insertRows(ws, qa, 1 + Math.ceil(p.accessory.length / SPEC.accessory.perRow));
    header(ws, qa, 'Accessory  Photo', headStyle, headH);
    blocks.push({ label: 'Accessory  Photo', imgs: p.accessory, spec: SPEC.accessory });
  }
  const ii = findRow(ws, 'Inspection Items');
  if (ii && p.defects.length) {
    insertRows(ws, ii, 1 + Math.ceil(p.defects.length / SPEC.defect.perRow));
    header(ws, ii, 'Defective  Photo', headStyle, headH);
    blocks.push({ label: 'Defective  Photo', imgs: p.defects, spec: SPEC.defect });
  }
  const fac = findRow(ws, 'Factory');
  if (fac && p.front.length) {
    insertRows(ws, fac + 2, 1 + Math.ceil(p.front.length / SPEC.style.perRow));
    header(ws, fac + 2, 'Style Photo', headStyle, headH);
    blocks.push({ label: 'Style Photo', imgs: p.front, spec: SPEC.style });
  }
  // B2: khi số dòng đã cố định mới đặt ảnh.
  for (const bl of blocks) {
    const r = findRow(ws, bl.label);
    if (r) await gridTiles(ws, wb, bl.imgs, r + 1, totalW, bl.spec);
  }
}

function boxHeader(ws: ExcelJS.Worksheet, range: string, label: string) {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(':')[0]);
  c.value = label;
  c.font = { name: 'Arial', size: 10, bold: true };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  const thin = { style: 'thin' as const };
  c.border = { top: thin, left: thin, bottom: thin, right: thin };
}

/**
 * Men: PRESENTATION (gập gói) và DEFECT PICTURE (ảnh lỗi) luôn nằm trong khung bên phải như mẫu HZSH6E201-T2;
 * nhiều màu thì khung chia lưới 2–4 cột và tự nới chiều cao các dòng trống. CARTON PHOTO dưới chữ ký.
 */
async function fillMen(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, p: FinalPhotos) {
  const many = Math.max(p.packing.length, p.defects.length);
  const colW = many > 4 ? 18 : 14; // nới cột I–L (bên phải, không có dữ liệu GQS)
  for (let c = 9; c <= 12; c++) if ((ws.getColumn(c).width ?? 9) < colW) ws.getColumn(c).width = colW;
  const goRow = findRow(ws, 'GO No.') || 5;
  const sc = findRow(ws, 'Style Confirmation') || 22;
  if (p.packing.length) {
    boxHeader(ws, `I${goRow - 2}:L${goRow - 2}`, 'PRESENTATION');
    await gridBox(ws, wb, p.packing, 9, 12, goRow - 1, Math.max(goRow + 5, sc - 1), 4 / 3);
  }
  const sc2 = findRow(ws, 'Style Confirmation') || sc;
  const ii = findRow(ws, 'Inspection Items') || sc2 + 6;
  const qa = findRow(ws, 'QA Auditor:');
  if (p.defects.length) {
    boxHeader(ws, `I${sc2 + 2}:L${sc2 + 2}`, 'DEFECT PICTURE');
    await gridBox(ws, wb, p.defects, 9, 12, sc2 + 3, Math.max(sc2 + 8, ii + 2, qa ? qa - 1 : 0), 3 / 4);
  }
  const qa2 = findRow(ws, 'QA Auditor:');
  if (qa2 && p.carton.length) {
    const start = qa2 + 3;
    const wide = p.carton.length > 3;
    boxHeader(ws, `A${start}:${wide ? 'L' : 'F'}${start}`, 'CARTON PHOTO');
    await gridTiles(ws, wb, p.carton, start + 1, wide ? colsWidth(ws, 1, 12) : colsWidth(ws, 1, 6), {
      perRow: wide ? 6 : 3,
      aspect: 3 / 4,
      mode: 'contain',
    });
  }
}

/** Mở file GQS, chèn ảnh theo nhóm hàng (ô ảnh đều nhau, có chú thích), trả về file Excel mới. */
export async function fillFinalReport(buf: ArrayBuffer, photos: FinalPhotos, category?: 'Men' | 'Ladies'): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const cat = category || readGqs(ws).category;
  if (cat === 'Men') await fillMen(ws, wb, photos);
  else await fillLadies(ws, wb, photos);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
