'use client';

import { useState, useTransition } from 'react';
import type { CuentaBase, PlanCuentas } from '@/motor/plan-cuentas';
import { dteC, dteV } from '@/motor/dte';
import type { TipoRCV } from '@/rcv/leer';
import { completarLinea, lineasIniciales, tipoLinea, validarDetalleRCV, type LineaDetalle } from '@/rcv/detalle';
import { asientoProvisional, type Asignacion } from '@/rcv/documento';
import { SelectorCC, type CentroOpcion } from '@/components/editor-lineas';
import { MESES } from '@/lib/formato';
import { importarDocumento, type FichaAuxiliar } from './acciones';
import type { Fila } from './importador';

/** $ 1.234.567 (como el sistema actual) */
export const pesos = (n: number) => `$ ${Math.round(n || 0).toLocaleString('es-CL')}`;
const miles = (n: number) => (n ? Math.round(n).toLocaleString('es-CL') : '');

/** Sólo las líneas de otros impuestos reciben descripción automática; la del gasto o activo la escribe quien importa. */
function conDescripciones(ls: LineaDetalle[]): LineaDetalle[] {
  return ls.map((l) => (l.otroImp && !l.desc?.trim() ? { ...l, desc: 'Otros impuestos' } : l));
}

/** Etiqueta de la columna Tipo para las filas automáticas del asiento */
function tipoAutomatica(cuenta: string, plan: PlanCuentas): string {
  const fijas: Record<string, string> = {
    '1108002': 'IVA crédito', '1108008': 'IVA crédito activo fijo', '2103003': 'IVA débito', '2103005': 'IVA retenido',
    '2103002': 'Retención', '1108006': 'Otro imp. recuperable',
  };
  if (fijas[cuenta]) return fijas[cuenta];
  const aux = plan.regla(cuenta)?.tipoAuxiliar;
  if (aux === 'proveedor') return 'Proveedor';
  if (aux === 'cliente') return 'Cliente';
  if (aux) return aux.charAt(0).toUpperCase() + aux.slice(1);
  if (cuenta.startsWith('1101')) return 'Banco';
  return 'Automática';
}

/** Editor del paso 2 (igual al sistema actual): datos del documento, glosa, asiento editable y control contra el RCV. */
export function EditorDocumento({ empresaId, tipo, periodo, plan, cuentas, centros, fila, ficha, ultima, onCancelar, onGuardarBorrador, onRegistrado }: {
  empresaId: string; tipo: TipoRCV; periodo: string; plan: PlanCuentas; cuentas: CuentaBase[]; centros: CentroOpcion[];
  fila: Fila; ficha: FichaAuxiliar | null; ultima: { cuenta: string; cc: string } | null;
  onCancelar: () => void;
  onGuardarBorrador: (cambios: Partial<Fila>) => void;
  onRegistrado: (r: { ok: boolean; numero?: number; error?: string; ficha?: FichaAuxiliar }) => void;
}) {
  const d = fila.doc;
  const aux = tipo === 'compra' ? 'proveedor' : 'cliente';
  const dteNombre = (tipo === 'compra' ? dteC(d.tipoDTE) : dteV(d.tipoDTE))?.nm ?? `DTE ${d.tipoDTE}`;
  const rut = `${d.rutCodigo}-${d.rutDV}`;
  const [lineas, setLineasBase] = useState<LineaDetalle[]>(() => fila.detalle?.lineas ?? conDescripciones(lineasIniciales(tipo, { ...d, cuenta: fila.cuenta, cc: fila.cc })));
  /** Al elegir la cuenta o el centro en una línea, se copian a las líneas que aún no lo tienen */
  const setLineas = (nuevas: LineaDetalle[]) => {
    const cambio = nuevas.findIndex((l, i) => lineas[i] && (l.cuenta !== lineas[i].cuenta || (l.cc ?? '') !== (lineas[i].cc ?? '')));
    if (cambio < 0 || nuevas.length !== lineas.length) return setLineasBase(nuevas);
    const ref = nuevas[cambio];
    const cuentaCambio = ref.cuenta !== lineas[cambio].cuenta;
    setLineasBase(nuevas.map((l, i) => {
      if (i === cambio) return l;
      if (cuentaCambio && !l.cuenta && ref.cuenta) return { ...l, cuenta: ref.cuenta, cc: l.cc || ref.cc };
      if (!cuentaCambio && !l.cc && ref.cc && l.cuenta === ref.cuenta) return { ...l, cc: ref.cc };
      return l;
    }));
  };
  const set = (i: number, cambios: Partial<LineaDetalle>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  const [glosa, setGlosa] = useState(fila.detalle?.glosa ?? '');
  // Diferencia de $1 por redondeo del emisor: se acepta sola mientras no se cambie a mano
  const [redondeoManual, setRedondeo] = useState<boolean | null>(fila.detalle?.aceptaRedondeo ?? null);
  const redondeo = redondeoManual
    ?? validarDetalleRCV(tipo, d, lineas, plan, { aceptaRedondeo: true }).errores.length < validarDetalleRCV(tipo, d, lineas, plan).errores.length;
  const [vence, setVence] = useState(fila.vence);
  const [formaPago, setFormaPago] = useState(fila.formaPago);
  const [crearFicha, setCrearFicha] = useState(true);
  const [actualizarFicha, setActualizarFicha] = useState(!!ficha && !ficha.cuenta);
  const [razon, setRazon] = useState(ficha?.razonSocial ?? d.razonSocial);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();

  // ── Validación (la del sistema actual + detalle obligatorio en gasto/ingreso/activo) ──
  const vRCV = validarDetalleRCV(tipo, d, lineas, plan, { aceptaRedondeo: redondeo });
  const queEs = tipo === 'compra' ? 'el gasto o la compra' : 'el ingreso';
  const faltaDetalle = lineas.filter((l) => !l.otroImp).length === 1
    ? lineas.flatMap((l, i) => (!l.otroImp && !(l.desc ?? '').trim() ? [`Línea ${i + 1}: escribe en Descripción a qué corresponde ${queEs}.`] : []))
    : [];
  const ccValido = lineas.every((l) => !l.cc || !plan.regla(l.cuenta)?.aceptaCentroCosto || centros.some((c) => c.codigo === l.cc));
  const errores = [...faltaDetalle, ...vRCV.errores, ...(ccValido ? [] : ['Hay un centro de costo que no existe: elige otro.'])];
  const fueraPeriodo = tipo === 'compra' ? d.fecha.slice(0, 7) > periodo : d.fecha.slice(0, 7) !== periodo;
  if (fueraPeriodo) errores.unshift(`La fecha del documento no corresponde al período ${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}.`);
  const cuadrado = errores.length === 0;
  const r = vRCV.resumen as Record<string, number>;

  // ── Asiento: filas del paso 2 (editables) y filas automáticas (IVA, proveedor/cliente, retenciones) ──
  const asignacion: Asignacion = {
    detalle: { lineas: lineas.map((l) => ({ ...l, desc: (l.desc ?? '').trim() })), glosa: glosa.trim(), aceptaRedondeo: redondeo },
    fechaVencimiento: vence, ...(tipo === 'venta' ? { formaPago } : {}),
  };
  const prov = asientoProvisional(tipo, d, periodo, asignacion, plan);
  const automaticas = prov.filter((l) => l.origen === null);
  const lado = (i: number): 'debe' | 'haber' => {
    const p = prov.find((x) => x.origen === i);
    if (p) return p.haber > 0 && !p.debe ? 'haber' : 'debe';
    const signo = (tipo === 'compra' ? dteC(d.tipoDTE) : dteV(d.tipoDTE))?.signo ?? 1;
    return (tipo === 'compra') === (signo > 0) ? 'debe' : 'haber';
  };
  const totDebe = prov.reduce((s, l) => s + l.debe, 0);
  const totHaber = prov.reduce((s, l) => s + l.haber, 0);

  const primera = lineas.find((l) => !l.otroImp);
  const nombreCC = (cc?: string) => (cc ? centros.find((c) => c.codigo === cc)?.nombre ?? cc : 'sin centro de costo');
  const cuentaTxt = (cd?: string) => (cd ? `${cd} – ${plan.nombre(cd) ?? ''}`.trim() : 'sin cuenta');
  const difiereDeFicha = !!ficha && !!primera && (primera.cuenta !== ficha.cuenta || (primera.cc ?? '') !== (ficha.cc ?? ''));

  function contabilizar() {
    setError('');
    if (!cuadrado) return setError(errores[0]);
    iniciar(async () => {
      try {
        const res = await importarDocumento(empresaId, tipo, periodo, { doc: d, asignacion },
          { crear: !ficha && crearFicha, actualizar: !!ficha && actualizarFicha && (difiereDeFicha || !ficha.cuenta), razonSocial: razon });
        onGuardarBorrador({ detalle: asignacion.detalle as Fila['detalle'], vence, formaPago, ...(res.ok ? {} : { resultado: res }) });
        if (!res.ok) return setError(res.error ?? 'No se pudo contabilizar');
        if ('avisoFicha' in res && res.avisoFicha) window.alert(res.avisoFicha);
        onRegistrado({ ok: true, numero: res.numero, ficha: 'ficha' in res ? res.ficha : undefined });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }
  const cancelar = () => { onGuardarBorrador({ detalle: { lineas, glosa, aceptaRedondeo: redondeo }, vence, formaPago }); onCancelar(); };

  const dato = (t: string, v: React.ReactNode, cls = '') => (
    <div className={cls}><div className="text-[10px] font-semibold tracking-wide text-tenue uppercase">{t}</div><div className="text-sm font-medium">{v}</div></div>
  );
  const monto = (t: string, v: number) => (
    <div><div className="text-[10px] font-semibold tracking-wide text-tenue uppercase">{t}</div><div className="num text-right text-sm font-semibold">{pesos(v)}</div></div>
  );
  const ctrl: [string, number, number][] = [
    [`Neto (líneas afectas)`, r.sumAfecto, r.neto],
    [`Exento (líneas exentas)`, r.sumExento, r.exento],
    [`IVA (línea del asiento)`, r.ivaCalc, r.iva],
    ...(tipo === 'compra' ? [[`Otros impuestos (líneas)`, r.sumOtros, r.otros] as [string, number, number]] : []),
    [`Total`, r.totalCalc, r.total],
  ];

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">📝 {d.razonSocial} · <span className="num">{d.tipoDTE}-{d.numero}</span></h2>
        <button type="button" onClick={cancelar} className="boton-sec px-2.5 py-1" aria-label="Cerrar edición">✕</button>
      </div>

      {/* Datos del documento */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-borde bg-panel-2 p-4 sm:grid-cols-5">
        {dato('Tipo de documento', `${d.tipoDTE} · ${dteNombre}`)}
        {dato('Folio', <span className="num">{d.numero}</span>)}
        {dato('Fecha emisión', <span className="num">{d.fecha}</span>)}
        <div><div className="text-[10px] font-semibold tracking-wide text-tenue uppercase">Fecha vencimiento</div>
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="campo num py-1 text-xs" aria-label="Fecha de vencimiento" /></div>
        {dato(`RUT ${aux}`, <span className="num">{rut.replace(/^(\d{1,3})(\d{3})(\d{3})-/, '$1.$2.$3-')}</span>)}
        {dato('Auxiliar', d.razonSocial)}
        {monto('Exento', d.exento)}
        {monto('Neto', d.neto)}
        {monto('IVA', d.iva)}
        {tipo === 'compra' ? monto('Otros impuestos', d.otrosImpuestos) : <div />}
        <div><div className="text-[10px] font-semibold tracking-wide text-tenue uppercase">Total</div><div className="num pl-6 text-sm font-bold text-info">{pesos(d.total)}</div></div>
        {tipo === 'compra' && d.fecha.slice(0, 7) < periodo && <div className="col-span-4 self-end text-xs text-tenue">Documento de un mes anterior: se contabiliza el 1 de {MESES[Number(periodo.slice(5, 7)) - 1]} {periodo.slice(0, 4)}.</div>}
      </div>

      <div>
        <label className="etiqueta" htmlFor="glosa-doc">Descripción general del documento (glosa)</label>
        <input id="glosa-doc" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" placeholder="Ej: Seguro flota camiones 2026" autoFocus />
      </div>
      {tipo === 'venta' && (
        <div className="w-64"><label className="etiqueta" htmlFor="fpago">Forma de cobro</label>
          <select id="fpago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as Fila['formaPago'])} className="campo">
            <option value="clientes">Por cobrar (clientes)</option><option value="banco">Pagada (banco)</option><option value="deudores">Deudores varios</option>
          </select></div>
      )}

      {/* Asiento editable */}
      <datalist id="cuentas-asiento">{cuentas.filter((c) => plan.regla(c.cd)?.aceptaMovimientos && plan.regla(c.cd)?.activa).map((c) => <option key={c.cd} value={`${c.cd} – ${c.nm}`} />)}</datalist>
      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full min-w-[1020px] table-fixed text-sm">
          <thead className="bg-panel-2 text-left text-[11px] font-semibold tracking-wide text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="w-8 px-2 py-2 text-center">#</th><th className="w-[250px] px-2 py-2">Cuenta</th><th className="px-2 py-2">Descripción</th>
              <th className="w-40 px-2 py-2">Centro de costo</th><th className="w-32 px-2 py-2">Tipo</th>
              <th className="w-28 px-2 py-2 text-right">Debe</th><th className="w-28 px-2 py-2 text-right">Haber</th><th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const regla = plan.regla(l.cuenta);
              const ld = lado(i);
              const input = (
                <input inputMode="numeric" maxLength={13} value={miles(l.monto)} onChange={(e) => set(i, { monto: Math.round(Number(e.target.value.replace(/[^0-9]/g, '').slice(0, 10)) || 0) })}
                  className="campo num w-full py-1 text-right" aria-label={`Monto línea ${i + 1}`} />
              );
              return (
                <tr key={i} className="border-b border-borde/50 align-top">
                  <td className="px-2 py-1.5 text-center text-tenue">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <input list="cuentas-asiento" value={regla ? `${l.cuenta} – ${plan.nombre(l.cuenta)}` : l.cuenta}
                      onChange={(e) => set(i, { cuenta: (e.target.value.match(/^\d+/) ?? [''])[0] || e.target.value })}
                      onFocus={(e) => e.target.select()} placeholder="Cuenta" className="campo num py-1" aria-label={`Cuenta línea ${i + 1}`} />
                    {l.cuenta && !regla && <div className="mt-0.5 text-[11px] text-aviso">⚠️ cuenta no encontrada</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={l.desc ?? ''} onChange={(e) => set(i, { desc: e.target.value })} placeholder={l.otroImp ? 'Descripción' : `¿A qué corresponde ${queEs}?`}
                      className={`campo py-1 ${!l.otroImp && !(l.desc ?? '').trim() ? 'border-aviso/60' : ''}`} aria-label={`Descripción línea ${i + 1}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <SelectorCC valor={l.cc ?? ''} onChange={(v) => set(i, { cc: v })} centros={centros}
                      deshabilitado={!!regla && !regla.aceptaCentroCosto && !l.cc} requerido={regla?.requiereCentroCosto} etiqueta={`Centro de costo línea ${i + 1}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={tipoLinea(l)} onChange={(e) => set(i, { afecto: e.target.value === 'afecto', otroImp: e.target.value === 'otro' || undefined })}
                      className="campo py-1 text-xs" aria-label={`Tipo línea ${i + 1}`}>
                      <option value="afecto">Afecto</option><option value="exento">Exento</option>
                      {tipo === 'compra' && <option value="otro">Otro impuesto</option>}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">{ld === 'debe' && input}</td>
                  <td className="px-2 py-1.5">{ld === 'haber' && input}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" title="Completar con lo que falta" className="boton-sec px-2 py-0.5 text-xs" onClick={() => set(i, { monto: completarLinea(tipo, d, lineas, i) })}>⇥</button>
                      {lineas.length > 1 && <button type="button" title="Quitar línea" className="rounded-md border border-peligro/40 px-2 py-0.5 text-xs text-peligro hover:bg-peligro/10" onClick={() => setLineasBase(lineas.filter((_, j) => j !== i))}>✕</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {automaticas.map((l, k) => (
              <tr key={`a${k}`} className="border-b border-borde/50 bg-info/5 text-tenue">
                <td className="px-2 py-1.5 text-center">·</td>
                <td className="truncate px-2 py-1.5" title={`${l.cuenta} – ${plan.nombre(l.cuenta)}`}><span className="num">{l.cuenta}</span> – {plan.nombre(l.cuenta)}</td>
                <td className="truncate px-2 py-1.5" title={l.glosa}>{l.glosa}</td>
                <td className="px-2 py-1.5">—</td>
                <td className="px-2 py-1.5">{tipoAutomatica(l.cuenta, plan)}</td>
                <td className="num px-2 py-1.5 text-right whitespace-nowrap text-texto">{l.debe ? miles(l.debe) : ''}</td>
                <td className="num px-2 py-1.5 text-right whitespace-nowrap text-texto">{l.haber ? miles(l.haber) : ''}</td>
                <td />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-panel-2 font-semibold">
              <td /><td colSpan={4} className="px-2 py-2">Totales del asiento</td>
              <td className="num px-2 py-2 text-right whitespace-nowrap text-info">{pesos(totDebe)}</td>
              <td className="num px-2 py-2 text-right whitespace-nowrap text-info">{pesos(totHaber)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="boton-sec" title="Repartir en otra cuenta o centro de costo"
          onClick={() => setLineasBase([...lineas, { cuenta: primera?.cuenta ?? '', desc: '', monto: 0, cc: '', afecto: primera?.afecto !== false }])}>+ Agregar línea</button>
        <label className="flex items-center gap-2 text-xs text-tenue">
          <input type="checkbox" checked={redondeo} onChange={(e) => setRedondeo(e.target.checked)} /> Aceptar diferencia de $1 por redondeo del emisor
        </label>
      </div>

      {/* Control contra el RCV */}
      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full text-xs">
          <thead className="bg-panel-2 text-[11px] font-semibold tracking-wide text-tenue uppercase">
            <tr className="border-b border-borde"><th className="px-3 py-1.5 text-left">Control</th><th className="px-3 py-1.5 text-right">Líneas</th><th className="px-3 py-1.5 text-right">RCV</th><th className="w-20 px-3 py-1.5 text-right">Dif.</th></tr>
          </thead>
          <tbody>
            {ctrl.map(([t, a, b]) => {
              const dif = Math.round(a - b);
              return (
                <tr key={t} className="border-b border-borde/40">
                  <td className="px-3 py-1">{t}</td><td className="num px-3 py-1 text-right">{pesos(a)}</td><td className="num px-3 py-1 text-right">{pesos(b)}</td>
                  <td className={`num px-3 py-1 text-right ${dif === 0 ? 'text-acento' : Math.abs(dif) <= 1 && redondeo ? 'text-aviso' : 'text-peligro'}`}>{dif === 0 ? '✓' : (dif > 0 ? '+' : '') + miles(dif)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cuadrado
        ? <p className="text-sm font-semibold text-acento">✅ Documento cuadrado: listo para contabilizar.</p>
        : <ul className="list-disc space-y-0.5 pl-5 text-xs text-peligro">{errores.map((e, k) => <li key={k}>{e}</li>)}</ul>}
      {vRCV.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-aviso">{vRCV.avisos.map((e, k) => <li key={k}>{e}</li>)}</ul>}

      {/* Ficha del auxiliar */}
      <div className="space-y-2 rounded-md border border-borde p-3 text-sm">
        {!ficha ? (
          <>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={crearFicha} onChange={(e) => setCrearFicha(e.target.checked)} />
              <span><b className="text-info">★ {aux === 'proveedor' ? 'Proveedor' : 'Cliente'} nuevo.</b> Crear su ficha al contabilizar, con <b>{cuentaTxt(primera?.cuenta)}</b> y <b>{nombreCC(primera?.cc)}</b> como valores por defecto para sus próximos documentos.{ultima?.cuenta ? <span className="text-tenue"> (Último uso: {cuentaTxt(ultima.cuenta)}.)</span> : null}</span>
            </label>
            {crearFicha && (
              <div className="grid gap-2 pl-6 sm:grid-cols-[1fr_160px]">
                <div><label className="etiqueta" htmlFor="razon">Razón social</label><input id="razon" value={razon} onChange={(e) => setRazon(e.target.value)} className="campo" /></div>
                <div><span className="etiqueta">RUT</span><div className="num py-2">{rut}</div></div>
              </div>
            )}
          </>
        ) : !ficha.cuenta ? (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={actualizarFicha} onChange={(e) => setActualizarFicha(e.target.checked)} />
            <span>📇 La ficha de {ficha.razonSocial} no tiene cuenta por defecto: completarla con <b>{cuentaTxt(primera?.cuenta)}</b> y <b>{nombreCC(primera?.cc)}</b>.</span>
          </label>
        ) : difiereDeFicha ? (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={actualizarFicha} onChange={(e) => setActualizarFicha(e.target.checked)} />
            <span>📇 Usaste una cuenta o centro distinto al de la ficha ({cuentaTxt(ficha.cuenta)} · {nombreCC(ficha.cc)}). Marcar para que <b>{cuentaTxt(primera?.cuenta)}</b> y <b>{nombreCC(primera?.cc)}</b> pasen a ser los valores por defecto.</span>
          </label>
        ) : (
          <p className="text-tenue">📇 Cuenta y centro de costo tomados de la ficha del {aux}.</p>
        )}
      </div>

      {error && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{error}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-borde pt-3">
        <button type="button" className="rounded-md border border-peligro/50 px-3 py-1 text-sm font-semibold text-peligro hover:bg-peligro/10" disabled={pendiente} onClick={cancelar}>Cancelar</button>
        <button type="button" className="boton" disabled={pendiente || !cuadrado} onClick={contabilizar}>{pendiente ? 'Contabilizando…' : '📒 Contabilizar documento'}</button>
      </div>
    </div>
  );
}
