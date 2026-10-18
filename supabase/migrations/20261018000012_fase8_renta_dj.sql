-- Contabilidad ME · fase 8: renta anual (RLI y F22) y control de declaraciones juradas.

-- Decisiones de la declaración de renta de cada año (régimen, gastos rechazados, ajustes, créditos, PPM).
-- Lo demás sale de la contabilidad cada vez que se abre la pantalla.
create table public.renta_declaraciones (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio int not null check (anio between 2000 and 2100),
  datos jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) default auth.uid(),
  primary key (empresa_id, anio)
);

-- Catálogo de declaraciones juradas de la empresa (copia editable de la semilla oficial)
create table public.dj_catalogo (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  catalogo jsonb not null check (jsonb_typeof(catalogo) = 'array'),
  actualizado timestamptz not null default now()
);

-- Estado de presentación por año tributario: {"1887": {estado, fecha, folio, obs}}
create table public.dj_estados (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio_tributario int not null check (anio_tributario between 2000 and 2101),
  estados jsonb not null default '{}'::jsonb check (jsonb_typeof(estados) = 'object'),
  actualizado timestamptz not null default now(),
  primary key (empresa_id, anio_tributario)
);

alter table public.renta_declaraciones enable row level security;
alter table public.dj_catalogo enable row level security;
alter table public.dj_estados enable row level security;

create policy rd_ver on public.renta_declaraciones for select to authenticated using (public.es_miembro(empresa_id));
create policy rd_crear on public.renta_declaraciones for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy rd_editar on public.renta_declaraciones for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy djc_ver on public.dj_catalogo for select to authenticated using (public.es_miembro(empresa_id));
create policy djc_crear on public.dj_catalogo for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy djc_editar on public.dj_catalogo for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy djc_borrar on public.dj_catalogo for delete to authenticated using (public.puede_escribir(empresa_id));
create policy dje_ver on public.dj_estados for select to authenticated using (public.es_miembro(empresa_id));
create policy dje_crear on public.dj_estados for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy dje_editar on public.dj_estados for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));

revoke all on public.renta_declaraciones, public.dj_catalogo, public.dj_estados from anon, authenticated;
grant select, insert, update on public.renta_declaraciones to authenticated;
grant select, insert, update, delete on public.dj_catalogo to authenticated;
grant select, insert, update on public.dj_estados to authenticated;
