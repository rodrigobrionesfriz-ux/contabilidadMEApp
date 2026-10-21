'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { guardarAsiento, guardarAsientoConDocumento } from '../acciones';
import { VentanaDocumento } from './documento-modal';
import { docVacio, esTipoDoc, totalesDoc, validarDocAux, dtesDe, rutBase, type DocAux, type TipoAux } from '@/asientos/documento-auxiliar';
import { clp, hoyISO, milesInput, ANCHO_MONTO } from '@/lib/formato';
import { rutParse } from '@/motor/rut';
import { Mensaje } from '@/components/form-estado';
import { lineasDesdeComprobante, pideMontoDist, type ComprobanteTipo } from '@/herramientas/comprobantes-tipo';
import { guardarPlantilla } from '../tipo/acciones';

export interface CuentaOpcion {
  codigo: string;
  nombre: string;
  tipo_auxiliar: string | null;
  acepta_centro_costo: boolean;
  requiere_centro_costo: boolean;
}

interface Linea { cuenta: string; debe: string; haber: string; cc: string; rut: string; glosa: string; doc?: DocAux }
const vacia = (): Linea => ({ cuenta: '', debe: '', haber: '', cc: '', rut: '', glosa: '' });
const monto = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) || 0);

export function FormAsiento({ empresaId, cuentas, centros, plantillas = [] }: {
  empresaId: string; cuentas: CuentaOpcion[]; centros: { codigo: string; nombre: string }[]; plantillas?: ComprobanteTipo[];
}) {
  const porCodigo = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c])), [cuentas]);
  const [fecha, setFecha] = useState(hoyISO());
  const [glosa, setGlosa] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([vacia(), vacia()]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [enviando, iniciar] = useTransition();
  // Ventana del documento (línea con cuenta de proveedor, cliente u honorarios)
  const [ventana, setVentana] = useState<number | null>(null);
  const tipoAux = (l: Linea): TipoAux | null => { const t = porCodigo.get(l.cuenta)?.tipo_auxiliar; return esTipoDoc(t) ? t : null; };
  // Si se cancela la ventana, no se vuelve a abrir sola hasta que cambie el monto de esa línea
  const cancelada = useRef(new Set<number>());
  const abrirSiFalta = (i: number) => {
    const l = lineas[i];
    if (tipoAux(l) && (monto(l.debe) || monto(l.haber)) && !l.doc && !cancelada.current.has(i)) setVentana(i);
  };

  const cambiar = (i: number, campo: keyof Linea, v: string) => {
    if (campo === 'debe' || campo === 'haber' || campo === 'cuenta') cancelada.current.delete(i);
    setLineas((ls) => ls.map((l, j) => {
      if (j !== i) return l;
      const n = { ...l, [campo]: campo === 'debe' || campo === 'haber' ? milesInput(v, 10).replace('-', '') : v };
      if (campo === 'cuenta') {
        n.cuenta = v.split(' ')[0]; // acepta "1101201 · Banco" desde la lista
        if (porCodigo.get(n.cuenta)?.tipo_auxiliar !== porCodigo.get(l.cuenta)?.tipo_auxiliar) n.doc = undefined;
      }
      if (campo === 'debe' && v) n.haber = '';
      if (campo === 'haber' && v) n.debe = '';
      return n;
    }));
  };

  const aplicarPlantilla = (id: string) => {
    const c = plantillas.find((x) => x.id === id);
    if (!c) return;
    let montoDist: number | null = null;
    if (pideMontoDist(c)) {
      const r = window.prompt(`«${c.nombre}» reparte el gasto entre ${c.dist.filter((d) => d.cd && d.pct > 0).length} cuentas.\n\nMonto total a distribuir (deja vacío para completarlo a mano):`, '');
      if (r === null) return;
      montoDist = r.trim() ? Math.round(Number(r.replace(/[^0-9-]/g, '')) || 0) : 0;
    }
    if (lineas.some((l) => l.cuenta || l.debe || l.haber) && !window.confirm(`¿Aplicar «${c.nombre}»? Se reemplazarán las líneas escritas.`)) return;
    const d = lineasDesdeComprobante(c, montoDist, (cd) => porCodigo.get(cd)?.nombre || '');
    setLineas(d.lineas.map((l) => ({ cuenta: l.cd, debe: l.debe ? milesInput(l.debe) : '', haber: l.haber ? milesInput(l.haber) : '', cc: porCodigo.get(l.cd)?.acepta_centro_costo ? l.cc : '', rut: '', glosa: l.desc })));
    if (d.glosa) setGlosa(d.glosa);
    setMsg({ ok: `Plantilla aplicada: ${c.nombre}${d.distribuido ? ` · gasto repartido en ${d.distribuido} cuentas` : ''}.` });
  };
  const guardarComoPlantilla = () => {
    const nombre = window.prompt('Nombre de la plantilla:', glosa);
    if (!nombre?.trim()) return;
    const conMontos = window.confirm('¿Guardar también los montos?\n\nAceptar: con montos · Cancelar: sólo cuentas, glosas y centros.');
    iniciar(async () => {
      const r = await guardarPlantilla(empresaId, null, { nombre, descripcion: '', glosa, guardaMontos: conMontos, distActiva: false, distBase: 0, dist: [],
        lineas: lineas.filter((l) => l.cuenta || l.glosa).map((l) => ({ cd: l.cuenta, desc: l.glosa, debe: monto(l.debe), haber: monto(l.haber), cc: l.cc })) });
      setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
    });
  };

  const totalD = lineas.reduce((s, l) => s + monto(l.debe), 0);
  const totalH = lineas.reduce((s, l) => s + monto(l.haber), 0);
  const cuadra = totalD > 0 && totalD === totalH;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    const usadas = lineas.filter((l) => l.cuenta || l.debe || l.haber);
    for (const [i, l] of usadas.entries()) {
      if (!porCodigo.has(l.cuenta)) return setMsg({ error: `Línea ${i + 1}: la cuenta ${l.cuenta || '(vacía)'} no existe o no es imputable` });
      if (l.rut && !rutParse(l.rut).valido) return setMsg({ error: `Línea ${i + 1}: RUT no válido` });
      const ta = tipoAux(l);
      if (ta) {
        if (!l.doc) return setMsg({ error: `Línea ${i + 1}: faltan los datos del documento (RUT, tipo y folio). Haz clic en «Documento».` });
        const e = validarDocAux(ta, l.doc);
        if (e.length) return setMsg({ error: `Línea ${i + 1}: ${e.join(', ')}.` });
      }
    }
    const nuevos = usadas.map((l, i) => ({ l, i })).filter(({ l }) => tipoAux(l) && l.doc?.modo === 'nuevo');
    if (nuevos.length > 1) return setMsg({ error: 'Un asiento puede registrar un solo documento nuevo. Deja los demás como «ya registrado» o regístralos aparte.' });
    if (!cuadra) return setMsg({ error: `El asiento no cuadra (diferencia ${clp(totalD - totalH)})` });
    iniciar(async () => {
      const base = {
        empresaId, fecha, glosa,
        lineas: usadas.map((l) => ({
          cuenta: l.cuenta, debe: monto(l.debe), haber: monto(l.haber),
          glosa: l.glosa || undefined, centro_costo: l.cc || undefined,
          rut_auxiliar: l.doc ? rutBase(l.doc.rut) : l.rut || undefined,
          ...(l.doc ? { tipo_dte: +l.doc.tipoDTE, folio: l.doc.folio.trim() } : {}),
        })),
      };
      const n = nuevos[0];
      const r = n ? await guardarAsientoConDocumento({ ...base, doc: { linea: n.i, tipo: tipoAux(n.l)!, datos: n.l.doc! } }) : await guardarAsiento(base);
      if (!r.ok) return setMsg({ error: r.error });
      setMsg({ ok: `Asiento N° ${r.numero} registrado${n ? ' y documento anotado en el libro' : ''}.` });
      setGlosa('');
      setLineas([vacia(), vacia()]);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <datalist id="lista-cuentas">
        {cuentas.map((c) => <option key={c.codigo} value={`${c.codigo} · ${c.nombre}`} />)}
      </datalist>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-72"><label className="etiqueta" htmlFor="plantilla">Usar plantilla</label>
          <select id="plantilla" className="campo" value="" onChange={(e) => aplicarPlantilla(e.target.value)}>
            <option value="">{plantillas.length ? '📋 Elegir asiento tipo…' : 'Sin plantillas todavía'}</option>
            {plantillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
        <Link href={`/e/${empresaId}/asientos/tipo`} className="boton-sec">Administrar plantillas</Link>
        <button type="button" className="boton-sec" disabled={enviando || !lineas.some((l) => l.cuenta)} onClick={guardarComoPlantilla}>💾 Guardar como plantilla</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="etiqueta" htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="glosa">Glosa</label>
          <input id="glosa" required value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" />
        </div>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-2 py-2">Cuenta</th><th className={`px-2 py-2 text-right ${ANCHO_MONTO}`}>Debe</th><th className={`px-2 py-2 text-right ${ANCHO_MONTO}`}>Haber</th>
              <th className="px-2 py-2">Detalle</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const c = porCodigo.get(l.cuenta);
              return (
                <tr key={i} className="border-b border-borde/50 align-top">
                  <td className="px-2 py-1.5">
                    <input list="lista-cuentas" value={l.cuenta} onChange={(e) => cambiar(i, 'cuenta', e.target.value)}
                      placeholder="Código o nombre" className="campo num" aria-label={`Cuenta línea ${i + 1}`} />
                    <div className="mt-0.5 truncate text-xs text-tenue">{c?.nombre ?? (l.cuenta ? '⚠️ cuenta no encontrada' : '')}</div>
                  </td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" maxLength={13} value={l.debe} onChange={(e) => cambiar(i, 'debe', e.target.value)} onBlur={() => abrirSiFalta(i)} className={`campo num text-right ${ANCHO_MONTO}`} aria-label={`Debe línea ${i + 1}`} /></td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" maxLength={13} value={l.haber} onChange={(e) => cambiar(i, 'haber', e.target.value)} onBlur={() => abrirSiFalta(i)} className={`campo num text-right ${ANCHO_MONTO}`} aria-label={`Haber línea ${i + 1}`} /></td>
                  <td className="space-y-1 px-2 py-1.5">
                    {c?.tipo_auxiliar && !tipoAux(l) && (
                      <input value={l.rut} onChange={(e) => cambiar(i, 'rut', e.target.value)} placeholder={`RUT ${c.tipo_auxiliar} *`} className="campo num" />
                    )}
                    {tipoAux(l) && (
                      <button type="button" onClick={() => setVentana(i)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${l.doc ? 'border-borde hover:border-acento' : 'border-dashed border-aviso text-aviso hover:bg-aviso/10'}`}>
                        {l.doc ? (<>
                          <span className={`rounded px-1.5 text-[10px] font-semibold ${l.doc.modo === 'nuevo' ? 'bg-acento/20 text-acento' : 'bg-info/15 text-info'}`}>{l.doc.modo === 'nuevo' ? 'NUEVO' : 'REF.'}</span>
                          <span className="num">{dtesDe(tipoAux(l)!).find((x) => x.cod === +l.doc!.tipoDTE)?.nm ?? l.doc.tipoDTE} N°{l.doc.folio}</span>
                          <span className="min-w-0 flex-1 truncate text-tenue">{rutBase(l.doc.rut)}{l.doc.razon ? ` · ${l.doc.razon}` : ''}</span>
                          {l.doc.modo === 'nuevo' && <span className="num">{clp(totalesDoc(tipoAux(l)!, l.doc).total)}</span>}
                          <span className="text-tenue">✏️</span>
                        </>) : <>📄 Documento * <span className="text-tenue">(RUT, tipo y folio{' · '}se abre al ingresar el monto)</span></>}
                      </button>
                    )}
                    {c?.acepta_centro_costo && (
                      <select value={l.cc} onChange={(e) => cambiar(i, 'cc', e.target.value)} className="campo">
                        <option value="">{c.requiere_centro_costo ? 'Centro de costo *' : 'Sin centro de costo'}</option>
                        {centros.map((cc) => <option key={cc.codigo} value={cc.codigo}>{cc.codigo} · {cc.nombre}</option>)}
                      </select>
                    )}
                    <input value={l.glosa} onChange={(e) => cambiar(i, 'glosa', e.target.value)} placeholder="Glosa de la línea (opcional)" className="campo" />
                  </td>
                  <td className="px-1 py-1.5">
                    {lineas.length > 2 && (
                      <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-tenue hover:text-peligro" aria-label="Quitar línea">✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-2 py-2">
                <button type="button" onClick={() => setLineas((ls) => [...ls, vacia()])} className="boton-sec">+ Línea</button>
              </td>
              <td className="num px-2 py-2 text-right whitespace-nowrap">{clp(totalD)}</td>
              <td className="num px-2 py-2 text-right whitespace-nowrap">{clp(totalH)}</td>
              <td colSpan={2} className={`px-2 py-2 ${cuadra ? 'text-acento' : 'text-aviso'}`}>
                {cuadra ? '✓ Cuadrado' : `Diferencia ${clp(totalD - totalH)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {ventana != null && lineas[ventana] && tipoAux(lineas[ventana]) && (() => {
        const l = lineas[ventana];
        const ta = tipoAux(l)!;
        return (
          <VentanaDocumento empresaId={empresaId} tipo={ta} fechaAsiento={fecha}
            inicial={l.doc ?? { ...docVacio(ta, fecha), rut: l.rut }}
            montoLinea={monto(l.debe) || monto(l.haber)} ladoActual={monto(l.debe) ? 'debe' : monto(l.haber) ? 'haber' : null}
            otroNuevo={lineas.some((x, j) => j !== ventana && x.doc?.modo === 'nuevo' && !!tipoAux(x))}
            onCancelar={() => { cancelada.current.add(ventana); setVentana(null); }}
            onAceptar={(d, ajustar) => {
              setLineas((ls) => ls.map((x, j) => {
                if (j !== ventana) return x;
                const n: Linea = { ...x, doc: d, rut: d.rut };
                if (ajustar != null) {
                  const lado = (ta === 'cliente') !== (+d.tipoDTE === 61) ? 'debe' : 'haber';
                  n.debe = lado === 'debe' ? milesInput(ajustar) : '';
                  n.haber = lado === 'haber' ? milesInput(ajustar) : '';
                }
                return n;
              }));
              if (!glosa.trim() && d.modo === 'nuevo') setGlosa(`${dtesDe(ta).find((x) => x.cod === +d.tipoDTE)?.nm ?? 'Documento'} N°${d.folio} · ${d.razon}`);
              setVentana(null);
            }} />
        );
      })()}
      <Mensaje {...msg} />
      <div className="flex gap-2">
        <button type="submit" className="boton" disabled={enviando || !cuadra}>{enviando ? 'Guardando…' : 'Guardar asiento'}</button>
        <Link href={`/e/${empresaId}/diario`} className="boton-sec">Ver libro diario</Link>
      </div>
    </form>
  );
}
