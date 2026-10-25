-- Cuentas y contraseñas sin depender del correo (el plan gratis de Supabase envía pocos correos, no deja editar las
-- plantillas y el antivirus de Outlook/Live gasta los enlaces):
-- · confirmar_cuenta: la cuenta que el administrador o el dueño de una empresa crea desde la app queda confirmada
--   al tiro, y la persona entra con la contraseña temporal.
-- · restablecer_clave: el administrador le pone una contraseña temporal a cualquier usuario.

create or replace function public.confirmar_cuenta(p_usuario uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not (es_administrador() or exists (
      select 1 from miembros m where m.usuario_id = p_usuario and m.estado = 'activo' and es_admin(m.empresa_id))) then
    raise exception 'Sólo el administrador o el dueño de una empresa del usuario puede confirmar su cuenta';
  end if;
  -- Sólo cuentas recién creadas y sin confirmar
  update auth.users set email_confirmed_at = now(), updated_at = now()
  where id = p_usuario and email_confirmed_at is null and created_at > now() - interval '1 hour';
end $$;

create or replace function public.restablecer_clave(p_usuario uuid, p_clave text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not es_administrador() then raise exception 'Sólo el administrador puede restablecer contraseñas'; end if;
  if length(coalesce(p_clave, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
  where id = p_usuario;
  if not found then raise exception 'El usuario no existe'; end if;
end $$;

revoke execute on function public.confirmar_cuenta(uuid), public.restablecer_clave(uuid, text) from public, anon;
grant execute on function public.confirmar_cuenta(uuid), public.restablecer_clave(uuid, text) to authenticated;
