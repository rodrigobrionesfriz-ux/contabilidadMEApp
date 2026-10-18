-- Contabilidad ME · fase 5b: feriados, configuración Previred, finiquitos y sus plantillas.

-- Feriados adicionales o quitados (vacaciones) y códigos manuales para Previred
alter table public.empresa_parametros
  add column feriados jsonb not null default '{"extra": [], "quitar": []}'::jsonb,
  add column previred jsonb not null default '{}'::jsonb;

-- Plantillas de finiquito propias de la empresa (o versión editada de una plantilla tipo: codigo = id de la tipo)
create table public.finiquito_plantillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  causal text not null default '',
  texto text not null check (length(trim(texto)) > 0),
  actualizado timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create table public.finiquitos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete restrict,
  fecha_termino date not null,
  causal text not null,
  datos jsonb not null,          -- lo ingresado en el formulario
  calc jsonb not null,           -- foto del cálculo al guardar
  total numeric(14, 0) not null,
  texto text,                    -- texto propio de este finiquito (si no, el de la plantilla)
  estado text not null default 'borrador' check (estado in ('borrador', 'ratificado')),
  ratificado_en timestamptz,
  asiento_id uuid references public.asientos (id) on delete set null,
  creado_por uuid references auth.users (id) default auth.uid(),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index finiquitos_empresa_idx on public.finiquitos (empresa_id, fecha_termino);

-- ¿Tiene el finiquito un asiento vigente?
create or replace function public.finiquito_contabilizado(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from finiquitos f join asientos a on a.id = f.asiento_id where f.id = p_id and not a.anulado)
$$;

alter table public.finiquito_plantillas enable row level security;
alter table public.finiquitos enable row level security;

create policy fpl_ver on public.finiquito_plantillas for select to authenticated using (public.es_miembro(empresa_id));
create policy fpl_crear on public.finiquito_plantillas for insert to authenticated with check (public.puede_escribir(empresa_id));
create policy fpl_editar on public.finiquito_plantillas for update to authenticated using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy fpl_borrar on public.finiquito_plantillas for delete to authenticated using (public.puede_escribir(empresa_id));

create policy fin_ver on public.finiquitos for select to authenticated using (public.es_miembro(empresa_id));
create policy fin_crear on public.finiquitos for insert to authenticated with check (public.puede_escribir(empresa_id));
-- Un finiquito contabilizado sólo puede cambiar de estado (ratificado/borrador); para editarlo hay que anular su asiento
create policy fin_editar on public.finiquitos for update to authenticated
  using (public.puede_escribir(empresa_id)) with check (public.puede_escribir(empresa_id));
create policy fin_borrar on public.finiquitos for delete to authenticated
  using (public.puede_escribir(empresa_id) and not public.finiquito_contabilizado(id));

create or replace function public.tg_finiquito_bloqueo()
returns trigger language plpgsql as $$
begin
  if public.finiquito_contabilizado(old.id) and (new.datos is distinct from old.datos or new.calc is distinct from old.calc
     or new.total is distinct from old.total or new.fecha_termino is distinct from old.fecha_termino or new.causal is distinct from old.causal
     or new.trabajador_id is distinct from old.trabajador_id) then
    raise exception 'El finiquito está contabilizado: anula primero su asiento para modificarlo';
  end if;
  new.actualizado := now();
  return new;
end $$;
create trigger finiquitos_bloqueo before update on public.finiquitos for each row execute function public.tg_finiquito_bloqueo();

-- Contabilizar: un solo asiento vigente por finiquito
create or replace function public.contabilizar_finiquito(p_id uuid, p_fecha date, p_glosa text, p_lineas jsonb)
returns table (asiento_id uuid, numero int) language plpgsql security definer set search_path = public as $$
declare f record; v_as uuid; v_num int;
begin
  select * into f from finiquitos where id = p_id for update;
  if not found then raise exception 'El finiquito no existe'; end if;
  if not puede_escribir(f.empresa_id) then raise exception 'No tienes permiso para contabilizar en esta empresa'; end if;
  if finiquito_contabilizado(p_id) then raise exception 'El finiquito ya está contabilizado. Anula ese asiento para generar otro.'; end if;
  select c.id, c.numero into v_as, v_num from crear_asiento(f.empresa_id, p_fecha, p_glosa, p_lineas, 'finiquito', 'fin:' || p_id) c;
  update finiquitos set asiento_id = v_as where id = p_id;
  insert into auditoria (empresa_id, accion, detalle)
  values (f.empresa_id, 'contabilizar_finiquito', jsonb_build_object('finiquito', p_id, 'asiento', v_num, 'total', f.total));
  return query select v_as, v_num;
end $$;

revoke all on public.finiquito_plantillas, public.finiquitos from anon, authenticated;
grant select, insert, update, delete on public.finiquito_plantillas to authenticated;
grant select, delete on public.finiquitos to authenticated;
grant insert (empresa_id, trabajador_id, fecha_termino, causal, datos, calc, total, texto, estado) on public.finiquitos to authenticated;
grant update (trabajador_id, fecha_termino, causal, datos, calc, total, texto, estado, ratificado_en) on public.finiquitos to authenticated;

revoke execute on function public.finiquito_contabilizado(uuid), public.contabilizar_finiquito(uuid, date, text, jsonb) from public, anon;
grant execute on function public.finiquito_contabilizado(uuid), public.contabilizar_finiquito(uuid, date, text, jsonb) to authenticated;
