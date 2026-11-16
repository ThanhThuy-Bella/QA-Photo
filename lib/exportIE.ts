import ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { blobToDataUrl, downloadBlob } from './image';
import { downloadPhoto } from './photos';
import type { Photo } from './types';

export interface IEColor {
  color: string;
  label: string; // data URL
  labelW: number;
  labelH: number;
  fold: string;
  foldW: number;
  foldH: number;
}

export interface IESheet {
  name: string; // tên sheet
  lot: string; // in ở ô góc phải
  jo: string;
  colors: IEColor[];
}

export interface IEItem {
  jo: string;
  lot: string;
  color: string;
  setId: number;
}

const TITLE = '■ 수입상품 원산지표시 사진 (SAMPLE) ■\nrequired images of C/O marking on imported goods';
const HEAD = [
  '1. 원산지표시사진 \nCountry of Origin mark',
  '2. 부착위치 및 방법 확인가능 사진\nC/O indication method and postioin',
  '3. 소매포장사진\nretail packing',
];

/** Tải ảnh mác + gập gói của các bộ ảnh đã chọn, gom theo JO thành từng sheet. */
export async function loadIEData(items: IEItem[], style: string, onProgress?: (msg: string) => void): Promise<IESheet[]> {
  const setIds = items.map((i) => i.setId);
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .in('set_id', setIds)
    .in('kind', ['label', 'fold'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const photos = (data || []) as Photo[];
  // Gập gói dùng chung theo style × màu (bản mới); bản cũ còn lưu theo bộ ảnh.
  const { data: sh } = await supabase
    .from('photos')
    .select('*')
    .eq('kind', 'fold')
    .eq('cust_style', style)
    .in('color_code', Array.from(new Set(items.map((i) => i.color))))
    .order('created_at', { ascending: false });
  const sharedFold = (sh || []) as Photo[];
  const pick = (setId: number, kind: string) => photos.find((p) => p.set_id === setId && p.kind === kind);
  // Ưu tiên ảnh dùng chung (set_id null), sau đó ảnh của chính lot, cuối cùng ảnh gập gói của lot khác cùng màu
  const pickFold = (it: IEItem) =>
    sharedFold.find((p) => p.color_code === it.color && p.set_id === null) || pick(it.setId, 'fold') || sharedFold.find((p) => p.color_code === it.color);

  const byJo = new Map<string, { lot: string; items: IEItem[] }>();
  items.forEach((it) => {
    if (!byJo.has(it.jo)) byJo.set(it.jo, { lot: it.lot, items: [] });
    byJo.get(it.jo)!.items.push(it);
  });

  const usedNames = new Set<string>();
  const sheets: IESheet[] = [];
  const jos = Array.from(byJo.entries()).sort((a, b) => a[1].lot.localeCompare(b[1].lot) || a[0].localeCompare(b[0]));
  let done = 0;
  for (const [jo, g] of jos) {
    let name = g.lot;
    if (usedNames.has(name)) name = `${g.lot}_${jo.slice(0, -g.lot.length).slice(-5)}`;
    usedNames.add(name);
    const colors: IEColor[] = [];
    for (const it of g.items.sort((a, b) => a.color.localeCompare(b.color))) {
      const lp = pick(it.setId, 'label');
      const fp = pickFold(it);
      if (!lp || !fp) throw new Error(`JO ${jo} màu ${it.color} thiếu ảnh mác hoặc gập gói.`);
      onProgress?.(`Đang tải ảnh ${++done}/${items.length}…`);
      const [label, fold] = await Promise.all([blobToDataUrl(await downloadPhoto(lp.path)), blobToDataUrl(await downloadPhoto(fp.path))]);
      colors.push({
        color: it.color,
        label,
        labelW: lp.width || 1600,
        labelH: lp.height || 1200,
        fold,
        foldW: fp.width || 1200,
        foldH: fp.height || 1600,
      });
    }
    sheets.push({ name, lot: g.lot, jo, colors });
  }
  return sheets;
}

const COL_PX = [399, 399, 356];
const PHOTO_ROW_PT = 275;
const PHOTO_ROW_PX = Math.round((PHOTO_ROW_PT * 96) / 72);
const EMU = 9525;
const MEDIUM = { style: 'medium' as const };
const BOX = { top: MEDIUM, left: MEDIUM, bottom: MEDIUM, right: MEDIUM };

/** File Excel giống template IE (mỗi lot 1 sheet). Ảnh đặt nổi để chỉnh tay. */
export async function buildIEWorkbook(style: string, sheets: IESheet[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  for (const sh of sheets) {
    const last = 3 + sh.colors.length * 2;
    const ws = wb.addWorksheet(sh.name, {
      pageSetup: {
        paperSize: 9,
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        printArea: `A1:C${last}`,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      },
    });
    ws.columns = [{ width: 56.29 }, { width: 56.29 }, { width: 50.14 }];

    ws.mergeCells('A1:C1');
    const a1 = ws.getCell('A1');
    a1.value = TITLE;
    a1.font = { name: 'SimSun', size: 20 };
    a1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(1).height = 55;

    const r2 = ['STYLE NO.', style, sh.lot];
    r2.forEach((v, i) => {
      const c = ws.getRow(2).getCell(i + 1);
      c.value = v;
      c.font = { name: 'SimSun', size: 20 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = BOX;
    });
    ws.getRow(2).height = 30;
    ws.getRow(3).height = 26.25;

    sh.colors.forEach((col, k) => {
      const hr = 4 + k * 2;
      const pr = hr + 1;
      HEAD.forEach((t, i) => {
        const c = ws.getRow(hr).getCell(i + 1);
        c.value = t;
        c.font = { name: 'SimSun', size: 11, bold: true };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        c.border = BOX;
        const p = ws.getRow(pr).getCell(i + 1);
        p.border = BOX;
        p.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      ws.getRow(hr).height = 36;
      ws.getRow(pr).height = PHOTO_ROW_PT;

      const labelId = wb.addImage({ base64: col.label, extension: 'jpeg' });
      const foldId = wb.addImage({ base64: col.fold, extension: 'jpeg' });
      const place = (id: number, c: number, iw: number, ih: number) => {
        const s = Math.min((COL_PX[c] - 24) / iw, (PHOTO_ROW_PX - 24) / ih);
        const w = Math.round(iw * s);
        const h = Math.round(ih * s);
        ws.addImage(id, {
          tl: {
            nativeCol: c,
            nativeColOff: Math.round(((COL_PX[c] - w) / 2) * EMU),
            nativeRow: pr - 1,
            nativeRowOff: Math.round(((PHOTO_ROW_PX - h) / 2) * EMU),
          } as unknown as ExcelJS.Anchor,
          ext: { width: w, height: h },
          editAs: 'oneCell',
        });
      };
      place(labelId, 0, col.labelW, col.labelH);
      place(labelId, 1, col.labelW, col.labelH);
      place(foldId, 2, col.foldW, col.foldH);
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Không đọc được ảnh'));
    i.src = src;
  });
}

const KR = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const MONO = '"Nanum Gothic Coding", "DejaVu Sans Mono", Consolas, monospace';

/**
 * Vẽ 1 trang IE trực tiếp lên canvas (không dùng html2canvas) để chữ luôn nằm đúng giữa ô.
 * Kích thước chuẩn 794 × 1123 px (A4 @96dpi), vẽ ở độ phân giải ×2.
 */
async function drawIEPage(style: string, sh: IESheet): Promise<HTMLCanvasElement> {
  const W = 794;
  const L = 26;
  const TW = W - L * 2; // 742
  const COLS = [254, 255, TW - 509];
  const HEAD_H = 44;
  const ROW_H = 232;
  const top = 56;
  const tableY = top + 76;
  const blockY = tableY + 30 + 22;
  const H = Math.max(1123, blockY + sh.colors.length * (HEAD_H + ROW_H) + 40);
  const S = 2;
  const c = document.createElement('canvas');
  c.width = W * S;
  c.height = H * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text = (t: string, x: number, y: number, font: string, maxW?: number) => {
    ctx.font = font;
    ctx.fillText(t, x, y, maxW);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const colX = (i: number) => L + COLS.slice(0, i).reduce((a, b) => a + b, 0);

  // Tiêu đề
  text('■ 수입상품 원산지표시 사진 (SAMPLE) ■', W / 2, top + 15, `19px ${KR}`);
  text('required images of C/O marking on imported goods', W / 2, top + 44, `15px ${MONO}`);

  // Dòng STYLE NO. | style | lot
  ctx.lineWidth = 2;
  ctx.strokeRect(L, tableY, TW, 30);
  line(colX(1), tableY, colX(1), tableY + 30, 1);
  line(colX(2), tableY, colX(2), tableY + 30, 1);
  [ 'STYLE NO.', style, sh.lot ].forEach((t, i) => text(t, colX(i) + COLS[i] / 2, tableY + 15, `15px ${MONO}`, COLS[i] - 8));

  // Các khối màu
  const heads = HEAD.map((h) => h.split('\n').map((x) => x.trim()));
  let y = blockY;
  for (let k = 0; k < sh.colors.length; k++) {
    const col = sh.colors[k];
    ctx.fillStyle = '#FFFF00';
    ctx.fillRect(L, y, TW, HEAD_H);
    ctx.fillStyle = '#000000';
    heads.forEach((h, i) => {
      text(h[0], colX(i) + COLS[i] / 2, y + HEAD_H / 2 - 8, `bold 10px ${KR}`, COLS[i] - 6);
      text(h[1], colX(i) + COLS[i] / 2, y + HEAD_H / 2 + 8, `bold 10px ${KR}`, COLS[i] - 6);
    });
    line(L, y + HEAD_H, L + TW, y + HEAD_H, 1);
    if (k > 0) line(L, y, L + TW, y, 2);
    const imgs = await Promise.all([loadImage(col.label), loadImage(col.fold)]);
    const draw = (im: HTMLImageElement, i: number, maxW: number) => {
      const s2 = Math.min(maxW / im.naturalWidth, 214 / im.naturalHeight);
      const w = im.naturalWidth * s2;
      const h = im.naturalHeight * s2;
      ctx.drawImage(im, colX(i) + (COLS[i] - w) / 2, y + HEAD_H + (ROW_H - h) / 2, w, h);
    };
    draw(imgs[0], 0, 236);
    draw(imgs[0], 1, 236);
    draw(imgs[1], 2, 210);
    line(colX(1), y, colX(1), y + HEAD_H + ROW_H, 1);
    line(colX(2), y, colX(2), y + HEAD_H + ROW_H, 1);
    y += HEAD_H + ROW_H;
  }
  ctx.lineWidth = 2;
  ctx.strokeRect(L, blockY, TW, y - blockY);
  return c;
}

/** PDF: mỗi lot 1 trang A4, cùng bố cục với file Excel. */
export async function buildIEPdf(style: string, sheets: IESheet[], onProgress?: (msg: string) => void): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts) {
    await Promise.all([fonts.load(`19px ${KR}`), fonts.load(`bold 10px ${KR}`), fonts.load(`15px ${MONO}`)]).catch(() => undefined);
    await fonts.ready;
  }
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < sheets.length; i++) {
    onProgress?.(`Đang dựng trang PDF ${i + 1}/${sheets.length}…`);
    const canvas = await drawIEPage(style, sheets[i]);
    if (i > 0) pdf.addPage();
    const pageW = 210;
    const pageH = 297;
    const ratio = canvas.height / canvas.width;
    let w = pageW;
    let h = pageW * ratio;
    if (h > pageH) {
      h = pageH;
      w = pageH / ratio;
    }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, 0, w, h);
  }
  return pdf.output('blob');
}

export function ieFileBase(style: string, sheets: IESheet[]) {
  return `${style}_IE_${sheets.map((s) => s.name).join('-')}`;
}

/** Xuất IE cho 1 style: Excel hoặc PDF. */
export async function exportIE(style: string, items: IEItem[], mode: 'xlsx' | 'pdf', onProgress?: (msg: string) => void) {
  const sheets = await loadIEData(items, style, onProgress);
  const base = ieFileBase(style, sheets);
  if (mode === 'xlsx') {
    onProgress?.('Đang tạo file Excel…');
    downloadBlob(await buildIEWorkbook(style, sheets), `${base}.xlsx`);
  } else {
    downloadBlob(await buildIEPdf(style, sheets, onProgress), `${base}.pdf`);
  }
  await supabase.from('exports_log').insert({ kind: mode === 'xlsx' ? 'IE-XLSX' : 'IE-PDF', jo_list: Array.from(new Set(items.map((i) => i.jo))), file_name: base });
  return `${base}.${mode}`;
}
