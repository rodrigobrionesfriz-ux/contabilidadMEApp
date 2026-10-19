-- Centros de costo al contabilizar documentos (RCV, compras, ventas, honorarios).
-- (Antes 0018 en el cambio 10i; renumerada a 0020 porque la 0019 ya estaba aplicada. Es idempotente:
--  create or replace y correcciones de datos que no hacen nada si ya se aplicaron.)
--
-- Problema: los documentos importados del sistema anterior guardan en datos.dist[].cc el id interno de ese
-- sistema (p. ej. "cc_mu188amoxkl"), no el código nuevo (p. ej. "AGRI"). La importación RCV propone la última
-- cuenta y centro usados por RUT desde esos datos, y crear_asiento terminaba en
-- 'insert or update on table "asiento_lineas" violates foreign key constraint'.

-- 1. Código del centro de costo a partir del código o del id del sistema anterior (ref_origen).
--    Vacío = sin centro. Si no existe, error claro en vez de la violación de clave foránea.
create or replace function public.centro_costo_codigo(p_empresa uuid, p_cc text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text := nullif(trim(coalesce(p_cc, '')), ''); r text;
begin
  if v is null then return null; end if;
  select codigo into r from centros_costo where empresa_id = p_empresa and (codigo = v or ref_origen = v)
  order by (codigo = v) desc limit 1;
  if r is null then raise exception 'El centro de costo "%" no existe en esta empresa: elige otro en la línea', v; end if;
  return r;
end $$;
revoke execute on function public.centro_costo_codigo(uuid, text) from public, anon;
grant execute on function public.centro_costo_codigo(uuid, text) to authenticated;

-- 2. registrar_documento traduce el centro de costo de cada línea antes de crear el asiento.
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

-- 3. Corrige una vez los documentos ya importados: datos.dist[].cc y datos.cc con el id antiguo pasan al código.
update public.documentos d
set datos = jsonb_set(d.datos, '{dist}', (
  select jsonb_agg(case
    when e ? 'cc' and exists (select 1 from centros_costo c where c.empresa_id = d.empresa_id and c.ref_origen = e ->> 'cc')
    then jsonb_set(e, '{cc}', to_jsonb((select c.codigo from centros_costo c where c.empresa_id = d.empresa_id and c.ref_origen = e ->> 'cc' limit 1)))
    else e end order by o)
  from jsonb_array_elements(d.datos -> 'dist') with ordinality x(e, o)))
where jsonb_typeof(d.datos -> 'dist') = 'array'
  and exists (select 1 from jsonb_array_elements(d.datos -> 'dist') e
              join centros_costo c on c.empresa_id = d.empresa_id and c.ref_origen = e ->> 'cc');

update public.documentos d
set datos = jsonb_set(d.datos, '{cc}', to_jsonb(c.codigo))
from public.centros_costo c
where c.empresa_id = d.empresa_id and c.ref_origen = d.datos ->> 'cc';
