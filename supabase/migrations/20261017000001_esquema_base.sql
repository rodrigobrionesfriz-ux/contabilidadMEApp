-- Contabilidad ME · esquema base (fase 0)
-- Multiempresa con aislamiento por Row Level Security (RLS): cada usuario ve sólo
-- las empresas donde es miembro activo. Las escrituras críticas (asientos con
-- correlativo, anulaciones, cierres) se hacen sólo a través de funciones SQL
-- atómicas; no hay políticas de INSERT/UPDATE directas sobre esas tablas.

-- ─────────────────────────── Tipos ───────────────────────────
create type public.rol_empresa as enum ('admin', 'contador', 'consulta');
create type public.estado_miembro as enum ('activo', 'pendiente', 'inactivo');

-- ─────────────────────────── Utilidades ───────────────────────────
-- RUT chileno válido (módulo 11). Acepta puntos y guion.
create or replace function public.rut_valido(p_rut text)
returns boolean language plpgsql immutable as $$
declare
  limpio text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
  cuerpo text; dv text; s int := 0; m int := 2; r int; esperado text;
begin
  if length(limpio) < 2 then return false; end if;
  cuerpo := left(limpio, -1); dv := right(limpio, 1);
  if cuerpo !~ '^[0-9]+$' then return false; end if;
  for i in reverse length(cuerpo)..1 loop
    s := s + substr(cuerpo, i, 1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - (s % 11);
  esperado := case r when 11 then '0' when 10 then 'K' else r::text end;
  return esperado = dv;
end $$;

-- Normaliza a 12345678-9 (sin puntos, DV en mayúscula)
create or replace function public.rut_normalizado(p_rut text)
returns text language sql immutable as $$
  select case when length(x) < 2 then null else left(x, -1) || '-' || right(x, 1) end
  from (select upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')) as x) t
$$;

-- ─────────────────────────── Tablas ───────────────────────────
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  email text,
  creado timestamptz not null default now()
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  rut text not null unique check (public.rut_valido(rut)),
  razon_social text not null check (length(trim(razon_social)) > 0),
  giro text,
  domicilio text,
  comuna text,
  ciudad text,
  representante text,
  rut_representante text check (rut_representante is null or public.rut_valido(rut_representante)),
  creada_por uuid references auth.users (id),
  creado timestamptz not null default now()
);

create table public.miembros (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_empresa not null default 'consulta',
  estado public.estado_miembro not null default 'activo',
  -- Permisos por sección que sobrescriben el rol: {"remuneraciones":"none"|"read"|"write"}
  permisos jsonb not null default '{}'::jsonb,
  creado timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);
create index miembros_usuario_idx on public.miembros (usuario_id);

-- Plan de cuentas modelo (se copia a cada empresa nueva)
create table public.pdc_plantilla (
  codigo text primary key,
  nombre text not null,
  tipo char(1) not null check (tipo in ('T', 'S', 'A', 'P', 'C', 'I')),
  naturaleza char(1) check (naturaleza in ('D', 'C'))
);

create table public.cuentas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  codigo text not null check (codigo ~ '^[0-9]+$'),
  nombre text not null,
  tipo char(1) not null check (tipo in ('T', 'S', 'A', 'P', 'C', 'I')),
  naturaleza char(1) check (naturaleza in ('D', 'C')),
  acepta_movimientos boolean not null default true,
  acepta_centro_costo boolean not null default false,
  requiere_centro_costo boolean not null default false,
  tipo_auxiliar text check (tipo_auxiliar in ('cliente', 'proveedor', 'honorario', 'trabajador')),
  tipo_iva text,
  activa boolean not null default true,
  primary key (empresa_id, codigo)
);

create table public.centros_costo (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  codigo text not null,
  nombre text not null,
  activo boolean not null default true,
  primary key (empresa_id, codigo)
);

create table public.periodos_cerrados (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo char(7) not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  cerrado_por uuid references auth.users (id),
  cerrado_en timestamptz not null default now(),
  primary key (empresa_id, periodo)
);

create table public.correlativos (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  anio int not null,
  ultimo int not null default 0,
  primary key (empresa_id, anio)
);

create table public.asientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  anio int not null,
  numero int not null,
  fecha date not null,
  glosa text not null check (length(trim(glosa)) > 0),
  -- manual | compra | venta | honorario | remuneraciones | apertura | cierre | anticipo | pago ...
  tipo text not null default 'manual',
  origen_id text,
  anulado boolean not null default false,
  anulado_en timestamptz,
  anulado_por uuid references auth.users (id),
  motivo_anulacion text,
  creado_por uuid references auth.users (id),
  creado timestamptz not null default now(),
  unique (empresa_id, anio, numero),
  check (anio = extract(year from fecha)::int)
);
create index asientos_empresa_fecha_idx on public.asientos (empresa_id, fecha);

create table public.asiento_lineas (
  id bigint generated always as identity primary key,
  asiento_id uuid not null references public.asientos (id) on delete cascade,
  empresa_id uuid not null,
  orden int not null,
  cuenta text not null,
  debe numeric(14, 0) not null default 0 check (debe >= 0),
  haber numeric(14, 0) not null default 0 check (haber >= 0),
  glosa text,
  centro_costo text,
  rut_auxiliar text,
  tipo_dte int,
  folio text,
  foreign key (empresa_id, cuenta) references public.cuentas (empresa_id, codigo),
  foreign key (empresa_id, centro_costo) references public.centros_costo (empresa_id, codigo),
  check (debe > 0 or haber > 0),
  check (not (debe > 0 and haber > 0))
);
create index asiento_lineas_asiento_idx on public.asiento_lineas (asiento_id);
create index asiento_lineas_cuenta_idx on public.asiento_lineas (empresa_id, cuenta);

create table public.auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid references public.empresas (id) on delete cascade,
  usuario_id uuid default auth.uid(),
  accion text not null,
  detalle jsonb,
  creado timestamptz not null default now()
);
create index auditoria_empresa_idx on public.auditoria (empresa_id, creado desc);

create table public.indicadores (
  periodo char(7) primary key check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  uf numeric(10, 2),
  utm numeric(10, 0),
  imm numeric(10, 0),
  actualizado timestamptz not null default now()
);

-- ─────────────────────────── Permisos (funciones de RLS) ───────────────────────────
create or replace function public.es_miembro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros
    where empresa_id = p_empresa and usuario_id = auth.uid() and estado = 'activo')
$$;

create or replace function public.puede_escribir(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros
    where empresa_id = p_empresa and usuario_id = auth.uid() and estado = 'activo' and rol in ('admin', 'contador'))
$$;

create or replace function public.es_admin(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros
    where empresa_id = p_empresa and usuario_id = auth.uid() and estado = 'activo' and rol = 'admin')
$$;

-- ¿El usuario p comparte alguna empresa con el usuario actual? (para ver nombres de colegas)
create or replace function public.comparte_empresa(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros a join miembros b on a.empresa_id = b.empresa_id
    where a.usuario_id = auth.uid() and a.estado = 'activo' and b.usuario_id = p_usuario)
$$;

-- ─────────────────────────── RLS ───────────────────────────
alter table public.perfiles enable row level security;
alter table public.empresas enable row level security;
alter table public.miembros enable row level security;
alter table public.pdc_plantilla enable row level security;
alter table public.cuentas enable row level security;
alter table public.centros_costo enable row level security;
alter table public.periodos_cerrados enable row level security;
alter table public.correlativos enable row level security;
alter table public.asientos enable row level security;
alter table public.asiento_lineas enable row level security;
alter table public.auditoria enable row level security;
alter table public.indicadores enable row level security;

create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.comparte_empresa(id));
create policy perfiles_editar on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy empresas_ver on public.empresas for select to authenticated using (public.es_miembro(id));
create policy empresas_editar on public.empresas for update to authenticated
  using (public.es_admin(id)) with check (public.es_admin(id));

create policy miembros_ver on public.miembros for select to authenticated using (public.es_miembro(empresa_id));
create policy miembros_editar on public.miembros for update to authenticated
  using (public.es_admin(empresa_id)) with check (public.es_admin(empresa_id));
create policy miembros_borrar on public.miembros for delete to authenticated using (public.es_admin(empresa_id));

create policy pdc_plantilla_ver on public.pdc_plantilla for select to authenticated using (true);

create policy cuentas_ver on public.cuentas for select to authenticated using (public.es_miembro(empresa_id));
create policy cuentas_crear on public.cuentas for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy cuentas_editar on public.cuentas for update to authenticated
  using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));

create policy cc_ver on public.centros_costo for select to authenticated using (public.es_miembro(empresa_id));
create policy cc_crear on public.centros_costo for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy cc_editar on public.centros_costo for update to authenticated
  using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));

create policy periodos_ver on public.periodos_cerrados for select to authenticated using (public.es_miembro(empresa_id));
create policy asientos_ver on public.asientos for select to authenticated using (public.es_miembro(empresa_id));
create policy lineas_ver on public.asiento_lineas for select to authenticated using (public.es_miembro(empresa_id));
create policy auditoria_ver on public.auditoria for select to authenticated using (public.es_admin(empresa_id));
create policy indicadores_ver on public.indicadores for select to authenticated using (true);
-- correlativos: sin políticas, sólo las funciones los tocan.

-- Nunca dejar una empresa sin administrador activo
create or replace function public.tg_mantener_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_empresa uuid := coalesce(old.empresa_id, new.empresa_id);
begin
  if not exists (select 1 from miembros where empresa_id = v_empresa and rol = 'admin' and estado = 'activo') then
    raise exception 'La empresa debe tener al menos un administrador activo';
  end if;
  return null;
end $$;
create constraint trigger miembros_mantener_admin after update or delete on public.miembros
  deferrable initially immediate for each row execute function public.tg_mantener_admin();

-- Perfil automático al registrarse
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger auth_nuevo_usuario after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

-- ─────────────────────────── Funciones de negocio ───────────────────────────
-- Crear empresa: el creador queda como administrador y recibe el plan de cuentas modelo.
create or replace function public.crear_empresa(
  p_rut text, p_razon_social text, p_giro text default null, p_domicilio text default null,
  p_comuna text default null, p_ciudad text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rut text := rut_normalizado(p_rut);
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if not rut_valido(p_rut) then raise exception 'El RUT % no es válido', p_rut; end if;
  if exists (select 1 from empresas where rut = v_rut) then
    raise exception 'Ya existe una empresa con RUT %', v_rut;
  end if;
  insert into empresas (rut, razon_social, giro, domicilio, comuna, ciudad, creada_por)
  values (v_rut, trim(p_razon_social), p_giro, p_domicilio, p_comuna, p_ciudad, auth.uid())
  returning id into v_id;
  insert into miembros (empresa_id, usuario_id, rol, estado) values (v_id, auth.uid(), 'admin', 'activo');
  insert into cuentas (empresa_id, codigo, nombre, tipo, naturaleza, acepta_movimientos, acepta_centro_costo, tipo_auxiliar, tipo_iva)
  select v_id, p.codigo, p.nombre, p.tipo, p.naturaleza,
         p.tipo not in ('T', 'S'),
         p.tipo in ('C', 'I'),
         case p.codigo when '1104001' then 'cliente' when '2102001' then 'proveedor'
                       when '2102006' then 'honorario' when '3202019' then 'honorario' end,
         case p.codigo when '1108002' then 'iva_credito' when '1108008' then 'iva_credito_activo_fijo'
                       when '1108006' then 'impuesto_adicional_recuperable' when '2103003' then 'iva_debito'
                       when '2103005' then 'iva_retenido' end
  from pdc_plantilla p;
  insert into auditoria (empresa_id, accion, detalle)
  values (v_id, 'crear_empresa', jsonb_build_object('rut', v_rut, 'razon_social', p_razon_social));
  return v_id;
end $$;

-- Agregar un usuario ya registrado a la empresa (sólo administradores)
create or replace function public.agregar_miembro(p_empresa uuid, p_email text, p_rol public.rol_empresa)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_usuario uuid;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede agregar usuarios'; end if;
  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'No hay un usuario registrado con el correo %. Debe crear su cuenta primero.', p_email;
  end if;
  insert into public.miembros (empresa_id, usuario_id, rol, estado) values (p_empresa, v_usuario, p_rol, 'activo')
  on conflict (empresa_id, usuario_id) do update set rol = excluded.rol, estado = 'activo';
  insert into public.auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'agregar_miembro', jsonb_build_object('email', p_email, 'rol', p_rol));
  return v_usuario;
end $$;

create or replace function public.periodo_cerrado(p_empresa uuid, p_fecha date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from periodos_cerrados where empresa_id = p_empresa and periodo = to_char(p_fecha, 'YYYY-MM'))
$$;

-- Crear asiento: valida permisos, período, cuentas y cuadratura; asigna el correlativo
-- del año dentro de la misma transacción (sin huecos ni duplicados).
-- p_lineas: [{"cuenta":"1101201","debe":1000,"haber":0,"glosa":"...","centro_costo":"CC01","rut_auxiliar":"76151704-K"}]
create or replace function public.crear_asiento(
  p_empresa uuid, p_fecha date, p_glosa text, p_lineas jsonb,
  p_tipo text default 'manual', p_origen_id text default null)
returns table (id uuid, numero int) language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_num int; v_anio int := extract(year from p_fecha)::int;
  v_debe numeric := 0; v_haber numeric := 0; l jsonb; c record; i int := 0;
  v_cc text; v_rut text; v_d numeric; v_h numeric;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para registrar asientos en esta empresa'; end if;
  if periodo_cerrado(p_empresa, p_fecha) then
    raise exception 'El período % está cerrado', to_char(p_fecha, 'YYYY-MM');
  end if;
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
    select * into c from cuentas where empresa_id = p_empresa and codigo = l ->> 'cuenta';
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
    v_debe := v_debe + v_d; v_haber := v_haber + v_h;
  end loop;
  if v_debe <> v_haber then
    raise exception 'El asiento no cuadra: debe % y haber % (diferencia %)', v_debe, v_haber, v_debe - v_haber;
  end if;

  insert into correlativos as k (empresa_id, anio, ultimo) values (p_empresa, v_anio, 1)
  on conflict (empresa_id, anio) do update set ultimo = k.ultimo + 1
  returning ultimo into v_num;

  insert into asientos (empresa_id, anio, numero, fecha, glosa, tipo, origen_id, creado_por)
  values (p_empresa, v_anio, v_num, p_fecha, trim(p_glosa), coalesce(p_tipo, 'manual'), p_origen_id, auth.uid())
  returning asientos.id into v_id;

  i := 0;
  for l in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into asiento_lineas (asiento_id, empresa_id, orden, cuenta, debe, haber, glosa, centro_costo, rut_auxiliar, tipo_dte, folio)
    values (v_id, p_empresa, i, l ->> 'cuenta', coalesce((l ->> 'debe')::numeric, 0), coalesce((l ->> 'haber')::numeric, 0),
            nullif(l ->> 'glosa', ''), nullif(trim(coalesce(l ->> 'centro_costo', '')), ''),
            rut_normalizado(nullif(trim(coalesce(l ->> 'rut_auxiliar', '')), '')),
            nullif(l ->> 'tipo_dte', '')::int, nullif(l ->> 'folio', ''));
  end loop;

  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'crear_asiento', jsonb_build_object('id', v_id, 'numero', v_num, 'anio', v_anio, 'monto', v_debe));
  return query select v_id, v_num;
end $$;

-- Anular: conserva el número y excluye sus efectos (nunca se borra un asiento numerado)
create or replace function public.anular_asiento(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from asientos where id = p_id for update;
  if not found then raise exception 'El asiento no existe'; end if;
  if not puede_escribir(a.empresa_id) then raise exception 'No tienes permiso para anular asientos en esta empresa'; end if;
  if a.anulado then raise exception 'El asiento N°% ya está anulado', a.numero; end if;
  if periodo_cerrado(a.empresa_id, a.fecha) then raise exception 'El período % está cerrado', to_char(a.fecha, 'YYYY-MM'); end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Indica el motivo de la anulación'; end if;
  update asientos set anulado = true, anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo) where id = p_id;
  insert into auditoria (empresa_id, accion, detalle)
  values (a.empresa_id, 'anular_asiento', jsonb_build_object('id', p_id, 'numero', a.numero, 'motivo', p_motivo));
end $$;

create or replace function public.cerrar_periodo(p_empresa uuid, p_periodo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede cerrar períodos'; end if;
  insert into periodos_cerrados (empresa_id, periodo, cerrado_por) values (p_empresa, p_periodo, auth.uid())
  on conflict do nothing;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'cerrar_periodo', jsonb_build_object('periodo', p_periodo));
end $$;

create or replace function public.reabrir_periodo(p_empresa uuid, p_periodo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede reabrir períodos'; end if;
  delete from periodos_cerrados where empresa_id = p_empresa and periodo = p_periodo;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'reabrir_periodo', jsonb_build_object('periodo', p_periodo));
end $$;

-- Saldos por cuenta y año (excluye anulados). security_invoker: respeta el RLS de quien consulta.
create view public.saldos_cuentas with (security_invoker = true) as
  select l.empresa_id, a.anio, l.cuenta, sum(l.debe) as debe, sum(l.haber) as haber, sum(l.debe) - sum(l.haber) as saldo
  from asiento_lineas l join asientos a on a.id = l.asiento_id
  where not a.anulado
  group by l.empresa_id, a.anio, l.cuenta;

-- ─────────────────────────── Privilegios ───────────────────────────
-- Supabase concede por defecto ALL a anon/authenticated en objetos nuevos. Partimos de cero
-- y otorgamos sólo lo necesario (el RLS sigue siendo la barrera principal).
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update on public.perfiles, public.empresas, public.miembros, public.cuentas, public.centros_costo to authenticated;
grant insert on public.cuentas, public.centros_costo to authenticated;
grant delete on public.miembros to authenticated;
revoke all on public.correlativos from authenticated;
revoke execute on all functions in schema public from public;
grant execute on function public.rut_valido(text), public.rut_normalizado(text), public.es_miembro(uuid),
  public.puede_escribir(uuid), public.es_admin(uuid), public.comparte_empresa(uuid), public.periodo_cerrado(uuid, date),
  public.crear_empresa(text, text, text, text, text, text), public.agregar_miembro(uuid, text, public.rol_empresa),
  public.crear_asiento(uuid, date, text, jsonb, text, text), public.anular_asiento(uuid, text),
  public.cerrar_periodo(uuid, text), public.reabrir_periodo(uuid, text) to authenticated;
