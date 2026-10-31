import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';
import { extrasDesdeDatos } from '@/importador/datos-extra';

const ADMIN = '11111111-1111-1111-1111-111111111111';

// Datos con la forma que guarda el sistema anterior (hoja "Datos" del respaldo V2.22.13)
const datos = new Map<string, string>(Object.entries({
  empresa: JSON.stringify({ nombre: 'Pipa Gourmet SpA', giro: 'Cafetería', domicilio: 'Prat 123', rep: 'Rodrigo Briones', rutrep: '15488555-2', regimen: '14D8', tasaRenta: 12.5,
    tasaPPM: 0.125, previsional: { patronal: { mutual: 0.93 } }, feriados: { extra: ['2026-06-21'], quitar: [] }, contratoDT: { comunaCelebracion: 'Angol' } }),
  trabajadores: JSON.stringify([
    { id: 't_1', nombre: 'María Soto', rut: '11.111.111-1', cargo: 'Cocinera', base: 600000, afp: 'modelo', salud: 'fonasa', lre: { fechaInicio: '2025-01-02' },
      anticipos: [{ id: 'a1', fecha: '2026-03-10', monto: 50000, mesDesc: '2026-03' }, { id: 'a0', fecha: '2025-12-10', monto: 30000, mesDesc: '2025-12' }] },
    { id: 't_2', nombre: 'Juan Pérez', rut: '22222222-2', cargo: 'Garzón', base: 550000 },
  ]),
  asistencia: JSON.stringify({ eventos: [{ id: 'e1', trab: 't_1', tipo: 'vacaciones', desde: '2026-02-02', hasta: '2026-02-06' }, { id: 'e2', trab: 't_2', tipo: 'licencia', licTipo: '1', desde: '2025-05-01', hasta: '2025-05-03' }],
    horas: { '2026-03': { t_2: 12 } } }),
  libroRem: JSON.stringify({ '2026-03': { periodo: '2026-03', uf: 39000.55, utm: 69000, lineas: [{ id: 't_1', liquido: 500000 }, { id: 't_2', liquido: 450000 }], totales: { liquido: 950000 }, cerradoEl: '2026-04-01T12:00:00Z' } }),
  finiquitos: JSON.stringify({ items: [{ id: 'fin1', trab: 't_2', fechaTermino: '2026-09-30', causal: '161', estado: 'borrador', calc: { total: 800000 } }], plantillas: [{ id: 'fpl_1', nombre: 'Mutuo acuerdo', causal: '159-1', texto: 'Texto' }] }),
  contratosTrab: JSON.stringify({ items: { t_1: { plantillaId: 'indefinido', texto: '' } }, plantillas: [{ id: 'cpl_1', nombre: 'Cocina', cargos: 'Cocinera', tipoContrato: 1, texto: 'Contrato {{cargo}}' }] }),
  fichasAux: JSON.stringify({ cliente: { '81389900': { rutCodigo: '81389900', rutDV: '0', razonSocial: 'SOFO', cuentaDefault: '4101002', ccDefault: 'cc_x' } },
    proveedor: { '96689310': { rutCodigo: '96689310', rutDV: '9', razonSocial: 'Transbank S.A.', cuentaDefault: '9999999' } } }),
  comprobantesTipo: JSON.stringify([{ id: 'ct_1', nombre: 'Arriendo', glosa: 'Arriendo local', guardaMontos: true, lineas: [{ cd: '1101201', debe: 0, haber: 100, cc: '' }, { cd: '2102001', debe: 100, haber: 0, cc: '' }] }]),
  'renta-2026': JSON.stringify({ regimen: '14D8', notas: 'ok' }),
  'dj_estado-2027': JSON.stringify({ 1887: { estado: 'presentada' } }),
  activos: JSON.stringify([{ id: 'af1', desc: 'Cafetera', cat: 'maquinarias', fecha: '2026-02-01', valor: 2000000, residual: 1, vida: 15 }]),
  'inv-grupos': JSON.stringify([{ id: 'g1', nombre: 'Café', subgrupos: [], activo: true }]),
  'inv-bodegas': JSON.stringify([{ id: 'b1', codigo: 'B1', nombre: 'Local', direccion: '', activo: true }]),
  'inv-productos': JSON.stringify([{ id: 'p1', codigo: 'CAF1', ean: '', descripcion: 'Café grano', tipo: 'MERCADERÍA', unidad: 'KG', grupoId: 'g1', subgrupo: '', stockMinimo: 0,
    cuentaInventario: '1109007', cuentaCosto: '3101001', aplicaIVA: true, manejaLotes: false, inventariable: true, activo: true }]),
  'inv-movimientos': JSON.stringify([{ id: 'm1', folio: 'ENT-000001', tipo: 'ENTRADA', fecha: '2026-03-01', motivo: 'Compra', bodegaOrigenId: null, bodegaDestinoId: 'b1', tercero: '', documentoTipo: 'SIN DOCUMENTO',
    documentoNumero: '', documento: '', proveedorRut: '', proveedorNombre: '', ordenCompraId: null, recepcionId: null, tomaId: null, centroCosto: '', observaciones: '',
    lineas: [{ productoId: 'p1', cantidad: 10, costoUnitario: 5000 }], estado: 'VIGENTE', creado: '2026-03-01T10:00:00Z', creadoPor: 'r' }]),
}));

describe('importar el resto de los datos del sistema anterior', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  const uno = async <T,>(sql: string) => (await b.como<T>(ADMIN, sql, [emp]))[0];

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('78238896-7', 'Pipa Gourmet SpA') id`))[0].id;
  });

  it('carga remuneraciones, configuración, fichas, renta, DJ, activo fijo e inventario', async () => {
    const x = extrasDesdeDatos(datos, 2026, new Map());
    expect(x.anticipos).toHaveLength(1); // sólo el del año
    expect(x.eventos).toHaveLength(1);
    const [{ r }] = await b.como<{ r: Record<string, unknown> }>(ADMIN, `select importar_datos($1, 2026, $2) r`, [emp, j({ ...x, inventario: null })]);
    expect(r).toMatchObject({ trabajadores: 2, anticipos: 1, eventos: 1, horas: 1, libros: 1, libros_omitidos: [], finiquitos: 1, contratos: 1, plantillas: 2, fichas: 2,
      comprobantes_tipo: 1, renta: 1, dj: 1, activos: 1 });

    expect(await uno(`select giro, representante, rut_representante, regimen, tasa_renta::float from empresas where id=$1`))
      .toEqual({ giro: 'Cafetería', representante: 'Rodrigo Briones', rut_representante: '15488555-2', regimen: '14D8', tasa_renta: 12.5 });
    expect(await uno(`select previsional, feriados from empresa_parametros where empresa_id=$1`)).toEqual({ previsional: { patronal: { mutual: 0.93 } }, feriados: { extra: ['2026-06-21'], quitar: [] } });
    const maria = await uno<{ id: string; ficha: Record<string, unknown> }>(`select id, ficha from trabajadores where empresa_id=$1 and rut='11111111-1'`);
    expect(maria.ficha).toMatchObject({ cargo: 'Cocinera', base: 600000, lre: { fechaInicio: '2025-01-02' } });
    expect(maria.ficha.anticipos).toBeUndefined();
    const libro = await uno<{ lineas: { id: string }[]; uf: string }>(`select lineas, uf from libros_remuneraciones where empresa_id=$1 and periodo='2026-03'`);
    expect(libro.lineas[0].id).toBe(maria.id); // el id del trabajador se reemplaza por el nuevo
    expect(await uno(`select uf::float from indicadores where periodo='2026-03' and $1::uuid is not null`)).toEqual({ uf: 39000.55 });
    expect(await uno(`select count(*)::int n from rem_anticipos where empresa_id=$1 and mes_desc='2026-03' and monto=50000`)).toEqual({ n: 1 });
    expect(await uno(`select cuenta, centro_costo from auxiliares where empresa_id=$1 and rut='96689310-9'`)).toEqual({ cuenta: null, centro_costo: null }); // cuenta inexistente
    expect(await uno(`select cuenta from auxiliares where empresa_id=$1 and rut='81389900-0'`)).toEqual({ cuenta: '4101002' });
    const fin = await uno<{ datos: { trab: string }; total: string }>(`select datos, total from finiquitos where empresa_id=$1`);
    expect(fin.datos.trab).not.toBe('t_2');
    expect(Number(fin.total)).toBe(800000);

    // Volver a importar no duplica nada
    await b.como(ADMIN, `select importar_datos($1, 2026, $2)`, [emp, j({ ...x, inventario: null })]);
    expect(await uno(`select (select count(*) from trabajadores where empresa_id=$1)::int t, (select count(*) from rem_anticipos where empresa_id=$1)::int a,
      (select count(*) from comprobantes_tipo where empresa_id=$1)::int c, (select count(*) from activos_fijos where empresa_id=$1)::int f, (select count(*) from finiquitos where empresa_id=$1)::int fi`))
      .toEqual({ t: 2, a: 1, c: 1, f: 1, fi: 1 });

    // Inventario con ids nuevos y referencias reemplazadas
    await b.como(ADMIN, `select inv_aplicar($1, null, $2)`, [emp, j(x.inventario!.ops)]);
    const prod = await uno<{ id: string; grupo_id: string }>(`select id, grupo_id from inv_productos where empresa_id=$1`);
    const grupo = await uno<{ id: string }>(`select id from inv_grupos where empresa_id=$1`);
    expect(prod.grupo_id).toBe(grupo.id);
    const mov = await uno<{ lineas: { productoId: string }[]; bodega_destino_id: string }>(`select lineas, bodega_destino_id from inv_movimientos where empresa_id=$1`);
    expect(mov.lineas[0].productoId).toBe(prod.id);
    expect(mov.bodega_destino_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
