'use client';

import { useEffect, useState } from 'react';
import { clp, milesInput, MESES } from '@/lib/formato';
import { rutParse } from '@/motor/rut';
import { dtesDe, totalesDoc, validarDocAux, ladoLinea, type DocAux, type TipoAux } from '@/asientos/documento-auxiliar';
import { documentosPendientes, verificarDocumento, buscarAuxiliares, type DocPendiente, type VerificacionDoc, type AuxiliarEncontrado } from '../acciones';


const NOMBRE: Record<TipoAux, string> = { proveedor: 'proveedor', cliente: 'cliente', honorario: 'prestador de honorarios' };
const entero = (v: string) => Math.round(Number(v.replace(/\./g, '')) || 0);

/**
 * Ventana para los datos del documento de una línea con auxiliar. "Documento nuevo" lo registra en el libro con los
 * mismos datos del RCV (o de la boleta de honorarios); "Ya registrado" sólo lo referencia (pagos, abonos, cruces).
 */
export function VentanaDocumento({ empresaId, tipo, inicial, montoLinea, ladoActual, fechaAsiento, otroNuevo, onAceptar, onCancelar }: {
  empresaId: string; tipo: TipoAux; inicial: DocAux; montoLinea: number; ladoActual: 'debe' | 'haber' | null; fechaAsiento: string;
  /** Otra línea ya registra un documento nuevo (sólo uno por asiento). */
  otroNuevo: boolean;
  onAceptar: (d: DocAux, ajustarMonto: number | null) => void; onCancelar: () => void;
}) {
  const [d, setD] = useState<DocAux>(otroNuevo && inicial.modo === 'nuevo' ? { ...inicial, modo: 'existente' } : inicial);
  const [pend, setPend] = useState<DocPendiente[] | null>(null);
  const [tocado, setTocado] = useState(false);
  const set = <K extends keyof DocAux>(k: K, v: DocAux[K]) => setD((x) => ({ ...x, [k]: v }));
  const t = totalesDoc(tipo, d);
  const errores = validarDocAux(tipo, d);
  const nuevo = d.modo === 'nuevo';
  const esperado = nuevo ? t.montoLinea : null;
  const lado = ladoLinea(tipo, d.tipoDTE);
  const rutOk = rutParse(d.rut).valido;

  // Documentos con saldo del RUT, para "Ya registrado"
  useEffect(() => {
    if (d.modo !== 'existente' || !rutOk) return;
    let vivo = true;
    documentosPendientes(empresaId, tipo, d.rut, fechaAsiento).then((r) => { if (vivo) setPend(r); }).catch(() => { if (vivo) setPend([]); });
    return () => { vivo = false; };
  }, [empresaId, tipo, d.rut, d.modo, rutOk, fechaAsiento]);

  // Validador de duplicados: un documento nuevo no puede estar ya en el libro (desde el RCV u otro registro manual)
  const [verif, setVerif] = useState<{ clave: string; v: VerificacionDoc } | null>(null);
  const clave = `${d.rut}|${d.tipoDTE}|${d.folio.trim()}`;
  useEffect(() => {
    if (!nuevo || !rutOk || !d.folio.trim()) return;
    let vivo = true;
    const t = setTimeout(() => {
      verificarDocumento(empresaId, tipo, d.rut, +d.tipoDTE, d.folio).then((v) => { if (vivo) setVerif({ clave, v }); })
        .catch(() => { if (vivo) setVerif({ clave, v: { registrado: null, enRCV: null } }); }); // la base igual rechaza un duplicado
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [empresaId, tipo, d.rut, d.tipoDTE, d.folio, nuevo, rutOk, clave]);
  const v = verif?.clave === clave ? verif.v : null;
  const duplicado = nuevo && !!v?.registrado;
  const verificando = nuevo && rutOk && !!d.folio.trim() && !v;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancelar]);

  const aceptar = (ajustar: boolean) => {
    setTocado(true);
    if (errores.length || duplicado || verificando) return;
    onAceptar(d, ajustar && esperado != null ? esperado : null);
  };
  // Función (no componente) para que el input no se vuelva a montar en cada tecla
  const num = (k: 'exento' | 'neto' | 'otros' | 'bruto', l: string) => (
    <div><label className="etiqueta" htmlFor={`dm-${k}`}>{l}</label>
      <input id={`dm-${k}`} inputMode="numeric" value={d[k] ? milesInput(d[k]) : ''} onChange={(e) => set(k, entero(e.target.value))} className="campo num text-right" /></div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-velo p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="dm-titulo">
      <div className="tarjeta w-full max-w-2xl space-y-4 p-5 text-sm shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="dm-titulo" className="text-base font-semibold">Documento del {NOMBRE[tipo]}</h2>
            <p className="text-xs text-tenue">Monto de la línea: <span className="num">{montoLinea ? `${clp(montoLinea)} al ${ladoActual}` : 'sin monto todavía'}</span></p>
          </div>
          <button type="button" aria-label="Cerrar" className="text-tenue hover:text-texto" onClick={onCancelar}>✕</button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" disabled={otroNuevo} className={nuevo ? 'boton py-1 text-xs' : 'boton-sec py-1 text-xs'} onClick={() => set('modo', 'nuevo')}
            title={otroNuevo ? 'Otra línea de este asiento ya registra un documento nuevo' : ''}>Documento nuevo · registrar en el libro</button>
          <button type="button" className={!nuevo ? 'boton py-1 text-xs' : 'boton-sec py-1 text-xs'} onClick={() => set('modo', 'existente')}>Ya registrado · pago, abono o cruce</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <BuscadorAuxiliar empresaId={empresaId} tipo={tipo} rut={d.rut} nombre={d.razon}
            onElegir={(rut, nombre) => setD((x) => ({ ...x, rut, razon: nombre || x.razon }))} onTexto={(t) => set('rut', t)} />
          {nuevo && <div><label className="etiqueta" htmlFor="dm-razon">{tipo === 'honorario' ? 'Nombre del prestador *' : 'Razón social *'}</label>
            <input id="dm-razon" value={d.razon} onChange={(e) => set('razon', e.target.value)} className="campo" /></div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div><label className="etiqueta" htmlFor="dm-tipo">Tipo de documento *</label>
            <select id="dm-tipo" value={d.tipoDTE} onChange={(e) => set('tipoDTE', +e.target.value)} className="campo">
              {dtesDe(tipo).map((x) => <option key={x.cod} value={x.cod}>{x.cod} · {x.nm}</option>)}
            </select></div>
          <div><label className="etiqueta" htmlFor="dm-folio">{tipo === 'honorario' ? 'N° boleta *' : 'Folio *'}</label>
            <input id="dm-folio" value={d.folio} onChange={(e) => set('folio', e.target.value.replace(/\s/g, ''))} className="campo num" /></div>
        </div>

        {!nuevo && (
          <div className="space-y-1">
            <div className="etiqueta">Documentos con saldo de este RUT</div>
            {!rutOk ? <p className="text-xs text-tenue">Ingresa el RUT para ver sus documentos pendientes.</p>
              : pend == null ? <p className="text-xs text-tenue">Buscando…</p>
              : !pend.length ? <p className="text-xs text-tenue">No tiene documentos con saldo a la fecha del asiento. Igual puedes escribir tipo y folio.</p>
              : <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {pend.map((p) => (
                    <button key={`${p.tipo_dte}-${p.folio}`} type="button" onClick={() => setD((x) => ({ ...x, tipoDTE: p.tipo_dte, folio: p.folio, razon: p.razon }))}
                      className={`rounded border px-2 py-1 text-left text-xs ${+d.tipoDTE === p.tipo_dte && d.folio === p.folio ? 'border-acento bg-acento/10' : 'border-borde hover:border-acento'}`}>
                      <span className="num">{p.tipo_dte} N°{p.folio}</span> · <span className="num">{clp(p.saldo)}</span>{p.fecha ? <span className="text-tenue"> · {p.fecha.split('-').reverse().join('/')}</span> : null}
                    </button>
                  ))}
                </div>}
          </div>
        )}

        {nuevo && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="etiqueta" htmlFor="dm-fecha">Fecha de emisión *</label>
                <input id="dm-fecha" type="date" value={d.fecha} onChange={(e) => set('fecha', e.target.value)} className="campo" /></div>
              {tipo !== 'honorario' && <div><label className="etiqueta" htmlFor="dm-vence">Vencimiento</label>
                <input id="dm-vence" type="date" value={d.vence} onChange={(e) => set('vence', e.target.value)} className="campo" title="Vacío: 30 días desde la emisión" /></div>}
              {tipo === 'proveedor' && <div><label className="etiqueta" htmlFor="dm-per">Período contable (IVA)</label>
                <input id="dm-per" type="month" value={d.periodo} onChange={(e) => set('periodo', e.target.value)} className="campo" /></div>}
            </div>
            {tipo === 'honorario' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {num("bruto", "Monto bruto *")}
                <div><div className="etiqueta">Retención {t.tasa ? `(${(t.tasa * 100).toLocaleString('es-CL')}%)` : ''}</div><div className="num py-2 text-right">{clp(t.retencion)}</div></div>
                <div><div className="etiqueta">Líquido a pagar</div><div className="num py-2 text-right font-semibold">{clp(t.liquido)}</div></div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-5">
                {num("exento", "Exento")}
                {num("neto", "Neto")}
                <div><label className="etiqueta" htmlFor="dm-iva">IVA{t.ivaRetenido ? ' (retenido)' : ''}</label>
                  <input id="dm-iva" inputMode="numeric" value={t.iva ? milesInput(t.iva) : ''} onChange={(e) => setD((x) => ({ ...x, iva: entero(e.target.value), ivaManual: true }))}
                    className={`campo num text-right ${d.ivaManual ? 'border-aviso' : ''}`} title={d.ivaManual ? 'IVA digitado a mano' : 'IVA 19% del neto (puedes cambiarlo)'} /></div>
                {num("otros", "Otros imp.")}
                <div><div className="etiqueta">Total</div><div className="num py-2 text-right font-semibold">{clp(t.total)}</div></div>
              </div>
            )}
          </>
        )}

        {nuevo && esperado != null && esperado > 0 && (montoLinea !== esperado || (ladoActual && ladoActual !== lado)) && (
          <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-aviso">
            La línea debería ir con {clp(esperado)} al {lado}{tipo === 'honorario' && t.retencion ? ' (líquido: la retención va en su propia línea, cuenta 2103002)' : ''}; hoy tiene {montoLinea ? `${clp(montoLinea)} al ${ladoActual}` : 'monto vacío'}.
          </p>
        )}
        {duplicado && v?.registrado && (
          <div role="alert" className="space-y-2 rounded-md border border-peligro/50 bg-peligro/10 px-3 py-2 text-xs text-peligro">
            <p>⛔ <b>Documento duplicado:</b> este {dtesDe(tipo).find((x) => x.cod === +d.tipoDTE)?.nm ?? 'documento'} N° {d.folio} ya está registrado en el libro
              por {v.registrado.origen}{v.registrado.numero ? `, asiento N° ${v.registrado.numero}` : ''}{v.registrado.fecha ? ` (${v.registrado.fecha.split('-').reverse().join('/')})` : ''}. No se puede registrar de nuevo.</p>
            <button type="button" className="boton-sec py-1 text-xs" onClick={() => set('modo', 'existente')}>Usarlo como documento ya registrado (pago, abono o cruce)</button>
          </div>
        )}
        {nuevo && !duplicado && v?.enRCV && (
          <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-info">ℹ️ Este documento está en el RCV de {MESES[+v.enRCV.slice(5, 7) - 1].toLowerCase()} {v.enRCV.slice(0, 4)} sin registrar. Si lo registras aquí, al importar ese RCV aparecerá como «En el libro» y no se duplicará.</p>
        )}
        {tocado && errores.length > 0 && <p className="text-xs text-peligro">⛔ {errores.join(' · ')}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="boton-sec" onClick={onCancelar}>Cancelar</button>
          {nuevo && esperado != null && esperado > 0 && (montoLinea !== esperado || (ladoActual && ladoActual !== lado)) && (
            <button type="button" className="boton-sec" disabled={duplicado || verificando} onClick={() => aceptar(true)}>Aceptar y dejar la línea en {clp(esperado)}</button>
          )}
          <button type="button" className="boton" disabled={duplicado || verificando} title={duplicado ? 'Documento ya registrado' : verificando ? 'Revisando si ya está registrado…' : ''} onClick={() => aceptar(false)}>{verificando ? 'Revisando…' : 'Aceptar'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Buscador dinámico de auxiliares por RUT o nombre. Al escribir muestra las fichas y los RUT ya usados en el libro;
 * flechas y Enter para elegir. Si lo escrito es un RUT válido que no aparece, se usa tal cual (auxiliar nuevo).
 */
function BuscadorAuxiliar({ empresaId, tipo, rut, nombre, onElegir, onTexto }: {
  empresaId: string; tipo: TipoAux; rut: string; nombre: string;
  onElegir: (rut: string, nombre: string) => void; onTexto: (t: string) => void;
}) {
  const [texto, setTexto] = useState(rut);
  const [res, setRes] = useState<AuxiliarEncontrado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [i, setI] = useState(0);
  const valido = rutParse(rut).valido;
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2 || !abierto) return;
    let vivo = true;
    const t = setTimeout(() => buscarAuxiliares(empresaId, tipo, q).then((r) => { if (vivo) { setRes(r); setI(0); } }).catch(() => {}), 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [texto, abierto, empresaId, tipo]);
  const elegir = (a: AuxiliarEncontrado) => { setTexto(a.rut); onElegir(a.rut, a.nombre); setAbierto(false); };
  const lista = abierto && texto.trim().length >= 2 ? res : [];
  return (
    <div className="relative">
      <label className="etiqueta" htmlFor="dm-rut">RUT o nombre *</label>
      <input id="dm-rut" autoFocus autoComplete="off" role="combobox" aria-expanded={lista.length > 0} aria-controls="dm-rut-lista"
        value={texto} placeholder="Escribe RUT o razón social"
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); onTexto(rutParse(e.target.value).valido ? e.target.value : ''); }}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!lista.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, lista.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); elegir(lista[i]); }
          else if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false); }
        }}
        className={`campo ${texto && !valido && !lista.length ? 'border-aviso' : ''}`} />
      {valido && <div className="mt-0.5 truncate text-[11px] text-acento">✓ {rut}{nombre ? ` · ${nombre}` : ''}</div>}
      {!valido && texto.trim().length >= 2 && !lista.length && <div className="mt-0.5 text-[11px] text-tenue">Sin coincidencias: escribe el RUT completo para un auxiliar nuevo.</div>}
      {lista.length > 0 && (
        <ul id="dm-rut-lista" role="listbox" className="absolute z-10 mt-1 max-h-64 w-[min(28rem,80vw)] overflow-y-auto rounded-md border border-borde bg-panel py-1 shadow-lg">
          {lista.map((a, j) => (
            <li key={a.rut} role="option" aria-selected={j === i}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(a)} onMouseEnter={() => setI(j)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${j === i ? 'bg-panel-2' : ''}`}>
                <span className="num w-24 shrink-0">{a.rut}</span>
                <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                {a.ficha && <span className="text-[10px] text-tenue">ficha</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
