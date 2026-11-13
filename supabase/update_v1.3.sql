-- Cập nhật v1.3: đổi vị trí lỗi sang tiếng Anh (khớp cột Part Name của GQS).
-- Chạy 1 lần trong Supabase > SQL Editor. Ảnh lỗi đã lưu cũng được đổi theo.
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
