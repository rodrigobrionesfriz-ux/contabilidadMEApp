-- Contabilidad ME · Ventas pagadas con tarjeta de débito o crédito.
-- La venta queda por cobrar al operador (Transbank, Getnet, etc.) en 1107004 hasta su abono.

insert into public.pdc_plantilla (codigo, nombre, tipo, naturaleza)
values ('1107004', 'TARJETAS POR COBRAR (DÉBITO Y CRÉDITO)', 'A', 'D')
on conflict do nothing;

-- Empresas existentes: se agrega la cuenta donde no esté (si el código ya se usa con otro nombre, se respeta)
insert into public.cuentas (empresa_id, codigo, nombre, tipo, naturaleza, acepta_movimientos, acepta_centro_costo)
select e.id, '1107004', 'TARJETAS POR COBRAR (DÉBITO Y CRÉDITO)', 'A', 'D', true, false
from public.empresas e
where not exists (select 1 from public.cuentas c where c.empresa_id = e.id and c.codigo = '1107004')
on conflict do nothing;

-- Forma de pago por defecto de la ficha del cliente: admite 'tarjetas'
alter table public.auxiliares drop constraint if exists auxiliares_forma_pago_check;
alter table public.auxiliares add constraint auxiliares_forma_pago_check check (forma_pago in ('clientes', 'banco', 'deudores', 'tarjetas'));
