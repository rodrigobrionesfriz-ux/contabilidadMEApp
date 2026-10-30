'use client';

import { useMemo, useState, useTransition } from 'react';
import { clp, milesInput } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { construirAbonoTarjetas } from '@/auxiliares/abono-tarjetas';
import { CUENTA_TARJETAS } from '@/motor/contable';
import { rutParse } from '@/motor/rut';
import { registrarAbonoTarjetas } from './acciones';
import { PestanasPagos } from './pestanas';

const entero = (v: string) => Math.round(Number(String(v).replace(/[^0-9]/g, '')) || 0);

/** 💳 Abono tarjetas: traspasa a banco las ventas con tarjeta (1107004), con o sin comisión del operador. */
export function AbonoTarjetas({ empresaId, hoy, saldo, bancos, gastos, proveedores, faltaCuenta }: {
  empresaId: string; hoy: string; saldo: number; faltaCuenta: boolean;
  bancos: { codigo: string; nombre: string }[]; gastos: { codigo: string; nombre: string }[]; proveedores: { rut: string; razon: string }[];
}) {
  const [fecha, setFecha] = useState(hoy);
  const [banco, setBanco] = useState(bancos.find((c) => c.codigo === '1101201')?.codigo ?? bancos[0]?.codigo ?? '');
  const [depositado, setDepositado] = useState(0);
  const [comision, setComision] = useState(0);
  const [trato, setTrato] = useState<'proveedor' | 'gasto'>('proveedor');
  const [rut, setRut] = useState('');
  const [razon, setRazon] = useState('');
  const [cuentaGasto, setCuentaGasto] = useState(gastos.find((g) => g.codigo === '3201005')?.codigo ?? '');
  const [glosa, setGlosa] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const nombreCuenta = useMemo(() => new Map([...bancos, ...gastos].map((c) => [c.codigo, c.nombre])), [bancos, gastos]);
  const r = construirAbonoTarjetas({ banco, depositado, comision, trato, rut, razon, cuentaGasto, glosa });
  const bruto = depositado + comision;
  const elegirRut = (v: string) => {
    setRut(v);
    const p = rutParse(v);
    const f = p.valido && proveedores.find((x) => x.rut === `${p.codigo}-${p.dv}`);
    if (f && !razon.trim()) setRazon(f.razon);
  };
  const generar = () => {
    setMsg({});
    if (bruto > saldo + 1 && !confirm(`El abono (${clp(bruto)}) supera el saldo de ventas con tarjeta por cobrar (${clp(saldo)}). ¿Registrarlo igual?`)) return;
    iniciar(async () => {
      const x = await registrarAbonoTarjetas(empresaId, fecha, { banco, depositado, comision, trato, rut, razon, cuentaGasto, glosa });
      if (!x.ok) return setMsg({ error: x.error });
      setMsg({ ok: `Abono registrado: ${clp(x.total)} · asiento N° ${x.numero}.` });
      setDepositado(0); setComision(0); setGlosa('');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Abono de tarjetas</h1>
        <PestanasPagos actual="tarjetas" />
      </div>
      <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm text-info">
        Traspasa al banco lo que el operador de tarjetas (Transbank, Getnet, etc.) depositó por las ventas con tarjeta. Saldo por cobrar en {CUENTA_TARJETAS}: <strong className="num">{clp(saldo)}</strong>.
        {faltaCuenta && <span className="block text-aviso">Falta la cuenta {CUENTA_TARJETAS} en el plan de cuentas: aplica la migración de ventas con tarjeta.</span>}
      </p>
      <section className="tarjeta grid gap-3 p-4 sm:grid-cols-2">
        <div><label className="etiqueta" htmlFor="tj-f">Fecha del abono</label><input id="tj-f" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="tj-b">Banco donde se depositó</label>
          <select id="tj-b" value={banco} onChange={(e) => setBanco(e.target.value)} className="campo">
            {bancos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
          </select></div>
        <div><label className="etiqueta" htmlFor="tj-d">Monto depositado en el banco</label>
          <input id="tj-d" inputMode="numeric" value={depositado ? milesInput(depositado) : ''} onChange={(e) => setDepositado(entero(e.target.value))} className="campo num text-right" placeholder="0" /></div>
        <div><label className="etiqueta" htmlFor="tj-c">Comisión cobrada (con IVA, 0 si no hay)</label>
          <input id="tj-c" inputMode="numeric" value={comision ? milesInput(comision) : ''} onChange={(e) => setComision(entero(e.target.value))} className="campo num text-right" placeholder="0" /></div>
        <div className="sm:col-span-2"><label className="etiqueta" htmlFor="tj-t">¿Cómo se registra la comisión?</label>
          <select id="tj-t" value={trato} onChange={(e) => setTrato(e.target.value as 'proveedor' | 'gasto')} className="campo">
            <option value="proveedor">Contra el proveedor del servicio (su factura de comisión se registra en Compras)</option>
            <option value="gasto">Directo a una cuenta de gasto (sin factura)</option>
          </select></div>
        {trato === 'proveedor' ? (<>
          <div><label className="etiqueta" htmlFor="tj-r">RUT del proveedor (operador)</label>
            <input id="tj-r" list="tj-provs" value={rut} onChange={(e) => elegirRut(e.target.value)} className="campo num" placeholder="96.689.310-9" />
            <datalist id="tj-provs">{proveedores.map((p) => <option key={p.rut} value={p.rut}>{p.razon}</option>)}</datalist></div>
          <div><label className="etiqueta" htmlFor="tj-rs">Razón social</label><input id="tj-rs" value={razon} onChange={(e) => setRazon(e.target.value)} className="campo" placeholder="Transbank S.A." /></div>
        </>) : (
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="tj-g">Cuenta de gasto</label>
            <select id="tj-g" value={cuentaGasto} onChange={(e) => setCuentaGasto(e.target.value)} className="campo">
              <option value="">Elige la cuenta</option>{gastos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
            </select></div>
        )}
        <div className="sm:col-span-2"><label className="etiqueta" htmlFor="tj-gl">Glosa (opcional)</label><input id="tj-gl" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" placeholder="Ej: Abono Transbank semana 42" /></div>
      </section>
      <section className="tarjeta overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">Asiento contable</h2>
        {!r.ok ? <p className="text-xs text-tenue">{depositado ? r.errores.join(' ') : 'Ingresa el monto depositado.'}</p> : (
          <table className="w-full text-xs">
            <thead className="text-left text-tenue uppercase"><tr className="border-b border-borde"><th className="py-1">Cuenta</th><th>Detalle</th><th className="text-right">Debe</th><th className="text-right">Haber</th></tr></thead>
            <tbody>{r.lineas.map((l, i) => (
              <tr key={i} className="border-b border-borde/30">
                <td className="py-1"><span className="num text-tenue">{l.cuenta}</span> {l.cuenta === CUENTA_TARJETAS ? 'TARJETAS POR COBRAR' : l.cuenta === '2102001' ? 'PROVEEDORES' : nombreCuenta.get(l.cuenta) ?? ''}</td>
                <td className="text-tenue">{l.glosa}{l.rut_auxiliar ? ` · ${l.rut_auxiliar}` : ''}</td>
                <td className="num text-right">{l.debe ? clp(l.debe) : ''}</td><td className="num text-right">{l.haber ? clp(l.haber) : ''}</td>
              </tr>))}</tbody>
            <tfoot className="font-semibold"><tr><td colSpan={2} className="py-1">Totales</td><td className="num text-right">{clp(r.total)}</td><td className="num text-right">{clp(r.total)}</td></tr></tfoot>
          </table>
        )}
        {r.ok && bruto > saldo + 1 && <p className="mt-2 text-xs text-aviso">El abono ({clp(bruto)}) supera el saldo de ventas con tarjeta por cobrar ({clp(saldo)}).</p>}
      </section>
      <Mensaje {...msg} />
      <button type="button" className="boton" disabled={!r.ok || pendiente || faltaCuenta} onClick={generar}>{pendiente ? 'Registrando…' : '💾 Generar asiento'}</button>
    </div>
  );
}
