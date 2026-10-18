-- Contabilidad ME · fase 2: registro de compras y ventas (RCV o manual).
-- El documento y su asiento se crean en una sola transacción; nunca queda uno sin el otro.

-- Período del libro (YYYY-MM): en compras puede diferir del mes de emisión (documento atrasado).
alter table public.documentos add column periodo char(7);
create or replace function public.tg_documento_periodo()
returns trigger language plpgsql as $$
begin
  new.periodo := coalesce(nullif(new.datos ->> 'periodoContable', ''), to_char(new.fecha, 'YYYY-MM'));
  return new;
end $$;
create trigger documentos_periodo before insert or update of datos, fecha on public.documentos
  for each row execute function public.tg_documento_periodo();
update public.documentos set periodo = coalesce(nullif(datos ->> 'periodoContable', ''), to_char(fecha, 'YYYY-MM'));
create index documentos_periodo_idx on public.documentos (empresa_id, tipo, periodo);

create index documentos_clave_idx on public.documentos (empresa_id, tipo, rut, tipo_dte, folio);
alter table public.documentos add column anulado_en timestamptz, add column motivo_anulacion text;

-- p_doc: {"tipo","ref","tipo_dte","folio","fecha","rut","razon_social","neto","exento","iva","total","datos"}
-- p_asiento: {"fecha","glosa","lineas":[...]} (mismo formato que crear_asiento)
create or replace function public.registrar_documento(p_empresa uuid, p_doc jsonb, p_asiento jsonb)
returns table (documento_id uuid, asiento_id uuid, numero int)
language plpgsql security definer set search_path = public as $$
declare v_tipo text := p_doc ->> 'tipo'; v_rut text := rut_normalizado(p_doc ->> 'rut');
        v_doc uuid; v_as uuid; v_num int; v_fecha date := nullif(p_doc ->> 'fecha', '')::date; v_lineas jsonb;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para registrar documentos en esta empresa'; end if;
  if v_tipo not in ('compra', 'venta') then raise exception 'Tipo de documento no válido'; end if;
  if v_rut is null or not rut_valido(v_rut) then raise exception 'RUT % no válido', p_doc ->> 'rut'; end if;
  if v_fecha is null then raise exception 'Falta la fecha del documento'; end if;
  if exists (select 1 from documentos d where d.empresa_id = p_empresa and d.tipo = v_tipo and d.rut = v_rut
             and d.tipo_dte = (p_doc ->> 'tipo_dte')::int and d.folio = p_doc ->> 'folio'
             and coalesce(d.estado, '') <> 'anulado') then
    raise exception 'El documento % N° % de % ya está registrado', p_doc ->> 'tipo_dte', p_doc ->> 'folio', v_rut;
  end if;

  -- Las líneas del motor usan "rut" y "cc"; crear_asiento espera "rut_auxiliar" y "centro_costo"
  select jsonb_agg(l || jsonb_strip_nulls(jsonb_build_object('rut_auxiliar', coalesce(l ->> 'rut_auxiliar', l ->> 'rut'),
                                                             'centro_costo', coalesce(l ->> 'centro_costo', l ->> 'cc'))))
    into v_lineas from jsonb_array_elements(p_asiento -> 'lineas') l;
  select c.id, c.numero into v_as, v_num
  from crear_asiento(p_empresa, (p_asiento ->> 'fecha')::date, p_asiento ->> 'glosa', v_lineas, v_tipo, p_doc ->> 'ref') c;

  insert into documentos (empresa_id, anio, tipo, ref_origen, tipo_dte, folio, fecha, rut, razon_social,
                          neto, exento, iva, total, estado, datos, asiento_id)
  values (p_empresa, extract(year from (p_asiento ->> 'fecha')::date)::int, v_tipo, null,
          (p_doc ->> 'tipo_dte')::int, p_doc ->> 'folio', v_fecha, v_rut, nullif(trim(p_doc ->> 'razon_social'), ''),
          round(coalesce((p_doc ->> 'neto')::numeric, 0)), round(coalesce((p_doc ->> 'exento')::numeric, 0)),
          round(coalesce((p_doc ->> 'iva')::numeric, 0)), round(coalesce((p_doc ->> 'total')::numeric, 0)),
          'activo', coalesce(p_doc -> 'datos', '{}'::jsonb), v_as)
  returning id into v_doc;

  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'registrar_documento', jsonb_build_object('documento', v_doc, 'tipo', v_tipo, 'tipo_dte', p_doc ->> 'tipo_dte',
          'folio', p_doc ->> 'folio', 'rut', v_rut, 'asiento', v_num));
  return query select v_doc, v_as, v_num;
end $$;

-- Anular un documento: anula su asiento (conserva el número) y lo marca anulado.
create or replace function public.anular_documento(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from documentos where id = p_id for update;
  if not found then raise exception 'El documento no existe'; end if;
  if not puede_escribir(d.empresa_id) then raise exception 'No tienes permiso para anular documentos en esta empresa'; end if;
  if d.estado = 'anulado' then raise exception 'El documento ya está anulado'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Indica el motivo de la anulación'; end if;
  if d.asiento_id is not null and exists (select 1 from asientos where id = d.asiento_id and not anulado) then
    perform anular_asiento(d.asiento_id, 'Documento anulado: ' || trim(p_motivo));
  end if;
  update documentos set estado = 'anulado', anulado_en = now(), motivo_anulacion = trim(p_motivo) where id = p_id;
  insert into auditoria (empresa_id, accion, detalle)
  values (d.empresa_id, 'anular_documento', jsonb_build_object('documento', p_id, 'folio', d.folio, 'motivo', p_motivo));
end $$;

revoke execute on function public.registrar_documento(uuid, jsonb, jsonb), public.anular_documento(uuid, text) from public, anon;
grant execute on function public.registrar_documento(uuid, jsonb, jsonb), public.anular_documento(uuid, text) to authenticated;
