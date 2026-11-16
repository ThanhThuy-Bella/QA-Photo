-- Cập nhật v1.5 – chạy 1 lần trong Supabase > SQL Editor (chạy lại nhiều lần cũng không sao).

-- 1) Thêm loại ảnh 'carton' (1 ảnh mặt thùng có tem, dùng chung theo màu)
alter table public.photos drop constraint if exists photos_kind_check;
alter table public.photos add constraint photos_kind_check
  check (kind in ('label', 'fold', 'hangtag', 'front', 'defect', 'carton', 'carton_face', 'carton_label'));
create index if not exists photos_path_idx on public.photos (path);

-- 2) Gập gói + thẻ bài + mặt thùng: chuyển sang dùng chung theo style × màu
update public.photos set set_id = null where kind in ('fold', 'hangtag') and set_id is not null;
update public.photos set kind = 'carton', set_id = null where kind = 'carton_face' and set_id is not null;

-- 3) Vị trí lỗi sang tiếng Anh (gồm cả ảnh lỗi đã lưu) – giống update_v1.3.sql
with m(vi, en) as (values
  ('Cổ', 'Collar'), ('Nẹp áo', 'Placket'), ('Măng séc', 'Cuff'), ('Sườn', 'Side seam'),
  ('Gấu', 'Hem'), ('Túi', 'Pocket'), ('Vai', 'Shoulder'), ('Tay', 'Sleeve'),
  ('Thân sau', 'Back body'), ('Đô', 'Yoke')
)
update public.photos p set position = m.en from m where p.position = m.vi;

with m(vi, en) as (values
  ('Cổ', 'Collar'), ('Nẹp áo', 'Placket'), ('Măng séc', 'Cuff'), ('Sườn', 'Side seam'),
  ('Gấu', 'Hem'), ('Túi', 'Pocket'), ('Vai', 'Shoulder'), ('Tay', 'Sleeve'),
  ('Thân sau', 'Back body'), ('Đô', 'Yoke')
)
update public.defect_positions d set name = m.en from m where d.name = m.vi;

insert into public.defect_positions (name, sort) values ('Front body', 11), ('Armhole', 12)
on conflict (name) do nothing;
