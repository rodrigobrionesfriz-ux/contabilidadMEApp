import { describe, it, expect } from 'vitest';
import { traerTodo } from '../paginar';

describe('traerTodo', () => {
  it('junta todas las páginas', async () => {
    const datos = Array.from({ length: 2345 }, (_, i) => i);
    const r = await traerTodo(async (d, h) => ({ data: datos.slice(d, h + 1), error: null }));
    expect(r).toEqual(datos);
  });
  it('propaga errores', async () => {
    await expect(traerTodo(async () => ({ data: null, error: { message: 'falló' } }))).rejects.toThrow('falló');
  });
});
