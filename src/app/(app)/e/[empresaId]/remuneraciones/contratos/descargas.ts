// Descargas de archivos en el navegador (ANSI para la DT, Word para contratos)
import { aWindows1252 } from '@/remuneraciones/lre';

export function descargarAnsi(texto: string, nombre: string, tipo = 'text/csv') {
  const blob = new Blob([aWindows1252(texto)], { type: `${tipo};charset=windows-1252` });
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export const slug = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
