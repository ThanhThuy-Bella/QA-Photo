import { BLUR_THRESHOLD, DARK_THRESHOLD, JPEG_QUALITY, MAX_EDGE } from './config';
import type { PhotoKind } from './types';

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
  blur: number;
  brightness: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HEIC_MSG =
  'Không đọc được ảnh này. Nếu là ảnh HEIC từ iPhone, hãy chụp trực tiếp trong app hoặc đổi cài đặt camera sang JPG (Cài đặt → Camera → Định dạng → Tương thích nhất).';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(HEIC_MSG));
    img.src = src;
  });
}

/** Đọc file ảnh (đúng chiều xoay EXIF) vào canvas, cạnh dài tối đa maxEdge. */
export async function fileToCanvas(file: File, maxEdge = 2400): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource;
  let w: number;
  let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    src = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    const img = await loadImg(url);
    URL.revokeObjectURL(url);
    src = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  }
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function rotateCanvas(src: HTMLCanvasElement, clockwise = true): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function cropCanvas(src: HTMLCanvasElement, r: Rect): HTMLCanvasElement {
  const x = Math.max(0, Math.round(r.x));
  const y = Math.max(0, Math.round(r.y));
  const w = Math.min(src.width - x, Math.round(r.w));
  const h = Math.min(src.height - y, Math.round(r.h));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

/** Nén canvas: cạnh dài MAX_EDGE, JPEG; đo độ nét (Laplacian) và độ sáng. */
export async function compressCanvas(src: HTMLCanvasElement): Promise<Compressed> {
  const s = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(src.width * s);
  canvas.height = Math.round(src.height * s);
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height);
  const { blur, brightness } = measure(canvas);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))), 'image/jpeg', JPEG_QUALITY),
  );
  return { blob, width: canvas.width, height: canvas.height, blur, brightness };
}

export async function compressImage(file: File): Promise<Compressed> {
  return compressCanvas(await fileToCanvas(file));
}

function small(canvas: HTMLCanvasElement, edge: number) {
  const s = Math.min(1, edge / Math.max(canvas.width, canvas.height));
  const tw = Math.max(3, Math.round(canvas.width * s));
  const th = Math.max(3, Math.round(canvas.height * s));
  const t = document.createElement('canvas');
  t.width = tw;
  t.height = th;
  const tc = t.getContext('2d', { willReadFrequently: true })!;
  tc.drawImage(canvas, 0, 0, tw, th);
  return { d: tc.getImageData(0, 0, tw, th).data, tw, th, s: tw / canvas.width };
}

function measure(canvas: HTMLCanvasElement) {
  const { d, tw, th } = small(canvas, 480);
  const g = new Float32Array(tw * th);
  let lum = 0;
  for (let i = 0; i < tw * th; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    lum += g[i];
  }
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < th - 1; y++) {
    for (let x = 1; x < tw - 1; x++) {
      const i = y * tw + x;
      const v = g[i - 1] + g[i + 1] + g[i - tw] + g[i + tw] - 4 * g[i];
      sum += v;
      sq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return { blur: sq / n - mean * mean, brightness: lum / (tw * th) };
}

/** Khung mặc định khi không tự tìm được vật thể: chừa 6% mỗi cạnh. */
export function defaultRect(c: HTMLCanvasElement): Rect {
  return { x: c.width * 0.06, y: c.height * 0.06, w: c.width * 0.88, h: c.height * 0.88 };
}

function expand(r: Rect, pct: number, W: number, H: number): Rect {
  const dx = r.w * pct;
  const dy = r.h * pct;
  const x = Math.max(0, r.x - dx);
  const y = Math.max(0, r.y - dy);
  return { x, y, w: Math.min(W - x, r.w + 2 * dx), h: Math.min(H - y, r.h + 2 * dy) };
}

/** Tìm vùng sáng, ít màu lớn nhất (mác, nhãn, thẻ bài trắng). */
function detectWhite(c: HTMLCanvasElement): Rect | null {
  const { d, tw, th, s } = small(c, 220);
  const mask = new Uint8Array(tw * th);
  for (let i = 0; i < tw * th; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx > 175 && (mx - mn) / (mx || 1) < 0.2) mask[i] = 1;
  }
  // Đóng lỗ chữ in trên mác/nhãn: giãn mask 2 lần (3×3) rồi mới gom vùng.
  for (let pass = 0; pass < 2; pass++) {
    const m2 = mask.slice();
    for (let y = 1; y < th - 1; y++) {
      for (let x = 1; x < tw - 1; x++) {
        const i = y * tw + x;
        if (!mask[i] && (mask[i - 1] + mask[i + 1] + mask[i - tw] + mask[i + tw] >= 2)) m2[i] = 1;
      }
    }
    mask.set(m2);
  }
  const seen = new Uint8Array(tw * th);
  let best: { n: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  const stack: number[] = [];
  for (let i = 0; i < tw * th; i++) {
    if (!mask[i] || seen[i]) continue;
    let n = 0;
    let x0 = tw;
    let y0 = th;
    let x1 = 0;
    let y1 = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % tw;
      const y = (k - x) / tw;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const nb = [x > 0 ? k - 1 : -1, x < tw - 1 ? k + 1 : -1, y > 0 ? k - tw : -1, y < th - 1 ? k + tw : -1];
      for (const q of nb) {
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (!best || n > best.n) best = { n, x0, y0, x1, y1 };
  }
  if (!best) return null;
  const frac = best.n / (tw * th);
  if (frac < 0.03 || frac > 0.85) return null;
  if (best.x1 - best.x0 < tw * 0.15 || best.y1 - best.y0 < th * 0.15) return null;
  return { x: best.x0 / s, y: best.y0 / s, w: (best.x1 - best.x0 + 1) / s, h: (best.y1 - best.y0 + 1) / s };
}

/** Tách vật thể khỏi nền (màu nền = trung vị viền ảnh): túi gập, áo, thùng. */
function detectObject(c: HTMLCanvasElement): Rect | null {
  const { d, tw, th, s } = small(c, 220);
  const border: number[][] = [];
  for (let x = 0; x < tw; x++) {
    for (const y of [0, 1, th - 2, th - 1]) border.push([d[(y * tw + x) * 4], d[(y * tw + x) * 4 + 1], d[(y * tw + x) * 4 + 2]]);
  }
  for (let y = 0; y < th; y++) {
    for (const x of [0, 1, tw - 2, tw - 1]) border.push([d[(y * tw + x) * 4], d[(y * tw + x) * 4 + 1], d[(y * tw + x) * 4 + 2]]);
  }
  const med = [0, 1, 2].map((k) => {
    const v = border.map((p) => p[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  });
  const colCount = new Array(tw).fill(0);
  const rowCount = new Array(th).fill(0);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = (y * tw + x) * 4;
      const dist = Math.abs(d[i] - med[0]) + Math.abs(d[i + 1] - med[1]) + Math.abs(d[i + 2] - med[2]);
      if (dist > 70) {
        colCount[x]++;
        rowCount[y]++;
      }
    }
  }
  const span = (arr: number[], len: number, other: number) => {
    const lim = other * 0.08;
    let a = 0;
    while (a < len && arr[a] < lim) a++;
    let b = len - 1;
    while (b > a && arr[b] < lim) b--;
    return [a, b];
  };
  const [x0, x1] = span(colCount, tw, th);
  const [y0, y1] = span(rowCount, th, tw);
  const area = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (tw * th);
  if (x1 <= x0 || y1 <= y0 || area < 0.08 || area > 0.97) return null;
  return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
}

/** Gợi ý khung cắt theo loại ảnh. */
export function autoRect(c: HTMLCanvasElement, kind: PhotoKind): Rect {
  let r: Rect | null = null;
  if (kind === 'label' || kind === 'carton_label' || kind === 'hangtag') {
    r = detectWhite(c);
    if (r) r = expand(r, kind === 'label' ? 0.12 : 0.06, c.width, c.height);
  } else if (kind === 'fold' || kind === 'front' || kind === 'carton_face') {
    r = detectObject(c);
    if (r) r = expand(r, 0.03, c.width, c.height);
  }
  return r || defaultRect(c);
}

/** Trả về câu cảnh báo nếu ảnh có vẻ mờ/tối, null nếu ổn. */
export function qualityWarning(c: Compressed): string | null {
  if (c.brightness < DARK_THRESHOLD) return 'Ảnh có vẻ bị tối.';
  if (c.blur < BLUR_THRESHOLD) return 'Ảnh có vẻ bị mờ, chữ trên mác có thể không đọc được.';
  return null;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
