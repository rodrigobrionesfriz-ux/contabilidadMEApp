import { describe, it, expect } from 'vitest';
import { indicadoresDesdeAPI } from '../indicadores-api';

describe('UF y UTM desde mindicador.cl', () => {
  it('toma la UF del último día de cada mes y la UTM del mes', () => {
    const uf = { serie: [
      { fecha: '2026-10-31T03:00:00.000Z', valor: 41247.634 }, { fecha: '2026-10-30T03:00:00.000Z', valor: 41240 },
      { fecha: '2026-09-30T03:00:00.000Z', valor: 41100.5 }, { fecha: '2026-02-28T03:00:00.000Z', valor: 39800.1 },
      { fecha: '2026-11-09T03:00:00.000Z', valor: 41295.46 },
    ] };
    const utm = { serie: [{ fecha: '2026-10-01T03:00:00.000Z', valor: 72151 }, { fecha: '2026-11-01T03:00:00.000Z', valor: 72300 }, { fecha: '2026-09-01T04:00:00.000Z', valor: 71721 }] };
    expect(indicadoresDesdeAPI(2026, uf, utm)).toEqual([
      { periodo: '2026-02', uf: 39800.1, utm: null },
      { periodo: '2026-09', uf: 41100.5, utm: 71721 },
      { periodo: '2026-10', uf: 41247.63, utm: 72151 },
      { periodo: '2026-11', uf: null, utm: 72300 },
    ]);
  });
  it('sin datos no devuelve nada', () => expect(indicadoresDesdeAPI(2026, {}, {})).toEqual([]));
});
