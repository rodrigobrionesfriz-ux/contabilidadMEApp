-- Contabilidad ME · fase 5c: contratos de trabajo (registro DT y plantillas por cargo).
-- Los datos propios del contrato de cada trabajador viven en trabajadores.ficha.contratoDT.

-- Valores por defecto de la empresa para los contratos (comuna de celebración, jornada, horario, pago)
create table public.contrato_config (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  defaults jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

-- Plantillas propias o versión editada de una plantilla tipo (codigo = id de la tipo; borrarla la restaura)
create table public.contrato_plantillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  cargos text not null default '',
  tipo_contrato smallint check (tipo_contrato in (1, 2, 3)),
  texto text not null check (length(trim(texto)) > 0),
  actualizado timestamptz not null default now(),
  unique (empresa_id, codigo)
);

-- Contrato de cada trabajador: plantilla elegida y texto propio (si se personalizó)
create table public.contratos_trabajo (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  plantilla text,
  texto text,
  actualizado timestamptz not null default now(),
  primary key (empresa_id, trabajador_id)
);

alter table public.contrato_config enable row level security;
alter table public.contrato_plantillas enable row level security;
alter table public.contratos_trabajo enable row level security;

create policy ccfg_ver on public.contrato_config for select to authenticated using (public.es_miembro(empresa_id));
create policy ccfg_crear on public.contrato_config for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy ccfg_editar on public.contrato_config for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));

create policy cpl_ver on public.contrato_plantillas for select to authenticated using (public.es_miembro(empresa_id));
create policy cpl_crear on public.contrato_plantillas for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy cpl_editar on public.contrato_plantillas for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy cpl_borrar on public.contrato_plantillas for delete to authenticated using (public.puede_escribir(empresa_id));

create policy ctr_ver on public.contratos_trabajo for select to authenticated using (public.es_miembro(empresa_id));
create policy ctr_crear on public.contratos_trabajo for insert to authenticated
  with check (public.puede_escribir(empresa_id) and exists (select 1 from trabajadores t where t.id = trabajador_id and t.empresa_id = contratos_trabajo.empresa_id));
create policy ctr_editar on public.contratos_trabajo for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy ctr_borrar on public.contratos_trabajo for delete to authenticated using (public.puede_escribir(empresa_id));

revoke all on public.contrato_config, public.contrato_plantillas, public.contratos_trabajo from anon, authenticated;
grant select, insert, update on public.contrato_config to authenticated;
grant select, insert, update, delete on public.contrato_plantillas, public.contratos_trabajo to authenticated;
