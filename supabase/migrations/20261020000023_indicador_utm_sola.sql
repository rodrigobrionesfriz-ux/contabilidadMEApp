-- guardar_indicador acepta solo la UTM (UF nula): sirve para el mes en curso, cuando la API ya publicó
-- la UTM pero aún no llega el último día del mes. La UF existente no se toca.
create or replace function public.guardar_indicador(p_periodo text, p_uf numeric, p_utm numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from miembros where usuario_id = auth.uid() and estado = 'activo' and rol in ('admin', 'contador')) then
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
