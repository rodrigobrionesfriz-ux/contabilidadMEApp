-- Contabilidad ME · fase 4: F29 mensual, PPM, compensación y pago.

alter table public.empresas add column tasa_ppm numeric(6, 3) not null default 0 check (tasa_ppm >= 0 and tasa_ppm < 100);
grant update (tasa_ppm) on public.empresas to authenticated;

create table public.f29_declaraciones (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo char(7) not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  estado text not null default 'borrador' check (estado in ('borrador', 'presentado')),
  declarado jsonb not null default '{}'::jsonb,
  utm numeric(10, 0),
  remanente_inicial numeric(14, 0),
  calculado jsonb,
  actualizado timestamptz not null default now(),
  presentado_en timestamptz,
  presentado_por uuid references auth.users (id),
  primary key (empresa_id, periodo)
);
alter table public.f29_declaraciones enable row level security;
create policy f29_ver on public.f29_declaraciones for select to authenticated using (public.es_miembro(empresa_id));
revoke all on public.f29_declaraciones from anon, authenticated;
grant select on public.f29_declaraciones to authenticated;

-- Guardar valores declarados (borrador). p_declarado: {"89": 123, "77": 0, ...}
create or replace function public.guardar_f29(p_empresa uuid, p_periodo text, p_declarado jsonb, p_utm numeric, p_remanente_inicial numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para editar el F29'; end if;
  if exists (select 1 from f29_declaraciones where empresa_id = p_empresa and periodo = p_periodo and estado = 'presentado') then
    raise exception 'El F29 de % está presentado. Reábrelo para modificarlo.', p_periodo;
  end if;
  insert into f29_declaraciones (empresa_id, periodo, declarado, utm, remanente_inicial)
  values (p_empresa, p_periodo, coalesce(p_declarado, '{}'), nullif(p_utm, 0), p_remanente_inicial)
  on conflict (empresa_id, periodo) do update
    set declarado = excluded.declarado, utm = excluded.utm, remanente_inicial = excluded.remanente_inicial, actualizado = now();
end $$;

-- Presentar: congela lo declarado y una foto de lo calculado
create or replace function public.presentar_f29(p_empresa uuid, p_periodo text, p_declarado jsonb, p_calculado jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para presentar el F29'; end if;
  if exists (select 1 from f29_declaraciones where empresa_id = p_empresa and periodo = p_periodo and estado = 'presentado') then
    raise exception 'El F29 de % ya está presentado', p_periodo;
  end if;
  insert into f29_declaraciones (empresa_id, periodo, estado, declarado, calculado, presentado_en, presentado_por)
  values (p_empresa, p_periodo, 'presentado', coalesce(p_declarado, '{}'), p_calculado, now(), auth.uid())
  on conflict (empresa_id, periodo) do update
    set estado = 'presentado', declarado = excluded.declarado, calculado = excluded.calculado,
        presentado_en = now(), presentado_por = auth.uid(), actualizado = now();
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'presentar_f29', jsonb_build_object('periodo', p_periodo, 'declarado', p_declarado));
end $$;

create or replace function public.reabrir_f29(p_empresa uuid, p_periodo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede reabrir un F29 presentado'; end if;
  update f29_declaraciones set estado = 'borrador', actualizado = now() where empresa_id = p_empresa and periodo = p_periodo;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'reabrir_f29', jsonb_build_object('periodo', p_periodo));
end $$;

-- Impuesto único de segunda categoría por mes: saldo acreedor de 2104002 en asientos de remuneraciones
create or replace function public.iusc_por_periodo(p_empresa uuid, p_anio int)
returns table (periodo text, monto numeric) language sql stable security invoker set search_path = public as $$
  select to_char(a.fecha, 'YYYY-MM'), sum(l.haber - l.debe)
  from asiento_lineas l join asientos a on a.id = l.asiento_id
  where l.empresa_id = p_empresa and a.anio = p_anio and not a.anulado and a.tipo = 'remuneraciones' and l.cuenta = '2104002'
  group by 1
$$;

revoke execute on function public.guardar_f29(uuid, text, jsonb, numeric, numeric), public.presentar_f29(uuid, text, jsonb, jsonb),
  public.reabrir_f29(uuid, text), public.iusc_por_periodo(uuid, int) from public, anon;
grant execute on function public.guardar_f29(uuid, text, jsonb, numeric, numeric), public.presentar_f29(uuid, text, jsonb, jsonb),
  public.reabrir_f29(uuid, text), public.iusc_por_periodo(uuid, int) to authenticated;
