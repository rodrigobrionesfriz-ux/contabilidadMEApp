-- Contabilidad ME · fase 9: auxiliar de inventario (maestros, movimientos, lotes, tomas físicas,
-- órdenes de compra y recepciones). El stock y el costo promedio ponderado no se guardan: se
-- reconstruyen siempre desde los movimientos vigentes.

create table public.inv_grupos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  subgrupos text[] not null default '{}',
  activo boolean not null default true,
  actualizado timestamptz not null default now(),
  unique (empresa_id, nombre),
  unique (empresa_id, id)
);

create table public.inv_bodegas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text not null default '',
  activo boolean not null default true,
  actualizado timestamptz not null default now(),
  unique (empresa_id, codigo),
  unique (empresa_id, id)
);

create table public.inv_productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  ean text not null default '',
  descripcion text not null check (length(trim(descripcion)) > 0),
  tipo text not null default 'MERCADERÍA' check (tipo in ('MERCADERÍA', 'MATERIA PRIMA', 'PRODUCTO TERMINADO', 'INSUMO', 'ACTIVO FIJO', 'SERVICIO')),
  unidad text not null default 'UN' check (unidad in ('UN', 'KG', 'LT', 'MT', 'M2', 'M3', 'CAJA', 'SACO', 'PQT', 'GL')),
  grupo_id uuid,
  subgrupo text not null default '',
  stock_minimo numeric(16, 4) not null default 0 check (stock_minimo >= 0),
  cuenta_inventario text not null default '1109007',
  cuenta_costo text not null,
  aplica_iva boolean not null default true,
  maneja_lotes boolean not null default false,
  inventariable boolean not null default true,
  activo boolean not null default true,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (empresa_id, codigo),
  unique (empresa_id, id),
  foreign key (empresa_id, grupo_id) references public.inv_grupos (empresa_id, id),
  foreign key (empresa_id, cuenta_costo) references public.cuentas (empresa_id, codigo)
);
create unique index inv_productos_ean on public.inv_productos (empresa_id, ean) where ean <> '';

-- Las recepciones se enlazan a la factura de compras de la misma empresa
create unique index if not exists documentos_empresa_id_uq on public.documentos (empresa_id, id);

create table public.inv_ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  folio text not null,
  fecha date not null,
  fecha_entrega date,
  proveedor_rut text not null,
  proveedor_nombre text not null,
  bodega_id uuid not null,
  centro_costo text not null default '',
  condicion_pago text not null default '',
  observaciones text not null default '',
  tasa_iva numeric(5, 2) not null default 19,
  lineas jsonb not null check (jsonb_typeof(lineas) = 'array'),
  estado text not null check (estado in ('BORRADOR', 'EMITIDA', 'PARCIAL', 'RECIBIDA', 'CERRADA_PARCIAL', 'ANULADA')),
  version int not null default 1,
  motivo_anulacion text,
  creado timestamptz not null default now(),
  creado_por text not null default '',
  modificado timestamptz,
  modificado_por text not null default '',
  unique (empresa_id, folio),
  unique (empresa_id, id),
  foreign key (empresa_id, bodega_id) references public.inv_bodegas (empresa_id, id)
);

create table public.inv_recepciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  folio text not null,
  orden_compra_id uuid not null,
  proveedor_rut text not null,
  proveedor_nombre text not null,
  bodega_id uuid not null,
  fecha date not null,
  documento_tipo text not null,
  tipo_dte int,
  documento_numero text not null,
  estado_contable text not null default 'ESPERA_FACTURA' check (estado_contable in ('ESPERA_FACTURA', 'PENDIENTE_CONCILIACION', 'CONCILIADA')),
  compra_id uuid,
  conciliado_manual boolean not null default false,
  observaciones text not null default '',
  lineas jsonb not null check (jsonb_typeof(lineas) = 'array'),
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE', 'ANULADA')),
  motivo_anulacion text,
  creado timestamptz not null default now(),
  creado_por text not null default '',
  modificado timestamptz,
  modificado_por text not null default '',
  unique (empresa_id, folio),
  unique (empresa_id, id),
  foreign key (empresa_id, orden_compra_id) references public.inv_ordenes_compra (empresa_id, id),
  foreign key (empresa_id, bodega_id) references public.inv_bodegas (empresa_id, id),
  foreign key (empresa_id, compra_id) references public.documentos (empresa_id, id)
);

create table public.inv_tomas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  folio text not null,
  bodega_id uuid not null,
  alcance text not null default 'CON_STOCK' check (alcance in ('CON_STOCK', 'TODOS')),
  grupo_id uuid,
  observaciones text not null default '',
  estado text not null check (estado in ('EN_PROCESO', 'DEVUELTA', 'PENDIENTE_AUTORIZACION', 'RECHAZADA', 'APLICADA')),
  version int not null default 1,
  lineas jsonb not null check (jsonb_typeof(lineas) = 'array'),
  motivo text not null default '',          -- de la última devolución o del rechazo
  movimientos_ajuste text[] not null default '{}',
  creado timestamptz not null default now(),
  creado_por text not null default '',
  cerrado timestamptz,
  cerrado_por text not null default '',
  resuelto timestamptz,
  resuelto_por text not null default '',
  modificado timestamptz,
  unique (empresa_id, folio),
  unique (empresa_id, id),
  foreign key (empresa_id, bodega_id) references public.inv_bodegas (empresa_id, id),
  foreign key (empresa_id, grupo_id) references public.inv_grupos (empresa_id, id)
);
-- Una sola toma abierta o pendiente por bodega
create unique index inv_tomas_abierta on public.inv_tomas (empresa_id, bodega_id) where estado in ('EN_PROCESO', 'DEVUELTA', 'PENDIENTE_AUTORIZACION');

create table public.inv_movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  folio text not null,
  tipo text not null check (tipo in ('ENTRADA', 'SALIDA', 'TRASPASO', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA')),
  fecha date not null,
  motivo text not null default '',
  bodega_origen_id uuid,
  bodega_destino_id uuid,
  tercero text not null default '',
  documento_tipo text not null default 'SIN DOCUMENTO',
  documento_numero text not null default '',
  documento text not null default '',
  proveedor_rut text not null default '',
  proveedor_nombre text not null default '',
  orden_compra_id uuid,
  recepcion_id uuid,
  toma_id uuid,
  centro_costo text not null default '',
  observaciones text not null default '',
  lineas jsonb not null check (jsonb_typeof(lineas) = 'array'),
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE', 'ANULADO')),
  motivo_anulacion text,
  anulado timestamptz,
  anulado_por text not null default '',
  creado timestamptz not null default now(),
  creado_por text not null default '',
  editado timestamptz,
  editado_por text not null default '',
  unique (empresa_id, folio),
  foreign key (empresa_id, bodega_origen_id) references public.inv_bodegas (empresa_id, id),
  foreign key (empresa_id, bodega_destino_id) references public.inv_bodegas (empresa_id, id),
  foreign key (empresa_id, orden_compra_id) references public.inv_ordenes_compra (empresa_id, id),
  foreign key (empresa_id, recepcion_id) references public.inv_recepciones (empresa_id, id),
  foreign key (empresa_id, toma_id) references public.inv_tomas (empresa_id, id)
);
create index inv_movimientos_empresa_idx on public.inv_movimientos (empresa_id, fecha);

-- Versión del inventario de cada empresa: toda escritura la exige y la incrementa, así dos
-- personas no aplican cambios calculados sobre datos distintos (control optimista).
create table public.inv_estado (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  version bigint not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['inv_grupos', 'inv_bodegas', 'inv_productos', 'inv_ordenes_compra', 'inv_recepciones', 'inv_tomas', 'inv_movimientos', 'inv_estado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.es_miembro(empresa_id))', t || '_ver', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.puede_escribir(empresa_id))', t || '_crear', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id))', t || '_editar', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Aplica en una sola transacción una lista de operaciones sobre las tablas de inventario.
-- p_ops: [{ "tabla": "inv_movimientos", "accion": "insert" | "update", "fila": {...},
--           "folio": "ENT" (opcional: asigna el siguiente correlativo), "ref": "m1" (opcional),
--           "version": 3 (opcional, en update: exige esa versión del registro y la incrementa) }]
-- Un texto "{{ref}}" dentro de una fila posterior se reemplaza por el folio asignado a esa ref.
create or replace function public.inv_aplicar(p_empresa uuid, p_version bigint, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actual bigint;
  op jsonb;
  v_tabla text;
  v_fila jsonb;
  v_txt text;
  v_cols text;
  v_folio text;
  v_pref text;
  v_max int;
  v_n int;
  v_folios jsonb := '{}'::jsonb;
  k text;
  v_permitidas text[] := array['inv_grupos', 'inv_bodegas', 'inv_productos', 'inv_ordenes_compra', 'inv_recepciones', 'inv_tomas', 'inv_movimientos'];
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para modificar el inventario'; end if;
  insert into inv_estado (empresa_id) values (p_empresa) on conflict do nothing;
  select version into v_actual from inv_estado where empresa_id = p_empresa for update;
  -- p_version nulo: cambios que no dependen del stock (maestros, estados de una toma u orden con su propia versión)
  if p_version is not null and v_actual <> p_version then
    raise exception 'El inventario cambió en otro equipo. Se recargaron los datos: revisa y vuelve a intentar.';
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    v_tabla := op ->> 'tabla';
    if not v_tabla = any (v_permitidas) then raise exception 'Tabla no permitida: %', v_tabla; end if;
    -- Referencias a folios asignados antes en la misma operación
    v_txt := (op -> 'fila')::text;
    for k in select jsonb_object_keys(v_folios) loop
      v_txt := replace(v_txt, '{{' || k || '}}', v_folios ->> k);
    end loop;
    v_fila := v_txt::jsonb - 'empresa_id';
    if op ->> 'accion' = 'insert' then
      if op ? 'folio' then
        v_pref := op ->> 'folio';
        if v_pref !~ '^[A-Z]{2,4}$' then raise exception 'Prefijo de folio inválido'; end if;
        execute format('select coalesce(max(substring(folio from %L)::int), 0) from %I where empresa_id = $1 and folio ~ %L',
                       '^' || v_pref || '-(\d{6,})$', v_tabla, '^' || v_pref || '-\d{6,}$') into v_max using p_empresa;
        v_folio := v_pref || '-' || lpad((v_max + 1)::text, 6, '0');
        v_fila := v_fila || jsonb_build_object('folio', v_folio);
        if op ? 'ref' then v_folios := v_folios || jsonb_build_object(op ->> 'ref', v_folio); end if;
      end if;
      v_fila := v_fila || jsonb_build_object('empresa_id', p_empresa);
    else
      v_fila := v_fila - 'folio';
    end if;
    -- Sólo columnas reales de la tabla
    if exists (select 1 from jsonb_object_keys(v_fila) key
               where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = v_tabla and c.column_name = key)) then
      raise exception 'Columna desconocida en %', v_tabla;
    end if;
    select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(v_fila) key
    where op ->> 'accion' = 'insert' or key not in ('id', 'empresa_id', 'version');

    if op ->> 'accion' = 'insert' then
      execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)', v_tabla, v_cols, v_cols, v_tabla) using v_fila;
    elsif op ->> 'accion' = 'update' then
      if v_cols is null then continue; end if;
      if op ? 'version' then
        execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)), version = version + 1 where id = ($1 ->> %L)::uuid and empresa_id = $2 and version = $3',
                       v_tabla, v_cols, v_cols, v_tabla, 'id') using v_fila, p_empresa, (op ->> 'version')::int;
      else
        execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = ($1 ->> %L)::uuid and empresa_id = $2',
                       v_tabla, v_cols, v_cols, v_tabla, 'id') using v_fila, p_empresa;
      end if;
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'El registro cambió en otro equipo o ya no existe. Recarga y revisa.'; end if;
    else
      raise exception 'Acción inválida';
    end if;
  end loop;

  update inv_estado set version = version + 1 where empresa_id = p_empresa returning version into v_actual;
  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'inventario', jsonb_build_object('operaciones', (select jsonb_agg(jsonb_build_object('tabla', o ->> 'tabla', 'accion', o ->> 'accion', 'id', o -> 'fila' ->> 'id')) from jsonb_array_elements(p_ops) o), 'folios', v_folios));
  return jsonb_build_object('version', v_actual, 'folios', v_folios);
end $$;
revoke execute on function public.inv_aplicar(uuid, bigint, jsonb) from public, anon;
grant execute on function public.inv_aplicar(uuid, bigint, jsonb) to authenticated;

-- Registra el conteo físico de una línea de una toma abierta, sin pisar los conteos de otros usuarios.
-- p_fisico nulo borra el conteo; p_costo (opcional) fija el costo para valorizar un sobrante sin PPP.
create or replace function public.inv_contar(p_empresa uuid, p_toma uuid, p_linea text, p_fisico numeric, p_costo numeric, p_usuario text)
returns int language plpgsql security definer set search_path = public as $$
declare v_lineas jsonb; v_estado text; v_i int; v_l jsonb; v_version int;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para modificar el inventario'; end if;
  if p_fisico is not null and p_fisico < 0 then raise exception 'La cantidad física no puede ser negativa'; end if;
  if p_costo is not null and p_costo < 0 then raise exception 'El costo no puede ser negativo'; end if;
  select lineas, estado into v_lineas, v_estado from inv_tomas where id = p_toma and empresa_id = p_empresa for update;
  if not found then raise exception 'La toma ya no existe'; end if;
  if v_estado not in ('EN_PROCESO', 'DEVUELTA') then raise exception 'La toma ya no está editable'; end if;
  select i - 1 into v_i from jsonb_array_elements(v_lineas) with ordinality as x(l, i) where l ->> 'id' = p_linea;
  if v_i is null then raise exception 'Línea no encontrada'; end if;
  v_l := v_lineas -> v_i;
  if p_costo is not null then
    v_l := v_l || jsonb_build_object('costoConteo', p_costo);
  else
    v_l := v_l || jsonb_build_object('fisico', p_fisico, 'contado', p_fisico is not null,
      'fisicoFecha', case when p_fisico is null then null else to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end, 'contadoPor', coalesce(p_usuario, ''));
  end if;
  update inv_tomas set lineas = jsonb_set(v_lineas, array[v_i::text], v_l), version = version + 1, modificado = now()
  where id = p_toma returning version into v_version;
  return v_version;
end $$;
revoke execute on function public.inv_contar(uuid, uuid, text, numeric, numeric, text) from public, anon;
grant execute on function public.inv_contar(uuid, uuid, text, numeric, numeric, text) to authenticated;
