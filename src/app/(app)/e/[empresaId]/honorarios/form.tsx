'use client';

import { useMemo, useState, useTransition } from 'react';
import { PlanCuentas, type CuentaBase } from '@/motor/plan-cuentas';
import { rutParse } from '@/motor/rut';
import { retencionHonorarios } from '@/importador/respaldo';
import { ListaCuentas, SelectorCC, codigoDe, type CentroOpcion } from '@/components/editor-lineas';
import { Mensaje } from '@/components/form-estado';
import { clp, hoyISO, milesInput } from '@/lib/formato';
import { registrarBoleta } from './acciones';

export function FormBoleta({ empresaId, cuentas, centros, tesoreria }: {
  empresaId: string; cuentas: CuentaBase[]; centros: CentroOpcion[]; tesoreria: { codigo: string; nombre: string }[];
}) {
  const plan = useMemo(() => new PlanCuentas(cuentas), [cuentas]);
  const vacio = { numero: '', fecha: hoyISO(), rut: '', nombre: '', bruto: 0, conRetencion: true, cuentaGasto: '3202019', cc: '', glosa: '' };
  const [b, setB] = useState(vacio);
  const [contado, setContado] = useState(false);
  const [pago, setPago] = useState({ cuenta: tesoreria.find((c) => c.codigo === '1101201')?.codigo ?? tesoreria[0]?.codigo ?? '', fecha: hoyISO() });
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const tasa = b.conRetencion ? retencionHonorarios(+b.fecha.slice(0, 4) || new Date().getFullYear()) : 0;
  const ret = Math.round(b.bruto * tasa);
  const rut = rutParse(b.rut);
  const regla = plan.regla(b.cuentaGasto);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    iniciar(async () => {
      const r = await registrarBoleta(empresaId, b, contado ? pago : undefined);
      if (!r.ok) return setMsg({ error: r.error });
      setMsg(r.avisoPago ? { error: r.avisoPago } : { ok: `Boleta registrada (asiento N° ${r.numero})${r.numeroPago ? ` y pagada (asiento N° ${r.numeroPago})` : ''}.` });
      setB({ ...vacio, fecha: b.fecha, cuentaGasto: b.cuentaGasto, cc: b.cc });
    });
  }

  return (
    <details className="tarjeta p-4" open>
      <summary className="cursor-pointer font-semibold">+ Registrar boleta de honorarios</summary>
      <ListaCuentas id="cuentas-hon" plan={plan} cuentas={cuentas} />
      <form onSubmit={enviar} className="mt-3 grid gap-3 sm:grid-cols-4">
        <div><label className="etiqueta" htmlFor="h-num">N° boleta</label><input id="h-num" required value={b.numero} onChange={(e) => setB({ ...b, numero: e.target.value })} className="campo num" /></div>
        <div><label className="etiqueta" htmlFor="h-fecha">Fecha</label><input id="h-fecha" type="date" required value={b.fecha} onChange={(e) => setB({ ...b, fecha: e.target.value })} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="h-rut">RUT prestador</label><input id="h-rut" required value={b.rut} onChange={(e) => setB({ ...b, rut: e.target.value })} className={`campo num ${b.rut && !rut.valido ? 'border-peligro' : ''}`} /></div>
        <div><label className="etiqueta" htmlFor="h-nom">Nombre</label><input id="h-nom" required value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="h-bruto">Monto bruto</label><input id="h-bruto" inputMode="numeric" required value={b.bruto ? milesInput(b.bruto) : ''} onChange={(e) => setB({ ...b, bruto: Math.round(Number(e.target.value.replace(/\./g, '')) || 0) })} className="campo num text-right" /></div>
        <div>
          <label className="etiqueta" htmlFor="h-ret">Retención</label>
          <select id="h-ret" value={b.conRetencion ? 'si' : 'no'} onChange={(e) => setB({ ...b, conRetencion: e.target.value === 'si' })} className="campo">
            <option value="si">Con retención ({(tasa * 100 || retencionHonorarios(+b.fecha.slice(0, 4)) * 100).toFixed(2).replace('.', ',')}%)</option>
            <option value="no">Sin retención (la retiene el prestador)</option>
          </select>
        </div>
        <div className="sm:col-span-2 flex items-end gap-4 text-sm">
          <span>Retención <b className="num">{clp(ret)}</b></span><span>Líquido <b className="num">{clp(b.bruto - ret)}</b></span>
        </div>
        <div className="sm:col-span-2">
          <label className="etiqueta" htmlFor="h-cta">Cuenta de gasto</label>
          <input id="h-cta" list="cuentas-hon" value={b.cuentaGasto} onChange={(e) => setB({ ...b, cuentaGasto: codigoDe(e.target.value) || e.target.value })} className="campo num" />
          <div className="text-[11px] text-tenue">{regla ? plan.nombre(b.cuentaGasto) : '⚠️ cuenta no encontrada'}</div>
        </div>
        <div>
          <span className="etiqueta">Centro de costo</span>
          <SelectorCC valor={b.cc} onChange={(v) => setB({ ...b, cc: v })} centros={centros} deshabilitado={!!regla && !regla.aceptaCentroCosto} requerido={regla?.requiereCentroCosto} />
        </div>
        <div><label className="etiqueta" htmlFor="h-glosa">Glosa</label><input id="h-glosa" value={b.glosa} onChange={(e) => setB({ ...b, glosa: e.target.value })} className="campo" placeholder="Opcional" /></div>
        <div className="sm:col-span-4 flex flex-wrap items-end gap-3 rounded-md bg-panel-2 p-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contado} onChange={(e) => setContado(e.target.checked)} /> Pagada al contado</label>
          {contado && (
            <>
              <select value={pago.cuenta} onChange={(e) => setPago({ ...pago, cuenta: e.target.value })} className="campo w-64" aria-label="Cuenta de pago">
                {tesoreria.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
              </select>
              <input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} className="campo w-44" aria-label="Fecha de pago" />
            </>
          )}
        </div>
        <div className="sm:col-span-4 flex items-center gap-3">
          <button type="submit" className="boton" disabled={pendiente || !rut.valido || !b.bruto}>{pendiente ? 'Registrando…' : 'Registrar boleta'}</button>
          <Mensaje {...msg} />
        </div>
      </form>
    </details>
  );
}
