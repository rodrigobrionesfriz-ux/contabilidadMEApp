-- UF del último día de cada mes (y UTM del mes) para remuneraciones. La tabla indicadores ya existía (lectura
-- para todos); se ingresa a mano desde Remuneraciones → Parámetros. Un administrador o contador de cualquier
-- empresa puede actualizarla (es la misma UF para todas las empresas).
-- Cerrar el libro exige que exista la UF del mes en la tabla y que el libro se haya calculado con ese valor.

alter table public.indicadores add column if not exists actualizado_por uuid references auth.users (id);

create or replace function public.guardar_indicador(p_periodo text, p_uf numeric, p_utm numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from miembros where usuario_id = auth.uid() and estado = 'activo' and rol in ('admin', 'contador')) then
    raise exception 'Sólo un administrador o contador puede actualizar los indicadores.';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Período inválido: %', p_periodo; end if;
  if p_uf is null or p_uf < 10000 or p_uf > 100000 then raise exception 'La UF % está fuera de rango (usa coma para decimales: 39.383,07).', p_uf; end if;
  if p_utm is not null and (p_utm < 30000 or p_utm > 200000) then raise exception 'La UTM % está fuera de rango.', p_utm; end if;
  insert into indicadores (periodo, uf, utm, actualizado, actualizado_por)
  values (p_periodo, round(p_uf, 2), round(p_utm), now(), auth.uid())
  on conflict (periodo) do update set uf = excluded.uf, utm = coalesce(excluded.utm, indicadores.utm), actualizado = now(), actualizado_por = auth.uid();
end $$;
revoke execute on function public.guardar_indicador(text, numeric, numeric) from public, anon;
grant execute on function public.guardar_indicador(text, numeric, numeric) to authenticated;

create or replace function public.libro_rem_exige_uf()
returns trigger language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  select uf into v from indicadores where periodo = new.periodo;
  if v is null then
    raise exception 'Falta la UF del último día de % en los indicadores. Ingrésala en Remuneraciones → Parámetros antes de cerrar el libro.', new.periodo;
  end if;
  if round(new.uf, 2) <> round(v, 2) then
    raise exception 'El libro se calculó con UF % y la UF de % en los indicadores es %. Recalcula antes de cerrar.', new.uf, new.periodo, v;
  end if;
  return new;
end $$;

drop trigger if exists libro_rem_exige_uf on public.libros_remuneraciones;
create trigger libro_rem_exige_uf before insert on public.libros_remuneraciones
  for each row execute function public.libro_rem_exige_uf();
