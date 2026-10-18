'use client';

import { xmlIECV, aLatin1, type DocIECV, type TipoOperacion } from '@/herramientas/iecv';
import { registrarIECV } from './acciones';

export function DescargarIECV({ empresaId, tipo, periodo, rut, docs }: { empresaId: string; tipo: TipoOperacion; periodo: string; rut: string; docs: DocIECV[] }) {
  const descargar = () => {
    const xml = xmlIECV(tipo, periodo, rut, docs);
    const blob = new Blob([aLatin1(xml)], { type: 'application/xml;charset=ISO-8859-1' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `IECV_${tipo}_${periodo}.xml`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    void registrarIECV(empresaId, tipo, periodo, docs.length);
  };
  return <button type="button" className="boton" onClick={descargar}>📥 Descargar XML IECV</button>;
}
