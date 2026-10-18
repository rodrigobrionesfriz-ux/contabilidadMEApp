-- Contabilidad ME · fase 3: honorarios, auxiliares y pagos.

-- Honorarios: la boleta se registra como documento (tipo 'honorario', DTE 70 con retención / 71 sin).
create or replace function public.registrar_documento(p_empresa uuid, p_doc jsonb, p_asiento jsonb)
returns table (documento_id uuid, asiento_id uuid, numero int)
language plpgsql security definer set search_path = public as $$
declare v_tipo text := p_doc ->> 'tipo'; v_rut text := rut_normalizado(p_doc ->> 'rut');
        v_doc uuid; v_as uuid; v_num int; v_fecha date := nullif(p_doc ->> 'fecha', '')::date; v_lineas jsonb;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para registrar documentos en esta empresa'; end if;
  if v_tipo not in ('compra', 'venta', 'honorario') then raise exception 'Tipo de documento no válido'; end if;
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

-- Movimientos de las cuentas auxiliares (clientes, proveedores, honorarios) en un rango.
-- Excluye anulados. Respeta el RLS de quien consulta.
create or replace function public.movimientos_auxiliar(p_empresa uuid, p_tipo_auxiliar text, p_desde date, p_hasta date)
returns table (cuenta text, rut text, tipo_dte int, folio text, fecha date, numero int, glosa text, debe numeric, haber numeric)
language sql stable security invoker set search_path = public as $$
  select l.cuenta, l.rut_auxiliar, l.tipo_dte, l.folio, a.fecha, a.numero, coalesce(l.glosa, a.glosa), l.debe, l.haber
  from asiento_lineas l
  join asientos a on a.id = l.asiento_id
  join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.empresa_id = p_empresa and c.tipo_auxiliar = p_tipo_auxiliar and c.tipo in ('A', 'P') and not a.anulado
    and a.fecha between p_desde and p_hasta
  order by a.fecha, a.numero, l.orden
$$;

revoke execute on function public.movimientos_auxiliar(uuid, text, date, date) from public, anon;
grant execute on function public.movimientos_auxiliar(uuid, text, date, date) to authenticated;
