# Calculadora de costos y precios · TOGOMA-CO

Calculadora para impresión 3D y carpintería: costos, precio con margen, cotizaciones guardadas y PDF para el cliente y de desglose interno.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La calculadora completa (una sola página, sin dependencias). |
| `Code.gs` | Script de Google Apps Script que guarda cotizaciones, tarifas y el inventario en un Google Sheet. |

`index.html` funciona de dos maneras:

- **Suelto** (doble clic en el archivo): guarda en el navegador. Sirve para una sola persona y un solo equipo.
- **Dentro de Apps Script**: guarda en Google Sheets, compartido con el equipo. Detecta solo en cuál está.

## Inventario de materiales

La pestaña **Inventario** es el catálogo de materiales: se agregan, modifican y eliminan ahí. Con Google Sheets, el catálogo vive en la hoja **Materiales** y también puedes escribir o pegar filas directo en el Sheet (la calculadora les asigna su ID al abrirla).

| Campo | Qué es |
|---|---|
| Material / Marca / Proveedor | Datos para identificarlo. |
| Presentación | Cuánto trae lo que compras: `1000` si la bobina es de 1000 g, `1` si es una hoja de triplay, `4` si es una cubeta de 4 l. |
| Unidad | g, kg, hoja, l, m, pza… |
| Costo presentación | Lo que pagas por esa presentación. |
| Costo por unidad | Se calcula solo: costo de la presentación ÷ presentación. |
| Área | 3D, Carpintería o Ambos: define en qué listas aparece. |

En **Impresión 3D**, cada fila de filamento se elige del inventario (solo materiales con unidad g o kg) y se capturan los **gramos**: el costo sale de gramos × costo por unidad, convertido a kg si el material está en kg. En **Carpintería**, cada material se elige del inventario y se captura la cantidad en su unidad (por ejemplo, 2 hojas). También puedes dejar «Manual / otro» y escribir el costo a mano. Si cambias un precio en el inventario, el cálculo se actualiza; las partidas ya agregadas a una cotización conservan su precio hasta que las edites.

## Cómo se arma una cotización

Todo se hace en una sola pantalla, la pestaña **Cotización**, en este orden:

1. **Cliente**: elige uno de tu catálogo (se llenan solos nombre, RFC, dirección y datos de cuenta) o captura los datos. El botón de abajo guarda o actualiza ese cliente en el catálogo.
2. **Productos (partidas)**: cada partida junta el trabajo y su material: nombre del producto, piezas, tiempo (horas y minutos), precio de venta opcional y el filamento (3D) o los materiales (carpintería) elegidos del inventario. Con **+ Añadir partida** agregas más, y cada una se puede duplicar o quitar.
3. **Mano de obra**: tareas con horas, minutos y tarifa. Se suma **una sola vez** a la cotización.
4. **Extras**: inserts, caja, flete, instalación… También se suman **una sola vez**.

La mano de obra y los extras no se le suman completos a cada partida: se **reparten en proporción a las horas de trabajo** de cada una. Ejemplo: si un producto lleva 2 h y otro 6 h, el primero absorbe 25% y el segundo 75%. Si ninguna partida tiene horas, se reparten por partes iguales. Los gastos de taller (indirectos), la electricidad, el desgaste de la máquina y la reserva por fallos se siguen calculando por las horas de cada partida.

A la derecha ves el total (con IVA), la lista de productos con su precio, el costo, la utilidad, el desglose de cada producto y cómo se repartió la mano de obra y los extras.

- **Guardar cotización** la manda a **Guardadas**, donde puedes reabrirla, duplicarla, cambiarle el estado y volver a bajar sus PDF.
- **PDF para el cliente**: datos del cliente, productos, cantidades, precios, subtotal, IVA y total.
- **Desglose interno**: costo, utilidad y margen de cada producto, el detalle de materiales, y el reparto de mano de obra y extras.

Al reabrir una cotización guardada, todo se recalcula con tus tarifas e inventario de ese momento; si el total cambió, se te avisa.

## Catálogo de clientes

La pestaña **Clientes** permite agregar, modificar y eliminar clientes (nombre, RFC, dirección y datos de cuenta). Con Google Sheets vive en la hoja **Clientes**, y también puedes escribir filas directo en el Sheet. Borrar un cliente del catálogo no cambia las cotizaciones ya guardadas.

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

Cuando cambies `index.html` o `Code.gs`, vuelve a pegarlos (`Calculadora` y `Código.gs`), corre **🧮 Calculadora → Preparar hojas** (crea las hojas `Materiales` y `Clientes` si faltan) y publica una **nueva versión** de la implementación (Implementar → Administrar implementaciones → editar → Versión nueva).

## Qué se guarda y dónde

- **Hoja `Cotizaciones`**: una fila por cotización (folio, fecha, cliente, trabajo, costo, total, utilidad, margen, estado, quién la creó y modificó). Sirve para filtrar y hacer tablas dinámicas. La cotización completa vive en la columna oculta «Datos»: **no la edites ni borres columnas**. El **Estado** sí se puede cambiar a mano en el Sheet.
- **Hoja `Materiales`**: el inventario (ver arriba).
- **Hoja `Clientes`**: el catálogo de clientes.
- **Hoja `Config`**: tarifas (mano de obra, kWh, margen, IVA, datos de la empresa…) y contador de folios. Todo el equipo usa las mismas tarifas.
- **Folios**: los asigna el servidor (`COT-AAAAMMDD-001`…), así que no se repiten aunque dos personas guarden a la vez.
- **Ediciones simultáneas**: si dos personas editan la misma cotización, la segunda que guarde recibe un aviso antes de pisar los cambios de la primera.
- **Borradores**: lo que estás capturando (sin guardar) queda solo en tu navegador.
- **Cotizaciones viejas del navegador**: la primera vez que abras la versión con Sheets, en la pestaña Cotizaciones aparece un aviso para subirlas (con folios nuevos).

## Límites

- Una cotización completa debe pesar menos de ~45,000 caracteres (una celda de Sheets admite 50,000). Cada partida ocupa entre 1,500 y 2,000, así que caben unas 20 partidas por cotización.
- El PDF de una cotización nueva la guarda primero, para que el folio del documento sea el definitivo.
