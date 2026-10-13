/* =====================================================================
   INTRANET BIG FOOT print: ENLACES Y FLUJO DE ORDENES ENTRE AREAS
   =====================================================================
   Este archivo es NUEVO: en Apps Script crea un archivo de secuencia de
   comandos llamado "Intranet" y pega esto. Comparte el espacio global con
   Code.gs (usa sus funciones _ses_, _exigeRol_, guardarVenta, etc.).

   El flujo que conecta las areas:

     COMERCIAL                OPERACIONES                 OPERACIONES
     Orden de venta  ───►  Orden de produccion  ───►  Orden de entrega
     (OV, crea la venta     (OP)                        o instalacion (OE)
      en VENTAS)

   Cada orden guarda el ID de la anterior, asi cualquiera se puede rastrear
   hasta la venta del Dashboard. Las hojas se crean solas la primera vez
   que se usan (o con Instalar). Las fechas se guardan como yyyy-MM-dd. */

var HOJAS_INTRANET = {
  ORDENES_VENTA: ['ID_OV', 'FECHA', 'CLIENTE', 'VENDEDOR', 'ODC_CLIENTE', 'PROYECTO', 'DESCRIPCION',
                  'M2', 'MONTO', 'FECHA_COMPROMISO', 'TIPO_ENTREGA', 'ESTATUS', 'ID_VENTA',
                  'ARCHIVO_OC', 'ID_OP', 'CREADA_POR', 'CREADA_EN', 'NOTAS'],
  ORDENES_PRODUCCION: ['ID_OP', 'ID_OV', 'FECHA', 'CLIENTE', 'PROYECTO', 'M2', 'FECHA_COMPROMISO',
                       'ESTATUS', 'ID_OE', 'CREADA_POR', 'CREADA_EN', 'NOTAS'],
  ORDENES_ENTREGA: ['ID_OE', 'ID_OP', 'ID_OV', 'TIPO', 'FECHA_PROGRAMADA', 'CLIENTE', 'DIRECCION',
                    'RESPONSABLE', 'ESTATUS', 'CREADA_POR', 'CREADA_EN', 'NOTAS'],
  ACTIVIDAD_COMERCIAL: ['ID', 'FECHA', 'VENDEDOR', 'LLAMADAS', 'MENSAJES', 'CORREOS', 'NOTAS',
                        'CAPTURADO_POR', 'CAPTURADO_EN'],
  ENLACES: ['AREA', 'CATEGORIA', 'TITULO', 'URL', 'DESCRIPCION', 'ORDEN']
};

/* Estatus permitidos y a donde se puede pasar desde cada uno. */
var ESTATUS_OV = ['CONFIRMADA', 'EN_PRODUCCION', 'LISTA_ENTREGA', 'ENTREGADA', 'CANCELADA'];
var TRANS_OP = { PENDIENTE: ['EN_PROCESO', 'CANCELADA'], EN_PROCESO: ['TERMINADA', 'CANCELADA'],
                 TERMINADA: [], CANCELADA: [] };
var TRANS_OE = { PROGRAMADA: ['EN_RUTA', 'REALIZADA', 'CANCELADA'], EN_RUTA: ['REALIZADA', 'CANCELADA'],
                 REALIZADA: [], CANCELADA: [] };
var TIPOS_ENTREGA = ['ENTREGA', 'INSTALACION'];

/* ===================== HOJAS ===================== */

/* Devuelve la hoja; si no existe la crea con sus encabezados. */
function _hojaI_(nombre) {
  var enc = HOJAS_INTRANET[nombre];
  if (!enc) { throw new Error('Hoja desconocida: ' + nombre); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, enc.length).setValues([enc]);
    try { h.setFrozenRows(1); h.getRange(1, 1, 1, enc.length).setFontWeight('bold'); } catch (e) { /* cosmetico */ }
  }
  return h;
}

function _instalaIntranet_(hechos) {
  var nombres = [];
  for (var n in HOJAS_INTRANET) {
    if (!HOJAS_INTRANET.hasOwnProperty(n)) { continue; }
    var existia = !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);
    _hojaI_(n);
    if (!existia) { nombres.push(n); }
  }
  hechos.push(nombres.length ? 'Intranet: hojas creadas: ' + nombres.join(', ') + '.' : 'Intranet: hojas ya existian.');
}

function _txtI_(col, v) {
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    return (col === 'CREADA_EN' || col === 'CAPTURADO_EN') ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm')
                                                          : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  if (v === null || v === undefined) { return ''; }
  return typeof v === 'number' ? (isFinite(v) ? v : 0) : String(v);
}

/* Lee una hoja de la intranet como lista de objetos {COLUMNA: valor, _fila}. */
function _tablaI_(nombre) {
  var h = _hojaI_(nombre), enc = HOJAS_INTRANET[nombre];
  var ult = h.getLastRow(), filas = [];
  if (ult >= 2) {
    var v = h.getRange(2, 1, ult - 1, enc.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var o = { _fila: i + 2 };
      for (var c = 0; c < enc.length; c++) { o[enc[c]] = _txtI_(enc[c], v[i][c]); }
      if (o[enc[0]] !== '') { filas.push(o); }
    }
  }
  return { h: h, enc: enc, filas: filas };
}

function _buscaI_(t, idCol, id) {
  for (var i = 0; i < t.filas.length; i++) { if (t.filas[i][idCol] === id) { return t.filas[i]; } }
  return null;
}

/* Cambia solo las columnas indicadas de una fila. */
function _ponI_(t, fila, campos) {
  for (var k in campos) {
    if (!campos.hasOwnProperty(k)) { continue; }
    var c = t.enc.indexOf(k);
    if (c < 0) { throw new Error('Columna desconocida: ' + k); }
    t.h.getRange(fila, c + 1).setValue(campos[k]);
  }
}

function _agregaI_(t, objeto) {
  var reng = [];
  for (var c = 0; c < t.enc.length; c++) {
    var v = objeto[t.enc[c]];
    reng.push(v === undefined || v === null ? '' : v);
  }
  t.h.appendRow(reng);
}

/* Siguiente ID con prefijo y año: OV-2026-0001. Se llama dentro del candado. */
function _idSiguiente_(t, prefijo) {
  var anio = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
  var re = new RegExp('^' + prefijo + '-' + anio + '-(\\d+)$'), max = 0;
  for (var i = 0; i < t.filas.length; i++) {
    var m = re.exec(String(t.filas[i][t.enc[0]]));
    if (m && Number(m[1]) > max) { max = Number(m[1]); }
  }
  var n = String(max + 1);
  while (n.length < 4) { n = '0' + n; }
  return prefijo + '-' + anio + '-' + n;
}

function _conCandado_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { throw new Error('El sistema esta ocupado. Intenta de nuevo en unos segundos.'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

function _fechaOpc_(v, nombre) {
  var s = _texto_(v, 10);
  if (!s) { return ''; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { throw new Error('La fecha de ' + nombre + ' debe ser aaaa-mm-dd.'); }
  return s;
}

function _urlOpc_(v, nombre) {
  var s = _texto_(v, 400);
  if (!s) { return ''; }
  if (!/^https?:\/\//i.test(s)) { throw new Error(nombre + ' debe ser un enlace que empiece con http:// o https://'); }
  return s;
}

/* Solo quien puede escribir: nunca un socio (aunque su correo este en alguna lista). */
function _exigeEscritura_(ses, area) {
  var a = _areaPorId_(area);
  if (ses.rol === 'SOCIO' || ses.porClave || !_accesoArea_(ses, a)) {
    _bitacora_(ses.correo, 'ACCESO_NEGADO', 'escritura area=' + area + ' rol=' + ses.rol);
    throw new Error('Sin autorizacion para esta accion.');
  }
}

function _exigeLectura_(ses, areas) {
  for (var i = 0; i < areas.length; i++) {
    if (_accesoArea_(ses, _areaPorId_(areas[i]))) { return true; }
  }
  _bitacora_(ses.correo, 'ACCESO_NEGADO', 'lectura areas=' + areas.join('/') + ' rol=' + ses.rol);
  throw new Error('Esta area tiene acceso restringido.');
}

/* ===================== ORDEN DE VENTA (COMERCIAL) ===================== */
/* Replica de "Capturar venta": registra la venta en VENTAS (la ve el Dashboard)
   y crea la orden de venta ligada a ella. Pide los mismos datos que guardarVenta
   mas: tipoEntrega, fechaCompromiso, descripcion, archivoOc (enlace al PDF de la
   orden de compra del cliente) y notas. Misma autorizacion que capturar venta. */
function crearOrdenVenta(d) {
  var ses = _ses_();
  _exigeVenta_(ses, true);
  if (!d) { throw new Error('No llego nada que guardar.'); }
  var tipoEntrega = _texto_(d.tipoEntrega || 'ENTREGA', 20).toUpperCase();
  if (TIPOS_ENTREGA.indexOf(tipoEntrega) < 0) { throw new Error('El tipo de entrega debe ser ENTREGA o INSTALACION.'); }
  var compromiso = _fechaOpc_(d.fechaCompromiso, 'compromiso');
  var archivo = _urlOpc_(d.archivoOc, 'El archivo de la orden de compra');

  /* 1) la venta (valida cliente, proyecto, material, vendedor, importes...) */
  var venta = guardarVenta(d);

  /* 2) la orden de venta ligada a esa venta */
  try {
    return _conCandado_(function () {
      var t = _tablaI_('ORDENES_VENTA');
      var id = _idSiguiente_(t, 'OV');
      _agregaI_(t, {
        ID_OV: id, FECHA: _texto_(d.fecha, 10) || _hoyIso_(),
        CLIENTE: _texto_(d.cliente, 80).toUpperCase().replace(/\s+/g, ' '),
        VENDEDOR: _texto_(d.vendedor, 60), ODC_CLIENTE: _texto_(d.odc, 30),
        PROYECTO: _texto_(d.proyecto, 160), DESCRIPCION: _texto_(d.descripcion, 400),
        M2: _num_(d.m2p), MONTO: _num_(d.venta), FECHA_COMPROMISO: compromiso,
        TIPO_ENTREGA: tipoEntrega, ESTATUS: 'CONFIRMADA', ID_VENTA: venta.id,
        ARCHIVO_OC: archivo, ID_OP: '', CREADA_POR: ses.correo, CREADA_EN: new Date(),
        NOTAS: _texto_(d.notas, 400)
      });
      _bitacora_(ses.correo, 'ALTA_OV', id + ' venta=' + venta.id);
      return { ok: true, idOV: id, idVenta: venta.id, semana: venta.semana, pendiente: venta.pendiente };
    });
  } catch (e) {
    _bitacora_(ses.correo, 'ERROR_OV', 'venta ' + venta.id + ' registrada sin orden: ' + e.message);
    throw new Error('La venta se registro (ID ' + venta.id + ') pero no se pudo crear la orden de venta: ' + e.message +
                    ' Avisa al administrador.');
  }
}

function cancelarOrdenVenta(idOV, motivo) {
  var ses = _ses_();
  _exigeVenta_(ses, true);
  return _conCandado_(function () {
    var t = _tablaI_('ORDENES_VENTA'), ov = _buscaI_(t, 'ID_OV', String(idOV || ''));
    if (!ov) { throw new Error('No encuentro la orden de venta ' + idOV + '.'); }
    if (ov.ESTATUS !== 'CONFIRMADA') {
      throw new Error('Solo se cancela una orden CONFIRMADA (esta esta ' + ov.ESTATUS + '). La venta ya registrada en VENTAS no se borra: corrigela ahi.');
    }
    _ponI_(t, ov._fila, { ESTATUS: 'CANCELADA', NOTAS: (ov.NOTAS ? ov.NOTAS + ' | ' : '') + 'Cancelada: ' + _texto_(motivo, 200) });
    _bitacora_(ses.correo, 'CANCELA_OV', ov.ID_OV);
    return { ok: true, idOV: ov.ID_OV };
  });
}

/* ===================== ORDEN DE PRODUCCION (OPERACIONES) ===================== */

function crearOrdenProduccion(idOV, d) {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  d = d || {};
  return _conCandado_(function () {
    var tv = _tablaI_('ORDENES_VENTA'), ov = _buscaI_(tv, 'ID_OV', String(idOV || ''));
    if (!ov) { throw new Error('No encuentro la orden de venta ' + idOV + '.'); }
    if (ov.ESTATUS !== 'CONFIRMADA') {
      throw new Error('La orden ' + ov.ID_OV + ' esta ' + ov.ESTATUS + ': solo una orden CONFIRMADA genera orden de produccion.');
    }
    var tp = _tablaI_('ORDENES_PRODUCCION');
    var id = _idSiguiente_(tp, 'OP');
    _agregaI_(tp, {
      ID_OP: id, ID_OV: ov.ID_OV, FECHA: _hoyIso_(), CLIENTE: ov.CLIENTE, PROYECTO: ov.PROYECTO,
      M2: ov.M2, FECHA_COMPROMISO: _fechaOpc_(d.fechaCompromiso, 'compromiso') || ov.FECHA_COMPROMISO,
      ESTATUS: 'PENDIENTE', ID_OE: '', CREADA_POR: ses.correo, CREADA_EN: new Date(), NOTAS: _texto_(d.notas, 400)
    });
    _ponI_(tv, ov._fila, { ESTATUS: 'EN_PRODUCCION', ID_OP: id });
    _ligaVentaOdp_(ov.ID_VENTA, id);
    _bitacora_(ses.correo, 'ALTA_OP', id + ' de ' + ov.ID_OV);
    return { ok: true, idOP: id, idOV: ov.ID_OV };
  });
}

/* Escribe el ID de la OP en la columna ODP del renglon de VENTAS: asi la venta, la
   orden y los renglones de BASE (columna ORDEN) hablan del mismo pedido. */
function _ligaVentaOdp_(idVenta, odp) {
  if (!idVenta) { return; }
  try {
    var h = _hoja_(CFG.HOJA_VENTAS), ult = h.getLastRow();
    if (ult < 2) { return; }
    var ids = h.getRange(2, CV.ID, ult - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (Number(ids[i][0]) === Number(idVenta)) {
        h.getRange(i + 2, CV.ODP).setValue(odp);
        _limpiaCacheVentas_();
        return;
      }
    }
  } catch (e) { _bitacora_('sistema', 'ERROR_LIGA_ODP', idVenta + ' ' + odp + ': ' + e.message); }
}

function cambiarEstatusOP(idOP, estatus) {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  estatus = _texto_(estatus, 20).toUpperCase();
  return _conCandado_(function () {
    var tp = _tablaI_('ORDENES_PRODUCCION'), op = _buscaI_(tp, 'ID_OP', String(idOP || ''));
    if (!op) { throw new Error('No encuentro la orden de produccion ' + idOP + '.'); }
    if ((TRANS_OP[op.ESTATUS] || []).indexOf(estatus) < 0) {
      throw new Error('Una orden ' + op.ESTATUS + ' no puede pasar a ' + estatus + '.');
    }
    _ponI_(tp, op._fila, { ESTATUS: estatus });
    var tv = _tablaI_('ORDENES_VENTA'), ov = _buscaI_(tv, 'ID_OV', op.ID_OV);
    if (ov && estatus === 'TERMINADA') { _ponI_(tv, ov._fila, { ESTATUS: 'LISTA_ENTREGA' }); }
    if (ov && estatus === 'CANCELADA') { _ponI_(tv, ov._fila, { ESTATUS: 'CONFIRMADA', ID_OP: '' }); }
    _bitacora_(ses.correo, 'ESTATUS_OP', op.ID_OP + ' -> ' + estatus);
    return { ok: true, idOP: op.ID_OP, estatus: estatus };
  });
}

/* ===================== ORDEN DE ENTREGA / INSTALACION (OPERACIONES) ===================== */

function crearOrdenEntrega(idOP, d) {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  d = d || {};
  return _conCandado_(function () {
    var tp = _tablaI_('ORDENES_PRODUCCION'), op = _buscaI_(tp, 'ID_OP', String(idOP || ''));
    if (!op) { throw new Error('No encuentro la orden de produccion ' + idOP + '.'); }
    if (op.ESTATUS !== 'TERMINADA') {
      throw new Error('La orden ' + op.ID_OP + ' esta ' + op.ESTATUS + ': solo una orden TERMINADA genera entrega o instalacion.');
    }
    if (op.ID_OE) { throw new Error('La orden ' + op.ID_OP + ' ya tiene la orden de entrega ' + op.ID_OE + '.'); }
    var tv = _tablaI_('ORDENES_VENTA'), ov = _buscaI_(tv, 'ID_OV', op.ID_OV);
    var tipo = _texto_(d.tipo || (ov && ov.TIPO_ENTREGA) || 'ENTREGA', 20).toUpperCase();
    if (TIPOS_ENTREGA.indexOf(tipo) < 0) { throw new Error('El tipo debe ser ENTREGA o INSTALACION.'); }
    var te = _tablaI_('ORDENES_ENTREGA');
    var id = _idSiguiente_(te, 'OE');
    _agregaI_(te, {
      ID_OE: id, ID_OP: op.ID_OP, ID_OV: op.ID_OV, TIPO: tipo,
      FECHA_PROGRAMADA: _fechaOpc_(d.fechaProgramada, 'programacion'), CLIENTE: op.CLIENTE,
      DIRECCION: _texto_(d.direccion, 300), RESPONSABLE: _texto_(d.responsable, 80),
      ESTATUS: 'PROGRAMADA', CREADA_POR: ses.correo, CREADA_EN: new Date(), NOTAS: _texto_(d.notas, 400)
    });
    _ponI_(tp, op._fila, { ID_OE: id });
    _bitacora_(ses.correo, 'ALTA_OE', id + ' de ' + op.ID_OP);
    return { ok: true, idOE: id, idOP: op.ID_OP, idOV: op.ID_OV, tipo: tipo };
  });
}

function cambiarEstatusOE(idOE, estatus) {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  estatus = _texto_(estatus, 20).toUpperCase();
  return _conCandado_(function () {
    var te = _tablaI_('ORDENES_ENTREGA'), oe = _buscaI_(te, 'ID_OE', String(idOE || ''));
    if (!oe) { throw new Error('No encuentro la orden de entrega ' + idOE + '.'); }
    if ((TRANS_OE[oe.ESTATUS] || []).indexOf(estatus) < 0) {
      throw new Error('Una orden ' + oe.ESTATUS + ' no puede pasar a ' + estatus + '.');
    }
    _ponI_(te, oe._fila, { ESTATUS: estatus });
    if (estatus === 'REALIZADA') {
      var tv = _tablaI_('ORDENES_VENTA'), ov = _buscaI_(tv, 'ID_OV', oe.ID_OV);
      if (ov) { _ponI_(tv, ov._fila, { ESTATUS: 'ENTREGADA' }); }
    }
    if (estatus === 'CANCELADA') {
      var tp = _tablaI_('ORDENES_PRODUCCION'), op = _buscaI_(tp, 'ID_OP', oe.ID_OP);
      if (op) { _ponI_(tp, op._fila, { ID_OE: '' }); }
    }
    _bitacora_(ses.correo, 'ESTATUS_OE', oe.ID_OE + ' -> ' + estatus);
    return { ok: true, idOE: oe.ID_OE, estatus: estatus };
  });
}

/* ===================== CONSULTA ===================== */

var TIPOS_ORDEN = { OV: 'ORDENES_VENTA', OP: 'ORDENES_PRODUCCION', OE: 'ORDENES_ENTREGA' };

/* Lista (maximo 300, las mas recientes). filtro: {estatus, texto}. Lee quien tenga
   acceso a Comercial u Operaciones; un socio por enlace tambien (solo lectura). */
function listarOrdenes(tipo, filtro, clave) {
  var ses = _ses_(clave);
  _exigeLectura_(ses, ['comercial', 'operaciones']);
  var hoja = TIPOS_ORDEN[String(tipo || '').toUpperCase()];
  if (!hoja) { throw new Error('Tipo de orden desconocido: ' + tipo); }
  filtro = filtro || {};
  var est = _texto_(filtro.estatus, 20).toUpperCase(), q = _texto_(filtro.texto, 60).toLowerCase();
  var filas = _tablaI_(hoja).filas, out = [];
  for (var i = filas.length - 1; i >= 0 && out.length < 300; i--) {
    var f = filas[i];
    if (est && f.ESTATUS !== est) { continue; }
    if (q) {
      var junto = '';
      for (var k in f) { if (f.hasOwnProperty(k) && k !== '_fila') { junto += ' ' + f[k]; } }
      if (junto.toLowerCase().indexOf(q) < 0) { continue; }
    }
    delete f._fila;
    out.push(f);
  }
  return out;
}

/* Cadena completa de cualquier orden: OV -> OP -> OE (y la venta de VENTAS). */
function trazaOrden(id, clave) {
  var ses = _ses_(clave);
  _exigeLectura_(ses, ['comercial', 'operaciones']);
  id = String(id || '').trim();
  var tv = _tablaI_('ORDENES_VENTA'), tp = _tablaI_('ORDENES_PRODUCCION'), te = _tablaI_('ORDENES_ENTREGA');
  var ov = null, op = null, oe = null;
  if (/^OE-/.test(id)) { oe = _buscaI_(te, 'ID_OE', id); if (oe) { op = _buscaI_(tp, 'ID_OP', oe.ID_OP); } }
  else if (/^OP-/.test(id)) { op = _buscaI_(tp, 'ID_OP', id); }
  else { ov = _buscaI_(tv, 'ID_OV', id); }
  if (op && !ov) { ov = _buscaI_(tv, 'ID_OV', op.ID_OV); }
  if (ov && !op && ov.ID_OP) { op = _buscaI_(tp, 'ID_OP', ov.ID_OP); }
  if (op && !oe && op.ID_OE) { oe = _buscaI_(te, 'ID_OE', op.ID_OE); }
  if (!ov && !op && !oe) { throw new Error('No encuentro la orden ' + id + '.'); }
  function limpia(o) { if (o) { delete o._fila; } return o; }
  return { ov: limpia(ov), op: limpia(op), oe: limpia(oe) };
}

/* ===================== ACTIVIDAD COMERCIAL (llamadas, mensajes, correos) ===================== */

function registrarActividad(d) {
  var ses = _ses_();
  _exigeEscritura_(ses, 'comercial');
  if (!d) { throw new Error('No llego nada que guardar.'); }
  var cats = _leerCatalogos_();
  var vendedor = _enCatalogo_(cats, 'VENDEDOR', _texto_(d.vendedor, 60), true);
  function cuenta(v, nombre) {
    var n = Number(v === '' || v === null || v === undefined ? 0 : v);
    if (!isFinite(n) || n < 0 || n > 9999 || Math.floor(n) !== n) { throw new Error(nombre + ' debe ser un numero entero de 0 a 9999.'); }
    return n;
  }
  var llamadas = cuenta(d.llamadas, 'Llamadas'), mensajes = cuenta(d.mensajes, 'Mensajes'), correos = cuenta(d.correos, 'Correos');
  if (llamadas + mensajes + correos === 0) { throw new Error('Captura al menos una llamada, mensaje o correo.'); }
  var fecha = _fechaOpc_(d.fecha, 'actividad') || _hoyIso_();
  return _conCandado_(function () {
    var t = _tablaI_('ACTIVIDAD_COMERCIAL');
    var id = t.filas.length ? Number(t.filas[t.filas.length - 1].ID) + 1 : 1;
    _agregaI_(t, { ID: id, FECHA: fecha, VENDEDOR: vendedor, LLAMADAS: llamadas, MENSAJES: mensajes, CORREOS: correos,
                   NOTAS: _texto_(d.notas, 300), CAPTURADO_POR: ses.correo, CAPTURADO_EN: new Date() });
    _bitacora_(ses.correo, 'ALTA_ACTIVIDAD', vendedor + ' ' + fecha + ' ll=' + llamadas + ' m=' + mensajes + ' c=' + correos);
    return { ok: true, id: id };
  });
}

/* Suma por vendedor en un rango (base del tablero de competencia). */
function resumenActividad(desde, hasta, clave) {
  var ses = _ses_(clave);
  _exigeLectura_(ses, ['comercial']);
  var d = _fechaOpc_(desde, 'inicio'), h = _fechaOpc_(hasta, 'fin');
  var filas = _tablaI_('ACTIVIDAD_COMERCIAL').filas, por = {};
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if ((d && f.FECHA < d) || (h && f.FECHA > h)) { continue; }
    var a = por[f.VENDEDOR] || (por[f.VENDEDOR] = { vendedor: f.VENDEDOR, llamadas: 0, mensajes: 0, correos: 0, total: 0 });
    a.llamadas += _num_(f.LLAMADAS); a.mensajes += _num_(f.MENSAJES); a.correos += _num_(f.CORREOS);
    a.total = a.llamadas + a.mensajes + a.correos;
  }
  var out = [];
  for (var k in por) { if (por.hasOwnProperty(k)) { out.push(por[k]); } }
  out.sort(function (x, y) { return y.total - x.total; });
  return out;
}

/* ===================== ENLACES (Talento Humano y otras areas) ===================== */
/* Se administran en la hoja ENLACES (AREA, CATEGORIA, TITULO, URL, DESCRIPCION, ORDEN):
   sin tocar codigo. Solo se muestran enlaces http(s). */
function _leerEnlaces_(areaId) {
  var filas = _tablaI_('ENLACES').filas, out = [];
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (String(f.AREA).trim().toLowerCase() !== areaId) { continue; }
    if (!/^https?:\/\//i.test(String(f.URL).trim())) { continue; }
    out.push({ categoria: String(f.CATEGORIA).trim() || 'General', titulo: String(f.TITULO).trim() || String(f.URL),
               url: String(f.URL).trim(), descripcion: String(f.DESCRIPCION).trim(), orden: _num_(f.ORDEN) || 9999 });
  }
  out.sort(function (a, b) { return a.orden - b.orden; });
  return out;
}

/* ===================== LOGOTIPO ===================== */
/* Logotipo bigfoot print incrustado (PNG, 640 px). El de fondo claro lo usa el portal;
   el blanco, las barras azules. Para cambiarlo: pega aqui otro data:image/png;base64,... */
var LOGO_DATA_URI = 'data:image/png;base64,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';
var LOGO_BLANCO_DATA_URI = 'data:image/png;base64,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';
