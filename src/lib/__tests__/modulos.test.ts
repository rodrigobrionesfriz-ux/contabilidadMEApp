import { describe, it, expect } from 'vitest';
import { MODULOS, moduloDeRuta, permisoDe } from '../modulos';

describe('módulos de los perfiles de acceso', () => {
  it('cada sección pertenece a un solo módulo', () => {
    const todas = MODULOS.flatMap((m) => m.secciones);
    expect(new Set(todas).size).toBe(todas.length);
  });
  it('ruta → módulo', () => {
    expect(moduloDeRuta('/e/abc/rcv')).toBe('documentos');
    expect(moduloDeRuta('/e/abc/remuneraciones/liquidacion/x')).toBe('remuneraciones');
    expect(moduloDeRuta('/v/abc/diario')).toBe('reportes');
    expect(moduloDeRuta('/e/abc')).toBeNull();
    expect(moduloDeRuta('/e/abc/primeros-pasos')).toBeNull();
    expect(moduloDeRuta('/empresas')).toBeNull();
  });
  it('permiso efectivo', () => {
    expect(permisoDe({ admin: true, permisos: {} }, 'cierre')).toBe('editar');
    expect(permisoDe({ admin: false, permisos: { cierre: 'ver' } }, 'cierre')).toBe('ver');
    expect(permisoDe({ admin: false, permisos: {} }, 'cierre')).toBe('no');
    expect(permisoDe({ admin: false, permisos: {} }, null)).toBe('editar');
  });
});
