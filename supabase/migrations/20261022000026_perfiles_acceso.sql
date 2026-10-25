-- Usuarios y perfiles de acceso (10z10)
-- · Administrador del sistema: entra a todas las empresas (propias o de otros) con todos los permisos, y es el único
--   que edita los perfiles y asigna el perfil de cada usuario.
-- · Perfiles de acceso (editables por el administrador): tipo "senior" (puede crear empresas y autorizar a otros
--   usuarios en ellas) o "contador" (sólo trabaja en las empresas que le asignen). Cada perfil define, por módulo,
--   si no tiene acceso, sólo ve, o edita.
-- · Cada usuario ve sólo las empresas donde es miembro (las suyas y las asignadas), salvo el administrador.

create table public.perfiles_acceso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  tipo text not null check (tipo in ('senior', 'contador')),
  -- { "modulo": "editar" | "ver" | "no" }
  permisos jsonb not null default '{}' check (jsonb_typeof(permisos) = 'object'),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Ajustes del sistema (una sola fila): perfil que recibe quien se registra
create table public.ajustes_sistema (
  id boolean primary key default true check (id),
  perfil_nuevo uuid references public.perfiles_acceso (id) on delete set null
);

alter table public.perfiles
  add column if not exists es_administrador boolean not null default false,
  add column if not exists perfil_acceso uuid references public.perfiles_acceso (id) on delete set null;

-- Perfiles iniciales
insert into public.perfiles_acceso (nombre, tipo, permisos) values
  ('Senior', 'senior', '{"documentos":"editar","honorarios":"editar","remuneraciones":"editar","auxiliares":"editar","comprobantes":"editar","reportes":"editar","conciliacion":"editar","tributario":"editar","inventario":"editar","activo_fijo":"editar","cierre":"editar","configuracion":"editar","usuarios":"editar"}'),
  ('Contador', 'contador', '{"documentos":"editar","honorarios":"editar","remuneraciones":"editar","auxiliares":"editar","comprobantes":"editar","reportes":"ver","conciliacion":"editar","tributario":"editar","inventario":"editar","activo_fijo":"editar","cierre":"ver","configuracion":"ver","usuarios":"no"}');
insert into public.ajustes_sistema (perfil_nuevo) select id from public.perfiles_acceso where nombre = 'Contador';

-- Usuarios existentes: dueños de alguna empresa → Senior; el resto → Contador.
update public.perfiles p set perfil_acceso = (select id from perfiles_acceso where nombre =
  case when exists (select 1 from miembros m where m.usuario_id = p.id and m.rol = 'admin') then 'Senior' else 'Contador' end)
where perfil_acceso is null;
-- Administrador del sistema: el usuario registrado más antiguo (si todavía no hay uno).
update public.perfiles set es_administrador = true
where id = (select id from perfiles order by creado, id limit 1)
  and not exists (select 1 from perfiles where es_administrador);

-- ─────────────── Permisos ───────────────
create or replace function public.es_administrador()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_administrador from perfiles where id = auth.uid()), false)
$$;

create or replace function public.es_miembro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_administrador() or exists (select 1 from miembros
    where empresa_id = p_empresa and usuario_id = auth.uid() and estado = 'activo')
$$;

create or replace function public.puede_escribir(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_administrador() or exists (select 1 from miembros
    where empresa_id = p_empresa and usuario_id = auth.uid() and estado = 'activo' and rol in ('admin', 'contador'))
$$;

-- "Administrador de la empresa" = su dueño (o el administrador del sistema)
create or replace function public.es_admin(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select es_administrador() or exists (select 1 from miembros
    where empresa_id = p_empresa and usuario_id = auth.uid() and estado = 'activo' and rol = 'admin')
$$;

-- El administrador ve a todos los usuarios; los demás, a sí mismos y a sus colegas de empresa.
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_administrador() or public.comparte_empresa(id));
-- Cada usuario cambia sólo su nombre: el perfil y el rol de administrador se asignan con asignar_perfil.
revoke insert, update, delete on public.perfiles from authenticated;
grant update (nombre) on public.perfiles to authenticated;

alter table public.perfiles_acceso enable row level security;
create policy pacc_ver on public.perfiles_acceso for select to authenticated using (true);
revoke all on public.perfiles_acceso from anon, authenticated;
grant select on public.perfiles_acceso to authenticated;

alter table public.ajustes_sistema enable row level security;
create policy ajustes_ver on public.ajustes_sistema for select to authenticated using (true);
revoke all on public.ajustes_sistema from anon, authenticated;
grant select on public.ajustes_sistema to authenticated;

-- Perfil del usuario actual: tipo y permisos por módulo (para la app)
create or replace function public.mi_acceso()
returns table (es_administrador boolean, perfil text, tipo text, permisos jsonb)
language sql stable security definer set search_path = public as $$
  select p.es_administrador, a.nombre, a.tipo, coalesce(a.permisos, '{}'::jsonb)
  from perfiles p left join perfiles_acceso a on a.id = p.perfil_acceso
  where p.id = auth.uid()
$$;

-- ─────────────── Edición de perfiles (sólo el administrador) ───────────────
create or replace function public.guardar_perfil_acceso(p_id uuid, p_nombre text, p_tipo text, p_permisos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; k text; v text;
begin
  if not es_administrador() then raise exception 'Sólo el administrador puede editar los perfiles'; end if;
  if p_tipo not in ('senior', 'contador') then raise exception 'Tipo de perfil no válido'; end if;
  if jsonb_typeof(p_permisos) <> 'object' then raise exception 'Permisos no válidos'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_permisos) loop
    if k !~ '^[a-z_]{2,30}$' or v not in ('editar', 'ver', 'no') then raise exception 'Permiso no válido: % = %', k, v; end if;
  end loop;
  if p_id is null then
    insert into perfiles_acceso (nombre, tipo, permisos) values (trim(p_nombre), p_tipo, p_permisos) returning id into v_id;
  else
    update perfiles_acceso set nombre = trim(p_nombre), tipo = p_tipo, permisos = p_permisos, actualizado = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'El perfil no existe'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.eliminar_perfil_acceso(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Sólo el administrador puede editar los perfiles'; end if;
  if exists (select 1 from perfiles where perfil_acceso = p_id) then
    raise exception 'Hay usuarios con este perfil: asígnales otro antes de eliminarlo';
  end if;
  if exists (select 1 from ajustes_sistema where perfil_nuevo = p_id) then
    raise exception 'Es el perfil de los usuarios nuevos: elige otro antes de eliminarlo';
  end if;
  delete from perfiles_acceso where id = p_id;
end $$;

-- Asigna perfil y/o rol de administrador a un usuario. Siempre debe quedar al menos un administrador.
create or replace function public.asignar_perfil(p_usuario uuid, p_perfil uuid, p_es_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Sólo el administrador puede asignar perfiles'; end if;
  if p_perfil is not null and not exists (select 1 from perfiles_acceso where id = p_perfil) then raise exception 'El perfil no existe'; end if;
  update perfiles set perfil_acceso = p_perfil, es_administrador = coalesce(p_es_admin, es_administrador) where id = p_usuario;
  if not found then raise exception 'El usuario no existe'; end if;
  if not exists (select 1 from perfiles where es_administrador) then
    raise exception 'Debe quedar al menos un administrador del sistema';
  end if;
end $$;

create or replace function public.perfil_usuarios_nuevos(p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Sólo el administrador puede cambiar este ajuste'; end if;
  update ajustes_sistema set perfil_nuevo = p_perfil;
end $$;

-- Usuarios con su perfil y cuántas empresas tienen (pantalla del administrador)
create or replace function public.usuarios_sistema()
returns table (id uuid, nombre text, email text, es_administrador boolean, perfil_acceso uuid, empresas int, creado timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.email, p.es_administrador, p.perfil_acceso,
         (select count(*)::int from miembros m where m.usuario_id = p.id and m.estado = 'activo'), p.creado
  from perfiles p where es_administrador() order by p.creado
$$;

revoke execute on function public.guardar_perfil_acceso(uuid, text, text, jsonb), public.eliminar_perfil_acceso(uuid),
  public.asignar_perfil(uuid, uuid, boolean), public.perfil_usuarios_nuevos(uuid), public.usuarios_sistema(), public.mi_acceso(),
  public.es_administrador() from public, anon;
grant execute on function public.guardar_perfil_acceso(uuid, text, text, jsonb), public.eliminar_perfil_acceso(uuid),
  public.asignar_perfil(uuid, uuid, boolean), public.perfil_usuarios_nuevos(uuid), public.usuarios_sistema(), public.mi_acceso(),
  public.es_administrador() to authenticated;

-- Quien se registra recibe el perfil de usuarios nuevos
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, email, nombre, perfil_acceso)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
          (select perfil_nuevo from ajustes_sistema limit 1))
  on conflict (id) do nothing;
  return new;
end $$;

-- ─────────────── Empresas y miembros ───────────────
-- Crear empresa: sólo el administrador o un usuario con perfil senior. El creador queda como dueño.
create or replace function public.puede_crear_empresas()
returns boolean language sql stable security definer set search_path = public as $$
  select es_administrador() or exists (select 1 from perfiles p join perfiles_acceso a on a.id = p.perfil_acceso
    where p.id = auth.uid() and a.tipo = 'senior')
$$;
grant execute on function public.puede_crear_empresas() to authenticated;

create or replace function public.tg_crear_empresa_permiso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not puede_crear_empresas() then
    raise exception 'Tu perfil no permite crear empresas. Pide al administrador o a un usuario Senior que te asigne una.';
  end if;
  return new;
end $$;
drop trigger if exists empresas_crear_permiso on public.empresas;
create trigger empresas_crear_permiso before insert on public.empresas
  for each row execute function public.tg_crear_empresa_permiso();

-- Agregar usuario a una empresa: su dueño (Senior) o el administrador. Sólo el administrador puede nombrar otro dueño.
create or replace function public.agregar_miembro(p_empresa uuid, p_email text, p_rol public.rol_empresa)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_usuario uuid;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo el dueño de la empresa o el administrador puede agregar usuarios'; end if;
  if p_rol = 'admin' and not es_administrador() then raise exception 'Sólo el administrador puede agregar otro dueño a la empresa'; end if;
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

-- Un dueño (no administrador) no puede ascender a otro miembro a dueño
create or replace function public.tg_miembros_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.rol = 'admin' and old.rol <> 'admin' and not es_administrador() then
    raise exception 'Sólo el administrador puede nombrar otro dueño de la empresa';
  end if;
  return new;
end $$;
drop trigger if exists miembros_rol on public.miembros;
create trigger miembros_rol before update on public.miembros for each row execute function public.tg_miembros_rol();

-- guardar_indicador: también el administrador del sistema (aunque no sea miembro de ninguna empresa)
create or replace function public.guardar_indicador(p_periodo text, p_uf numeric, p_utm numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() and not exists (select 1 from miembros where usuario_id = auth.uid() and estado = 'activo' and rol in ('admin', 'contador')) then
    raise exception 'Sólo un administrador o contador puede actualizar los indicadores.';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Período inválido: %', p_periodo; end if;
  if p_uf is null and p_utm is null then raise exception 'Indica la UF o la UTM de %.', p_periodo; end if;
  if p_uf is not null and (p_uf < 10000 or p_uf > 100000) then raise exception 'La UF % está fuera de rango (usa coma para decimales: 39.383,07).', p_uf; end if;
  if p_utm is not null and (p_utm < 30000 or p_utm > 200000) then raise exception 'La UTM % está fuera de rango.', p_utm; end if;
  insert into indicadores (periodo, uf, utm, actualizado, actualizado_por)
  values (p_periodo, round(p_uf, 2), round(p_utm), now(), auth.uid())
  on conflict (periodo) do update set uf = coalesce(excluded.uf, indicadores.uf), utm = coalesce(excluded.utm, indicadores.utm),
    actualizado = now(), actualizado_por = auth.uid();
end $$;
