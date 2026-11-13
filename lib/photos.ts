import { BUCKET, supabase } from './supabase';
import type { Photo, PhotoKind, PhotoSet, Severity } from './types';
import { SINGLE_KINDS } from './config';
import type { Compressed } from './image';

export async function getOrCreateSet(jo: string, color: string): Promise<PhotoSet> {
  const { data } = await supabase.from('photo_sets').select('*').eq('jo_no', jo).eq('color_code', color).maybeSingle();
  if (data) return data as PhotoSet;
  const { data: created, error } = await supabase
    .from('photo_sets')
    .insert({ jo_no: jo, color_code: color, status: 'draft' })
    .select('*')
    .single();
  if (error) {
    // có thể máy khác vừa tạo
    const again = await supabase.from('photo_sets').select('*').eq('jo_no', jo).eq('color_code', color).single();
    if (again.data) return again.data as PhotoSet;
    throw error;
  }
  return created as PhotoSet;
}

function safe(s: string) {
  return s.replace(/[^A-Za-z0-9_-]/g, '_');
}

export async function uploadPhoto(opts: {
  img: Compressed;
  kind: PhotoKind;
  style: string;
  color: string;
  jo: string;
  setId: number | null;
  defect?: { name: string; severity: Severity; position: string; note: string };
}): Promise<Photo> {
  const { img, kind, style, color, jo, setId, defect } = opts;
  const folder = kind === 'front' ? `${safe(style)}/_front/${safe(color)}` : `${safe(style)}/${safe(jo)}/${safe(color)}`;
  const path = `${folder}/${kind}_${Date.now()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, img.blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new Error('Tải ảnh lên thất bại: ' + up.error.message);

  const { data, error } = await supabase
    .from('photos')
    .insert({
      set_id: kind === 'front' ? null : setId,
      cust_style: style,
      color_code: color,
      kind,
      path,
      size_bytes: img.blob.size,
      width: img.width,
      height: img.height,
      defect_name: defect?.name ?? null,
      severity: defect?.severity ?? null,
      position: defect?.position ?? null,
      note: defect?.note || null,
    })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error('Lưu ảnh thất bại: ' + error.message);
  }
  const photo = data as Photo;

  // Loại ảnh chỉ có 1 ảnh: xóa ảnh cũ sau khi ảnh mới đã lưu
  if (SINGLE_KINDS.includes(kind)) {
    let q = supabase.from('photos').select('*').eq('kind', kind).eq('color_code', color).neq('id', photo.id);
    q = kind === 'front' ? q.is('set_id', null).eq('cust_style', style) : q.eq('set_id', setId!);
    const { data: old } = await q;
    if (old && old.length) await deletePhotos(old as Photo[]);
  }
  await touchSet(setId);
  return photo;
}

export async function deletePhotos(photos: Photo[]) {
  if (!photos.length) return;
  const { error } = await supabase.from('photos').delete().in('id', photos.map((p) => p.id));
  if (error) throw new Error('Xóa ảnh thất bại: ' + error.message);
  for (let i = 0; i < photos.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 100).map((p) => p.path));
  }
}

async function touchSet(setId: number | null) {
  if (setId) await supabase.from('photo_sets').update({ updated_at: new Date().toISOString() }).eq('id', setId);
}

export async function signedUrls(paths: string[], expires = 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = Array.from(new Set(paths));
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, expires);
    data?.forEach((d) => {
      if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
    });
  }
  return out;
}

export async function downloadPhoto(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error('Không tải được ảnh ' + path);
  return data;
}

/** Lấy toàn bộ bản ghi của 1 bảng (vượt giới hạn 1000 dòng/lần của Supabase). */
export async function fetchAll<T>(table: string, columns = '*', build?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns).order('id').range(from, from + 999);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
