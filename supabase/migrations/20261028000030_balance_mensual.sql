-- Sumas por cuenta y mes de un año, en una sola consulta (resumen de la empresa).
-- Antes el resumen pedía balance_comprobacion 12 veces, una por mes.
-- security invoker: respeta el RLS de quien consulta, igual que balance_comprobacion.
create or replace function public.balance_mensual(p_empresa uuid, p_anio int)
returns table (mes int, cuenta text, nombre text, tipo char(1), debe numeric, haber numeric)
language sql stable security invoker set search_path = public as $$
  select extract(month from a.fecha)::int, l.cuenta, c.nombre, c.tipo, sum(l.debe), sum(l.haber)
  from asiento_lineas l
  join asientos a on a.id = l.asiento_id
  join cuentas c on c.empresa_id = l.empresa_id and c.codigo = l.cuenta
  where l.empresa_id = p_empresa and a.anio = p_anio and not a.anulado
  group by 1, l.cuenta, c.nombre, c.tipo
  order by 1, l.cuenta
$$;
revoke execute on function public.balance_mensual(uuid, int) from public;
grant execute on function public.balance_mensual(uuid, int) to authenticated;
