import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { textoDocx } from '../leer-texto';
import { limpiarTexto } from '@/remuneraciones/finiquito';

describe('lectura de plantillas Word', () => {
  it('extrae párrafos, saltos y entidades de un .docx', async () => {
    const b = readFileSync(new URL('./plantilla.docx', import.meta.url));
    const t = limpiarTexto(await textoDocx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    expect(t).toBe('FINIQUITO\n\nEntre {{empresa}} y Ñuñoa & Cía.\nsegunda línea');
  });
});
