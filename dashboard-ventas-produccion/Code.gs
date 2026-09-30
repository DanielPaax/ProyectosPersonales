/**
 * Dashboard de Ventas y Producción  (v3)
 * ------------------------------------------------------------
 * 1. Abre tu Google Sheet > Extensiones > Apps Script.
 * 2. Pega este archivo como "Code.gs" y crea un archivo HTML llamado "Dashboard".
 * 3. Guarda, recarga la hoja y usa el menú "📊 Dashboard" > "Configurar plantilla".
 */

const HOJA_VENTAS = 'Ventas';
const HOJA_PRODUCCION = 'Produccion';
const HOJA_CATALOGOS = 'Catalogos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* ---------- Catálogos de producción ---------- */
const MAQUINAS = ['Chona', 'Juana', 'La Mary', 'Mimaki', 'CNC', 'Laminadora', 'Cama Plana'];
const MAQ_IMPRESION = ['Chona', 'Juana', 'La Mary', 'Mimaki'];   // habilitan Tipo de impresión
const MAQ_MATERIAL2 = ['CNC', 'Cama Plana'];                      // habilitan Material 2
const TIPOS_IMPRESION = ['UV', 'Gran Formato', 'HD'];
const UNIDADES = ['m2', 'mtl', 'lamina', 'pzs'];
const ACABADOS = ['bastilla', 'ojillos', 'bolsa simple', 'bolsa reforzada', 'barniz uv', 'costura', 'solo refilado'];
const NO_APLICA = 'NO APLICA';

/**
 * Materiales: [nombre, unidad, costo por unidad (MXN)].
 * Costo null = pendiente de capturar (la columna Costo mostrará "SIN COSTO").
 * Después de configurar, los costos se editan en la hoja Catalogos (columnas H, I, J).
 */
const MATERIALES = [
  ['LONA FRONT 13 OZ', 'm2', 12.5],
  ['LONA FRONT 16 OZ', 'm2', 15.5],
  ['LONA FRONT 18 OZ', 'm2', 19.5],
  ['LONA MESH', 'm2', 14.5],
  ['VINIL BLANCO BRILLANTE BFp 1.52 m', 'm2', 18],
  ['VINIL BLANCO BRILLANTE ARLON 1.52 m', 'm2', 24],
  ['VINIL BLANCO BRILLANTE ARLON 1.27 m', 'm2', 25],
  ['VINIL BLANCO BRILLANTE ARLON 1.37 m', 'm2', 24],
  ['VINIL BLANCO BRILLANTE AVERY 1.52 m', 'm2', 25],
  ['VINIL BLANCO BRILLANTE AVERY 1.27 m', 'm2', 25],
  ['VINIL BLANCO BRILLANTE AVERY 1.37 m', 'm2', 25],
  ['VINIL BLANCO BRILLANTE OTRO 1.52 m', 'm2', null],
  ['VINIL BLANCO BRILLANTE OTRO 1.27 m', 'm2', null],
  ['VINIL BLANCO BRILLANTE OTRO 1.37 m', 'm2', null],
  ['LAMINADOR MATTE AVERY 1.52 m', 'm2', 24],
  ['LAMINADOR MATTE AVERY 1.27 m', 'm2', 24],
  ['LAMINADOR MATTE AVERY 1.37 m', 'm2', 24],
  ['LAMINADOR MATTE ARLON 1.52 m', 'm2', 24],
  ['LAMINADOR MATTE ARLON 1.27 m', 'm2', 24],
  ['LAMINADOR MATTE ARLON 1.37 m', 'm2', 24],
  ['LAMINADOR MATTE 3M 1.52 m', 'm2', 83],
  ['LAMINADOR MATTE 3M 1.27 m', 'm2', 83],
  ['LAMINADOR MATTE 3M 1.37 m', 'm2', 83],
  ['LAMINADOR MATTE GENERICO 1.52 m', 'm2', 43],
  ['LAMINADOR MATTE GENERICO 1.27 m', 'm2', 43],
  ['LAMINADOR MATTE GENERICO 1.37 m', 'm2', 43],
  ['VINIL RESPALDO GRIS BRILLANTE BFp 1.52 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE AVERY 1.52 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE AVERY 1.27 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE AVERY 1.37 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE ARLON 1.52 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE ARLON 1.27 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE ARLON 1.37 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE OTRO 1.52 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE OTRO 1.27 m', 'm2', 24],
  ['VINIL RESPALDO GRIS BRILLANTE OTRO 1.37 m', 'm2', 24],
  ['TROVICEL 3MM', 'm2', 60],
  ['TROVICEL 6MM', 'm2', 70],
  ['ESTIRENO CAL. 15', 'm2', 50],
  ['ESTIRENO CAL. 30', 'm2', 50],
  ['ESTIRENO CAL. 40', 'm2', 50],
  ['ALUCUBOND', 'm2', 566],
  ['FOAMBOARD', 'm2', 30],
  ['MDF', 'm2', 180],
  ['ACRILICO', 'm2', 500],
  ['PELÍCULA BACKLITE', 'm2', 120],
  ['LAMINA LISA METAL', 'm2', 700]
];

const ENC_VENTAS = ['Ejecutivo', 'Monto de venta', 'Clientes', 'Semana', 'Mes', 'Año'];
const ENC_PRODUCCION = ['PROYECTO', 'CLIENTE', 'Producto', 'Máquina', 'Tipo de impresión',
  'Material', 'Material 2', 'Unidad de medida', 'Cantidad UNIDAD', 'Unidad usada real',
  'Merma %', 'COSTO', 'Acabados', 'Cantidad producida', 'Meta de producción',
  'Cantidad rechazada', 'Semana', 'Mes', 'Año'];

// Posición (1-based) de cada columna en la hoja Produccion
const P = {
  proyecto: 1, cliente: 2, producto: 3, maquina: 4, tipo: 5, material: 6, material2: 7,
  unidad: 8, cantidad: 9, real: 10, merma: 11, costo: 12, acabados: 13,
  producidas: 14, meta: 15, rechazadas: 16, semana: 17, mes: 18, anio: 19
};

// Columnas en la hoja Catalogos
const CAT = {
  ejecutivos: 1, productos: 2, meses: 3, maquinas: 4, tipos: 5, unidades: 6, acabados: 7,
  material: 8, matUnidad: 9, matCosto: 10
};

const FILAS_MIN = 2000; // filas con validación preparadas
const GRIS_NA = '#eceff3';
const FONDO_CALC = '#eef6ff'; // columnas calculadas

/* ===================== MENÚ Y WEB APP ===================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Dashboard')
    .addItem('Abrir dashboard', 'abrirDashboard')
    .addSeparator()
    .addItem('Configurar plantilla', 'configurarPlantilla')
    .addItem('Reaplicar reglas de producción', 'reaplicarReglasProduccion')
    .addItem('Cargar datos de ejemplo', 'cargarDatosEjemplo')
    .addToUi();
}

/** Se ejecuta cuando publicas el script como Aplicación web. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Dashboard Ventas y Producción')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Abre el dashboard en una ventana dentro de la hoja. */
function abrirDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Dashboard')
    .setWidth(1280)
    .setHeight(820);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Dashboard Ventas y Producción');
}

/* ===================== REGLAS AUTOMÁTICAS (onEdit) ===================== */

/**
 * En la hoja Produccion:
 *  - Al elegir Máquina:
 *      Chona, Juana, La Mary, Mimaki -> Tipo de impresión habilitado (UV / Gran Formato / HD)
 *      otra máquina                  -> Tipo de impresión = NO APLICA
 *      CNC o Cama Plana              -> Material 2 habilitado; si no, NO APLICA
 *  - Al elegir Material: si Unidad de medida está vacía, se llena con la unidad del material.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== HOJA_PRODUCCION) return;
  const c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
  const r1 = Math.max(2, e.range.getRow()), r2 = e.range.getLastRow();
  if (r2 < 2) return;
  const n = r2 - r1 + 1;
  if (c1 <= P.maquina && c2 >= P.maquina) aplicarReglasRango_(sh, r1, n);
  if (c1 <= P.material && c2 >= P.material) autollenarUnidad_(sh, r1, n);
}

/** Menú: vuelve a aplicar las reglas a todas las filas capturadas. */
function reaplicarReglasProduccion() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PRODUCCION);
  if (!sh) return;
  const ultima = ultimaFilaConDatos_(sh);
  if (ultima >= 2) {
    aplicarReglasRango_(sh, 2, ultima - 1);
    autollenarUnidad_(sh, 2, ultima - 1);
  }
  SpreadsheetApp.getActive().toast('Reglas aplicadas a ' + Math.max(0, ultima - 1) + ' filas', 'Producción');
}

function aplicarReglasRango_(sh, fila, n) {
  const cat = sh.getParent().getSheetByName(HOJA_CATALOGOS);
  const vTipos = listaDesdeRango_(cat.getRange(2, CAT.tipos, TIPOS_IMPRESION.length, 1), false);
  const vMat = listaDesdeRango_(cat.getRange(2, CAT.material, cat.getMaxRows() - 1, 1), false);
  const vNA = SpreadsheetApp.newDataValidation().requireValueInList([NO_APLICA], true).setAllowInvalid(false).build();

  const maquinas = sh.getRange(fila, P.maquina, n, 1).getValues();
  const rTipo = sh.getRange(fila, P.tipo, n, 1);
  const rMat2 = sh.getRange(fila, P.material2, n, 1);
  const tipos = rTipo.getValues(), mats2 = rMat2.getValues();
  const valTipo = [], valMat2 = [], fondoTipo = [], fondoMat2 = [];

  maquinas.forEach((m, i) => {
    const maq = String(m[0]).trim();
    // Tipo de impresión
    if (maq === '' || MAQ_IMPRESION.indexOf(maq) >= 0) {
      valTipo.push([vTipos]); fondoTipo.push([null]);
      if (tipos[i][0] === NO_APLICA) tipos[i][0] = '';
    } else {
      valTipo.push([vNA]); fondoTipo.push([GRIS_NA]);
      tipos[i][0] = NO_APLICA;
    }
    // Material 2
    if (maq !== '' && MAQ_MATERIAL2.indexOf(maq) >= 0) {
      valMat2.push([vMat]); fondoMat2.push([null]);
      if (mats2[i][0] === NO_APLICA) mats2[i][0] = '';
    } else if (maq === '') {
      valMat2.push([vNA]); fondoMat2.push([null]);
      if (mats2[i][0] === NO_APLICA) mats2[i][0] = '';
    } else {
      valMat2.push([vNA]); fondoMat2.push([GRIS_NA]);
      mats2[i][0] = NO_APLICA;
    }
  });

  rTipo.setDataValidations(valTipo).setValues(tipos).setBackgrounds(fondoTipo);
  rMat2.setDataValidations(valMat2).setValues(mats2).setBackgrounds(fondoMat2);
}

/** Si la Unidad de medida está vacía, la toma del catálogo según el Material. */
function autollenarUnidad_(sh, fila, n) {
  const catalogo = leerCatalogoMateriales_(sh.getParent());
  const mats = sh.getRange(fila, P.material, n, 1).getValues();
  const rUni = sh.getRange(fila, P.unidad, n, 1);
  const unis = rUni.getValues();
  let cambio = false;
  mats.forEach((m, i) => {
    const info = catalogo[String(m[0]).trim()];
    if (info && info.unidad && unis[i][0] === '') { unis[i][0] = info.unidad; cambio = true; }
  });
  if (cambio) rUni.setValues(unis);
}

/* ===================== PLANTILLA ===================== */

function configurarPlantilla() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Catálogos ---
  const cat = obtenerHoja_(ss, HOJA_CATALOGOS);
  asegurarColumnas_(cat, 12);
  asegurarFilas_(cat, MATERIALES.length + 20);
  const yaTieneCostos = String(cat.getRange(1, CAT.matCosto).getValue()).trim() === 'Costo por unidad (MXN)';
  cat.getRange(1, 1, 1, 10).setValues([['Ejecutivos', 'Productos', 'Meses', 'Máquinas',
    'Tipo de impresión', 'Unidad de medida', 'Acabados', 'Material', 'Unidad (material)', 'Costo por unidad (MXN)']]);
  if (!cat.getRange(2, CAT.ejecutivos).getValue()) {
    escribirLista_(cat, CAT.ejecutivos, ['Ejecutivo 1', 'Ejecutivo 2', 'Ejecutivo 3', 'Ejecutivo 4']);
  }
  if (!cat.getRange(2, CAT.productos).getValue()) {
    escribirLista_(cat, CAT.productos, ['Producto A', 'Producto B', 'Producto C']);
  }
  // Tabla de materiales y costos: se escribe solo la primera vez para no borrar tus cambios de costo
  if (!yaTieneCostos) {
    cat.getRange(2, CAT.material, cat.getMaxRows() - 1, 3).clearContent();
    cat.getRange(2, CAT.material, MATERIALES.length, 3)
      .setValues(MATERIALES.map(m => [m[0], m[1], m[2] === null ? '' : m[2]]));
  }
  cat.getRange(2, CAT.matCosto, cat.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  cat.getRange(2, CAT.matUnidad, cat.getMaxRows() - 1, 1)
    .setDataValidation(listaDesdeRango_(cat.getRange(2, CAT.unidades, UNIDADES.length, 1), false));
  // Listas fijas (se reescriben siempre)
  escribirLista_(cat, CAT.meses, MESES);
  escribirLista_(cat, CAT.maquinas, MAQUINAS);
  escribirLista_(cat, CAT.tipos, TIPOS_IMPRESION);
  escribirLista_(cat, CAT.unidades, UNIDADES);
  escribirLista_(cat, CAT.acabados, ACABADOS);
  formatoEncabezado_(cat, 10);
  cat.setColumnWidths(1, 7, 140);
  cat.setColumnWidth(CAT.material, 320);
  cat.setColumnWidths(CAT.matUnidad, 2, 130);
  cat.getRange('L1').setValue(
    'Edita libremente Ejecutivos, Productos y la tabla de Materiales (nombre, unidad y costo). ' +
    'Máquinas, tipos, unidades y acabados se definen en el script.')
    .setFontStyle('italic').setFontColor('#666666').setFontWeight('normal').setBackground(null).setWrap(true);
  cat.setColumnWidth(12, 320);

  // --- Ventas ---
  const ven = obtenerHoja_(ss, HOJA_VENTAS);
  asegurarFilas_(ven, FILAS_MIN);
  ven.getRange(1, 1, 1, ENC_VENTAS.length).setValues([ENC_VENTAS]);
  formatoEncabezado_(ven, ENC_VENTAS.length);
  validacionesVentas_(ven, cat, 2, ven.getMaxRows() - 1);
  ven.setColumnWidths(1, ENC_VENTAS.length, 150);
  bandas_(ven, ENC_VENTAS.length);

  // --- Producción ---
  const pro = obtenerHoja_(ss, HOJA_PRODUCCION);
  migrarProduccion_(pro);
  asegurarFilas_(pro, FILAS_MIN);
  asegurarColumnas_(pro, ENC_PRODUCCION.length);
  pro.getRange(1, 1, 1, ENC_PRODUCCION.length).setValues([ENC_PRODUCCION]);
  const nP = pro.getMaxRows() - 1;
  validacionesProduccion_(pro, cat, 2, nP);

  // Columnas calculadas: se limpia cualquier dato suelto y se pone la fórmula en el encabezado
  pro.getRange(2, P.merma, nP, 2).clearContent();
  pro.getRange(1, P.merma).setFormula(formulaMerma_());
  pro.getRange(1, P.costo).setFormula(formulaCosto_());
  proteger_(pro, pro.getRange(2, P.merma, nP, 2), 'Columnas calculadas (Merma % y COSTO)');

  formatoEncabezado_(pro, ENC_PRODUCCION.length);
  pro.getRange(1, P.merma, 1, 2).setBackground('#2d5a8a');
  pro.setColumnWidths(1, ENC_PRODUCCION.length, 130);
  pro.setColumnWidth(P.proyecto, 200);
  pro.setColumnWidth(P.cliente, 180);
  pro.setColumnWidths(P.material, 2, 300);
  pro.setFrozenColumns(2);
  bandas_(pro, ENC_PRODUCCION.length);

  // Reglas sobre filas ya capturadas
  const ultima = ultimaFilaConDatos_(pro);
  if (ultima >= 2) {
    aplicarReglasRango_(pro, 2, ultima - 1);
    autollenarUnidad_(pro, 2, ultima - 1);
  }

  // Quitar la "Hoja 1" vacía si existe
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(n => {
    const h = ss.getSheetByName(n);
    if (h && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
  });

  ss.setActiveSheet(pro);
  SpreadsheetApp.getUi().alert('Plantilla lista ✅\n\n' +
    '• Ventas: una fila por ejecutivo por semana.\n' +
    '• Produccion: una fila por proyecto/trabajo. Al elegir la Máquina, Tipo de impresión y Material 2 ' +
    'se habilitan o se marcan NO APLICA; al elegir el Material se llena la Unidad de medida.\n' +
    '• Merma % y COSTO se calculan solos (columnas azules): no escribas en ellas.\n' +
    '• Los costos por material se editan en Catalogos, columnas H a J.');
}

/** Fórmula de Merma %: (Unidad usada real − Cantidad UNIDAD) / Unidad usada real. */
function formulaMerma_() {
  const I = colLetra_(P.cantidad), J = colLetra_(P.real);
  return `={"Merma %";ARRAYFORMULA(IF((${I}2:${I}="")+(${J}2:${J}=0),,` +
    `(${J}2:${J}-${I}2:${I})/${J}2:${J}))}`;
}

/**
 * Fórmula de COSTO: Unidad usada real × costo del Material
 *                 + Unidad usada real × costo del Material 2 (si aplica).
 * Mensajes: SIN COSTO (material sin precio en Catalogos),
 *           REVISAR UNIDAD (la unidad elegida no coincide con la del material),
 *           MATERIAL NO EN CATÁLOGO.
 */
function formulaCosto_() {
  const F = colLetra_(P.material), G = colLetra_(P.material2), H = colLetra_(P.unidad), J = colLetra_(P.real);
  const tabla = `${HOJA_CATALOGOS}!$${colLetra_(CAT.material)}$2:$${colLetra_(CAT.matCosto)}`;
  const f = `${F}2:${F}`, g = `${G}2:${G}`, h = `${H}2:${H}`, j = `${J}2:${J}`;
  return `={"COSTO";ARRAYFORMULA(IF((${j}="")+(${f}=""),,IFERROR(` +
    `IF(VLOOKUP(${f},${tabla},3,FALSE)="","SIN COSTO",` +
    `IF(${h}<>VLOOKUP(${f},${tabla},2,FALSE),"REVISAR UNIDAD",` +
    `${j}*VLOOKUP(${f},${tabla},3,FALSE)+IFERROR(${j}*VLOOKUP(${g},${tabla},3,FALSE),0))),` +
    `"MATERIAL NO EN CATÁLOGO")))}`;
}

/**
 * Migra formatos anteriores de la hoja Produccion sin perder datos:
 *  v1: Producto, Unidades producidas, ...
 *  v2: Producto, Máquina, Tipo, Material, Material 2, Unidad, Acabados, ...
 */
function migrarProduccion_(sh) {
  if (sh.getLastRow() < 1) return;
  const enc = () => sh.getRange(1, 1, 1, 3).getValues()[0].map(v => String(v).trim());
  if (enc()[1] === 'Unidades producidas') {           // v1 -> v2
    sh.insertColumnsAfter(1, 6);
    sh.getRange(1, 2, 1, 6).setValues([['Máquina', 'Tipo de impresión', 'Material', 'Material 2', 'Unidad de medida', 'Acabados']]);
  }
  const e = enc();
  if (e[0] === 'Producto' && e[1] === 'Máquina') {    // v2 -> v3
    sh.getBandings().forEach(b => b.remove());
    sh.insertColumnsBefore(1, 2);                      // PROYECTO, CLIENTE
    sh.insertColumnsAfter(P.unidad, 4);                // Cantidad UNIDAD, Unidad usada real, Merma %, COSTO
  }
}

/** Validaciones y formatos de la hoja Ventas para las filas [fila, fila+n). */
function validacionesVentas_(ven, cat, fila, n) {
  ven.getRange(fila, 1, n, 1).setDataValidation(listaDesdeRango_(cat.getRange('A2:A'), false));
  ven.getRange(fila, 2, n, 1).setNumberFormat('$#,##0.00').setDataValidation(numeroMin_(0));
  ven.getRange(fila, 3, n, 1).setNumberFormat('0').setDataValidation(enteroEntre_(0, 100000));
  ven.getRange(fila, 4, n, 1).setNumberFormat('0').setDataValidation(enteroEntre_(1, 53));
  ven.getRange(fila, 5, n, 1).setDataValidation(listaDesdeRango_(cat.getRange('C2:C13'), false));
  ven.getRange(fila, 6, n, 1).setNumberFormat('0').setDataValidation(enteroEntre_(2000, 2100));
}

/** Validaciones y formatos de la hoja Produccion para las filas [fila, fila+n). */
function validacionesProduccion_(pro, cat, fila, n) {
  const col = c => pro.getRange(fila, c, n, 1);
  const listaCat = (c, k) => listaDesdeRango_(cat.getRange(2, c, k, 1), false);
  const rangoMateriales = cat.getRange(2, CAT.material, cat.getMaxRows() - 1, 1);

  col(P.proyecto).clearDataValidations().setNumberFormat('@');
  col(P.cliente).clearDataValidations().setNumberFormat('@');
  col(P.producto).setDataValidation(listaDesdeRango_(cat.getRange('B2:B'), false));
  col(P.maquina).setDataValidation(listaCat(CAT.maquinas, MAQUINAS.length));
  col(P.tipo).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(TIPOS_IMPRESION.concat([NO_APLICA]), true).setAllowInvalid(false).build());
  col(P.material).setDataValidation(listaDesdeRango_(rangoMateriales, false));
  col(P.material2).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([NO_APLICA], true).setAllowInvalid(false)
    .setHelpText('Se habilita solo si la máquina es CNC o Cama Plana').build());
  col(P.unidad).setDataValidation(listaCat(CAT.unidades, UNIDADES.length));
  pro.getRange(fila, P.cantidad, n, 2).setNumberFormat('#,##0.00').setDataValidation(numeroMin_(0));
  col(P.merma).clearDataValidations().setNumberFormat('0.0%').setBackground(FONDO_CALC);
  col(P.costo).clearDataValidations().setNumberFormat('$#,##0.00').setBackground(FONDO_CALC);
  col(P.acabados).setDataValidation(listaCat(CAT.acabados, ACABADOS.length));
  pro.getRange(fila, P.producidas, n, 3).setNumberFormat('#,##0.##').setDataValidation(numeroMin_(0));
  col(P.semana).setNumberFormat('0').setDataValidation(enteroEntre_(1, 53));
  col(P.mes).setDataValidation(listaDesdeRango_(cat.getRange('C2:C13'), false));
  col(P.anio).setNumberFormat('0').setDataValidation(enteroEntre_(2000, 2100));
}

/** Agrega al catálogo los valores que falten, sin borrar los existentes. */
function agregarACatalogo_(cat, col, valores) {
  const n = Math.max(cat.getLastRow() - 1, 1);
  const existentes = cat.getRange(2, col, n, 1).getValues().map(r => String(r[0]).trim()).filter(v => v);
  const faltan = valores.filter(v => existentes.indexOf(v) < 0);
  if (!faltan.length) return;
  asegurarFilas_(cat, existentes.length + faltan.length + 5);
  cat.getRange(existentes.length + 2, col, faltan.length, 1).setValues(faltan.map(v => [v]));
}

/* ===================== DATOS PARA EL DASHBOARD ===================== */

/** Lo llama el dashboard (google.script.run). Devuelve los datos limpios. */
function getDatosDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const ventas = leerHoja_(ss, HOJA_VENTAS, ENC_VENTAS.length)
    .filter(r => r[0] !== '' && r[5] !== '')
    .map(r => ({
      ejecutivo: String(r[0]).trim(),
      monto: num_(r[1]),
      clientes: num_(r[2]),
      semana: num_(r[3]),
      mes: mesANumero_(r[4]),
      anio: num_(r[5])
    }))
    .filter(r => r.anio > 0 && r.semana > 0);

  const txt = v => String(v).trim();
  const v = (r, k) => r[P[k] - 1];
  const produccion = leerHoja_(ss, HOJA_PRODUCCION, ENC_PRODUCCION.length)
    .filter(r => (v(r, 'proyecto') !== '' || v(r, 'maquina') !== '') && v(r, 'anio') !== '')
    .map(r => {
      const costo = v(r, 'costo');
      return {
        proyecto: txt(v(r, 'proyecto')),
        cliente: txt(v(r, 'cliente')),
        producto: txt(v(r, 'producto')),
        maquina: txt(v(r, 'maquina')),
        tipo: txt(v(r, 'tipo')) || NO_APLICA,
        material: txt(v(r, 'material')),
        material2: txt(v(r, 'material2')),
        unidad: txt(v(r, 'unidad')),
        cantidad: num_(v(r, 'cantidad')),
        real: num_(v(r, 'real')),
        costo: typeof costo === 'number' ? costo : 0,
        costoEstado: typeof costo === 'number' ? '' : txt(costo),
        acabados: txt(v(r, 'acabados')),
        producidas: num_(v(r, 'producidas')),
        meta: num_(v(r, 'meta')),
        rechazadas: num_(v(r, 'rechazadas')),
        semana: num_(v(r, 'semana')),
        mes: mesANumero_(v(r, 'mes')),
        anio: num_(v(r, 'anio'))
      };
    })
    .filter(r => r.anio > 0 && r.semana > 0);

  return {
    ventas: ventas,
    produccion: produccion,
    materiales: leerCatalogoMateriales_(ss),
    actualizado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
  };
}

/** { 'NOMBRE MATERIAL': { unidad: 'm2', costo: 12.5 | null } } */
function leerCatalogoMateriales_(ss) {
  const cat = ss.getSheetByName(HOJA_CATALOGOS);
  const out = {};
  if (!cat || cat.getLastRow() < 2) return out;
  cat.getRange(2, CAT.material, cat.getLastRow() - 1, 3).getValues().forEach(r => {
    const nombre = String(r[0]).trim();
    if (!nombre) return;
    out[nombre] = { unidad: String(r[1]).trim(), costo: typeof r[2] === 'number' ? r[2] : null };
  });
  return out;
}

/* ===================== DATOS DE EJEMPLO ===================== */

function cargarDatosEjemplo() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Datos de ejemplo',
    'Se agregarán filas de ejemplo (2025 y 2026) al final de Ventas y Produccion. ¿Continuar?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pro0 = ss.getSheetByName(HOJA_PRODUCCION);
  if (!ss.getSheetByName(HOJA_VENTAS) || !pro0 ||
      String(pro0.getRange(1, P.proyecto).getValue()).trim() !== 'PROYECTO') {
    configurarPlantilla();
  }

  const ejecutivos = ['Ana López', 'Carlos Ruiz', 'María Pérez', 'Jorge Díaz'];
  const productos = ['Producto A', 'Producto B', 'Producto C'];
  const clientes = ['Grupo Álamo', 'Farmacias Sol', 'Constructora Real', 'Café Jalisco', 'Autos del Bajío', 'Plaza Andares'];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const nombres = MATERIALES.filter(m => m[2] !== null).map(m => m[0]);
  const de = pref => nombres.filter(n => n.indexOf(pref) === 0);
  const perfil = {
    'Chona':      { mats: de('LONA'), cant: [40, 160] },
    'Juana':      { mats: de('LONA').concat(de('VINIL BLANCO')), cant: [30, 140] },
    'La Mary':    { mats: de('VINIL'), cant: [20, 100] },
    'Mimaki':     { mats: de('VINIL BLANCO').concat(['PELÍCULA BACKLITE']), cant: [10, 50] },
    'CNC':        { mats: ['MDF', 'ACRILICO', 'TROVICEL 3MM', 'TROVICEL 6MM', 'ALUCUBOND', 'FOAMBOARD'], cant: [3, 20], mat2: de('VINIL') },
    'Laminadora': { mats: de('LAMINADOR'), cant: [30, 120] },
    'Cama Plana': { mats: ['TROVICEL 3MM', 'ESTIRENO CAL. 15', 'ESTIRENO CAL. 30', 'FOAMBOARD', 'LAMINA LISA METAL'], cant: [5, 40], mat2: de('VINIL BLANCO') }
  };
  const hoy = new Date();
  const filasV = [], filasP = [];
  let folio = 100;

  [2025, 2026].forEach(anio => {
    const ultimaSemana = anio < hoy.getFullYear() ? 52 : semanaDelAnio_(hoy);
    for (let s = 1; s <= ultimaSemana; s++) {
      const mes = MESES[fechaDeSemana_(anio, s).getMonth()];
      ejecutivos.forEach((e, i) => {
        const base = 80000 + i * 15000 + (anio - 2025) * 8000;
        const monto = Math.round(base * rnd(0.75, 1.25));
        filasV.push([e, monto, Math.max(1, Math.round(monto / rnd(6000, 9000))), s, mes, anio]);
      });
      MAQUINAS.forEach(maq => {
        const pf = perfil[maq];
        const imprime = MAQ_IMPRESION.indexOf(maq) >= 0;
        const cant = Math.round(rnd(pf.cant[0], pf.cant[1]) * 100) / 100;
        const real = Math.round(cant * rnd(1.01, 1.15) * 100) / 100;
        const meta = Math.round(pf.cant[1] * 0.8);
        const fila = new Array(ENC_PRODUCCION.length).fill('');
        folio++;
        fila[P.proyecto - 1] = 'PRY-' + anio + '-' + folio;
        fila[P.cliente - 1] = pick(clientes);
        fila[P.producto - 1] = pick(productos);
        fila[P.maquina - 1] = maq;
        fila[P.tipo - 1] = imprime ? pick(TIPOS_IMPRESION) : NO_APLICA;
        fila[P.material - 1] = pick(pf.mats);
        fila[P.material2 - 1] = pf.mat2 ? (Math.random() < 0.6 ? pick(pf.mat2) : '') : NO_APLICA;
        fila[P.unidad - 1] = 'm2';
        fila[P.cantidad - 1] = cant;
        fila[P.real - 1] = real;
        fila[P.acabados - 1] = imprime ? pick(ACABADOS) : (maq === 'Laminadora' ? 'barniz uv' : 'solo refilado');
        fila[P.producidas - 1] = cant;
        fila[P.meta - 1] = meta;
        fila[P.rechazadas - 1] = Math.round(cant * rnd(0, 0.04) * 100) / 100;
        fila[P.semana - 1] = s;
        fila[P.mes - 1] = mes;
        fila[P.anio - 1] = anio;
        filasP.push(fila);
      });
    }
  });

  // 1) Dar de alta en Catalogos los ejecutivos y productos de ejemplo (sin borrar los tuyos)
  const cat = ss.getSheetByName(HOJA_CATALOGOS);
  agregarACatalogo_(cat, CAT.ejecutivos, ejecutivos);
  agregarACatalogo_(cat, CAT.productos, productos);
  SpreadsheetApp.flush();

  // 2) Ventas: se quitan las validaciones del bloque, se escribe y se vuelven a poner
  const ven = ss.getSheetByName(HOJA_VENTAS);
  const iniV = ultimaFilaConDatos_(ven) + 1;
  asegurarFilas_(ven, iniV + filasV.length + 10);
  const bloqueV = ven.getRange(iniV, 1, filasV.length, ENC_VENTAS.length);
  bloqueV.clearDataValidations();
  bloqueV.setValues(filasV);
  validacionesVentas_(ven, cat, iniV, filasV.length);

  // Producción: se escribe en dos bloques para no tocar Merma % y COSTO (son fórmulas)
  const pro = ss.getSheetByName(HOJA_PRODUCCION);
  const inicio = ultimaFilaConDatos_(pro) + 1;
  asegurarFilas_(pro, inicio + filasP.length + 10);
  pro.getRange(inicio, 1, filasP.length, ENC_PRODUCCION.length).clearDataValidations();
  pro.getRange(inicio, 1, filasP.length, P.real).setValues(filasP.map(f => f.slice(0, P.real)));
  pro.getRange(inicio, P.acabados, filasP.length, ENC_PRODUCCION.length - P.acabados + 1)
    .setValues(filasP.map(f => f.slice(P.acabados - 1)));
  validacionesProduccion_(pro, cat, inicio, filasP.length);
  aplicarReglasRango_(pro, inicio, filasP.length);

  ui.alert('Datos de ejemplo cargados. Abre el dashboard desde el menú 📊 Dashboard.');
}

/* ===================== UTILIDADES ===================== */

function obtenerHoja_(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

function asegurarFilas_(sh, n) {
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
}

function asegurarColumnas_(sh, n) {
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
}

function escribirLista_(sh, col, valores) {
  sh.getRange(2, col, valores.length, 1).setValues(valores.map(v => [v]));
}

function colLetra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function formatoEncabezado_(sh, cols) {
  sh.getRange(1, 1, 1, cols)
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f3a5f')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
}

function bandas_(sh, cols) {
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(1, 1, sh.getMaxRows(), cols)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#1f3a5f');
}

/** Protección de solo advertencia (avisa si alguien intenta escribir encima). */
function proteger_(sh, rango, descripcion) {
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(p => p.getDescription() === descripcion)
    .forEach(p => p.remove());
  rango.protect().setDescription(descripcion).setWarningOnly(true);
}

/** permitirOtros = true acepta valores fuera de la lista (solo muestra aviso). */
function listaDesdeRango_(rango, permitirOtros) {
  return SpreadsheetApp.newDataValidation().requireValueInRange(rango, true)
    .setAllowInvalid(!!permitirOtros).build();
}

function numeroMin_(min) {
  return SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(min)
    .setAllowInvalid(false).setHelpText('Ingresa un número mayor o igual a ' + min).build();
}

function enteroEntre_(a, b) {
  return SpreadsheetApp.newDataValidation().requireNumberBetween(a, b)
    .setAllowInvalid(false).setHelpText('Número entre ' + a + ' y ' + b).build();
}

function leerHoja_(ss, nombre, cols) {
  const sh = ss.getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues();
}

/** Última fila con dato real en las primeras 4 columnas (validaciones, fórmulas y NO APLICA no cuentan). */
function ultimaFilaConDatos_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const cols = Math.min(4, sh.getMaxColumns());
  const v = sh.getRange(1, 1, n, cols).getValues();
  for (let i = v.length - 1; i >= 1; i--) {
    if (v[i].some(x => x !== '' && x !== NO_APLICA)) return i + 1;
  }
  return 1;
}

/** Escribe filas al final y devuelve la fila donde empezó. */
function escribirAlFinal_(sh, filas) {
  if (!filas.length) return 0;
  const ultima = ultimaFilaConDatos_(sh);
  asegurarFilas_(sh, ultima + filas.length + 10);
  sh.getRange(ultima + 1, 1, filas.length, filas[0].length).setValues(filas);
  return ultima + 1;
}

function num_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function sinAcentos_(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function mesANumero_(v) {
  if (v instanceof Date) return v.getMonth() + 1;
  if (typeof v === 'number') return v;
  const n = parseInt(v, 10);
  if (!isNaN(n)) return n;
  const idx = MESES.findIndex(m => sinAcentos_(m) === sinAcentos_(v) || sinAcentos_(m).slice(0, 3) === sinAcentos_(v).slice(0, 3));
  return idx + 1; // 0 si no se reconoce
}

function fechaDeSemana_(anio, semana) {
  return new Date(anio, 0, 1 + (semana - 1) * 7);
}

function semanaDelAnio_(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - inicio) / 86400000 + 1) / 7);
}
