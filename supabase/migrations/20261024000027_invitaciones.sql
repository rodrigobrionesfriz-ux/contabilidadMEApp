-- Invitaciones: el administrador agrega usuarios nuevos (por ejemplo Senior) sin asociarlos a una empresa, y el dueño
-- de una empresa autoriza a alguien que aún no tiene cuenta. Al crear la cuenta con ese correo (la crea la propia
-- persona en Registro o se crea desde la app con una contraseña temporal), recibe el perfil y las empresas invitadas.

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  perfil_acceso uuid references public.perfiles_acceso (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete cascade,
  rol public.rol_empresa,
  invitado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  check ((empresa_id is null) = (rol is null))
);
create unique index invitaciones_perfil_uq on public.invitaciones (email) where empresa_id is null;
create unique index invitaciones_empresa_uq on public.invitaciones (email, empresa_id) where empresa_id is not null;

alter table public.invitaciones enable row level security;
create policy inv_ver on public.invitaciones for select to authenticated
  using (public.es_administrador() or (empresa_id is not null and public.es_admin(empresa_id)));
revoke all on public.invitaciones from anon, authenticated;
grant select on public.invitaciones to authenticated;

-- Administrador: agrega un usuario con su perfil. Si ya tiene cuenta, se le asigna el perfil de inmediato.
create or replace function public.invitar_usuario(p_email text, p_perfil uuid)
returns text language plpgsql security definer set search_path = public, auth as $$
declare v_email text := lower(trim(p_email)); v_usuario uuid;
begin
  if not es_administrador() then raise exception 'Sólo el administrador puede agregar usuarios al sistema'; end if;
  if p_perfil is null or not exists (select 1 from perfiles_acceso where id = p_perfil) then raise exception 'Elige un perfil'; end if;
  select id into v_usuario from auth.users where lower(email) = v_email;
  if v_usuario is not null then
    update perfiles set perfil_acceso = p_perfil where id = v_usuario;
    return 'existente';
  end if;
  insert into invitaciones (email, perfil_acceso) values (v_email, p_perfil)
  on conflict (email) where empresa_id is null do update set perfil_acceso = excluded.perfil_acceso, creado = now();
  return 'invitado';
end $$;

-- Agregar a una empresa: si la persona aún no tiene cuenta, queda invitada (devuelve null).
create or replace function public.agregar_miembro(p_empresa uuid, p_email text, p_rol public.rol_empresa)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_usuario uuid; v_email text := lower(trim(p_email));
begin
  if not es_admin(p_empresa) then raise exception 'Sólo el dueño de la empresa o el administrador puede agregar usuarios'; end if;
  if p_rol = 'admin' and not es_administrador() then raise exception 'Sólo el administrador puede agregar otro dueño a la empresa'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  select id into v_usuario from auth.users where lower(email) = v_email;
  if v_usuario is null then
    insert into invitaciones (email, empresa_id, rol) values (v_email, p_empresa, p_rol)
    on conflict (email, empresa_id) where empresa_id is not null do update set rol = excluded.rol, creado = now();
    insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'invitar_miembro', jsonb_build_object('email', v_email, 'rol', p_rol));
    return null;
  end if;
  insert into miembros (empresa_id, usuario_id, rol, estado) values (p_empresa, v_usuario, p_rol, 'activo')
  on conflict (empresa_id, usuario_id) do update set rol = excluded.rol, estado = 'activo';
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'agregar_miembro', jsonb_build_object('email', v_email, 'rol', p_rol));
  return v_usuario;
end $$;

create or replace function public.quitar_invitacion(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v invitaciones;
begin
  select * into v from invitaciones where id = p_id;
  if not found then return; end if;
  if not (es_administrador() or (v.empresa_id is not null and es_admin(v.empresa_id))) then raise exception 'No puedes quitar esta invitación'; end if;
  delete from invitaciones where id = p_id;
end $$;

revoke execute on function public.invitar_usuario(text, uuid), public.quitar_invitacion(uuid) from public, anon;
grant execute on function public.invitar_usuario(text, uuid), public.quitar_invitacion(uuid) to authenticated;

-- Al crearse la cuenta: perfil de la invitación (o el de usuarios nuevos) y las empresas a las que lo invitaron.
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(new.email));
begin
  insert into perfiles (id, email, nombre, perfil_acceso)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
          coalesce((select perfil_acceso from invitaciones where email = v_email and empresa_id is null),
                   (select perfil_nuevo from ajustes_sistema limit 1)))
  on conflict (id) do nothing;
  insert into miembros (empresa_id, usuario_id, rol, estado)
  select empresa_id, new.id, rol, 'activo' from invitaciones where email = v_email and empresa_id is not null
  on conflict (empresa_id, usuario_id) do nothing;
  delete from invitaciones where email = v_email;
  return new;
end $$;
