-- Contabilidad ME · fase 1: centros de costo jerárquicos, documentos tributarios,
-- importación del respaldo del sistema actual, balance y mantención de maestros.

-- ─────────────────────────── Centros de costo en dos niveles ───────────────────────────
alter table public.centros_costo
  add column nivel smallint not null default 1 check (nivel in (1, 2)),
  add column padre text,
  add column estado text not null default 'normal' check (estado in ('normal', 'operativo', 'formacion', 'capitalizado')),
  add column fecha_inicio date,
  add column curva text,
  add column pcts_capitalizacion jsonb,
  add column cuenta_costo text,
  add column ref_origen text,
  add constraint centros_costo_padre_fk foreign key (empresa_id, padre) references public.centros_costo (empresa_id, codigo),
  add constraint centros_costo_padre_nivel check ((nivel = 1 and padre is null) or (nivel = 2 and padre is not null));
create unique index centros_costo_ref_origen_uq on public.centros_costo (empresa_id, ref_origen) where ref_origen is not null;

-- ─────────────────────────── Asientos importados ───────────────────────────
alter table public.asientos
  add column ref_origen text,
  add column importado boolean not null default false;
create unique index asientos_ref_origen_uq on public.asientos (empresa_id, ref_origen) where ref_origen is not null;

-- ─────────────────────────── Documentos tributarios (compras, ventas, honorarios) ───────────────────────────
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio int not null,
  tipo text not null check (tipo in ('compra', 'venta', 'honorario')),
  ref_origen text,
  tipo_dte int,
  folio text,
  fecha date,
  rut text,
  razon_social text,
  neto numeric(14, 0) not null default 0,
  exento numeric(14, 0) not null default 0,
  iva numeric(14, 0) not null default 0,
  total numeric(14, 0) not null default 0,
  estado text,
  datos jsonb not null default '{}'::jsonb,
  asiento_id uuid references public.asientos (id) on delete set null,
  creado timestamptz not null default now()
);
create unique index documentos_ref_origen_uq on public.documentos (empresa_id, tipo, ref_origen) where ref_origen is not null;
create index documentos_empresa_anio_idx on public.documentos (empresa_id, anio, tipo, fecha);
alter table public.documentos enable row level security;
create policy documentos_ver on public.documentos for select to authenticated using (public.es_miembro(empresa_id));

create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio int not null,
  archivo text,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'completa')),
  resumen jsonb,
  creado_por uuid references auth.users (id) default auth.uid(),
  creado timestamptz not null default now(),
  terminado timestamptz
);
alter table public.importaciones enable row level security;
create policy importaciones_ver on public.importaciones for select to authenticated using (public.es_miembro(empresa_id));

-- Para listar usuarios de la empresa con su nombre y correo (embed miembros → perfiles)
alter table public.miembros add constraint miembros_perfil_fk foreign key (usuario_id) references public.perfiles (id) on delete cascade;

-- ─────────────────────────── Importación ───────────────────────────
-- Paso 1: valida que el año esté vacío, agrega las cuentas propias del respaldo que no
-- existan y los centros de costo (mapeados por su id original).
-- p_cuentas: [{"codigo","nombre","tipo","naturaleza"}]
-- p_centros: [{"ref","nivel","nombre","codigo","padre_ref","estado","fecha_inicio","curva","pcts","cuenta_costo"}]
create or replace function public.importar_iniciar(
  p_empresa uuid, p_anio int, p_archivo text, p_cuentas jsonb default '[]', p_centros jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; v_cod text; v_padre text; v_nuevas int := 0; v_cc int := 0;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede importar datos'; end if;
  if p_anio < 2000 or p_anio > 2100 then raise exception 'Año % no válido', p_anio; end if;
  if exists (select 1 from asientos where empresa_id = p_empresa and anio = p_anio) then
    raise exception 'El año % ya tiene asientos. Si es una importación anterior, elimínala primero.', p_anio;
  end if;
  delete from importaciones where empresa_id = p_empresa and anio = p_anio and estado = 'en_curso';

  for c in select * from jsonb_array_elements(coalesce(p_cuentas, '[]')) loop
    v_cod := regexp_replace(coalesce(c ->> 'codigo', ''), '[^0-9]', '', 'g');
    continue when v_cod = '' or coalesce(c ->> 'tipo', '') not in ('T', 'S', 'A', 'P', 'C', 'I');
    insert into cuentas (empresa_id, codigo, nombre, tipo, naturaleza, acepta_movimientos, acepta_centro_costo)
    values (p_empresa, v_cod, coalesce(nullif(trim(c ->> 'nombre'), ''), v_cod), c ->> 'tipo',
            nullif(c ->> 'naturaleza', '') , (c ->> 'tipo') not in ('T', 'S'), (c ->> 'tipo') in ('C', 'I'))
    on conflict (empresa_id, codigo) do nothing;
    if found then v_nuevas := v_nuevas + 1; end if;
  end loop;

  -- Centros: primero los principales (nivel 1), luego los subcentros
  for c in select * from jsonb_array_elements(coalesce(p_centros, '[]')) order by (value ->> 'nivel')::int loop
    continue when coalesce(c ->> 'ref', '') = '' or exists
      (select 1 from centros_costo where empresa_id = p_empresa and ref_origen = c ->> 'ref');
    v_cod := nullif(trim(coalesce(c ->> 'codigo', '')), '');
    if v_cod is null or exists (select 1 from centros_costo where empresa_id = p_empresa and codigo = v_cod) then
      v_cod := c ->> 'ref';
    end if;
    -- Un subcentro cuyo principal no viene en el respaldo queda como principal
    v_padre := case when (c ->> 'nivel') = '2' then
      (select codigo from centros_costo where empresa_id = p_empresa and ref_origen = c ->> 'padre_ref') end;
    insert into centros_costo (empresa_id, codigo, nombre, nivel, padre, estado, fecha_inicio, curva, pcts_capitalizacion, cuenta_costo, ref_origen)
    values (p_empresa, v_cod, coalesce(nullif(trim(c ->> 'nombre'), ''), v_cod),
      case when v_padre is null then 1 else 2 end, v_padre,
      coalesce(nullif(c ->> 'estado', ''), 'normal'),
      nullif(c ->> 'fecha_inicio', '')::date, nullif(c ->> 'curva', ''),
      case when jsonb_typeof(c -> 'pcts') = 'array' then c -> 'pcts' end,
      nullif(c ->> 'cuenta_costo', ''), c ->> 'ref');
    v_cc := v_cc + 1;
  end loop;

  insert into importaciones (empresa_id, anio, archivo, resumen)
  values (p_empresa, p_anio, p_archivo, jsonb_build_object('cuentas_nuevas', v_nuevas, 'centros_nuevos', v_cc))
  returning id into v_id;
  return v_id;
end $$;

-- Paso 2 (por lotes): asientos con su número original.
-- p_asientos: [{"numero","fecha","glosa","tipo","ref","anulado","motivo",
--               "lineas":[{"cuenta","debe","haber","glosa","cc","rut","tipo_dte","folio"}]}]
create or replace function public.importar_asientos(p_importacion uuid, p_asientos jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare imp record; a jsonb; v_id uuid; v_d numeric; v_h numeric; v_n int := 0; v_falta text;
begin
  select * into imp from importaciones where id = p_importacion;
  if not found or imp.estado <> 'en_curso' then raise exception 'La importación no existe o ya terminó'; end if;
  if not es_admin(imp.empresa_id) then raise exception 'Sólo un administrador puede importar datos'; end if;

  for a in select * from jsonb_array_elements(p_asientos) loop
    if extract(year from (a ->> 'fecha')::date)::int <> imp.anio then
      raise exception 'Asiento N°% (%): la fecha % no es del año %', a ->> 'numero', a ->> 'glosa', a ->> 'fecha', imp.anio;
    end if;
    select coalesce(sum((l ->> 'debe')::numeric), 0), coalesce(sum((l ->> 'haber')::numeric), 0)
      into v_d, v_h from jsonb_array_elements(a -> 'lineas') l;
    if v_d <> v_h then
      raise exception 'Asiento N°% (%) no cuadra: debe % y haber %', a ->> 'numero', a ->> 'glosa', v_d, v_h;
    end if;
    select string_agg(distinct l ->> 'cuenta', ', ') into v_falta from jsonb_array_elements(a -> 'lineas') l
      where not exists (select 1 from cuentas c where c.empresa_id = imp.empresa_id and c.codigo = l ->> 'cuenta');
    if v_falta is not null then
      raise exception 'Asiento N°% (%): las cuentas % no existen en el plan de cuentas', a ->> 'numero', a ->> 'glosa', v_falta;
    end if;

    insert into asientos (empresa_id, anio, numero, fecha, glosa, tipo, origen_id, ref_origen, importado,
                          anulado, anulado_en, motivo_anulacion, creado_por)
    values (imp.empresa_id, imp.anio, (a ->> 'numero')::int, (a ->> 'fecha')::date,
            coalesce(nullif(trim(a ->> 'glosa'), ''), 'Sin glosa'), coalesce(nullif(a ->> 'tipo', ''), 'manual'),
            nullif(a ->> 'origen_id', ''), nullif(a ->> 'ref', ''), true,
            coalesce((a ->> 'anulado')::boolean, false),
            case when coalesce((a ->> 'anulado')::boolean, false) then now() end,
            nullif(a ->> 'motivo', ''), auth.uid())
    returning id into v_id;

    insert into asiento_lineas (asiento_id, empresa_id, orden, cuenta, debe, haber, glosa, centro_costo, rut_auxiliar, tipo_dte, folio)
    select v_id, imp.empresa_id, x.ord::int, x.l ->> 'cuenta',
           coalesce((x.l ->> 'debe')::numeric, 0), coalesce((x.l ->> 'haber')::numeric, 0),
           nullif(x.l ->> 'glosa', ''),
           (select cc.codigo from centros_costo cc where cc.empresa_id = imp.empresa_id
              and (cc.ref_origen = x.l ->> 'cc' or cc.codigo = x.l ->> 'cc') limit 1),
           rut_normalizado(nullif(x.l ->> 'rut', '')),
           nullif(x.l ->> 'tipo_dte', '')::int, nullif(x.l ->> 'folio', '')
    from jsonb_array_elements(a -> 'lineas') with ordinality as x(l, ord);
    v_n := v_n + 1;
  end loop;
  return v_n;
exception when unique_violation then
  raise exception 'Número de asiento o referencia repetida en el respaldo: %', sqlerrm;
end $$;

-- Paso 3 (por lotes): documentos tributarios, enlazados al asiento que los contabiliza.
-- p_docs: [{"tipo","ref","asiento_ref","tipo_dte","folio","fecha","rut","razon_social","neto","exento","iva","total","estado","datos"}]
create or replace function public.importar_documentos(p_importacion uuid, p_docs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare imp record; v_n int;
begin
  select * into imp from importaciones where id = p_importacion;
  if not found or imp.estado <> 'en_curso' then raise exception 'La importación no existe o ya terminó'; end if;
  if not es_admin(imp.empresa_id) then raise exception 'Sólo un administrador puede importar datos'; end if;
  insert into documentos (empresa_id, anio, tipo, ref_origen, tipo_dte, folio, fecha, rut, razon_social,
                          neto, exento, iva, total, estado, datos, asiento_id)
  select imp.empresa_id, imp.anio, d ->> 'tipo', nullif(d ->> 'ref', ''), nullif(d ->> 'tipo_dte', '')::int,
         nullif(d ->> 'folio', ''), nullif(d ->> 'fecha', '')::date, rut_normalizado(nullif(d ->> 'rut', '')),
         nullif(d ->> 'razon_social', ''),
         round(coalesce((d ->> 'neto')::numeric, 0)), round(coalesce((d ->> 'exento')::numeric, 0)),
         round(coalesce((d ->> 'iva')::numeric, 0)), round(coalesce((d ->> 'total')::numeric, 0)),
         nullif(d ->> 'estado', ''), coalesce(d -> 'datos', '{}'::jsonb),
         (select s.id from asientos s where s.empresa_id = imp.empresa_id and s.ref_origen = d ->> 'asiento_ref')
  from jsonb_array_elements(p_docs) d
  on conflict (empresa_id, tipo, ref_origen) where ref_origen is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Paso 4: correlativo, cierres de mes y resumen.
-- p_cierres: ["2026-01","2026-02"]
create or replace function public.importar_finalizar(p_importacion uuid, p_cierres jsonb, p_resumen jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare imp record; v_max int;
begin
  select * into imp from importaciones where id = p_importacion;
  if not found or imp.estado <> 'en_curso' then raise exception 'La importación no existe o ya terminó'; end if;
  if not es_admin(imp.empresa_id) then raise exception 'Sólo un administrador puede importar datos'; end if;
  select coalesce(max(numero), 0) into v_max from asientos where empresa_id = imp.empresa_id and anio = imp.anio;
  insert into correlativos (empresa_id, anio, ultimo) values (imp.empresa_id, imp.anio, v_max)
  on conflict (empresa_id, anio) do update set ultimo = greatest(correlativos.ultimo, excluded.ultimo);
  insert into periodos_cerrados (empresa_id, periodo, cerrado_por)
  select imp.empresa_id, p, auth.uid() from jsonb_array_elements_text(coalesce(p_cierres, '[]')) p
  where p ~ ('^' || imp.anio || '-(0[1-9]|1[0-2])$')
  on conflict do nothing;
  update importaciones set estado = 'completa', terminado = now(), resumen = coalesce(resumen, '{}') || coalesce(p_resumen, '{}')
  where id = p_importacion;
  insert into auditoria (empresa_id, accion, detalle)
  values (imp.empresa_id, 'importar_respaldo', jsonb_build_object('anio', imp.anio, 'archivo', imp.archivo, 'resumen', p_resumen));
end $$;

-- Vía de escape para rehacer una importación: borra SÓLO datos importados de ese año.
-- Si el año ya tiene asientos registrados en el sistema nuevo, se niega.
create or replace function public.eliminar_importacion(p_empresa uuid, p_anio int)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede eliminar una importación'; end if;
  if exists (select 1 from asientos where empresa_id = p_empresa and anio = p_anio and not importado) then
    raise exception 'El año % tiene asientos registrados en el sistema nuevo; no se puede eliminar la importación', p_anio;
  end if;
  delete from documentos where empresa_id = p_empresa and anio = p_anio;
  delete from asientos where empresa_id = p_empresa and anio = p_anio and importado;
  get diagnostics v_n = row_count;
  delete from periodos_cerrados where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from correlativos where empresa_id = p_empresa and anio = p_anio;
  delete from importaciones where empresa_id = p_empresa and anio = p_anio;
  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'eliminar_importacion', jsonb_build_object('anio', p_anio, 'asientos', v_n));
  return v_n;
end $$;

-- ─────────────────────────── Balance ───────────────────────────
-- Sumas y saldos por cuenta en un rango de fechas (excluye anulados). Respeta el RLS del usuario.
create or replace function public.balance_comprobacion(p_empresa uuid, p_desde date, p_hasta date)
returns table (cuenta text, nombre text, tipo char(1), debe numeric, haber numeric)
language sql stable security invoker set search_path = public as $$
  select l.cuenta, c.nombre, c.tipo, sum(l.debe), sum(l.haber)
  from asiento_lineas l
  join asientos a on a.id = l.asiento_id
  join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.empresa_id = p_empresa and not a.anulado and a.fecha between p_desde and p_hasta
  group by l.cuenta, c.nombre, c.tipo
  order by l.cuenta
$$;

-- ─────────────────────────── Privilegios ───────────────────────────
revoke all on public.documentos, public.importaciones from anon, authenticated;
grant select on public.documentos, public.importaciones to authenticated;

-- Columnas editables (la identidad de la empresa y la membresía no se cambian por UPDATE directo)
revoke update on public.empresas, public.miembros, public.cuentas, public.centros_costo from authenticated;
grant update (razon_social, giro, domicilio, comuna, ciudad, representante, rut_representante) on public.empresas to authenticated;
grant update (rol, estado, permisos) on public.miembros to authenticated;
grant update (nombre, naturaleza, tipo_auxiliar, tipo_iva, acepta_centro_costo, requiere_centro_costo, activa) on public.cuentas to authenticated;
grant update (nombre, activo, estado, fecha_inicio, curva, pcts_capitalizacion, cuenta_costo) on public.centros_costo to authenticated;

revoke execute on function public.importar_iniciar(uuid, int, text, jsonb, jsonb), public.importar_asientos(uuid, jsonb),
  public.importar_documentos(uuid, jsonb), public.importar_finalizar(uuid, jsonb, jsonb),
  public.eliminar_importacion(uuid, int), public.balance_comprobacion(uuid, date, date) from public, anon;
grant execute on function public.importar_iniciar(uuid, int, text, jsonb, jsonb), public.importar_asientos(uuid, jsonb),
  public.importar_documentos(uuid, jsonb), public.importar_finalizar(uuid, jsonb, jsonb),
  public.eliminar_importacion(uuid, int), public.balance_comprobacion(uuid, date, date) to authenticated;
