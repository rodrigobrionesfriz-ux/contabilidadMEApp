import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { leerRespaldo, unirTrozos } from '../leer-excel';

describe('celdas largas repartidas en columnas de continuación', () => {
  it('une los trozos en orden y deja intactas las filas normales', () => {
    expect(unirTrozos([{ id: 1, asientoJSON: 'ab', asientoJSON__3: 'ef', asientoJSON__2: 'cd' }, { id: 2, asientoJSON: 'x', asientoJSON__2: '' }]))
      .toEqual([{ id: 1, asientoJSON: 'abcdef' }, { id: 2, asientoJSON: 'x' }]);
  });
  it('reconstruye un asiento de más de 32.767 caracteres leído desde .xlsx', () => {
    const movs = Array.from({ length: 900 }, (_, i) => ({ cuenta: '1101201', debe: i, haber: 0, glosa: `línea ${i}` }));
    const json = JSON.stringify({ id: 'a1', n: 1, fecha: '2026-01-31', movs });
    const t = [json.slice(0, 32000), json.slice(32000, 64000)];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Año', 2026]]), 'Empresa');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['id', 'n', 'asientoJSON', 'asientoJSON__2'], ['a1', 1, t[0], t[1]]]), 'Asientos');
    const h = leerRespaldo(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
    expect(JSON.parse(String(h.Asientos![0].asientoJSON)).movs).toHaveLength(900);
  });
});
