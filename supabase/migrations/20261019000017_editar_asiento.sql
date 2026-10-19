-- Edición de un comprobante desde el libro diario: cambia fecha, glosa y líneas conservando el número.
-- La versión anterior queda en auditoría. Las validaciones contables son las mismas de crear_asiento.
--
-- No se permite: asientos anulados, de cierre o de apertura (la apertura se edita en Configuración),
-- cambiar de año (el número es correlativo por año) ni tocar meses cerrados (ni el de origen ni el de destino).
-- Si el asiento tiene un documento (compra/venta/honorario), el documento no se modifica: la pantalla
-- advierte cuando los montos dejan de coincidir con él.
create or replace function public.editar_asiento(p_id uuid, p_fecha date, p_glosa text, p_lineas jsonb, p_motivo text default null)
returns table (asiento_id uuid, numero int) language plpgsql security definer set search_path = public as $$
declare
  a record; c record; l jsonb; i int := 0;
  v_debe numeric := 0; v_haber numeric := 0; v_d numeric; v_h numeric; v_cc text; v_rut text; v_dte text;
  v_anteriores jsonb;
begin
  select * into a from asientos where id = p_id for update;
  if not found then raise exception 'El asiento no existe'; end if;
  if not puede_escribir(a.empresa_id) then raise exception 'No tienes permiso para editar asientos en esta empresa'; end if;
  if a.anulado then raise exception 'El asiento N° % está anulado y no se puede editar', a.numero; end if;
  if a.tipo = 'cierre' then raise exception 'El asiento de cierre no se edita: reabre el ejercicio'; end if;
  if a.tipo = 'apertura' then raise exception 'La apertura se edita en Configuración → Balance de apertura'; end if;
  if length(trim(coalesce(p_glosa, ''))) = 0 then raise exception 'Ingresa la glosa'; end if;
  if extract(year from p_fecha)::int <> a.anio then
    raise exception 'La fecha debe quedar en el año % (el número del comprobante es correlativo por año)', a.anio;
  end if;
  if periodo_cerrado(a.empresa_id, a.fecha) then raise exception 'El período % está cerrado', to_char(a.fecha, 'YYYY-MM'); end if;
  if periodo_cerrado(a.empresa_id, p_fecha) then raise exception 'El período % está cerrado', to_char(p_fecha, 'YYYY-MM'); end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'El asiento debe tener al menos dos líneas';
  end if;

  for l in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_d := coalesce((l ->> 'debe')::numeric, 0); v_h := coalesce((l ->> 'haber')::numeric, 0);
    if v_d < 0 or v_h < 0 or (v_d > 0 and v_h > 0) or (v_d = 0 and v_h = 0) then
      raise exception 'Línea %: indica un monto al debe o al haber', i;
    end if;
    if v_d <> round(v_d) or v_h <> round(v_h) then raise exception 'Línea %: los montos van en pesos enteros', i; end if;
    select * into c from cuentas where empresa_id = a.empresa_id and codigo = l ->> 'cuenta';
    if not found then raise exception 'Línea %: la cuenta % no existe en el plan de cuentas', i, l ->> 'cuenta'; end if;
    if not c.activa then raise exception 'Línea %: la cuenta % está inactiva', i, c.codigo; end if;
    if not c.acepta_movimientos then raise exception 'Línea %: la cuenta % es agrupadora y no acepta movimientos', i, c.codigo; end if;
    v_cc := nullif(trim(coalesce(l ->> 'centro_costo', '')), '');
    if c.requiere_centro_costo and v_cc is null then raise exception 'Línea %: la cuenta % exige centro de costo', i, c.codigo; end if;
    if v_cc is not null and not c.acepta_centro_costo then raise exception 'Línea %: la cuenta % no admite centro de costo', i, c.codigo; end if;
    v_rut := nullif(trim(coalesce(l ->> 'rut_auxiliar', '')), '');
    if c.tipo_auxiliar is not null and v_rut is null then
      raise exception 'Línea %: la cuenta % requiere auxiliar (%)', i, c.codigo, c.tipo_auxiliar;
    end if;
    if v_rut is not null and not rut_valido(v_rut) then raise exception 'Línea %: el RUT % no es válido', i, v_rut; end if;
    v_dte := nullif(trim(coalesce(l ->> 'tipo_dte', '')), '');
    if v_dte is not null and v_dte !~ '^[0-9]{1,3}$' then raise exception 'Línea %: el tipo de documento % no es válido', i, v_dte; end if;
    v_debe := v_debe + v_d; v_haber := v_haber + v_h;
  end loop;
  if v_debe <> v_haber then
    raise exception 'El asiento no cuadra: debe % y haber % (diferencia %)', v_debe, v_haber, v_debe - v_haber;
  end if;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cuenta', x.cuenta, 'debe', x.debe, 'haber', x.haber, 'glosa', x.glosa,
           'cc', x.centro_costo, 'rut', x.rut_auxiliar, 'dte', x.tipo_dte, 'folio', x.folio)) order by x.orden)
    into v_anteriores from asiento_lineas x where x.asiento_id = p_id;
  delete from asiento_lineas where asiento_lineas.asiento_id = p_id;
  update asientos set fecha = p_fecha, glosa = trim(p_glosa) where id = p_id;

  i := 0;
  for l in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into asiento_lineas (asiento_id, empresa_id, orden, cuenta, debe, haber, glosa, centro_costo, rut_auxiliar, tipo_dte, folio)
    values (p_id, a.empresa_id, i, l ->> 'cuenta', coalesce((l ->> 'debe')::numeric, 0), coalesce((l ->> 'haber')::numeric, 0),
            nullif(trim(coalesce(l ->> 'glosa', '')), ''), nullif(trim(coalesce(l ->> 'centro_costo', '')), ''),
            rut_normalizado(nullif(trim(coalesce(l ->> 'rut_auxiliar', '')), '')),
            nullif(trim(coalesce(l ->> 'tipo_dte', '')), '')::int, nullif(trim(coalesce(l ->> 'folio', '')), ''));
  end loop;

  insert into auditoria (empresa_id, accion, detalle)
  values (a.empresa_id, 'editar_asiento', jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'numero', a.numero, 'anio', a.anio, 'motivo', nullif(trim(coalesce(p_motivo, '')), ''),
    'antes', jsonb_build_object('fecha', a.fecha, 'glosa', a.glosa, 'lineas', v_anteriores),
    'despues', jsonb_build_object('fecha', p_fecha, 'glosa', trim(p_glosa), 'monto', v_debe))));
  return query select p_id, a.numero;
end $$;

revoke execute on function public.editar_asiento(uuid, date, text, jsonb, text) from public, anon;
grant execute on function public.editar_asiento(uuid, date, text, jsonb, text) to authenticated;
