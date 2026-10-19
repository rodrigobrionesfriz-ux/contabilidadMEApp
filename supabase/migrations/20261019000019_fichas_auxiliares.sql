-- Fichas de proveedores y clientes (auxiliares) con la cuenta y el centro de costo por defecto
-- que propone la importación del RCV. La primera vez que se contabiliza un documento de un auxiliar
-- nuevo, la ficha se crea con la cuenta y el centro de ese asiento.

create table public.auxiliares (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo text not null check (tipo in ('proveedor', 'cliente')),
  rut text not null check (public.rut_valido(rut)),
  razon_social text not null check (length(trim(razon_social)) > 0),
  giro text,
  email text,
  telefono text,
  direccion text,
  -- Cuenta de gasto/costo (proveedor) o de ingreso (cliente) y centro de costo por defecto
  cuenta text,
  centro_costo text,
  -- Ventas: clientes (por cobrar) | banco | deudores
  forma_pago text check (forma_pago in ('clientes', 'banco', 'deudores')),
  activo boolean not null default true,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (empresa_id, tipo, rut),
  foreign key (empresa_id, cuenta) references public.cuentas (empresa_id, codigo),
  foreign key (empresa_id, centro_costo) references public.centros_costo (empresa_id, codigo) on delete set null (centro_costo)
);

alter table public.auxiliares enable row level security;
create policy aux_ver on public.auxiliares for select to authenticated using (public.es_miembro(empresa_id));
-- La escritura va por guardar_auxiliar (valida RUT, cuenta y centro)
revoke all on public.auxiliares from anon, authenticated;
grant select on public.auxiliares to authenticated;

-- Crea o actualiza una ficha. p_cuenta / p_cc vacíos dejan la ficha sin valor por defecto.
-- p_solo_crear: si la ficha ya existe no se toca (lo usa el RCV al crear la ficha de un auxiliar nuevo).
create or replace function public.guardar_auxiliar(
  p_empresa uuid, p_tipo text, p_rut text, p_razon_social text, p_cuenta text default null, p_cc text default null,
  p_forma_pago text default null, p_giro text default null, p_email text default null, p_telefono text default null,
  p_direccion text default null, p_activo boolean default true, p_solo_crear boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rut text := rut_normalizado(p_rut); v_cuenta text := nullif(trim(coalesce(p_cuenta, '')), ''); c record; v_cc text; v_nuevo boolean;
begin
  if not puede_escribir(p_empresa) then raise exception 'No tienes permiso para editar fichas de auxiliares'; end if;
  if p_tipo not in ('proveedor', 'cliente') then raise exception 'Tipo de auxiliar no válido'; end if;
  if v_rut is null or not rut_valido(v_rut) then raise exception 'RUT % no válido', p_rut; end if;
  if length(trim(coalesce(p_razon_social, ''))) = 0 then raise exception 'Falta la razón social'; end if;
  if v_cuenta is not null then
    select * into c from cuentas where empresa_id = p_empresa and codigo = v_cuenta;
    if not found then raise exception 'La cuenta % no existe en el plan de cuentas', v_cuenta; end if;
    if not c.acepta_movimientos then raise exception 'La cuenta % es agrupadora', v_cuenta; end if;
  end if;
  v_cc := centro_costo_codigo(p_empresa, p_cc);
  v_nuevo := not exists (select 1 from auxiliares where empresa_id = p_empresa and tipo = p_tipo and rut = v_rut);
  if not v_nuevo and p_solo_crear then return false; end if;
  insert into auxiliares (empresa_id, tipo, rut, razon_social, giro, email, telefono, direccion, cuenta, centro_costo, forma_pago, activo)
  values (p_empresa, p_tipo, v_rut, trim(p_razon_social), nullif(trim(coalesce(p_giro, '')), ''), nullif(trim(coalesce(p_email, '')), ''),
          nullif(trim(coalesce(p_telefono, '')), ''), nullif(trim(coalesce(p_direccion, '')), ''), v_cuenta, v_cc,
          nullif(p_forma_pago, ''), coalesce(p_activo, true))
  on conflict (empresa_id, tipo, rut) do update set
    razon_social = excluded.razon_social, giro = excluded.giro, email = excluded.email, telefono = excluded.telefono,
    direccion = excluded.direccion, cuenta = excluded.cuenta, centro_costo = excluded.centro_costo,
    forma_pago = excluded.forma_pago, activo = excluded.activo, actualizado = now();
  insert into auditoria (empresa_id, accion, detalle)
  values (p_empresa, 'guardar_auxiliar', jsonb_strip_nulls(jsonb_build_object('tipo', p_tipo, 'rut', v_rut, 'nuevo', v_nuevo, 'cuenta', v_cuenta, 'cc', v_cc)));
  return v_nuevo;
end $$;
revoke execute on function public.guardar_auxiliar(uuid, text, text, text, text, text, text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.guardar_auxiliar(uuid, text, text, text, text, text, text, text, text, text, text, boolean, boolean) to authenticated;

-- Poblado inicial: una ficha por proveedor y cliente con documentos, con la cuenta y el centro
-- del documento vigente más reciente (centro traducido desde el id del sistema anterior si hace falta).
insert into public.auxiliares (empresa_id, tipo, rut, razon_social, cuenta, centro_costo, forma_pago)
select x.empresa_id, x.tipo_aux, x.rut, x.razon,
       (select c.codigo from cuentas c where c.empresa_id = x.empresa_id and c.codigo = x.cuenta and c.acepta_movimientos),
       (select cc.codigo from centros_costo cc where cc.empresa_id = x.empresa_id and (cc.codigo = x.cc or cc.ref_origen = x.cc)
        order by (cc.codigo = x.cc) desc limit 1),
       case when x.fp in ('clientes', 'banco', 'deudores') then x.fp end
from (
  select distinct on (d.empresa_id, d.tipo, d.rut)
         d.empresa_id, case d.tipo when 'compra' then 'proveedor' else 'cliente' end tipo_aux, d.rut,
         coalesce(nullif(trim(d.razon_social), ''), d.rut) razon,
         coalesce(d.datos -> 'dist' -> 0 ->> 'cuenta', d.datos ->> 'cuentaIngreso') cuenta,
         nullif(d.datos -> 'dist' -> 0 ->> 'cc', '') cc,
         d.datos ->> 'formaPago' fp
  from documentos d
  where d.tipo in ('compra', 'venta') and coalesce(d.estado, '') <> 'anulado' and d.rut is not null and public.rut_valido(d.rut)
  order by d.empresa_id, d.tipo, d.rut, d.fecha desc, d.creado desc
) x
on conflict do nothing;
