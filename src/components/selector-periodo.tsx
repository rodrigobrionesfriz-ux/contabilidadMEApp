import { MESES } from '@/lib/formato';

/** Selector GET de año y mes (sin JS): mantiene los demás parámetros ocultos. */
export function SelectorPeriodo({ anio, mes, etiquetaMes = 'Hasta', extra = {}, conAnioCompleto = true }: {
  anio: number; mes: number; etiquetaMes?: string; extra?: Record<string, string>; conAnioCompleto?: boolean;
}) {
  const actual = new Date().getFullYear();
  const anios = Array.from({ length: 8 }, (_, i) => actual + 1 - i);
  return (
    <form className="flex flex-wrap items-end gap-2">
      {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <div>
        <label className="etiqueta" htmlFor="anio">Año</label>
        <select id="anio" name="anio" defaultValue={anio} className="campo w-28">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label className="etiqueta" htmlFor="mes">{etiquetaMes}</label>
        <select id="mes" name="mes" defaultValue={mes || ''} className="campo w-40">
          {conAnioCompleto && <option value="">Año completo</option>}
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <button className="boton-sec" type="submit">Ver</button>
    </form>
  );
}
