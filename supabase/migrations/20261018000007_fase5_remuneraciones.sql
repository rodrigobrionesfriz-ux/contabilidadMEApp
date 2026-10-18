-- Contabilidad ME · fase 5a: remuneraciones (trabajadores, asistencia, anticipos, parámetros, libro y asiento).

-- Parámetros previsionales de la empresa (sobrescriben los valores de referencia)
create table public.empresa_parametros (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  indicadores jsonb not null default '{}'::jsonb,
  previsional jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

create table public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  rut text not null check (public.rut_valido(rut)),
  nombre text not null check (length(trim(nombre)) > 0),
  activo boolean not null default true,
  ficha jsonb not null default '{}'::jsonb,
  ref_origen text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (empresa_id, rut)
);

create table public.rem_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  tipo text not null check (tipo in ('licencia', 'permiso_sin', 'ausencia', 'permiso_con', 'vacaciones')),
  lic_tipo text,
  desde date not null,
  hasta date not null,
  folio text,
  obs text,
  creado timestamptz not null default now(),
  check (hasta >= desde)
);
create index rem_eventos_idx on public.rem_eventos (empresa_id, desde, hasta);

create table public.rem_horas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo char(7) not null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  horas numeric(6, 2) not null check (horas >= 0),
  primary key (empresa_id, periodo, trabajador_id)
);

create table public.libros_remuneraciones (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo char(7) not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  uf numeric(12, 2) not null,
  utm numeric(10, 0) not null,
  lineas jsonb not null,
  totales jsonb not null,
  asiento_id uuid references public.asientos (id) on delete set null,
  cerrado_por uuid references auth.users (id) default auth.uid(),
  cerrado_en timestamptz not null default now(),
  primary key (empresa_id, periodo)
);

create or replace function public.libro_rem_cerrado(p_empresa uuid, p_periodo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from libros_remuneraciones where empresa_id = p_empresa and periodo = p_periodo)
$$;

create table public.rem_anticipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  fecha date not null,
  monto numeric(14, 0) not null check (monto > 0),
  motivo text,
  mes_desc char(7) not null check (mes_desc ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  asiento_id uuid references public.asientos (id) on delete set null,
  creado timestamptz not null default now()
);

-- ── RLS ──
alter table public.empresa_parametros enable row level security;
alter table public.trabajadores enable row level security;
alter table public.rem_eventos enable row level security;
alter table public.rem_horas enable row level security;
alter table public.libros_remuneraciones enable row level security;
alter table public.rem_anticipos enable row level security;

create policy par_ver on public.empresa_parametros for select to authenticated using (public.es_miembro(empresa_id));
create policy par_crear on public.empresa_parametros for insert to authenticated with check (public.es_admin(empresa_id));
create policy par_editar on public.empresa_parametros for update to authenticated using (public.es_admin(empresa_id)) with check (public.es_admin(empresa_id));

create policy trab_ver on public.trabajadores for select to authenticated using (public.es_miembro(empresa_id));
create policy trab_crear on public.trabajadores for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy trab_editar on public.trabajadores for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));

-- Asistencia y anticipos: no se modifican meses con libro cerrado
create policy ev_ver on public.rem_eventos for select to authenticated using (public.es_miembro(empresa_id));
create policy ev_crear on public.rem_eventos for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy ev_editar on public.rem_eventos for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy ev_borrar on public.rem_eventos for delete to authenticated using (public.puede_escribir(empresa_id));

create policy hr_ver on public.rem_horas for select to authenticated using (public.es_miembro(empresa_id));
create policy hr_crear on public.rem_horas for insert to authenticated with check (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, periodo));
create policy hr_editar on public.rem_horas for update to authenticated
  using (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, periodo))
  with check (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, periodo));

create policy an_ver on public.rem_anticipos for select to authenticated using (public.es_miembro(empresa_id));
create policy an_crear on public.rem_anticipos for insert to authenticated with check (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, mes_desc));
create policy an_editar on public.rem_anticipos for update to authenticated
  using (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, mes_desc))
  with check (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, mes_desc));
create policy an_borrar on public.rem_anticipos for delete to authenticated using (public.puede_escribir(empresa_id) and not public.libro_rem_cerrado(empresa_id, mes_desc));

create policy lib_ver on public.libros_remuneraciones for select to authenticated using (public.es_miembro(empresa_id));

-- ── Cerrar el libro del mes y contabilizar ──
-- Anula el asiento de remuneraciones vigente del período (si lo hay), crea el nuevo y guarda la foto del libro.
create or replace function public.cerrar_libro_remuneraciones(
  p_empresa uuid, p_periodo text, p_uf numeric, p_utm numeric, p_lineas jsonb, p_totales jsonb,
  p_fecha date, p_glosa text, p_asiento jsonb)
returns table (asiento_id uuid, numero int) language plpgsql security definer set search_path = public as $$
declare v_as uuid; v_num int; a record;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para cerrar el libro de remuneraciones'; end if;
  if libro_rem_cerrado(p_empresa, p_periodo) then raise exception 'El libro de % ya está cerrado. Reábrelo para rehacerlo.', p_periodo; end if;
  if to_char(p_fecha, 'YYYY-MM') <> p_periodo then raise exception 'La fecha del asiento no corresponde al período %', p_periodo; end if;
  for a in select id from asientos where empresa_id = p_empresa and tipo = 'remuneraciones' and not anulado
           and to_char(fecha, 'YYYY-MM') = p_periodo loop
    perform anular_asiento(a.id, 'Reemplazado por el cierre del libro de remuneraciones ' || p_periodo);
  end loop;
  select c.id, c.numero into v_as, v_num from crear_asiento(p_empresa, p_fecha, p_glosa, p_asiento, 'remuneraciones', 'rem:' || p_periodo) c;
  insert into libros_remuneraciones (empresa_id, periodo, uf, utm, lineas, totales, asiento_id)
  values (p_empresa, p_periodo, p_uf, p_utm, p_lineas, p_totales, v_as);
  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'cerrar_libro_remuneraciones', jsonb_build_object('periodo', p_periodo, 'asiento', v_num, 'liquido', p_totales -> 'liquido'));
  return query select v_as, v_num;
end $$;

-- Reabrir: sólo administradores; anula el asiento del libro y borra la foto
create or replace function public.reabrir_libro_remuneraciones(p_empresa uuid, p_periodo text)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede reabrir el libro de remuneraciones'; end if;
  select * into l from libros_remuneraciones where empresa_id = p_empresa and periodo = p_periodo;
  if not found then raise exception 'El libro de % no está cerrado', p_periodo; end if;
  if l.asiento_id is not null and exists (select 1 from asientos where id = l.asiento_id and not anulado) then
    perform anular_asiento(l.asiento_id, 'Libro de remuneraciones reabierto');
  end if;
  delete from libros_remuneraciones where empresa_id = p_empresa and periodo = p_periodo;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'reabrir_libro_remuneraciones', jsonb_build_object('periodo', p_periodo));
end $$;

-- ── Privilegios ──
revoke all on public.empresa_parametros, public.trabajadores, public.rem_eventos, public.rem_horas, public.libros_remuneraciones, public.rem_anticipos from anon, authenticated;
grant select on public.empresa_parametros, public.trabajadores, public.rem_eventos, public.rem_horas, public.libros_remuneraciones, public.rem_anticipos to authenticated;
grant insert, update on public.empresa_parametros to authenticated;
grant insert, update (nombre, activo, ficha, actualizado) on public.trabajadores to authenticated;
grant insert, update, delete on public.rem_eventos, public.rem_anticipos to authenticated;
grant insert, update on public.rem_horas to authenticated;

revoke execute on function public.libro_rem_cerrado(uuid, text), public.cerrar_libro_remuneraciones(uuid, text, numeric, numeric, jsonb, jsonb, date, text, jsonb),
  public.reabrir_libro_remuneraciones(uuid, text) from public, anon;
grant execute on function public.libro_rem_cerrado(uuid, text), public.cerrar_libro_remuneraciones(uuid, text, numeric, numeric, jsonb, jsonb, date, text, jsonb),
  public.reabrir_libro_remuneraciones(uuid, text) to authenticated;
