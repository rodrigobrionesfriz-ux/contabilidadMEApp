'use client';

import { HDR_DETALLE } from '@/herramientas/imposiciones';

type Celda = string | number | { t: string; v: number; f?: string; z: string };
export function ExcelImposiciones({ hojas, nombre }: { hojas: { resumen: Celda[][]; detalle: Celda[][] }; nombre: string }) {
  const exportar = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(hojas.resumen as never);
    ws1['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 46 }, { wch: 12 }, { wch: 13 }, { wch: 16 }];
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por institución');
    const ws2 = XLSX.utils.aoa_to_sheet(hojas.detalle as never);
    ws2['!cols'] = HDR_DETALLE.map((h, i) => ({ wch: i === 1 ? 30 : Math.max(11, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle por trabajador');
    XLSX.writeFile(wb, nombre);
  };
  return <button type="button" className="boton" onClick={exportar}>📊 Excel de imposiciones</button>;
}
