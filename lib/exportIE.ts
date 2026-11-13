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
export async function loadIEData(items: IEItem[], onProgress?: (msg: string) => void): Promise<IESheet[]> {
  const setIds = items.map((i) => i.setId);
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .in('set_id', setIds)
    .in('kind', ['label', 'fold'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const photos = (data || []) as Photo[];
  const pick = (setId: number, kind: string) => photos.find((p) => p.set_id === setId && p.kind === kind);

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
      const fp = pick(it.setId, 'fold');
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
    ws.getRow(2).height = 26.25;
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
      ws.getRow(hr).height = 30;
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

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function pageHtml(style: string, sh: IESheet) {
  const cell = 'border-right:1px solid #000;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;';
  const head = (t: string) => {
    const [a, b] = t.split('\n');
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;font-weight:700;line-height:1.3;text-align:center">${esc(a)}<span>${esc(b)}</span></div>`;
  };
  const rows = sh.colors
    .map(
      (c, i) => `
    <div style="${i ? 'border-top:2px solid #000;' : ''}">
      <div style="display:grid;grid-template-columns:254px 255px 1fr;background:#FFFF00;border-bottom:1px solid #000;height:40px">
        <div style="border-right:1px solid #000;display:flex;align-items:center;justify-content:center">${head(HEAD[0])}</div>
        <div style="border-right:1px solid #000;display:flex;align-items:center;justify-content:center">${head(HEAD[1])}</div>
        <div style="display:flex;align-items:center;justify-content:center">${head(HEAD[2])}</div>
      </div>
      <div style="display:grid;grid-template-columns:254px 255px 1fr;height:232px">
        <div style="${cell}"><img src="${c.label}" style="max-width:236px;max-height:214px;object-fit:contain"></div>
        <div style="${cell}"><img src="${c.label}" style="max-width:236px;max-height:214px;object-fit:contain"></div>
        <div style="${cell}border-right:0"><img src="${c.fold}" style="max-width:210px;max-height:214px;object-fit:contain"></div>
      </div>
    </div>`,
    )
    .join('');
  return `
  <div style="width:794px;min-height:1123px;box-sizing:border-box;background:#fff;padding:56px 26px 40px;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#000">
    <div style="text-align:center;font-size:19px">■ 수입상품 원산지표시 사진 <span style="font-family:'Nanum Gothic Coding',monospace;font-size:15px">(SAMPLE)</span> ■</div>
    <div style="text-align:center;font-family:'Nanum Gothic Coding',monospace;font-size:15px;margin-bottom:22px">required images of C/O marking on imported goods</div>
    <div style="display:grid;grid-template-columns:254px 255px 1fr;border:2px solid #000;font-family:'Nanum Gothic Coding',monospace;font-size:15px;margin-bottom:22px">
      <div style="text-align:center;padding:3px 0;border-right:1px solid #000">STYLE NO.</div>
      <div style="text-align:center;padding:3px 0;border-right:1px solid #000">${esc(style)}</div>
      <div style="text-align:center;padding:3px 0">${esc(sh.lot)}</div>
    </div>
    <div style="border:2px solid #000">${rows}</div>
  </div>`;
}

async function waitImages(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => ((img.onload = () => r()), (img.onerror = () => r()))))),
  );
}

/** PDF: mỗi lot 1 trang A4, cùng bố cục với file Excel. */
export async function buildIEPdf(style: string, sheets: IESheet[], onProgress?: (msg: string) => void): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1';
  document.body.appendChild(host);
  try {
    for (let i = 0; i < sheets.length; i++) {
      onProgress?.(`Đang dựng trang PDF ${i + 1}/${sheets.length}…`);
      host.innerHTML = pageHtml(style, sheets[i]);
      await waitImages(host);
      if ((document as Document & { fonts?: FontFaceSet }).fonts) await document.fonts.ready;
      const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#ffffff', logging: false });
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
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (pageW - w) / 2, 0, w, h);
    }
  } finally {
    host.remove();
  }
  return pdf.output('blob');
}

export function ieFileBase(style: string, sheets: IESheet[]) {
  return `${style}_IE_${sheets.map((s) => s.name).join('-')}`;
}

/** Xuất IE cho 1 style: Excel hoặc PDF. */
export async function exportIE(style: string, items: IEItem[], mode: 'xlsx' | 'pdf', onProgress?: (msg: string) => void) {
  const sheets = await loadIEData(items, onProgress);
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
