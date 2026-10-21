-- Validador de documentos duplicados entre el RCV y los registros manuales (asiento manual, Nuevo documento,
-- boletas de honorarios): un mismo RUT + tipo + folio no se puede registrar dos veces en el libro, venga de donde venga.
-- El folio se compara normalizado (sin espacios ni ceros a la izquierda: "000518778" = "518778").

create or replace function public.folio_normalizado(p_folio text)
returns text language sql immutable as $$
  select coalesce(nullif(regexp_replace(upper(regexp_replace(coalesce(p_folio, ''), '\s', '', 'g')), '^0+', ''), ''), '0')
$$;

create index if not exists documentos_clave_idx on public.documentos (empresa_id, tipo, rut, tipo_dte);

-- Documento vigente ya registrado con esa clave: de dónde vino y en qué asiento quedó (respeta RLS).
create or replace function public.documento_registrado(p_empresa uuid, p_tipo text, p_rut text, p_tipo_dte int, p_folio text)
returns table (documento_id uuid, asiento_numero int, fecha date, razon_social text, origen text)
language sql stable security invoker set search_path = public as $$
  select d.id, a.numero, d.fecha, d.razon_social,
         case when d.ref_origen is not null then 'respaldo del sistema anterior'
              when d.datos ->> 'origenRegistro' = 'asiento manual' then 'asiento manual'
              when d.datos ->> 'origenRegistro' = 'manual' then 'registro manual'
              when d.tipo = 'honorario' then 'boleta de honorarios'
              else 'RCV' end
  from documentos d left join asientos a on a.id = d.asiento_id
  where d.empresa_id = p_empresa and d.tipo = p_tipo and d.rut = rut_normalizado(p_rut)
    and d.tipo_dte = p_tipo_dte and folio_normalizado(d.folio) = folio_normalizado(p_folio)
    and coalesce(d.estado, '') <> 'anulado'
  order by d.creado limit 1
$$;
revoke execute on function public.documento_registrado(uuid, text, text, int, text) from public, anon;
grant execute on function public.documento_registrado(uuid, text, text, int, text) to authenticated;

-- registrar_documento: misma lógica, con la clave normalizada, un candado por documento (dos registros simultáneos
-- no pasan los dos) y un mensaje que dice dónde está el registro anterior.
create or replace function public.registrar_documento(p_empresa uuid, p_doc jsonb, p_asiento jsonb)
returns table (documento_id uuid, asiento_id uuid, numero int)
language plpgsql security definer set search_path = public as $$
declare v_tipo text := p_doc ->> 'tipo'; v_rut text := rut_normalizado(p_doc ->> 'rut');
        v_doc uuid; v_as uuid; v_num int; v_fecha date := nullif(p_doc ->> 'fecha', '')::date; v_lineas jsonb;
        v_prev_num int; v_prev_origen text; v_prev_fecha date;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para registrar documentos en esta empresa'; end if;
  if v_tipo not in ('compra', 'venta', 'honorario') then raise exception 'Tipo de documento no válido'; end if;
  if v_rut is null or not rut_valido(v_rut) then raise exception 'RUT % no válido', p_doc ->> 'rut'; end if;
  if v_fecha is null then raise exception 'Falta la fecha del documento'; end if;
  perform pg_advisory_xact_lock(hashtext(p_empresa::text || v_tipo || v_rut || (p_doc ->> 'tipo_dte') || folio_normalizado(p_doc ->> 'folio')));
  select r.asiento_numero, r.origen, r.fecha into v_prev_num, v_prev_origen, v_prev_fecha
  from documento_registrado(p_empresa, v_tipo, v_rut, (p_doc ->> 'tipo_dte')::int, p_doc ->> 'folio') r;
  if found then
    raise exception 'Documento duplicado: el tipo % N° % de % ya está registrado (%, asiento N° %, %). No se registró de nuevo.',
      p_doc ->> 'tipo_dte', p_doc ->> 'folio', v_rut, v_prev_origen, coalesce(v_prev_num::text, 's/n'), to_char(v_prev_fecha, 'DD/MM/YYYY');
  end if;

  -- Las líneas del motor usan "rut" y "cc"; crear_asiento espera "rut_auxiliar" y "centro_costo" (ya traducido)
  select jsonb_agg((l - 'cc' - 'centro_costo') || jsonb_strip_nulls(jsonb_build_object(
           'rut_auxiliar', coalesce(l ->> 'rut_auxiliar', l ->> 'rut'),
           'centro_costo', centro_costo_codigo(p_empresa, coalesce(nullif(l ->> 'centro_costo', ''), l ->> 'cc')))))
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



-- rcv_resumen: un documento del RCV cuenta como registrado con la misma clave normalizada.
create or replace function public.rcv_resumen(p_empresa uuid, p_tipo text)
returns table (periodo text, archivo text, total int, pendientes int, actualizado timestamptz)
language sql stable security invoker set search_path = public as $$
  select c.periodo::text, c.archivo, jsonb_array_length(c.docs),
         (select count(*)::int from jsonb_array_elements(c.docs) d
          where not exists (select 1 from documentos x
                            where x.empresa_id = c.empresa_id and x.tipo = c.tipo
                              and x.rut = rut_normalizado((d ->> 'rutCodigo') || (d ->> 'rutDV'))
                              and x.tipo_dte = (d ->> 'tipoDTE')::int and folio_normalizado(x.folio) = folio_normalizado(d ->> 'numero')
                              and coalesce(x.estado, '') <> 'anulado')),
         c.actualizado
  from rcv_cargas c
  where c.empresa_id = p_empresa and c.tipo = p_tipo
  order by c.periodo desc
$$;
