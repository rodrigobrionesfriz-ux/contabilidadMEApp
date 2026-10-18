'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlanCuentas, type CuentaBase } from '@/motor/plan-cuentas';
import { dteC, dteV } from '@/motor/dte';
import type { DocRCV, TipoRCV } from '@/rcv/leer';
import { validarDetalleRCV, type LineaDetalle } from '@/rcv/detalle';
import { claveDocumento, periodoSugerido, refDocumento, type Asignacion } from '@/rcv/documento';
import { clp, fechaCL, MESES } from '@/lib/formato';
import { ListaCuentas, SelectorCC, codigoDe, type CentroOpcion } from '@/components/editor-lineas';
import { registrarDocumentos, consultarPrevios } from './acciones';
import { DetalleModal } from './detalle-modal';

export interface Fila {
  doc: DocRCV;
  incluir: boolean;
  cuenta: string;
  cc: string;
  formaPago: 'clientes' | 'banco' | 'deudores';
  detalle?: { lineas: LineaDetalle[]; glosa: string; aceptaRedondeo: boolean };
  vence: string;
  duplicado: boolean;
  resultado?: { ok: boolean; numero?: number; error?: string };
}

const LOTE = 25;

export function ImportadorRCV({ empresaId, tipo, cuentas, centros }: { empresaId: string; tipo: TipoRCV; cuentas: CuentaBase[]; centros: CentroOpcion[] }) {
  const plan = useMemo(() => new PlanCuentas(cuentas), [cuentas]);
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [masivo, setMasivo] = useState({ cuenta: '', cc: '' });
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null);
  const nombreDte = (cod: number) => (tipo === 'compra' ? dteC(cod) : dteV(cod))?.nm ?? `DTE ${cod}`;

  async function leer(f: File) {
    setError(''); setInfo(''); setFilas([]);
    try {
      const { leerArchivoRCV } = await import('@/rcv/leer');
      const r = await leerArchivoRCV(f.name, await f.arrayBuffer(), tipo);
      if (!r.docs.length) throw new Error('El archivo no tiene documentos válidos.');
      const prev = await consultarPrevios(empresaId, tipo, r.docs.map((d) => `${d.rutCodigo}-${d.rutDV}`));
      const existentes = new Set(prev.existentes.map((k) => k.toUpperCase()));
      const per = periodoSugerido(r.docs);
      setPeriodo(per);
      setArchivo(f.name);
      setInfo(`${r.docs.length} documentos leídos${r.descartados ? ` · ${r.descartados} filas descartadas` : ''}${r.continuaciones ? ` · ${r.continuaciones} filas de otros impuestos agregadas a su documento` : ''}.`);
      setFilas(r.docs.map((doc) => {
        const rut = `${doc.rutCodigo}-${doc.rutDV}`;
        const u = prev.ultima[rut];
        const duplicado = existentes.has(claveDocumento(rut, doc.tipoDTE, doc.numero).toUpperCase());
        const cuentaDefecto = tipo === 'venta' ? (dteV(doc.tipoDTE)?.cuenta ?? '') : '';
        return {
          doc, duplicado, incluir: !duplicado, vence: doc.fechaVencimiento,
          cuenta: u?.cuenta ?? cuentaDefecto, cc: u?.cc ?? '',
          formaPago: (u?.formaPago as Fila['formaPago']) ?? 'clientes',
        };
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const fueraDePeriodo = (d: DocRCV) => (tipo === 'compra' ? d.fecha.slice(0, 7) > periodo : d.fecha.slice(0, 7) !== periodo);
  const problemas = (f: Fila): string[] => {
    if (f.duplicado) return ['Ya registrado'];
    if (fueraDePeriodo(f.doc)) return [`Fuera del período ${periodo}`];
    if (f.detalle) {
      const v = validarDetalleRCV(tipo, f.doc, f.detalle.lineas, plan, { aceptaRedondeo: f.detalle.aceptaRedondeo });
      return v.errores;
    }
    const r = plan.regla(f.cuenta);
    if (!f.cuenta) return ['Falta la cuenta'];
    if (!r) return [`La cuenta ${f.cuenta} no existe`];
    if (!r.aceptaMovimientos) return [`La cuenta ${f.cuenta} es agrupadora`];
    if (r.requiereCentroCosto && !f.cc) return [`La cuenta ${f.cuenta} exige centro de costo`];
    if (tipo === 'compra' && f.doc.otrosImpuestos > 0) return [];
    return [];
  };
  const set = (i: number, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
  const seleccionadas = filas.filter((f) => f.incluir && !f.resultado?.ok);
  const listas = seleccionadas.filter((f) => !problemas(f).length);
  const signo = (f: Fila) => ((tipo === 'compra' ? dteC(f.doc.tipoDTE) : dteV(f.doc.tipoDTE))?.signo ?? 1);
  const tot = (k: 'neto' | 'exento' | 'iva' | 'otrosImpuestos' | 'total') => seleccionadas.reduce((s, f) => s + f.doc[k] * signo(f), 0);

  function aplicarMasivo() {
    setFilas((fs) => fs.map((f) => (f.incluir && !f.detalle && !f.resultado?.ok
      ? { ...f, ...(masivo.cuenta ? { cuenta: masivo.cuenta } : {}), ...(masivo.cc ? { cc: masivo.cc } : {}) } : f)));
  }

  async function contabilizar() {
    const pendientes = filas.map((f, i) => ({ f, i })).filter(({ f }) => f.incluir && !f.resultado?.ok && !problemas(f).length);
    setAvance({ hecho: 0, total: pendientes.length });
    for (let k = 0; k < pendientes.length; k += LOTE) {
      const lote = pendientes.slice(k, k + LOTE);
      const items = lote.map(({ f }) => ({
        doc: f.doc,
        asignacion: {
          ...(f.detalle ? { detalle: f.detalle } : { cuenta: f.cuenta, cc: f.cc }),
          ...(tipo === 'venta' ? { formaPago: f.formaPago } : {}),
          fechaVencimiento: f.vence,
        } satisfies Asignacion,
      }));
      try {
        const res = await registrarDocumentos(empresaId, tipo, periodo, items);
        const porRef = new Map(res.map((r) => [r.ref, r]));
        setFilas((fs) => fs.map((f) => {
          const r = porRef.get(refDocumento(tipo, f.doc));
          return r ? { ...f, resultado: { ok: r.ok, numero: r.numero, error: r.error } } : f;
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        break;
      }
      setAvance({ hecho: Math.min(k + LOTE, pendientes.length), total: pendientes.length });
    }
    setAvance(null);
  }

  const registrados = filas.filter((f) => f.resultado?.ok).length;
  const conError = filas.filter((f) => f.resultado && !f.resultado.ok).length;
  const anio = Number(periodo.slice(0, 4)) || new Date().getFullYear();

  return (
    <div className="space-y-4">
      <ListaCuentas id="cuentas-rcv" plan={plan} cuentas={cuentas} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Importar RCV de {tipo === 'compra' ? 'compras' : 'ventas'}</h1>
          <p className="text-sm text-tenue">Descarga el &quot;Detalle&quot; del Registro de {tipo === 'compra' ? 'Compras' : 'Ventas'} en el SII (CSV o Excel) y súbelo aquí.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
          <Link href="?tipo=compra" className={`rounded px-3 py-1 ${tipo === 'compra' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Compras</Link>
          <Link href="?tipo=venta" className={`rounded px-3 py-1 ${tipo === 'venta' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Ventas</Link>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-borde p-4 hover:border-acento">
        <span className="text-2xl">📄</span>
        <span className="text-sm">{archivo ? `${archivo} (elige otro para cambiarlo)` : 'Elige el archivo del RCV (.csv o .xlsx)'}</span>
        <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
      </label>
      {error && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{error}</p>}
      {info && <p className="text-sm text-tenue">{info}</p>}

      {filas.length > 0 && (
        <>
          <div className="tarjeta flex flex-wrap items-end gap-3 p-3">
            <div>
              <label className="etiqueta" htmlFor="periodo">Período del libro</label>
              <select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="campo w-44">
                {[anio - 1, anio].flatMap((y) => MESES.map((m, i) => {
                  const v = `${y}-${String(i + 1).padStart(2, '0')}`;
                  return <option key={v} value={v}>{m} {y}</option>;
                }))}
              </select>
            </div>
            <div className="min-w-56 flex-1">
              <label className="etiqueta" htmlFor="m-cuenta">Cuenta para los seleccionados</label>
              <input id="m-cuenta" list="cuentas-rcv" value={masivo.cuenta} onChange={(e) => setMasivo({ ...masivo, cuenta: codigoDe(e.target.value) || e.target.value })} className="campo num" placeholder="Código o nombre" />
            </div>
            <div className="w-56">
              <span className="etiqueta">Centro de costo</span>
              <SelectorCC valor={masivo.cc} onChange={(v) => setMasivo({ ...masivo, cc: v })} centros={centros} />
            </div>
            <button type="button" className="boton-sec" onClick={aplicarMasivo}>Aplicar</button>
            <p className="w-full text-xs text-tenue">No cambia los documentos revisados en el paso 2. Para varias cuentas, descripciones u otros impuestos, usa ✏️ Detalle.</p>
          </div>

          <div className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[1150px] text-xs">
              <thead className="text-left text-tenue uppercase">
                <tr className="border-b border-borde">
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" aria-label="Seleccionar todos" checked={filas.every((f) => f.incluir || f.duplicado || f.resultado?.ok)}
                      onChange={(e) => setFilas((fs) => fs.map((f) => (f.duplicado || f.resultado?.ok ? f : { ...f, incluir: e.target.checked })))} />
                  </th>
                  <th className="px-2 py-2">Estado</th><th className="px-2 py-2">Documento</th><th className="px-2 py-2">{tipo === 'compra' ? 'Proveedor' : 'Cliente'}</th>
                  <th className="px-2 py-2 text-right">Neto</th><th className="px-2 py-2 text-right">Exento</th><th className="px-2 py-2 text-right">IVA</th>
                  {tipo === 'compra' && <th className="px-2 py-2 text-right">Otros</th>}
                  <th className="px-2 py-2 text-right">Total</th><th className="w-56 px-2 py-2">Cuenta</th><th className="w-44 px-2 py-2">{tipo === 'venta' ? 'Cobro / CC' : 'CC'}</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const p = problemas(f);
                  const bloqueada = f.duplicado || !!f.resultado?.ok;
                  return (
                    <tr key={i} className={`border-b border-borde/40 align-top ${!f.incluir || bloqueada ? 'opacity-60' : ''}`}>
                      <td className="px-2 py-1.5"><input type="checkbox" checked={f.incluir} disabled={bloqueada} onChange={(e) => set(i, { incluir: e.target.checked })} aria-label="Incluir" /></td>
                      <td className="px-2 py-1.5">
                        {f.resultado?.ok ? <span className="text-acento">✓ N° {f.resultado.numero}</span>
                          : f.resultado ? <span className="text-peligro" title={f.resultado.error}>✕ {f.resultado.error?.slice(0, 60)}</span>
                          : f.duplicado ? <span className="text-tenue">Ya registrado</span>
                          : p.length ? <span className="text-aviso" title={p.join('\n')}>⚠ {p[0].slice(0, 40)}{p.length > 1 ? ` (+${p.length - 1})` : ''}</span>
                          : <span className="text-acento">Listo</span>}
                        {!bloqueada && (
                          <div><button type="button" onClick={() => setAbierto(i)} className={`mt-1 rounded border px-1.5 py-0.5 ${f.detalle ? 'border-acento/50 text-acento' : 'border-borde text-tenue hover:text-texto'}`}>
                            {f.detalle ? `✓ ${f.detalle.lineas.length} línea${f.detalle.lineas.length > 1 ? 's' : ''}` : '✏️ Detalle'}
                          </button></div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="num">{f.doc.tipoDTE} N° {f.doc.numero}</div>
                        <div className="text-tenue">{nombreDte(f.doc.tipoDTE)} · {fechaCL(f.doc.fecha)}{tipo === 'compra' && f.doc.fecha.slice(0, 7) < periodo ? ' (mes anterior → día 1)' : ''}</div>
                      </td>
                      <td className="max-w-[220px] px-2 py-1.5"><div className="truncate">{f.doc.razonSocial}</div><div className="num text-tenue">{f.doc.rutCodigo}-{f.doc.rutDV}</div></td>
                      <td className="num px-2 py-1.5 text-right">{clp(f.doc.neto)}</td>
                      <td className="num px-2 py-1.5 text-right">{f.doc.exento ? clp(f.doc.exento) : ''}</td>
                      <td className="num px-2 py-1.5 text-right">{clp(f.doc.iva)}</td>
                      {tipo === 'compra' && <td className="num px-2 py-1.5 text-right">{f.doc.otrosImpuestos ? clp(f.doc.otrosImpuestos) : ''}</td>}
                      <td className="num px-2 py-1.5 text-right font-semibold">{clp(f.doc.total)}</td>
                      <td className="px-2 py-1.5">
                        {f.detalle ? <span className="text-tenue">Según detalle</span> : (
                          <>
                            <input list="cuentas-rcv" value={f.cuenta} disabled={bloqueada} onChange={(e) => set(i, { cuenta: codigoDe(e.target.value) || e.target.value })} className="campo num py-1" aria-label="Cuenta" />
                            <div className="truncate text-[11px] text-tenue">{plan.regla(f.cuenta) ? plan.nombre(f.cuenta) : ''}</div>
                          </>
                        )}
                      </td>
                      <td className="space-y-1 px-2 py-1.5">
                        {tipo === 'venta' && (
                          <select value={f.formaPago} disabled={bloqueada} onChange={(e) => set(i, { formaPago: e.target.value as Fila['formaPago'] })} className="campo py-1 text-xs" aria-label="Forma de cobro">
                            <option value="clientes">Por cobrar (clientes)</option><option value="banco">Pagada (banco)</option><option value="deudores">Deudores varios</option>
                          </select>
                        )}
                        {!f.detalle && <SelectorCC valor={f.cc} onChange={(v) => set(i, { cc: v })} centros={centros} deshabilitado={bloqueada || (!!plan.regla(f.cuenta) && !plan.regla(f.cuenta)?.aceptaCentroCosto)} requerido={plan.regla(f.cuenta)?.requiereCentroCosto} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t border-borde">
                  <td colSpan={4} className="px-2 py-2">{seleccionadas.length} seleccionados (notas de crédito restan)</td>
                  <td className="num px-2 py-2 text-right">{clp(tot('neto'))}</td>
                  <td className="num px-2 py-2 text-right">{clp(tot('exento'))}</td>
                  <td className="num px-2 py-2 text-right">{clp(tot('iva'))}</td>
                  {tipo === 'compra' && <td className="num px-2 py-2 text-right">{clp(tot('otrosImpuestos'))}</td>}
                  <td className="num px-2 py-2 text-right">{clp(tot('total'))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="boton" disabled={!listas.length || !!avance} onClick={contabilizar}>
              {avance ? `Contabilizando ${avance.hecho} de ${avance.total}…` : `Contabilizar ${listas.length} documento${listas.length === 1 ? '' : 's'}`}
            </button>
            {seleccionadas.length > listas.length && <span className="text-sm text-aviso">{seleccionadas.length - listas.length} seleccionados con problemas no se contabilizarán.</span>}
            {registrados > 0 && <span className="text-sm text-acento">✓ {registrados} registrados.</span>}
            {conError > 0 && <span className="text-sm text-peligro">{conError} con error (revisa la columna Estado).</span>}
            {registrados > 0 && <Link className="boton-sec" href={`../libro?tipo=${tipo}&anio=${periodo.slice(0, 4)}&mes=${Number(periodo.slice(5, 7))}`}>Ver libro de {tipo === 'compra' ? 'compras' : 'ventas'}</Link>}
          </div>
        </>
      )}

      {abierto !== null && filas[abierto] && (
        <DetalleModal
          key={abierto}
          tipo={tipo} plan={plan} centros={centros}
          filas={filas} indice={abierto}
          seleccionables={filas.map((f, i) => ({ f, i })).filter(({ f }) => !f.duplicado && !f.resultado?.ok).map(({ i }) => i)}
          onGuardar={(i, detalle, vence) => set(i, { detalle, vence })}
          onQuitar={(i) => set(i, { detalle: undefined })}
          onIr={setAbierto}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
