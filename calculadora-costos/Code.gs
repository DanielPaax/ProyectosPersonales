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
 *   Config        tarifas compartidas y contador de folios.
 */

const CC_HOJA_COT = 'Cotizaciones';
const CC_HOJA_CFG = 'Config';
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

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Calculadora')
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
  hojaCot_(); hojaCfg_();
  SpreadsheetApp.getActive().toast('Hojas listas', 'Calculadora');
}

/* ---------- funciones que llama la página (google.script.run) ---------- */

function cc_cargar() {
  const kv = leerKv_();
  let cfg = null;
  try { cfg = kv.cfg ? JSON.parse(kv.cfg) : null; } catch (e) { cfg = null; }
  const quotes = leerCotizaciones_().sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
  return { user: usuario_(), cfg: cfg, quotes: quotes, folioN: Number(kv.folioN) || 0 };
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

function buscarFila_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, CC_COL.ID, n - 1, 1).getValues();
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
