-- QA Photo App – THV (Hazzys IE report)
-- Chạy toàn bộ file này trong Supabase > SQL Editor (1 lần).

-- ============ PROFILES & ROLES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'qa' check (role in ('admin', 'qa'))
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when lower(new.email) = 'thuytt@esquel.com' then 'admin' else 'qa' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============ RECAP DATA (JO × màu) ============
create table if not exists public.jo_colors (
  id bigserial primary key,
  go_no text,
  cust_style text not null,
  jo_no text not null,          -- JO đã chuẩn hóa, vd 26M05665KR02
  lot text not null,            -- KR02
  color_code text not null,
  order_qty integer,
  sew_start date,
  bpo_date date,
  category text not null default 'Ladies' check (category in ('Men', 'Ladies')),
  in_recap boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (jo_no, color_code)
);

-- ============ BỘ ẢNH (JO × màu) ============
create table if not exists public.photo_sets (
  id bigserial primary key,
  jo_no text not null,
  color_code text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'archived')),
  reject_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz not null default now(),
  unique (jo_no, color_code)
);

create or replace function public.can_edit_set(p_set_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or p_set_id is null or exists (
    select 1 from public.photo_sets s where s.id = p_set_id and s.status in ('draft', 'rejected')
  );
$$;

-- ============ ẢNH ============
create table if not exists public.photos (
  id bigserial primary key,
  set_id bigint references public.photo_sets on delete cascade,  -- NULL = ảnh thân trước dùng chung style × màu
  cust_style text not null,
  color_code text not null,
  kind text not null check (kind in ('label', 'fold', 'hangtag', 'front', 'defect', 'carton_face', 'carton_label')),
  path text not null,
  size_bytes integer not null default 0,
  width integer,
  height integer,
  defect_name text,
  severity text check (severity in ('Critical', 'Major', 'Minor')),
  position text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists photos_set_idx on public.photos (set_id);
create index if not exists photos_front_idx on public.photos (cust_style, color_code) where set_id is null;

-- ============ BẢNG LỖI ============
create table if not exists public.defect_types (
  id bigserial primary key,
  name text not null unique,
  allow_critical boolean not null default false,
  allow_major boolean not null default true,
  allow_minor boolean not null default true,
  sort integer not null default 0,
  active boolean not null default true
);

insert into public.defect_types (name, allow_critical, allow_major, allow_minor, sort) values
  ('Dirt mark', false, true, true, 1),
  ('Foreign yarn', false, true, true, 2),
  ('Frayed yarn', false, true, true, 3),
  ('Fullness', false, true, true, 4),
  ('High/low placket', false, true, true, 5),
  ('Hiking', false, true, true, 6),
  ('Over stitching', false, true, true, 7),
  ('Pleat', false, true, true, 8),
  ('Poor shape', false, true, true, 9),
  ('Poor stitching', false, true, true, 10),
  ('Run off stitch', false, true, true, 11),
  ('Skip stitch', false, true, false, 12),
  ('Slub', false, true, true, 13),
  ('Stain', false, true, true, 14),
  ('Thread end / join stitch', true, true, false, 15)
on conflict (name) do nothing;

create table if not exists public.defect_positions (
  id bigserial primary key,
  name text not null unique,
  sort integer not null default 0,
  active boolean not null default true
);

insert into public.defect_positions (name, sort) values
  ('Collar', 1), ('Placket', 2), ('Cuff', 3), ('Side seam', 4), ('Hem', 5),
  ('Pocket', 6), ('Shoulder', 7), ('Sleeve', 8), ('Back body', 9), ('Yoke', 10),
  ('Front body', 11), ('Armhole', 12)
on conflict (name) do nothing;

-- ============ NHẬT KÝ ============
create table if not exists public.recap_imports (
  id bigserial primary key,
  file_name text,
  rows_total integer,
  added integer,
  updated integer,
  missing integer,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.exports_log (
  id bigserial primary key,
  kind text not null default 'IE',
  jo_list text[],
  file_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.jo_colors enable row level security;
alter table public.photo_sets enable row level security;
alter table public.photos enable row level security;
alter table public.defect_types enable row level security;
alter table public.defect_positions enable row level security;
alter table public.recap_imports enable row level security;
alter table public.exports_log enable row level security;

drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists p_jo_read on public.jo_colors;
create policy p_jo_read on public.jo_colors for select to authenticated using (true);
drop policy if exists p_jo_admin on public.jo_colors;
create policy p_jo_admin on public.jo_colors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_sets_read on public.photo_sets;
create policy p_sets_read on public.photo_sets for select to authenticated using (true);
drop policy if exists p_sets_insert on public.photo_sets;
create policy p_sets_insert on public.photo_sets for insert to authenticated
  with check (public.is_admin() or status = 'draft');
drop policy if exists p_sets_update on public.photo_sets;
create policy p_sets_update on public.photo_sets for update to authenticated
  using (public.is_admin() or status in ('draft', 'rejected'))
  with check (public.is_admin() or status in ('draft', 'rejected', 'submitted'));
drop policy if exists p_sets_delete on public.photo_sets;
create policy p_sets_delete on public.photo_sets for delete to authenticated using (public.is_admin());

drop policy if exists p_photos_read on public.photos;
create policy p_photos_read on public.photos for select to authenticated using (true);
drop policy if exists p_photos_insert on public.photos;
create policy p_photos_insert on public.photos for insert to authenticated
  with check (public.can_edit_set(set_id));
drop policy if exists p_photos_delete on public.photos;
create policy p_photos_delete on public.photos for delete to authenticated
  using (public.can_edit_set(set_id));

drop policy if exists p_dt_read on public.defect_types;
create policy p_dt_read on public.defect_types for select to authenticated using (true);
drop policy if exists p_dt_admin on public.defect_types;
create policy p_dt_admin on public.defect_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_dp_read on public.defect_positions;
create policy p_dp_read on public.defect_positions for select to authenticated using (true);
drop policy if exists p_dp_admin on public.defect_positions;
create policy p_dp_admin on public.defect_positions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_ri on public.recap_imports;
create policy p_ri on public.recap_imports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists p_el on public.exports_log;
create policy p_el on public.exports_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ STORAGE (bucket ảnh, private) ============
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists p_st_read on storage.objects;
create policy p_st_read on storage.objects for select to authenticated using (bucket_id = 'photos');
drop policy if exists p_st_insert on storage.objects;
create policy p_st_insert on storage.objects for insert to authenticated with check (bucket_id = 'photos');
drop policy if exists p_st_delete on storage.objects;
create policy p_st_delete on storage.objects for delete to authenticated using (bucket_id = 'photos');

-- ============ BACKFILL (nếu đã tạo user trước khi chạy file này) ============
insert into public.profiles (id, email, role)
select id, email, case when lower(email) = 'thuytt@esquel.com' then 'admin' else 'qa' end
from auth.users
on conflict (id) do nothing;
