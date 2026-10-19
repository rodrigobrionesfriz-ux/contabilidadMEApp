'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Saldos } from '@/estados/eeff';
import type { Bien } from '@/activo-fijo/depreciacion';
import { REGIMENES, tasaIDPC, notaTasa } from '@/estados/regimenes';
import { calcularRenta, cuentasGasto, filasExcelRenta, fmtPct, type DatosRenta, type ResultadoRenta, type LineaManual } from '@/tributario/renta';
import type { LineaGasto } from '@/lib/datos/renta';
import { clp, fechaCL } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { CampoNumero } from '@/components/campo-numero';
import { guardarRenta, movimientosCuenta } from './acciones';

type Tab = 'rli' | 'f22' | 'ajustes';
const firmado = (v: number) => (v < 0 ? `(${clp(-v)})` : clp(v));

export function Renta({ empresaId, anio, empresa, M, bienes, ppmF29, datosIniciales, lineasMarcadas, escribe, guardadoEn }: {
  empresaId: string; anio: number; empresa: { nombre: string; rut: string }; M: Saldos; bienes: Bien[]; ppmF29: number;
  datosIniciales: DatosRenta; lineasMarcadas: LineaGasto[]; escribe: boolean; guardadoEn: string | null;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState(datosIniciales);
  const [sucio, setSucio] = useState(false);
  const [tab, setTab] = useState<Tab>('rli');
  const [detalle, setDetalle] = useState<Record<number, LineaGasto>>(() => Object.fromEntries(lineasMarcadas.map((l) => [l.id, l])));
  const [abiertas, setAbiertas] = useState<Record<string, LineaGasto[] | 'cargando' | string>>({});
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const marcadas = new Set(datos.lineasRechazadas);
  const movRechazados = datos.lineasRechazadas.map((id) => detalle[id]).filter(Boolean).map((l) => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber }));
  const R = calcularRenta({ anio, M, datos, bienes, ppmF29, movRechazados });
  const at = anio + 1;
  const transparente = R.reg.k === '14D8';

  const cambiar = (c: Partial<DatosRenta>) => { setDatos((d) => ({ ...d, ...c })); setSucio(true); setMsg({}); };
  const guardar = () => iniciar(async () => {
    const r = await guardarRenta(empresaId, anio, datos);
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
    if (r.ok) { setSucio(false); router.refresh(); }
  });
  const toggleCuenta = (cd: string) => cambiar({ rechazadas: datos.rechazadas.includes(cd) ? datos.rechazadas.filter((x) => x !== cd) : [...datos.rechazadas, cd] });
  const toggleLinea = (l: LineaGasto) => {
    setDetalle((d) => ({ ...d, [l.id]: l }));
    cambiar({ lineasRechazadas: marcadas.has(l.id) ? datos.lineasRechazadas.filter((x) => x !== l.id) : [...datos.lineasRechazadas, l.id] });
  };
  const abrir = async (cd: string) => {
    if (abiertas[cd]) { setAbiertas((a) => { const n = { ...a }; delete n[cd]; return n; }); return; }
    setAbiertas((a) => ({ ...a, [cd]: 'cargando' }));
    const r = await movimientosCuenta(empresaId, anio, cd);
    setAbiertas((a) => ({ ...a, [cd]: r.ok ? r.lineas : r.error }));
  };
  const exportar = async () => {
    const XLSX = await import('xlsx');
    const x = filasExcelRenta(R, empresa, M, datos);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(x.f22); ws['!cols'] = [{ wch: 10 }, { wch: 62 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'F22 AT' + at);
    if (x.rechazados) { const wd = XLSX.utils.aoa_to_sheet(x.rechazados); wd['!cols'] = [{ wch: 10 }, { wch: 42 }, { wch: 16 }, { wch: 48 }]; XLSX.utils.book_append_sheet(wb, wd, 'Gastos rechazados'); }
    XLSX.writeFile(wb, x.nombre);
  };

  return (
    <div className="space-y-4">
      <section className="tarjeta space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60"><label className="etiqueta" htmlFor="reg">Régimen tributario</label>
            <select id="reg" className="campo" value={datos.regimen} disabled={!escribe} onChange={(e) => cambiar({ regimen: e.target.value, tasa: null })}>
              {REGIMENES.map((r) => <option key={r.k} value={r.k}>{r.corto} · {r.nm}</option>)}
            </select></div>
          <div className="w-32"><label className="etiqueta" htmlFor="tasa">Tasa IDPC (%)</label>
            <CampoNumero id="tasa" valor={R.tasa} decimales disabled={!escribe} onCambio={(v) => cambiar({ tasa: v })} /></div>
          <div><span className="etiqueta">Año tributario</span><div className="campo text-tenue">AT {at}</div></div>
          {escribe && <button type="button" className="boton-sec" onClick={() => cambiar({ tasa: null })}>↺ Tasa legal ({fmtPct(tasaIDPC(datos.regimen, anio))}%)</button>}
          <span className="flex-1" />
          {escribe && <button type="button" className="boton" disabled={pendiente || !sucio} onClick={guardar}>{pendiente ? 'Guardando…' : sucio ? '💾 Guardar cambios' : '✓ Guardado'}</button>}
        </div>
        <p className="text-xs text-tenue">📌 {notaTasa(datos.regimen, anio)}</p>
        <div className="rounded-md border border-borde p-3 text-xs">
          <strong>{R.reg.nm}</strong> · {R.reg.art}<br />{R.reg.desc}<br />
          <span className="text-tenue">Contabilidad {R.reg.contabilidad} · {R.reg.correccionMonetaria ? 'aplica' : 'liberado de'} corrección monetaria · depreciación {R.reg.deprInstantanea ? 'instantánea' : 'según vida útil'} · crédito IDPC a los dueños {R.reg.creditoIDPC}%{R.reg.topeIngresosUF ? ` · tope ${Number(R.reg.topeIngresosUF).toLocaleString('es-CL')} UF de ingresos` : ''}</span>
          {typeof R.reg.nota === 'string' && <><br /><span className="text-aviso">⚠ {R.reg.nota}</span></>}
        </div>
        {R.presunta && (
          <div className="rounded-md border border-acento/50 p-3">
            <div className="mb-2 text-xs font-semibold">📐 Base de la renta presunta ({R.reg.art})</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64"><label className="etiqueta" htmlFor="bp">{R.presunta.lbl}</label><CampoNumero id="bp" valor={R.presunta.valor} disabled={!escribe} onCambio={(v) => cambiar({ basePresunta: v ?? 0 })} /></div>
              <div className="w-36"><label className="etiqueta" htmlFor="pp">% de presunción</label><CampoNumero id="pp" valor={R.presunta.pct} decimales vacio disabled={!escribe} onCambio={(v) => cambiar({ pctPresuncion: v })} /></div>
              <div><div className="etiqueta">Renta presunta</div><div className="num text-base font-semibold text-acento">{clp(R.presunta.renta)}</div></div>
            </div>
            <p className="mt-2 text-xs text-tenue">La contabilidad se sigue llevando para el IVA y el control interno, pero no determina la base: el impuesto se calcula sobre la renta presunta. El resultado contable ({clp(R.resultadoBalance)}) queda como referencia y para vigilar el tope de ingresos.
              {R.reg.k === '34AGRI' && <span className="block text-aviso">⚠ El 10% aplica al propietario o usufructuario del predio. Si explotas bajo otro título (arrendamiento), verifica el porcentaje antes de declarar.</span>}
              {R.reg.k === '34MIN' && <span className="block text-aviso">⚠ El porcentaje va de 4% a 20% según el precio promedio anual de la libra de cobre: actualízalo cada año.</span>}</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {R.presunta ? <><Kpi lbl="Base de la presunción" v={R.presunta.valor} /><Kpi lbl={`Renta presunta (${fmtPct(R.presunta.pct)}%)`} v={R.presunta.renta} tono="text-acento" /></>
            : <><Kpi lbl="Resultado según balance" v={R.resultadoBalance} tono={R.resultadoBalance >= 0 ? 'text-acento' : 'text-peligro'} /><Kpi lbl={R.rli >= 0 ? 'Renta líquida imponible' : 'Pérdida tributaria'} v={Math.abs(R.rli)} tono={R.rli >= 0 ? 'text-acento' : 'text-peligro'} /></>}
          {transparente ? <><Kpi lbl="IDPC que paga la empresa" v={0} /><Kpi lbl="Base atribuible a los dueños" v={Math.max(0, R.rli)} tono="text-acento" /></>
            : <><Kpi lbl="Impuesto 1ª categoría" v={R.idpcNeto} tono="text-aviso" />{R.aPagar > 0 ? <Kpi lbl="Impuesto a pagar" v={R.aPagar} tono="text-peligro" /> : <Kpi lbl="Devolución solicitada" v={R.devolucion} tono="text-acento" />}</>}
        </div>
        {transparente && <p className="rounded-md border border-aviso/40 bg-aviso/10 p-3 text-xs text-aviso">⚠️ En el régimen 14 D N°8 (Transparente) la empresa no paga Impuesto de Primera Categoría: la base imponible se atribuye a los dueños según su participación y ellos la declaran en su Global Complementario. Los PPM también se les atribuyen.</p>}
        <Mensaje {...msg} />
        {guardadoEn && !sucio && <p className="text-[11px] text-tenue">Última vez guardada: {fechaCL(guardadoEn.slice(0, 10))} {guardadoEn.slice(11, 16)}</p>}
      </section>

      <div className="no-print flex flex-wrap gap-1 text-sm">
        {([['rli', R.reg.rentaPresunta ? '📐 Renta presunta' : '📐 Renta líquida imponible'], ['f22', '🧾 Formulario 22'], ['ajustes', '⚙️ Ajustes y créditos']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>{l}</button>
        ))}
      </div>

      {tab === 'rli' && <BloqueRLI R={R} empresaId={empresaId} />}
      {tab === 'f22' && <BloqueF22 R={R} at={at} exportar={exportar} />}
      {tab === 'ajustes' && (
        <BloqueAjustes R={R} M={M} datos={datos} escribe={escribe} cambiar={cambiar} toggleCuenta={toggleCuenta} abiertas={abiertas} abrir={abrir} marcadas={marcadas} toggleLinea={toggleLinea} />
      )}
    </div>
  );
}

function Kpi({ lbl, v, tono = 'text-texto' }: { lbl: string; v: number; tono?: string }) {
  return <div className="rounded-md border border-borde p-3"><div className="text-[10px] tracking-wide text-tenue uppercase">{lbl}</div><div className={`num mt-1 text-lg font-semibold ${tono}`}>{clp(v)}</div></div>;
}

function Fila({ cod, lbl, monto, signo, nota, tono, fuerte, fondo }: { cod?: string; lbl: string; monto: number; signo?: string; nota?: string; tono?: string; fuerte?: boolean; fondo?: string }) {
  return (
    <tr className={`border-b border-borde/30 ${fondo || ''}`}>
      <td className="num w-14 py-1 text-[10px] text-tenue">{cod}</td>
      <td className={`py-1 pr-2 ${fuerte ? 'font-semibold' : ''}`}>{signo && <span className="text-tenue">{signo} </span>}{lbl}{nota && <div className="text-[10px] text-tenue">{nota}</div>}</td>
      <td className={`num py-1 text-right whitespace-nowrap ${fuerte ? 'font-semibold' : ''} ${tono || ''}`}>{firmado(monto)}</td>
    </tr>
  );
}

function BloqueRLI({ R, empresaId }: { R: ResultadoRenta; empresaId: string }) {
  const cod = R.reg.cod as Record<string, string>;
  if (R.reg.rentaPresunta && R.presunta) return (
    <section className="tarjeta space-y-3 p-4 text-sm">
      <h2 className="font-semibold">Renta presunta · {R.reg.nm}</h2>
      <p className="text-xs text-tenue">{R.reg.art} · ejercicio comercial {R.anio}</p>
      <table className="w-full max-w-xl text-xs"><tbody>
        <tr className="border-b border-borde/30"><td className="py-1">{R.presunta.lbl}</td><td className="num text-right">{clp(R.presunta.valor)}</td></tr>
        <tr className="border-b border-borde/30"><td className="py-1">× Porcentaje de presunción</td><td className="num text-right">{fmtPct(R.presunta.pct)}%</td></tr>
        <tr className="bg-acento/10 font-semibold"><td className="py-1.5">RENTA PRESUNTA (base imponible)</td><td className="num text-right text-acento">{clp(R.presunta.renta)}</td></tr>
      </tbody></table>
      <p className="text-xs text-tenue">📊 Control del tope del régimen: ingresos del giro registrados en {R.anio}: <strong>{clp(R.ingresos)}</strong>. El límite es de {Number(R.reg.topeIngresosUF).toLocaleString('es-CL')} UF de ventas netas anuales, sumando las de las empresas relacionadas.</p>
      <p className="text-xs text-tenue">🧾 Resultado contable del ejercicio: {clp(R.resultadoBalance)}. No determina el impuesto en este régimen, pero sirve de control interno.</p>
    </section>
  );
  return (
    <section className="tarjeta space-y-3 p-4 text-sm">
      <div><h2 className="font-semibold">Determinación de la renta líquida imponible</h2><p className="text-xs text-tenue">Recuadro N°{String(R.reg.recuadro)} del F22 · ejercicio comercial {R.anio}</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><tbody>
        <Fila cod={cod.ingresos} lbl="Ingresos del giro y otros ingresos" monto={R.ingresos} tono="text-acento" />
        <Fila cod={cod.gastos} lbl="Costos y gastos del ejercicio" monto={R.gastos} signo="−" tono="text-peligro" />
        <Fila cod="645" lbl="RESULTADO SEGÚN BALANCE (antes de impuesto)" monto={R.resultadoBalance} fuerte fondo="bg-panel-2" />
        <tr><td colSpan={3} className="pt-3 pb-1 text-[11px] font-semibold tracking-wide text-aviso">AGREGADOS</td></tr>
        {R.ag.length ? R.ag.map((a, i) => <Fila key={i} cod={a.cod} lbl={a.lbl} monto={a.monto} signo="+" nota={a.nota} tono="text-aviso" />)
          : <tr><td colSpan={3} className="py-1 text-tenue">Sin agregados. Marca los gastos no deducibles en la pestaña Ajustes.</td></tr>}
        <Fila lbl="Total agregados" monto={R.totalAgregados} fuerte tono="text-aviso" />
        <tr><td colSpan={3} className="pt-3 pb-1 text-[11px] font-semibold tracking-wide text-acento">DEDUCCIONES</td></tr>
        {R.de.length ? R.de.map((d, i) => <Fila key={i} cod={d.cod} lbl={d.lbl} monto={d.monto} signo="−" nota={d.nota} tono="text-acento" />)
          : <tr><td colSpan={3} className="py-1 text-tenue">Sin deducciones.</td></tr>}
        <Fila lbl="Total deducciones" monto={R.totalDeducciones} fuerte tono="text-acento" />
        <Fila lbl="Subtotal antes de pérdidas de arrastre" monto={R.rliAntesPerdida} fuerte fondo="bg-panel-2" />
        {R.perdidaPrevia > 0 && <Fila cod="634" lbl="Pérdida tributaria de ejercicios anteriores imputada (Art. 31 N°3)" monto={R.perdidaImputada} signo="−" tono="text-acento" nota={`Disponible: ${clp(R.perdidaPrevia)}. Sólo se imputa hasta absorber la renta positiva del ejercicio.`} />}
        <Fila cod={cod.base} lbl={R.rli >= 0 ? 'RENTA LÍQUIDA IMPONIBLE' : 'PÉRDIDA TRIBUTARIA DEL EJERCICIO'} monto={Math.abs(R.rli)} fuerte fondo={R.rli >= 0 ? 'bg-acento/10' : 'bg-peligro/10'} tono={R.rli >= 0 ? 'text-acento' : 'text-peligro'} />
      </tbody></table></div>
      {R.perdidaRemanente > 0 && <p className="rounded-md border border-aviso/40 bg-aviso/10 p-3 text-xs text-aviso">⚠️ Queda una pérdida tributaria de arrastre de <strong>{clp(R.perdidaRemanente)}</strong> para ejercicios siguientes. Anótala en «Pérdida de arrastre» de la declaración del año {R.anio + 1}.</p>}
      <p className="text-xs text-tenue">🏗️ Conciliación de activo fijo: depreciación financiera según fichas {clp(R.depConc.contable)} · tributaria {clp(R.depConc.tributaria)} · diferencia del ejercicio <strong>{clp(R.depConc.diferencia)}</strong>. {R.reg.deprInstantanea ? 'La base tributaria usa el valor tributario de las adquisiciones del año.' : 'La base tributaria usa la vida y método tributario de cada ficha.'} <Link className="text-acento hover:underline" href={`/e/${empresaId}/activo-fijo?anio=${R.anio}`}>Ver fichas</Link>
        {Math.abs(R.depFin - R.depConc.contable) > 0.5 && <span className="block text-aviso">⚠ La depreciación cargada a resultados (cuentas 3301, {clp(R.depFin)}) no coincide con la de las fichas ({clp(R.depConc.contable)}): revisa si falta contabilizar la depreciación del año o hay bienes sin ficha.</span>}</p>
      <p className="text-xs text-tenue">🧮 Capital propio tributario referencial: {clp(R.cpt)} (activos {clp(R.activos)} − pasivo exigible {clp(R.pasivoExigible)}). Es una aproximación contable: el CPT tributario puede diferir si hay activos o pasivos con valorización tributaria distinta.</p>
    </section>
  );
}

const Ln = ({ linea, c, lbl, monto, tono, fuerte, fondo }: { linea?: string; c?: string; lbl: string; monto: number; tono?: string; fuerte?: boolean; fondo?: string }) => (
  <tr className={`border-b border-borde/30 ${fondo || ''}`}><td className="num w-11 text-[10px] text-tenue">{linea}</td><td className="num w-12 text-[10px] text-acento">{c}</td>
    <td className={`py-1 ${fuerte ? 'font-semibold' : ''}`}>{lbl}</td><td className={`num text-right whitespace-nowrap ${fuerte ? 'font-semibold' : ''} ${tono || ''}`}>{clp(monto)}</td></tr>
);

function BloqueF22({ R, at, exportar }: { R: ResultadoRenta; at: number; exportar: () => void }) {
  const cod = R.reg.cod as Record<string, string>;
  const transparente = R.reg.k === '14D8';
  return (
    <section className="tarjeta space-y-3 p-4 text-sm">
      <div><h2 className="font-semibold">Formulario 22 · año tributario {at}</h2><p className="text-xs text-tenue">Líneas y códigos para el traspaso a la declaración en sii.cl</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th>Lín.</th><th>Cód.</th><th>Concepto</th><th className="text-right">Monto</th></tr></thead>
        <tbody>
          <Ln c={cod.base} lbl="Base imponible de primera categoría" monto={R.baseImponible} fuerte fondo="bg-panel-2" />
          {transparente ? <tr><td colSpan={4} className="py-2 text-aviso">Régimen transparente: la base imponible se atribuye a los dueños. La empresa no determina IDPC.</td></tr> : <>
            <Ln linea={String(R.reg.linea)} c={String(R.reg.codLinea)} lbl={`Impuesto primera categoría (${fmtPct(R.tasa)}% sobre la base)`} monto={R.idpc} tono="text-peligro" />
            <tr><td colSpan={4} className="pt-3 pb-1 text-[11px] font-semibold tracking-wide text-acento">CRÉDITOS IMPUTABLES AL IDPC</td></tr>
            {R.creditos.length ? R.creditos.map((c) => <Ln key={c.lbl} c={c.cod} lbl={c.lbl} monto={c.monto} tono="text-acento" />) : <tr><td colSpan={4} className="py-1 text-tenue">Sin créditos informados. Agrégalos en la pestaña Ajustes.</td></tr>}
            <Ln lbl="Total créditos" monto={R.totalCreditos} tono="text-acento" />
            <Ln lbl="IMPUESTO PRIMERA CATEGORÍA NETO" monto={R.idpcNeto} fuerte fondo="bg-panel-2" tono="text-peligro" />
          </>}
          <tr><td colSpan={4} className="pt-3 pb-1 text-[11px] font-semibold tracking-wide text-acento">PAGOS PROVISIONALES Y RETENCIONES</td></tr>
          <Ln linea="84" c="36" lbl="PPM del ejercicio (Art. 84 LIR)" monto={R.ppmBase} tono="text-acento" />
          {R.reaj !== 0 && <Ln lbl={`Reajuste de PPM al 31/dic (${fmtPct(R.reaj)}%)`} monto={R.ppmReajustado - R.ppmBase} tono="text-acento" />}
          <Ln lbl="Total PPM reajustados" monto={R.ppmReajustado} fuerte tono="text-acento" />
          {!transparente && (R.aPagar > 0 ? <Ln c="91" lbl="IMPUESTO ADEUDADO · A PAGAR" monto={R.aPagar} fuerte fondo="bg-peligro/10" tono="text-peligro" />
            : <Ln c="87" lbl="REMANENTE · DEVOLUCIÓN SOLICITADA" monto={R.devolucion} fuerte fondo="bg-acento/10" tono="text-acento" />)}
        </tbody>
      </table></div>
      <p className="text-xs text-tenue">ℹ️ Los códigos son de referencia según las instrucciones del F22 del año tributario {at}. Verifica siempre contra el formulario vigente en sii.cl antes de presentar: el SII renumera líneas cada año. El cálculo sí usa los datos contables reales del ejercicio {R.anio}.</p>
      <div className="no-print flex flex-wrap gap-2">
        <button type="button" className="boton-sec" onClick={exportar}>📊 Exportar a Excel</button>
        <button type="button" className="boton-sec" onClick={() => window.print()}>🖨️ Imprimir</button>
        <a className="boton-sec" href="https://www.sii.cl/servicios_online/1044-.html" target="_blank" rel="noopener noreferrer">🔗 Declarar en sii.cl</a>
      </div>
    </section>
  );
}

function ListaManual({ items, escribe, onCambio }: { items: LineaManual[]; escribe: boolean; onCambio: (v: LineaManual[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.length ? items.map((x, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <input className="campo min-w-48 flex-1" defaultValue={x.lbl} placeholder="Concepto" disabled={!escribe} onBlur={(e) => e.target.value !== x.lbl && onCambio(items.map((y, j) => (j === i ? { ...y, lbl: e.target.value } : y)))} />
          <CampoNumero className="campo w-36" valor={+x.monto || 0} disabled={!escribe} onCambio={(v) => onCambio(items.map((y, j) => (j === i ? { ...y, monto: v ?? 0 } : y)))} />
          {escribe && <button type="button" className="boton-sec" onClick={() => onCambio(items.filter((_, j) => j !== i))} aria-label="Quitar línea">🗑</button>}
        </div>
      )) : <p className="text-xs text-tenue">Sin líneas manuales.</p>}
      {escribe && <button type="button" className="boton-sec" onClick={() => onCambio([...items, { lbl: '', monto: 0 }])}>+ Agregar línea</button>}
    </div>
  );
}

function BloqueAjustes({ R, M, datos, escribe, cambiar, toggleCuenta, abiertas, abrir, marcadas, toggleLinea }: {
  R: ResultadoRenta; M: Saldos; datos: DatosRenta; escribe: boolean; cambiar: (c: Partial<DatosRenta>) => void; toggleCuenta: (cd: string) => void;
  abiertas: Record<string, LineaGasto[] | 'cargando' | string>; abrir: (cd: string) => void; marcadas: Set<number>; toggleLinea: (l: LineaGasto) => void;
}) {
  const gastos = cuentasGasto(M, datos.rechazadas);
  const sugeridas = gastos.filter((g) => g.sugerido && !g.marcada).length;
  const c = datos.creditos;
  const credito = (k: keyof DatosRenta['creditos'], lbl: string, cod: string) => (
    <div className="w-56"><label className="etiqueta" htmlFor={`cr-${k}`}>{lbl} {cod && <span className="num text-acento">{cod}</span>}</label>
      <CampoNumero id={`cr-${k}`} valor={+c[k] || 0} disabled={!escribe} onCambio={(v) => cambiar({ creditos: { ...c, [k]: v ?? 0 } })} /></div>
  );
  return (
    <div className="space-y-4">
      <section className="tarjeta space-y-2 p-4 text-sm">
        <h2 className="font-semibold">Gastos rechazados (Art. 21 / Art. 31 LIR)</h2>
        <p className="text-xs text-tenue">Marca la cuenta completa si todo su saldo es no deducible, o ábrela (▸) para marcar movimientos sueltos.{sugeridas > 0 && <span className="text-aviso"> Hay {sugeridas} cuenta(s) con indicios de no ser deducibles.</span>}</p>
        <div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[460px] text-xs">
          <thead className="sticky top-0 bg-panel text-left text-tenue"><tr className="border-b border-borde"><th className="w-7" /><th className="w-7" /><th className="w-16">Código</th><th>Cuenta</th><th className="text-right">Saldo {R.anio}</th></tr></thead>
          <tbody>{gastos.length ? gastos.map((g) => {
            const ab = abiertas[g.cd];
            return (
              <Fragment key={g.cd}>
                <tr className="border-b border-borde/30">
                  <td className="text-center"><input type="checkbox" aria-label={`Rechazar cuenta ${g.cd}`} checked={g.marcada} disabled={!escribe} onChange={() => toggleCuenta(g.cd)} /></td>
                  <td><button type="button" className="text-tenue hover:text-texto" onClick={() => abrir(g.cd)} aria-label="Ver movimientos">{ab ? '▾' : '▸'}</button></td>
                  <td className="num text-tenue">{g.cd}</td>
                  <td className="py-1">{g.nm}{g.sugerido && <div className="text-[10px] text-aviso">⚠ {g.sugerido}</div>}</td>
                  <td className="num text-right">{clp(g.monto)}</td>
                </tr>
                {ab && <tr><td colSpan={5} className="bg-panel-2/50 px-8 py-1">
                  {ab === 'cargando' ? <span className="text-tenue">Cargando movimientos…</span> : typeof ab === 'string' ? <span className="text-peligro">{ab}</span> : !ab.length ? <span className="text-tenue">Sin movimientos.</span> : (
                    <table className="w-full"><tbody>{ab.map((l) => (
                      <tr key={l.id} className="border-b border-borde/20">
                        <td className="w-6"><input type="checkbox" aria-label={`Rechazar movimiento del asiento ${l.numero}`} checked={g.marcada || marcadas.has(l.id)} disabled={!escribe || g.marcada} onChange={() => toggleLinea(l)} /></td>
                        <td className="num w-20 text-tenue">{fechaCL(l.fecha)}</td><td className="num w-14 text-tenue">N° {l.numero}</td>
                        <td>{l.glosa_linea || l.glosa}</td><td className="num text-right">{firmado(l.debe - l.haber)}</td>
                      </tr>))}</tbody></table>
                  )}
                </td></tr>}
              </Fragment>
            );
          }) : <tr><td colSpan={5} className="py-2 text-tenue">No hay cuentas de gasto con saldo en el ejercicio.</td></tr>}</tbody>
        </table></div>
        {datos.lineasRechazadas.length > 0 && <p className="text-xs text-tenue">{datos.lineasRechazadas.length} movimiento(s) marcados uno a uno.</p>}
      </section>

      <section className="tarjeta grid gap-4 p-4 text-sm md:grid-cols-2">
        <div><h3 className="mb-2 text-xs font-semibold text-aviso">AGREGADOS (+)</h3><ListaManual items={datos.agregados} escribe={escribe} onCambio={(v) => cambiar({ agregados: v })} /></div>
        <div><h3 className="mb-2 text-xs font-semibold text-acento">DEDUCCIONES (−)</h3><ListaManual items={datos.deducciones} escribe={escribe} onCambio={(v) => cambiar({ deducciones: v })} /></div>
      </section>

      <section className="tarjeta p-4 text-sm">
        <h2 className="mb-2 font-semibold">Créditos contra el impuesto</h2>
        <div className="flex flex-wrap gap-3">{credito('af33bis', 'Activo fijo (Art. 33 bis)', '366')}{credito('sence', 'Capacitación SENCE', '82')}{credito('donaciones', 'Donaciones', '895')}{credito('otros', 'Otros créditos', '')}</div>
      </section>

      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Pérdidas de arrastre y PPM</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56"><label className="etiqueta" htmlFor="pa">Pérdida tributaria de ejercicios anteriores</label><CampoNumero id="pa" valor={+datos.perdidaArrastre || 0} disabled={!escribe} onCambio={(v) => cambiar({ perdidaArrastre: Math.max(0, v ?? 0) })} /></div>
          <div className="w-56"><label className="etiqueta" htmlFor="ppm">PPM del ejercicio (F29: {clp(R.ppmF29)})</label><CampoNumero id="ppm" valor={datos.ppmManual != null ? +datos.ppmManual : R.ppmF29} disabled={!escribe} onCambio={(v) => cambiar({ ppmManual: v })} /></div>
          <div className="w-40"><label className="etiqueta" htmlFor="rj">Reajuste PPM al 31/dic (%)</label><CampoNumero id="rj" valor={+datos.reajustePPM || 0} decimales disabled={!escribe} onCambio={(v) => cambiar({ reajustePPM: v ?? 0 })} /></div>
          {escribe && <button type="button" className="boton-sec" onClick={() => cambiar({ ppmManual: null })}>↺ Usar PPM del F29</button>}
        </div>
        <div><label className="etiqueta" htmlFor="notas">Notas de la declaración</label>
          <textarea id="notas" rows={3} className="campo" defaultValue={datos.notas} disabled={!escribe} placeholder="Observaciones, respaldo de los ajustes, criterios aplicados…" onBlur={(e) => e.target.value !== datos.notas && cambiar({ notas: e.target.value })} /></div>
      </section>
    </div>
  );
}
