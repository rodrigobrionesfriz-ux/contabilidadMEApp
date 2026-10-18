'use client';

import { useState, useTransition } from 'react';
import type { Trabajador } from '@/remuneraciones/calculo';
import { clp, fechaCL, hoyISO, MESES } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarAnticipo, borrarAnticipo } from '../../acciones';

export function Anticipos({ empresaId, trabajador, cerrados, tesoreria, escribe }: {
  empresaId: string; trabajador: Trabajador; cerrados: string[]; tesoreria: { codigo: string; nombre: string }[]; escribe: boolean;
}) {
  const [a, setA] = useState({ fecha: hoyISO(), monto: 0, motivo: '', mes_desc: hoyISO().slice(0, 7) });
  const [pagar, setPagar] = useState(false);
  const [cuenta, setCuenta] = useState(tesoreria.find((c) => c.codigo === '1101201')?.codigo ?? tesoreria[0]?.codigo ?? '');
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const lista = trabajador.anticipos ?? [];
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => iniciar(async () => {
    const r = await f();
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
  });
  return (
    <section className="tarjeta space-y-3 p-4 text-sm">
      <h2 className="font-semibold">Anticipos de sueldo</h2>
      <p className="text-xs text-tenue">Se descuentan en la liquidación del mes indicado (LRE 3188). Un mes con libro cerrado no admite cambios.</p>
      {lista.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {lista.map((x) => {
              const cerrado = cerrados.includes(x.mesDesc ?? '');
              return (
                <tr key={x.id} className="border-b border-borde/30">
                  <td className="num py-1">{fechaCL(x.fecha)}</td><td>{x.motivo}</td>
                  <td>Descuento {MESES[+(x.mesDesc ?? '').slice(5, 7) - 1]} {(x.mesDesc ?? '').slice(0, 4)}</td>
                  <td className="num text-right">{clp(x.monto)}</td>
                  <td className="text-right">{escribe && !cerrado && <button type="button" className="text-tenue hover:text-peligro" onClick={() => run(() => borrarAnticipo(empresaId, x.id!))}>Eliminar</button>}{cerrado && <span className="text-tenue">mes cerrado</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {escribe && (
        <div className="grid gap-2 sm:grid-cols-[150px_130px_1fr_150px_auto] sm:items-end">
          <div><label className="etiqueta" htmlFor="a-fecha">Fecha</label><input id="a-fecha" type="date" value={a.fecha} onChange={(e) => setA({ ...a, fecha: e.target.value, mes_desc: e.target.value.slice(0, 7) })} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="a-monto">Monto</label><input id="a-monto" inputMode="numeric" value={a.monto || ''} onChange={(e) => setA({ ...a, monto: Math.round(Number(e.target.value.replace(/\./g, '')) || 0) })} className="campo num text-right" /></div>
          <div><label className="etiqueta" htmlFor="a-motivo">Motivo</label><input id="a-motivo" value={a.motivo} onChange={(e) => setA({ ...a, motivo: e.target.value })} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="a-mes">Descontar en</label><input id="a-mes" type="month" value={a.mes_desc} onChange={(e) => setA({ ...a, mes_desc: e.target.value })} className="campo" /></div>
          <button type="button" className="boton" disabled={pendiente || !a.monto} onClick={() => run(() => guardarAnticipo(empresaId, { ...a, trabajador_id: trabajador.id }, pagar ? { cuenta } : undefined))}>Agregar</button>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:col-span-5">
            <label className="flex items-center gap-2"><input type="checkbox" checked={pagar} onChange={(e) => setPagar(e.target.checked)} /> Registrar el pago</label>
            <span className="text-tenue">(Debe 1106001 Anticipo de sueldo / Haber</span>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} disabled={!pagar} className="campo w-56 py-0.5 text-xs" aria-label="Cuenta de pago">
              {tesoreria.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
            </select><span className="text-tenue">)</span>
          </div>
        </div>
      )}
      <Mensaje {...msg} />
    </section>
  );
}
