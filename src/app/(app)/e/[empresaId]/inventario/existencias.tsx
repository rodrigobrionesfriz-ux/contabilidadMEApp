'use client';

import { useState } from 'react';
import { Badge, OpcionesBodega, Vacio, fechaCorta, fmt, mon, nombreBodega, nombreProducto, type Ctx } from './comun';

const diasHasta = (hoy: string, f: string) => Math.ceil((Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))) / 86400000);

export function Existencias({ c }: { c: Ctx }) {
  const [q, setQ] = useState('');
  const [bodega, setBodega] = useState('');
  const grupo = (id: string | null) => c.datos.grupos.find((g) => g.id === id)?.nombre || '–';
  let filas = c.calc.stock.filter((s) => Math.abs(s.cantidad) > 1e-6 || Math.abs(s.valor) > 1e-6);
  if (bodega) filas = filas.filter((s) => s.bodegaId === bodega);
  if (q) { const t = q.toLowerCase(); filas = filas.filter((s) => nombreProducto(c, s.productoId).toLowerCase().includes(t) || nombreBodega(c, s.bodegaId).toLowerCase().includes(t)); }
  const total = filas.reduce((s, x) => s + x.valor, 0);
  let lotes = c.calc.lotes.filter((l) => Math.abs(l.cantidad) > 1e-6);
  if (bodega) lotes = lotes.filter((l) => l.bodegaId === bodega);
  const exportar = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['CÓDIGO', 'PRODUCTO', 'GRUPO', 'SUBGRUPO', 'BODEGA', 'CANTIDAD', 'U.M.', 'PPP', 'VALOR'], ...filas.map((s) => {
      const p = c.datos.productos.find((x) => x.id === s.productoId);
      return [p?.codigo || '', p?.descripcion || s.productoId, grupo(p?.grupoId ?? null), p?.subgrupo || '', nombreBodega(c, s.bodegaId), s.cantidad, p?.unidad || '', Math.round(s.costoPromedio), Math.round(s.valor)];
    })]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Existencias');
    XLSX.writeFile(wb, `existencias_${c.hoy}.xlsx`);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" />
        <select className="campo max-w-xs" value={bodega} onChange={(e) => setBodega(e.target.value)} aria-label="Bodega"><OpcionesBodega c={c} todas /></select>
        <span className="flex-1" />
        <button type="button" className="boton-sec" onClick={exportar}>📊 Exportar</button>
      </div>
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[820px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="p-2">Código</th><th>Producto</th><th>Grupo / subgrupo</th><th>Bodega</th><th className="text-right">Cantidad</th><th>U.M.</th><th className="text-right">PPP</th><th className="text-right">Valor</th><th className="px-2">Estado</th></tr></thead>
        <tbody>{filas.length ? filas.map((s) => {
          const p = c.datos.productos.find((x) => x.id === s.productoId);
          const bajo = p && p.stockMinimo > 0 && s.cantidad < p.stockMinimo;
          return (
            <tr key={s.key} className={`border-b border-borde/30 ${s.cantidad < 0 ? 'bg-peligro/10' : ''}`}>
              <td className="num p-2">{p?.codigo}</td><td className="font-medium">{p?.descripcion || s.productoId} {p?.manejaLotes && <Badge tono="info">LOTES</Badge>}</td>
              <td>{grupo(p?.grupoId ?? null)} <span className="text-tenue">{p?.subgrupo}</span></td><td>{nombreBodega(c, s.bodegaId)}</td>
              <td className="num text-right font-semibold">{fmt(s.cantidad)}</td><td>{p?.unidad}</td><td className="num text-right">{mon(s.costoPromedio)}</td><td className="num text-right font-semibold">{mon(s.valor)}</td>
              <td className="px-2">{s.cantidad < 0 ? <Badge tono="mal">NEGATIVO</Badge> : bajo ? <Badge tono="aviso">BAJO MÍNIMO</Badge> : <Badge>OK</Badge>}</td>
            </tr>
          );
        }) : <Vacio cols={9}>No hay existencias para mostrar.</Vacio>}</tbody>
        <tfoot><tr className="border-t border-borde font-semibold"><td colSpan={7} className="p-2">VALOR FILTRADO</td><td className="num text-right">{mon(total)}</td><td /></tr></tfoot>
      </table></div>
      {lotes.length > 0 && (
        <div className="tarjeta overflow-x-auto p-3">
          <h2 className="mb-2 text-sm font-semibold">Trazabilidad por lote</h2>
          <table className="w-full min-w-[700px] text-xs">
            <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Producto</th><th>Bodega</th><th>Lote</th><th>Vencimiento</th><th className="text-right">Cantidad</th><th className="text-right">Costo</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{lotes.map((l) => {
              const dias = l.fechaVencimiento ? diasHasta(c.hoy, l.fechaVencimiento) : null;
              return (
                <tr key={l.key} className="border-b border-borde/30"><td className="py-1">{nombreProducto(c, l.productoId)}</td><td>{nombreBodega(c, l.bodegaId)}</td><td className="num font-semibold">{l.lote}</td>
                  <td>{fechaCorta(l.fechaVencimiento)} {dias !== null && dias <= 60 && <Badge tono={dias < 0 ? 'mal' : 'aviso'}>{dias < 0 ? 'Vencido' : `${dias} días`}</Badge>}</td>
                  <td className="num text-right">{fmt(l.cantidad)}</td><td className="num text-right">{mon(l.costoPromedio)}</td><td className="num text-right">{mon(l.valor)}</td></tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
