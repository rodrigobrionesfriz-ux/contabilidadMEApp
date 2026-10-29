'use client';

import { errorArchivoRCV } from '@/rcv/archivo';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { PlanCuentas, type CuentaBase } from '@/motor/plan-cuentas';
import { dteC, dteV } from '@/motor/dte';
import type { DocRCV, FilaDescartada, TipoRCV } from '@/rcv/leer';
import type { LineaDetalle } from '@/rcv/detalle';
import { claveDocumento, periodoSugerido } from '@/rcv/documento';
import { clp, fechaCL, MESES } from '@/lib/formato';
import { ListaCuentas, type CentroOpcion } from '@/components/editor-lineas';
import { abrirCarga, guardarCarga, quitarCarga, resumenCargas, type CargaRCV, type FichaAuxiliar, type ResumenCarga } from './acciones';
import { EditorDocumento, pesos } from './panel';

export interface Fila {
  doc: DocRCV;
  duplicado: boolean;
  /** Dónde quedó registrado antes (RCV, asiento manual, registro manual, respaldo) */
  registro?: { origen: string; numero: number | null; fecha: string };
  /** Cuenta y CC sugeridos (ficha del auxiliar o último uso) */
  cuenta: string;
  cc: string;
  formaPago: 'clientes' | 'banco' | 'deudores';
  detalle?: { lineas: LineaDetalle[]; glosa: string; aceptaRedondeo: boolean };
  vence: string;
  resultado?: { ok: boolean; numero?: number; error?: string };
}

type Filtro = 'pendientes' | 'todos' | 'registrados';
const rutDe = (d: Pick<DocRCV, 'rutCodigo' | 'rutDV'>) => `${d.rutCodigo}-${d.rutDV}`;

/** Filas del paso 2 a partir del RCV guardado y lo ya registrado / las fichas */
function armarFilas(tipo: TipoRCV, c: CargaRCV): Fila[] {
  const existentes = new Set(c.previos.existentes.map((k) => k.toUpperCase()));
  const registros = c.previos.registros ?? {};
  return c.docs.map((doc) => {
    const rut = rutDe(doc);
    const ficha = c.previos.fichas[rut];
    const u = c.previos.ultima[rut];
    const cuentaDte = tipo === 'venta' ? (dteV(doc.tipoDTE)?.cuenta ?? '') : '';
    return {
      doc, vence: doc.fechaVencimiento,
      duplicado: existentes.has(claveDocumento(rut, doc.tipoDTE, doc.numero).toUpperCase()),
      registro: registros[claveDocumento(rut, doc.tipoDTE, doc.numero)],
      cuenta: ficha?.cuenta || u?.cuenta || cuentaDte, cc: ficha?.cc ?? u?.cc ?? '',
      formaPago: ((ficha?.formaPago ?? u?.formaPago) as Fila['formaPago']) ?? 'clientes',
    };
  });
}
const nombrePeriodo = (p: string) => (p ? `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : '');

export function ImportadorRCV({ empresaId, tipo, cuentas, centros, resumenInicial, periodoInicial, cargaInicial, rutEmpresa }: {
  empresaId: string; tipo: TipoRCV; cuentas: CuentaBase[]; centros: CentroOpcion[];
  resumenInicial: ResumenCarga[]; periodoInicial: string; cargaInicial: CargaRCV | null; rutEmpresa: string;
}) {
  const plan = useMemo(() => new PlanCuentas(cuentas), [cuentas]);
  const [carga, setCarga] = useState<{ archivo: string; actualizado: string } | null>(cargaInicial ? { archivo: cargaInicial.archivo, actualizado: cargaInicial.actualizado } : null);
  const [filas, setFilas] = useState<Fila[]>(() => (cargaInicial ? armarFilas(tipo, cargaInicial) : []));
  const [descartadas, setDescartadas] = useState<FilaDescartada[]>(cargaInicial?.descartadas ?? []);
  const [fichas, setFichas] = useState<Record<string, FichaAuxiliar>>(cargaInicial?.previos.fichas ?? {});
  const [ultima, setUltima] = useState<Record<string, { cuenta: string; cc: string; formaPago?: string }>>(cargaInicial?.previos.ultima ?? {});
  const [resumen, setResumen] = useState<ResumenCarga[]>(resumenInicial);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [cargando, iniciarCarga] = useTransition();
  const [sel, setSel] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [busca, setBusca] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<'documento' | 'tabla'>('documento');
  const aux = tipo === 'compra' ? 'proveedor' : 'cliente';
  // RCV ya guardado de otra empresa (cargado antes de esta validación): no se deja contabilizar
  const ajena = carga ? errorArchivoRCV(carga.archivo, tipo, rutEmpresa) : null;
  const signo = (d: DocRCV) => ((tipo === 'compra' ? dteC(d.tipoDTE) : dteV(d.tipoDTE))?.signo ?? 1);

  function mostrar(c: CargaRCV | null) {
    setSel(null); setEditando(false); setFiltro('pendientes'); setBusca('');
    setCarga(c ? { archivo: c.archivo, actualizado: c.actualizado } : null);
    setFilas(c ? armarFilas(tipo, c) : []);
    setDescartadas(c?.descartadas ?? []);
    setFichas(c?.previos.fichas ?? {});
    setUltima(c?.previos.ultima ?? {});
  }

  /** Abre el RCV guardado del período elegido */
  function abrir(per: string) {
    setPeriodo(per); setError(''); setInfo('');
    iniciarCarga(async () => {
      try { mostrar(await abrirCarga(empresaId, tipo, per)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    });
  }

  /** Lee el archivo, lo guarda en su período (combinando si ya había uno) y lo abre */
  function leer(f: File) {
    setError(''); setInfo('');
    iniciarCarga(async () => {
      try {
        const errArchivo = errorArchivoRCV(f.name, tipo, rutEmpresa);
        if (errArchivo) throw new Error(errArchivo);
        const { leerArchivoRCV } = await import('@/rcv/leer');
        const r = await leerArchivoRCV(f.name, await f.arrayBuffer(), tipo);
        if (!r.docs.length) throw new Error('El archivo no tiene documentos válidos.');
        const per = periodoSugerido(r.docs);
        const g = await guardarCarga(empresaId, tipo, per, f.name, r.docs, r.filasDescartadas ?? []);
        if (!g.ok) throw new Error(g.error);
        setPeriodo(per);
        mostrar(await abrirCarga(empresaId, tipo, per));
        setResumen(await resumenCargas(empresaId, tipo));
        setAbierto(true);
        setInfo(`${r.docs.length} documentos leídos del registro del SII de ${nombrePeriodo(per)}${g.nuevos < r.docs.length ? ` (${g.nuevos} nuevos; ya había un RCV de ese mes y se combinaron)` : ''}${r.continuaciones ? ` · ${r.continuaciones} filas de otros impuestos agregadas a su documento` : ''}${r.descartados ? ` · ${r.descartados} filas no importables` : ''}. Quedó guardado: puedes seguir en otra sesión.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function quitar() {
    if (!window.confirm(`¿Quitar el RCV guardado de ${nombrePeriodo(periodo)}? Los documentos ya contabilizados no se tocan.`)) return;
    iniciarCarga(async () => {
      const r = await quitarCarga(empresaId, tipo, periodo);
      if (r.error) return setError(r.error);
      mostrar(null);
      setResumen(await resumenCargas(empresaId, tipo));
    });
  }

  const pendiente = (f: Fila) => !f.duplicado && !f.resultado?.ok;
  const visibles = filas.map((f, i) => ({ f, i })).filter(({ f }) => {
    if (filtro === 'pendientes' && !pendiente(f)) return false;
    if (filtro === 'registrados' && pendiente(f)) return false;
    const q = busca.trim().toLowerCase();
    return !q || f.doc.razonSocial.toLowerCase().includes(q) || f.doc.numero.includes(q) || rutDe(f.doc).includes(q);
  });
  const nPend = filas.filter(pendiente).length;
  const nReg = filas.filter((f) => f.resultado?.ok).length;
  const nDup = filas.filter((f) => f.duplicado).length;
  // Documentos del RCV que ya se habían registrado a mano (asiento manual, Nuevo documento, respaldo): no se importan
  const nManual = filas.filter((f) => f.duplicado && f.registro && f.registro.origen !== 'RCV').length;
  const anio = Number(periodo.slice(0, 4)) || new Date().getFullYear();

  const seleccionar = (i: number) => { setSel(i); setEditando(false); };
  /** Tras contabilizar: la ficha nueva pasa a ser el valor por defecto de los demás documentos del mismo RUT */
  function alRegistrar(i: number, r: { ok: boolean; numero?: number; error?: string; ficha?: FichaAuxiliar }) {
    const rut = rutDe(filas[i].doc);
    const fichasNuevas = r.ficha ? { ...fichas, [rut]: r.ficha } : fichas;
    if (r.ficha) setFichas(fichasNuevas);
    const nuevas = filas.map((f, j) => {
      if (j === i) return !r.ok && /Documento duplicado/.test(r.error ?? '') ? { ...f, duplicado: true, resultado: r } : { ...f, resultado: r };
      if (r.ficha && rutDe(f.doc) === rut && pendiente(f) && !f.detalle) return { ...f, cuenta: r.ficha.cuenta, cc: r.ficha.cc, ...(r.ficha.formaPago ? { formaPago: r.ficha.formaPago as Fila['formaPago'] } : {}) };
      return f;
    });
    setFilas(nuevas);
    if (r.ok) setResumen((rs) => rs.map((x) => (x.periodo === periodo ? { ...x, pendientes: Math.max(0, x.pendientes - 1) } : x)));
    if (r.ok) {
      // Siguiente pendiente de la lista (en el orden visible), sin abrir la edición
      const orden = visibles.map((v) => v.i);
      const desde = orden.indexOf(i);
      const sig = [...orden.slice(desde + 1), ...orden.slice(0, desde)].find((j) => j !== i && pendiente(nuevas[j]));
      setSel(sig ?? i);
      setEditando(false);
    }
  }

  const filtrados = visibles;
  const actual = sel !== null ? filas[sel] : null;
  const puedeImportar = !!actual && pendiente(actual) && !editando;
  const anios = Array.from(new Set([anio + 1, anio, anio - 1, ...resumen.map((r) => Number(r.periodo.slice(0, 4)))])).sort((a, b) => b - a);
  const cambiarPeriodo = (mes: string, an: string) => abrir(`${an}-${mes}`);

  return (
    <div className="space-y-4">
      <ListaCuentas id="cuentas-rcv" plan={plan} cuentas={cuentas} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Importar RCV de {tipo === 'compra' ? 'compras' : 'ventas'}</h1>
          <p className="text-sm text-tenue">Paso 1: sube el &quot;Detalle&quot; del Registro de {tipo === 'compra' ? 'Compras' : 'Ventas'} del SII (CSV o Excel). Paso 2: contabiliza documento por documento.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
          <Link href="?tipo=compra" className={`rounded px-3 py-1 ${tipo === 'compra' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Compras</Link>
          <Link href="?tipo=venta" className={`rounded px-3 py-1 ${tipo === 'venta' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Ventas</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="etiqueta" htmlFor="periodo">Mes del RCV y del libro</label>
          <select id="periodo" value={periodo} disabled={cargando} onChange={(e) => abrir(e.target.value)} className="campo w-60">
            {anios.flatMap((y) => MESES.map((m, i) => {
              const v = `${y}-${String(i + 1).padStart(2, '0')}`;
              const r = resumen.find((x) => x.periodo === v);
              return <option key={v} value={v}>{m} {y}{r ? (r.pendientes ? ` · ${r.pendientes} pendientes` : ' · ✓ completo') : ''}</option>;
            }))}
          </select>
        </div>
        <label className="flex min-w-72 flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-borde p-3 hover:border-acento">
          <span className="text-2xl">📄</span>
          <span className="text-sm">{cargando ? 'Cargando…' : carga ? `Subir otro RCV (se guarda en su mes; si es el mismo mes, se combina)` : 'Sube el archivo del RCV (.csv o .xlsx): queda guardado para seguir en otra sesión'}</span>
          <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" disabled={cargando} onChange={(e) => { if (e.target.files?.[0]) leer(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>

      {resumen.some((r) => r.pendientes > 0 && r.periodo !== periodo) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-tenue">Meses con documentos por importar:</span>
          {resumen.filter((r) => r.pendientes > 0 && r.periodo !== periodo).map((r) => (
            <button key={r.periodo} type="button" disabled={cargando} onClick={() => abrir(r.periodo)} className="rounded-full border border-aviso/40 bg-aviso/10 px-2.5 py-0.5 text-aviso hover:bg-aviso/20">
              {nombrePeriodo(r.periodo)} · {r.pendientes} de {r.total}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{error}</p>}
      {info && <p className="text-sm text-tenue">{info}</p>}

      {carga && ajena && (
        <div role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">
          ⛔ Este RCV guardado no corresponde a la empresa: {ajena} Quítalo con «Quitar este RCV» y sube el de esta empresa.
        </div>
      )}
      {carga ? (
        <div className="tarjeta flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <div>RCV de {nombrePeriodo(periodo)}: <b>{carga.archivo}</b></div>
            {nManual > 0 && <div className="mt-1 text-xs text-aviso">⚠️ {nManual} {nManual === 1 ? 'documento de este RCV ya estaba registrado' : 'documentos de este RCV ya estaban registrados'} a mano: {nManual === 1 ? 'queda' : 'quedan'} «En el libro» y no se vuelven a registrar.</div>}
            <div className="text-xs text-tenue">{filas.length} documentos · {nPend} por contabilizar · {nReg + nDup} en el libro · actualizado {new Date(carga.actualizado).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
              {' · '}<button type="button" className="hover:text-peligro" onClick={quitar} disabled={cargando}>Quitar este RCV</button></div>
          </div>
          <button type="button" className="boton" disabled={cargando || !!ajena} onClick={() => setAbierto(true)}>{nPend ? `Paso 2: contabilizar ${nPend} documento${nPend === 1 ? '' : 's'} →` : 'Ver el registro →'}</button>
        </div>
      ) : !cargando && (
        <div className="tarjeta p-6 text-center text-sm text-tenue">No hay un RCV de {tipo === 'compra' ? 'compras' : 'ventas'} guardado para {nombrePeriodo(periodo)}. Sube el archivo del SII para empezar.</div>
      )}

      {/* ─────────── Paso 2 (pantalla completa, como el sistema actual) ─────────── */}
      {abierto && carga && !ajena && (
        <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-velo p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Paso 2 del RCV">
          <div className="flex w-full max-w-[1600px] flex-col overflow-hidden rounded-lg border border-borde bg-fondo shadow-2xl">
            {/* Cabecera */}
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-panel px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">📥 RCV {tipo === 'compra' ? 'Compras' : 'Ventas'} · paso 2: contabilizar documento por documento</h2>
                <p className="truncate text-xs text-tenue">{carga.archivo} · {filas.length} documento(s) en el registro · {nPend} por contabilizar</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-tenue uppercase">Período</span>
                <select value={periodo.slice(5, 7)} disabled={cargando || editando} onChange={(e) => cambiarPeriodo(e.target.value, periodo.slice(0, 4))} className="campo w-32 py-1" aria-label="Mes">
                  {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                </select>
                <select value={periodo.slice(0, 4)} disabled={cargando || editando} onChange={(e) => cambiarPeriodo(periodo.slice(5, 7), e.target.value)} className="campo w-24 py-1" aria-label="Año">
                  {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button type="button" className="boton-sec py-1" disabled={editando} onClick={() => setVista(vista === 'tabla' ? 'documento' : 'tabla')}>{vista === 'tabla' ? '▤ Vista documento' : '▦ Vista tabla'}</button>
                <button type="button" className="boton py-1" disabled={!puedeImportar} onClick={() => { setVista('documento'); setEditando(true); }}>⬇ Importar</button>
                <button type="button" className="boton-sec px-2.5 py-1" onClick={() => { setAbierto(false); setEditando(false); }} aria-label="Cerrar paso 2">✕</button>
              </div>
            </header>

            {cargando ? <div className="flex-1 p-10 text-center text-tenue">Cargando…</div> : vista === 'tabla' ? (
              /* Vista tabla: todo el registro */
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nombre, folio o RUT…" className="campo w-72 py-1.5" aria-label="Buscar en el registro" />
                  {([['pendientes', 'Por contabilizar', nPend], ['registrados', 'En el libro', nReg + nDup], ['todos', 'Todos', filas.length]] as [Filtro, string, number][]).map(([k, t, n]) => (
                    <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-md border px-3 py-1 text-xs ${filtro === k ? 'border-info font-semibold text-info' : 'border-borde text-tenue'}`}>{t} <b>{n}</b></button>
                  ))}
                </div>
                <table className="w-full min-w-[1000px] text-xs">
                  <thead className="bg-panel-2 text-left text-[11px] tracking-wide text-tenue uppercase">
                    <tr className="border-b border-borde"><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Documento</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">{aux === 'proveedor' ? 'Proveedor' : 'Cliente'}</th>
                      <th className="px-2 py-2 text-right">Exento</th><th className="px-2 py-2 text-right">Neto</th><th className="px-2 py-2 text-right">IVA</th><th className="px-2 py-2 text-right">Otros</th><th className="px-2 py-2 text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {filtrados.map(({ f, i }) => (
                      <tr key={i} onClick={() => { seleccionar(i); setVista('documento'); }} className={`cursor-pointer border-b border-borde/40 hover:bg-panel-2 ${sel === i ? 'bg-panel-2' : ''}`}>
                        <td className="px-2 py-1.5">{f.resultado?.ok ? <span className="text-acento">✓ N° {f.resultado.numero}</span> : f.duplicado ? <span className={f.registro && f.registro.origen !== 'RCV' ? 'text-aviso' : 'text-tenue'} title={f.registro ? `Registrado por ${f.registro.origen}${f.registro.numero ? `, asiento N° ${f.registro.numero}` : ''}` : ''}>{f.registro && f.registro.origen !== 'RCV' ? `En el libro (${f.registro.origen === 'asiento manual' ? 'manual' : f.registro.origen.split(' ')[0]})` : 'En el libro'}</span> : !fichas[rutDe(f.doc)] ? <span className="text-info">★ nuevo</span> : 'Por contabilizar'}</td>
                        <td className="num px-2 py-1.5">{f.doc.tipoDTE}-{f.doc.numero}</td>
                        <td className="num px-2 py-1.5">{fechaCL(f.doc.fecha)}</td>
                        <td className="max-w-[280px] truncate px-2 py-1.5">{f.doc.razonSocial} <span className="num text-tenue">{rutDe(f.doc)}</span></td>
                        <td className="num px-2 py-1.5 text-right">{f.doc.exento ? clp(f.doc.exento) : ''}</td>
                        <td className="num px-2 py-1.5 text-right">{clp(f.doc.neto)}</td>
                        <td className="num px-2 py-1.5 text-right">{clp(f.doc.iva)}</td>
                        <td className="num px-2 py-1.5 text-right">{f.doc.otrosImpuestos ? clp(f.doc.otrosImpuestos) : ''}</td>
                        <td className={`num px-2 py-1.5 text-right font-semibold ${signo(f.doc) < 0 ? 'text-peligro' : ''}`}>{signo(f.doc) < 0 ? '-' : ''}{clp(f.doc.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_1fr]">
                {/* Columna izquierda */}
                <aside className="flex min-h-0 flex-col border-r border-borde bg-panel">
                  <div className="space-y-2 border-b border-borde p-3">
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nombre, folio o RUT…" className="campo py-1.5" aria-label="Buscar en el registro" />
                    <div className="grid grid-cols-3 gap-1.5">
                      {([['pendientes', 'Por contabilizar', nPend], ['registrados', 'En el libro', nReg + nDup], ['todos', 'Todos', filas.length]] as [Filtro, string, number][]).map(([k, t, n]) => (
                        <button key={k} type="button" onClick={() => setFiltro(k)}
                          className={`rounded-md border px-1 py-1 text-[11px] leading-tight ${filtro === k ? 'border-info font-semibold text-info' : 'border-borde text-tenue hover:text-texto'}`}>
                          {t} <b>{n}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Documentos del registro">
                    {filtrados.map(({ f, i }) => {
                      const activo = sel === i;
                      return (
                        <li key={i}>
                          <button type="button" onClick={() => seleccionar(i)} aria-current={activo}
                            className={`w-full border-b border-borde/50 px-3 py-2 text-left hover:bg-panel-2 ${activo ? 'border-l-4 border-l-info bg-info/10' : 'border-l-4 border-l-transparent'} ${!pendiente(f) ? 'opacity-60' : ''}`}>
                            <div className="truncate text-xs font-semibold uppercase" title={f.doc.razonSocial}>{f.doc.razonSocial || rutDe(f.doc)}</div>
                            <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-tenue">
                              <span className="num">{f.doc.tipoDTE}-{f.doc.numero}&nbsp;&nbsp;{fechaCL(f.doc.fecha)}</span>
                              <span className={`num shrink-0 text-texto ${signo(f.doc) < 0 ? 'text-peligro' : ''}`}>
                                {f.resultado?.ok ? <span className="text-acento">✓ N° {f.resultado.numero}</span> : <>{signo(f.doc) < 0 ? '-' : ''}{pesos(f.doc.total)}</>}
                              </span>
                            </div>
                            {pendiente(f) && !fichas[rutDe(f.doc)] && <div className="text-[10px] text-info">★ {aux} nuevo</div>}
                          </button>
                        </li>
                      );
                    })}
                    {!filtrados.length && <li className="p-4 text-center text-xs text-tenue">{filtro === 'pendientes' ? '✓ No quedan documentos por contabilizar.' : 'Sin resultados.'}</li>}
                  </ul>
                </aside>

                {/* Panel derecho */}
                <section className="min-h-0 overflow-y-auto bg-fondo">
                  {actual && editando && pendiente(actual) ? (
                    <EditorDocumento key={sel}
                      empresaId={empresaId} tipo={tipo} periodo={periodo} plan={plan} cuentas={cuentas} centros={centros}
                      fila={actual} ficha={fichas[rutDe(actual.doc)] ?? null} ultima={ultima[rutDe(actual.doc)] ?? null}
                      onCancelar={() => setEditando(false)}
                      onGuardarBorrador={(cambios) => setFilas((fs) => fs.map((f, j) => (j === sel ? { ...f, ...cambios } : f)))}
                      onRegistrado={(r) => alRegistrar(sel!, r)}
                    />
                  ) : actual ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                      <div className="text-4xl opacity-60">🧾</div>
                      <p className="text-sm font-semibold text-tenue">{actual.doc.razonSocial} · <span className="num">{actual.doc.tipoDTE}-{actual.doc.numero}</span> · {pesos(actual.doc.total)}</p>
                      {actual.resultado?.ok ? <p className="text-sm text-acento">✓ Contabilizado en el asiento N° {actual.resultado.numero}.</p>
                        : actual.duplicado ? (
                          <p className={`max-w-xl text-sm ${actual.registro && actual.registro.origen !== 'RCV' ? 'rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-aviso' : 'text-tenue'}`}>
                            {actual.registro && actual.registro.origen !== 'RCV' ? '⚠️ ' : ''}Ya está registrado en el libro de {tipo === 'compra' ? 'compras' : 'ventas'}
                            {actual.registro ? ` por ${actual.registro.origen}${actual.registro.numero ? ` (asiento N° ${actual.registro.numero}` : ' ('}${actual.registro.fecha ? `${actual.registro.numero ? ', ' : ''}${actual.registro.fecha.split('-').reverse().join('/')}` : ''})` : ''}. No se vuelve a registrar.
                          </p>
                        )
                        : <p className="text-sm text-tenue">Toca <b className="text-texto">⬇ Importar</b> (arriba a la derecha) para editar su asiento.</p>}
                      {actual.resultado && !actual.resultado.ok && <p role="alert" className="text-sm text-peligro">{actual.resultado.error}</p>}
                      {actual.doc.registroSII?.length ? (
                        <details className="w-full max-w-2xl text-left text-xs">
                          <summary className="cursor-pointer text-tenue hover:text-texto">Registro completo del SII ({Object.keys(actual.doc.registroSII[0]).length} columnas)</summary>
                          <table className="mt-2 w-full text-[11px]"><tbody>
                            {Object.keys(actual.doc.registroSII[0]).map((k) => (
                              <tr key={k} className="border-b border-borde/40"><td className="w-56 px-2 py-0.5 text-tenue">{k}</td>{actual.doc.registroSII!.map((fl, j) => <td key={j} className="num px-2 py-0.5">{fl[k] ?? ''}</td>)}</tr>
                            ))}
                          </tbody></table>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-6 py-16 text-center text-sm text-tenue">
                      Elige un documento de la lista y toca <b className="text-texto">⬇ Importar</b> para editar su asiento.
                      {descartadas.length > 0 && (
                        <details className="mx-auto mt-6 max-w-2xl text-left text-xs">
                          <summary className="cursor-pointer text-aviso">{descartadas.length} filas del archivo no son documentos importables</summary>
                          <ul className="mt-2 space-y-1">{descartadas.map((dd, k) => <li key={k} className="rounded bg-panel-2 px-2 py-1"><b>{dd.motivo}</b> · <span className="text-tenue">{Object.values(dd.fila).slice(0, 8).join(' · ')}</span></li>)}</ul>
                        </details>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            <footer className="flex items-center justify-between gap-3 border-t border-borde bg-panel px-4 py-2 text-xs text-tenue">
              <span>{nReg > 0 ? <>✓ {nReg} contabilizados en esta sesión · <Link className="text-acento hover:underline" href={`../libro?tipo=${tipo}&anio=${periodo.slice(0, 4)}&mes=${Number(periodo.slice(5, 7))}`}>ver libro</Link></> : 'El RCV queda guardado: puedes cerrar y seguir en otra sesión.'}</span>
              <button type="button" className="boton-sec py-1" onClick={() => { setAbierto(false); setEditando(false); }}>Cancelar</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
