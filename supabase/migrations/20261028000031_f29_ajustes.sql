-- Contabilidad ME · F29: ajustes por mes (tasa PPM congelada o manual, códigos a mano y anticipo cambio de sujeto).
-- ajustes: {"tasaPPM": 0.125, "tasaPPMManual": true, "manual": {"110": 120, "111": 45000},
--           "anticipo": {"556": 2308, "557": 1395, "558": 0}, "remanenteAnticipoInicial": 3703}

alter table public.f29_declaraciones add column if not exists ajustes jsonb not null default '{}'::jsonb;

-- F29 ya guardados: se graba la tasa con que se declararon (cód. 62 ÷ cód. 563 cuando cuadra exacto;
-- si no, la tasa actual de la empresa). Así un cambio posterior de tasa no altera sus PPM.
update public.f29_declaraciones f
set ajustes = f.ajustes || jsonb_build_object('tasaPPM', coalesce(
  (select t from (select round((f.declarado->>'62')::numeric * 100 / nullif((f.declarado->>'563')::numeric, 0), 3) as t) x
   where t is not null and round((f.declarado->>'563')::numeric * t / 100) = (f.declarado->>'62')::numeric),
  (select e.tasa_ppm from public.empresas e where e.id = f.empresa_id)))
where not (f.ajustes ? 'tasaPPM');

-- Tasa vigente de la empresa (para congelarla al guardar)
create or replace function public.f29_congelar_tasa(p_empresa uuid, p_ajustes jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when coalesce(p_ajustes, '{}') ? 'tasaPPM' and p_ajustes->'tasaPPM' <> 'null'::jsonb then p_ajustes
    else coalesce(p_ajustes, '{}') || jsonb_build_object('tasaPPM', (select tasa_ppm from empresas where id = p_empresa)) end
$$;

-- Guardar borrador: además congela la tasa PPM del mes
create or replace function public.guardar_f29(p_empresa uuid, p_periodo text, p_declarado jsonb, p_utm numeric, p_remanente_inicial numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para editar el F29'; end if;
  if exists (select 1 from f29_declaraciones where empresa_id = p_empresa and periodo = p_periodo and estado = 'presentado') then
    raise exception 'El F29 de % está presentado. Reábrelo para modificarlo.', p_periodo;
  end if;
  insert into f29_declaraciones (empresa_id, periodo, declarado, utm, remanente_inicial, ajustes)
  values (p_empresa, p_periodo, coalesce(p_declarado, '{}'), nullif(p_utm, 0), p_remanente_inicial, f29_congelar_tasa(p_empresa, '{}'))
  on conflict (empresa_id, periodo) do update
    set declarado = excluded.declarado, utm = excluded.utm, remanente_inicial = excluded.remanente_inicial,
        ajustes = f29_congelar_tasa(p_empresa, f29_declaraciones.ajustes), actualizado = now();
end $$;

-- Presentar: congela lo declarado, una foto de lo calculado y la tasa PPM
create or replace function public.presentar_f29(p_empresa uuid, p_periodo text, p_declarado jsonb, p_calculado jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para presentar el F29'; end if;
  if exists (select 1 from f29_declaraciones where empresa_id = p_empresa and periodo = p_periodo and estado = 'presentado') then
    raise exception 'El F29 de % ya está presentado', p_periodo;
  end if;
  insert into f29_declaraciones (empresa_id, periodo, estado, declarado, calculado, presentado_en, presentado_por, ajustes)
  values (p_empresa, p_periodo, 'presentado', coalesce(p_declarado, '{}'), p_calculado, now(), auth.uid(), f29_congelar_tasa(p_empresa, '{}'))
  on conflict (empresa_id, periodo) do update
    set estado = 'presentado', declarado = excluded.declarado, calculado = excluded.calculado,
        presentado_en = now(), presentado_por = auth.uid(), ajustes = f29_congelar_tasa(p_empresa, f29_declaraciones.ajustes), actualizado = now();
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'presentar_f29', jsonb_build_object('periodo', p_periodo, 'declarado', p_declarado));
end $$;

-- Ajustes del mes (reemplaza el objeto completo). No toca lo declarado ni el estado.
create or replace function public.guardar_f29_ajustes(p_empresa uuid, p_periodo text, p_ajustes jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para editar el F29'; end if;
  if p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Período no válido'; end if;
  if jsonb_typeof(coalesce(p_ajustes, '{}')) <> 'object' then raise exception 'Ajustes no válidos'; end if;
  if exists (select 1 from f29_declaraciones where empresa_id = p_empresa and periodo = p_periodo and estado = 'presentado') then
    raise exception 'El F29 de % está presentado. Reábrelo para modificarlo.', p_periodo;
  end if;
  insert into f29_declaraciones (empresa_id, periodo, ajustes)
  values (p_empresa, p_periodo, coalesce(p_ajustes, '{}'))
  on conflict (empresa_id, periodo) do update set ajustes = coalesce(p_ajustes, '{}'), actualizado = now();
end $$;

revoke execute on function public.f29_congelar_tasa(uuid, jsonb), public.guardar_f29_ajustes(uuid, text, jsonb) from public, anon;
grant execute on function public.guardar_f29_ajustes(uuid, text, jsonb) to authenticated;
