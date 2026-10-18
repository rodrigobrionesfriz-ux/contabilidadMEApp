'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { MesF29 } from '@/tributario/f29';
import { CODIGOS_DECLARABLES } from '@/tributario/f29';
import { compensacionIVA, montosSugeridos, fechaPagoSugerida, CONCEPTOS_PAGO, type ConceptoPago } from '@/tributario/asientos-f29';
import type { AsientoF29 } from '@/lib/datos/f29';
import { clp, MESES } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarF29, presentarF29, reabrirF29, generarCompensacion, registrarPagoF29 } from './acciones';

const SECCIONES: { titulo: string; filas: [number, string, number?][] }[] = [
  { titulo: 'Débitos', filas: [[502, 'Facturas emitidas', 503], [111, 'Boletas', 110], [513, 'Notas de débito emitidas', 512], [510, 'Notas de crédito emitidas', 509], [142, 'Ventas exentas', 586], [39, 'IVA retenido facturas de compra'], [538, 'Total débitos']] },
  { titulo: 'Créditos', filas: [[520, 'Facturas recibidas del giro', 519], [525, 'Facturas de activo fijo', 524], [528, 'Notas de crédito recibidas', 527], [532, 'Notas de débito recibidas', 531], [521, 'Sin derecho a crédito (neto)', 564], [562, 'Compras exentas', 584], [504, 'Remanente mes anterior'], [537, 'Total créditos']] },
  { titulo: 'Resultado', filas: [[77, 'Remanente de crédito fiscal'], [89, 'IVA determinado a pagar']] },
  { titulo: 'PPM y retenciones', filas: [[563, 'Base imponible PPM'], [62, 'PPM'], [151, 'Retención honorarios'], [48, 'Impuesto único 2ª categoría']] },
  { titulo: 'Total', filas: [[91, 'Total a pagar']] },
];
const declarable = (c: number) => (CODIGOS_DECLARABLES as readonly number[]).includes(c);

export function DetalleF29({ empresaId, anio, m, escribe, admin, esEnero, remanenteDesdeDic, asientos, tesoreria }: {
  empresaId: string; anio: number; m: MesF29; escribe: boolean; admin: boolean; esEnero: boolean; remanenteDesdeDic: boolean;
  asientos: AsientoF29[]; tesoreria: { codigo: string; nombre: string }[];
}) {
  const d0 = m.declaracion;
  const presentado = d0?.estado === 'presentado';
  const [decl, setDecl] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d0?.declarado ?? {}).map(([k, v]) => [k, String(v)])));
  const [utm, setUtm] = useState(d0?.utm ? String(d0.utm) : '');
  const [remIni, setRemIni] = useState(d0?.remanenteInicial != null ? String(d0.remanenteInicial) : '');
  const [ppmComp, setPpmComp] = useState(false);
  const [montos, setMontos] = useState<Record<ConceptoPago, number>>(montosSugeridos(m));
  const [banco, setBanco] = useState(tesoreria.find((c) => c.codigo === '1101201')?.codigo ?? tesoreria[0]?.codigo ?? '');
  const [fechaPago, setFechaPago] = useState(fechaPagoSugerida(anio, m.m));
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (f: () => Promise<{ ok: true; mensaje: string } | { ok: false; error: string }>) => iniciar(async () => {
    setMsg({});
    const r = await f();
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
  });
  const comp = compensacionIVA(m, anio, ppmComp);
  const compExiste = asientos.find((a) => a.origen_id.startsWith('ivaf29') && !a.anulado);
  const pagoExiste = asientos.find((a) => a.origen_id.startsWith('pagof29') && !a.anulado);
  const totalPago = Object.values(montos).reduce((a, b) => a + (b || 0), 0);
  const num = (v: string) => Math.round(Number(v.replace(/\./g, '')) || 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">F29 {MESES[m.m - 1]} {anio} {presentado && <span className="ml-2 rounded bg-acento/20 px-2 py-0.5 text-xs text-acento">PRESENTADO</span>}</h2>
        <div className="text-xs text-tenue">{m.nDocsV} documentos de venta · {m.nDocsC} de compra</div>
      </div>
      {m.remanenteSinUTM && <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">Falta la UTM para reajustar el remanente: ingrésala en la declaración del mes correspondiente.</p>}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde"><th className="px-3 py-2">Código</th><th className="px-2 py-2">Concepto</th><th className="px-2 py-2 text-right">Cant.</th>
                <th className="px-2 py-2 text-right">Calculado</th><th className="w-36 px-3 py-2 text-right">Declarado</th></tr>
            </thead>
            {SECCIONES.map((s) => (
              <tbody key={s.titulo}>
                <tr><td colSpan={5} className="bg-panel-2 px-3 py-1 text-[10px] font-semibold tracking-wider text-tenue uppercase">{s.titulo}</td></tr>
                {s.filas.map(([cod, nombre, codN]) => {
                  const calc = m.codigos[cod] ?? 0;
                  const dv = decl[String(cod)];
                  const difiere = dv != null && dv !== '' && num(dv) !== Math.round(calc);
                  return (
                    <tr key={cod} className="border-b border-borde/30">
                      <td className="num px-3 py-1 text-tenue">{cod}</td><td className="px-2 py-1">{nombre}</td>
                      <td className="num px-2 py-1 text-right text-tenue">{codN ? m.codigos[codN] || '' : ''}</td>
                      <td className="num px-2 py-1 text-right">{clp(calc)}</td>
                      <td className="px-3 py-0.5 text-right">
                        {declarable(cod) && (
                          <input inputMode="numeric" disabled={presentado || !escribe} value={dv ?? ''} onChange={(e) => setDecl({ ...decl, [cod]: e.target.value })}
                            className={`campo num py-0.5 text-right text-xs ${difiere ? 'border-aviso text-aviso' : ''}`} aria-label={`Declarado ${cod}`} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        <div className="space-y-4">
          <div className="tarjeta space-y-3 p-4 text-sm">
            <h3 className="font-semibold">Declaración</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta" htmlFor="utm">UTM del mes</label>
                <input id="utm" inputMode="numeric" disabled={presentado || !escribe} value={utm} onChange={(e) => setUtm(e.target.value)} placeholder={String(m.utmPeriodo || '')} className="campo num" />
              </div>
              {esEnero && !remanenteDesdeDic && (
                <div>
                  <label className="etiqueta" htmlFor="remini">Remanente de diciembre</label>
                  <input id="remini" inputMode="numeric" disabled={presentado || !escribe} value={remIni} onChange={(e) => setRemIni(e.target.value)} className="campo num" placeholder="Cód. 77 dic." />
                </div>
              )}
            </div>
            {escribe && (
              <div className="flex flex-wrap gap-2">
                {!presentado && <button type="button" className="boton-sec" onClick={() => setDecl(Object.fromEntries(CODIGOS_DECLARABLES.map((c) => [String(c), String(Math.round(m.codigos[c] ?? 0))])))}>Copiar calculado</button>}
                {!presentado && <button type="button" className="boton-sec" disabled={pendiente} onClick={() => ejecutar(() => guardarF29(empresaId, anio, m.m, decl, num(utm) || null, remIni === '' ? null : num(remIni)))}>Guardar borrador</button>}
                {!presentado && <button type="button" className="boton" disabled={pendiente} onClick={() => confirm(`¿Marcar el F29 de ${MESES[m.m - 1]} como presentado? Quedará bloqueado.`) && ejecutar(() => presentarF29(empresaId, anio, m.m, decl))}>Marcar presentado</button>}
                {presentado && admin && <button type="button" className="boton-sec" disabled={pendiente} onClick={() => ejecutar(() => reabrirF29(empresaId, anio, m.m))}>Reabrir</button>}
              </div>
            )}
          </div>

          <div className="tarjeta space-y-2 p-4 text-sm">
            <h3 className="font-semibold">Asiento de compensación de IVA</h3>
            {compExiste ? <p className="text-acento">✓ Registrado: <Link className="underline" href={`/e/${empresaId}/diario?anio=${anio}&mes=${m.m}#n${compExiste.numero}`}>asiento N° {compExiste.numero}</Link></p> : (
              <>
                <table className="w-full text-xs">
                  <tbody>
                    {comp.lineas.map((l, i) => (
                      <tr key={i} className="border-b border-borde/30"><td className="num py-0.5 pr-2 text-tenue">{l.cuenta}</td><td className="max-w-[200px] truncate pr-2" title={l.glosa}>{l.glosa}</td>
                        <td className="num text-right">{l.debe ? clp(l.debe) : ''}</td><td className="num text-right">{l.haber ? clp(l.haber) : ''}</td></tr>
                    ))}
                  </tbody>
                </table>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ppmComp} onChange={(e) => setPpmComp(e.target.checked)} /> Provisionar el PPM en este asiento</label>
                {escribe && <button type="button" className="boton" disabled={pendiente || !comp.lineas.length || !comp.cuadra} onClick={() => ejecutar(() => generarCompensacion(empresaId, anio, m.m, ppmComp))}>Generar compensación</button>}
              </>
            )}
          </div>

          <div className="tarjeta space-y-2 p-4 text-sm">
            <h3 className="font-semibold">Pago del F29</h3>
            {pagoExiste ? <p className="text-acento">✓ Registrado: <Link className="underline" href={`/e/${empresaId}/diario?anio=${pagoExiste.fecha.slice(0, 4)}&mes=${+pagoExiste.fecha.slice(5, 7)}#n${pagoExiste.numero}`}>asiento N° {pagoExiste.numero}</Link></p> : (
              <>
                {CONCEPTOS_PAGO.map((c) => (
                  <div key={c.k} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">{c.lbl}{c.cod ? <span className="text-tenue"> · cód. {c.cod}</span> : ''}</span>
                    <input inputMode="numeric" value={montos[c.k] || ''} onChange={(e) => setMontos({ ...montos, [c.k]: num(e.target.value) })} className="campo num w-32 py-0.5 text-right" aria-label={c.lbl} />
                  </div>
                ))}
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <select value={banco} onChange={(e) => setBanco(e.target.value)} className="campo w-56 py-1 text-xs" aria-label="Pagado desde">
                    {tesoreria.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
                  </select>
                  <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className="campo w-40 py-1 text-xs" aria-label="Fecha de pago" />
                </div>
                {escribe && <button type="button" className="boton" disabled={pendiente || !totalPago || !banco} onClick={() => ejecutar(() => registrarPagoF29(empresaId, anio, m.m, montos, banco, fechaPago))}>Registrar pago {clp(totalPago)}</button>}
                {!compExiste && montos.iva > 0 && <p className="text-xs text-aviso">Genera primero la compensación: el pago salda el IVA por pagar que ella deja en 2104002.</p>}
              </>
            )}
          </div>
          <Mensaje {...msg} />
        </div>
      </div>
    </section>
  );
}
