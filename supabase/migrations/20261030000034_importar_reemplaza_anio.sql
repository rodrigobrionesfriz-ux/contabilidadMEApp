-- Importar un respaldo reemplaza el año: antes de cargar se borra todo lo contable que la empresa tenga en ese año
-- (asientos importados y registrados en la app, documentos, meses y ejercicio cerrados, F29, RCV cargados, libros de
-- remuneraciones, anticipos, conciliación bancaria). Así la empresa queda igual que en el sistema anterior.
-- Se conservan los demás años, el plan de cuentas, centros, fichas, trabajadores y activos.

-- Lo que hay en el año (para mostrarlo antes de importar)
create or replace function public.resumen_anio(p_empresa uuid, p_anio int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede importar datos'; end if;
  return jsonb_build_object(
    'asientos', (select count(*) from asientos where empresa_id = p_empresa and anio = p_anio),
    'importados', (select count(*) from asientos where empresa_id = p_empresa and anio = p_anio and importado),
    'propios', (select count(*) from asientos where empresa_id = p_empresa and anio = p_anio and not importado and not anulado),
    'documentos', (select count(*) from documentos where empresa_id = p_empresa and anio = p_anio),
    'f29', (select count(*) from f29_declaraciones where empresa_id = p_empresa and periodo like p_anio || '-%'),
    'rcv', (select count(*) from rcv_cargas where empresa_id = p_empresa and periodo like p_anio || '-%'),
    'libros_rem', (select count(*) from libros_remuneraciones where empresa_id = p_empresa and periodo like p_anio || '-%'),
    'anticipos', (select count(*) from rem_anticipos where empresa_id = p_empresa and mes_desc like p_anio || '-%'),
    'meses_cerrados', (select count(*) from periodos_cerrados where empresa_id = p_empresa and periodo like p_anio || '-%'));
end $$;
revoke execute on function public.resumen_anio(uuid, int) from public, anon;
grant execute on function public.resumen_anio(uuid, int) to authenticated;

-- Borra lo contable del año (sólo la llama importar_iniciar)
create or replace function public.vaciar_anio(p_empresa uuid, p_anio int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_as int; v_doc int;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede importar datos'; end if;
  v := resumen_anio(p_empresa, p_anio);
  -- Documentos del año (o con asiento del año): primero se sueltan las recepciones de inventario que los enlazan
  update inv_recepciones set compra_id = null where empresa_id = p_empresa and compra_id in
    (select d.id from documentos d left join asientos a on a.id = d.asiento_id where d.empresa_id = p_empresa and (d.anio = p_anio or a.anio = p_anio));
  delete from documentos d using documentos x left join asientos a on a.id = x.asiento_id
    where d.id = x.id and x.empresa_id = p_empresa and (x.anio = p_anio or a.anio = p_anio);
  get diagnostics v_doc = row_count;
  delete from libros_remuneraciones where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from rem_anticipos where empresa_id = p_empresa and mes_desc like p_anio || '-%';
  delete from f29_declaraciones where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from rcv_cargas where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from conciliacion_saldos where empresa_id = p_empresa and anio = p_anio;
  delete from ejercicios_cerrados where empresa_id = p_empresa and anio = p_anio;
  -- Asientos del año (sus líneas y marcas de conciliación se borran en cascada)
  delete from asientos where empresa_id = p_empresa and anio = p_anio;
  get diagnostics v_as = row_count;
  delete from periodos_cerrados where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from correlativos where empresa_id = p_empresa and anio = p_anio;
  delete from importaciones where empresa_id = p_empresa and anio = p_anio;
  if v_as > 0 or v_doc > 0 then
    insert into auditoria (empresa_id, accion, detalle)
    values (p_empresa, 'reemplazar_anio_importacion', jsonb_build_object('anio', p_anio, 'borrado', v));
  end if;
  return v;
end $$;
revoke execute on function public.vaciar_anio(uuid, int) from public, anon, authenticated;

create or replace function public.importar_iniciar(
  p_empresa uuid, p_anio int, p_archivo text, p_cuentas jsonb default '[]', p_centros jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; v_cod text; v_padre text; v_nuevas int := 0; v_cc int := 0;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede importar datos'; end if;
  if p_anio < 2000 or p_anio > 2100 then raise exception 'Año % no válido', p_anio; end if;
  -- El respaldo reemplaza el año completo: se borra todo lo contable del año antes de cargar (vaciar_anio)
  perform vaciar_anio(p_empresa, p_anio);

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
