-- ─────────────────────────────────────────────────────────────────────
--  masterKeys · esquema de sincronización de progreso
--  Pégalo en Supabase → SQL Editor → Run.
--
--  Crea la tabla de sesiones de práctica y activa Row Level Security para
--  que CADA usuario solo pueda leer y escribir SUS PROPIAS filas. Sin esto,
--  la clave publishable del cliente dejaría los datos abiertos a cualquiera.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.practice_sessions (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        timestamptz not null,
  mode        text,
  assisted    boolean default false,
  level       int,
  duration_ms bigint,
  events      jsonb,
  created_at  timestamptz not null default now()
);

-- Índice para el orden por fecha del usuario.
create index if not exists practice_sessions_user_date
  on public.practice_sessions (user_id, date);

-- ── Row Level Security ────────────────────────────────────────────────
alter table public.practice_sessions enable row level security;

-- Un solo policy que cubre SELECT/INSERT/UPDATE/DELETE: solo tus filas.
drop policy if exists "solo mis sesiones" on public.practice_sessions;
create policy "solo mis sesiones"
  on public.practice_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
