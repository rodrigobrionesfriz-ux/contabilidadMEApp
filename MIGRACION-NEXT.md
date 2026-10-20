# Migración a Next.js + Supabase (estado al 20/10/2026)

Proyecto nuevo e independiente: `contabilidadme-next`. Está en GitHub y se publica en Vercel en https://contabilidad-me-app.vercel.app. El sistema actual (GitHub Pages + Firebase) sigue siendo el oficial; solo recibió el arreglo de exportación V2.21.72 (ver Importador).

## Stack
- Next.js 16.4 (App Router, `src/proxy.ts`), React 19, Tailwind 4, TypeScript.
- Supabase: PostgreSQL + Auth (email y contraseña) con `@supabase/ssr`.
- Sin cacheComponents.
- Fuentes vía @fontsource.
- `xlsx` 0.18.5 para leer el respaldo y el RCV en Excel (y, con su lector/escritor ZIP, leer y generar .docx sin dependencias nuevas).
- Pruebas (321): vitest con casos de oro comparados contra el sistema actual (motor, lector RCV, validador del paso 2, F29, remuneraciones, LRE, Previred, vacaciones, finiquitos, contratos, estados financieros, depreciación, tesorería, renta anual, declaraciones juradas, inventario, asientos tipo, imposiciones y XML IECV), importador contra el mayor del sistema actual, saldos de auxiliares y SQL en PGlite.
- CI en GitHub Actions: lint, test y build.

## Migraciones (supabase/migrations, se ejecutan una vez cada una en el SQL Editor)

### 0001 esquema base
- Tablas: empresas, miembros (rol admin/contador/consulta), cuentas, asientos/asiento_lineas, correlativos, periodos_cerrados, auditoria.
- RLS por empresa.
- Funciones: crear_empresa, crear_asiento (correlativo atómico, cuadratura), anular_asiento, cerrar/reabrir_periodo, agregar_miembro.

### 0002 plan de cuentas base
- pdc_plantilla con 295 cuentas.

### 0003 fase 1
- centros_costo en 2 niveles (padre, estado, curva, ref_origen).
- asientos.ref_origen e importado.
- Tabla documentos (compra/venta/honorario, con datos jsonb y asiento_id).
- Tabla importaciones.
- Funciones de importación: importar_iniciar, importar_asientos, importar_documentos, importar_finalizar y eliminar_importacion (esta última solo borra datos importados).
- balance_comprobacion(empresa, desde, hasta).
- Privilegios UPDATE por columna (el RUT de la empresa no es editable).

### 0004 fase 2
- documentos.periodo (YYYY-MM del libro): lo fija un trigger desde datos.periodoContable o la fecha; se rellenó para las filas existentes.
- documentos: anulado_en y motivo_anulacion; índice por clave rut/tipo_dte/folio.
- registrar_documento(empresa, doc, asiento): en una sola transacción revisa permisos y duplicados (no anulados), llama a crear_asiento y crea el documento enlazado. Traduce las claves rut/cc de las líneas del motor a rut_auxiliar/centro_costo.
- anular_documento(id, motivo): anula el asiento (conserva el N°) y marca el documento como anulado.

### 0005 fase 3
- registrar_documento acepta el tipo 'honorario'.
- movimientos_auxiliar(empresa, tipo_auxiliar, desde, hasta): líneas con RUT de las cuentas auxiliares, solo cuentas de balance (A/P), para no mezclar el gasto 3202019 con la deuda 2102006.

### 0006 fase 4
- empresas.tasa_ppm (editable por el admin).
- Tabla f29_declaraciones (empresa, periodo, estado borrador/presentado, declarado jsonb, utm, remanente_inicial, calculado).
- Funciones:
  - guardar_f29 (contador o admin; no permite editar si está presentado);
  - presentar_f29 (guarda una foto de lo calculado);
  - reabrir_f29 (solo admin);
  - iusc_por_periodo (saldo acreedor de 2104002 en asientos tipo 'remuneraciones').

### 0007 fase 5a
- Tablas: empresa_parametros (indicadores y previsional en jsonb; solo el admin escribe), trabajadores (RUT validado y único por empresa, ficha jsonb, activo), rem_eventos (licencia, permiso sin goce, ausencia, permiso con goce, vacaciones), rem_horas, rem_anticipos (mes de descuento y asiento de pago opcional), libros_remuneraciones (foto del mes: UF, UTM, líneas, totales, asiento).
- RLS: horas y anticipos de un mes con libro cerrado no se pueden crear, editar ni borrar.
- cerrar_libro_remuneraciones: anula el asiento de remuneraciones vigente del mes, crea el nuevo (tipo 'remuneraciones', origen 'rem:YYYY-MM') y guarda la foto.
- reabrir_libro_remuneraciones: solo admin; anula el asiento y borra la foto.

### 0008 fase 5b
- empresa_parametros: columnas feriados (extra/quitar) y previred (sucursal de la mutual y códigos manuales de institución). Solo el admin las cambia.
- finiquito_plantillas: plantillas propias de la empresa, o la versión editada de una plantilla tipo (codigo = id de la tipo; borrarla la restaura).
- finiquitos: trabajador, término, causal, datos del formulario, foto del cálculo, total, texto propio, estado borrador/ratificado y asiento.
- Un finiquito contabilizado no se puede modificar (trigger) ni borrar (RLS); sí cambiar su estado de ratificación. asiento_id solo lo fija contabilizar_finiquito.
- contabilizar_finiquito(id, fecha, glosa, líneas): un solo asiento vigente por finiquito (tipo 'finiquito', origen 'fin:id'); para rehacerlo se anula el asiento.

### 0009 fase 5c
- contrato_config: valores por defecto de la empresa para los contratos (contador o admin).
- contrato_plantillas: plantillas propias (con cargos y tipo de contrato) o versión editada de una tipo (borrarla la restaura).
- contratos_trabajo: plantilla elegida y texto propio del contrato de cada trabajador (el trabajador debe ser de la misma empresa).
- Los datos del registro DT de cada trabajador se guardan en trabajadores.ficha.contratoDT (incluida la fecha en que se informó).

### 0010 fase 6
- empresas.regimen (14D3 por defecto, 14D8, 14A, renta presunta, no sujeto) y tasa_renta (vacía = la del régimen y año).
- saldos_periodo(empresa, desde, hasta, excluir_cierre): sumas por cuenta; los estados financieros excluyen el asiento de cierre para seguir mostrando el resultado.
- ejercicios_cerrados: meses que estaban cerrados antes del cierre anual (para restaurarlos al reabrir).
- cerrar_ejercicio(empresa, año): salda las cuentas 3 y 4 por cuenta, auxiliar y centro de costo contra 2303001 al 31-12 (tipo 'cierre', origen 'cierre:AAAA') y cierra los 12 meses.
- reabrir_ejercicio(empresa, año, motivo ≥ 10 caracteres): anula el cierre y deja los meses como estaban; se niega si el año siguiente tiene la apertura generada vigente.
- generar_apertura(empresa, año): exige el año anterior cerrado; N° 0 al 1 de enero (o el siguiente número si el 0 está anulado) con saldos de cuentas 1 y 2; en cuentas con auxiliar, uno por RUT, tipo y folio.

### 0011 fase 7
- activos_fijos: ficha del bien (categoría SII, fecha de adquisición, valor, valor residual, vida útil, depreciación acelerada o instantánea, cuentas de activo, depreciación acumulada y gasto, centro de costo, baja). Las cuentas deben existir en el plan.
- Índice único: un solo asiento de depreciación vigente por empresa y año (origen 'dep:AAAA').
- conciliacion_marcas (línea de asiento conciliada, con fecha y usuario) y conciliacion_saldos (saldo según cartola por cuenta y mes).
- lineas_cuentas(empresa, prefijo, desde, hasta): líneas vigentes de las cuentas que parten con el prefijo (por ejemplo 1101), con número, fecha y glosa del asiento.

### 0012 fase 8
- renta_declaraciones (empresa, año, datos jsonb): régimen y tasa de la declaración, cuentas y líneas marcadas como gasto rechazado, agregados y deducciones manuales, créditos, pérdida de arrastre, base de la presunción, PPM manual, reajuste y notas.
- dj_catalogo (copia editable del catálogo por empresa; borrarla vuelve a la semilla) y dj_estados (estado, fecha, folio y observaciones por año tributario).
- Lectura para miembros; escritura para contador y admin.

### 0013 fase 9
- Tablas inv_grupos, inv_bodegas, inv_productos (cuenta de inventario fija 1109007 y cuenta de gasto del plan), inv_movimientos (líneas en jsonb), inv_tomas, inv_ordenes_compra, inv_recepciones (enlace opcional a la factura en documentos). Claves foráneas compuestas (empresa, id): nada puede apuntar a datos de otra empresa.
- Una sola toma abierta o pendiente por bodega (índice único parcial).
- inv_estado.version por empresa e inv_aplicar(empresa, versión, operaciones): aplica en una transacción inserciones y cambios sobre las tablas de inventario, asigna folios correlativos (ENT, SAL, TRA, AJE, AJS, TOMA, OC, REC), reemplaza {{ref}} por el folio asignado, exige la versión del inventario en lo que depende del stock y la versión del registro en tomas y órdenes, y deja registro en auditoría.
- inv_contar(empresa, toma, línea, físico, costo, usuario): guarda el conteo de una línea sin pisar los de otros usuarios.
- Lectura para miembros; escritura sólo por las funciones (contador o admin).

### 0014 fase 10
- comprobantes_tipo: plantillas de asientos (líneas, glosa, montos opcionales y distribución por porcentaje).
- asignar_centro_costo(empresa, líneas, centro): sólo líneas de grupos 31 a 35 cuya cuenta admite centro, de asientos vigentes que no sean de cierre; se permite en meses cerrados (no cambia montos) y queda en auditoría. lineas_costeables(empresa, desde, hasta) las lista.
- lineas_libro(empresa, desde, hasta, anulados): libro diario completo con nombre de cuenta.
- buscar_global(empresa, texto): todas las palabras, sin tildes, en documentos, asientos, trabajadores, cuentas, activos y productos (10 por tipo).
- registrar_actividad(empresa, acción, detalle) y actividad_empresa(empresa, límite, antes) (sólo admin, con nombre del usuario).
- Hojas foliadas: folios_rangos (sin superposición, uno activo), folios_reservas (folios, estado reservado/usado/inutilizado, páginas guardadas para reimprimir) y folios_config; reservar_folios toma el primer bloque libre con bloqueo, así dos personas no usan el mismo folio.

### 0015 (10d)
- eliminar_importacion ya no se niega por asientos propios anulados: los borra junto con lo importado (queda en auditoría como anulados_propios). Los asientos propios vigentes siguen bloqueando.

### 0016 (10f)
- guardar_apertura(empresa, año, glosa, líneas): registra o corrige el balance de apertura del año. Sólo cuentas 1 y 2 imputables y activas; las de auxiliar exigen RUT (tipo DTE y folio opcionales); debe cuadrar. Si hay apertura vigente reemplaza sus líneas y conserva el número (versión anterior en auditoría); si no, la crea como N° 0 al 1 de enero (o el siguiente número si el 0 lo ocupa una anulada), con origen 'apertura-manual:AAAA' para no bloquear la reapertura del año anterior. Se niega con enero o el ejercicio cerrados.

### 0017 (10h)
- editar_asiento(id, fecha, glosa, líneas, motivo): edita un comprobante conservando su número, con las mismas validaciones de crear_asiento. No permite anulados, cierre ni apertura (la apertura va por guardar_apertura), cambiar de año ni tocar meses cerrados (origen o destino). Guarda en auditoría la versión anterior (fecha, glosa y líneas) y el motivo. El documento asociado (compra/venta/honorario) no se modifica.

### 0020 (10i, renumerada)
- centro_costo_codigo(empresa, cc): devuelve el código del centro a partir del código o del id del sistema anterior (ref_origen); vacío = sin centro; si no existe, error claro.
- registrar_documento traduce el centro de cada línea con esa función antes de crear el asiento.
- Corrección única: datos.dist[].cc y datos.cc de los documentos importados pasan del id antiguo al código nuevo.

### 0019 (10j)
- Tabla auxiliares (fichas de proveedores y clientes): empresa, tipo (proveedor/cliente), RUT validado, razón social, giro, correo, teléfono, dirección, cuenta y centro de costo por defecto, forma de cobro (clientes), activo. Lectura para miembros; escritura sólo por guardar_auxiliar.
- guardar_auxiliar(...): crea o actualiza (valida RUT, cuenta imputable y centro con centro_costo_codigo, de la 0020); p_solo_crear no pisa una ficha existente. Queda en auditoría.
- Poblado inicial: una ficha por RUT con documentos, con la cuenta y el centro del documento vigente más reciente (centro traducido desde el id antiguo).

### 0021 (10l)
- rcv_cargas (empresa, tipo, período): RCV leído (docs con su registro SII completo y filas descartadas), archivo, quién y cuándo. RLS: ver miembros; crear, editar y borrar contador o admin.
- rcv_resumen(empresa, tipo): por período, total de documentos del RCV guardado y cuántos faltan en el libro (sin documento vigente con el mismo RUT, tipo DTE y folio).

## Importador del respaldo Excel (fase 1)
- **Fuente:** el botón "📥 Exportar Excel" en Sistema y Respaldos del sistema actual. Un año por archivo.
- **Equivalencia con genDiario:**
  - Los asientos guardados son el maestro.
  - Los documentos sin asiento propio se contabilizan con el motor TS: asientoVenta/asientoCompra, más el respaldo de honorarios con la retención por año.
  - Se excluyen documentos anulados y con excluidoAuto.
- **Numeración:**
  - La apertura es el N°0.
  - Se conserva numeroContable.
  - Los números repetidos y los asientos generados siguen desde el máximo.
- **Normalización:**
  - Montos en pesos enteros.
  - Los negativos pasan al lado contrario.
  - Ajuste de redondeo de hasta $2.
  - Un asiento anulado que no cuadra se importa sin líneas.
- **Errores que bloquean la importación:** asiento vigente descuadrado, cuenta inexistente o fecha fuera del año.
- **Cuentas propias:** salen de la hoja PlanDeCuentas.
- **Centros sin código:** se nombran CC1 o <principal>-1.
- **Verificación:** al final se compara el saldo por cuenta contra la base.
- **Cargas grandes:** se hacen por lotes desde el navegador (200 asientos y 300 documentos por lote).
- **Celdas largas (V2.21.72 del sistema actual, 10b aquí):** Excel admite 32.767 caracteres por celda. El sistema actual reparte los JSON largos en columnas de continuación `<columna>__2`, `<columna>__3`... (cortes de 32.000 sin partir pares sustitutos) y los une al importar. `unirTrozos` en src/importador/leer-excel.ts hace lo mismo aquí. Los respaldos sin esas columnas se leen igual que antes.
- **JSON ilegible (10d):** si el asientoJSON (o el movsJSON sin asientoJSON) no se puede leer, es un error que bloquea. Antes el asiento quedaba sin movimientos y se omitía con un simple aviso: así se perdió el pago agrupado N° 2048 ($617.802.804) en la primera carga de La Cabaña.
- **Origen de los automáticos (10d):** los asientos con origenAuto ivaf29/pagof29 y periodoIVA entran con origen_id 'ivaf29:AAAA-MM' / 'pagof29:AAAA-MM', y los de remuneraciones con periodo como 'rem:AAAA-MM'. Así el F29 del sistema nuevo reconoce la compensación y el pago ya hechos y no deja duplicarlos.

## Compras y ventas (fase 2)
- **Lector RCV** (src/rcv/leer.ts): traslado fiel de importadorsii.js, para CSV (UTF-8 o Windows-1252) y Excel. Incluye:
  - filas de continuación de otros impuestos;
  - retención en DTE 45/46 y sus notas de crédito;
  - ajuste contra el total (diésel / sin derecho a crédito);
  - descarte de duplicados dentro del archivo.
- **Validador del paso 2** (src/rcv/detalle.ts): traslado fiel de validarDetalleRCV y lineasIniciales. Los mensajes son idénticos a los del sistema actual.
- **Armado del registro** (src/rcv/documento.ts): equivale a la importación de compras.js/ventas.js y contabiliza con el motor TS.
  - Compras: periodoContable (un documento de un mes anterior se contabiliza el día 1); las líneas de otro impuesto van a otrosImpuestosDetalle (1108006 = recuperable, otra cuenta = costo en esa cuenta).
  - Ventas: formaPago (clientes, banco o deudores) y cuentaIngreso.
- **Seguridad:** la acción del servidor recalcula el asiento con el plan de la base (respeta las reglas editadas de cada cuenta); no confía en los datos del navegador.
- **Pantallas:**
  - Importar RCV: ver "RCV en dos pasos con fichas (10j)": lista del registro a la izquierda, edición por documento a la derecha, cuenta y CC desde la ficha del auxiliar.
  - Libro de compras/ventas: resumen por tipo de DTE con signo (las NC restan), enlace al asiento y anulación.
  - Nuevo documento manual: cabecera, IVA del 19% automático y el mismo editor de líneas.

## Honorarios, auxiliares y pagos (fase 3)
- **Boleta de honorarios** (src/honorarios/boleta.ts):
  - DTE 70 con retención (tasa del año: 2026 = 15,25%) o DTE 71 sin retención.
  - Usa asientoHonorarioDoc: gasto (por defecto 3202019, con CC), retención en 2103002 y líquido en 2102006 con RUT y folio.
  - Si es al contado, se registra además el asiento de pago.
- **Saldos de auxiliares** (src/auxiliares/saldos.ts), en el mismo orden que pagos.js:
  1. Las líneas con el mismo DTE y folio forman un documento.
  2. Una NC con referencia se aplica a su factura.
  3. Los abonos sin documento y las NC sin referencia se imputan FIFO a lo más antiguo.
  4. El sobrante queda como saldo a favor.
  - Aging por días desde el vencimiento en 6 tramos (al día, 1-30, 31-60, 61-90, 91-120, +120).
  - El cálculo es por ejercicio (desde el 1 de enero, incluida la apertura).
- **Pagos y cobros** (src/auxiliares/pago.ts): un asiento con una línea por documento en la cuenta auxiliar (RUT, DTE y folio) y una línea consolidada de banco o caja.
  - El servidor recalcula los saldos y nunca deja pagar más que el saldo.
  - Admite pago parcial.
  - Las cuentas de pago son las 1101xxx; por defecto, la 1101201.

## F29 y PPM (fase 4)
- **Cálculo** (src/tributario/f29.ts): traslado fiel de calcularF29Anual, con resultados idénticos en 4 escenarios de oro.
  - Códigos: 502/503, 111/110, 513/512, 510/509, 142/586, 538, 39, 520/519, 525/524, 528/527, 532/531, 521/564, 562/584, 504, 537, 77, 89, 563, 62, 151, 48 y 91.
  - Remanente inicial: el cód. 77 del F29 de diciembre anterior o, si no existe, el ingresado en enero.
  - Reajuste del remanente (art. 27 DL 825): se convierte a UTM con 2 decimales y se reconvierte con la UTM del mes de imputación.
  - Si un mes está presentado, el mes siguiente arrastra el remanente declarado.
- **UTM:** tabla del SII 2023 a oct-2026 (src/tributario/utm.ts). Los meses que falten se ingresan en la declaración de ese mes.
- **Carga de datos** (src/lib/datos/f29.ts): ventas por fecha; compras por periodo del libro; honorarios por año; impuesto único con iusc_por_periodo.
- **Asiento de compensación de IVA:** origen_id 'ivaf29:YYYY-MM', fecha último día del mes. Mueve débito, IVA retenido, crédito, crédito de activo fijo, reajuste (3501001), remanente (1108007, que se crea si no existe) e IVA por pagar (2104002). Opcionalmente provisiona el PPM (1108001 contra 2105006).
- **Asiento de pago del F29:** origen_id 'pagof29:YYYY-MM', fecha sugerida el día 12 del mes siguiente. Conceptos: IVA, PPM, retención de honorarios, impuesto único y multas. Si la compensación provisionó el PPM, el pago salda 2105006. Los montos sugeridos son los declarados si el mes está presentado.
- No se permite duplicar la compensación ni el pago de un mismo mes: primero hay que anular el asiento existente.

## Remuneraciones (fase 5a)
- **Cálculo** (src/remuneraciones/calculo.ts): traslado fiel de asistenciaMes, calcularIUSCDetalle, calcularGratificacion, asignacionFamiliar, calcularAportePatronal (con reforma) y calcularLiquidacion. Resultados idénticos en 27 liquidaciones de oro (9 trabajadores × 3 meses).
- **Parámetros** (src/remuneraciones/parametros.ts): valores por defecto de getIndicadores/getPrevisional; lo guardado por la empresa los sobrescribe.
- **Libro y asiento** (src/remuneraciones/libro.ts): centralización con 3201001, 3201003, 2104001, 2104002 (impuesto único, que llega al código 48 del F29), 1106001 (anticipos), 2104005 y 3201013. Los montos negativos pasan al lado contrario.
- **Anticipos:** se descuentan en el mes indicado; opcionalmente generan asiento de pago (1106001 contra una cuenta 1101xxx).
- **Importación de trabajadores:** hoja Trabajadores del respaldo. No trae modo de gratificación, fechas de contrato ni cargas.
- **Números con decimales** (UF, plan Isapre, tasas): se leen con decimalCL (src/lib/formato.ts), que acepta "41.247,63" o "41247.63". El servidor rechaza UF/UTM fuera de rango al cerrar el libro.
- **Observación heredada:** un trabajador con Isapre y licencia el mes completo queda con líquido negativo, porque el adicional Isapre se sigue descontando con imponible cero. Es igual en el sistema actual.

## LRE, Previred, vacaciones y finiquitos (fase 5b)
- **LRE** (src/remuneraciones/lre.ts): traslado fiel de lre-dt.js. 147 columnas con encabezados oficiales "Nombre(código)", separador ";", fechas dd/mm/aaaa, CRLF, ANSI (Windows-1252). Archivo RUTEMPRESA_AAAAMM.csv. Valida RUT, inicio de contrato, región, comuna, AFP, salud, mutual, causal si hay término y días trabajados.
  - Diferencia con el sistema actual: en un libro cerrado, región, comuna y fecha de inicio vacías en la foto se completan desde la ficha vigente; la fecha y causal de término salen siempre de la foto.
- **Previred** (src/remuneraciones/previred.ts): traslado fiel de previred.js (formato 58, 105 campos). Línea 00 por trabajador y 01 por movimiento adicional. Fonasa con caja reparte el 7% (2,8% Fonasa y 4,2% caja por defecto). Configuración: sucursal de la mutual y códigos manuales (tabla:clave=código).
- **Vacaciones** (src/remuneraciones/vacaciones.ts): traslado de vacaciones.js. Feriados nacionales calculados más los adicionales o quitados por la empresa. 15 días hábiles (20 en zona extrema) devengados por mes, progresivos (Art. 68), saldo inicial a una fecha. Las vacaciones se guardan como eventos de asistencia.
- **Finiquitos** (src/remuneraciones/finiquito.ts): traslado de calcularFiniquito, plantillas y propuestaAsiento.
  - Feriado pendiente y proporcional (hábiles → corridos), sustitutiva del aviso, años de servicio (fracción > 6 meses, tope 11 años), tope 90 UF, descuento AFC 1,6% estimado o manual, mes de término opcional, haberes y descuentos extra.
  - Aviso nuevo: si el saldo de vacaciones supera dos períodos (suele faltar el saldo inicial).
  - Los montos manuales se leen con decimalCL; el sistema actual leía mal "7.5" como 75.
  - Plantillas tipo por causal (editables y restaurables) y propias; se pueden subir desde .docx, .txt, .md o .html; marcadores {{campo}}.
  - Documento imprimible con firmas y ministro de fe. Asiento: 3201011 feriado, 3201009 indemnizaciones (o contra provisiones 2105004 y 2202001 hasta su saldo), 3201014 otros haberes, 1106001 descuentos, 2104005 por pagar. El servidor recalcula y exige que el total coincida con el guardado.
  - Al guardar, opcionalmente registra fecha y causal de término (código LRE) en la ficha.

## Contratos de trabajo (fase 5c)
- **Registro DT** (src/remuneraciones/contrato-dt.ts): traslado fiel de contratos-dt.js (Instructivo DT v21.04.22). 100 columnas, ";", CRLF, ANSI; un archivo por cargo, máximo 1.000 filas. Tablas DT de comunas (no son el código CUT; Angol = 226) y nacionalidades. Plazo de registro: 15 días hábiles aproximados.
- **Contrato** (src/remuneraciones/contrato-trabajo.ts): plantillas tipo (indefinido, plazo fijo, obra o faena, agrícola de temporada) y propias por cargo. Datos obligatorios vacíos quedan como [dato] resaltado. Validación de marcadores al subir Word.
- **Word** (src/lib/docx.ts): traslado de docx-simple.js; el ZIP se escribe con xlsx CFB. Ida y vuelta probada.
- El representante legal se edita en Configuración → Empresa.
- **Editor del contrato (10r)** (documento/editor.tsx, src/remuneraciones/contrato-editor.ts): "✏️ Editar contrato" vuelve editable la misma hoja. Los datos de la ficha se ven con su valor real, en azul, y no se pueden borrar ni escribir dentro (bloqueo en beforeinput y, si algo se cuela, se deshace). Datos obligatorios vacíos: recuadro amarillo con el nombre del dato; opcionales vacíos: recuadro gris. "＋ Insertar dato de la ficha" agrega un dato donde está el cursor. Enter hace salto de línea; pegar entra como texto plano. Se guarda con {{marcadores}} por trabajador (contratos_trabajo), así el contrato se actualiza si cambia la ficha; si el texto quedó igual a la plantilla, se guarda solo la plantilla elegida. Si el texto cambió, se ofrece "Guardar como plantilla del cargo «cargo»" mientras se edita y después de guardar. Ya no hace falta bajar el Word para corregir el texto.

## Estados financieros y cierre (fase 6)
- **Estados** (src/estados/eeff.ts): traslado fiel de renderBalance, renderResultados, totalesDeMayor, fmtVar y calcularResultadoEjercicio; resultados idénticos en 9 escenarios de oro. Signo de presentación invertido para naturaleza acreedora; aviso de cuentas con saldo contrario salvo correctoras. Impuesto: el contabilizado en 36 o estimado con la tasa del régimen (14D3 12,5% en 2025-2027 y 15% en 2028; 14A 27%; 14D8 0%).
- **Regímenes** (src/estados/regimenes.ts): traslado de regimenes.js.
- **Cierre** (/cierre): meses (solo admin), provisión de incobrables, provisión de feriado (excluye trabajadores con término a la fecha de corte), corrección monetaria referencial, cierre, reapertura con motivo y apertura del año siguiente.
- Diferencias con el sistema actual: el cierre se hace por cuenta, auxiliar y centro de costo y cierra los 12 meses; el estado de resultados sigue mostrándose después del cierre; la apertura del año siguiente se genera sola.

## Activo fijo, flujo de caja y conciliación (fase 7)
- **Depreciación** (src/activo-fijo/depreciacion.ts): traslado fiel de activofijo.js con resultados idénticos al caso de oro. Categorías SII con vida normal y acelerada, depreciación contable lineal, tributaria normal, acelerada o instantánea, conciliación contable/tributaria por año (base para la RLI de la fase 8) y asiento anual por cuentas y centro de costo (origen 'dep:AAAA', uno vigente por año).
- **Flujo de caja** (src/tesoreria/flujo.ts): realizado por mes desde las cuentas 1101, clasificado por contrapartida; proyectado desde los saldos pendientes de clientes y proveedores por tramo de vencimiento. Diferencia con el sistema actual: el proyectado usa saldos pendientes, no totales facturados. Corte: hoy para el año en curso, 31-12 para otros años.
- **Conciliación bancaria** (src/tesoreria/conciliacion.ts): cartola en Excel o CSV, emparejamiento automático por monto y fecha cercana, marcas manuales, saldo según banco y diferencia explicada. Diferencia: el CSV se lee como texto, así que las fechas dd/mm y los montos con puntos ya no se pierden (falla del sistema actual). Marcar conciliados lo pueden hacer contadores y admin.

## Renta anual y declaraciones juradas (fase 8)
- **Renta** (src/tributario/renta.ts): traslado fiel de calcularRenta; resultados idénticos en 22 casos de oro (5 regímenes, ajustes, pérdida de arrastre, renta presunta, créditos mayores que el impuesto, corrección monetaria deudora y acreedora). Base: saldos del año sin el asiento de cierre (antes, con el año cerrado el resultado quedaba en cero). Depreciación tributaria desde las fichas de activo fijo (instantánea en Pro Pyme). PPM: suma del F29 del año, reemplazable a mano. Sin declaración guardada, la tasa parte de la fijada en la ficha de la empresa.
- **Gastos rechazados:** por cuenta completa (con pistas por nombre: multas, retiros, provisiones, mermas, etc.) o por movimiento suelto, abriendo la cuenta. Diferencia: en el sistema actual el rechazo por movimiento venía marcado desde el documento de compra; aquí se marca en la pantalla de renta. Las líneas anuladas se descartan solas.
- **Declaraciones juradas** (src/tributario/dj.ts): traslado de djcatalogo.js y djrenta.js. Semilla AT 2026 (1887, 1879, 1847, 1926, 1948, 1947, 1943, 1949), editor con validación (número único, plazo mes-día), semáforo (vencida o vence en 15 días) y cifras de control desde el libro de remuneraciones, honorarios del año (sin anulados), balance y RLI. Cambiar el número de una declaración mueve su estado del año.

## Inventario (fase 9)
- **Motor** (src/inventario/motor.ts): traslado fiel de inventario-motor.js, inventario-oc-motor.js y conciliacion-compras-motor.js; resultados idénticos al caso de oro (stock, lotes, PPP, valorizaciones, errores, validaciones, rebase de tomas, totales y estados de OC, conciliación). El stock y el PPP no se guardan: se reconstruyen desde los movimientos vigentes.
- **Importador de productos** (src/inventario/importador.ts): traslado fiel de inventario-importador.js; vista previa en el navegador y nueva validación en el servidor antes de guardar; crea grupos y subgrupos faltantes.
- **Pantalla** /inventario con pestañas: existencias (con lotes, vencimientos y Excel), movimientos (crear, editar, ver, anular), tomas físicas (conteo por línea, cierre, devolución, rechazo, autorización con ajustes AJE/AJS), órdenes de compra (borrador, emisión, recepción parcial por lotes, cierre de saldo, anulación, vincular factura), productos, bodegas y grupos.
- Diferencias con el sistema actual: los proveedores de la OC salen de las compras registradas (no hay fichas de proveedores todavía); una anulación de movimiento que dejaría stock negativo después se rechaza; la conciliación recepción-factura queda en la recepción (la factura no se modifica); las escrituras concurrentes se controlan con versión en la base, no en el navegador.
- El inventario sigue siendo auxiliar: no genera asientos contables (igual que hoy).

## Herramientas (fase 10)
- **Asientos tipo** (src/herramientas/comprobantes-tipo.ts): traslado fiel de comprobantestipo.js con casos de oro (aplicar, repartir sin perder pesos, buscar, resumen, validaciones). Pantalla en Herramientas; en Nuevo asiento se elige la plantilla (pide el monto a repartir si corresponde) y se puede guardar el asiento escrito como plantilla. Copia a otra empresa: las cuentas o centros que no existan allá quedan en blanco y se avisa.
- **Asignar centros de costo**: filtros (sin centro, con centro, mes, cuenta, origen, texto), asignación por fila o en bloque, quitar centro.
- **Estado de cuenta por auxiliar** (/auxiliares/estado): documentos pendientes con días de atraso y, opcionalmente, todos los movimientos con saldo acumulado; imprimible y Excel. Se abre desde cada auxiliar.
- **Imposiciones** (src/herramientas/imposiciones.ts): traslado fiel de imposiciones.js con casos de oro (con y sin caja, antes y después de agosto 2026). Pestaña en Remuneraciones con resumen por institución y Excel de dos hojas con fórmulas.
- **XML IECV** (src/herramientas/iecv.ts): traslado fiel de xmlsii.js (XML idéntico al de oro). Diferencia: se descarga realmente en ISO-8859-1 como declara el encabezado (el sistema actual lo bajaba en UTF-8 y las ñ y tildes quedaban mal).
- **Hojas foliadas** (src/herramientas/folios.ts): traslado de folios-sii.js: Libro Diario, Mayor, Caja e Inventarios y Balances; papel, orientación, márgenes, líneas por hoja y orden de alimentación; prueba de alineación; reserva, reimpresión, usadas o inutilizadas; control en CSV. Diferencias: los rangos son de la empresa (no por año) y la reserva es atómica en la base.
- **Búsqueda global** (Ctrl+K o el botón sobre el menú): lleva al comprobante del asiento o documento, al mayor de la cuenta, a la ficha del trabajador, al activo fijo o al inventario.
- **Comprobante contable** (/asientos/[id]): imprimible con firmas; el N° del libro diario lo abre.
- **Registro de actividad** (sólo admin): lo que registra la base (asientos, documentos, cierres, inventario, folios, etc.) más renta, declaraciones juradas, plantillas y exportaciones.
- **Exportar a Excel**: un libro por año con plan de cuentas, diario línea por línea, documentos, centros, trabajadores, activo fijo, productos y movimientos de inventario. Es un respaldo de lectura, no el formato del importador.

## Barra lateral (10c)
- src/app/(app)/e/[empresaId]/navegacion.tsx. Misma agrupación y orden que el sistema actual: Inicio, Registros, Inventario, Reportes, Tributario SII, Activo Fijo, Cierre de Ejercicio y Configuración.
- Grupos plegables; se abre el que contiene la página actual (sin guardar estado en el navegador).
- Ítems que comparten página se distinguen por parámetro: Libro de Ventas y de Compras (`/libro?tipo=`), Balance General y Resultados (`/estados?vista=`).
- Secciones del sistema actual que quedaron dentro de otras: PPM en Formulario 29; provisiones, corrección monetaria y cierres mensuales en Cierre del Ejercicio; Sistema y Respaldos y Carga desde Excel pasan a Importar respaldo y Exportar a Excel.
- Computador: fija a la izquierda con empresa activa y buscador arriba. Celular: botón ☰ con la sección actual; el menú se abre encima y se cierra al elegir.
- El modal de búsqueda se dibuja en un portal a `document.body`, porque la barra usa `transform` y un `fixed` quedaría encerrado en ella.

## Paso 2 del RCV como el sistema actual (10o)
- Paso 1 en la página (mes, subir archivo, meses con pendientes, resumen del RCV guardado y botón "Paso 2"). Al subir un archivo se abre el paso 2.
- Paso 2 a pantalla completa: cabecera "RCV Compras/Ventas · paso 2: contabilizar documento por documento" con archivo y conteos; período en mes y año; "Vista tabla" (todo el registro en una tabla; al elegir una fila vuelve a la vista documento); "⬇ Importar"; ✕. Columna izquierda: buscador, filtros Por contabilizar / En el libro / Todos y lista (nombre, tipo-folio, fecha, monto). Derecha: documento elegido con "Toca ⬇ Importar"; al importar, el editor.
- Editor (panel.tsx, EditorDocumento): encabezado con tipo de documento, folio, fecha de emisión, vencimiento (editable), RUT y auxiliar, y debajo casillas de exento, neto, IVA, otros impuestos y total (título y monto alineados a la derecha; total destacado); glosa general (por defecto, el mismo detalle de la línea del proveedor o cliente: "Nombre · Tipo de documento N°folio"); asiento editable con columnas # · Cuenta · Descripción · Centro de costo · Tipo · Debe · Haber, con ⇥ y ✕ por línea; debajo, las filas automáticas (IVA crédito o débito, IVA retenido, proveedor o cliente, banco) desde asientoProvisional, y los totales del asiento; "+ Agregar línea" y "Aceptar diferencia de $1"; tabla CONTROL (líneas contra RCV con diferencia) y "Documento cuadrado: listo para contabilizar"; ficha del auxiliar; Cancelar y "📒 Contabilizar documento".
- documento.ts: armarDocumento (sin validar) y asientoProvisional (asiento del motor aunque aún no cuadre; las primeras líneas son las del paso 2).

## RCV guardado por mes y asiento completo (10l)
- Cada RCV subido se guarda en rcv_cargas en su mes (periodoSugerido); si ya había uno de ese mes, se combinan los documentos (el nuevo reemplaza al de la misma clave). Acciones: guardarCarga, abrirCarga, resumenCargas, quitarCarga.
- La página abre el mes pedido (?periodo=), si no el más reciente con pendientes, si no el último cargado o el mes actual. El selector "Mes del RCV y del libro" muestra los pendientes de cada mes y abre el RCV guardado; arriba aparecen como botones los otros meses con documentos por importar. "Quitar este RCV" borra la carga (no toca lo contabilizado).
- Panel de importación: vista previa del asiento completo que se generará (gasto o ingreso, IVA crédito o débito, proveedor o cliente, retenciones y otros impuestos) con el mismo motor que contabiliza (construirRegistro).
- Repartir: "+ Línea (otra cuenta o centro)" agrega una línea con la misma cuenta, sin centro, monto cero y sin descripción (se escribe); ⇥ completa la primera con lo que falta.
- Sólo las líneas de impuestos y retenciones (cuentas 1108, 2103 y 2104: IVA crédito y débito, IVA retenido, crédito de activo fijo, otros impuestos recuperables, retención de honorarios) llevan por defecto el nombre de su cuenta como detalle (esCuentaImpuesto en construirRegistro; vale para el RCV y el documento manual). Las de gasto, ingreso y activo no: en el paso 2 su Descripción es obligatoria (también con una sola línea) y no se propone texto; las de otros impuestos conservan "Otro impuesto cód. X".
- next.config: serverActions.bodySizeLimit 4mb (el RCV con su registro SII completo se guarda por acción del servidor).

## RCV en dos pasos con fichas (10j)
- Paso 1: archivo y período del libro. El lector guarda el registro completo del SII de cada documento (todas las columnas con sus encabezados originales, más las filas de continuación de otros impuestos) en DocRCV.registroSII y en datos.registroSII del documento; las filas no importables quedan listadas con su motivo (tipo de DTE, RUT, sin fecha, sin folio, total cero, repetido).
- Paso 2: columna izquierda con todo el registro (nombre, folio, fecha y monto; filtros pendientes/registrados/todos y búsqueda; ★ nuevo = sin ficha). Al elegir una línea aparece "Importar"; el panel derecho muestra el documento y, al importar, la edición de glosa, vencimiento, líneas (cuenta, descripción, monto, centro de costo, tipo) y forma de cobro en ventas.
- Cuenta y centro por defecto desde la ficha del auxiliar (si no hay ficha: último uso; en ventas, la cuenta del DTE). Al escribir la cuenta o el centro en una línea se copian a las líneas vacías; la diferencia de $1 por redondeo del emisor se acepta sola mientras no se cambie a mano.
- Auxiliar nuevo: opción (marcada) de crear su ficha al contabilizar con la cuenta y el centro de la primera línea; desde ahí son los valores por defecto, también para los demás documentos del mismo RUT en la lista. Con ficha existente se puede marcar que la cuenta y centro usados pasen a ser los nuevos valores por defecto.
- Recién al "Contabilizar y pasar al libro" se registra el documento y su asiento (importarDocumento → registrar_documento + guardar_auxiliar). Después se selecciona el siguiente pendiente.
- Se quitó la grilla con cuenta masiva y la ventana modal del paso 2 (detalle-modal.tsx).
- Pantalla Registros → Proveedores y Clientes (/fichas): búsqueda, filtro sin cuenta, nueva ficha y edición.

## Centros de costo en el RCV (10i)
- Error corregido: 'insert or update on table "asiento_lineas" violates foreign key constraint' al contabilizar el RCV. Causa: la propuesta de cuenta y centro por RUT (consultarPrevios) leía datos.dist[0].cc de los documentos importados, que traen el id del sistema anterior (p. ej. cc_mu188amoxkl), no el código (AGRI). El selector lo mostraba como "Sin centro de costo", pero se enviaba igual. Sólo fallaban las cuentas que admiten centro.
- consultarPrevios traduce el centro al código vigente (o lo deja vacío si no existe).
- SelectorCC muestra un valor desconocido como "⚠️ X (no existe)" en vez de esconderlo; la grilla del importador lo marca como error antes de enviar.
- La base traduce y valida el centro (migración 0020; se entregó como 0018 en el 10i y se renumeró a 0020 porque la 0019 ya estaba aplicada).

## Editar comprobantes (10h)
- Botón ✏️ Editar en el comprobante (/asientos/[id]) y acceso directo en cada asiento del libro diario (sólo admin y contador, vigente, mes abierto; la apertura lleva a Balance de apertura).
- Pantalla /asientos/[id]/editar: fecha (mismo año), glosa, cuentas, montos, detalle por línea, centro de costo y auxiliar (RUT, tipo, folio); motivo opcional para el registro de actividad.
- Advertencia en vivo y confirmación al guardar si el comprobante tiene documento (RCV o manual) y los montos dejan de coincidir: total, IVA (1108002/1108008 en compras, 2103003 en ventas) o saldo del proveedor/cliente por RUT (src/motor/edicion.ts, con pruebas).
- Debe y Haber: columnas para 13 caracteres ("9.999.999.999") alineadas a la derecha, con miles al digitar y tope de 10 dígitos (ANCHO_MONTO y milesInput en src/lib/formato.ts), en editar, nuevo asiento, comprobante impreso y libro diario.

## F29 en orden (10g)
- Columna Declarado: formato de miles al digitar; las casillas vacías muestran el calculado en gris. Arreglo: antes "5.887.130" se guardaba como 6 (el servidor leía el punto como decimal); ahora `montoDeclarado` (src/tributario/f29.ts) quita los separadores.
- Marcar presentado: los códigos sin valor digitado se presentan con lo calculado; si el 91 no se digitó, se recalcula como 89 + 62 + 151 + 48 de lo declarado.
- Orden de pasos: 1. Declaración → 2. Compensación de IVA (aparece al presentar) → 3. Pago (aparece al generar la compensación, o si el mes no tiene IVA que compensar). Si el mes ya tiene esos asientos (p. ej. importados), se muestran igual.
- Montos del pago derivados de lo declarado al presentar (sin quedar pegados a lo calculado); formato de miles.
- Aviso si el IVA declarado (89) difiere del calculado: la compensación salda los libros con lo calculado.
- Cód. 151: además de las boletas de Honorarios, toma la retención contabilizada en 2103002 (abonos netos fuera de asientos tributario, cierre y apertura) en los meses sin boletas. Cód. 48: sigue saliendo del asiento del libro de remuneraciones (2104002); sin libro cerrado en el mes, queda en 0.

## Balance de apertura (10f)
- Pantalla Configuración → Balance de Apertura (/apertura?anio=AAAA). Muestra la apertura vigente del año (enlace al comprobante), las anuladas y si el año está bloqueado.
- Editor de líneas con cuenta, debe, haber, auxiliar (RUT, tipo, folio) y glosa; totales de activo y de pasivo más patrimonio.
- Pegar desde Excel (src/motor/apertura.ts, con pruebas): cuenta, debe, haber [, RUT, tipo, folio, glosa] o cuenta y saldo con signo; admite columna de nombre, montos chilenos, paréntesis como negativo, y omite encabezados, totales y ceros.
- Saldar la diferencia contra una cuenta de patrimonio (por defecto 2303001).
- Si el año anterior está cerrado y no hay apertura, ofrece generarla desde ese cierre (generar_apertura).
- Motivo: la primera carga de La Cabaña 2026 vino con la hoja Apertura vacía, así que el balance no mostraba capital ni saldos iniciales.

## Tema claro (10e)
- Paleta clara azul grisácea en src/app/globals.css (`:root[data-theme='claro']`), con las mismas variables que el tema oscuro, que sigue siendo el de defecto.
- Variables nuevas: info (antes sky fijo), velo (fondo de las ventanas modales) y sobre-acento (texto de los botones principales). Los 57 `amber-500` fijos pasaron a `aviso`, que en claro es un ámbar más oscuro y legible.
- Botón ☀️/🌙 en la barra superior y en las pantallas de acceso (src/components/tema.tsx). La elección se guarda en la cookie `tema` (1 año) y un script en <head> (src/lib/tema.ts) la aplica antes de pintar, sin parpadeo.
- Impresión sin cambios: siempre blanco y negro.

## Pantallas
- Acceso: login, registro y recuperación de contraseña.
- Empresas: selector de empresas.
- Por empresa:
  - Inicio.
  - Registros:
    - Libro de Ventas, Libro de Compras, Importar RCV, Nuevo documento, Honorarios.
    - Remuneraciones: trabajadores, ficha, asistencia, vacaciones, libro del mes (LRE y Previred), contratos, finiquitos, liquidación imprimible, parámetros.
    - Pagos y cobros, Auxiliares (con estado de cuenta), Comprobantes (nuevo asiento), Asientos tipo.
  - Inventario: existencias, movimientos, tomas físicas, órdenes de compra, productos, bodegas y grupos.
  - Reportes: Libro diario (filtro de mes, anulación), Libros compra y venta (XML IECV), Hojas foliadas SII, Libro mayor, Balance general, Resultados, Balance 8 columnas, Flujo de caja, Conciliación bancaria.
  - Tributario SII: Formulario 29 y PPM, Declaración de renta (F22: RLI, formulario, ajustes y créditos, Excel), Declaraciones juradas.
  - Activo fijo: fichas, depreciación del año y contabilización.
  - Cierre de ejercicio: cierre del ejercicio.
  - Configuración: Empresas, Empresa (admin), Centros de costo, Asignar centros de costo, Plan de cuentas, Balance de apertura, Importar respaldo (admin), Exportar a Excel, Usuarios (admin), Registro de actividad (admin).
  - Búsqueda global (Ctrl+K) en la barra lateral.

## Notas técnicas
- PostgREST devuelve como máximo 1.000 filas por consulta; se usa `traerTodo` (src/lib/paginar.ts) para leer por páginas.
- Usuarios registrados antes de la migración 0001 no tienen fila en `perfiles` y `crear_empresa` falla con `miembros_perfil_fk`. Se corrige una vez con:
  `insert into public.perfiles (id, email, nombre) select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'nombre', split_part(u.email, '@', 1)) from auth.users u on conflict (id) do nothing;`
- Supabase aplica las migraciones desde GitHub (integración con la rama main): revisar en Database > Migrations que estén de la 0001 a la 0014.
- El saldo de vacaciones usa los eventos de vacaciones de todos los años (eventosVacaciones), no solo los del año consultado.

## Estado de la marcha blanca
- 18/10/2026: importado el respaldo 2026 de Soc. Agrícola y Forestal La Cabaña Ltda. (971 asientos, debe del año $8.669.251.867).
- 18/10/2026, cuadre del Balance General contra el respaldo del mismo día (978 asientos, 972 vigentes, debe $9.287.054.671):
  - Resultado del ejercicio idéntico: $2.472.841.122. Activos de resultado, ventas, compras y remuneraciones cuadran.
  - Diferencia 1: falta en Next el N° 2048 "Pago proveedores Enero 2026" (Banco de Chile contra Proveedores, $617.802.804). Es el único asiento con celdas partidas (__2); la carga se hizo antes del arreglo 10b.
  - Diferencia 2: Next tiene duplicadas la compensación de IVA de enero y febrero y el pago F29 de enero (generados en la pantalla F29 porque los importados venían sin origen_id). Afecta 1101201, 1108002, 2103003, 2103005 y 2104002.
  - Solución: con 10d desplegado, anular en Next esos asientos generados en el F29, Eliminar importación 2026 y volver a importar el respaldo. Después, repetir el cuadre.

## Próximas fases
- Ingresar la apertura 2026 de cada empresa en Configuración → Balance de Apertura (saldos al 31-12-2025 del sistema actual o del balance tributario) y repetir el cuadre.
- Reimportar La Cabaña 2026 con 10d y repetir el cuadre (script de comparación: respaldo vs PDF del Balance General).
- Importar el resto de empresas y años, y comparar cifras con el sistema actual hasta validarlas.
- Opcional: traer al F29 nuevo los F29 declarados del sistema actual (f29Detalle.declarado de los asientos ivaf29) como presentados, para que el remanente arrastre igual.
- Pendientes menores: usar las fichas en las órdenes de compra (hoy salen de las compras), rechazo de gastos desde el documento de compra y asientos contables del inventario (hoy es auxiliar, igual que el sistema actual).
