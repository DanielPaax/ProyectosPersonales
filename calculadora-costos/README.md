# Calculadora de costos y precios · TOGOMA-CO

Calculadora para impresión 3D y carpintería: costos, precio con margen, cotizaciones guardadas y PDF para el cliente y de desglose interno.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La calculadora completa (una sola página, sin dependencias). |
| `Code.gs` | Script de Google Apps Script que guarda cotizaciones y tarifas en un Google Sheet. |

`index.html` funciona de dos maneras:

- **Suelto** (doble clic en el archivo): guarda en el navegador. Sirve para una sola persona y un solo equipo.
- **Dentro de Apps Script**: guarda en Google Sheets, compartido con el equipo. Detecta solo en cuál está.

## Instalación con Google Sheets

1. Crea un Google Sheet **nuevo** (por ejemplo «Cotizaciones TOGOMA-CO») y abre **Extensiones → Apps Script**. Usa un Sheet aparte de otros proyectos, porque `Code.gs` define `doGet` y `onOpen`.
2. Reemplaza el contenido de `Código.gs` con el de **Code.gs**.
3. Crea un archivo HTML (**+ → HTML**) llamado exactamente `Calculadora` y pega el contenido completo de **index.html**.
4. Guarda y recarga el Sheet. Aparece el menú **🧮 Calculadora**. Corre **Preparar hojas** y autoriza el script la primera vez.
5. **Implementar → Nueva implementación → Aplicación web**:
   - *Ejecutar como*: **Usuario que accede a la aplicación web**.
   - *Quién tiene acceso*: **Cualquier usuario con cuenta de Google** (o solo tu dominio, si usas Workspace).
6. Comparte el Sheet (con permiso de **Editor**) con las personas que usarán la calculadora, y pásales el link de la aplicación web. Cada persona autoriza el script la primera vez.

Quien no tenga acceso al Sheet no puede ver ni guardar nada: los costos y márgenes quedan protegidos por los permisos del Sheet.

Cuando cambies `index.html`, vuelve a pegarlo en `Calculadora` y publica una **nueva versión** de la implementación (Implementar → Administrar implementaciones → editar → Versión nueva).

## Qué se guarda y dónde

- **Hoja `Cotizaciones`**: una fila por cotización (folio, fecha, cliente, trabajo, costo, total, utilidad, margen, estado, quién la creó y modificó). Sirve para filtrar y hacer tablas dinámicas. La cotización completa vive en la columna oculta «Datos»: **no la edites ni borres columnas**. El **Estado** sí se puede cambiar a mano en el Sheet.
- **Hoja `Config`**: tarifas (mano de obra, kWh, margen, IVA, datos de la empresa…) y contador de folios. Todo el equipo usa las mismas tarifas.
- **Folios**: los asigna el servidor (`COT-AAAAMMDD-001`…), así que no se repiten aunque dos personas guarden a la vez.
- **Ediciones simultáneas**: si dos personas editan la misma cotización, la segunda que guarde recibe un aviso antes de pisar los cambios de la primera.
- **Borradores**: lo que estás capturando (sin guardar) queda solo en tu navegador.
- **Cotizaciones viejas del navegador**: la primera vez que abras la versión con Sheets, en la pestaña Cotizaciones aparece un aviso para subirlas (con folios nuevos).

## Límites

- Una cotización completa debe pesar menos de ~45,000 caracteres (una celda de Sheets admite 50,000). Una cotización normal usa unos 3,000.
- El PDF de una cotización nueva la guarda primero, para que el folio del documento sea el definitivo.
