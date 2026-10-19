# Excel

Plantilla, exportación e importación comparten un único esquema (`src/lib/excel/schema.ts`). Un libro exportado completo se puede reimportar tal cual.

## Plantilla

`GET /api/excel/template` → `ZYBERNA_Plantilla_Clientes.xlsx`

Hojas: `INSTRUCCIONES`, `CLIENTES`, `CONTRATACIONES`, `PRESTACIONES`, `COBROS`, `CATALOGOS`.

- Cabeceras obligatorias en oscuro; cada cabecera tiene una nota con su descripción.
- Validaciones de lista (estado, tipo de cobro, periodicidad, unidad, categoría, moneda) contra `CATALOGOS`, y validaciones de fecha e importe en las primeras 500 filas.
- Formatos `dd/mm/yyyy` y `#,##0.00`, paneles inmovilizados y autofiltro.
- Las filas de ejemplo usan códigos `EJEMPLO-…` y se ignoran al importar.

Columnas añadidas respecto a la propuesta inicial, porque el modelo las necesita: `impuesto_pct`, `intervalo_cada`, `intervalo_unidad` y `responsable` en CONTRATACIONES, e `impuesto_pct` y `moneda` en COBROS.

Catálogo comercial (19/10/2026), todas opcionales para que los libros anteriores sigan siendo válidos: `proyecto`, `variable_pct` y `variable_base` (beneficios, ingresos o facturacion) en CONTRATACIONES, y `tarifa_catalogo` (solo exportación, se ignora al importar). `servicio` admite el nombre o el identificador estable del catálogo (p. ej. `seo_local`). La modalidad es `tipo_cobro` + `periodicidad`; el precio de la fila es el **acordado**. Las prestaciones siguen en PRESTACIONES.

## Relaciones

`codigo_cliente` → CLIENTES; `codigo_contratacion` → CONTRATACIONES. Se pueden referenciar registros que ya existan en la aplicación. Los códigos (`CLI-0001`, `CON-0001`, `COB-00001`) se generan automáticamente en la aplicación y se exportan, de modo que cualquier exportación conserva las relaciones.

## Importación

Asistente en *Importar / Exportar*: subir → leer → validar estructura → validar filas → relaciones → duplicados → previsualizar → confirmar → importar → resultado.

`POST /api/excel/import` (multipart: `file`, `mode`, `action`, `confirm_update`):

- `action=analyze`: devuelve errores (hoja, fila, columna, motivo), avisos, plan (nuevos / existentes) y previsualización.
- `action=commit`: **vuelve a leer y validar en servidor** (no confía en el análisis previo) y llama a `import_workbook()`, que se ejecuta en una sola transacción: si algo falla, no se guarda nada.

Reglas destacadas:

- **El .xlsx se procesa en el navegador** (ExcelJS cargado bajo demanda en `src/lib/excel/client.ts`): plantilla y exportaciones se generan localmente a partir de JSON (`/api/excel/template`, `/api/excel/export`), y la importación se lee y valida en el navegador para la previsualización. Al confirmar se envían solo las filas en JSON; el servidor **vuelve a validar** con `validateWorkbook` y el estado actual de la BD, y la RPC `import_workbook` importa en una única transacción (además comprueba membresía, tipos, enums, claves foráneas, unicidad y CHECK). El Worker no descomprime ni genera archivos.
- Solo `.xlsx`: se comprueba la firma ZIP (no el nombre ni el MIME). Se rechazan libros con macros (`vbaProject.bin`), archivos de más de 4 MB, más de 5.000 filas por hoja o 15.000 en total.
- Las fórmulas **no se evalúan**: una celda con fórmula es un error ("pega solo los valores").
- Códigos duplicados dentro del archivo → error. Códigos existentes → **se omiten** por defecto; para actualizarlos hay que elegir "Actualizar" y marcar la confirmación explícita (también exigida en servidor).
- Posibles duplicados sin código coincidente (mismo email o nombre que un cliente existente) → aviso.
- Una contratación o cobro existente no puede cambiar de cliente mediante importación.
- COBROS: el estado se deriva de los importes; `anulado` se aplica tal cual; `cobrado` sin importe → se registra el total; el importe cobrado genera un movimiento en `payment_transactions`. En modo actualización, la diferencia con lo ya cobrado se registra como movimiento de pago o de ajuste.
- PRESTACIONES: se sustituyen solo para contrataciones creadas o actualizadas en ese lote.
- **Reglas del catálogo**: las mismas que en los formularios (planes alternativos, incompatibilidades y dependencias por cliente y proyecto), teniendo en cuenta las contrataciones vivas que ya existen. Cada error indica la fila de CONTRATACIONES y el código con el que choca; la BD lo vuelve a comprobar dentro de la transacción.

## Exportación

`GET /api/excel/export?type=all|clients|contracts|payments` (+ filtros de los listados: `q`, `status`, `owner`, `archived`, `client`, `from`, `to`).

- `all` genera CLIENTES, CONTRATACIONES, PRESTACIONES, COBROS y CATALOGOS, compatible con la importación.
- Protección frente a inyección de fórmulas: los textos que empiezan por `=`, `@`, tabulador, retorno o `+`/`-` seguido de algo que no sea un número se prefijan con `'`. El importador elimina ese prefijo, así que el contenido sobrevive a la ida y vuelta.

## Pruebas

`tests/unit/excel.test.ts` construye libros reales con ExcelJS y comprueba: la estructura de la plantilla, la ida y vuelta exportación → reimportación (relaciones, importes exactos, fechas, textos saneados), que reimportar no crea duplicados, los errores con hoja/fila/columna, el rechazo de fórmulas, macros y formatos no admitidos. La transacción en base de datos se prueba con el E2E `flows.spec.ts`.
