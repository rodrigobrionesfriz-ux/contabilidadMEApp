-- Contabilidad ME · Importar las declaraciones F29 del respaldo del sistema anterior (hoja "Datos", V2.22.13+).
-- importar_iniciar (vaciar_anio) borra las del año; con esto vuelven: lo declarado, la foto de lo calculado,
-- los ajustes del mes (tasa PPM, códigos a mano, anticipo) y el estado presentado.

create or replace function public.importar_f29(p_empresa uuid, p_items jsonb, p_tasa_ppm numeric default null)
returns int language plpgsql security definer set search_path = public as $$
declare d jsonb; n int := 0;
begin
  if not es_admin(p_empresa) then raise exception 'Sólo un administrador puede importar datos'; end if;
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' then raise exception 'Declaraciones no válidas'; end if;
  for d in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    if (d ->> 'periodo') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then continue; end if;
    insert into f29_declaraciones (empresa_id, periodo, estado, declarado, utm, remanente_inicial, calculado, ajustes, presentado_en, actualizado)
    values (p_empresa, d ->> 'periodo',
            case when d ->> 'estado' = 'presentado' then 'presentado' else 'borrador' end,
            coalesce(d -> 'declarado', '{}'), nullif((d ->> 'utm')::numeric, 0), (d ->> 'remanente_inicial')::numeric,
            nullif(d -> 'calculado', 'null'::jsonb), coalesce(nullif(d -> 'ajustes', 'null'::jsonb), '{}'),
            case when d ->> 'estado' = 'presentado' then coalesce((d ->> 'presentado_en')::timestamptz, now()) end, now())
    on conflict (empresa_id, periodo) do update
      set estado = excluded.estado, declarado = excluded.declarado, utm = excluded.utm, remanente_inicial = excluded.remanente_inicial,
          calculado = excluded.calculado, ajustes = excluded.ajustes, presentado_en = excluded.presentado_en, actualizado = now();
    n := n + 1;
  end loop;
  if p_tasa_ppm is not null and p_tasa_ppm >= 0 and p_tasa_ppm < 100 then
    update empresas set tasa_ppm = p_tasa_ppm where id = p_empresa;
  end if;
  insert into auditoria (empresa_id, accion, detalle) values (p_empresa, 'importar_f29', jsonb_build_object('declaraciones', n, 'tasa_ppm', p_tasa_ppm));
  return n;
end $$;

revoke execute on function public.importar_f29(uuid, jsonb, numeric) from public, anon;
grant execute on function public.importar_f29(uuid, jsonb, numeric) to authenticated;
