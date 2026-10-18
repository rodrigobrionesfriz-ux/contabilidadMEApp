# Contabilidad ME · versión Next.js + PostgreSQL (Supabase)

Proyecto **nuevo e independiente** del sistema actual. El sistema de GitHub Pages + Firebase no se toca y sigue siendo el oficial hasta que esta versión cuadre en paralelo.

## Estado: fase 10 (herramientas): migración funcional completa

| Pieza | Estado |
|---|---|
| Base PostgreSQL con aislamiento por empresa (RLS) | ✅ |
| Asientos con correlativo atómico, cuadratura, cuentas imputables, auxiliares y centros de costo validados **en la base** | ✅ |
| Anulación (conserva el N°, excluye saldos) y cierre/reapertura de períodos | ✅ |
| Roles por empresa: admin / contador / consulta | ✅ |
| Login con Supabase Auth: ingreso, registro, recuperación de contraseña | ✅ |
| Selector de empresas, creación de empresa con plan de cuentas base (295 cuentas) | ✅ |
| Plan de cuentas, libro diario, nuevo asiento manual | ✅ |
| Motor contable (compras, ventas, honorarios) en TypeScript, idéntico al actual | ✅ 29 casos verificados contra el motor actual |
| **Importador del respaldo Excel** del sistema actual (un año por archivo), con verificación de saldos | ✅ fase 1 |
| Libro mayor y balance tributario de 8 columnas | ✅ fase 1 |
| Usuarios por empresa, datos de empresa, centros de costo (2 niveles), edición del plan de cuentas | ✅ fase 1 |
| **Importador RCV** de compras y ventas (paso 1 por lote, paso 2 documento por documento con validador) | ✅ fase 2 |
| Libro de compras y ventas por período, anulación de documentos, ingreso manual de documentos | ✅ fase 2 |
| **Honorarios**: boletas con o sin retención (tasa por año), pendientes o pagadas al contado | ✅ fase 3 |
| **Auxiliares** de proveedores, clientes y honorarios con saldo por documento y aging | ✅ fase 3 |
| **Pagos y cobros** de varios documentos en un asiento, con pago parcial y tope al saldo | ✅ fase 3 |
| **F29 y PPM**: códigos calculados desde los libros, remanente reajustado por UTM, declaración (borrador/presentado), asiento de compensación de IVA y de pago | ✅ fase 4 |
| **Remuneraciones**: fichas de trabajadores, asistencia (licencias, permisos, vacaciones, horas), anticipos, liquidación imprimible, libro del mes con cierre y asiento de centralización, parámetros previsionales | ✅ fase 5a |
| **LRE** para Mi DT y archivo **Previred** (formato 58) con validación; **vacaciones** (feriado legal, progresivos y feriados); **finiquitos** con cálculo, plantillas editables (también desde Word), documento imprimible y asiento | ✅ fase 5b |
| **Contratos de trabajo**: datos para el registro en Mi DT con validación, CSV de carga masiva (uno por cargo), plazo de registro, contrato desde plantillas por cargo, impresión y Word, plantillas editables que se bajan y suben en Word con revisión de marcadores | ✅ fase 5c |
| **Estados financieros**: balance general y estado de resultados estructurado (margen bruto, resultado operacional, impuesto según régimen), comparativo con otro año, imprimibles | ✅ fase 6 |
| **Activo fijo**: fichas con depreciación contable y tributaria por separado (lineal o acelerada, prorrateo mensual), vínculo con la factura y asiento anual de depreciación | ✅ fase 7 |
| **Flujo de caja** realizado (por mes) y proyectado (saldos pendientes por vencimiento); **conciliación bancaria** con carga de cartola Excel/CSV y conciliación automática por monto | ✅ fase 7 |
| **Renta anual (F22)**: renta líquida imponible desde la contabilidad (agregados, deducciones, gastos rechazados por cuenta o por movimiento, depreciación tributaria desde las fichas, pérdida de arrastre), renta presunta, impuesto de primera categoría, créditos, PPM del F29 y Excel | ✅ fase 8 |
| **Declaraciones juradas**: catálogo editable por empresa (semilla AT 2026), estado y folio por año tributario, semáforo de vencimiento y cifras de control (sueldos, honorarios, balance, RLI) | ✅ fase 8 |
| **Inventario**: productos (con importación desde Excel), bodegas, grupos, movimientos (entradas, salidas, traspasos) con lotes y vencimientos, existencias y costo promedio ponderado reconstruidos desde el libro, tomas físicas con autorización y ajuste automático, órdenes de compra con recepciones parciales y conciliación con la factura de compras | ✅ fase 9 |
| **Herramientas**: asientos tipo (plantillas con distribución por porcentaje, copiables a otra empresa), asignación de centros de costo en bloque, estado de cuenta por auxiliar (imprimible y Excel), detalle de imposiciones del mes (Excel), XML IECV de compras y ventas, libros en hojas foliadas (rangos, reserva atómica, prueba de alineación, control), búsqueda global (Ctrl+K), comprobante contable imprimible, registro de actividad y exportación a Excel | ✅ fase 10 |
| **Cierre**: cierre y reapertura de meses, provisiones de incobrables y feriado (sugerida desde vacaciones), corrección monetaria referencial, cierre del ejercicio con reapertura auditada y apertura automática del año siguiente | ✅ fase 6 |

## 1. Crear el proyecto en Supabase (una vez)

1. Entra a <https://supabase.com>, crea una cuenta y luego **New project**:
   - Plan: Free.
   - Región: **South America (São Paulo)**.
   - Guarda la contraseña de la base en un lugar seguro.
2. En **SQL Editor**, ejecuta **en orden** el contenido de:
   1. `supabase/migrations/20261017000001_esquema_base.sql`
   2. `supabase/migrations/20261017000002_pdc_plantilla.sql`
   3. `supabase/migrations/20261018000003_fase1_importacion.sql`
   4. `supabase/migrations/20261018000004_fase2_documentos.sql`
   5. `supabase/migrations/20261018000005_fase3_auxiliares.sql`
   6. `supabase/migrations/20261018000006_fase4_f29.sql`
   7. `supabase/migrations/20261018000007_fase5_remuneraciones.sql`
   8. `supabase/migrations/20261018000008_fase5b_finiquitos.sql`
   9. `supabase/migrations/20261018000009_fase5c_contratos.sql`
   10. `supabase/migrations/20261018000010_fase6_cierre.sql`
   11. `supabase/migrations/20261018000011_fase7_activo_tesoreria.sql`
   12. `supabase/migrations/20261018000012_fase8_renta_dj.sql`
   13. `supabase/migrations/20261018000013_fase9_inventario.sql`
   14. `supabase/migrations/20261018000014_fase10_herramientas.sql`

   Cada archivo se ejecuta **una sola vez**. Si ya ejecutaste los anteriores, ejecuta sólo los nuevos.

   Si usas la CLI de Supabase, también sirve `supabase link` + `supabase db push`.
3. En **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` mientras pruebas. Cuando publiques, cámbiala por la URL de Vercel.
   - Redirect URLs: agrega `http://localhost:3000/**` y luego `https://TU-APP.vercel.app/**`.
4. Recomendado: en **Authentication → Email Templates**, cambia el enlace de estas dos plantillas para que los correos funcionen aunque se abran en otro navegador:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/empresas`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/actualizar-clave`
5. En **Project Settings → API Keys**, copia la **Project URL** y la **Publishable key**.

> El plan gratis pausa el proyecto tras 7 días sin uso. Se reactiva desde el panel y los datos no se pierden.

## 2. Correr en tu computador

Necesitas Node.js 20.9 o superior.

```bash
npm install
cp .env.example .env.local   # completa URL y publishable key
npm run dev                  # http://localhost:3000
```

Crea tu cuenta en `/registro`, confirma el correo y luego crea tu primera empresa. Quedarás como administrador.

Para sumar a otra persona: primero ella crea su cuenta y después un administrador la agrega en **Configuración → Usuarios** con su correo.

### Traer los datos del sistema actual

1. En el sistema actual, abre la empresa y el año, entra a **⚙️ Sistema y Respaldos** y usa **📥 Exportar Excel**.
2. En el sistema nuevo, crea la empresa con el mismo RUT y entra a **Configuración → Importar respaldo**.
3. Sube el archivo y revisa el resumen. Si hay errores (asientos descuadrados, cuentas inexistentes), corrígelos en el sistema actual y exporta de nuevo.
4. Importa. Al terminar, el sistema compara el saldo de cada cuenta con el respaldo.
5. Compara el **Balance 8 columnas** con el balance del sistema actual.

### Registrar compras y ventas del mes

1. En el SII descarga el **Detalle** del Registro de Compras (o Ventas) del mes, en CSV o Excel.
2. Entra a **Registro → Importar RCV**, elige Compras o Ventas y sube el archivo.
3. Revisa el período, asigna cuenta y centro de costo (en lote o fila por fila). Para varias cuentas, descripciones u otros impuestos, usa **✏️ Detalle** (paso 2): no deja guardar si las líneas no cuadran con el RCV.
4. **Contabilizar**. Cada documento queda con su asiento; los ya registrados se detectan y no se duplican.
5. Revisa el **Libro de compras y ventas**. Para corregir un documento, anúlalo (anula su asiento) y regístralo de nuevo.

### Remuneraciones del mes

1. En **Registro → Remuneraciones**, crea los trabajadores o impórtalos desde el respaldo Excel del sistema actual (hoja Trabajadores). El respaldo no trae modo de gratificación, fechas de contrato ni cargas: complétalos en cada ficha.
2. Revisa **Parámetros** (topes, tasas AFP, SIS, mutual). Sólo el administrador los cambia.
3. En **Asistencia** registra licencias, permisos, ausencias y vacaciones; para trabajadores por hora, las horas del mes.
4. Los anticipos se ingresan en la ficha y se descuentan en el mes indicado (opcionalmente con su asiento de pago).
5. En **Libro del mes** confirma UF y UTM (con coma decimal, por ejemplo 39.383,07) y **Cerrar libro**: guarda la foto del mes y genera el asiento de centralización. El impuesto único de ese asiento llega al código 48 del F29. Para rehacerlo, un administrador lo reabre (anula el asiento).

### Declarar y finiquitar

- **LRE y Previred:** en **Libro del mes**, sección *Declarar el mes*. Cada botón valida y, si no hay errores, descarga el archivo (CSV para Mi DT, TXT para Previred, ambos en ANSI). Los errores muestran el trabajador y el campo a corregir en su ficha (región, comuna, fecha de inicio, sexo, nombres y apellidos, N° FUN de Isapre).
- **Vacaciones:** registra las vacaciones tomadas y, para quienes ya tenían días tomados antes, el saldo inicial (⚙️). Los feriados nacionales se calculan solos; el administrador agrega los regionales o elecciones.
- **Contratos:** en la pestaña *Contratos* completa los *Datos DT* de cada trabajador (nacimiento, domicilio, funciones, jornada); la lista muestra qué falta y hasta cuándo registrarlo. Selecciona los completos y descarga el CSV para Mi DT (un archivo por cargo); después se marcan como informados. *📄 Contrato* arma el documento con la plantilla del cargo, para imprimir o bajar en Word. En *Plantillas* se editan, se asocian a cargos y se bajan y suben en Word: al subir se revisa que los {{marcadores}} sigan intactos.
- **Finiquitos:** elige trabajador, fecha y causal; la vista previa calcula feriado proporcional, aviso previo, años de servicio (tope 90 UF y 11 años) y descuento AFC. Al guardar se ve el documento listo para imprimir; después se marca como ratificado y se contabiliza (un asiento por finiquito; para rehacerlo, anula el asiento).

### Cerrar el año

1. En **Configuración → Empresa** elige el régimen tributario (define la tasa del impuesto estimado y el aviso de corrección monetaria).
2. En **Reportes → Cierre del ejercicio** registra las provisiones (incobrables y feriado; la de feriado se sugiere con el saldo de vacaciones de cada trabajador).
3. Revisa **Reportes → Estados financieros** (balance general y estado de resultados, con comparativo).
4. **Cerrar ejercicio**: salda ingresos y gastos contra 2303001 Resultados acumulados al 31 de diciembre y cierra los 12 meses. Para reabrir hace falta un motivo (queda en auditoría).
5. **Generar apertura** del año siguiente: asiento N° 0 al 1 de enero con los saldos de balance; en clientes, proveedores y honorarios conserva cada documento con saldo.
6. En **Reportes → Renta anual (F22)** revisa la RLI del año, marca los gastos rechazados y guarda; **Declaraciones juradas** lleva el control de presentación.

Se importa un año por archivo; para varios años, repite con cada respaldo. Si necesitas rehacer un año, usa **Eliminar importación** (sólo borra datos importados y se niega si ya registraste asientos nuevos en ese año).

## 3. Publicar (GitHub + Vercel)

GitHub guarda el código; **GitHub Pages no sirve para esta versión** porque Next.js necesita un servidor (login, acciones, proxy). Vercel lo publica gratis y se actualiza solo con cada push.

Cada push a `main` corre además la verificación automática en GitHub Actions (`.github/workflows/ci.yml`): lint, pruebas y build.


1. Sube esta carpeta a un **repositorio nuevo** de GitHub (no al del sistema actual).
2. En <https://vercel.com>, haz **Add New → Project** y elige el repositorio.
3. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`, con la URL final.
4. Despliega. Después agrega esa URL en Supabase (paso 1.3).

## Pruebas

```bash
npm test          # motor, lector RCV y validador (casos de oro del sistema actual), importador, base de datos en PGlite
npm run typecheck
npm run lint
```

Las pruebas de base de datos levantan un PostgreSQL embebido (PGlite) con las migraciones reales, así que no necesitan Supabase.

## Estructura

```
supabase/migrations/   Esquema SQL, RLS y funciones (crear_empresa, crear_asiento, anular_asiento, cerrar_periodo…)
db/__tests__/          Pruebas SQL con PGlite
src/motor/             Lógica contable pura (traslado 1:1 del sistema actual) + casos de oro
src/importador/        Lectura del respaldo Excel y plan de carga (reproduce genDiario del sistema actual)
src/rcv/               Lector del RCV del SII, validador del paso 2 y armado de documento + asiento
src/auxiliares/        Saldos por documento (ligados, NC con referencia, FIFO), aging y armado de pagos
src/honorarios/        Boleta de honorarios con el motor del sistema actual
src/tributario/        F29 (traslado de calcularF29Anual), UTM, asientos de compensación y pago, renta anual (renta.js) y declaraciones juradas (djrenta.js)
src/activo-fijo/       Depreciación contable y tributaria (traslado de activofijo.js)
src/tesoreria/         Flujo de caja y conciliación bancaria
src/herramientas/      Asientos tipo, imposiciones, XML IECV y hojas foliadas (traslados del sistema actual)
src/inventario/        Motor de inventario (PPP, lotes, tomas), órdenes de compra, importador de productos y conciliación con compras
src/estados/           Balance general, estado de resultados, comparativo y regímenes tributarios
src/remuneraciones/    Parámetros, asistencia, liquidación, libro y asiento; LRE, Previred, vacaciones, finiquitos y contratos (traslados del sistema actual)
src/lib/               Supabase (servidor/proxy), sesión y empresa activa, formatos CLP
src/proxy.ts           Refresca la sesión y protege rutas
src/app/(auth)/        Ingreso, registro, recuperación
src/app/(app)/         Empresas y módulos por empresa (/e/[empresaId]/…)
scripts/               Generador del plan de cuentas base
```

## Principios

- **La base es la autoridad.** Aunque alguien salte la interfaz, PostgreSQL rechaza asientos descuadrados, cuentas agrupadoras, períodos cerrados o accesos a otra empresa.
- **Nunca se borra un asiento numerado.** Se anula con motivo y queda en auditoría.
- **Mismo resultado que el sistema actual.** Cada cálculo migrado se compara contra salidas reales del motor actual antes de darlo por bueno.
