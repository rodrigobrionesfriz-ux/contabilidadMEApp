-- La cuenta 1104001 pasa a llamarse CLIENTES (era FACTURAS POR COBRAR), igual que el auxiliar de clientes.
-- Sólo donde conserva el nombre original: si una empresa la renombró a mano, se respeta.
update public.pdc_plantilla set nombre = 'CLIENTES' where codigo = '1104001' and nombre = 'FACTURAS POR COBRAR';
update public.cuentas set nombre = 'CLIENTES' where codigo = '1104001' and nombre = 'FACTURAS POR COBRAR';
