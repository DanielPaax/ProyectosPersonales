/* =====================================================================
   MARKETING: tablero Kanban, calendario, archivos y comentarios con @menciones
   =====================================================================
   Archivo NUEVO: en Apps Script crea un archivo de secuencia de comandos llamado "Marketing" y pega esto.
   Hojas (se crean solas): MKT_TAREAS, MKT_COMENTARIOS, MKT_ARCHIVOS.
   Archivos: se guardan en una carpeta de Drive del dueño ("Marketing BFP - Archivos"); la intranet los sirve a quien tiene acceso.
   Permisos (hoja ACCESOS / modulo Administracion), nivel del area "marketing":
     1 VER: consulta tablero, calendario, comentarios y archivos.
     2 ESCRIBIR: crea actividades; modifica, mueve y comenta las que creo o le asignaron; sube archivos.
     3 EDITAR: ademas modifica, mueve y elimina cualquier actividad, comentario o archivo.
   Una persona que crea una actividad tambien puede eliminarla.
   Avisos por correo: al asignar una actividad y al @mencionar a alguien en un comentario. */

var MKT_ETAPAS = ['BRIEF', 'PLANEACIÓN', 'PRODUCCIÓN', 'EJECUCIÓN', 'FINALIZADO'];
var MKT_PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];
var MKT_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', ai: 'application/illustrator' };
var MKT_MAX_B64 = 11500000;   /* ~8.5 MB por archivo (limite practico de google.script.run) */
var MKT_HOJAS = {
  MKT_TAREAS: ['ID', 'TITULO', 'DESCRIPCION', 'ETAPA', 'PRIORIDAD', 'RESPONSABLES', 'INICIO', 'FIN', 'ETIQUETAS', 'CREADO_POR', 'CREADO_EN', 'ACTUALIZADO_EN', 'HISTORIAL'],
  MKT_COMENTARIOS: ['ID', 'TAREA', 'AUTOR', 'FECHA', 'TIPO', 'TEXTO', 'MENCIONES'],
  MKT_ARCHIVOS: ['ID', 'TAREA', 'NOMBRE', 'MIME', 'DRIVE_ID', 'TAMANO', 'SUBIDO_POR', 'FECHA', 'ETAPA']
};
var MKT_ESCRIBEN = { guardarTarea: 1, moverTarea: 1, eliminarTarea: 1, comentar: 1, eliminarComentario: 1, subirArchivo: 1, eliminarArchivo: 1 };

/* Se corre UNA vez desde el editor (o menu): crea hojas y carpeta, y pide el permiso de Drive. */
function mktInstalar() {
  for (var n in MKT_HOJAS) { if (MKT_HOJAS.hasOwnProperty(n)) { _mktHoja_(n); } }
  var c = _mktCarpeta_();
  try { SpreadsheetApp.getUi().alert('Marketing listo. Carpeta de archivos: ' + c.getName()); } catch (e) { /* sin interfaz */ }
}

function _mktHoja_(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), h = ss.getSheetByName(nombre), enc = MKT_HOJAS[nombre];
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#E8EEFB');
    h.setFrozenRows(1);
    h.getRange(2, 1, h.getMaxRows() - 1, enc.length).setNumberFormat('@');   /* texto: Sheets no convierte fechas ni IDs */
  }
  return h;
}

function _mktCarpeta_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('MKT_CARPETA');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  var it = DriveApp.getFoldersByName('Marketing BFP - Archivos'), f = it.hasNext() ? it.next() : DriveApp.createFolder('Marketing BFP - Archivos');
  p.setProperty('MKT_CARPETA', f.getId());
  return f;
}

function _mktLee_(nombre) {
  var h = _mktHoja_(nombre), enc = MKT_HOJAS[nombre], n = h.getLastRow(), out = [];
  if (n < 2) { return out; }
  var v = h.getRange(2, 1, n - 1, enc.length).getValues(), tz = Session.getScriptTimeZone();
  for (var i = 0; i < v.length; i++) {
    if (!String(v[i][0]).trim()) { continue; }
    var o = { _fila: i + 2 };
    for (var c = 0; c < enc.length; c++) {
      var x = v[i][c];
      if (x instanceof Date) { x = Utilities.formatDate(x, tz, 'yyyy-MM-dd'); }
      o[enc[c]] = x === null || x === undefined ? '' : String(x);
    }
    out.push(o);
  }
  return out;
}

function _mktFila_(nombre, o) {
  var enc = MKT_HOJAS[nombre], r = [];
  for (var c = 0; c < enc.length; c++) { r.push(o[enc[c]] === undefined || o[enc[c]] === null ? '' : String(o[enc[c]])); }
  return r;
}
function _mktAgrega_(nombre, o) {
  var h = _mktHoja_(nombre), enc = MKT_HOJAS[nombre], fila = h.getLastRow() + 1;
  h.getRange(fila, 1, 1, enc.length).setNumberFormat('@').setValues([_mktFila_(nombre, o)]);
}
function _mktGuarda_(nombre, o) {
  var h = _mktHoja_(nombre), enc = MKT_HOJAS[nombre];
  h.getRange(o._fila, 1, 1, enc.length).setNumberFormat('@').setValues([_mktFila_(nombre, o)]);
}
function _mktBorraFilas_(nombre, filas) {
  var h = _mktHoja_(nombre);
  filas.sort(function (a, b) { return b - a; });
  for (var i = 0; i < filas.length; i++) { h.deleteRow(filas[i]); }
}

function _mktAhora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm"); }
function _mktId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 9); }

/* ---------- Equipo: quien tiene acceso al area (para asignar y @mencionar) ---------- */
function _mktNombre_(correo) {
  var loc = String(correo).split('@')[0].replace(/[._\-+]+/g, ' ').trim();
  return loc.replace(/\b[a-záéíóúñ]/gi, function (m) { return m.toUpperCase(); });
}

function _mktEquipo_() {
  var set = {}, ac = _leerAccesos_(), c;
  for (c in ac) { if (ac.hasOwnProperty(c) && ac[c].niveles && ac[c].niveles.marketing >= 1) { set[c] = 1; } }
  var listas = ['ADMIN', 'MASTER'];
  for (var l = 0; l < listas.length; l++) {
    var lst = ROLES[listas[l]] || [];
    for (var j = 0; j < lst.length; j++) { var m = String(lst[j]).trim().toLowerCase(); if (m.indexOf('@') > 0) { set[m] = 1; } }
  }
  var correos = Object.keys(set).sort(), locales = {}, out = [];
  for (var i = 0; i < correos.length; i++) { var lo = correos[i].split('@')[0]; locales[lo] = (locales[lo] || 0) + 1; }
  for (var k = 0; k < correos.length; k++) {
    var lo2 = correos[k].split('@')[0];
    out.push({ correo: correos[k], nombre: _mktNombre_(correos[k]), token: locales[lo2] > 1 ? correos[k] : lo2 });
  }
  return out;
}

function _mktMenciones_(texto, equipo) {
  var re = /(^|[\s(\[¡¿])@([\w.\-+]+@[\w.\-]+|[\w.\-+]+)/g, m, out = [];
  while ((m = re.exec(String(texto || ''))) !== null) {
    var tok = m[2].replace(/[.\-]+$/, '').toLowerCase();
    for (var i = 0; i < equipo.length; i++) {
      if ((equipo[i].token.toLowerCase() === tok || equipo[i].correo === tok) && out.indexOf(equipo[i].correo) < 0) { out.push(equipo[i].correo); }
    }
  }
  return out;
}

/* ---------- Formato de salida ---------- */
function _mktSepara_(s) { return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return x; }); }

function _mktTareaOut_(f, nCom, nArc) {
  return { id: f.ID, titulo: f.TITULO, descripcion: f.DESCRIPCION, etapa: f.ETAPA, prioridad: f.PRIORIDAD, responsables: _mktSepara_(f.RESPONSABLES),
           inicio: f.INICIO, fin: f.FIN, etiquetas: f.ETIQUETAS, creadoPor: f.CREADO_POR, creadoEn: f.CREADO_EN, actualizadoEn: f.ACTUALIZADO_EN,
           comentarios: nCom || 0, archivos: nArc || 0 };
}

function _mktConteo_(filas) {
  var c = {};
  for (var i = 0; i < filas.length; i++) { c[filas[i].TAREA] = (c[filas[i].TAREA] || 0) + 1; }
  return c;
}

function _mktTarea_(id) {
  var t = _mktLee_('MKT_TAREAS');
  for (var i = 0; i < t.length; i++) { if (t[i].ID === id) { return t[i]; } }
  throw new Error('La actividad ya no existe. Actualiza el tablero.');
}

function _mktPuedeEditar_(ses, nivel, f) {
  if (nivel >= 3) { return true; }
  if (nivel < 2) { return false; }
  var yo = String(ses.correo).toLowerCase();
  return String(f.CREADO_POR).toLowerCase() === yo || _mktSepara_(f.RESPONSABLES).indexOf(yo) >= 0;
}

function _mktHist_(f, txt, ses) {
  var h = []; try { h = JSON.parse(f.HISTORIAL || '[]'); } catch (e) { h = []; }
  h.push({ f: _mktAhora_(), p: ses.correo, t: txt });
  if (h.length > 60) { h = h.slice(h.length - 60); }
  f.HISTORIAL = JSON.stringify(h);
}

function _mktFecha_(v) {
  var s = String(v || '').trim();
  if (!s) { return ''; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { throw new Error('Fecha no válida: ' + s); }
  return s;
}

/* ---------- Correos ---------- */
function _mktCorreo_(para, asunto, titulo, cuerpoHtml, tarea) {
  var enviados = 0, fallidos = 0, cuota = 0;
  try { cuota = MailApp.getRemainingDailyQuota(); } catch (e) { cuota = 0; }
  var url = _urlPublica_();
  for (var i = 0; i < para.length; i++) {
    if (cuota - enviados < 1) { fallidos++; continue; }
    try {
      var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1c2540">' +
        '<h2 style="margin:0 0 6px;color:#16327a">' + _escHtml_(titulo) + '</h2>' + cuerpoHtml +
        '<p style="margin:16px 0"><a href="' + _escHtml_(url) + '" style="background:#ff6a13;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Abrir la intranet</a></p>' +
        '<p style="color:#7b869f;font-size:12px">Entra a Marketing y abre la actividad «' + _escHtml_(tarea.TITULO) + '».</p></div>';
      MailApp.sendEmail({ to: para[i], subject: asunto, htmlBody: html, body: titulo + ' — ' + tarea.TITULO + ' · ' + url, name: 'BIG FOOT print · Intranet' });
      enviados++;
    } catch (e2) { fallidos++; }
  }
  return { enviados: enviados, fallidos: fallidos };
}

function _mktAvisoAsignacion_(ses, f, nuevos) {
  var para = nuevos.filter(function (c) { return c !== String(ses.correo).toLowerCase(); });
  if (!para.length) { return { enviados: 0, fallidos: 0 }; }
  var cuerpo = '<p><b>' + _escHtml_(_mktNombre_(ses.correo)) + '</b> te asignó una actividad en Marketing.</p>' +
    '<table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:3px 12px 3px 0;color:#7b869f">Actividad</td><td><b>' + _escHtml_(f.TITULO) + '</b></td></tr>' +
    '<tr><td style="padding:3px 12px 3px 0;color:#7b869f">Etapa</td><td>' + _escHtml_(f.ETAPA) + '</td></tr>' +
    '<tr><td style="padding:3px 12px 3px 0;color:#7b869f">Prioridad</td><td>' + _escHtml_(f.PRIORIDAD) + '</td></tr>' +
    (f.FIN ? '<tr><td style="padding:3px 12px 3px 0;color:#7b869f">Fecha límite</td><td>' + _escHtml_(f.FIN) + '</td></tr>' : '') + '</table>' +
    (f.DESCRIPCION ? '<p style="white-space:pre-wrap;background:#f4f6fb;padding:10px;border-radius:8px">' + _escHtml_(String(f.DESCRIPCION).slice(0, 600)) + '</p>' : '');
  return _mktCorreo_(para, 'Te asignaron una actividad: ' + f.TITULO, 'Nueva actividad asignada', cuerpo, f);
}

function _mktAvisoMencion_(ses, f, texto, mencionados) {
  var para = mencionados.filter(function (c) { return c !== String(ses.correo).toLowerCase(); });
  if (!para.length) { return { enviados: 0, fallidos: 0 }; }
  var cuerpo = '<p><b>' + _escHtml_(_mktNombre_(ses.correo)) + '</b> te mencionó en un comentario de «' + _escHtml_(f.TITULO) + '»:</p>' +
    '<p style="white-space:pre-wrap;background:#f4f6fb;padding:10px;border-radius:8px;border-left:4px solid #ff6a13">' + _escHtml_(String(texto).slice(0, 800)) + '</p>';
  return _mktCorreo_(para, 'Te mencionaron en: ' + f.TITULO, 'Te mencionaron en un comentario', cuerpo, f);
}

/* ---------- API unica ---------- */
function mktApi(accion, payloadJson, clave) {
  var escribe = !!MKT_ESCRIBEN[accion];
  var ses = _ses_(clave, escribe), nivel = _nivelArea_(ses, 'marketing');
  if (nivel < 1) { _bitacora_(ses.correo, 'ACCESO_NEGADO', 'marketing'); throw new Error('Area desconocida.'); }
  if (escribe && nivel < 2) { throw new Error('Tu permiso en Marketing es solo de consulta.'); }
  var p = {}; try { p = payloadJson ? JSON.parse(payloadJson) : {}; } catch (e) { throw new Error('Solicitud no válida.'); }
  var lock = null;
  if (escribe) { lock = LockService.getScriptLock(); lock.waitLock(25000); }
  try {
    switch (accion) {
      case 'inicio': return _mktInicio_(ses, nivel);
      case 'detalle': return _mktDetalle_(p);
      case 'archivo': return _mktDescarga_(p);
      case 'guardarTarea': return _mktGuardarTarea_(ses, nivel, p);
      case 'moverTarea': return _mktMover_(ses, nivel, p);
      case 'eliminarTarea': return _mktEliminarTarea_(ses, nivel, p);
      case 'comentar': return _mktComentar_(ses, nivel, p);
      case 'eliminarComentario': return _mktEliminarComentario_(ses, nivel, p);
      case 'subirArchivo': return _mktSubir_(ses, nivel, p);
      case 'eliminarArchivo': return _mktEliminarArchivo_(ses, nivel, p);
    }
    throw new Error('Acción desconocida.');
  } finally { if (lock) { try { lock.releaseLock(); } catch (e3) { /* nada */ } } }
}

function _mktInicio_(ses, nivel) {
  var t = _mktLee_('MKT_TAREAS'), cc = _mktConteo_(_mktLee_('MKT_COMENTARIOS').filter(function (c) { return c.TIPO !== 'sistema'; })), ca = _mktConteo_(_mktLee_('MKT_ARCHIVOS'));
  return { yo: String(ses.correo).toLowerCase(), nivel: nivel, etapas: MKT_ETAPAS, prioridades: MKT_PRIORIDADES, equipo: _mktEquipo_(),
           tareas: t.map(function (f) { return _mktTareaOut_(f, cc[f.ID], ca[f.ID]); }),
           extensiones: Object.keys(MKT_EXT), maxMb: 8 };
}

function _mktDetalle_(p) {
  var f = _mktTarea_(p.id), com = [], arc = [], hist = [];
  _mktLee_('MKT_COMENTARIOS').forEach(function (c) {
    if (c.TAREA === f.ID) { com.push({ id: c.ID, autor: c.AUTOR, fecha: c.FECHA, tipo: c.TIPO, texto: c.TEXTO, menciones: _mktSepara_(c.MENCIONES) }); }
  });
  _mktLee_('MKT_ARCHIVOS').forEach(function (a) {
    if (a.TAREA === f.ID) { arc.push({ id: a.ID, nombre: a.NOMBRE, mime: a.MIME, tamano: Number(a.TAMANO) || 0, subidoPor: a.SUBIDO_POR, fecha: a.FECHA, etapa: a.ETAPA }); }
  });
  try { hist = JSON.parse(f.HISTORIAL || '[]'); } catch (e) { hist = []; }
  return { tarea: _mktTareaOut_(f, com.filter(function (c) { return c.tipo !== 'sistema'; }).length, arc.length), comentarios: com, archivos: arc, historial: hist };
}

function _mktDescarga_(p) {
  var fila = null;
  _mktLee_('MKT_ARCHIVOS').forEach(function (a) { if (a.ID === p.id) { fila = a; } });
  if (!fila) { throw new Error('El archivo ya no existe.'); }
  var blob = DriveApp.getFileById(fila.DRIVE_ID).getBlob();
  return { nombre: fila.NOMBRE, mime: fila.MIME, b64: Utilities.base64Encode(blob.getBytes()) };
}

function _mktGuardarTarea_(ses, nivel, p) {
  var titulo = String(p.titulo || '').trim();
  if (!titulo) { throw new Error('Escribe el título de la actividad.'); }
  if (titulo.length > 200) { throw new Error('El título es demasiado largo (máx. 200).'); }
  var etapa = String(p.etapa || MKT_ETAPAS[0]);
  if (MKT_ETAPAS.indexOf(etapa) < 0) { throw new Error('Etapa no válida.'); }
  var prio = MKT_PRIORIDADES.indexOf(p.prioridad) >= 0 ? p.prioridad : 'Media';
  var inicio = _mktFecha_(p.inicio), fin = _mktFecha_(p.fin);
  if (inicio && fin && fin < inicio) { throw new Error('La fecha final no puede ser anterior a la inicial.'); }
  var equipo = _mktEquipo_(), validos = equipo.map(function (e) { return e.correo; });
  var resp = _mktSepara_((p.responsables || []).join(',')).filter(function (c, i, a) { return validos.indexOf(c) >= 0 && a.indexOf(c) === i; });
  var f, nuevo = !p.id, antes = [];
  if (nuevo) {
    f = { ID: _mktId_('T'), CREADO_POR: String(ses.correo).toLowerCase(), CREADO_EN: _mktAhora_(), HISTORIAL: '[]' };
    _mktHist_(f, 'Creó la actividad en ' + etapa, ses);
  } else {
    f = _mktTarea_(p.id);
    if (!_mktPuedeEditar_(ses, nivel, f)) { throw new Error('Solo quien creó la actividad, a quien se asignó o un editor puede modificarla.'); }
    antes = _mktSepara_(f.RESPONSABLES);
    if (f.ETAPA !== etapa) { _mktHist_(f, 'Movió de ' + f.ETAPA + ' a ' + etapa, ses); }
    else if (f.TITULO !== titulo || f.FIN !== fin || f.INICIO !== inicio || f.PRIORIDAD !== prio) { _mktHist_(f, 'Modificó la actividad', ses); }
  }
  f.TITULO = titulo; f.DESCRIPCION = String(p.descripcion || '').slice(0, 5000); f.ETAPA = etapa; f.PRIORIDAD = prio;
  f.RESPONSABLES = resp.join(','); f.INICIO = inicio; f.FIN = fin; f.ETIQUETAS = String(p.etiquetas || '').slice(0, 120);
  f.ACTUALIZADO_EN = _mktAhora_();
  if (nuevo) { _mktAgrega_('MKT_TAREAS', f); } else { _mktGuarda_('MKT_TAREAS', f); }
  var nuevosResp = resp.filter(function (c) { return antes.indexOf(c) < 0; });
  var avisos = nuevosResp.length ? _mktAvisoAsignacion_(ses, f, nuevosResp) : { enviados: 0, fallidos: 0 };
  _bitacora_(ses.correo, nuevo ? 'MKT_CREA' : 'MKT_EDITA', f.ID);
  return { tarea: _mktTareaOut_(f, p.comentarios, p.archivos), avisos: avisos };
}

function _mktMover_(ses, nivel, p) {
  var f = _mktTarea_(p.id), etapa = String(p.etapa || '');
  if (MKT_ETAPAS.indexOf(etapa) < 0) { throw new Error('Etapa no válida.'); }
  if (!_mktPuedeEditar_(ses, nivel, f)) { throw new Error('Solo quien creó la actividad, a quien se asignó o un editor puede moverla.'); }
  if (f.ETAPA !== etapa) {
    var de = f.ETAPA;
    _mktHist_(f, 'Movió de ' + de + ' a ' + etapa, ses);
    f.ETAPA = etapa; f.ACTUALIZADO_EN = _mktAhora_();
    _mktGuarda_('MKT_TAREAS', f);
    _mktAgrega_('MKT_COMENTARIOS', { ID: _mktId_('C'), TAREA: f.ID, AUTOR: String(ses.correo).toLowerCase(), FECHA: _mktAhora_(), TIPO: 'sistema',
      TEXTO: 'Movió la actividad de ' + de + ' a ' + etapa + ' (los archivos se mantienen).', MENCIONES: '' });
  }
  return { tarea: _mktTareaOut_(f) };
}

function _mktEliminarTarea_(ses, nivel, p) {
  var f = _mktTarea_(p.id), yo = String(ses.correo).toLowerCase();
  if (nivel < 3 && String(f.CREADO_POR).toLowerCase() !== yo) { throw new Error('Solo quien creó la actividad o un editor puede eliminarla.'); }
  var coms = _mktLee_('MKT_COMENTARIOS').filter(function (c) { return c.TAREA === f.ID; }).map(function (c) { return c._fila; });
  var archs = _mktLee_('MKT_ARCHIVOS').filter(function (a) { return a.TAREA === f.ID; });
  archs.forEach(function (a) { try { DriveApp.getFileById(a.DRIVE_ID).setTrashed(true); } catch (e) { /* ya no estaba */ } });
  if (coms.length) { _mktBorraFilas_('MKT_COMENTARIOS', coms); }
  if (archs.length) { _mktBorraFilas_('MKT_ARCHIVOS', archs.map(function (a) { return a._fila; })); }
  _mktBorraFilas_('MKT_TAREAS', [f._fila]);
  _bitacora_(ses.correo, 'MKT_ELIMINA', f.ID + ' ' + f.TITULO);
  return { ok: true };
}

function _mktComentar_(ses, nivel, p) {
  var f = _mktTarea_(p.tarea), texto = String(p.texto || '').trim();
  if (!texto) { throw new Error('Escribe el comentario.'); }
  if (texto.length > 3000) { throw new Error('El comentario es demasiado largo (máx. 3000).'); }
  var ment = _mktMenciones_(texto, _mktEquipo_());
  var c = { ID: _mktId_('C'), TAREA: f.ID, AUTOR: String(ses.correo).toLowerCase(), FECHA: _mktAhora_(), TIPO: 'comentario', TEXTO: texto, MENCIONES: ment.join(',') };
  _mktAgrega_('MKT_COMENTARIOS', c);
  var avisos = ment.length ? _mktAvisoMencion_(ses, f, texto, ment) : { enviados: 0, fallidos: 0 };
  return { comentario: { id: c.ID, autor: c.AUTOR, fecha: c.FECHA, tipo: c.TIPO, texto: c.TEXTO, menciones: ment }, avisos: avisos };
}

function _mktEliminarComentario_(ses, nivel, p) {
  var fila = null;
  _mktLee_('MKT_COMENTARIOS').forEach(function (c) { if (c.ID === p.id) { fila = c; } });
  if (!fila) { return { ok: true }; }
  if (fila.TIPO === 'sistema' && nivel < 3) { throw new Error('Los movimientos del sistema solo los quita un editor.'); }
  if (nivel < 3 && String(fila.AUTOR).toLowerCase() !== String(ses.correo).toLowerCase()) { throw new Error('Solo puedes eliminar tus comentarios.'); }
  _mktBorraFilas_('MKT_COMENTARIOS', [fila._fila]);
  return { ok: true };
}

function _mktSubir_(ses, nivel, p) {
  var f = _mktTarea_(p.tarea);
  var nombre = String(p.nombre || '').replace(/[\\\/:*?"<>|]+/g, '_').trim().slice(0, 150);
  var m = /\.([A-Za-z0-9]+)$/.exec(nombre), ext = m ? m[1].toLowerCase() : '';
  if (!MKT_EXT[ext]) { throw new Error('Tipo de archivo no permitido. Solo PDF, JPG, PNG y AI.'); }
  var b64 = String(p.b64 || '');
  if (!b64) { throw new Error('El archivo llegó vacío.'); }
  if (b64.length > MKT_MAX_B64) { throw new Error('El archivo pesa más de 8 MB.'); }
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, MKT_EXT[ext], nombre);
  var arch = _mktCarpeta_().createFile(blob);
  arch.setDescription('Marketing · ' + f.ID + ' · ' + f.TITULO + ' · subido por ' + ses.correo);
  var a = { ID: _mktId_('A'), TAREA: f.ID, NOMBRE: nombre, MIME: MKT_EXT[ext], DRIVE_ID: arch.getId(), TAMANO: bytes.length,
            SUBIDO_POR: String(ses.correo).toLowerCase(), FECHA: _mktAhora_(), ETAPA: f.ETAPA };
  _mktAgrega_('MKT_ARCHIVOS', a);
  _mktHist_(f, 'Subió el archivo ' + nombre, ses);
  f.ACTUALIZADO_EN = _mktAhora_();
  _mktGuarda_('MKT_TAREAS', f);
  return { archivo: { id: a.ID, nombre: a.NOMBRE, mime: a.MIME, tamano: bytes.length, subidoPor: a.SUBIDO_POR, fecha: a.FECHA, etapa: a.ETAPA } };
}

function _mktEliminarArchivo_(ses, nivel, p) {
  var fila = null;
  _mktLee_('MKT_ARCHIVOS').forEach(function (a) { if (a.ID === p.id) { fila = a; } });
  if (!fila) { return { ok: true }; }
  if (nivel < 3 && String(fila.SUBIDO_POR).toLowerCase() !== String(ses.correo).toLowerCase()) { throw new Error('Solo quien subió el archivo o un editor puede eliminarlo.'); }
  try { DriveApp.getFileById(fila.DRIVE_ID).setTrashed(true); } catch (e) { /* ya no estaba */ }
  _mktBorraFilas_('MKT_ARCHIVOS', [fila._fila]);
  return { ok: true };
}
