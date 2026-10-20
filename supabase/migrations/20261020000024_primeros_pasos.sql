-- Guía de puesta en marcha de una empresa nueva: pasos marcados a mano como listos u omitidos
-- (los demás se detectan solos: centros de costo, balance de apertura, indicadores, etc.).
alter table public.empresas add column if not exists primeros_pasos jsonb not null default '{}'::jsonb;

create or replace function public.marcar_paso(p_empresa uuid, p_paso text, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_escribir(p_empresa) then raise exception 'Sólo un administrador o contador puede marcar los pasos.'; end if;
  if p_paso !~ '^[a-z_]{2,30}$' then raise exception 'Paso inválido.'; end if;
  if p_estado is not null and p_estado not in ('listo', 'omitido') then raise exception 'Estado inválido.'; end if;
  update empresas set primeros_pasos = case when p_estado is null then primeros_pasos - p_paso
    else primeros_pasos || jsonb_build_object(p_paso, p_estado) end
  where id = p_empresa;
end $$;
revoke execute on function public.marcar_paso(uuid, text, text) from public, anon;
grant execute on function public.marcar_paso(uuid, text, text) to authenticated;
