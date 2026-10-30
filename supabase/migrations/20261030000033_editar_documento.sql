-- Edición de un documento ya registrado (por ahora, ventas desde el libro): cambia sus datos y rehace su asiento
-- conservando el número (con editar_asiento: mismas validaciones, mismo año, meses abiertos y la versión anterior
-- del asiento en auditoría). El servidor de la app recalcula las líneas con el motor contable.
-- Los datos que no se envían (registro SII, detalle del RCV, origen...) se conservan.
create or replace function public.editar_documento(p_id uuid, p_doc jsonb, p_asiento jsonb, p_motivo text default null)
returns table (documento_id uuid, asiento_id uuid, numero int)
language plpgsql security definer set search_path = public as $$
declare
  d record; v_rut text := rut_normalizado(p_doc ->> 'rut'); v_fecha date := nullif(p_doc ->> 'fecha', '')::date;
  v_dte int := (p_doc ->> 'tipo_dte')::int; v_folio text := nullif(trim(coalesce(p_doc ->> 'folio', '')), '');
  v_lineas jsonb; v_num int; v_prev_num int; v_prev_origen text; v_prev_fecha date; v_prev_id uuid;
begin
  select * into d from documentos where id = p_id for update;
  if not found then raise exception 'El documento no existe'; end if;
  if not puede_escribir(d.empresa_id) then raise exception 'No tienes permiso para editar documentos en esta empresa'; end if;
  if coalesce(d.estado, '') = 'anulado' then raise exception 'El documento está anulado y no se puede editar'; end if;
  if d.tipo not in ('venta', 'compra') then raise exception 'Este tipo de documento no se edita aquí'; end if;
  if d.asiento_id is null then raise exception 'El documento no tiene asiento: anúlalo y regístralo de nuevo'; end if;
  if v_rut is null or not rut_valido(v_rut) then raise exception 'RUT % no válido', p_doc ->> 'rut'; end if;
  if v_fecha is null then raise exception 'Falta la fecha del documento'; end if;
  if v_folio is null then raise exception 'Falta el N° del documento'; end if;

  -- Si cambia la clave (RUT, tipo o folio), no puede chocar con otro documento vigente
  if v_rut <> d.rut or v_dte is distinct from d.tipo_dte or folio_normalizado(v_folio) <> folio_normalizado(d.folio) then
    perform pg_advisory_xact_lock(hashtext(d.empresa_id::text || d.tipo || v_rut || v_dte::text || folio_normalizado(v_folio)));
    select r.documento_id, r.asiento_numero, r.origen, r.fecha into v_prev_id, v_prev_num, v_prev_origen, v_prev_fecha
    from documento_registrado(d.empresa_id, d.tipo, v_rut, v_dte, v_folio) r;
    if found and v_prev_id <> p_id then
      raise exception 'Documento duplicado: el tipo % N° % de % ya está registrado (%, asiento N° %, %).',
        v_dte, v_folio, v_rut, v_prev_origen, coalesce(v_prev_num::text, 's/n'), to_char(v_prev_fecha, 'DD/MM/YYYY');
    end if;
  end if;

  -- Líneas del motor ("rut", "cc") al formato de los asientos
  select jsonb_agg((l - 'cc' - 'centro_costo' - 'rut') || jsonb_strip_nulls(jsonb_build_object(
           'rut_auxiliar', coalesce(l ->> 'rut_auxiliar', l ->> 'rut'),
           'centro_costo', centro_costo_codigo(d.empresa_id, coalesce(nullif(l ->> 'centro_costo', ''), l ->> 'cc')))))
    into v_lineas from jsonb_array_elements(p_asiento -> 'lineas') l;
  select e.numero into v_num from editar_asiento(d.asiento_id, (p_asiento ->> 'fecha')::date, p_asiento ->> 'glosa', v_lineas,
    coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'Edición del documento ' || v_dte || ' N° ' || v_folio)) e;

  update documentos set
    anio = extract(year from (p_asiento ->> 'fecha')::date)::int, tipo_dte = v_dte, folio = v_folio, fecha = v_fecha, rut = v_rut,
    razon_social = nullif(trim(p_doc ->> 'razon_social'), ''),
    neto = round(coalesce((p_doc ->> 'neto')::numeric, 0)), exento = round(coalesce((p_doc ->> 'exento')::numeric, 0)),
    iva = round(coalesce((p_doc ->> 'iva')::numeric, 0)), total = round(coalesce((p_doc ->> 'total')::numeric, 0)),
    datos = datos || coalesce(p_doc -> 'datos', '{}'::jsonb)
  where id = p_id;

  insert into auditoria (empresa_id, accion, detalle)
  values (d.empresa_id, 'editar_documento', jsonb_strip_nulls(jsonb_build_object('documento', p_id, 'tipo', d.tipo, 'asiento', v_num,
    'motivo', nullif(trim(coalesce(p_motivo, '')), ''),
    'antes', jsonb_build_object('tipo_dte', d.tipo_dte, 'folio', d.folio, 'fecha', d.fecha, 'rut', d.rut, 'razon_social', d.razon_social,
      'neto', d.neto, 'exento', d.exento, 'iva', d.iva, 'total', d.total, 'formaPago', d.datos ->> 'formaPago', 'cuentaIngreso', d.datos ->> 'cuentaIngreso'),
    'despues', jsonb_build_object('tipo_dte', v_dte, 'folio', v_folio, 'fecha', v_fecha, 'rut', v_rut, 'total', p_doc ->> 'total',
      'formaPago', p_doc -> 'datos' ->> 'formaPago', 'cuentaIngreso', p_doc -> 'datos' ->> 'cuentaIngreso'))));
  return query select p_id, d.asiento_id, v_num;
end $$;

revoke execute on function public.editar_documento(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.editar_documento(uuid, jsonb, jsonb, text) to authenticated;
