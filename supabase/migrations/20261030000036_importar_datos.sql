-- Contabilidad ME · Importar el resto de los datos del sistema anterior (hoja "Datos" del respaldo, V2.22.13+).
-- Lo arma src/importador/datos-extra.ts. Todo en una transacción; sólo administradores.
--   empresa y parámetros: se actualizan.
--   trabajadores: por RUT (los nuevos se crean; la ficha se reemplaza). Lo demás los referencia por su id anterior (ref_origen).
--   del año: anticipos, horas, eventos de asistencia y libros cerrados se reemplazan.
--   finiquitos, contratos y plantillas: se reemplazan los de los trabajadores importados / por código.
--   fichas de clientes y proveedores: por RUT (cuenta o centro inexistentes quedan vacíos).
--   comprobantes tipo y activo fijo: se agregan los que no estén (mismo nombre / misma descripción y fecha).
--   renta y declaraciones juradas: por año.

create or replace function public.importar_datos(p_empresa uuid, p_anio int, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  x jsonb; v_t uuid; v_n int; v_uf numeric;
  r jsonb := '{}'::jsonb;
  c_trab int := 0; c_ant int := 0; c_ev int := 0; c_hr int := 0; c_lib int := 0; c_lib_omit jsonb := '[]'; c_fin int := 0; c_ctr int := 0;
  c_pl int := 0; c_aux int := 0; c_ct int := 0; c_renta int := 0; c_dj int := 0; c_af int := 0;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede importar datos'; end if;
  if p_anio < 2000 or p_anio > 2100 then raise exception 'Año % no válido', p_anio; end if;

  -- ── Empresa ──
  if jsonb_typeof(p_d -> 'empresa') = 'object' then
    x := p_d -> 'empresa';
    update empresas set
      giro = coalesce(nullif(x ->> 'giro', ''), giro), domicilio = coalesce(nullif(x ->> 'domicilio', ''), domicilio),
      comuna = coalesce(nullif(x ->> 'comuna', ''), comuna), ciudad = coalesce(nullif(x ->> 'ciudad', ''), ciudad),
      representante = coalesce(nullif(x ->> 'representante', ''), representante),
      rut_representante = case when rut_valido(x ->> 'rut_representante') then x ->> 'rut_representante' else rut_representante end,
      regimen = coalesce(nullif(x ->> 'regimen', ''), regimen),
      tasa_renta = case when x ? 'tasa_renta' then (x ->> 'tasa_renta')::numeric else tasa_renta end
    where id = p_empresa;
  end if;
  if jsonb_typeof(p_d -> 'parametros') = 'object' then
    x := p_d -> 'parametros';
    insert into empresa_parametros (empresa_id, indicadores, previsional, feriados, previred)
    values (p_empresa, coalesce(x -> 'indicadores', '{}'), coalesce(x -> 'previsional', '{}'),
            coalesce(x -> 'feriados', '{"extra": [], "quitar": []}'), coalesce(x -> 'previred', '{}'))
    on conflict (empresa_id) do update set
      indicadores = case when x ? 'indicadores' then excluded.indicadores else empresa_parametros.indicadores end,
      previsional = case when x ? 'previsional' then excluded.previsional else empresa_parametros.previsional end,
      feriados = case when x ? 'feriados' then excluded.feriados else empresa_parametros.feriados end,
      previred = case when x ? 'previred' then excluded.previred else empresa_parametros.previred end,
      actualizado = now();
  end if;
  if jsonb_typeof(p_d -> 'contratoDefaults') = 'object' then
    insert into contrato_config (empresa_id, defaults) values (p_empresa, p_d -> 'contratoDefaults')
    on conflict (empresa_id) do update set defaults = excluded.defaults, actualizado = now();
  end if;

  -- ── Trabajadores ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'trabajadores', '[]')) loop
    if not rut_valido(x ->> 'rut') then continue; end if;
    insert into trabajadores (empresa_id, rut, nombre, activo, ficha, ref_origen)
    values (p_empresa, x ->> 'rut', x ->> 'nombre', coalesce((x ->> 'activo')::boolean, true), coalesce(x -> 'ficha', '{}'), x ->> 'ref')
    on conflict (empresa_id, rut) do update set nombre = excluded.nombre, activo = excluded.activo, ficha = excluded.ficha,
      ref_origen = excluded.ref_origen, actualizado = now();
    c_trab := c_trab + 1;
  end loop;
  create temp table if not exists _trab_ref (ref text primary key, id uuid) on commit drop;
  delete from _trab_ref;
  insert into _trab_ref select ref_origen, id from trabajadores where empresa_id = p_empresa and ref_origen is not null on conflict do nothing;

  -- ── Anticipos del año (los sin asiento se reemplazan) ──
  if jsonb_typeof(p_d -> 'anticipos') = 'array' and coalesce(jsonb_array_length(p_d -> 'trabajadores'), 0) > 0 then
    delete from rem_anticipos where empresa_id = p_empresa and mes_desc like p_anio || '-%';
    for x in select * from jsonb_array_elements(p_d -> 'anticipos') loop
      select id into v_t from _trab_ref where ref = x ->> 'trab';
      if v_t is null then continue; end if;
      insert into rem_anticipos (empresa_id, trabajador_id, fecha, monto, motivo, mes_desc)
      values (p_empresa, v_t, (x ->> 'fecha')::date, (x ->> 'monto')::numeric, x ->> 'motivo', x ->> 'mes_desc');
      c_ant := c_ant + 1;
    end loop;
  end if;

  -- ── Asistencia del año ──
  if jsonb_typeof(p_d -> 'eventos') = 'array' then
    delete from rem_eventos where empresa_id = p_empresa and desde <= make_date(p_anio, 12, 31) and hasta >= make_date(p_anio, 1, 1);
    for x in select * from jsonb_array_elements(p_d -> 'eventos') loop
      select id into v_t from _trab_ref where ref = x ->> 'trab';
      if v_t is null or (x ->> 'tipo') not in ('licencia', 'permiso_sin', 'ausencia', 'permiso_con', 'vacaciones') then continue; end if;
      insert into rem_eventos (empresa_id, trabajador_id, tipo, lic_tipo, desde, hasta, folio, obs)
      values (p_empresa, v_t, x ->> 'tipo', x ->> 'lic_tipo', (x ->> 'desde')::date, (x ->> 'hasta')::date, x ->> 'folio', x ->> 'obs');
      c_ev := c_ev + 1;
    end loop;
  end if;
  if jsonb_typeof(p_d -> 'horas') = 'array' then
    delete from rem_horas where empresa_id = p_empresa and periodo like p_anio || '-%';
    for x in select * from jsonb_array_elements(p_d -> 'horas') loop
      select id into v_t from _trab_ref where ref = x ->> 'trab';
      if v_t is null then continue; end if;
      insert into rem_horas (empresa_id, periodo, trabajador_id, horas) values (p_empresa, x ->> 'periodo', v_t, (x ->> 'horas')::numeric)
      on conflict do nothing;
      c_hr := c_hr + 1;
    end loop;
  end if;

  -- ── Libros de remuneraciones cerrados del año (líneas con el id nuevo del trabajador) ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'libros', '[]')) loop
    -- La UF del libro debe estar en los indicadores: si falta se registra la del libro; si es otra, el mes se omite
    select uf into v_uf from indicadores where periodo = x ->> 'periodo';
    if v_uf is null then
      insert into indicadores (periodo, uf, utm) values (x ->> 'periodo', (x ->> 'uf')::numeric, nullif((x ->> 'utm')::numeric, 0))
      on conflict (periodo) do update set uf = excluded.uf, utm = coalesce(indicadores.utm, excluded.utm), actualizado = now();
    elsif round(v_uf, 2) <> round((x ->> 'uf')::numeric, 2) then
      c_lib_omit := c_lib_omit || to_jsonb(x ->> 'periodo');
      continue;
    end if;
    delete from libros_remuneraciones where empresa_id = p_empresa and periodo = x ->> 'periodo';
    insert into libros_remuneraciones (empresa_id, periodo, uf, utm, lineas, totales, cerrado_en)
    select p_empresa, x ->> 'periodo', (x ->> 'uf')::numeric, (x ->> 'utm')::numeric,
      coalesce((select jsonb_agg(case when t.id is not null then l || jsonb_build_object('id', t.id) else l end order by o)
        from jsonb_array_elements(x -> 'lineas') with ordinality as e(l, o) left join _trab_ref t on t.ref = l ->> 'id'), '[]'),
      coalesce(x -> 'totales', '{}'), coalesce((x ->> 'cerrado_en')::timestamptz, now());
    c_lib := c_lib + 1;
  end loop;

  -- ── Finiquitos, contratos y plantillas ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'finiquitoPlantillas', '[]')) loop
    insert into finiquito_plantillas (empresa_id, codigo, nombre, causal, texto) values (p_empresa, x ->> 'codigo', x ->> 'nombre', coalesce(x ->> 'causal', ''), x ->> 'texto')
    on conflict (empresa_id, codigo) do update set nombre = excluded.nombre, causal = excluded.causal, texto = excluded.texto, actualizado = now();
    c_pl := c_pl + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'contratoPlantillas', '[]')) loop
    insert into contrato_plantillas (empresa_id, codigo, nombre, cargos, tipo_contrato, texto)
    values (p_empresa, x ->> 'codigo', x ->> 'nombre', coalesce(x ->> 'cargos', ''), (x ->> 'tipo_contrato')::smallint, x ->> 'texto')
    on conflict (empresa_id, codigo) do update set nombre = excluded.nombre, cargos = excluded.cargos, tipo_contrato = excluded.tipo_contrato, texto = excluded.texto, actualizado = now();
    c_pl := c_pl + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'finiquitos', '[]')) loop
    select id into v_t from _trab_ref where ref = x ->> 'trab';
    if v_t is null then continue; end if;
    -- Un finiquito por trabajador y fecha de término: el del respaldo reemplaza al que no tenga asiento
    delete from finiquitos where empresa_id = p_empresa and trabajador_id = v_t and fecha_termino = (x ->> 'fecha_termino')::date and asiento_id is null;
    if exists (select 1 from finiquitos where empresa_id = p_empresa and trabajador_id = v_t and fecha_termino = (x ->> 'fecha_termino')::date) then continue; end if;
    insert into finiquitos (empresa_id, trabajador_id, fecha_termino, causal, datos, calc, total, texto, estado, ratificado_en)
    values (p_empresa, v_t, (x ->> 'fecha_termino')::date, coalesce(x ->> 'causal', ''), (x -> 'datos') || jsonb_build_object('trab', v_t), x -> 'calc',
            coalesce((x ->> 'total')::numeric, 0), x ->> 'texto', coalesce(x ->> 'estado', 'borrador'), case when x ->> 'estado' = 'ratificado' then now() end);
    c_fin := c_fin + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'contratos', '[]')) loop
    select id into v_t from _trab_ref where ref = x ->> 'trab';
    if v_t is null then continue; end if;
    insert into contratos_trabajo (empresa_id, trabajador_id, plantilla, texto) values (p_empresa, v_t, x ->> 'plantilla', x ->> 'texto')
    on conflict (empresa_id, trabajador_id) do update set plantilla = excluded.plantilla, texto = excluded.texto, actualizado = now();
    c_ctr := c_ctr + 1;
  end loop;

  -- ── Fichas de clientes y proveedores ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'auxiliares', '[]')) loop
    if not rut_valido(x ->> 'rut') or (x ->> 'tipo') not in ('cliente', 'proveedor') then continue; end if;
    insert into auxiliares (empresa_id, tipo, rut, razon_social, giro, email, telefono, direccion, cuenta, centro_costo, forma_pago)
    values (p_empresa, x ->> 'tipo', x ->> 'rut', x ->> 'razon_social', x ->> 'giro', x ->> 'email', x ->> 'telefono', x ->> 'direccion',
      (select codigo from cuentas where empresa_id = p_empresa and codigo = x ->> 'cuenta' and acepta_movimientos),
      (select codigo from centros_costo where empresa_id = p_empresa and codigo = x ->> 'centro_costo'),
      case when (x ->> 'forma_pago') in ('clientes', 'banco', 'deudores', 'tarjetas') then x ->> 'forma_pago' end)
    on conflict (empresa_id, tipo, rut) do update set razon_social = excluded.razon_social,
      giro = coalesce(excluded.giro, auxiliares.giro), email = coalesce(excluded.email, auxiliares.email), telefono = coalesce(excluded.telefono, auxiliares.telefono),
      direccion = coalesce(excluded.direccion, auxiliares.direccion), cuenta = coalesce(excluded.cuenta, auxiliares.cuenta),
      centro_costo = coalesce(excluded.centro_costo, auxiliares.centro_costo), forma_pago = coalesce(excluded.forma_pago, auxiliares.forma_pago), actualizado = now();
    c_aux := c_aux + 1;
  end loop;

  -- ── Comprobantes tipo (se agregan los que no estén por nombre) ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'comprobantesTipo', '[]')) loop
    if exists (select 1 from comprobantes_tipo where empresa_id = p_empresa and lower(nombre) = lower(x ->> 'nombre')) then continue; end if;
    insert into comprobantes_tipo (empresa_id, nombre, descripcion, glosa, guarda_montos, lineas, dist_activa, dist_base, dist)
    values (p_empresa, x ->> 'nombre', coalesce(x ->> 'descripcion', ''), coalesce(x ->> 'glosa', ''), coalesce((x ->> 'guarda_montos')::boolean, false),
      coalesce(x -> 'lineas', '[]'), coalesce((x ->> 'dist_activa')::boolean, false), coalesce((x ->> 'dist_base')::numeric, 0), coalesce(x -> 'dist', '[]'));
    c_ct := c_ct + 1;
  end loop;

  -- ── Renta y declaraciones juradas ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'renta', '[]')) loop
    insert into renta_declaraciones (empresa_id, anio, datos) values (p_empresa, (x ->> 'anio')::int, x -> 'datos')
    on conflict (empresa_id, anio) do update set datos = excluded.datos, actualizado = now();
    c_renta := c_renta + 1;
  end loop;
  if jsonb_typeof(p_d -> 'djCatalogo') = 'array' then
    insert into dj_catalogo (empresa_id, catalogo) values (p_empresa, p_d -> 'djCatalogo')
    on conflict (empresa_id) do update set catalogo = excluded.catalogo, actualizado = now();
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'djEstados', '[]')) loop
    insert into dj_estados (empresa_id, anio_tributario, estados) values (p_empresa, (x ->> 'anio_tributario')::int, x -> 'estados')
    on conflict (empresa_id, anio_tributario) do update set estados = excluded.estados, actualizado = now();
    c_dj := c_dj + 1;
  end loop;

  -- ── Activo fijo (se agregan los que no estén; las cuentas deben existir en el plan) ──
  for x in select * from jsonb_array_elements(coalesce(p_d -> 'activos', '[]')) loop
    if exists (select 1 from activos_fijos where empresa_id = p_empresa and lower(descripcion) = lower(x ->> 'descripcion') and fecha = (x ->> 'fecha')::date) then continue; end if;
    if (select count(*) from cuentas where empresa_id = p_empresa and codigo in (x ->> 'cuenta_activo', x ->> 'cuenta_depr_acum', x ->> 'cuenta_gasto')) < 3 then continue; end if;
    insert into activos_fijos (empresa_id, descripcion, categoria, fecha, cuenta_activo, cuenta_depr_acum, cuenta_gasto, ficha, estado)
    values (p_empresa, x ->> 'descripcion', x ->> 'categoria', (x ->> 'fecha')::date, x ->> 'cuenta_activo', x ->> 'cuenta_depr_acum', x ->> 'cuenta_gasto', x -> 'ficha', coalesce(x ->> 'estado', 'vigente'));
    c_af := c_af + 1;
  end loop;

  r := jsonb_build_object('trabajadores', c_trab, 'anticipos', c_ant, 'eventos', c_ev, 'horas', c_hr, 'libros', c_lib, 'libros_omitidos', c_lib_omit,
    'finiquitos', c_fin, 'contratos', c_ctr, 'plantillas', c_pl, 'fichas', c_aux, 'comprobantes_tipo', c_ct, 'renta', c_renta, 'dj', c_dj, 'activos', c_af);
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'importar_datos', r || jsonb_build_object('anio', p_anio));
  return r;
end $$;

revoke execute on function public.importar_datos(uuid, int, jsonb) from public, anon;
grant execute on function public.importar_datos(uuid, int, jsonb) to authenticated;
