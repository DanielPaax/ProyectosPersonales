# Dashboard de Ventas y Producción (Google Sheets + Apps Script)

Plantilla de Google Sheets para el reporte semanal y el seguimiento histórico de **ventas** y **producción**, con un dashboard web hecho en Google Apps Script.

## Archivos

| Archivo | Qué es |
|---|---|
| `Code.gs` | Script que crea la plantilla (hojas, listas desplegables, fórmulas y reglas automáticas) y entrega los datos al dashboard. |
| `Dashboard.html` | Página del dashboard: filtros, indicadores, gráficas y tablas. |

## Instalación

1. Crea un Google Sheet nuevo y abre **Extensiones → Apps Script**.
2. Reemplaza el contenido de `Código.gs` con el de **Code.gs**.
3. Crea un archivo HTML (**+ → HTML**) llamado exactamente `Dashboard` y pega el contenido de **Dashboard.html**.
4. Guarda y recarga la hoja. Aparece el menú **📊 Dashboard**.
5. Corre **📊 Dashboard → Configurar plantilla** y autoriza el script la primera vez.
6. Opcional: **Cargar datos de ejemplo** para probar, y luego **Abrir dashboard**.
7. Para tener el dashboard en un link propio: **Implementar → Nueva implementación → Aplicación web**.

## Si el dashboard no se ve bien

- En el editor de Apps Script deben existir **dos** archivos: `Código.gs` y `Dashboard.html`. Si ves `Dashboard.gs`, bórralo y créalo de nuevo con **+ → HTML**.
- `Dashboard.html` debe contener el código de **Dashboard.html** (empieza con `<!DOCTYPE html>`), no el de Code.gs.
- Si aparece "No hay datos todavía", corre **Configurar plantilla** y captura datos (o **Cargar datos de ejemplo**).
- Si aparece un mensaje de error en rojo, cópialo: indica la causa exacta.

## Hojas que crea

### Ventas
Ejecutivo · Monto de venta · Clientes · Semana · Mes · Año

### Produccion
PROYECTO · CLIENTE · Producto · Máquina · Tipo de impresión · Material · Material 2 · Unidad de medida · Cantidad UNIDAD · Unidad usada real · **Merma %** · **COSTO** · Acabados · Cantidad producida · Meta de producción · Cantidad rechazada · Semana · Mes · Año

Reglas automáticas:
- **Chona, Juana, La Mary, Mimaki** → Tipo de impresión habilitado (UV, Gran Formato, HD). Otras máquinas → `NO APLICA`.
- **CNC, Cama Plana** → Material 2 habilitado. Otras máquinas → `NO APLICA`.
- Al elegir el Material, la Unidad de medida se llena sola si está vacía.
- **Merma %** = (Unidad usada real − Cantidad UNIDAD) ÷ Unidad usada real.
- **COSTO** = Unidad usada real × costo del Material (+ costo del Material 2 si aplica).
  Mensajes posibles: `SIN COSTO`, `REVISAR UNIDAD`, `MATERIAL NO EN CATÁLOGO`.

### Catalogos
Ejecutivos, productos, meses, máquinas, tipos de impresión, unidades, acabados y la tabla de **materiales con su unidad y costo** (columnas H a J). Los costos se editan ahí y todo se recalcula.

## Pendientes
- Capturar el costo de **VINIL BLANCO BRILLANTE OTRO** (1.52, 1.27 y 1.37 m) en Catalogos.
- Confirmar costos de **LAMINADOR MATTE ARLON 1.37 m** ($24) y **LAMINADOR MATTE 3M** ($83).
