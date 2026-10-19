'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlanCuentas, type CuentaBase } from '@/motor/plan-cuentas';
import { dteC, dteV } from '@/motor/dte';
import type { DocRCV, FilaDescartada, TipoRCV } from '@/rcv/leer';
import type { LineaDetalle } from '@/rcv/detalle';
import { claveDocumento, periodoSugerido } from '@/rcv/documento';
import { clp, fechaCL, MESES } from '@/lib/formato';
import { ListaCuentas, type CentroOpcion } from '@/components/editor-lineas';
import { consultarPrevios, type FichaAuxiliar } from './acciones';
import { PanelDocumento } from './panel';

export interface Fila {
  doc: DocRCV;
  duplicado: boolean;
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

export function ImportadorRCV({ empresaId, tipo, cuentas, centros }: { empresaId: string; tipo: TipoRCV; cuentas: CuentaBase[]; centros: CentroOpcion[] }) {
  const plan = useMemo(() => new PlanCuentas(cuentas), [cuentas]);
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [descartadas, setDescartadas] = useState<FilaDescartada[]>([]);
  const [fichas, setFichas] = useState<Record<string, FichaAuxiliar>>({});
  const [ultima, setUltima] = useState<Record<string, { cuenta: string; cc: string; formaPago?: string }>>({});
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [busca, setBusca] = useState('');
  const aux = tipo === 'compra' ? 'proveedor' : 'cliente';
  const signo = (d: DocRCV) => ((tipo === 'compra' ? dteC(d.tipoDTE) : dteV(d.tipoDTE))?.signo ?? 1);

  async function leer(f: File) {
    setError(''); setInfo(''); setFilas([]); setSel(null); setEditando(false); setDescartadas([]);
    try {
      const { leerArchivoRCV } = await import('@/rcv/leer');
      const r = await leerArchivoRCV(f.name, await f.arrayBuffer(), tipo);
      if (!r.docs.length) throw new Error('El archivo no tiene documentos válidos.');
      const prev = await consultarPrevios(empresaId, tipo, r.docs.map(rutDe));
      const existentes = new Set(prev.existentes.map((k) => k.toUpperCase()));
      setPeriodo(periodoSugerido(r.docs));
      setArchivo(f.name);
      setFichas(prev.fichas);
      setUltima(prev.ultima);
      setDescartadas(r.filasDescartadas ?? []);
      setInfo(`${r.docs.length} documentos leídos del registro del SII${r.continuaciones ? ` · ${r.continuaciones} filas de otros impuestos agregadas a su documento` : ''}${r.descartados ? ` · ${r.descartados} filas no importables` : ''}.`);
      setFilas(r.docs.map((doc) => {
        const rut = rutDe(doc);
        const ficha = prev.fichas[rut];
        const u = prev.ultima[rut];
        const cuentaDte = tipo === 'venta' ? (dteV(doc.tipoDTE)?.cuenta ?? '') : '';
        return {
          doc, vence: doc.fechaVencimiento,
          duplicado: existentes.has(claveDocumento(rut, doc.tipoDTE, doc.numero).toUpperCase()),
          cuenta: ficha?.cuenta || u?.cuenta || cuentaDte, cc: ficha?.cc ?? u?.cc ?? '',
          formaPago: ((ficha?.formaPago ?? u?.formaPago) as Fila['formaPago']) ?? 'clientes',
        };
      }));
      setFiltro('pendientes');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
  const sinFicha = new Set(filas.filter((f) => pendiente(f) && !fichas[rutDe(f.doc)]).map((f) => rutDe(f.doc))).size;
  const anio = Number(periodo.slice(0, 4)) || new Date().getFullYear();

  const seleccionar = (i: number) => { setSel(i); setEditando(false); };
  /** Tras contabilizar: la ficha nueva pasa a ser el valor por defecto de los demás documentos del mismo RUT */
  function alRegistrar(i: number, r: { ok: boolean; numero?: number; error?: string; ficha?: FichaAuxiliar }) {
    const rut = rutDe(filas[i].doc);
    const fichasNuevas = r.ficha ? { ...fichas, [rut]: r.ficha } : fichas;
    if (r.ficha) setFichas(fichasNuevas);
    const nuevas = filas.map((f, j) => {
      if (j === i) return { ...f, resultado: r };
      if (r.ficha && rutDe(f.doc) === rut && pendiente(f) && !f.detalle) return { ...f, cuenta: r.ficha.cuenta, cc: r.ficha.cc, ...(r.ficha.formaPago ? { formaPago: r.ficha.formaPago as Fila['formaPago'] } : {}) };
      return f;
    });
    setFilas(nuevas);
    if (r.ok) {
      // Siguiente pendiente de la lista (en el orden visible), sin abrir la edición
      const orden = visibles.map((v) => v.i);
      const desde = orden.indexOf(i);
      const sig = [...orden.slice(desde + 1), ...orden.slice(0, desde)].find((j) => j !== i && pendiente(nuevas[j]));
      setSel(sig ?? i);
      setEditando(false);
    }
  }

  return (
    <div className="space-y-4">
      <ListaCuentas id="cuentas-rcv" plan={plan} cuentas={cuentas} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Importar RCV de {tipo === 'compra' ? 'compras' : 'ventas'}</h1>
          <p className="text-sm text-tenue">Paso 1: sube el &quot;Detalle&quot; del Registro de {tipo === 'compra' ? 'Compras' : 'Ventas'} del SII (CSV o Excel). Paso 2: revisa cada documento y contabilízalo.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
          <Link href="?tipo=compra" className={`rounded px-3 py-1 ${tipo === 'compra' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Compras</Link>
          <Link href="?tipo=venta" className={`rounded px-3 py-1 ${tipo === 'venta' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Ventas</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-72 flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-borde p-3 hover:border-acento">
          <span className="text-2xl">📄</span>
          <span className="text-sm">{archivo ? `${archivo} (elige otro para cambiarlo)` : 'Elige el archivo del RCV (.csv o .xlsx)'}</span>
          <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
        </label>
        {filas.length > 0 && (
          <div>
            <label className="etiqueta" htmlFor="periodo">Período del libro</label>
            <select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="campo w-44">
              {[anio - 1, anio].flatMap((y) => MESES.map((m, i) => {
                const v = `${y}-${String(i + 1).padStart(2, '0')}`;
                return <option key={v} value={v}>{m} {y}</option>;
              }))}
            </select>
          </div>
        )}
      </div>
      {error && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{error}</p>}
      {info && <p className="text-sm text-tenue">{info}</p>}

      {filas.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[360px_1fr]">
          {/* ── Columna izquierda: el registro completo ── */}
          <aside className="tarjeta flex max-h-[calc(100vh-9rem)] flex-col lg:sticky lg:top-4">
            <div className="space-y-2 border-b border-borde p-3">
              <div className="flex gap-1 text-xs">
                {([['pendientes', `Pendientes (${nPend})`], ['registrados', `Registrados (${nReg + nDup})`], ['todos', `Todos (${filas.length})`]] as [Filtro, string][]).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded px-2 py-1 ${filtro === k ? 'bg-panel-2 font-semibold text-acento' : 'text-tenue hover:text-texto'}`}>{t}</button>
                ))}
              </div>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${aux}, RUT o folio…`} className="campo py-1 text-xs" aria-label="Buscar en el registro" />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Documentos del registro">
              {visibles.map(({ f, i }) => {
                const activo = sel === i;
                const nueva = pendiente(f) && !fichas[rutDe(f.doc)];
                return (
                  <li key={i} className={`border-b border-borde/40 ${activo ? 'bg-panel-2' : ''}`}>
                    <button type="button" onClick={() => seleccionar(i)} aria-current={activo}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-panel-2 ${activo ? 'border-l-2 border-acento' : 'border-l-2 border-transparent'} ${!pendiente(f) ? 'opacity-60' : ''}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium" title={f.doc.razonSocial}>{f.doc.razonSocial || rutDe(f.doc)}</span>
                        <span className={`num shrink-0 font-semibold ${signo(f.doc) < 0 ? 'text-peligro' : ''}`}>{signo(f.doc) < 0 ? '-' : ''}{clp(f.doc.total)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-tenue">
                        <span className="num">{f.doc.tipoDTE} N° {f.doc.numero} · {fechaCL(f.doc.fecha)}</span>
                        <span className="shrink-0">
                          {f.resultado?.ok ? <span className="text-acento">✓ N° {f.resultado.numero}</span>
                            : f.duplicado ? 'Ya registrado'
                            : f.resultado ? <span className="text-peligro">✕ error</span>
                            : nueva ? <span className="text-info" title={`${aux} sin ficha`}>★ nuevo</span> : ''}
                        </span>
                      </div>
                    </button>
                    {activo && pendiente(f) && !editando && (
                      <div className="px-3 pb-2">
                        <button type="button" className="boton w-full py-1 text-xs" onClick={() => setEditando(true)}>Importar →</button>
                      </div>
                    )}
                  </li>
                );
              })}
              {!visibles.length && <li className="p-4 text-center text-xs text-tenue">{filtro === 'pendientes' ? '✓ No quedan documentos pendientes.' : 'Sin resultados.'}</li>}
            </ul>
            <div className="border-t border-borde px-3 py-2 text-[11px] text-tenue">
              {nReg > 0 && <span className="text-acento">✓ {nReg} contabilizados · </span>}
              {nPend} pendientes{sinFicha ? ` · ${sinFicha} ${aux === 'proveedor' ? 'proveedores' : 'clientes'} nuevos` : ''}
              {nReg > 0 && <> · <Link className="text-acento hover:underline" href={`../libro?tipo=${tipo}&anio=${periodo.slice(0, 4)}&mes=${Number(periodo.slice(5, 7))}`}>ver libro</Link></>}
            </div>
          </aside>

          {/* ── Panel derecho: documento seleccionado ── */}
          <section>
            {sel !== null && filas[sel] ? (
              <PanelDocumento
                key={`${sel}-${editando}`}
                empresaId={empresaId} tipo={tipo} periodo={periodo} plan={plan} centros={centros}
                fila={filas[sel]} ficha={fichas[rutDe(filas[sel].doc)] ?? null} ultima={ultima[rutDe(filas[sel].doc)] ?? null}
                editando={editando} onImportar={() => setEditando(true)} onCancelar={() => setEditando(false)}
                onGuardarBorrador={(cambios) => setFilas((fs) => fs.map((f, j) => (j === sel ? { ...f, ...cambios } : f)))}
                onRegistrado={(r) => alRegistrar(sel, r)}
              />
            ) : (
              <div className="tarjeta space-y-3 p-6 text-sm">
                <h2 className="font-semibold">Elige un documento de la lista</h2>
                <p className="text-tenue">Al seleccionarlo aparece el botón <b>Importar</b>. Ahí revisas la glosa, la cuenta y el centro de costo (vienen de la ficha del {aux}) y recién al confirmar se contabiliza y pasa al libro de {tipo === 'compra' ? 'compras' : 'ventas'}.</p>
                <p className="text-tenue">Los marcados <span className="text-info">★ nuevo</span> no tienen ficha: al importarlos puedes crearla, y la cuenta y el centro de costo de ese primer asiento quedan como valores por defecto.</p>
                {descartadas.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-aviso">{descartadas.length} filas del archivo no son documentos importables</summary>
                    <ul className="mt-2 space-y-1">
                      {descartadas.map((d, k) => (
                        <li key={k} className="rounded bg-panel-2 px-2 py-1"><b>{d.motivo}</b> · <span className="text-tenue">{Object.values(d.fila).slice(0, 8).join(' · ')}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
