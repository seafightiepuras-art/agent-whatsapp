-- Agent WhatsApp de memento-uri. Tabelele încep cu "agent_" ca să nu se amestece cu restul aplicațiilor.
-- Toate au RLS activat și NICIO politică: le citește/scrie doar serverul, cu cheia de serviciu.

create table agent_memento (
  id           uuid primary key default gen_random_uuid(),
  telefon      text not null,                      -- doar cifre, cu prefix de țară (ex. 40724206225)
  titlu        text not null,
  eveniment_la timestamptz not null,               -- momentul programării
  status       text not null default 'activ' check (status in ('activ', 'anulat')),
  creat_la     timestamptz not null default now()
);
create index idx_agent_memento_telefon on agent_memento (telefon, eveniment_la);

-- Fiecare memento are una sau mai multe notificări programate (ex. seara dinainte + cu o oră înainte).
create table agent_notificari (
  id            uuid primary key default gen_random_uuid(),
  memento_id    uuid not null references agent_memento(id) on delete cascade,
  trimite_la    timestamptz not null,
  trimis_la     timestamptz,
  incercari     integer not null default 0,
  ultima_eroare text
);
create index idx_agent_notificari_scadente on agent_notificari (trimite_la) where trimis_la is null;

-- Mesajele deja procesate (Meta poate retrimite același mesaj): fiecare id se procesează o singură dată.
create table agent_mesaje_procesate (
  id       text primary key,
  creat_la timestamptz not null default now()
);

alter table agent_memento enable row level security;
alter table agent_notificari enable row level security;
alter table agent_mesaje_procesate enable row level security;

-- Ultimele mesaje din conversație (ca agentul să țină minte "la ce oră?" -> "la 10").
create table agent_istoric (
  id       uuid primary key default gen_random_uuid(),
  telefon  text not null,
  rol      text not null check (rol in ('user', 'assistant')),
  text     text not null,
  creat_la timestamptz not null default now()
);
create index idx_agent_istoric_telefon on agent_istoric (telefon, creat_la desc);

alter table agent_istoric enable row level security;
