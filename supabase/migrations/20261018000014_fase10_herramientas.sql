-- Contabilidad ME · fase 10: herramientas (asientos tipo, asignación de centros de costo,
-- registro de actividad y hojas foliadas).

-- ─────────── Asientos tipo (plantillas de comprobantes) ───────────
create table public.comprobantes_tipo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text not null default '',
  glosa text not null default '',
  guarda_montos boolean not null default false,
  lineas jsonb not null default '[]' check (jsonb_typeof(lineas) = 'array'),
  dist_activa boolean not null default false,
  dist_base numeric(14, 0) not null default 0,
  dist jsonb not null default '[]' check (jsonb_typeof(dist) = 'array'),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index comprobantes_tipo_empresa_idx on public.comprobantes_tipo (empresa_id, nombre);
alter table public.comprobantes_tipo enable row level security;
create policy ct_ver on public.comprobantes_tipo for select to authenticated using (public.es_miembro(empresa_id));
create policy ct_crear on public.comprobantes_tipo for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy ct_editar on public.comprobantes_tipo for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy ct_borrar on public.comprobantes_tipo for delete to authenticated using (public.puede_escribir(empresa_id));
revoke all on public.comprobantes_tipo from anon, authenticated;
grant select, insert, update, delete on public.comprobantes_tipo to authenticated;

-- ─────────── Registro de actividad desde la aplicación ───────────
-- Las funciones de la base ya registran sus acciones; esta deja constancia de cambios hechos con
-- escrituras directas (renta, declaraciones juradas, plantillas, exportaciones).
create or replace function public.registrar_actividad(p_empresa uuid, p_accion text, p_detalle jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_miembro(p_empresa) then raise exception 'No perteneces a esta empresa'; end if;
  if p_accion !~ '^[a-z_]{3,40}$' then raise exception 'Acción inválida'; end if;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, p_accion, coalesce(p_detalle, '{}'::jsonb));
end $$;
revoke execute on function public.registrar_actividad(uuid, text, jsonb) from public, anon;
grant execute on function public.registrar_actividad(uuid, text, jsonb) to authenticated;

-- ─────────── Asignación de centros de costo ───────────
-- Fija el centro de costo de líneas de gasto (grupos 31 a 35) que lo admiten. No cambia montos ni
-- cuentas, por eso se permite también en meses cerrados; queda en auditoría.
create or replace function public.asignar_centro_costo(p_empresa uuid, p_lineas bigint[], p_cc text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int; v_malas int;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para modificar asientos'; end if;
  if coalesce(array_length(p_lineas, 1), 0) = 0 then raise exception 'No hay líneas seleccionadas'; end if;
  if array_length(p_lineas, 1) > 5000 then raise exception 'Máximo 5.000 líneas por vez'; end if;
  if p_cc is not null and not exists (select 1 from centros_costo where empresa_id = p_empresa and codigo = p_cc and activo) then
    raise exception 'El centro de costo no existe o está inactivo';
  end if;
  select count(*) into v_malas
  from asiento_lineas l join asientos a on a.id = l.asiento_id join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.id = any (p_lineas) and (l.empresa_id <> p_empresa or a.anulado or a.tipo = 'cierre' or l.cuenta !~ '^3[1-5]' or not c.acepta_centro_costo);
  if v_malas > 0 then raise exception 'Hay % línea(s) que no se pueden asignar (anuladas, de cierre, de otra cuenta o de una cuenta sin centro de costo)', v_malas; end if;
  if p_cc is null and exists (select 1 from asiento_lineas l join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta where l.id = any (p_lineas) and c.requiere_centro_costo) then
    raise exception 'Alguna cuenta exige centro de costo: no se puede dejar en blanco';
  end if;
  update asiento_lineas set centro_costo = p_cc where id = any (p_lineas) and empresa_id = p_empresa;
  get diagnostics v_n = row_count;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'asignar_centro_costo', jsonb_build_object('centro', p_cc, 'lineas', v_n));
  return v_n;
end $$;
revoke execute on function public.asignar_centro_costo(uuid, bigint[], text) from public, anon;
grant execute on function public.asignar_centro_costo(uuid, bigint[], text) to authenticated;

-- Líneas de gasto (31 a 35) de cuentas con centro de costo, con datos del asiento y del documento
create or replace function public.lineas_costeables(p_empresa uuid, p_desde date, p_hasta date)
returns table (id bigint, asiento_id uuid, cuenta text, fecha date, numero int, tipo text, glosa text, glosa_linea text,
               debe numeric, haber numeric, centro_costo text, rut text, tipo_dte int, folio text)
language sql stable security invoker set search_path = public as $$
  select l.id, a.id, l.cuenta, a.fecha, a.numero, a.tipo, a.glosa, l.glosa, l.debe, l.haber, l.centro_costo, l.rut_auxiliar, l.tipo_dte, l.folio
  from asiento_lineas l join asientos a on a.id = l.asiento_id join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.empresa_id = p_empresa and not a.anulado and a.tipo <> 'cierre' and l.cuenta ~ '^3[1-5]' and c.acepta_centro_costo
    and a.fecha between p_desde and p_hasta
  order by a.fecha, a.numero, l.orden
$$;
revoke execute on function public.lineas_costeables(uuid, date, date) from public, anon;
grant execute on function public.lineas_costeables(uuid, date, date) to authenticated;

-- ─────────── Hojas sueltas foliadas (libros en hojas timbradas por el SII) ───────────
create table public.folios_rangos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  desde int not null check (desde > 0),
  hasta int not null,
  fecha_autorizacion date,
  activo boolean not null default true,
  creado timestamptz not null default now(),
  check (hasta >= desde)
);
create table public.folios_reservas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  libro text not null check (libro in ('diario', 'mayor', 'caja', 'inventario')),
  desde date not null,
  hasta date not null,
  folios int[] not null,
  estado text not null default 'reservado' check (estado in ('reservado', 'usado', 'inutilizado')),
  config jsonb not null default '{}'::jsonb,
  paginas jsonb not null default '[]'::jsonb,
  usuario text not null default '',
  creado timestamptz not null default now(),
  cerrado timestamptz,
  cerrado_por text not null default ''
);
create table public.folios_config (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  config jsonb not null default '{}'::jsonb
);
alter table public.folios_rangos enable row level security;
alter table public.folios_reservas enable row level security;
alter table public.folios_config enable row level security;
create policy fr_ver on public.folios_rangos for select to authenticated using (public.es_miembro(empresa_id));
create policy fv_ver on public.folios_reservas for select to authenticated using (public.es_miembro(empresa_id));
create policy fc_ver on public.folios_config for select to authenticated using (public.es_miembro(empresa_id));
create policy fc_crear on public.folios_config for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy fc_editar on public.folios_config for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
revoke all on public.folios_rangos, public.folios_reservas, public.folios_config from anon, authenticated;
grant select on public.folios_rangos, public.folios_reservas to authenticated;
grant select, insert, update on public.folios_config to authenticated;

-- Registra un rango autorizado (no puede superponerse con otro) y lo deja activo
create or replace function public.agregar_rango_folios(p_empresa uuid, p_desde int, p_hasta int, p_fecha date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso'; end if;
  if p_desde is null or p_hasta is null or p_desde <= 0 or p_hasta < p_desde then raise exception 'Ingresa un rango de folios válido'; end if;
  perform pg_advisory_xact_lock(hashtext('folios:' || p_empresa));
  if exists (select 1 from folios_rangos where empresa_id = p_empresa and not (p_hasta < desde or p_desde > hasta)) then
    raise exception 'El rango se superpone con otro ya registrado';
  end if;
  update folios_rangos set activo = false where empresa_id = p_empresa;
  insert into folios_rangos (empresa_id, desde, hasta, fecha_autorizacion) values (p_empresa, p_desde, p_hasta, p_fecha) returning id into v_id;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'folios_rango', jsonb_build_object('desde', p_desde, 'hasta', p_hasta));
  return v_id;
end $$;

create or replace function public.activar_rango_folios(p_empresa uuid, p_rango uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso'; end if;
  if not exists (select 1 from folios_rangos where id = p_rango and empresa_id = p_empresa) then raise exception 'El rango no existe'; end if;
  update folios_rangos set activo = (id = p_rango) where empresa_id = p_empresa;
end $$;

-- Reserva el primer bloque de folios consecutivos libres del rango activo (atómico)
create or replace function public.reservar_folios(p_empresa uuid, p_cantidad int, p_libro text, p_desde date, p_hasta date, p_config jsonb, p_paginas jsonb, p_usuario text)
returns int[] language plpgsql security definer set search_path = public as $$
declare r record; v_ini int; v_f int; v_ok boolean; v_folios int[]; v_usados int[];
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 2000 then raise exception 'Cantidad de hojas inválida'; end if;
  if jsonb_array_length(p_paginas) <> p_cantidad then raise exception 'Debe haber una página por folio'; end if;
  perform pg_advisory_xact_lock(hashtext('folios:' || p_empresa));
  select * into r from folios_rangos where empresa_id = p_empresa and activo limit 1;
  if not found then raise exception 'Primero registra un rango de folios autorizado por el SII'; end if;
  select coalesce(array_agg(f), '{}') into v_usados from folios_reservas, unnest(folios) f where empresa_id = p_empresa;
  v_ini := r.desde;
  while v_ini <= r.hasta - p_cantidad + 1 loop
    v_ok := true;
    for v_f in v_ini .. v_ini + p_cantidad - 1 loop
      if v_f = any (v_usados) then v_ok := false; v_ini := v_f; exit; end if;
    end loop;
    if v_ok then
      v_folios := array(select generate_series(v_ini, v_ini + p_cantidad - 1));
      insert into folios_reservas (empresa_id, libro, desde, hasta, folios, config, paginas, usuario)
      values (p_empresa, p_libro, p_desde, p_hasta, v_folios, coalesce(p_config, '{}'), p_paginas, coalesce(p_usuario, ''));
      insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'folios_reserva', jsonb_build_object('libro', p_libro, 'desde', v_folios[1], 'hasta', v_folios[p_cantidad]));
      return v_folios;
    end if;
    v_ini := v_ini + 1;
  end loop;
  raise exception 'No quedan % folios consecutivos disponibles en el rango activo', p_cantidad;
end $$;

create or replace function public.cerrar_reserva_folios(p_empresa uuid, p_reserva uuid, p_estado text, p_usuario text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso'; end if;
  if p_estado not in ('usado', 'inutilizado') then raise exception 'Estado inválido'; end if;
  update folios_reservas set estado = p_estado, cerrado = now(), cerrado_por = coalesce(p_usuario, '')
  where id = p_reserva and empresa_id = p_empresa and estado = 'reservado';
  if not found then raise exception 'La reserva ya fue cerrada o no existe'; end if;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'folios_' || p_estado, jsonb_build_object('reserva', p_reserva));
end $$;

revoke execute on function public.agregar_rango_folios(uuid, int, int, date), public.activar_rango_folios(uuid, uuid),
  public.reservar_folios(uuid, int, text, date, date, jsonb, jsonb, text), public.cerrar_reserva_folios(uuid, uuid, text, text) from public, anon;
grant execute on function public.agregar_rango_folios(uuid, int, int, date), public.activar_rango_folios(uuid, uuid),
  public.reservar_folios(uuid, int, text, date, date, jsonb, jsonb, text), public.cerrar_reserva_folios(uuid, uuid, text, text) to authenticated;

-- El registro de actividad se lee con el nombre de quien actuó
create or replace function public.actividad_empresa(p_empresa uuid, p_limite int default 300, p_antes timestamptz default null)
returns table (id bigint, creado timestamptz, accion text, detalle jsonb, usuario text)
language sql stable security definer set search_path = public as $$
  select a.id, a.creado, a.accion, a.detalle, coalesce(nullif(p.nombre, ''), p.email, '')
  from auditoria a left join perfiles p on p.id = a.usuario_id
  where a.empresa_id = p_empresa and es_admin(p_empresa) and (p_antes is null or a.creado < p_antes)
  order by a.creado desc, a.id desc
  limit least(greatest(coalesce(p_limite, 300), 1), 1000)
$$;
revoke execute on function public.actividad_empresa(uuid, int, timestamptz) from public, anon;
grant execute on function public.actividad_empresa(uuid, int, timestamptz) to authenticated;

-- Libro diario completo de un período (todas las líneas con los datos del asiento), para exportar e imprimir
create or replace function public.lineas_libro(p_empresa uuid, p_desde date, p_hasta date, p_incluir_anulados boolean default false)
returns table (asiento_id uuid, numero int, fecha date, tipo text, glosa text, anulado boolean, orden int, cuenta text, nombre_cuenta text,
               debe numeric, haber numeric, glosa_linea text, centro_costo text, rut text, tipo_dte int, folio text)
language sql stable security invoker set search_path = public as $$
  select a.id, a.numero, a.fecha, a.tipo, a.glosa, a.anulado, l.orden, l.cuenta, c.nombre, l.debe, l.haber, l.glosa, l.centro_costo, l.rut_auxiliar, l.tipo_dte, l.folio
  from asiento_lineas l join asientos a on a.id = l.asiento_id left join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.empresa_id = p_empresa and a.fecha between p_desde and p_hasta and (p_incluir_anulados or not a.anulado)
  order by a.fecha, a.numero, l.orden
$$;
revoke execute on function public.lineas_libro(uuid, date, date, boolean) from public, anon;
grant execute on function public.lineas_libro(uuid, date, date, boolean) to authenticated;

-- Búsqueda global: todas las palabras deben aparecer (sin importar mayúsculas ni tildes). Máximo 10 por tipo.
create or replace function public.buscar_global(p_empresa uuid, p_texto text)
returns table (tipo text, id text, titulo text, sub text, ref text)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_palabras text[] := array(select lower(unaccent_simple(w)) from regexp_split_to_table(trim(coalesce(p_texto, '')), '\s+') w where length(w) > 0);
begin
  if coalesce(array_length(v_palabras, 1), 0) = 0 or length(trim(p_texto)) < 2 then return; end if;
  return query
  (select 'documento', d.id::text, coalesce(d.razon_social, '(sin razón social)') || ' · DTE ' || coalesce(d.tipo_dte::text, '') || ' N° ' || coalesce(d.folio, ''),
          d.tipo || ' · ' || coalesce(to_char(d.fecha, 'DD/MM/YYYY'), '') || ' · $' || to_char(d.total, 'FM999G999G999G990') || coalesce(' · ' || d.rut, '') || case when d.estado = 'anulado' then ' · ANULADO' else '' end,
          d.asiento_id::text
   from documentos d where d.empresa_id = p_empresa
     and (select bool_and(lower(unaccent_simple(concat_ws(' ', d.razon_social, d.rut, d.folio, d.tipo, d.total::text, to_char(d.fecha, 'DD/MM/YYYY')))) like '%' || w || '%') from unnest(v_palabras) w)
   order by d.fecha desc nulls last limit 10)
  union all
  (select 'asiento', a.id::text, 'N° ' || a.numero || ' · ' || a.glosa,
          to_char(a.fecha, 'DD/MM/YYYY') || ' · ' || a.tipo || case when a.anulado then ' · ANULADO' else '' end, null
   from asientos a where a.empresa_id = p_empresa
     and (select bool_and(lower(unaccent_simple(concat_ws(' ', a.numero::text, a.glosa, a.tipo, to_char(a.fecha, 'DD/MM/YYYY')))) like '%' || w || '%') from unnest(v_palabras) w)
   order by a.fecha desc limit 10)
  union all
  (select 'trabajador', t.id::text, t.nombre, coalesce(t.ficha ->> 'cargo', '') || ' · ' || t.rut || case when t.activo then '' else ' · inactivo' end, null
   from trabajadores t where t.empresa_id = p_empresa
     and (select bool_and(lower(unaccent_simple(concat_ws(' ', t.nombre, t.rut, t.ficha ->> 'cargo'))) like '%' || w || '%') from unnest(v_palabras) w)
   order by t.nombre limit 10)
  union all
  (select 'cuenta', c.codigo, c.codigo || ' · ' || c.nombre, 'Plan de cuentas', null
   from cuentas c where c.empresa_id = p_empresa and c.acepta_movimientos
     and (select bool_and(lower(unaccent_simple(c.codigo || ' ' || c.nombre)) like '%' || w || '%') from unnest(v_palabras) w)
   order by c.codigo limit 10)
  union all
  (select 'activo', f.id::text, f.descripcion, to_char(f.fecha, 'DD/MM/YYYY') || ' · ' || f.categoria, extract(year from f.fecha)::text
   from activos_fijos f where f.empresa_id = p_empresa
     and (select bool_and(lower(unaccent_simple(f.descripcion || ' ' || f.categoria)) like '%' || w || '%') from unnest(v_palabras) w)
   limit 10)
  union all
  (select 'producto', p.id::text, p.codigo || ' · ' || p.descripcion, 'Inventario · ' || p.unidad, null
   from inv_productos p where p.empresa_id = p_empresa
     and (select bool_and(lower(unaccent_simple(concat_ws(' ', p.codigo, p.ean, p.descripcion, p.subgrupo))) like '%' || w || '%') from unnest(v_palabras) w)
   order by p.codigo limit 10);
end $$;

-- Quita tildes sin depender de la extensión unaccent
create or replace function public.unaccent_simple(t text)
returns text language sql immutable as $$
  select translate(coalesce(t, ''), 'áéíóúÁÉÍÓÚäëïöüÄËÏÖÜñÑ', 'aeiouAEIOUaeiouAEIOUnN')
$$;
revoke execute on function public.buscar_global(uuid, text) from public, anon;
grant execute on function public.buscar_global(uuid, text) to authenticated;
