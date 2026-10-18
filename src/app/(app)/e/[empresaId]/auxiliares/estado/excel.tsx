'use client';

export function ExcelEstado({ nombre, empresa, aux, hasta, items, cartola }: { nombre: string; empresa: string; aux: string; hasta: string; items: (string | number)[][]; cartola: (string | number)[][] }) {
  const exportar = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const a = XLSX.utils.aoa_to_sheet([['ESTADO DE CUENTA'], [empresa], [aux], [`Al ${hasta}`], [], ['DOCUMENTO', 'EMISIÓN', 'VENCE', 'CARGO', 'ABONOS', 'SALDO'], ...items]);
    a['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, a, 'Pendientes');
    const b = XLSX.utils.aoa_to_sheet([['FECHA', 'COMPROBANTE', 'DETALLE', 'CARGOS', 'ABONOS', 'SALDO'], ...cartola]);
    b['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, b, 'Movimientos');
    XLSX.writeFile(wb, nombre);
  };
  return <button type="button" className="boton-sec" onClick={exportar}>📊 Excel</button>;
}
