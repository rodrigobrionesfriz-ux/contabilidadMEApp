import { describe, it, expect } from 'vitest';
import { primerosPasos, avancePasos, type DatosPasos } from '../primeros-pasos';

const nueva: DatosPasos = { regimen: '14D3', representante: null, tasaPpm: null, cuentas: 180, centros: 0, apertura: false, importado: false, ufMesAnterior: false, auxiliares: 0, trabajadores: 0, parametrosRem: false, miembros: 1, marcas: {} };

describe('primeros pasos', () => {
  it('empresa recién creada: todo pendiente, en orden', () => {
    const p = primerosPasos(nueva);
    expect(p.map((x) => [x.n, x.id, x.estado])).toEqual([[1, 'datos', 'pendiente'], [2, 'plan', 'pendiente'], [3, 'centros', 'pendiente'], [4, 'apertura', 'pendiente'], [5, 'indicadores', 'pendiente'], [6, 'auxiliares', 'pendiente'], [7, 'remuneraciones', 'pendiente'], [8, 'usuarios', 'pendiente']]);
    expect(p[0].nota).toContain('falta: giro, domicilio, comuna, representante legal, RUT del representante');
    expect(p[3].detalle).toContain('contabilidad completa');
    expect(avancePasos(p)).toEqual({ hechos: 0, total: 8, completo: false, faltanObligatorios: 4 });
  });
  it('detecta lo hecho y respeta las marcas', () => {
    const p = primerosPasos({ ...nueva, centros: 3, apertura: true, ufMesAnterior: true, marcas: { datos: 'listo', plan: 'listo', auxiliares: 'omitido', remuneraciones: 'omitido', usuarios: 'omitido' } });
    expect(p.every((x) => x.estado !== 'pendiente')).toBe(true);
    expect(p.find((x) => x.id === 'auxiliares')!.estado).toBe('omitido');
    expect(avancePasos(p).completo).toBe(true);
  });
  it('la ficha completa deja listo el paso 1', () => {
    const p = primerosPasos({ ...nueva, representante: 'Rodrigo Briones', ficha: { giro: 'Forestal', domicilio: 'Pedro de Oña 299', comuna: 'Angol', rut_representante: '15488555-2' } });
    expect(p[0]).toMatchObject({ estado: 'listo', auto: true });
    expect(p[0].nota).not.toContain('falta');
  });
});
