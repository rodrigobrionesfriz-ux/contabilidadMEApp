-- Rehacer una importación cuando los asientos registrados en el sistema nuevo de ese año
-- están todos anulados (por ejemplo, pruebas del F29 durante la marcha blanca).
-- Antes bastaba un asiento propio, aunque estuviera anulado, para impedirlo.
-- Los asientos propios vigentes siguen bloqueando: nunca se borra trabajo vigente.
create or replace function public.eliminar_importacion(p_empresa uuid, p_anio int)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int; v_propios int;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede eliminar una importación'; end if;
  if exists (select 1 from asientos where empresa_id = p_empresa and anio = p_anio and not importado and not anulado) then
    raise exception 'El año % tiene asientos vigentes registrados en el sistema nuevo; anúlalos antes de eliminar la importación', p_anio;
  end if;
  delete from documentos where empresa_id = p_empresa and anio = p_anio;
  delete from asientos where empresa_id = p_empresa and anio = p_anio and not importado and anulado;
  get diagnostics v_propios = row_count;
  delete from asientos where empresa_id = p_empresa and anio = p_anio and importado;
  get diagnostics v_n = row_count;
  delete from periodos_cerrados where empresa_id = p_empresa and periodo like p_anio || '-%';
  delete from correlativos where empresa_id = p_empresa and anio = p_anio;
  delete from importaciones where empresa_id = p_empresa and anio = p_anio;
  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'eliminar_importacion', jsonb_build_object('anio', p_anio, 'asientos', v_n, 'anulados_propios', v_propios));
  return v_n;
end $$;
