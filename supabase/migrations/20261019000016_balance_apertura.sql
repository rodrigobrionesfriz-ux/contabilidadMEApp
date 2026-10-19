-- Balance de apertura (asiento N° 0) ingresado o corregido a mano desde Configuración.
-- Complementa a generar_apertura (que lo arma desde el cierre del año anterior en este sistema):
-- sirve para el primer año en el sistema, para empresas que vienen de otro software o para corregirlo.
--
-- Reglas:
--  * Sólo cuentas de balance (grupos 1 y 2), imputables y activas; las cuentas con auxiliar exigen RUT.
--    El tipo de DTE y el folio son opcionales y permiten que el saldo inicial quede por documento.
--  * Debe cuadrar y tener al menos dos líneas, en pesos enteros.
--  * Si el año ya tiene una apertura vigente, se reemplazan sus líneas conservando el número
--    (queda la versión anterior en auditoría). Si no, se crea como N° 0 (o el siguiente número si el 0
--    lo ocupa un asiento anulado).
--  * No se permite con enero cerrado ni con el ejercicio cerrado.
create or replace function public.guardar_apertura(p_empresa uuid, p_anio int, p_glosa text, p_lineas jsonb)
returns table (asiento_id uuid, numero int, nuevo boolean) language plpgsql security definer set search_path = public as $$
declare
  v_fecha date := make_date(p_anio, 1, 1); c record; l jsonb; i int := 0;
  v_d numeric; v_h numeric; v_debe numeric := 0; v_haber numeric := 0; v_rut text; v_dte text;
  v_glosa text := coalesce(nullif(trim(p_glosa), ''), 'Balance de apertura ' || p_anio);
  v_anteriores jsonb; v_id uuid; v_num int; v_nuevo boolean := false;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para registrar la apertura'; end if;
  if p_anio < 1990 or p_anio > 2100 then raise exception 'Año no válido'; end if;
  if periodo_cerrado(p_empresa, v_fecha) then raise exception 'Enero de % está cerrado: reábrelo para cambiar la apertura', p_anio; end if;
  if ejercicio_cerrado(p_empresa, p_anio) then raise exception 'El ejercicio % está cerrado: reábrelo para cambiar la apertura', p_anio; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'La apertura debe tener al menos dos líneas';
  end if;

  for l in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_d := coalesce((l ->> 'debe')::numeric, 0); v_h := coalesce((l ->> 'haber')::numeric, 0);
    if v_d < 0 or v_h < 0 or (v_d > 0 and v_h > 0) or (v_d = 0 and v_h = 0) then
      raise exception 'Línea %: indica un monto al debe o al haber', i;
    end if;
    if v_d <> round(v_d) or v_h <> round(v_h) then raise exception 'Línea %: los montos van en pesos enteros', i; end if;
    select * into c from cuentas where empresa_id = p_empresa and codigo = l ->> 'cuenta';
    if not found then raise exception 'Línea %: la cuenta % no existe en el plan de cuentas', i, l ->> 'cuenta'; end if;
    if c.codigo !~ '^[12]' then raise exception 'Línea %: la cuenta % no es de balance (la apertura sólo lleva cuentas 1 y 2)', i, c.codigo; end if;
    if not c.activa then raise exception 'Línea %: la cuenta % está inactiva', i, c.codigo; end if;
    if not c.acepta_movimientos then raise exception 'Línea %: la cuenta % es agrupadora y no acepta movimientos', i, c.codigo; end if;
    v_rut := nullif(trim(coalesce(l ->> 'rut_auxiliar', '')), '');
    if c.tipo_auxiliar is not null and v_rut is null then
      raise exception 'Línea %: la cuenta % requiere el RUT del %', i, c.codigo, c.tipo_auxiliar;
    end if;
    if v_rut is not null and not rut_valido(v_rut) then raise exception 'Línea %: el RUT % no es válido', i, v_rut; end if;
    v_dte := nullif(trim(coalesce(l ->> 'tipo_dte', '')), '');
    if v_dte is not null and v_dte !~ '^[0-9]{1,3}$' then raise exception 'Línea %: el tipo de documento % no es válido', i, v_dte; end if;
    v_debe := v_debe + v_d; v_haber := v_haber + v_h;
  end loop;
  if v_debe <> v_haber then
    raise exception 'La apertura no cuadra: debe % y haber % (diferencia %)', v_debe, v_haber, v_debe - v_haber;
  end if;

  select x.id, x.numero into v_id, v_num from asientos x
  where x.empresa_id = p_empresa and x.anio = p_anio and x.tipo = 'apertura' and not x.anulado
  order by x.numero limit 1 for update;

  if v_id is not null then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cuenta', cuenta, 'debe', debe, 'haber', haber, 'rut', rut_auxiliar, 'dte', tipo_dte, 'folio', folio)) order by orden)
      into v_anteriores from asiento_lineas where asiento_lineas.asiento_id = v_id;
    delete from asiento_lineas where asiento_lineas.asiento_id = v_id;
    update asientos set glosa = v_glosa, fecha = v_fecha where id = v_id;
  else
    v_nuevo := true;
    if exists (select 1 from asientos x where x.empresa_id = p_empresa and x.anio = p_anio and x.numero = 0) then
      -- El N° 0 lo ocupa una apertura anulada (conserva su número): se toma el siguiente del correlativo
      insert into correlativos as k (empresa_id, anio, ultimo) values (p_empresa, p_anio, 1)
      on conflict (empresa_id, anio) do update set ultimo = k.ultimo + 1 returning ultimo into v_num;
    else
      v_num := 0;
    end if;
    insert into asientos (empresa_id, anio, numero, fecha, glosa, tipo, origen_id, creado_por)
    values (p_empresa, p_anio, v_num, v_fecha, v_glosa, 'apertura', 'apertura-manual:' || p_anio, auth.uid())
    returning id into v_id;
  end if;

  i := 0;
  for l in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into asiento_lineas (asiento_id, empresa_id, orden, cuenta, debe, haber, glosa, rut_auxiliar, tipo_dte, folio)
    values (v_id, p_empresa, i, l ->> 'cuenta', coalesce((l ->> 'debe')::numeric, 0), coalesce((l ->> 'haber')::numeric, 0),
            coalesce(nullif(trim(coalesce(l ->> 'glosa', '')), ''), 'Saldo inicial'),
            rut_normalizado(nullif(trim(coalesce(l ->> 'rut_auxiliar', '')), '')),
            nullif(trim(coalesce(l ->> 'tipo_dte', '')), '')::int, nullif(trim(coalesce(l ->> 'folio', '')), ''));
  end loop;

  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'guardar_apertura', jsonb_strip_nulls(jsonb_build_object('anio', p_anio, 'asiento', v_num, 'lineas', jsonb_array_length(p_lineas),
          'monto', v_debe, 'reemplazo', not v_nuevo, 'anteriores', v_anteriores)));
  return query select v_id, v_num, v_nuevo;
end $$;

revoke execute on function public.guardar_apertura(uuid, int, text, jsonb) from public, anon;
grant execute on function public.guardar_apertura(uuid, int, text, jsonb) to authenticated;
