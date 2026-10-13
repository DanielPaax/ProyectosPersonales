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
