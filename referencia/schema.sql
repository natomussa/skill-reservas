-- Reservas de mesa + fila de espera + mapa de mesas (Postgres / Supabase).
--
-- Pressupõe uma tabela de estabelecimentos com (id uuid, nome text).
-- Aqui ela se chama public.lojas. Se no seu projeto o nome for outro
-- (restaurants, venues, empresas...), troque em todas as FKs abaixo.
--
-- RLS ligada SEM policies = ninguém acessa pelo client. Todo acesso passa
-- pelas APIs no servidor com a service role, que filtram loja_id na mão.
-- Se preferir policies, escreva por loja_id, mas NUNCA abra leitura anônima
-- de `reservas`: tem nome e telefone de cliente.

create table if not exists public.reservas_config (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null unique references public.lojas(id) on delete cascade,
  -- nasce DESLIGADA: a casa liga quando quiser vender reserva online
  ativo boolean not null default false,
  max_pessoas int not null default 6,
  whatsapp text,
  tolerancia_min int not null default 30,
  antecedencia_min int not null default 30,
  dias_semana int[] not null default '{0,1,2,3,4,5,6}',
  slots jsonb not null default '[]'::jsonb, -- [{"hora":"19:00","capacidade":20}]
  total_mesas int not null default 20,
  mensagem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  codigo text not null unique, -- "MESA-XXXXXXXX", credencial do cliente
  data date not null,
  horario text not null, -- "19:00", casa com reservas_config.slots[].hora
  pessoas int not null check (pessoas > 0),
  nome text not null,
  telefone text not null,
  nascimento date, -- opcional, alimenta aniversariantes no CRM
  observacao text,
  status text not null default 'confirmada'
    check (status in ('confirmada', 'sentou', 'nao_veio', 'cancelada')),
  mesa int, -- preenchida quando senta
  levantou_em timestamptz, -- mesa liberada (continua status 'sentou')
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists reservas_loja_data_idx on public.reservas (loja_id, data);

-- Passante: chega sem reserva, entra na fila e senta quando o salão libera.
create table if not exists public.fila_espera (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  telefone text,
  pessoas int not null check (pessoas > 0),
  observacao text,
  status text not null default 'esperando'
    check (status in ('esperando', 'chamado', 'sentou', 'desistiu')),
  mesa int,
  chamado_em timestamptz,
  levantou_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists fila_espera_loja_idx on public.fila_espera (loja_id, status, criado_em);

alter table public.reservas_config enable row level security;
alter table public.reservas enable row level security;
alter table public.fila_espera enable row level security;
