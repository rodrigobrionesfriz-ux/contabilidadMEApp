import { describe, it, expect } from 'vitest';
import { indicadoresDesdeAPI, datosAPIValidos } from '../indicadores-api';

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

  it('valida lo que llega del navegador', () => {
    expect(datosAPIValidos(2026, [{ periodo: '2026-09', uf: 41100.5, utm: null }])).toEqual([{ periodo: '2026-09', uf: 41100.5, utm: null }]);
    expect(datosAPIValidos(2026, [{ periodo: '2025-09', uf: 41100.5 }])).toBeNull();
    expect(datosAPIValidos(2026, [{ periodo: '2026-09', uf: 4110050 }])).toBeNull();
    expect(datosAPIValidos(2026, 'x')).toBeNull();
  });
});

import { serieUFdeSII, serieUTMdeSII } from '../indicadores-api';
describe('UF y UTM desde sii.cl', () => {
  const td = (x: string) => `<td><div align="right">${x}</div></td>`;
  const fila = (dia: number, vals: string[]) => `<tr><th><strong>${dia}</strong></th>${vals.map(td).join('')}</tr>`;
  const vacio = Array(12).fill('&nbsp;');
  const conMes = (m: number, v: string) => vacio.map((x, i) => (i === m ? v : x));
  const html = `<table><tr><th>Septiembre</th></tr><tr><td><strong>30</strong></td><td>41.057,20</td></tr></table>
    <table><tr><th>D&iacute;a</th><th>Ene</th><th>Feb</th><th>Mar</th><th>Abr</th><th>May</th><th>Jun</th><th>Jul</th><th>Ago</th><th>Sep</th><th>Oct</th><th>Nov</th><th>Dic</th></tr>
    ${fila(29, conMes(1, ''))}${fila(30, conMes(8, '41.057,20'))}${fila(31, conMes(9, '41.247,63'))}</table>`;
  it('lee la tabla resumen Día × Mes', () => {
    expect(serieUFdeSII(2026, html).serie).toHaveLength(2);
    const s = serieUFdeSII(2026, html.replace('D&iacute;a', 'Día'));
    expect(s.serie).toEqual([{ fecha: '2026-09-30', valor: 41057.2 }, { fecha: '2026-10-31', valor: 41247.63 }]);
    expect(indicadoresDesdeAPI(2026, s, {}).map((x) => [x.periodo, x.uf])).toEqual([['2026-09', 41057.2], ['2026-10', 41247.63]]);
  });
  it('lee la UTM por mes', () => {
    const h = `<table><tr><th>2026</th><th>UTM (1)</th></tr><tr><td>Septiembre</td><td>71.721</td><td>860.652</td><td>113,59</td></tr><tr><td>Octubre</td><td>72.151</td><td>865.812</td></tr><tr><td>Diciembre</td><td></td></tr></table>`;
    expect(serieUTMdeSII(2026, h).serie).toEqual([{ fecha: '2026-09-01', valor: 71721 }, { fecha: '2026-10-01', valor: 72151 }]);
  });
});
