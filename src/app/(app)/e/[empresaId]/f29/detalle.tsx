'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { MesF29 } from '@/tributario/f29';
import { CODIGOS_DECLARABLES, F29_MANUALES, F29_ANTICIPO } from '@/tributario/f29';
import { compensacionIVA, montosSugeridos, fechaPagoSugerida, CONCEPTOS_PAGO, type ConceptoPago } from '@/tributario/asientos-f29';
import type { AsientoF29 } from '@/lib/datos/f29';
import { clp, MESES } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarF29, guardarAjustesF29, presentarF29, reabrirF29, generarCompensacion, registrarPagoF29 } from './acciones';

const SECCIONES: { titulo: string; filas: [number, string, number?][] }[] = [
  { titulo: 'Débitos', filas: [[503, 'Cantidad facturas emitidas'], [502, 'Débito facturas emitidas'], [110, 'Cantidad boletas'], [111, 'Débito boletas'],
    [758, 'Cantidad comprobantes de pago electrónico'], [759, 'Débito comprobantes de pago electrónico'],
    [513, 'Notas de débito emitidas', 512], [510, 'Notas de crédito emitidas', 509], [142, 'Ventas exentas', 586], [39, 'IVA retenido facturas de compra'], [538, 'Total débitos']] },
  { titulo: 'Créditos', filas: [[511, 'Crédito IVA documentos electrónicos'], [519, 'Cantidad facturas recibidas del giro'], [520, 'Crédito facturas del giro'],
    [525, 'Facturas de activo fijo', 524], [528, 'Notas de crédito recibidas', 527], [532, 'Notas de débito recibidas', 531], [521, 'Sin derecho a crédito (neto)', 564],
    [584, 'Cantidad compras exentas / no gravadas'], [562, 'Monto compras exentas / no gravadas'], [504, 'Remanente mes anterior'], [537, 'Total créditos']] },
  { titulo: 'Resultado', filas: [[77, 'Remanente de crédito fiscal'], [89, 'IVA determinado a pagar']] },
  { titulo: 'PPM y retenciones', filas: [[563, 'Base imponible PPM'], [115, 'Tasa PPM (%)'], [62, 'PPM'], [151, 'Retención honorarios'], [48, 'Impuesto único 2ª categoría'], [595, 'Sub total impuesto determinado anverso']] },
  { titulo: 'Anticipo cambio de sujeto', filas: [[556, 'IVA anticipado del período'], [557, 'Remanente anticipo mes anterior'], [558, 'Devolución mes anterior'],
    [543, 'Total anticipo cambio de sujeto'], [598, 'Anticipo a imputar (tope cód. 89)'], [573, 'Remanente anticipo período siguiente']] },
  { titulo: 'Total', filas: [[547, 'Total determinado'], [91, 'Total a pagar']] },
];
const CANTIDADES = new Set([503, 110, 758, 519, 584]);
const ETIQ_MANUAL: Record<string, string> = { '110': 'Cant. boletas', '111': 'Débito boletas', '758': 'Cant. comprobantes pago electr.', '759': 'Débito comprobantes pago electr.',
  '563': 'Base imponible PPM', '543': 'Total anticipo', '573': 'Remanente anticipo siguiente' };
const ETIQ_ANTICIPO: Record<string, string> = { '556': 'IVA anticipado del período', '557': 'Remanente anticipo mes anterior', '558': 'Devolución mes anterior' };
const tasaTxt = (t: number) => (+t || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });
const declarable = (c: number) => (CODIGOS_DECLARABLES as readonly number[]).includes(c);
/** Formatea con separador de miles mientras se digita: sólo dígitos (y signo menos al inicio). */
const miles = (v: string | number | null | undefined) => {
  const t = String(v ?? '').trim();
  const neg = t.startsWith('-');
  const dig = t.replace(/[^0-9]/g, '');
  if (!dig) return neg ? '-' : '';
  return (neg ? '-' : '') + Number(dig).toLocaleString('es-CL');
};

export function DetalleF29({ empresaId, anio, m, escribe, admin, esEnero, remanenteDesdeDic, asientos, tesoreria }: {
  empresaId: string; anio: number; m: MesF29; escribe: boolean; admin: boolean; esEnero: boolean; remanenteDesdeDic: boolean;
  asientos: AsientoF29[]; tesoreria: { codigo: string; nombre: string }[];
}) {
  const d0 = m.declaracion;
  const presentado = d0?.estado === 'presentado';
  const [decl, setDecl] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d0?.declarado ?? {}).map(([k, v]) => [k, miles(v as number)])));
  const [utm, setUtm] = useState(d0?.utm ? miles(d0.utm) : '');
  const [remIni, setRemIni] = useState(d0?.remanenteInicial != null ? miles(d0.remanenteInicial) : '');
  const [ppmComp, setPpmComp] = useState(false);
  // Ajustes del mes (vacío = calculado)
  const aj0 = d0?.ajustes ?? {};
  const [tasaMan, setTasaMan] = useState(aj0.tasaPPMManual && aj0.tasaPPM != null ? String(aj0.tasaPPM).replace('.', ',') : '');
  const [manual, setManual] = useState<Record<string, string>>(Object.fromEntries(Object.entries(aj0.manual ?? {}).map(([k, v]) => [k, miles(v as number)])));
  const [anticipo, setAnticipo] = useState<Record<string, string>>(Object.fromEntries(Object.entries(aj0.anticipo ?? {}).map(([k, v]) => [k, miles(v as number)])));
  const [remAntIni, setRemAntIni] = useState(aj0.remanenteAnticipoInicial != null ? miles(aj0.remanenteAnticipoInicial) : '');
  const aplicarAjustes = () => ejecutar(() => guardarAjustesF29(empresaId, anio, m.m, {
    tasaPPM: tasaMan, manual, anticipo, remanenteAnticipoInicial: remAntIni, tasaGuardada: m.tasaPPMFuente === 'guardada' ? m.tasaPPM : null,
  }));
  // Montos del pago: lo sugerido (declarado si está presentado) más lo que se edite a mano
  const [montosEdit, setMontosEdit] = useState<Partial<Record<ConceptoPago, number>>>({});
  const montos: Record<ConceptoPago, number> = { ...montosSugeridos(m), ...montosEdit };
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
  // Orden: presentar → compensar → pagar. Si ya hay asientos (p. ej. importados), se muestran igual.
  const mostrarPasos = presentado || !!compExiste || !!pagoExiste;
  const pagoHabilitado = !!compExiste || !!pagoExiste || !comp.lineas.length;
  const iva89 = presentado && d0?.declarado?.['89'] != null ? Math.round(Number(d0.declarado['89'])) : m.ivaAPagar;
  const difiereIVA = iva89 !== Math.round(m.ivaAPagar);
  const totalPago = Object.values(montos).reduce((a, b) => a + (b || 0), 0);
  const num = (v: string) => Math.round(Number(v.replace(/\./g, '')) || 0);
  const sinDigitar = CODIGOS_DECLARABLES.every((c) => !decl[String(c)]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">F29 {MESES[m.m - 1]} {anio} {presentado && <span className="ml-2 rounded bg-acento/20 px-2 py-0.5 text-xs text-acento">PRESENTADO</span>}</h2>
        <div className="text-xs text-tenue">{m.nDocsV} documentos de venta · {m.nDocsC} de compra</div>
      </div>
      {m.desactualizado && <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">⚠️ Este F29 está presentado, pero una corrección en un mes anterior cambió su remanente (cód. 504: declarado {clp(Number(d0?.declarado?.['504'] ?? 0))}, recalculado {clp(m.remanenteReaj)}). Hay que rectificarlo: {admin ? 'reábrelo, revisa y vuelve a presentarlo' : 'pide a un administrador que lo reabra'}. Los meses siguientes ya usan lo recalculado.</p>}
      {m.remanenteCorregido && <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm text-info">El remanente anterior de este mes viene de una corrección ingresada a mano ({clp(m.remanenteAnt)}); este mes y los siguientes se calculan con él.</p>}
      {!presentado && d0?.declarado && ['504', '537', '77', '89'].some((c) => d0.declarado![c] != null && Math.round(Number(d0.declarado![c])) !== Math.round(m.codigos[Number(c)] ?? 0)) && (
        <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">Lo guardado en «Declarado» para el remanente o el IVA ya no coincide con lo recalculado. Usa «Copiar calculado» y guarda, o lo digitado se presentará tal cual.</p>
      )}
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
                  const aMano = m.manuales.includes(String(cod)) || (cod === 115 && m.tasaPPMFuente === 'manual') || ((cod === 556 || cod === 558) && calc > 0) || (cod === 557 && m.c557Fuente === 'manual');
                  const fmt = cod === 115 ? `${tasaTxt(calc)}%` : CANTIDADES.has(cod) ? (calc || '') : clp(calc);
                  const dv = presentado ? miles((d0?.declarado as Record<string, number> | undefined)?.[String(cod)]) : decl[String(cod)];
                  const difiere = dv != null && dv !== '' && num(dv) !== Math.round(calc);
                  return (
                    <tr key={cod} className="border-b border-borde/30">
                      <td className="num px-3 py-1 text-tenue">{cod}</td><td className="px-2 py-1">{nombre}</td>
                      <td className="num px-2 py-1 text-right text-tenue">{codN ? m.codigos[codN] || '' : ''}</td>
                      <td className={`num px-2 py-1 text-right ${aMano ? 'text-info' : ''}`} title={aMano ? 'Ingresado a mano' : undefined}>{aMano ? '✎ ' : ''}{fmt}</td>
                      <td className="px-3 py-0.5 text-right">
                        {declarable(cod) && (
                          <input inputMode="numeric" disabled={presentado || !escribe} value={dv ?? ''} onChange={(e) => setDecl({ ...decl, [cod]: miles(e.target.value) })} placeholder={presentado ? '' : miles(Math.round(calc))}
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
            <h3 className="font-semibold">Ajustes del mes</h3>
            <p className="text-[11px] text-tenue">Lo que ingreses reemplaza lo calculado y se recalculan este mes y los siguientes. Déjalo vacío para volver al calculado.</p>
            <div>
              <label className="etiqueta" htmlFor="tasappm">Tasa PPM (%)</label>
              <input id="tasappm" inputMode="decimal" disabled={presentado || !escribe} value={tasaMan} onChange={(e) => setTasaMan(e.target.value.replace(/[^0-9,.]/g, ''))}
                placeholder={tasaTxt(m.tasaPPM)} className="campo num w-32" />
              <p className="mt-0.5 text-[11px] text-tenue">
                {m.tasaPPMFuente === 'manual' ? 'Ingresada a mano para este mes.'
                  : m.tasaPPMFuente === 'guardada' ? `Grabada al guardar este F29 (${tasaTxt(m.tasaPPM)}%): un cambio en la tasa de la empresa no la altera.`
                  : `Tasa de la empresa (${tasaTxt(m.tasaPPM)}%). Queda grabada en este mes al guardar o presentar el F29.`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {F29_MANUALES.map((c) => (
                <div key={c}>
                  <label className="etiqueta" htmlFor={`man${c}`}>{c} · {ETIQ_MANUAL[c]}</label>
                  <input id={`man${c}`} inputMode="numeric" disabled={presentado || !escribe} value={manual[c] ?? ''} onChange={(e) => setManual({ ...manual, [c]: miles(e.target.value) })}
                    placeholder={miles(Math.round(m.codigos[+c] ?? 0)) || '0'} className={`campo num py-1 text-right text-xs ${manual[c] ? 'border-info' : ''}`} />
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-md border border-borde p-3">
              <div className="text-xs font-semibold">Anticipo cambio de sujeto</div>
              <div className="grid grid-cols-2 gap-2">
                {F29_ANTICIPO.map((c) => (
                  <div key={c}>
                    <label className="etiqueta" htmlFor={`ant${c}`}>{c} · {ETIQ_ANTICIPO[c]}</label>
                    <input id={`ant${c}`} inputMode="numeric" disabled={presentado || !escribe} value={anticipo[c] ?? ''} onChange={(e) => setAnticipo({ ...anticipo, [c]: miles(e.target.value) })}
                      placeholder={miles(Math.round(m.codigos[+c] ?? 0)) || '0'} className={`campo num py-1 text-right text-xs ${anticipo[c] ? 'border-info' : ''}`} />
                  </div>
                ))}
                {esEnero && (
                  <div className="col-span-2">
                    <label className="etiqueta" htmlFor="remantini">Remanente anticipo de diciembre {anio - 1} (su cód. 573)</label>
                    <input id="remantini" inputMode="numeric" disabled={presentado || !escribe || remanenteDesdeDic} value={remanenteDesdeDic ? '' : remAntIni} onChange={(e) => setRemAntIni(miles(e.target.value))}
                      placeholder={remanenteDesdeDic ? 'Desde el F29 de diciembre' : '0'} className="campo num w-40 py-1 text-right text-xs" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-tenue">
                {m.c557Fuente === 'manual' ? 'Cód. 557 ingresado a mano.' : m.m === 1 ? `Cód. 557: el 573 de diciembre ${anio - 1}` : 'Cód. 557: el 573 del mes anterior'}
                {m.c557Fuente === 'manual' ? '' : ', reajustado por UTM como lo hace el SII. Si el SII propone otro valor (por una devolución, cód. 558), corrígelo aquí.'}
                {' '}El anticipo imputado (598) rebaja el total a pagar y el pago del IVA.
              </p>
            </div>
            {escribe && !presentado && <button type="button" className="boton-sec" disabled={pendiente} onClick={aplicarAjustes}>Aplicar ajustes</button>}
          </div>

          <div className="tarjeta space-y-3 p-4 text-sm">
            <h3 className="font-semibold">1. Declaración</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="etiqueta" htmlFor="utm">UTM del mes</label>
                <input id="utm" inputMode="numeric" disabled={presentado || !escribe} value={utm} onChange={(e) => setUtm(miles(e.target.value))} placeholder={m.utmPeriodo ? miles(m.utmPeriodo) : ''} className="campo num" />
              </div>
            </div>
            <div className="space-y-1 rounded-md border border-borde p-3">
              <label className="etiqueta" htmlFor="remini">{esEnero && !remanenteDesdeDic ? 'Remanente de diciembre (cód. 77)' : `Corregir remanente de ${MESES[(m.m + 10) % 12].toLowerCase()} (cód. 77)`}</label>
              <div className="flex flex-wrap items-center gap-2">
                <input id="remini" inputMode="numeric" disabled={presentado || !escribe} value={remIni} onChange={(e) => setRemIni(miles(e.target.value))} className="campo num w-40"
                  placeholder={m.remanenteAnt ? miles(m.remanenteAnt) : '0'} />
                {escribe && !presentado && (
                  <button type="button" className="boton py-1.5" disabled={pendiente || remIni.trim() === ''}
                    onClick={() => ejecutar(() => guardarF29(empresaId, anio, m.m, decl, num(utm) || null, num(remIni)))}>Aplicar corrección</button>
                )}
                {escribe && !presentado && m.remanenteCorregido && (
                  <button type="button" className="text-xs text-tenue hover:text-peligro" disabled={pendiente}
                    onClick={() => { setRemIni(''); ejecutar(() => guardarF29(empresaId, anio, m.m, decl, num(utm) || null, null)); }}>Quitar corrección</button>
                )}
              </div>
              <p className="text-[11px] text-tenue">
                {presentado
                  ? `Este F29 está presentado: ${admin ? 'reábrelo' : 'pide a un administrador que lo reabra'} para corregir el remanente.`
                  : m.remanenteCorregido
                    ? `Corrección aplicada: ${clp(m.remanenteAnt)} (reemplaza al arrastre automático). Este mes y los siguientes ya están recalculados.`
                    : `Arrastre automático del mes anterior: ${clp(m.remanenteAnt)}. Escribe el monto correcto y aplica: se recalculan este mes y todos los siguientes.`}
              </p>
            </div>
            {escribe && (
              <div className="flex flex-wrap gap-2">
                {!presentado && <button type="button" className="boton-sec" onClick={() => setDecl(Object.fromEntries(CODIGOS_DECLARABLES.map((c) => [String(c), miles(Math.round(m.codigos[c] ?? 0))])))}>Copiar calculado</button>}
                {!presentado && <button type="button" className="boton-sec" disabled={pendiente} onClick={() => ejecutar(() => guardarF29(empresaId, anio, m.m, decl, num(utm) || null, remIni === '' ? null : num(remIni)))}>Guardar borrador</button>}
                {!presentado && <button type="button" className="boton" disabled={pendiente} onClick={() => confirm(`¿Marcar el F29 de ${MESES[m.m - 1]} como presentado? Quedará bloqueado.${sinDigitar ? '\n\nNo hay valores digitados en "Declarado": se presentará con lo calculado.' : '\n\nLos códigos sin valor digitado se presentarán con lo calculado.'}`) && ejecutar(() => presentarF29(empresaId, anio, m.m, decl))}>Marcar presentado</button>}
                {presentado && admin && <button type="button" className="boton-sec" disabled={pendiente} onClick={() => ejecutar(() => reabrirF29(empresaId, anio, m.m))}>Reabrir</button>}
              </div>
            )}
          </div>

          {!mostrarPasos ? (
            <div className="tarjeta space-y-1 p-4 text-sm">
              <h3 className="font-semibold text-tenue">2. Compensación de IVA · 3. Pago</h3>
              <p className="text-xs text-tenue">Primero revisa la columna «Declarado» (lo que no digites se toma del calculado) y marca el F29 como presentado. Después se habilitan el asiento de compensación y el registro del pago, en ese orden.</p>
            </div>
          ) : (
            <>
              <div className="tarjeta space-y-2 p-4 text-sm">
                <h3 className="font-semibold">2. Asiento de compensación de IVA</h3>
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
                    {difiereIVA && <p className="text-xs text-aviso">El IVA a pagar declarado ({clp(iva89)}) difiere del calculado ({clp(m.ivaAPagar)}). La compensación salda los libros con lo calculado; ajusta la diferencia con un asiento manual si corresponde.</p>}
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ppmComp} onChange={(e) => setPpmComp(e.target.checked)} /> Provisionar el PPM en este asiento</label>
                    {escribe && <button type="button" className="boton" disabled={pendiente || !comp.lineas.length || !comp.cuadra} onClick={() => ejecutar(() => generarCompensacion(empresaId, anio, m.m, ppmComp))}>Generar compensación</button>}
                  </>
                )}
              </div>
              {pagoHabilitado ? (
                  <div className="tarjeta space-y-2 p-4 text-sm">
                    <h3 className="font-semibold">3. Pago del F29</h3>
                    {pagoExiste ? <p className="text-acento">✓ Registrado: <Link className="underline" href={`/e/${empresaId}/diario?anio=${pagoExiste.fecha.slice(0, 4)}&mes=${+pagoExiste.fecha.slice(5, 7)}#n${pagoExiste.numero}`}>asiento N° {pagoExiste.numero}</Link></p> : (
                      <>
                        {CONCEPTOS_PAGO.map((c) => (
                          <div key={c.k} className="flex items-center gap-2 text-xs">
                            <span className="flex-1">{c.lbl}{c.cod ? <span className="text-tenue"> · cód. {c.cod}</span> : ''}</span>
                            <input inputMode="numeric" value={montos[c.k] ? miles(montos[c.k]) : ''} onChange={(e) => setMontosEdit({ ...montosEdit, [c.k]: num(e.target.value) })} className="campo num w-32 py-0.5 text-right" aria-label={c.lbl} />
                          </div>
                        ))}
                        <div className="flex flex-wrap items-end gap-2 pt-1">
                          <select value={banco} onChange={(e) => setBanco(e.target.value)} className="campo w-56 py-1 text-xs" aria-label="Pagado desde">
                            {tesoreria.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
                          </select>
                          <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className="campo w-40 py-1 text-xs" aria-label="Fecha de pago" />
                        </div>
                        {escribe && <button type="button" className="boton" disabled={pendiente || !totalPago || !banco} onClick={() => ejecutar(() => registrarPagoF29(empresaId, anio, m.m, montos, banco, fechaPago))}>Registrar pago {clp(totalPago)}</button>}
                      </>
                    )}
                  </div>
              ) : (
                <div className="tarjeta space-y-1 p-4 text-sm">
                  <h3 className="font-semibold text-tenue">3. Pago del F29</h3>
                  <p className="text-xs text-tenue">Genera primero la compensación: el pago salda el IVA por pagar que ella deja en 2104002.</p>
                </div>
              )}
            </>
          )}
          <Mensaje {...msg} />
        </div>
      </div>
    </section>
  );
}
