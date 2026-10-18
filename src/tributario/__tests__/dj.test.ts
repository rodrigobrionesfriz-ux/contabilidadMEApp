import { describe, it, expect } from 'vitest';
import { DJ_SEMILLA, aplicaA, plazoLbl, fechaLbl, fechaVence, diasParaVencer, validarDJ, resumenHonorarios, resumenSueldos, resumenBalance, filasExcelDJ } from '../dj';

describe('declaraciones juradas', () => {
  it('filtra por régimen como el sistema actual', () => {
    expect(DJ_SEMILLA.filter((d) => aplicaA(d, '14D3')).map((d) => d.n)).toEqual(['1887', '1879', '1948']);
    expect(DJ_SEMILLA.filter((d) => aplicaA(d, '14A')).map((d) => d.n)).toEqual(['1887', '1879', '1847', '1926', '1948']);
    expect(DJ_SEMILLA.filter((d) => aplicaA(d, '34AGRI')).map((d) => d.n)).toEqual(['1887', '1879', '1943', '1949']);
  });
  it('arma plazos y semáforo (vence a las 23:59 del día)', () => {
    const d = DJ_SEMILLA[0];
    expect(fechaLbl(d, 2027)).toBe('27 de marzo de 2027');
    expect(plazoLbl(DJ_SEMILLA[4], 2027)).toBe('16, 24 o 27 de marzo según el tipo de propietario');
    expect(fechaVence(d, 2027)).toBe('2027-03-27');
    expect(diasParaVencer(d, 2027, '2027-03-27')).toBe(1);
    expect(diasParaVencer(d, 2027, '2027-03-26')).toBe(2);
    expect(diasParaVencer(d, 2027, '2027-03-28')).toBe(0);
    expect(diasParaVencer(d, 2027, '2027-03-29')).toBe(-1);
  });
  it('valida el editor del catálogo', () => {
    expect(validarDJ({ n: '' }, DJ_SEMILLA, null)).toEqual({ error: 'Indica el número del formulario' });
    expect(validarDJ({ n: '1887', nm: 'X' }, DJ_SEMILLA, null)).toEqual({ error: 'Ya existe la declaración N°1887 en el catálogo' });
    expect(validarDJ({ n: '1999', nm: 'X', plazo: '3-27' }, DJ_SEMILLA, null)).toEqual({ error: 'El plazo va como mes-día, por ejemplo 03-27' });
    const ok = validarDJ({ n: ' 1999 ', nm: 'Nueva', plazo: '04-30', regimenes: ['14D3', 'XX'], fuente: 'nada' }, DJ_SEMILLA, null);
    expect(ok).toMatchObject({ dj: { n: '1999', regimenes: ['14D3'], fuente: '', propia: true } });
    expect(validarDJ({ n: '1887', nm: 'Sueldos' }, DJ_SEMILLA, '1887')).toMatchObject({ dj: { propia: false } });
  });
  it('resume honorarios, sueldos y balance', () => {
    expect(resumenHonorarios([], 0.1525)).toBeNull();
    const h = resumenHonorarios([{ bruto: 1000000, rut: '1-9' }, { bruto: 500000, rut: '1-9' }, { bruto: 200000, rut: '2-7' }], 0.1525)!;
    expect(h.lineas).toEqual([['Boletas del ejercicio', '3'], ['Personas distintas', '2'], ['Total bruto', '$1.700.000'], ['Retención (15,25%)', '$259.250']]);
    const s = resumenSueldos([{ lineas: [1, 2], totales: { totalHaberes: 900000, iusc: 1000 } }, { lineas: [1, 2, 3], totales: { totalHaberes: 1200000, iusc: 2000 } }, { lineas: [], totales: {} }])!;
    expect(s.lineas[0]).toEqual(['Meses con remuneraciones', '2']);
    expect(s.lineas[1]).toEqual(['Trabajadores (máximo del año)', '3']);
    expect(resumenBalance([{ cuenta: '1101201', debe: 100, haber: 40 }, { cuenta: '2301001', debe: 0, haber: 60 }, { cuenta: '1101', debe: 5, haber: 0 }])!.lineas[0]).toEqual(['Cuentas con movimiento', '2']);
  });
  it('arma el Excel de control', () => {
    const f = filasExcelDJ(DJ_SEMILLA.slice(0, 2), { 1887: { estado: 'presentada', fecha: '2027-03-20', folio: '123', obs: '' } }, 2027, { nombre: 'X', rut: '1-9', anio: 2026, regimenLbl: '14 D N°3' }, '14D3');
    expect(f[6]).toEqual(['1887', 'Rentas del Art. 42 N°1 (sueldos)', 'Sí', '27 de marzo de 2027', 'Presentada', '2027-03-20', '123', '']);
  });
});
