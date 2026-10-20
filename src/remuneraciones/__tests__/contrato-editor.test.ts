import { describe, it, expect } from 'vitest';
import { segmentos, unirSegmentos, nombreDato, cambioTexto } from '../contrato-editor';
import { PLANTILLAS_CONTRATO_TIPO } from '../contrato-trabajo';

describe('editor visual del contrato', () => {
  it('divide en texto y datos, y vuelve a armar el mismo texto', () => {
    const t = 'En {{ciudad}}, a {{fecha_contrato}}, entre {{empresa}} y {{ Trabajador }}.\n\nSueldo: {{sueldo_base}}';
    const s = segmentos(t);
    expect(s.filter((x) => x.tipo === 'dato').map((x) => (x as { k: string }).k)).toEqual(['ciudad', 'fecha_contrato', 'empresa', 'trabajador', 'sueldo_base']);
    expect(unirSegmentos(s)).toBe('En {{ciudad}}, a {{fecha_contrato}}, entre {{empresa}} y {{trabajador}}.\n\nSueldo: {{sueldo_base}}');
  });

  it('las plantillas tipo se recorren sin perder nada', () => {
    for (const p of PLANTILLAS_CONTRATO_TIPO) expect(unirSegmentos(segmentos(p.texto))).toBe(p.texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => `{{${k.toLowerCase()}}}`));
  });

  it('un marcador desconocido queda como texto', () => {
    expect(segmentos('Hola {{xyz}} y {{cargo}}')).toEqual([{ tipo: 'texto', v: 'Hola {{xyz}} y ' }, { tipo: 'dato', k: 'cargo' }]);
  });

  it('nombres y detección de cambios', () => {
    expect(nombreDato('sueldo_base')).toBe('Sueldo base');
    expect(cambioTexto('Hola  \nchao\n', 'Hola\nchao')).toBe(false);
    expect(cambioTexto('Hola chao', 'Hola\nchao')).toBe(true);
  });
});
