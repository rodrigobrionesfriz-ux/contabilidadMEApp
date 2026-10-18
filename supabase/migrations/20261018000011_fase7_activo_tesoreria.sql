-- Contabilidad ME · fase 7: activo fijo y depreciación, flujo de caja y conciliación bancaria.

create table public.activos_fijos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  descripcion text not null check (length(trim(descripcion)) > 0),
  categoria text not null check (categoria in ('bienes_raices', 'maquinarias', 'instalaciones', 'vehiculos', 'equipos_ofic')),
  fecha date not null,
  cuenta_activo text not null,
  cuenta_depr_acum text not null,
  cuenta_gasto text not null,
  ficha jsonb not null,           -- valor, residual, vida y método contables y tributarios, fechas de inicio
  documento_id uuid references public.documentos (id) on delete set null,
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  foreign key (empresa_id, cuenta_activo) references public.cuentas (empresa_id, codigo),
  foreign key (empresa_id, cuenta_depr_acum) references public.cuentas (empresa_id, codigo),
  foreign key (empresa_id, cuenta_gasto) references public.cuentas (empresa_id, codigo)
);
alter table public.activos_fijos enable row level security;
create policy af_ver on public.activos_fijos for select to authenticated using (public.es_miembro(empresa_id));
create policy af_crear on public.activos_fijos for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy af_editar on public.activos_fijos for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy af_borrar on public.activos_fijos for delete to authenticated using (public.puede_escribir(empresa_id));

-- Un solo asiento de depreciación vigente por año
create unique index asientos_depreciacion_unica on public.asientos (empresa_id, origen_id) where not anulado and tipo = 'depreciacion';

-- Conciliación bancaria: líneas del mayor marcadas como presentes en la cartola, y saldo según banco
create table public.conciliacion_marcas (
  linea_id bigint primary key references public.asiento_lineas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conciliado_por uuid references auth.users (id) default auth.uid(),
  conciliado_en timestamptz not null default now()
);
create table public.conciliacion_saldos (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  cuenta text not null,
  anio int not null,
  saldo_banco numeric(16, 0) not null default 0,
  actualizado timestamptz not null default now(),
  primary key (empresa_id, cuenta, anio)
);
alter table public.conciliacion_marcas enable row level security;
alter table public.conciliacion_saldos enable row level security;
create policy cm_ver on public.conciliacion_marcas for select to authenticated using (public.es_miembro(empresa_id));
create policy cm_crear on public.conciliacion_marcas for insert to authenticated
  with check (public.puede_escribir(empresa_id) and exists (select 1 from asiento_lineas l where l.id = linea_id and l.empresa_id = conciliacion_marcas.empresa_id));
create policy cm_borrar on public.conciliacion_marcas for delete to authenticated using (public.puede_escribir(empresa_id));
create policy cs_ver on public.conciliacion_saldos for select to authenticated using (public.es_miembro(empresa_id));
create policy cs_crear on public.conciliacion_saldos for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy cs_editar on public.conciliacion_saldos for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));

-- Movimientos de las cuentas que empiezan con un prefijo (sin anulados), con datos del asiento
create or replace function public.lineas_cuentas(p_empresa uuid, p_prefijo text, p_desde date, p_hasta date)
returns table (id bigint, cuenta text, fecha date, numero int, tipo text, glosa text, glosa_linea text, debe numeric, haber numeric)
language sql stable security invoker set search_path = public as $$
  select l.id, l.cuenta, a.fecha, a.numero, a.tipo, a.glosa, l.glosa, l.debe, l.haber
  from asiento_lineas l join asientos a on a.id = l.asiento_id
  where l.empresa_id = p_empresa and not a.anulado and l.cuenta like p_prefijo || '%' and a.fecha between p_desde and p_hasta
  order by a.fecha, a.numero, l.orden
$$;

revoke all on public.activos_fijos, public.conciliacion_marcas, public.conciliacion_saldos from anon, authenticated;
grant select, insert, update, delete on public.activos_fijos to authenticated;
grant select, insert, delete on public.conciliacion_marcas to authenticated;
grant select, insert, update on public.conciliacion_saldos to authenticated;
revoke execute on function public.lineas_cuentas(uuid, text, date, date) from public, anon;
grant execute on function public.lineas_cuentas(uuid, text, date, date) to authenticated;
