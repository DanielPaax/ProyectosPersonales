/**
 * Calculadora de costos TOGOMA-CO · Google Sheets + Apps Script
 *
 * Guarda las cotizaciones y la configuración (tarifas) en el Sheet al que está ligado
 * el script, para que todo el equipo trabaje sobre los mismos datos.
 * La página es Calculadora.html (el mismo contenido de index.html).
 *
 * Hojas (se crean solas):
 *   Cotizaciones  una fila por cotización. Las columnas de la A a la N son para leer y filtrar;
 *                 la cotización completa vive en la columna "Datos" (oculta). Solo la columna
 *                 Estado se puede cambiar a mano en el Sheet.
 *   Materiales    catálogo / inventario de materiales (se edita desde la calculadora o a mano en el Sheet).
 *   Config        tarifas compartidas y contador de folios.
 */

const CC_HOJA_COT = 'Cotizaciones';
const CC_HOJA_CFG = 'Config';
const CC_HOJA_MAT = 'Materiales';
const CC_MAT_ENC = ['Material', 'Marca', 'Presentación', 'Unidad', 'Proveedor', 'Costo presentación', 'Costo por unidad', 'Área', 'ID', 'Actualizado'];
const CC_MCOL = { ID: 9 };
const CC_AREAS = ['Ambos', '3D', 'Carpintería'];
const CC_ENCABEZADO = ['Folio', 'Fecha', 'Actualizada', 'Cliente', 'Trabajo', 'Tipo', 'Piezas', 'Costo',
  'Total sin IVA', 'Utilidad', 'Margen', 'Estado', 'Creó', 'Modificó', 'ID', 'Rev', 'Datos (no editar)'];
const CC_COL = { ESTADO: 12, ID: 15, REV: 16, JSON: 17 };
const CC_ESTADOS = ['Borrador', 'Enviada', 'Aceptada', 'Rechazada'];
const CC_MAX_JSON = 45000; // una celda de Sheets admite 50,000 caracteres

/* ---------- menú y página ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🧮 Calculadora')
    .addItem('Abrir calculadora', 'abrirCalculadora')
    .addItem('Preparar hojas', 'prepararHojas')
    .addToUi();
}

// Nombres aceptados para el archivo HTML (por si al crearlo se escribió con extensión o con otro nombre)
const CC_NOMBRES_HTML = ['Calculadora', 'Calculadora.html', 'calculadora', 'index', 'Index', 'index.html'];

function htmlCalculadora_() {
  for (let i = 0; i < CC_NOMBRES_HTML.length; i++) {
    try { return HtmlService.createHtmlOutputFromFile(CC_NOMBRES_HTML[i]); } catch (e) { /* probar el siguiente nombre */ }
  }
  throw new Error('Falta el archivo HTML de la calculadora. En el editor de Apps Script: «+» → HTML, ponle el nombre Calculadora '
    + '(sin escribir .html) y pega ahí todo el contenido de index.html. Luego guarda y publica una versión nueva.');
}

function doGet() {
  return htmlCalculadora_()
    .setTitle('Calculadora de costos · TOGOMA-CO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function abrirCalculadora() {
  const url = ScriptApp.getService().getUrl();
  const html = url
    ? '<p>Abre la calculadora aquí:</p><p><a href="' + url + '" target="_blank">' + url + '</a></p>'
    : '<p>Todavía no está publicada. En el editor: <b>Implementar → Nueva implementación → Aplicación web</b>.</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(140), 'Calculadora de costos');
}

function prepararHojas() {
  hojaCot_(); hojaCfg_(); hojaMat_();
  SpreadsheetApp.getActive().toast('Hojas listas', 'Calculadora');
}

/* ---------- funciones que llama la página (google.script.run) ---------- */

function cc_cargar() {
  const kv = leerKv_();
  let cfg = null;
  try { cfg = kv.cfg ? JSON.parse(kv.cfg) : null; } catch (e) { cfg = null; }
  const quotes = leerCotizaciones_().sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
  return { user: usuario_(), cfg: cfg, quotes: quotes, folioN: Number(kv.folioN) || 0, mats: leerMateriales_() };
}

/* ---------- catálogo de materiales (inventario) ---------- */

function cc_materiales() { return leerMateriales_(); }

function cc_guardarMaterial(m) {
  validarMat_(m);
  return conBloqueo_(function () {
    const sh = hojaMat_();
    const id = m.id || Date.now() * 1000;
    const fila = buscarFila_(sh, id, CC_MCOL.ID) || (sh.getLastRow() + 1);
    escribirMat_(sh, fila, m, id);
    return matDeFila_(sh.getRange(fila, 1, 1, CC_MAT_ENC.length).getValues()[0]);
  });
}

function cc_eliminarMaterial(id) {
  return conBloqueo_(function () {
    const sh = hojaMat_(), fila = buscarFila_(sh, id, CC_MCOL.ID);
    if (fila) sh.deleteRow(fila);
    return true;
  });
}

/** Alta masiva (por ejemplo, los materiales de ejemplo). */
function cc_importarMateriales(lista) {
  if (!Array.isArray(lista)) throw new Error('Datos no válidos');
  lista.forEach(validarMat_);
  return conBloqueo_(function () {
    const sh = hojaMat_(), out = [];
    lista.forEach(function (m, i) {
      const fila = sh.getLastRow() + 1;
      escribirMat_(sh, fila, m, Date.now() * 1000 + i);
      out.push(matDeFila_(sh.getRange(fila, 1, 1, CC_MAT_ENC.length).getValues()[0]));
    });
    return out;
  });
}

/**
 * Crea o actualiza una cotización. `q.rev` es la versión que tenía quien la abrió:
 * si en el Sheet ya hay otra más nueva devolvemos {conflict:true} para no pisar cambios ajenos
 * (a menos que force = true).
 */
function cc_guardar(q, force) {
  validar_(q);
  return conBloqueo_(function () {
    const sh = hojaCot_(), email = usuario_(), hoy = hoy_();
    const fila = buscarFila_(sh, q.id);
    if (fila) {
      const ant = JSON.parse(sh.getRange(fila, CC_COL.JSON).getValue());
      if (!force && (ant.rev || 0) !== (q.rev || 0)) return { conflict: true, actual: ant };
      q.folio = ant.folio; q.fecha = ant.fecha; q.creo = ant.creo;
      q.actualizada = hoy; q.modifico = email; q.rev = (ant.rev || 0) + 1;
      escribirFila_(sh, fila, q);
    } else {
      q.folio = siguienteFolio_(); q.fecha = hoy; q.creo = email; q.modifico = email; q.rev = 1;
      delete q.actualizada;
      escribirFila_(sh, sh.getLastRow() + 1, q);
    }
    return { ok: true, q: q };
  });
}

function cc_estado(id, estado) {
  if (CC_ESTADOS.indexOf(estado) < 0) throw new Error('Estado no válido');
  return conBloqueo_(function () {
    const sh = hojaCot_(), fila = buscarFila_(sh, id);
    if (!fila) throw new Error('La cotización ya no existe (alguien la eliminó).');
    const q = JSON.parse(sh.getRange(fila, CC_COL.JSON).getValue());
    q.estado = estado; q.modifico = usuario_(); q.rev = (q.rev || 0) + 1;
    escribirFila_(sh, fila, q);
    return q;
  });
}

function cc_eliminar(id) {
  return conBloqueo_(function () {
    const sh = hojaCot_(), fila = buscarFila_(sh, id);
    if (fila) sh.deleteRow(fila);
    return true;
  });
}

function cc_guardarConfig(cfg) {
  const txt = JSON.stringify(cfg);
  if (txt.length > CC_MAX_JSON) throw new Error('La configuración es demasiado grande.');
  return conBloqueo_(function () { guardarKv_('cfg', txt); return true; });
}

/** Sube cotizaciones que estaban guardadas solo en un navegador. Reasigna folios para no repetirlos. */
function cc_importar(lista) {
  if (!Array.isArray(lista)) throw new Error('Datos no válidos');
  return conBloqueo_(function () {
    const sh = hojaCot_(), email = usuario_(), hoy = hoy_(), subidas = [];
    lista.forEach(function (q) {
      validar_(q);
      if (buscarFila_(sh, q.id)) return;
      q.folio = siguienteFolio_(); q.fecha = q.fecha || hoy; q.creo = email; q.modifico = email; q.rev = 1;
      escribirFila_(sh, sh.getLastRow() + 1, q);
      subidas.push(q);
    });
    return subidas;
  });
}

/* ---------- utilidades internas ---------- */

function hojaCot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CC_HOJA_COT);
  if (sh) return sh;
  sh = ss.insertSheet(CC_HOJA_COT);
  sh.getRange(1, 1, 1, CC_ENCABEZADO.length).setValues([CC_ENCABEZADO])
    .setFontWeight('bold').setBackground('#316966').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange('B:C').setNumberFormat('@');
  sh.getRange('H:J').setNumberFormat('#,##0.00');
  sh.getRange('K:K').setNumberFormat('0.0%');
  sh.getRange('O:O').setNumberFormat('0');
  sh.getRange('L2:L').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CC_ESTADOS, true).setAllowInvalid(false).build());
  sh.hideColumns(CC_COL.ID, 3);
  return sh;
}

function hojaMat_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CC_HOJA_MAT);
  if (sh) return sh;
  sh = ss.insertSheet(CC_HOJA_MAT);
  sh.getRange(1, 1, 1, CC_MAT_ENC.length).setValues([CC_MAT_ENC])
    .setFontWeight('bold').setBackground('#316966').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange('C:C').setNumberFormat('#,##0.##');
  sh.getRange('F:F').setNumberFormat('#,##0.00');
  sh.getRange('G:G').setNumberFormat('#,##0.0000');
  sh.getRange('I:I').setNumberFormat('0');
  sh.getRange('J:J').setNumberFormat('@');
  sh.getRange('H2:H').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CC_AREAS, true).setAllowInvalid(false).build());
  sh.hideColumns(CC_MCOL.ID, 1);
  return sh;
}

function hojaCfg_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CC_HOJA_CFG);
  if (sh) return sh;
  sh = ss.insertSheet(CC_HOJA_CFG);
  sh.getRange(1, 1, 1, 2).setValues([['Clave', 'Valor']]).setFontWeight('bold');
  sh.getRange('B:B').setNumberFormat('@');
  return sh;
}

function leerKv_() {
  const o = {};
  hojaCfg_().getDataRange().getValues().forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  return o;
}

function guardarKv_(clave, valor) {
  const sh = hojaCfg_(), v = sh.getDataRange().getValues();
  for (let i = 0; i < v.length; i++) {
    if (v[i][0] === clave) { sh.getRange(i + 1, 2).setValue(valor); return; }
  }
  sh.appendRow([clave, valor]);
}

function siguienteFolio_() {
  const n = (Number(leerKv_().folioN) || 0) + 1;
  guardarKv_('folioN', n);
  return 'COT-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + ('00' + n).slice(-3);
}

function leerCotizaciones_() {
  const sh = hojaCot_(), n = sh.getLastRow();
  if (n < 2) return [];
  const v = sh.getRange(2, 1, n - 1, CC_ENCABEZADO.length).getValues(), out = [];
  v.forEach(function (r) {
    try {
      const q = JSON.parse(r[CC_COL.JSON - 1]);
      if (CC_ESTADOS.indexOf(r[CC_COL.ESTADO - 1]) >= 0) q.estado = r[CC_COL.ESTADO - 1]; // cambios hechos a mano en el Sheet
      out.push(q);
    } catch (e) { /* fila dañada: se ignora */ }
  });
  return out;
}

function buscarFila_(sh, id, col) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, col || CC_COL.ID, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function escribirFila_(sh, fila, q) {
  const txt = JSON.stringify(q);
  if (txt.length > CC_MAX_JSON) throw new Error('La cotización es demasiado grande para guardarse.');
  const n = function (x) { x = Number(x); return isFinite(x) ? x : 0; };
  sh.getRange(fila, 1, 1, CC_ENCABEZADO.length).setValues([[
    q.folio, q.fecha, q.actualizada || '', q.cliente || '', q.nombre || '', q.tipo || '', n(q.qty), n(q.costo),
    n(q.total), n(q.utilidad), n(q.margen), q.estado || 'Borrador', q.creo || '', q.modifico || '', q.id, n(q.rev), txt
  ]]);
}

function leerMateriales_() {
  const sh = hojaMat_(), n = sh.getLastRow();
  if (n < 2) return [];
  let v = sh.getRange(2, 1, n - 1, CC_MAT_ENC.length).getValues();
  const falta = function (r) { return String(r[0]).trim() && !r[CC_MCOL.ID - 1]; };
  if (v.some(falta)) { // filas escritas a mano en el Sheet: les damos ID y la fórmula del costo por unidad
    conBloqueo_(function () {
      const hoy = hoy_();
      v = sh.getRange(2, 1, n - 1, CC_MAT_ENC.length).getValues();
      v.forEach(function (r, i) {
        if (!falta(r)) return;
        const fila = i + 2;
        sh.getRange(fila, CC_MCOL.ID).setValue(Date.now() * 1000 + i);
        sh.getRange(fila, 7).setFormula('=IF(C' + fila + '>0,F' + fila + '/C' + fila + ',0)');
        sh.getRange(fila, 10).setValue(hoy);
      });
    });
    v = sh.getRange(2, 1, n - 1, CC_MAT_ENC.length).getValues();
  }
  return v.filter(function (r) { return String(r[0]).trim(); }).map(matDeFila_);
}

function matDeFila_(r) {
  const pres = Number(r[2]) || 0, costo = Number(r[5]) || 0;
  return {
    id: r[CC_MCOL.ID - 1], material: String(r[0]).trim(), marca: String(r[1] || '').trim(), presentacion: pres,
    unidad: String(r[3] || '').trim(), proveedor: String(r[4] || '').trim(), costoPres: costo,
    costoUnidad: pres > 0 ? costo / pres : 0, area: CC_AREAS.indexOf(r[7]) >= 0 ? r[7] : 'Ambos', actualizado: String(r[9] || '')
  };
}

function escribirMat_(sh, fila, m, id) {
  const area = CC_AREAS.indexOf(m.area) >= 0 ? m.area : 'Ambos';
  sh.getRange(fila, 1, 1, CC_MAT_ENC.length).setValues([[
    String(m.material).trim(), String(m.marca || '').trim(), Number(m.presentacion), String(m.unidad).trim(),
    String(m.proveedor || '').trim(), Number(m.costoPres), '', area, id, hoy_()
  ]]);
  sh.getRange(fila, 7).setFormula('=IF(C' + fila + '>0,F' + fila + '/C' + fila + ',0)');
}

function validarMat_(m) {
  if (!m || typeof m !== 'object') throw new Error('Material no válido');
  if (!String(m.material || '').trim() || String(m.material).length > 120) throw new Error('Escribe el nombre del material.');
  if (!String(m.unidad || '').trim()) throw new Error('Falta la unidad.');
  if (!(Number(m.presentacion) > 0)) throw new Error('La presentación debe ser mayor que 0.');
  if (!isFinite(Number(m.costoPres)) || Number(m.costoPres) < 0) throw new Error('El costo de la presentación no es válido.');
}

function validar_(q) {
  if (!q || typeof q !== 'object' || !q.id) throw new Error('Cotización no válida');
  if (JSON.stringify(q).length > CC_MAX_JSON) throw new Error('La cotización es demasiado grande para guardarse.');
}

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function hoy_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function usuario_() {
  try { return String(Session.getActiveUser().getEmail() || ''); } catch (e) { return ''; }
}
