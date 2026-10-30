'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { DTE_VENTAS, IVA } from '@/motor/dte';
import { milesInput } from '@/lib/formato';
import { FORMAS_COBRO, totalVenta, type CambiosVenta, type FormaCobro } from '@/rcv/editar-venta';
import { datosVenta, guardarVenta } from './acciones';

const entero = (s: string) => Math.round(Number(String(s).replace(/[^0-9]/g, '')) || 0);

/** ✏️ Editar una venta del libro: datos del documento, forma de cobro y cuenta de ingreso (rehace su asiento). */
export function EditarVenta({ empresaId, id, etiqueta, cuentasIngreso }: { empresaId: string; id: string; etiqueta: string; cuentasIngreso: [string, string][] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [c, setC] = useState<CambiosVenta | null>(null);
  const [info, setInfo] = useState<{ asiento: number | null; reparto: number }>({ asiento: null, reparto: 0 });
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const [ivaManual, setIvaManual] = useState(false);

  const abrir = () => {
    setAbierto(true); setMsg({}); setC(null); setMotivo(''); setIvaManual(false);
    iniciar(async () => {
      const r = await datosVenta(empresaId, id);
      if (!r.ok) return setMsg({ error: r.error });
      setC(r.cambios); setInfo({ asiento: r.asiento, reparto: r.lineasReparto });
    });
  };
  const set = (x: Partial<CambiosVenta>) => setC((v) => {
    if (!v) return v;
    const n = { ...v, ...x };
    // El IVA sigue al neto (19%) mientras no se escriba a mano
    if ('neto' in x && !ivaManual) n.iva = Math.round(n.neto * IVA);
    if ('tipoDTE' in x && !DTE_VENTAS.find((t) => t.cod === n.tipoDTE)?.afecto) { n.exento += n.neto; n.neto = 0; n.iva = 0; }
    return n;
  });
  const guardar = () => c && iniciar(async () => {
    const r = await guardarVenta(empresaId, id, c, motivo);
    if (!r.ok) return setMsg({ error: r.error });
    setAbierto(false); router.refresh();
  });

  const monto = (k: 'neto' | 'exento' | 'iva' | 'otrosImpuestos', l: string) => (
    <div><label className="etiqueta" htmlFor={`ev-${k}`}>{l}</label>
      <input id={`ev-${k}`} inputMode="numeric" value={c && c[k] ? milesInput(c[k]) : ''} placeholder="0"
        onChange={(e) => { if (k === 'iva') setIvaManual(true); set({ [k]: entero(e.target.value) } as Partial<CambiosVenta>); }} className="campo num text-right" /></div>
  );

  if (!abierto) return <button type="button" className="text-tenue hover:text-acento" onClick={abrir} title={`Editar ${etiqueta}`}>✏️ Editar</button>;
  return (
    <Modal titulo={`Editar venta ${etiqueta}`} sub={info.asiento ? `Se rehace el asiento N° ${info.asiento} con el mismo número.` : undefined} onCerrar={() => setAbierto(false)} ancho="max-w-4xl">
      {!c ? <p className="text-tenue">{pendiente ? 'Cargando…' : ''}</p> : (
        <div className="space-y-3 text-left">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><label className="etiqueta" htmlFor="ev-f">Fecha emisión</label><input id="ev-f" type="date" value={c.fecha} onChange={(e) => set({ fecha: e.target.value })} className="campo num" /></div>
            <div><label className="etiqueta" htmlFor="ev-v">Fecha vencimiento</label><input id="ev-v" type="date" value={c.fechaVencimiento} onChange={(e) => set({ fechaVencimiento: e.target.value })} className="campo num" /></div>
            <div><label className="etiqueta" htmlFor="ev-t">Tipo documento SII</label>
              <select id="ev-t" value={c.tipoDTE} onChange={(e) => set({ tipoDTE: Number(e.target.value) })} className="campo">
                {DTE_VENTAS.map((t) => <option key={t.cod} value={t.cod}>{t.cod} · {t.nm}</option>)}
              </select></div>
            <div><label className="etiqueta" htmlFor="ev-n">N° documento</label><input id="ev-n" value={c.numero} onChange={(e) => set({ numero: e.target.value })} className="campo num" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <div><label className="etiqueta" htmlFor="ev-r">RUT cliente</label><input id="ev-r" value={c.rut} onChange={(e) => set({ rut: e.target.value })} className="campo num" autoCapitalize="none" /></div>
            <div><label className="etiqueta" htmlFor="ev-rs">Razón social</label><input id="ev-rs" value={c.razonSocial} onChange={(e) => set({ razonSocial: e.target.value })} className="campo" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            {monto('neto', 'Neto')}{monto('exento', 'Exento')}{monto('iva', 'IVA 19%')}{monto('otrosImpuestos', 'Otros imp.')}
            <div><div className="etiqueta">Total</div><div className="campo num bg-panel text-right font-semibold">{milesInput(totalVenta(c)) || '0'}</div></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="ev-fp">Forma de pago / destino</label>
              <select id="ev-fp" value={c.formaPago} onChange={(e) => set({ formaPago: e.target.value as FormaCobro })} className="campo">
                {FORMAS_COBRO.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select></div>
            <div><label className="etiqueta" htmlFor="ev-ci">Cuenta de ingreso</label>
              <select id="ev-ci" value={c.cuentaIngreso} onChange={(e) => set({ cuentaIngreso: e.target.value })} className="campo">
                {!cuentasIngreso.some(([k]) => k === c.cuentaIngreso) && <option value={c.cuentaIngreso}>{c.cuentaIngreso || 'Elige la cuenta'}</option>}
                {cuentasIngreso.map(([k, n]) => <option key={k} value={k}>{k} – {n}</option>)}
              </select>
              {info.reparto > 1 && <p className="mt-1 text-xs text-tenue">El ingreso está repartido en {info.reparto} líneas (centros de costo): si cambia el monto se prorratea.</p>}
            </div>
          </div>
          <div><label className="etiqueta" htmlFor="ev-m">Motivo del cambio (opcional, queda en el registro de actividad)</label>
            <input id="ev-m" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo" placeholder="Ej: se pagó al contado" /></div>
          <Mensaje {...msg} />
          <div className="flex justify-end gap-2">
            <button type="button" className="boton-sec" onClick={() => setAbierto(false)}>Cancelar</button>
            <button type="button" className="boton" disabled={pendiente} onClick={guardar}>{pendiente ? 'Guardando…' : '💾 Guardar documento'}</button>
          </div>
        </div>
      )}
      {!c && <Mensaje {...msg} />}
    </Modal>
  );
}
