import 'server-only';
import { contextoFiniquitos, indicadoresMes, plantillasFiniquito, empresaParaDocumentos } from '@/lib/datos/remuneraciones';
import { plantillasDisponibles } from '@/remuneraciones/finiquito';

/** Datos del formulario de finiquito (cálculo en vivo en el navegador; el servidor recalcula al guardar). */
export async function datosFormulario(empresaId: string, fechaTermino: string) {
  const anio = +fechaTermino.slice(0, 4), mes = +fechaTermino.slice(5, 7);
  const [{ ctx, trabajadores, feriados }, guardadas, empresa] = await Promise.all([contextoFiniquitos(empresaId, anio), plantillasFiniquito(empresaId), empresaParaDocumentos(empresaId)]);
  const ind = indicadoresMes(ctx.P, anio, mes);
  return { ctx, trabajadores, feriados, utm: ind.utm, uf: ind.uf, plantillas: plantillasDisponibles(guardadas), empresa };
}
