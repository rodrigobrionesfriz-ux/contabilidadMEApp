'use client';

import { useState, useTransition } from 'react';
import { Mensaje } from '@/components/form-estado';
import { datosExportacion } from './acciones';

export function Exportar({ empresaId, anios }: { empresaId: string; anios: number[] }) {
  const [anio, setAnio] = useState(anios[0]);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const exportar = () => iniciar(async () => {
    setMsg({});
    const r = await datosExportacion(empresaId, anio);
    if (!r.ok) { setMsg({ error: r.error }); return; }
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const h of r.hojas) {
      const ws = XLSX.utils.aoa_to_sheet(h.filas);
      ws['!cols'] = (h.filas[1] || h.filas[0] || []).map((_, i) => ({ wch: Math.min(48, Math.max(10, ...h.filas.slice(0, 200).map((f) => String(f[i] ?? '').length + 2))) }));
      XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
    }
    XLSX.writeFile(wb, r.nombre);
    setMsg({ ok: `Archivo ${r.nombre} generado con ${r.hojas.length} hojas.` });
  });
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div><label className="etiqueta" htmlFor="ex-anio">Año</label><select id="ex-anio" className="campo w-28" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{anios.map((y) => <option key={y}>{y}</option>)}</select></div>
        <button type="button" className="boton" disabled={pendiente} onClick={exportar}>{pendiente ? 'Preparando…' : '📊 Exportar a Excel'}</button>
      </div>
      <Mensaje {...msg} />
    </div>
  );
}
