// Equivalencia con el sistema actual: cada caso de asientos-oro.json se generó con
// motor-contable.js (V2.21.70). El motor TypeScript debe producir exactamente los
// mismos movimientos, montos, descripciones y cuadratura.
import { describe, expect, it } from 'vitest';
import oro from '../__fixtures__/asientos-oro.json';
import pdcBase from '../__fixtures__/pdc-base.json';
import { PlanCuentas } from '../plan-cuentas';
import {
  asientoCompra,
  asientoHonorario,
  asientoHonorarioDoc,
  asientoPagoHonorario,
  asientoVenta,
  type Documento,
  type Honorario,
} from '../contable';

const plan = new PlanCuentas(pdcBase);
const limpio = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('motor contable = sistema actual', () => {
  for (const caso of oro as Array<{ nombre: string; tipo: string; d: unknown; extra?: { anio: number }; resultado: unknown }>) {
    it(caso.nombre, () => {
      const d = caso.d as Documento & Honorario;
      const r =
        caso.tipo === 'compra'
          ? asientoCompra(d, plan)
          : caso.tipo === 'venta'
            ? asientoVenta(d, plan)
            : caso.tipo === 'honorarioDoc'
              ? asientoHonorarioDoc(d, plan)
              : caso.tipo === 'honorario'
                ? asientoHonorario(d, caso.extra!.anio, plan)
                : asientoPagoHonorario(d, caso.extra!.anio, plan);
      expect(limpio(r)).toEqual(caso.resultado);
      expect(r.cuadre.ok).toBe(true);
    });
  }
});
