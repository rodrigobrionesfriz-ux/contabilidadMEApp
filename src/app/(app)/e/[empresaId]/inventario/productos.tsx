'use client';

import { useState } from 'react';
import type { ProductoI } from '@/inventario/filas';
import { CUENTA_INVENTARIO_FIJA } from '@/inventario/motor';
import { TIPOS, UNIDADES, prepararImportacionProductos, siguienteCodigo, PLANTILLA_ENCABEZADOS, PLANTILLA_EJEMPLO, PLANTILLA_INSTRUCCIONES } from '@/inventario/importador';
import { decimalCL, decimalInput } from '@/lib/formato';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { guardarProducto, importarProductos, type FormProducto } from './acciones';
import { Badge, Vacio, fmt, type Ctx } from './comun';

type Previa = ReturnType<typeof prepararImportacionProductos> & { filas0: unknown[][]; nombre: string; actualizar: boolean };

export function Productos({ c }: { c: Ctx }) {
  const [q, setQ] = useState('');
  const [ed, setEd] = useState<{ id: string | null; f: FormProducto; minimo: string } | null>(null);
  const [imp, setImp] = useState<{ actualizar: boolean; previa: Previa | null; error: string } | null>(null);
  const grupo = (id: string | null) => c.datos.grupos.find((g) => g.id === id);
  let filas = c.datos.productos.slice().sort((a, b) => a.codigo.localeCompare(b.codigo));
  if (q) { const s = q.toLowerCase(); filas = filas.filter((p) => `${p.codigo} ${p.ean} ${p.descripcion} ${p.subgrupo}`.toLowerCase().includes(s)); }
  const conMov = new Set(c.datos.movimientos.flatMap((m) => m.lineas.map((l) => l.productoId)));
  const abrir = (p?: ProductoI) => {
    c.avisar({});
    setEd(p ? { id: p.id, minimo: decimalInput(p.stockMinimo), f: { codigo: p.codigo, ean: p.ean, descripcion: p.descripcion, tipo: p.tipo, unidad: p.unidad, grupoId: p.grupoId || '', subgrupo: p.subgrupo, stockMinimo: p.stockMinimo, cuentaCosto: p.cuentaCosto, aplicaIVA: p.aplicaIVA, manejaLotes: p.manejaLotes, inventariable: p.inventariable, activo: p.activo } }
      : { id: null, minimo: '0', f: productoNuevo(c) });
  };
  const plantilla = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([PLANTILLA_ENCABEZADOS, PLANTILLA_EJEMPLO, []]);
    ws['!cols'] = [15, 18, 38, 22, 12, 24, 24, 15, 20, 23, 14, 15, 16, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    const wi = XLSX.utils.aoa_to_sheet(PLANTILLA_INSTRUCCIONES); wi['!cols'] = [{ wch: 120 }]; XLSX.utils.book_append_sheet(wb, wi, 'Instrucciones');
    const subs = c.datos.grupos.flatMap((g) => g.subgrupos.map((s) => `${g.nombre} / ${s}`));
    const nFil = Math.max(TIPOS.length, UNIDADES.length, c.datos.grupos.length, subs.length, c.apoyo.cuentasGasto.length);
    const cat: (string | number)[][] = [['TIPOS', 'UNIDADES', 'GRUPOS ACTUALES', 'SUBGRUPOS ACTUALES', 'CUENTAS DE GASTO']];
    for (let i = 0; i < nFil; i++) cat.push([TIPOS[i] || '', UNIDADES[i] || '', c.datos.grupos[i]?.nombre || '', subs[i] || '', c.apoyo.cuentasGasto[i] ? `${c.apoyo.cuentasGasto[i].codigo} ${c.apoyo.cuentasGasto[i].nombre}` : '']);
    const wc = XLSX.utils.aoa_to_sheet(cat); wc['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 28 }, { wch: 40 }, { wch: 46 }]; XLSX.utils.book_append_sheet(wb, wc, 'Catálogos');
    XLSX.writeFile(wb, 'plantilla_productos.xlsx');
  };
  const leer = async (file: File, actualizar: boolean) => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const filas0 = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
      const gasto = new Set(c.apoyo.cuentasGasto.map((x) => x.codigo));
      const r = prepararImportacionProductos(filas0, { productos: c.datos.productos, actualizar, cuentaGastoExiste: (x) => gasto.has(x), cuentaInventarioFija: CUENTA_INVENTARIO_FIJA, productosConMovimientos: [...conMov] });
      setImp({ actualizar, previa: { ...r, filas0, nombre: file.name, actualizar }, error: '' });
    } catch (e) { setImp({ actualizar, previa: null, error: (e as Error).message }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, EAN o descripción…" aria-label="Buscar producto" />
        <span className="flex-1" />
        <button type="button" className="boton-sec" onClick={plantilla}>📄 Plantilla Excel</button>
        {c.escribe && <button type="button" className="boton-sec" onClick={() => { c.avisar({}); setImp({ actualizar: false, previa: null, error: '' }); }}>⬆ Importar Excel</button>}
        {c.escribe && <button type="button" className="boton" onClick={() => abrir()}>＋ Producto</button>}
      </div>
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[900px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="p-2">Código</th><th>EAN</th><th>Descripción</th><th>Tipo</th><th>Grupo / subgrupo</th><th>U.M.</th><th className="text-right">Mínimo</th><th>Lotes</th><th>Cuenta gasto</th><th>Estado</th><th /></tr></thead>
        <tbody>{filas.length ? filas.map((p) => (
          <tr key={p.id} className="border-b border-borde/30"><td className="num p-2 font-semibold">{p.codigo}</td><td className="num">{p.ean || '–'}</td><td>{p.descripcion}</td><td>{p.tipo}</td><td>{grupo(p.grupoId)?.nombre || '–'} <span className="text-tenue">{p.subgrupo}</span></td>
            <td>{p.unidad}</td><td className="num text-right">{fmt(p.stockMinimo)}</td><td>{p.manejaLotes ? 'Sí' : 'No'}</td><td className="num">{p.cuentaCosto}</td><td><Badge tono={p.activo ? 'ok' : 'tenue'}>{p.activo ? 'ACTIVO' : 'INACTIVO'}</Badge></td>
            <td className="pr-2 text-right">{c.escribe && <button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => abrir(p)}>Editar</button>}</td></tr>
        )) : <Vacio cols={11}>Aún no hay productos.</Vacio>}</tbody>
      </table></div>

      {ed && <FormProductoModal c={c} id={ed.id} inicial={ed.f} minimo={ed.minimo} onCerrar={() => setEd(null)} />}

      {imp && (
        <Modal titulo={imp.previa ? 'Vista previa de productos' : 'Importar productos desde Excel'} sub={imp.previa ? `${imp.previa.nombre} · ${imp.previa.actualizar ? 'creación y actualización' : 'sólo productos nuevos'}` : 'La información se valida y previsualiza antes de guardar'} onCerrar={() => setImp(null)} ancho="max-w-5xl">
          {!imp.previa ? <>
            <p className="rounded-md border border-borde p-2 text-xs"><strong>Importante:</strong> esta carga crea el catálogo, pero no modifica existencias ni costos.</p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={imp.actualizar} onChange={(e) => setImp({ ...imp, actualizar: e.target.checked })} />Actualizar productos cuyo código ya existe. Si no se marca, esas filas se omiten.</label>
            <input type="file" accept=".xlsx,.xls" aria-label="Plantilla de productos" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f, imp.actualizar); }} />
            {imp.error && <Mensaje error={imp.error} />}
            <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={plantilla}>📄 Descargar plantilla</button><button type="button" className="boton-sec" onClick={() => setImp(null)}>Cancelar</button></div>
          </> : <>
            <div className="flex flex-wrap gap-3 text-sm"><Badge>{imp.previa.resumen.nuevos} nuevos</Badge><Badge tono="info">{imp.previa.resumen.actualiza} actualizan</Badge><Badge tono="tenue">{imp.previa.resumen.omite} omitidos</Badge><Badge tono="mal">{imp.previa.resumen.errores} con error</Badge></div>
            {imp.previa.resumen.errores > 0 && <p className="rounded-md border border-peligro/40 bg-peligro/10 p-2 text-xs text-peligro"><strong>Corrige las filas con error en Excel y vuelve a cargar la plantilla.</strong> No se guarda ninguna fila mientras existan errores.</p>}
            <div className="max-h-[50vh] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-panel text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Fila</th><th>Estado</th><th>Código</th><th>Descripción</th><th>Grupo / subgrupo</th><th>Tipo</th><th>U.M.</th><th>Validación</th></tr></thead>
              <tbody>{imp.previa.filas.map((x) => <tr key={x.fila} className="border-b border-borde/30"><td className="num py-1">{x.fila}</td><td><Badge tono={x.estado === 'ERROR' ? 'mal' : x.estado === 'NUEVO' ? 'ok' : x.estado === 'ACTUALIZA' ? 'info' : 'tenue'}>{x.estado}</Badge></td><td className="num">{x.codigo || '–'}</td><td>{x.producto.descripcion || '–'}</td><td>{x.producto.grupoNombre || '–'} <span className="text-tenue">{x.producto.subgrupo}</span></td><td>{x.producto.tipo}</td><td>{x.producto.unidad}</td><td className={x.errores.length ? 'text-peligro' : ''}>{x.errores.length ? x.errores.join(' · ') : 'OK'}</td></tr>)}</tbody></table></div>
            {c.msg.error && <Mensaje error={c.msg.error} />}
            <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={() => setImp({ ...imp, previa: null })}>← Elegir otro archivo</button><button type="button" className="boton-sec" onClick={() => setImp(null)}>Cancelar</button>
              <button type="button" className="boton" disabled={c.pendiente || imp.previa.resumen.errores > 0 || !(imp.previa.resumen.nuevos + imp.previa.resumen.actualiza)} onClick={async () => { if (await c.run(() => importarProductos(c.empresaId, imp.previa!.filas0, imp.previa!.actualizar))) setImp(null); }}>Importar {imp.previa.resumen.nuevos + imp.previa.resumen.actualiza} producto(s)</button></div>
          </>}
        </Modal>
      )}
    </div>
  );
}

/** Valores de un producto nuevo (código correlativo siguiente). */
export const productoNuevo = (c: Ctx): FormProducto => ({ codigo: siguienteCodigo(c.datos.productos.map((x) => x.codigo)), ean: '', descripcion: '', tipo: 'MERCADERÍA', unidad: 'UN', grupoId: '', subgrupo: '', stockMinimo: 0, cuentaCosto: '', aplicaIVA: true, manejaLotes: false, inventariable: true, activo: true });

/**
 * Ficha del producto. Se usa en Productos y, como ventana flotante (`flotante`),
 * desde Movimientos: al crear el producto se llama a `onCreado` con su id para
 * elegirlo en la línea sin cerrar el movimiento.
 */
export function FormProductoModal({ c, id, inicial, minimo: minimo0 = '0', onCerrar, flotante = false, onCreado }: {
  c: Ctx; id: string | null; inicial: FormProducto; minimo?: string; onCerrar: () => void; flotante?: boolean; onCreado?: (id: string) => void;
}) {
  const [f, setF] = useState<FormProducto>(inicial);
  const [minimo, setMinimo] = useState(minimo0);
  const [error, setError] = useState('');
  const set = (x: Partial<FormProducto>) => setF({ ...f, ...x });
  const g = c.datos.grupos.find((x) => x.id === (f.grupoId || null));
  const conMov = new Set(c.datos.movimientos.flatMap((m) => m.lineas.map((l) => l.productoId)));
  const bloqueado = !!(id && conMov.has(id));
  const guardar = async () => {
    setError('');
    let nuevoId: string | undefined;
    const ok = await c.run(async () => {
      const r = await guardarProducto(c.empresaId, id, { ...f, stockMinimo: decimalCL(minimo) });
      if (r.ok) nuevoId = r.id; else if (flotante) setError(r.error);
      return r;
    });
    if (!ok) return;
    if (flotante && nuevoId && onCreado) onCreado(nuevoId);
    onCerrar();
  };
  return (
    <Modal titulo={id ? 'Editar producto' : 'Nuevo producto'} sub={flotante ? 'Al crearlo queda elegido en la línea del movimiento' : 'Los productos y su clasificación pertenecen a esta empresa'} onCerrar={onCerrar} encima={flotante}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="etiqueta" htmlFor="pr-c">Código interno</label><input id="pr-c" className="campo" value={f.codigo} readOnly={!!id} maxLength={30} onChange={(e) => set({ codigo: e.target.value })} /></div>
              <div><label className="etiqueta" htmlFor="pr-e">Código EAN</label><input id="pr-e" className="campo" value={f.ean} maxLength={20} onChange={(e) => set({ ean: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="etiqueta" htmlFor="pr-d">Descripción</label><input id="pr-d" className="campo" value={f.descripcion} maxLength={180} onChange={(e) => set({ descripcion: e.target.value })} /></div>
              <div><label className="etiqueta" htmlFor="pr-t">Tipo</label><select id="pr-t" className="campo" value={f.tipo} onChange={(e) => set({ tipo: e.target.value })}>{TIPOS.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className="etiqueta" htmlFor="pr-u">Unidad</label><select id="pr-u" className="campo" value={f.unidad} onChange={(e) => set({ unidad: e.target.value })}>{UNIDADES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className="etiqueta" htmlFor="pr-g">Grupo</label><select id="pr-g" className="campo" value={f.grupoId} onChange={(e) => set({ grupoId: e.target.value, subgrupo: '' })}><option value="">Sin grupo</option>{c.datos.grupos.filter((x) => x.activo !== false).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
              <div><label className="etiqueta" htmlFor="pr-s">Subgrupo</label><select id="pr-s" className="campo" value={f.subgrupo} onChange={(e) => set({ subgrupo: e.target.value })}><option value="">Sin subgrupo</option>{(g?.subgrupos || []).map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className="etiqueta" htmlFor="pr-m">Stock mínimo</label><input id="pr-m" className="campo num text-right" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(decimalInput(e.target.value))} /></div>
              <div><label className="etiqueta" htmlFor="pr-ci">Cuenta inventario</label><input id="pr-ci" className="campo text-tenue" value={CUENTA_INVENTARIO_FIJA} readOnly disabled title="Única cuenta de inventario permitida" /></div>
              <div className="sm:col-span-2"><label className="etiqueta" htmlFor="pr-cc">Cuenta de gasto/consumo</label>
                <select id="pr-cc" className="campo" value={f.cuentaCosto} onChange={(e) => set({ cuentaCosto: e.target.value })}><option value="">Selecciona una cuenta de gasto…</option>{c.apoyo.cuentasGasto.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}</select></div>
              {([['aplicaIVA', 'Afecto a IVA'], ['manejaLotes', 'Maneja lote y vencimiento'], ['inventariable', 'Inventariable'], ['activo', 'Producto activo']] as [keyof FormProducto, string][]).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!f[k]} disabled={k === 'manejaLotes' && bloqueado} onChange={(e) => set({ [k]: e.target.checked })} />{l}{k === 'manejaLotes' && bloqueado && <span className="text-[10px] text-tenue">(tiene movimientos)</span>}</label>
              ))}
            </div>
            {(flotante ? error : c.msg.error) && <Mensaje error={flotante ? error : c.msg.error} />}
            <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={onCerrar}>Cancelar</button>
              <button type="button" className="boton" disabled={c.pendiente} onClick={guardar}>{c.pendiente ? 'Guardando…' : flotante ? 'Crear y usar en la línea' : 'Guardar'}</button></div>
    </Modal>
  );
}
