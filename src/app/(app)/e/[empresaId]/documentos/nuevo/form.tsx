'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { PlanCuentas, type CuentaBase } from '@/motor/plan-cuentas';
import { DTE_COMPRAS, DTE_VENTAS, IVA } from '@/motor/dte';
import { rutParse } from '@/motor/rut';
import type { DocRCV, TipoRCV } from '@/rcv/leer';
import { sumarDiasFechaISO } from '@/rcv/leer';
import { validarDetalleRCV, type LineaDetalle } from '@/rcv/detalle';
import { EditorLineas, ListaCuentas, type CentroOpcion } from '@/components/editor-lineas';
import { Mensaje } from '@/components/form-estado';
import { hoyISO, MESES, milesInput } from '@/lib/formato';
import { registrarDocumentos } from '../../rcv/acciones';

const entero = (v: string) => Math.round(Number(v.replace(/\./g, '')) || 0);

export function FormDocumento({ empresaId, tipo, cuentas, centros }: { empresaId: string; tipo: TipoRCV; cuentas: CuentaBase[]; centros: CentroOpcion[] }) {
  const plan = useMemo(() => new PlanCuentas(cuentas), [cuentas]);
  const dtes = (tipo === 'compra' ? DTE_COMPRAS : DTE_VENTAS).filter((d) => !d.honorario);
  const [h, setH] = useState({ tipoDTE: 33, folio: '', fecha: hoyISO(), vence: '', rut: '', razon: '', exento: 0, neto: 0, iva: 0, otros: 0, ivaManual: false, formaPago: 'clientes' as 'clientes' | 'banco' | 'deudores' });
  const [periodo, setPeriodo] = useState(hoyISO().slice(0, 7));
  const [glosa, setGlosa] = useState('');
  const [redondeo, setRedondeo] = useState(false);
  const cuentaDefecto = tipo === 'venta' ? (DTE_VENTAS.find((d) => d.cod === 33)?.cuenta ?? '') : '';
  const [lineas, setLineas] = useState<LineaDetalle[]>([{ cuenta: cuentaDefecto, desc: '', monto: 0, cc: '', afecto: true }]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const afecto = dtes.find((d) => d.cod === h.tipoDTE)?.afecto !== false;
  const iva = h.ivaManual ? h.iva : afecto ? Math.round(h.neto * IVA) : 0;
  const retencion = tipo === 'compra' && (h.tipoDTE === 45 || h.tipoDTE === 46);
  const total = h.exento + h.neto + (retencion ? 0 : iva) + h.otros;
  const rut = rutParse(h.rut);
  const doc: DocRCV = {
    fecha: h.fecha, fechaVencimiento: h.vence || sumarDiasFechaISO(h.fecha, 30), fechaVencimientoOrigen: h.vence ? 'manual' : 'estimado30d',
    fechaRecepcionSII: '', fechaAcuseSII: '', tipoDTE: h.tipoDTE, numero: h.folio.trim(),
    rutCodigo: rut.codigo, rutDV: rut.dv, razonSocial: h.razon.trim(),
    neto: h.neto, exento: h.exento, iva, tratamientoIVA: 'recuperable',
    otrosImpuestos: h.otros, tratamientoOtrosImpuestos: 'costo', otrosImpuestosDetalle: [], total, netoAF: 0,
    ...(retencion ? { ivaRetenido: iva, totalSII: total, totalIncluyeRetencion: false } : {}),
  };
  const v = validarDetalleRCV(tipo, doc, lineas, plan, { aceptaRedondeo: redondeo });
  const cabeceraOk = rut.valido && !!doc.numero && !!h.razon.trim() && total > 0;

  function enviar() {
    setMsg({});
    if (!rut.valido) return setMsg({ error: 'RUT no válido' });
    if (!doc.numero) return setMsg({ error: 'Falta el folio' });
    if (!v.ok) return setMsg({ error: 'Corrige las líneas antes de registrar.' });
    iniciar(async () => {
      const per = tipo === 'compra' ? periodo : h.fecha.slice(0, 7);
      const [r] = await registrarDocumentos(empresaId, tipo, per, [{
        doc, asignacion: { detalle: { lineas, glosa, aceptaRedondeo: redondeo }, fechaVencimiento: doc.fechaVencimiento, origen: 'manual', ...(tipo === 'venta' ? { formaPago: h.formaPago } : {}) },
      }]);
      if (!r?.ok) return setMsg({ error: r?.error ?? 'No se pudo registrar' });
      setMsg({ ok: `Documento registrado con el asiento N° ${r.numero}.` });
      setH((x) => ({ ...x, folio: '', exento: 0, neto: 0, iva: 0, otros: 0, ivaManual: false }));
      setGlosa('');
      setLineas([{ cuenta: lineas[0]?.cuenta ?? '', desc: '', monto: 0, cc: lineas[0]?.cc ?? '', afecto: true }]);
    });
  }

  const campo = (k: 'exento' | 'neto' | 'otros', etiqueta: string) => (
    <div>
      <label className="etiqueta" htmlFor={k}>{etiqueta}</label>
      <input id={k} inputMode="numeric" value={h[k] ? milesInput(h[k]) : ''} onChange={(e) => setH({ ...h, [k]: entero(e.target.value) })} className="campo num text-right" />
    </div>
  );

  return (
    <div className="max-w-5xl space-y-4">
      <ListaCuentas id="cuentas-doc" plan={plan} cuentas={cuentas} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-semibold">Nuevo documento de {tipo === 'compra' ? 'compra' : 'venta'}</h1>
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
          <Link href="?tipo=compra" className={`rounded px-3 py-1 ${tipo === 'compra' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Compra</Link>
          <Link href="?tipo=venta" className={`rounded px-3 py-1 ${tipo === 'venta' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Venta</Link>
        </div>
      </div>
      <section className="tarjeta grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="etiqueta" htmlFor="dte">Tipo de documento</label>
          <select id="dte" value={h.tipoDTE} onChange={(e) => setH({ ...h, tipoDTE: +e.target.value })} className="campo">
            {dtes.map((d) => <option key={d.cod} value={d.cod}>{d.cod} · {d.nm}</option>)}
          </select>
        </div>
        <div><label className="etiqueta" htmlFor="folio">Folio</label><input id="folio" value={h.folio} onChange={(e) => setH({ ...h, folio: e.target.value })} className="campo num" /></div>
        <div><label className="etiqueta" htmlFor="fecha">Fecha de emisión</label><input id="fecha" type="date" value={h.fecha} onChange={(e) => { setH({ ...h, fecha: e.target.value }); if (e.target.value.slice(0, 7) > periodo) setPeriodo(e.target.value.slice(0, 7)); }} className="campo" /></div>
        <div>
          <label className="etiqueta" htmlFor="rut">RUT {tipo === 'compra' ? 'proveedor' : 'cliente'}</label>
          <input id="rut" value={h.rut} onChange={(e) => setH({ ...h, rut: e.target.value })} className={`campo num ${h.rut && !rut.valido ? 'border-peligro' : ''}`} placeholder="76.123.456-7" />
        </div>
        <div className="sm:col-span-2"><label className="etiqueta" htmlFor="razon">Razón social</label><input id="razon" value={h.razon} onChange={(e) => setH({ ...h, razon: e.target.value })} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="vence">Vencimiento</label><input id="vence" type="date" value={h.vence} onChange={(e) => setH({ ...h, vence: e.target.value })} className="campo" /></div>
        {campo('exento', 'Exento')}
        {campo('neto', 'Neto')}
        <div>
          <label className="etiqueta" htmlFor="iva">IVA {h.ivaManual ? '(manual)' : '(19%)'}</label>
          <input id="iva" inputMode="numeric" value={iva ? milesInput(iva) : ''} onChange={(e) => setH({ ...h, iva: entero(e.target.value), ivaManual: true })} className="campo num text-right" />
        </div>
        {tipo === 'compra' ? campo('otros', 'Otros impuestos') : <div />}
        <div className="sm:col-span-2">
          <span className="etiqueta">Total</span>
          <div className="num text-lg font-semibold">${new Intl.NumberFormat('es-CL').format(total)}{retencion && <span className="ml-2 text-xs font-normal text-tenue">(sin IVA retenido)</span>}</div>
        </div>
        {tipo === 'compra' ? (
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="periodo">Período del libro</label>
            <select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="campo">
              {[0, 1, 2].map((k) => {
                const d = new Date(Date.UTC(+h.fecha.slice(0, 4), +h.fecha.slice(5, 7) - 1 + k, 1));
                const val = d.toISOString().slice(0, 7);
                return <option key={val} value={val}>{MESES[d.getUTCMonth()]} {d.getUTCFullYear()}{k ? ' (atrasado: se contabiliza el día 1)' : ''}</option>;
              })}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="fp">Forma de cobro</label>
            <select id="fp" value={h.formaPago} onChange={(e) => setH({ ...h, formaPago: e.target.value as typeof h.formaPago })} className="campo">
              <option value="clientes">Por cobrar (clientes)</option><option value="banco">Pagada (banco)</option><option value="deudores">Deudores varios</option>
            </select>
          </div>
        )}
      </section>
      <section className="tarjeta space-y-3 p-4">
        <div>
          <label className="etiqueta" htmlFor="glosa">Glosa</label>
          <input id="glosa" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" placeholder="Descripción general (opcional)" />
        </div>
        <EditorLineas tipo={tipo} doc={doc} lineas={lineas} onChange={setLineas} plan={plan} centros={centros} listaId="cuentas-doc" validacion={v} />
        <label className="flex items-center gap-2 text-xs text-tenue"><input type="checkbox" checked={redondeo} onChange={(e) => setRedondeo(e.target.checked)} /> Aceptar diferencia de $1</label>
      </section>
      <Mensaje {...msg} />
      <button type="button" className="boton" disabled={!cabeceraOk || !v.ok || pendiente} onClick={enviar}>{pendiente ? 'Registrando…' : 'Registrar documento'}</button>
    </div>
  );
}
