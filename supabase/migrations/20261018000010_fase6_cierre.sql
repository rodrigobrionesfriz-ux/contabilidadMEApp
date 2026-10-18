-- Contabilidad ME · fase 6: estados financieros, cierre del ejercicio y apertura del año siguiente.

-- Régimen tributario (tasa del impuesto a la renta estimado y aviso de corrección monetaria)
alter table public.empresas
  add column regimen text not null default '14D3' check (regimen in ('14D3', '14D8', '14A', '34AGRI', '34TRANS', '34MIN', 'NOSUJ')),
  add column tasa_renta numeric(5, 2) check (tasa_renta is null or (tasa_renta >= 0 and tasa_renta <= 100));
grant update (regimen, tasa_renta) on public.empresas to authenticated;

-- Sumas por cuenta de un período. Con p_excluir_cierre los estados financieros muestran el
-- resultado del ejercicio aunque el año ya esté cerrado.
create or replace function public.saldos_periodo(p_empresa uuid, p_desde date, p_hasta date, p_excluir_cierre boolean default true)
returns table (cuenta text, nombre text, tipo char(1), debe numeric, haber numeric)
language sql stable security invoker set search_path = public as $$
  select l.cuenta, c.nombre, c.tipo, sum(l.debe), sum(l.haber)
  from asiento_lineas l
  join asientos a on a.id = l.asiento_id
  join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.empresa_id = p_empresa and not a.anulado and a.fecha between p_desde and p_hasta
    and not (p_excluir_cierre and a.tipo = 'cierre')
  group by l.cuenta, c.nombre, c.tipo
  order by l.cuenta
$$;

-- Meses que ya estaban cerrados antes del cierre anual (para restaurarlos al reabrir)
create table public.ejercicios_cerrados (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio int not null,
  asiento_id uuid references public.asientos (id) on delete set null,
  resultado numeric(16, 0) not null default 0,
  meses_previos text[] not null default '{}',
  cerrado_por uuid references auth.users (id) default auth.uid(),
  cerrado_en timestamptz not null default now(),
  primary key (empresa_id, anio)
);
alter table public.ejercicios_cerrados enable row level security;
create policy ejc_ver on public.ejercicios_cerrados for select to authenticated using (public.es_miembro(empresa_id));
revoke all on public.ejercicios_cerrados from anon, authenticated;
grant select on public.ejercicios_cerrados to authenticated;

create or replace function public.ejercicio_cerrado(p_empresa uuid, p_anio int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from asientos where empresa_id = p_empresa and anio = p_anio and tipo = 'cierre' and not anulado)
$$;

-- Inserta un asiento ya validado por quien llama (correlativo o número fijo) y sus líneas.
create or replace function public.insertar_asiento_sistema(p_empresa uuid, p_fecha date, p_glosa text, p_tipo text, p_origen text, p_lineas jsonb, p_numero int default null)
returns table (id uuid, numero int) language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int; v_anio int := extract(year from p_fecha)::int; l jsonb; i int := 0;
begin
  if p_numero is null then
    insert into correlativos as k (empresa_id, anio, ultimo) values (p_empresa, v_anio, 1)
    on conflict (empresa_id, anio) do update set ultimo = k.ultimo + 1 returning ultimo into v_num;
  else v_num := p_numero; end if;
  insert into asientos (empresa_id, anio, numero, fecha, glosa, tipo, origen_id, creado_por)
  values (p_empresa, v_anio, v_num, p_fecha, p_glosa, p_tipo, p_origen, auth.uid()) returning asientos.id into v_id;
  for l in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into asiento_lineas (asiento_id, empresa_id, orden, cuenta, debe, haber, glosa, centro_costo, rut_auxiliar, tipo_dte, folio)
    values (v_id, p_empresa, i, l ->> 'cuenta', coalesce((l ->> 'debe')::numeric, 0), coalesce((l ->> 'haber')::numeric, 0), nullif(l ->> 'glosa', ''),
            nullif(l ->> 'centro_costo', ''), nullif(l ->> 'rut_auxiliar', ''), nullif(l ->> 'tipo_dte', '')::int, nullif(l ->> 'folio', ''));
  end loop;
  return query select v_id, v_num;
end $$;
revoke execute on function public.insertar_asiento_sistema(uuid, date, text, text, text, jsonb, int) from public, anon, authenticated;

-- Cierre del ejercicio: salda las cuentas de resultado (3 y 4) contra Resultados Acumulados (2303001)
-- al 31 de diciembre, por cuenta, auxiliar y centro de costo, y cierra los 12 meses.
create or replace function public.cerrar_ejercicio(p_empresa uuid, p_anio int)
returns table (asiento_id uuid, numero int, resultado numeric) language plpgsql security definer set search_path = public as $$
declare v_lineas jsonb; v_res numeric; v_previos text[]; v_as uuid; v_num int; v_cta record; v_fecha date := make_date(p_anio, 12, 31);
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para cerrar el ejercicio'; end if;
  if ejercicio_cerrado(p_empresa, p_anio) then raise exception 'El ejercicio % ya está cerrado', p_anio; end if;
  select * into v_cta from cuentas where empresa_id = p_empresa and codigo = '2303001';
  if not found or not v_cta.acepta_movimientos or not v_cta.activa then raise exception 'Falta la cuenta 2303001 Resultados acumulados (imputable y activa) en el plan de cuentas'; end if;

  with s as (
    select l.cuenta, l.rut_auxiliar, l.centro_costo, sum(l.debe - l.haber) saldo
    from asiento_lineas l join asientos a on a.id = l.asiento_id
    where l.empresa_id = p_empresa and not a.anulado and a.anio = p_anio and l.cuenta ~ '^[34][0-9]{6}$'
    group by l.cuenta, l.rut_auxiliar, l.centro_costo having abs(sum(l.debe - l.haber)) >= 0.5
  )
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cuenta', cuenta, 'debe', greatest(-saldo, 0), 'haber', greatest(saldo, 0),
           'glosa', 'Cierre del ejercicio ' || p_anio, 'rut_auxiliar', rut_auxiliar, 'centro_costo', centro_costo)) order by cuenta, rut_auxiliar, centro_costo),
         coalesce(sum(-saldo), 0)
    into v_lineas, v_res from s;
  if v_lineas is null then raise exception 'No hay cuentas de resultado con saldo que cerrar en %', p_anio; end if;
  v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('cuenta', '2303001', 'debe', greatest(-v_res, 0), 'haber', greatest(v_res, 0),
                 'glosa', case when v_res >= 0 then 'Utilidad del ejercicio ' else 'Pérdida del ejercicio ' end || p_anio));
  if v_res = 0 then v_lineas := (select jsonb_agg(x) from jsonb_array_elements(v_lineas) x where x ->> 'cuenta' <> '2303001'); end if;

  -- Diciembre debe estar abierto para registrar el cierre; los meses cerrados se recuerdan para la reapertura
  select coalesce(array_agg(periodo order by periodo), '{}') into v_previos from periodos_cerrados where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from periodos_cerrados where empresa_id = p_empresa and periodo = p_anio || '-12';
  select i.id, i.numero into v_as, v_num from insertar_asiento_sistema(p_empresa, v_fecha, 'Cierre del ejercicio ' || p_anio, 'cierre', 'cierre:' || p_anio, v_lineas) i;
  insert into periodos_cerrados (empresa_id, periodo, cerrado_por)
  select p_empresa, p_anio || '-' || lpad(m::text, 2, '0'), auth.uid() from generate_series(1, 12) m
  on conflict (empresa_id, periodo) do nothing;
  insert into ejercicios_cerrados (empresa_id, anio, asiento_id, resultado, meses_previos) values (p_empresa, p_anio, v_as, v_res, v_previos)
  on conflict (empresa_id, anio) do update set asiento_id = excluded.asiento_id, resultado = excluded.resultado, meses_previos = excluded.meses_previos, cerrado_por = auth.uid(), cerrado_en = now();
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'cerrar_ejercicio', jsonb_build_object('anio', p_anio, 'asiento', v_num, 'resultado', v_res));
  return query select v_as, v_num, v_res;
end $$;

-- Reapertura: anula el asiento de cierre (con motivo) y deja los meses como estaban antes del cierre.
create or replace function public.reabrir_ejercicio(p_empresa uuid, p_anio int, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare a record; v_previos text[];
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para reabrir el ejercicio'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  if exists (select 1 from asientos where empresa_id = p_empresa and anio = p_anio + 1 and tipo = 'apertura' and origen_id = 'apertura:' || (p_anio + 1) and not anulado) then
    raise exception 'El año % ya tiene una apertura generada desde este cierre. Anúlala primero.', p_anio + 1;
  end if;
  select meses_previos into v_previos from ejercicios_cerrados where empresa_id = p_empresa and anio = p_anio;
  delete from periodos_cerrados where empresa_id = p_empresa and periodo like p_anio || '-%';
  for a in select id from asientos where empresa_id = p_empresa and anio = p_anio and tipo = 'cierre' and not anulado loop
    perform anular_asiento(a.id, 'Reapertura del ejercicio: ' || trim(p_motivo));
  end loop;
  insert into periodos_cerrados (empresa_id, periodo, cerrado_por)
  select p_empresa, x, auth.uid() from unnest(coalesce(v_previos, '{}')) x on conflict do nothing;
  delete from ejercicios_cerrados where empresa_id = p_empresa and anio = p_anio;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'reabrir_ejercicio', jsonb_build_object('anio', p_anio, 'motivo', trim(p_motivo)));
end $$;

-- Apertura del año siguiente: saldos de balance (1 y 2) al cierre del año anterior, como asiento N°0
-- al 1 de enero. Las cuentas con auxiliar conservan RUT, tipo y folio de cada documento con saldo.
create or replace function public.generar_apertura(p_empresa uuid, p_anio int)
returns table (asiento_id uuid, numero int) language plpgsql security definer set search_path = public as $$
declare v_lineas jsonb; v_as uuid; v_num int; v_fecha date := make_date(p_anio, 1, 1); v_d numeric; v_h numeric;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para generar la apertura'; end if;
  if not ejercicio_cerrado(p_empresa, p_anio - 1) then raise exception 'Primero cierra el ejercicio %', p_anio - 1; end if;
  if exists (select 1 from asientos where empresa_id = p_empresa and anio = p_anio and tipo = 'apertura' and not anulado) then
    raise exception 'El año % ya tiene un asiento de apertura vigente', p_anio;
  end if;
  if periodo_cerrado(p_empresa, v_fecha) then raise exception 'Enero de % está cerrado', p_anio; end if;
  with s as (
    select l.cuenta,
           case when c.tipo_auxiliar is not null then l.rut_auxiliar end rut,
           case when c.tipo_auxiliar is not null then l.tipo_dte end dte,
           case when c.tipo_auxiliar is not null then l.folio end folio,
           sum(l.debe - l.haber) saldo
    from asiento_lineas l join asientos a on a.id = l.asiento_id
    join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
    where l.empresa_id = p_empresa and not a.anulado and a.anio = p_anio - 1 and l.cuenta ~ '^[12]'
    group by 1, 2, 3, 4 having abs(sum(l.debe - l.haber)) >= 0.5
  )
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cuenta', cuenta, 'debe', greatest(saldo, 0), 'haber', greatest(-saldo, 0),
           'glosa', 'Saldo al 31-12-' || (p_anio - 1), 'rut_auxiliar', rut, 'tipo_dte', dte::text, 'folio', folio)) order by cuenta, rut, dte, folio)
    into v_lineas from s;
  if v_lineas is null then raise exception 'El año % no tiene saldos de balance que trasladar', p_anio - 1; end if;
  select sum((x ->> 'debe')::numeric), sum((x ->> 'haber')::numeric) into v_d, v_h from jsonb_array_elements(v_lineas) x;
  if v_d <> v_h then raise exception 'Los saldos de balance de % no cuadran (debe % y haber %): revisa el cierre', p_anio - 1, v_d, v_h; end if;
  select i.id, i.numero into v_as, v_num from insertar_asiento_sistema(p_empresa, v_fecha, 'Apertura del ejercicio ' || p_anio, 'apertura', 'apertura:' || p_anio, v_lineas,
    case when exists (select 1 from asientos x where x.empresa_id = p_empresa and x.anio = p_anio and x.numero = 0) then null else 0 end) i;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'generar_apertura', jsonb_build_object('anio', p_anio, 'asiento', v_num, 'lineas', jsonb_array_length(v_lineas)));
  return query select v_as, v_num;
end $$;

revoke execute on function public.saldos_periodo(uuid, date, date, boolean), public.ejercicio_cerrado(uuid, int), public.cerrar_ejercicio(uuid, int),
  public.reabrir_ejercicio(uuid, int, text), public.generar_apertura(uuid, int) from public, anon;
grant execute on function public.saldos_periodo(uuid, date, date, boolean), public.ejercicio_cerrado(uuid, int), public.cerrar_ejercicio(uuid, int),
  public.reabrir_ejercicio(uuid, int, text), public.generar_apertura(uuid, int) to authenticated;
