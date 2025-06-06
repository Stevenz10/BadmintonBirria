-- SQL script to create the database schema

-- =========================================================================
--  \ud83c\udfc8  Esquema “Birria → Ronda → Dupla → Partida”  (Versi\u00f3n 2025-06-02)
-- =========================================================================
--  Todas las tablas usan UUID autogenerado con la extensión pgcrypto.
--  RLS (Row-Level Security) se mantiene desactivado.

-- Asegúrate de que la extensión pgcrypto está habilitada
create extension if not exists "pgcrypto";

-- 1) Jugadores ------------------------------------------------------------
create table if not exists players (
  id   uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- 2) Birrias (sesiones completas) ----------------------------------------
create table if not exists birrias (
  id         uuid primary key default gen_random_uuid(),
  play_date  date not null,
  notes      text
);

-- 3) Rondas dentro de la Birria -----------------------------------------
create table if not exists rondas (
  id         uuid primary key default gen_random_uuid(),
  birria_id  uuid not null references birrias(id) on delete cascade,
  round_num  int  not null,
  unique (birria_id, round_num)
);

-- 4) Duplas generadas para la ronda -------------------------------------
create table if not exists duplas (
  id          uuid primary key default gen_random_uuid(),
  ronda_id    uuid not null references rondas(id) on delete cascade,
  player_a    uuid not null references players(id),
  player_b    uuid not null references players(id),
  position    int  not null,
  unique (ronda_id, position),
  unique (ronda_id, player_a, player_b)
);

-- 5) Partidas 2 vs 2 -----------------------------------------------------
create table if not exists partidas (
  id            uuid primary key default gen_random_uuid(),
  ronda_id      uuid not null references rondas(id) on delete cascade,
  dupla_a_id    uuid not null references duplas(id),
  dupla_b_id    uuid not null references duplas(id),
  score_a       int  not null check (score_a >= 0),
  score_b       int  not null check (score_b >= 0),
  winner_dupla  uuid not null references duplas(id),
  check (winner_dupla in (dupla_a_id, dupla_b_id))
);

-- Opcional: habilita RLS más adelante si es necesario.
