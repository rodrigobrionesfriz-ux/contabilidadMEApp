-- RCV cargados, guardados por empresa, tipo y período, para retomar la importación en otra sesión.
-- docs: los documentos leídos del archivo (DocRCV, con su registro SII completo); descartadas: filas no importables.
-- Cargar de nuevo el mismo período combina los documentos (el más reciente reemplaza al anterior con la misma clave).

create table public.rcv_cargas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo text not null check (tipo in ('compra', 'venta')),
  periodo char(7) not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  archivo text not null,
  docs jsonb not null default '[]' check (jsonb_typeof(docs) = 'array'),
  descartadas jsonb not null default '[]' check (jsonb_typeof(descartadas) = 'array'),
  cargado_por uuid default auth.uid() references auth.users (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (empresa_id, tipo, periodo)
);

alter table public.rcv_cargas enable row level security;
create policy rcvc_ver on public.rcv_cargas for select to authenticated using (public.es_miembro(empresa_id));
create policy rcvc_crear on public.rcv_cargas for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy rcvc_editar on public.rcv_cargas for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy rcvc_borrar on public.rcv_cargas for delete to authenticated using (public.puede_escribir(empresa_id));
revoke all on public.rcv_cargas from anon, authenticated;
grant select, insert, update, delete on public.rcv_cargas to authenticated;

-- Resumen por período: documentos del RCV guardado y cuántos faltan por registrar en el libro
-- (un documento cuenta como registrado si hay uno vigente con el mismo RUT, tipo de DTE y folio).
create or replace function public.rcv_resumen(p_empresa uuid, p_tipo text)
returns table (periodo text, archivo text, total int, pendientes int, actualizado timestamptz)
language sql stable security invoker set search_path = public as $$
  select c.periodo::text, c.archivo, jsonb_array_length(c.docs),
         (select count(*)::int from jsonb_array_elements(c.docs) d
          where not exists (select 1 from documentos x
                            where x.empresa_id = c.empresa_id and x.tipo = c.tipo
                              and x.rut = rut_normalizado((d ->> 'rutCodigo') || (d ->> 'rutDV'))
                              and x.tipo_dte = (d ->> 'tipoDTE')::int and x.folio = d ->> 'numero'
                              and coalesce(x.estado, '') <> 'anulado')),
         c.actualizado
  from rcv_cargas c
  where c.empresa_id = p_empresa and c.tipo = p_tipo
  order by c.periodo desc
$$;
revoke execute on function public.rcv_resumen(uuid, text) from public, anon;
grant execute on function public.rcv_resumen(uuid, text) to authenticated;
