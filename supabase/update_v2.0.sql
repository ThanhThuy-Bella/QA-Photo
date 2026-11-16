-- Cập nhật v2.0 – bật tự cập nhật trang Admin khi QA gửi duyệt (Supabase Realtime).
-- Chạy 1 lần trong Supabase > SQL Editor (chạy lại không sao).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photo_sets'
  ) then
    alter publication supabase_realtime add table public.photo_sets;
  end if;
end $$;
