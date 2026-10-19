'use client';

import { useState, useTransition } from 'react';
import type { PlanCuentas } from '@/motor/plan-cuentas';
import { dteC, dteV } from '@/motor/dte';
import type { TipoRCV } from '@/rcv/leer';
import { lineasIniciales, validarDetalleRCV, type LineaDetalle } from '@/rcv/detalle';
import type { Asignacion } from '@/rcv/documento';
import { EditorLineas, type CentroOpcion } from '@/components/editor-lineas';
import { clp, fechaCL, MESES } from '@/lib/formato';
import { importarDocumento, type FichaAuxiliar } from './acciones';
import type { Fila } from './importador';

/** Con varias líneas el validador exige descripción: se proponen según el tipo de línea. */
function conDescripciones(tipo: TipoRCV, ls: LineaDetalle[]): LineaDetalle[] {
  if (ls.length < 2) return ls;
  const base = tipo === 'compra' ? 'Compra' : 'Venta';
  return ls.map((l) => (l.desc?.trim() ? l : { ...l, desc: l.otroImp ? 'Otros impuestos' : l.afecto === false ? `${base} exenta` : `${base} afecta` }));
}

export function PanelDocumento({ empresaId, tipo, periodo, plan, centros, fila, ficha, ultima, editando, onImportar, onCancelar, onGuardarBorrador, onRegistrado }: {
  empresaId: string; tipo: TipoRCV; periodo: string; plan: PlanCuentas; centros: CentroOpcion[];
  fila: Fila; ficha: FichaAuxiliar | null; ultima: { cuenta: string; cc: string } | null; editando: boolean;
  onImportar: () => void; onCancelar: () => void;
  onGuardarBorrador: (cambios: Partial<Fila>) => void;
  onRegistrado: (r: { ok: boolean; numero?: number; error?: string; ficha?: FichaAuxiliar }) => void;
}) {
  const d = fila.doc;
  const aux = tipo === 'compra' ? 'proveedor' : 'cliente';
  const dte = (tipo === 'compra' ? dteC(d.tipoDTE) : dteV(d.tipoDTE))?.nm ?? `DTE ${d.tipoDTE}`;
  const rut = `${d.rutCodigo}-${d.rutDV}`;
  const [lineas, setLineasBase] = useState<LineaDetalle[]>(() => fila.detalle?.lineas ?? conDescripciones(tipo, lineasIniciales(tipo, { ...d, cuenta: fila.cuenta, cc: fila.cc })));
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
  const [glosa, setGlosa] = useState(fila.detalle?.glosa ?? '');
  // Diferencia de $1 por redondeo del emisor: se acepta sola (como la cuenta única de antes) mientras no se cambie a mano
  const [redondeoManual, setRedondeo] = useState<boolean | null>(fila.detalle?.aceptaRedondeo ?? null);
  const redondeo = redondeoManual
    ?? validarDetalleRCV(tipo, d, lineas, plan, { aceptaRedondeo: true }).errores.length < validarDetalleRCV(tipo, d, lineas, plan).errores.length;
  const [vence, setVence] = useState(fila.vence);
  const [formaPago, setFormaPago] = useState(fila.formaPago);
  const [crearFicha, setCrearFicha] = useState(true);
  const [actualizarFicha, setActualizarFicha] = useState(!!ficha && !ficha.cuenta);
  const [razon, setRazon] = useState(ficha?.razonSocial ?? d.razonSocial);
  const [msg, setMsg] = useState<{ error?: string; aviso?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const registrado = fila.resultado?.ok || fila.duplicado;
  const fueraPeriodo = tipo === 'compra' ? d.fecha.slice(0, 7) > periodo : d.fecha.slice(0, 7) !== periodo;
  const perTxt = periodo ? `${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}` : '';
  const v = validarDetalleRCV(tipo, d, lineas, plan, { aceptaRedondeo: redondeo });
  const ccValido = lineas.every((l) => !l.cc || !plan.regla(l.cuenta)?.aceptaCentroCosto || centros.some((c) => c.codigo === l.cc));
  const primera = lineas.find((l) => !l.otroImp);
  const nombreCC = (cc?: string) => (cc ? centros.find((c) => c.codigo === cc)?.nombre ?? cc : 'sin centro de costo');
  const cuentaTxt = (cd?: string) => (cd ? `${cd} ${plan.nombre(cd) ?? ''}`.trim() : 'sin cuenta');
  const difiereDeFicha = !!ficha && !!primera && (primera.cuenta !== ficha.cuenta || (primera.cc ?? '') !== (ficha.cc ?? ''));

  function contabilizar() {
    setMsg({});
    if (!v.ok) return setMsg({ error: v.errores[0] });
    if (!ccValido) return setMsg({ error: 'Hay un centro de costo que no existe: elige otro.' });
    const asignacion: Asignacion = {
      detalle: { lineas: lineas.map((l) => ({ ...l, desc: (l.desc ?? '').trim() })), glosa: glosa.trim(), aceptaRedondeo: redondeo },
      fechaVencimiento: vence, ...(tipo === 'venta' ? { formaPago } : {}),
    };
    iniciar(async () => {
      try {
        const r = await importarDocumento(empresaId, tipo, periodo, { doc: d, asignacion },
          { crear: !ficha && crearFicha, actualizar: !!ficha && actualizarFicha && (difiereDeFicha || !ficha.cuenta), razonSocial: razon });
        if (!r.ok) { setMsg({ error: r.error ?? 'No se pudo contabilizar' }); onGuardarBorrador({ detalle: asignacion.detalle as Fila['detalle'], vence, formaPago, resultado: r }); return; }
        onGuardarBorrador({ detalle: asignacion.detalle as Fila['detalle'], vence, formaPago });
        if ('avisoFicha' in r && r.avisoFicha) window.alert(r.avisoFicha);
        onRegistrado({ ok: true, numero: r.numero, ficha: 'ficha' in r ? r.ficha : undefined });
      } catch (e) {
        setMsg({ error: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  const cabecera = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-xs text-tenue uppercase">{dte}</div>
        <h2 className="text-lg font-semibold">N° {d.numero} · {d.razonSocial}</h2>
        <div className="text-sm text-tenue"><span className="num">{rut}</span> · emitido {fechaCL(d.fecha)}{tipo === 'compra' && d.fecha.slice(0, 7) < periodo ? ` · se contabiliza el 1 de ${perTxt}` : ''}</div>
      </div>
      {fila.resultado?.ok && <span className="rounded bg-acento/15 px-2 py-1 text-sm text-acento">✓ Contabilizado N° {fila.resultado.numero}</span>}
      {fila.duplicado && <span className="rounded bg-panel-2 px-2 py-1 text-sm text-tenue">Ya registrado en el libro</span>}
    </div>
  );
  const montos = (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
      {([['Exento', d.exento], ['Neto', d.neto], ['IVA', d.iva], ['Otros imp.', d.otrosImpuestos], ['Total', d.total]] as const).map(([t, m]) => (
        <div key={t} className="rounded-md bg-panel-2 px-3 py-2"><div className="text-tenue uppercase">{t}</div><div className="num font-semibold">{clp(m)}</div></div>
      ))}
    </div>
  );
  const registroSII = d.registroSII?.length ? (
    <details className="text-xs">
      <summary className="cursor-pointer text-tenue hover:text-texto">Registro completo del SII ({Object.keys(d.registroSII[0]).length} columnas{d.registroSII.length > 1 ? ` · ${d.registroSII.length - 1} filas de otros impuestos` : ''})</summary>
      <div className="mt-2 overflow-x-auto rounded-md border border-borde">
        <table className="w-full text-[11px]">
          <tbody>
            {Object.keys(d.registroSII[0]).map((k) => (
              <tr key={k} className="border-b border-borde/40">
                <td className="w-56 px-2 py-0.5 text-tenue">{k}</td>
                {d.registroSII!.map((f, j) => <td key={j} className="num px-2 py-0.5">{f[k] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  ) : null;

  if (!editando || registrado) {
    return (
      <div className="tarjeta space-y-4 p-5">
        {cabecera}
        {montos}
        <p className="text-sm">
          {ficha ? <>📇 Ficha del {aux}: <b>{cuentaTxt(ficha.cuenta)}</b> · {nombreCC(ficha.cc)}</>
            : <><span className="text-info">★ {aux === 'proveedor' ? 'Proveedor' : 'Cliente'} nuevo</span>: sin ficha. Al importar puedes crearla{ultima?.cuenta ? <> (último uso: {cuentaTxt(ultima.cuenta)})</> : ''}.</>}
        </p>
        {fila.resultado && !fila.resultado.ok && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{fila.resultado.error}</p>}
        {fueraPeriodo && !registrado && <p className="text-sm text-aviso">⚠ La fecha del documento no corresponde al período del libro ({perTxt}){tipo === 'compra' ? ': es posterior' : ''}. Cambia el período arriba para importarlo.</p>}
        {!registrado && <button type="button" className="boton" disabled={fueraPeriodo} onClick={onImportar}>Importar →</button>}
        {registroSII}
      </div>
    );
  }

  return (
    <div className="tarjeta space-y-4 p-5">
      {cabecera}
      {montos}
      <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <div><label className="etiqueta" htmlFor="glosa-doc">Glosa del asiento</label>
          <input id="glosa-doc" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" placeholder={`${dte} N°${d.numero} — ${d.razonSocial}`} autoFocus /></div>
        <div><label className="etiqueta" htmlFor="vence">Vencimiento</label>
          <input id="vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="campo" /></div>
      </div>
      {tipo === 'venta' && (
        <div className="w-64"><label className="etiqueta" htmlFor="fpago">Forma de cobro</label>
          <select id="fpago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as Fila['formaPago'])} className="campo">
            <option value="clientes">Por cobrar (clientes)</option><option value="banco">Pagada (banco)</option><option value="deudores">Deudores varios</option>
          </select></div>
      )}

      <EditorLineas tipo={tipo} doc={d} lineas={lineas} onChange={setLineas} plan={plan} centros={centros} listaId="cuentas-rcv" validacion={v} />
      <label className="flex items-center gap-2 text-xs text-tenue">
        <input type="checkbox" checked={redondeo} onChange={(e) => setRedondeo(e.target.checked)} /> Aceptar diferencia de $1 (redondeo del emisor)
      </label>

      <div className="space-y-2 rounded-md border border-borde bg-panel-2 p-3 text-sm">
        {!ficha ? (
          <>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={crearFicha} onChange={(e) => setCrearFicha(e.target.checked)} />
              <span><b className="text-info">★ {aux === 'proveedor' ? 'Proveedor' : 'Cliente'} nuevo.</b> Crear su ficha al contabilizar, con <b>{cuentaTxt(primera?.cuenta)}</b> y <b>{nombreCC(primera?.cc)}</b> como valores por defecto para sus próximos documentos.</span>
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

      {msg.error && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{msg.error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
        <button type="button" className="boton" disabled={pendiente || !v.ok || !ccValido || fueraPeriodo} onClick={contabilizar}>
          {pendiente ? 'Contabilizando…' : `Contabilizar y pasar al libro de ${tipo === 'compra' ? 'compras' : 'ventas'}`}
        </button>
        <button type="button" className="boton-sec" disabled={pendiente} onClick={() => { onGuardarBorrador({ detalle: { lineas, glosa, aceptaRedondeo: redondeo }, vence, formaPago }); onCancelar(); }}>Cancelar</button>
        <span className="text-xs text-tenue">Nada se registra hasta contabilizar.</span>
      </div>
      {registroSII}
    </div>
  );
}
