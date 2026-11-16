'use client';
import { useState } from 'react';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { downloadPhoto } from '@/lib/photos';
import { blobToDataUrl, downloadBlob } from '@/lib/image';
import { normalizeJo } from '@/lib/recap';
import { fillFinalReport, readGqsFile, type FinalPhotos, type GqsInfo, type Img } from '@/lib/finalReport';
import { STATUS_INFO } from '@/lib/config';
import type { JoColor, Photo, PhotoSet } from '@/lib/types';
import { AdminNav, ErrorBox, Spinner, StatusChip, btn } from '@/components/ui';

interface Pair {
  row: JoColor;
  set?: PhotoSet;
  photos: Photo[];
}

interface Job {
  file: File;
  buf: ArrayBuffer;
  info: GqsInfo;
  category: 'Men' | 'Ladies';
  pairs: Pair[];
  fronts: Photo[];
  missingJo: string[];
  busy?: boolean;
  done?: string;
  err?: string;
}

const has = (p: Pair, k: string, shared: Photo[] = []) => p.photos.some((x) => x.kind === k) || shared.some((x) => x.kind === k && x.color_code === p.row.color_code);

async function loadJob(file: File): Promise<Job> {
  const buf = await file.arrayBuffer();
  const info = await readGqsFile(buf);
  if (!info.jos.length) throw new Error(`${file.name}: không đọc được JO No. – có phải file Final xuất từ GQS?`);
  const jos = info.jos.map((j) => normalizeJo(j).jo);
  const { data: rowsData, error } = await supabase.from('jo_colors').select('*').in('jo_no', jos);
  if (error) throw new Error(error.message);
  let rows = (rowsData || []) as JoColor[];
  if (info.colors.length) rows = rows.filter((r) => info.colors.includes(r.color_code));
  const { data: setsData } = await supabase.from('photo_sets').select('*').in('jo_no', jos);
  const sets = (setsData || []) as PhotoSet[];
  const setIds = sets.map((s) => s.id);
  const photos: Photo[] = [];
  if (setIds.length) {
    const { data } = await supabase.from('photos').select('*').in('set_id', setIds).order('created_at');
    photos.push(...((data || []) as Photo[]));
  }
  const style = rows[0]?.cust_style;
  let fronts: Photo[] = [];
  if (style) {
    const { data } = await supabase.from('photos').select('*').is('set_id', null).eq('cust_style', style).order('created_at');
    fronts = (data || []) as Photo[];
  }
  const colorOrder = (c: string) => {
    const i = info.colors.indexOf(c);
    return i < 0 ? 999 : i;
  };
  const pairs: Pair[] = rows
    .map((row) => {
      const set = sets.find((s) => s.jo_no === row.jo_no && s.color_code === row.color_code);
      return { row, set, photos: set ? photos.filter((p) => p.set_id === set.id) : [] };
    })
    .sort((a, b) => colorOrder(a.row.color_code) - colorOrder(b.row.color_code) || a.row.lot.localeCompare(b.row.lot));
  const found = new Set(rows.map((r) => r.jo_no));
  return {
    file,
    buf,
    info,
    category: rows.some((r) => r.category === 'Men') ? 'Men' : rows.length ? 'Ladies' : info.category,
    pairs,
    fronts,
    missingJo: jos.filter((j) => !found.has(j)),
  };
}

async function toImg(p: Photo, caption?: string): Promise<Img> {
  return { dataUrl: await blobToDataUrl(await downloadPhoto(p.path)), w: p.width || 1200, h: p.height || 1600, caption };
}

async function buildPhotos(job: Job): Promise<FinalPhotos> {
  const colors = Array.from(new Set(job.pairs.map((p) => p.row.color_code)));
  const last = (ps: Photo[], k: string) => ps.filter((x) => x.kind === k).slice(-1)[0];
  const sharedOf = (c: string, k: string) => last(job.fronts.filter((x) => x.color_code === c), k);
  const out: FinalPhotos = { front: [], defects: [], accessory: [], packing: [], carton: [] };
  for (const c of colors) {
    const ofColor = job.pairs.filter((p) => p.row.color_code === c);
    const f = sharedOf(c, 'front');
    if (f) out.front.push(await toImg(f, c));
    if (job.category === 'Men') {
      const fold = sharedOf(c, 'fold') || ofColor.map((p) => last(p.photos, 'fold')).find(Boolean);
      if (fold) out.packing.push(await toImg(fold, c));
    }
    // Accessory: mác sườn từng lot (gộp lot dùng chung ảnh) + thẻ bài dùng chung
    const byPath = new Map<string, { photo: Photo; lots: string[] }>();
    for (const p of ofColor) {
      const lb = last(p.photos, 'label');
      if (!lb) continue;
      const e = byPath.get(lb.path);
      if (e) e.lots.push(p.row.lot);
      else byPath.set(lb.path, { photo: lb, lots: [p.row.lot] });
    }
    for (const e of byPath.values()) out.accessory.push(await toImg(e.photo, `${c} · Side label · ${e.lots.join(', ')}`));
    const tag = sharedOf(c, 'hangtag') || ofColor.map((p) => last(p.photos, 'hangtag')).find(Boolean);
    if (tag) out.accessory.push(await toImg(tag, `${c} · Hangtag`));
    for (const p of ofColor)
      for (const d of p.photos.filter((x) => x.kind === 'defect'))
        out.defects.push(await toImg(d, `${d.defect_name} (${d.severity}) – ${d.position} · ${p.row.lot} ${c}`));
    if (job.category === 'Men') {
      const box = sharedOf(c, 'carton') || ofColor.map((p) => last(p.photos, 'carton_face')).find(Boolean);
      if (box) out.carton.push(await toImg(box, c));
    }
  }
  return out;
}

export default function FinalPage() {
  const auth = useRequire('admin');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setErr('');
    setReading(true);
    const out: Job[] = [];
    for (const f of files) {
      try {
        out.push(await loadJob(f));
      } catch (er) {
        setErr((er as Error).message);
      }
    }
    setJobs((j) => [...out, ...j]);
    setReading(false);
  };

  const update = (i: number, patch: Partial<Job>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));

  const run = async (i: number) => {
    const job = jobs[i];
    update(i, { busy: true, err: '', done: '' });
    try {
      const photos = await buildPhotos(job);
      const out = await fillFinalReport(job.buf, photos, job.category);
      const name = job.file.name.replace(/\.xlsx$/i, '') + '_anh.xlsx';
      downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
      await supabase.from('exports_log').insert({ kind: 'FINAL-XLSX', jo_list: job.info.jos, file_name: name });
      update(i, { busy: false, done: `Đã tải ${name}` });
    } catch (e) {
      update(i, { busy: false, err: (e as Error).message });
    }
  };

  if (!auth.ready) return <Spinner />;

  return (
    <main className="min-h-screen">
      <AdminNav active="final" />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-5 md:px-6">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h1 className="text-lg font-bold">Final report – chèn ảnh vào file GQS</h1>
          <p className="max-w-[75ch] text-sm text-muted">
            Xuất file Final từ GQS như bình thường rồi chọn file ở đây (chọn được nhiều file). App đọc JO No và Colour trong file, lấy ảnh của từng JO × màu và
            chèn đúng form: <b>Ladies</b> thêm khối Style Photo, Defective Photo, Accessory Photo; <b>Men</b> chèn PRESENTATION (gập gói), DEFECT PICTURE và ảnh
            thùng. File trả về là Excel – mở bằng Excel và chọn <i>Save as PDF</i> nếu cần PDF.
          </p>
          <label className={`${btn.primary} flex w-fit cursor-pointer items-center`}>
            {reading ? 'Đang đọc file…' : 'Chọn file Final GQS (.xlsx)'}
            <input type="file" accept=".xlsx" multiple className="hidden" onChange={onFiles} disabled={reading} />
          </label>
          {err && <ErrorBox text={err} />}
        </section>

        {jobs.map((job, i) => {
          const notApproved = job.pairs.filter((p) => p.set?.status !== 'approved');
          const frontColors = new Set(job.fronts.filter((f) => f.kind === 'front').map((f) => f.color_code));
          return (
            <section key={`${job.file.name}-${i}`} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{job.file.name}</h2>
                  <p className="text-sm text-muted">
                    {job.pairs[0]?.row.cust_style || job.info.gqsStyle} · {job.category} · {job.info.jos.length} JO · màu {job.info.colors.join(', ')}
                  </p>
                </div>
                <button disabled={job.busy || !job.pairs.length} onClick={() => run(i)} className="h-11 rounded-xl bg-[#1D6F42] px-4 text-sm font-semibold text-white disabled:opacity-40">
                  {job.busy ? 'Đang chèn ảnh…' : 'Chèn ảnh & tải Excel'}
                </button>
              </div>
              {job.missingJo.length > 0 && <ErrorBox text={`Không tìm thấy trong recap: ${job.missingJo.join(', ')} – kiểm tra đã nhập recap mới chưa.`} />}
              {notApproved.length > 0 && (
                <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF7E8] p-3 text-sm text-[#6B4A0B]">
                  {notApproved.length} JO × màu chưa được duyệt – ảnh hiện có vẫn được chèn: {notApproved.map((p) => `${p.row.lot}/${p.row.color_code}`).join(', ')}
                </div>
              )}
              {job.err && <ErrorBox text={job.err} />}
              {job.done && <div className="rounded-xl border border-ok/30 bg-ok-soft p-3 text-sm text-ok">{job.done}</div>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead className="bg-[#F7F8FA] text-left text-muted">
                    <tr>
                      {['Lot', 'JO', 'Màu', 'Trạng thái', 'Thân trước', 'Mác', 'Thẻ bài', 'Lỗi', ...(job.category === 'Men' ? ['Gập gói', 'Thùng'] : [])].map((h) => (
                        <th key={h} className="px-2 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {job.pairs.map((p) => {
                      const mark = (ok: boolean) => <span className={ok ? 'text-ok' : 'text-bad'}>{ok ? '✓' : 'thiếu'}</span>;
                      return (
                        <tr key={`${p.row.jo_no}|${p.row.color_code}`} className="border-t border-[#EEF0F3]">
                          <td className="px-2 py-1.5">{p.row.lot}</td>
                          <td className="px-2 py-1.5">{p.row.jo_no}</td>
                          <td className="px-2 py-1.5">{p.row.color_code}</td>
                          <td className="px-2 py-1.5">{p.set ? <StatusChip status={p.set.status} /> : STATUS_INFO.draft.label}</td>
                          <td className="px-2 py-1.5">{mark(frontColors.has(p.row.color_code))}</td>
                          <td className="px-2 py-1.5">{mark(has(p, 'label'))}</td>
                          <td className="px-2 py-1.5">{mark(has(p, 'hangtag', job.fronts))}</td>
                          <td className="px-2 py-1.5">{p.photos.filter((x) => x.kind === 'defect').length}</td>
                          {job.category === 'Men' && <td className="px-2 py-1.5">{mark(has(p, 'fold', job.fronts))}</td>}
                          {job.category === 'Men' && <td className="px-2 py-1.5">{mark(has(p, 'carton', job.fronts) || has(p, 'carton_face'))}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
