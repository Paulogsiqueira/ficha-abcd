-- Ficha ABCD: rode uma vez no SQL Editor do Supabase.
-- Cada usuário só enxerga e altera os próprios documentos (RLS).

create table if not exists public.docs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

alter table public.docs enable row level security;

drop policy if exists "ler os meus" on public.docs;
drop policy if exists "criar os meus" on public.docs;
drop policy if exists "alterar os meus" on public.docs;
drop policy if exists "apagar os meus" on public.docs;

create policy "ler os meus"     on public.docs for select to authenticated using ((select auth.uid()) = user_id);
create policy "criar os meus"   on public.docs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alterar os meus" on public.docs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apagar os meus"  on public.docs for delete to authenticated using ((select auth.uid()) = user_id);
