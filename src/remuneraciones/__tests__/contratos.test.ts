import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/c5-oro.json';
import { calcularLiquidacion, type Trabajador } from '../calculo';
import { parametrosVigentes } from '../parametros';
import { DT_COMUNAS, DT_NACIONALIDADES } from '../contratos-dt-tablas';
import { COLUMNAS, defaultsEmpresa, datosContrato, validarContrato, filaContrato, horasSemana, csvContratos, venceRegistro, gruposPorCargo, nombreArchivoContratos } from '../contrato-dt';
import { valoresContrato, plantillaSugerida, plantillasContrato, PLANTILLAS_CONTRATO_TIPO, MARCADORES_CONTRATO, ESENCIALES, combinarContrato, faltantesContrato, textoHorario, validarPlantilla } from '../contrato-trabajo';
import { documentXml, crearDocx } from '@/lib/docx';
import { textoDocx } from '@/lib/leer-texto';
import { limpiarTexto } from '../finiquito';

/* eslint-disable @typescript-eslint/no-explicit-any */
const o = oro as any;
const T = o.trabajadores as Trabajador[];
const P = parametrosVigentes();
const E = o.empresa;
const imp = (t: Trabajador) => calcularLiquidacion(t, o.uf, o.utm, undefined, P, {}).totalImponible as number;
const limpio = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('registro de contratos en la DT', () => {
  it('tablas y columnas oficiales', () => {
    expect(DT_COMUNAS).toHaveLength(o.comunas);
    expect(DT_NACIONALIDADES).toHaveLength(o.nacionalidades);
    expect(COLUMNAS).toEqual(o.columnas);
  });
  for (const [nombre, cfg, casos] of [['sin valores por defecto', {}, 'casos'], ['con valores por defecto de la empresa', o.defaults, 'casosDef']] as const) {
    it(nombre, () => {
      const D = defaultsEmpresa(E, cfg);
      for (const c of o[casos]) {
        const t = T.find((x) => x.id === c.id)!;
        expect(limpio(datosContrato(t, D)), c.id).toEqual(c.dc);
        expect(limpio(validarContrato(t, D)), c.id).toEqual(c.val);
        expect(filaContrato(t, D, imp(t)), c.id).toEqual(c.fila);
      }
    });
  }
  it('horas semanales, plazo de registro y CSV', () => {
    const D = defaultsEmpresa(E, {});
    for (const c of o.casos) {
      const t = T.find((x) => x.id === c.id)!;
      expect(horasSemana(datosContrato(t, D))).toEqual(c.horas);
      expect(venceRegistro(datosContrato(t, D).fechaSuscripcion)).toBe(c.vence);
    }
    expect(csvContratos(T.slice(0, 3).map((t) => filaContrato(t, D, imp(t))))).toBe(o.csv);
  });
  it('un archivo por cargo', () => {
    const g = gruposPorCargo(T);
    expect(g.map((x) => [x.cargo, x.lista.length, x.sufijo])).toEqual([['Operaria', 2, 'operaria'], ['Temporero', 1, 'temporero'], ['Guardia', 1, 'guardia'], ['sin cargo', 1, 'sin_cargo']]);
    expect(nombreArchivoContratos('76.151.704-K', new Date(2026, 9, 18), 'guardia')).toBe('76151704K_202610_guardia.csv');
  });
});

describe('contrato de trabajo desde plantilla', () => {
  const D = defaultsEmpresa(E, {});
  it('plantillas tipo, marcadores y esenciales', () => {
    expect(PLANTILLAS_CONTRATO_TIPO).toEqual(o.plantillas);
    expect(MARCADORES_CONTRATO).toEqual(o.marcadores);
    expect(ESENCIALES).toEqual(o.esenciales);
  });
  it('valores de marcadores y plantilla sugerida por cargo o tipo de contrato', () => {
    const pls = plantillasContrato([]);
    for (const c of o.casos) {
      const t = T.find((x) => x.id === c.id)!;
      expect(valoresContrato(t, D, E, imp(t)), c.id).toEqual(c.vals);
      expect(plantillaSugerida(t, D, pls).id, c.id).toBe(c.sugerida);
    }
  });
  it('texto combinado y datos faltantes', () => {
    const v = valoresContrato(T[0], D, E, imp(T[0]));
    expect(combinarContrato(PLANTILLAS_CONTRATO_TIPO[0].texto, v)).toBe(o.combinado);
    T.forEach((t, i) => expect(faltantesContrato(PLANTILLAS_CONTRATO_TIPO[1].texto, valoresContrato(t, D, E, imp(t)))).toEqual(o.faltantes[i]));
  });
  it('horario en palabras', () => { for (const [h, txt] of o.horarios) expect(textoHorario(h)).toBe(txt); });
  it('validación de marcadores al subir una plantilla', () => { for (const [t, orig, r] of o.validaciones) expect(validarPlantilla(t, orig)).toEqual(r); });
  it('plantilla propia antes que las tipo y versión editada de una tipo', () => {
    const pls = plantillasContrato([{ id: 'u1', codigo: 'indefinido', nombre: 'Indefinido editado', cargos: '', tipo_contrato: 1, texto: 'X' },
      { id: 'u2', codigo: 'propia-1', nombre: 'Motosierrista', cargos: 'Motosierrista, Operaria', tipo_contrato: null, texto: 'Y' }]);
    expect(pls[0]).toMatchObject({ id: 'propia-1', tipo: false });
    expect(pls.find((p) => p.id === 'indefinido')).toMatchObject({ nombre: 'Indefinido editado', editada: true, uuid: 'u1' });
    expect(plantillaSugerida(T[0], D, pls).id).toBe('propia-1'); // cargo Operaria
  });
});

describe('Word', () => {
  it('document.xml idéntico al del sistema actual', () => {
    expect(documentXml('CONTRATO\n\nPRIMERO: Hola {{trabajador}} y [dato faltante].\nSegunda línea\n\nSEGUNDO: chao', { firmas: [['EMPRESA', 'RUT 1'], ['ANA', 'RUT 2', 'TRABAJADOR']] })).toBe(o.docxXml);
  });
  it('el .docx generado se vuelve a leer con la misma estructura', async () => {
    const texto = PLANTILLAS_CONTRATO_TIPO[1].texto;
    const bytes = await crearDocx(texto, { titulo: 'Plantilla' });
    const leido = limpiarTexto(await textoDocx(new Uint8Array(bytes).buffer));
    expect(leido).toBe(limpiarTexto(texto));
    expect(validarPlantilla(leido, texto).ok).toBe(true);
  });
});
