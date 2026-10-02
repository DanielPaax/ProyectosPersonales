var JG_SELLO = {
  producto: 'dashboard-produccion-gran-formato',
  nombre:   'TABLERO BIG FOOT print',
  version:  '1.4.0',
  liberada: '2026-10-02',
  esquema:  5
};

/* ===================== CONFIGURACION ===================== */
/* Regla: lo administrable va al panel; QUIEN administra vive en codigo. */

var CFG = {
  HOJA_BASE:      'BASE',
  HOJA_CATALOGOS: 'CATALOGOS',
  HOJA_BITACORA:  'BITACORA',
  HOJA_VENTAS:    'VENTAS',
  HOJA_TARIFAS:   'TARIFAS',
  CACHE_SEG:      120,
  TOPE_FILAS:     20000
};

/* Roles por correo. Todo el dominio lee; solo estos capturan o administran. */
/* OJO: estos correos tienen que ser del MISMO dominio del despliegue
   (gpowib.com). Una cuenta personal de Gmail nunca va a empatar y esa
   persona se queda como LECTOR sin entender por que. */
var ROLES = {
  MASTER:  ['eduardo.gongora@gpowib.com', 'danielpaax@gmail.com'],
  CAPTURA: ['eduardo.gongora@gpowib.com', 'danielpaax@gmail.com'],
  /* Venta, costos y margen son sensibles: NO los ve todo el dominio.
     Solo MASTER y los correos de esta lista abren la seccion de Venta.
     Para capturar venta ademas se necesita rol CAPTURA o MASTER. */
  VENTAS:  ['eduardo.gongora@gpowib.com', 'danielpaax@gmail.com']
};

/* Columnas de BASE. El orden es contrato: no se reordena sin subir esquema.
   Esquema 2: TURNO, OPERADOR y REIMPRESION. Esquema 4: ORDEN (ODC u ODP del
   pedido), que es la llave para ligar cada renglon de produccion con su
   venta, su cliente y su vendedor. */
var COL = {
  ID: 1, FECHA: 2, SEM_INICIO: 3, SEMANA: 4, MAQUINA: 5, PROCESO: 6,
  MATERIAL: 7, UNIDAD: 8, CANTIDAD: 9, ORIGEN: 10, CLIENTE_OT: 11,
  HORAS_MAQ: 12, MERMA_MT2: 13, MOTIVO_PARO: 14, NOTA: 15,
  CELDA_ORIGEN: 16, OBS_MIGRACION: 17,
  TURNO: 18, OPERADOR: 19, REIMPRESION: 20,
  ORDEN: 21
};
var COL_N = 21;

var ENCABEZADOS_BASE = [
  'ID', 'FECHA', 'SEM_INICIO', 'SEMANA', 'MAQUINA', 'PROCESO', 'MATERIAL',
  'UNIDAD', 'CANTIDAD', 'ORIGEN', 'CLIENTE_OT', 'HORAS_MAQ', 'MERMA_MT2',
  'MOTIVO_PARO', 'NOTA', 'CELDA_ORIGEN', 'OBS_MIGRACION',
  'TURNO', 'OPERADOR', 'REIMPRESION', 'ORDEN'
];
var ENCABEZADOS_BITACORA = ['TIMESTAMP', 'CORREO', 'ACCION', 'DETALLE'];

/* Hoja VENTAS (esquema 3; v5 quita MODULO): un renglon por LINEA de proyecto. Los costos van
   CONGELADOS como valores al momento de la venta: cambiar una tarifa despues
   no reescribe el margen historico. El margen se calcula en el servidor. */
var CV = {
  ID: 1, FECHA_VENTA: 2, SEM_INICIO: 3, SEMANA: 4, FECHA_PROD: 5, SEMANA_ORIG: 6,
  ODC: 7, ODP: 8, CLIENTE: 9, TIPO_PROYECTO: 10, PROYECTO: 11,
  MAQUINA: 12, MATERIAL: 13, M2_PROYECTO: 14, M2_REALES: 15, VENTA: 16,
  COSTO_MATERIAL: 17, COSTO_MERMA: 18, MAQUILA: 19, INSTALACION: 20,
  MANO_OBRA: 21, HORAS_EXTRAS: 22, OTROS: 23, CARGA_ADMIN: 24, COMERCIAL: 25,
  FACTURA: 26, FECHA_FACTURA: 27, METODO_PAGO: 28, ESTATUS_COBRO: 29,
  ESTATUS_MONTO: 30, CELDA_ORIGEN: 31, OBS_MIGRACION: 32, VENDEDOR: 33
};
var CV_N = 33;

var ENCABEZADOS_VENTAS = [
  'ID', 'FECHA_VENTA', 'SEM_INICIO', 'SEMANA', 'FECHA_PROD', 'SEMANA_ORIG',
  'ODC', 'ODP', 'CLIENTE', 'TIPO_PROYECTO', 'PROYECTO', 'MAQUINA',
  'MATERIAL', 'M2_PROYECTO', 'M2_REALES', 'VENTA', 'COSTO_MATERIAL',
  'COSTO_MERMA', 'MAQUILA', 'INSTALACION', 'MANO_OBRA', 'HORAS_EXTRAS',
  'OTROS', 'CARGA_ADMIN', 'COMERCIAL', 'FACTURA', 'FECHA_FACTURA',
  'METODO_PAGO', 'ESTATUS_COBRO', 'ESTATUS_MONTO', 'CELDA_ORIGEN',
  'OBS_MIGRACION', 'VENDEDOR'
];
var ENCABEZADOS_TARIFAS = ['MATERIAL', 'COSTO_M2'];

/* Catalogos nuevos que Instalar agrega a CATALOGOS si no existen. */
var CATALOGOS_VENTA = {
  VENDEDOR:      ['DANIEL TORRES', 'CARMEN PONCE', 'E-COMMERCE'],
  METODO_PAGO:   ['Transferencia', 'Efectivo'],
  ESTATUS_COBRO: ['FACTURADO', 'COBRADO'],
  TIPO_PROYECTO: ['Impresión', 'Serigrafia', 'Maquila']
};

var PROCESOS_IMPRESION = ['IMPRESION GRAN FORMATO', 'IMPRESION HD', 'IMPRESION UV'];

/* ===================== ENTRADA ===================== */

function doGet() {
  var t = HtmlService.createTemplateFromFile('index');
  t.sello = JG_SELLO;
  return t.evaluate()
    .setTitle(JG_SELLO.nombre)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function incluir(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/* ===================== IDENTIDAD Y ROL ===================== */
/* Toda funcion servidor resuelve identidad y rol EN EL SERVIDOR.
   Ocultar un boton en el HTML no es control de acceso: google.script.run
   expone toda funcion global y se puede llamar desde la consola. */

function _ses_() {
  var correo = '';
  try { correo = String(Session.getActiveUser().getEmail() || ''); } catch (e) { correo = ''; }
  correo = correo.toLowerCase().trim();
  if (!correo) {
    /* Pasa cuando el despliegue no exige dominio, o el usuario esta fuera
       del Workspace del propietario. Sin correo no hay sesion. */
    throw new Error('No se pudo identificar tu cuenta. Abre la aplicacion\n' +
      'con tu cuenta del dominio.');
  }
  var rol = 'LECTOR';
  if (_enLista_(ROLES.CAPTURA, correo)) { rol = 'CAPTURA'; }
  if (_enLista_(ROLES.MASTER, correo))  { rol = 'MASTER'; }
  var venta = (rol === 'MASTER') || _enLista_(ROLES.VENTAS, correo);
  return { correo: correo, rol: rol, venta: venta };
}

function _enLista_(lista, correo) {
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i]).toLowerCase().trim() === correo) { return true; }
  }
  return false;
}

function _exigeRol_(ses, roles) {
  for (var i = 0; i < roles.length; i++) {
    if (ses.rol === roles[i]) { return true; }
  }
  _bitacora_(ses.correo, 'ACCESO_NEGADO', 'rol=' + ses.rol + ' requeria=' + roles.join('/'));
  throw new Error('Sin autorizacion para esta accion.');
}

/* ===================== BITACORA ===================== */

function _bitacora_(correo, accion, detalle) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var h = ss.getSheetByName(CFG.HOJA_BITACORA);
    if (!h) { return; }
    h.appendRow([new Date(), String(correo || ''), String(accion || ''), String(detalle || '')]);
  } catch (e) { /* la bitacora nunca tumba la operacion */ }
}

/* ===================== LECTURA ===================== */
/* Se lee por RANGO acotado a la ultima fila y a las 20 columnas del contrato,
   nunca la hoja completa. El resultado se cachea por revision del Sheet. */

function _hoja_(nombre) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h) { throw new Error('Falta la hoja "' + nombre + '". Corre Instalar desde el menu.'); }
  return h;
}

function _num_(v) {
  var n = Number(v);
  /* NaN e Infinity rompen la serializacion de google.script.run: nunca salen de aqui. */
  if (!isFinite(n)) { return 0; }
  return n;
}

function _fecha_(v) {
  /* Se devuelve texto yyyy-MM-dd en la zona del script. Un Date serializado
     se recorre un dia al cruzar zonas; el texto no. */
  if (!v) { return ''; }
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

function _leerBase_() {
  var cache = CacheService.getScriptCache();
  var h = _hoja_(CFG.HOJA_BASE);
  var ultima = h.getLastRow();
  var clave = 'base_v' + JG_SELLO.esquema + '_' + ultima;
  var guardado = cache.get(clave);
  if (guardado) {
    try { return JSON.parse(guardado); } catch (e) { /* cache corrupto: se relee */ }
  }
  if (ultima < 2) { return []; }
  if (ultima - 1 > CFG.TOPE_FILAS) {
    throw new Error('La hoja BASE supera ' + CFG.TOPE_FILAS +
      ' renglones. Hay que archivar por ano.');
  }
  /* Se lee hasta donde la hoja tenga columnas: si todavia no corriste
     Instalar tras una subida de esquema, la columna nueva viene vacia en
     lugar de tronar la lectura. */
  var vals = h.getRange(2, 1, ultima - 1, Math.min(COL_N, h.getMaxColumns())).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[COL.SEMANA - 1] && !r[COL.MAQUINA - 1] && !r[COL.CANTIDAD - 1]) { continue; }
    out.push({
      fila:     i + 2,
      id:       _num_(r[COL.ID - 1]),
      fecha:    _fecha_(r[COL.FECHA - 1]),
      semIni:   _fecha_(r[COL.SEM_INICIO - 1]),
      semana:   String(r[COL.SEMANA - 1] || ''),
      maquina:  String(r[COL.MAQUINA - 1] || ''),
      proceso:  String(r[COL.PROCESO - 1] || ''),
      material: String(r[COL.MATERIAL - 1] || ''),
      unidad:   String(r[COL.UNIDAD - 1] || ''),
      cant:     _num_(r[COL.CANTIDAD - 1]),
      origen:   String(r[COL.ORIGEN - 1] || ''),
      cliente:  String(r[COL.CLIENTE_OT - 1] || ''),
      horas:    _num_(r[COL.HORAS_MAQ - 1]),
      merma:    _num_(r[COL.MERMA_MT2 - 1]),
      paro:     String(r[COL.MOTIVO_PARO - 1] || ''),
      nota:     String(r[COL.NOTA - 1] || ''),
      obs:      String(r[COL.OBS_MIGRACION - 1] || ''),
      turno:    String(r[COL.TURNO - 1] || ''),
      operador: String(r[COL.OPERADOR - 1] || ''),
      reimp:    String(r[COL.REIMPRESION - 1] || ''),
      orden:    String(r[COL.ORDEN - 1] || '').trim()
    });
  }
  /* cache.put tiene tope de 100 KB por entrada: si no cabe, se relee. */
  try { cache.put(clave, JSON.stringify(out), CFG.CACHE_SEG); } catch (e) {}
  return out;
}

function _leerCatalogos_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('catalogos_v' + JG_SELLO.esquema);
  if (guardado) {
    try { return JSON.parse(guardado); } catch (e) { /* se relee */ }
  }
  var h = _hoja_(CFG.HOJA_CATALOGOS);
  var ultima = h.getLastRow();
  var ancho = h.getLastColumn();
  var out = {};
  if (ultima >= 1 && ancho >= 1) {
    var vals = h.getRange(1, 1, ultima, ancho).getValues();
    for (var c = 0; c < ancho; c++) {
      var nombre = String(vals[0][c] || '').trim();
      if (!nombre) { continue; }
      var lista = [];
      for (var f = 1; f < vals.length; f++) {
        var v = String(vals[f][c] || '').trim();
        if (v) { lista.push(v); }
      }
      out[nombre] = lista;
    }
  }
  try { cache.put('catalogos_v' + JG_SELLO.esquema, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

/* ===================== AGREGACION ===================== */
/* Se agrega en el SERVIDOR y viaja un JSON compacto. Mandar 20 mil renglones
   al navegador para que sume es lo que hace lentas estas apps. */

function _esImpresion_(proceso) {
  for (var i = 0; i < PROCESOS_IMPRESION.length; i++) {
    if (PROCESOS_IMPRESION[i] === proceso) { return true; }
  }
  return false;
}

function _r2_(n) { return Math.round(_num_(n) * 100) / 100; }

/* Los MT2 se acumulan en CENTESIMAS enteras, no en flotante.
   Sumar 158 flotantes da un resultado distinto segun el orden: la semana
   del 31 de agosto salia 5577.56 o 5577.57 dependiendo de por donde se
   empezara. En centesimas enteras el total es siempre el mismo. */
function _cc_(n) { return Math.round(_num_(n) * 100); }
function _dc_(c) { return c / 100; }

function _ordenSemanas_(filas) {
  /* Se ordena por SEM_INICIO (fecha), no por la etiqueta de texto:
     "S10" ordenaria antes de "S2" en alfabetico. */
  var mapa = {};
  for (var i = 0; i < filas.length; i++) {
    var s = filas[i].semana;
    if (!s) { continue; }
    if (!mapa[s] || (filas[i].semIni && filas[i].semIni < mapa[s])) {
      mapa[s] = filas[i].semIni || '9999-12-31';
    }
  }
  var arr = [];
  for (var k in mapa) { if (mapa.hasOwnProperty(k)) { arr.push({ s: k, d: mapa[k] }); } }
  arr.sort(function (a, b) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : (a.s < b.s ? -1 : 1)); });
  var out = [];
  for (var j = 0; j < arr.length; j++) { out.push(arr[j].s); }
  return out;
}

function _matriz_(filas, campo, semanas) {
  var nombres = {};
  var celdas = {};
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (f.unidad !== 'MT2') { continue; }
    var n = f[campo] || '(SIN DATO)';
    nombres[n] = true;
    var k = n + '||' + f.semana;
    celdas[k] = _num_(celdas[k]) + _cc_(f.cant);
  }
  var lista = [];
  for (var nm in nombres) { if (nombres.hasOwnProperty(nm)) { lista.push(nm); } }
  var out = [];
  for (var j = 0; j < lista.length; j++) {
    var fila = { nombre: lista[j], val: [], total: 0 };
    for (var s = 0; s < semanas.length; s++) {
      var v = _num_(celdas[lista[j] + '||' + semanas[s]]);
      fila.val.push(_dc_(v));
      fila.total += v;
    }
    fila.total = _dc_(fila.total);
    out.push(fila);
  }
  out.sort(function (a, b) { return b.total - a.total; });
  return out;
}

/* Alertas de calidad de dato. Es el corazon del tablero: el archivo viejo
   fallaba en silencio y nadie lo veia hasta que el total no cuadraba. */
function _alertas_(filas) {
  var a = {
    sinFecha: 0, sinMaquina: 0, sinMaterial: 0, sinHoras: 0,
    obs: 0, cantCero: 0, sinUnidad: 0
  };
  var ejemplos = [];
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var motivos = [];
    if (!f.fecha)                                 { a.sinFecha++;    motivos.push('sin fecha'); }
    if (!f.maquina || f.maquina === '(NO REPORTADA)') {
      a.sinMaquina++; motivos.push('sin maquina');
    }
    if (f.material === '(NO REPORTADO)')          { a.sinMaterial++; motivos.push('sin material'); }
    if (!f.unidad)                                { a.sinUnidad++;   motivos.push('sin unidad'); }
    if (f.unidad === 'MT2' && f.horas === 0)      { a.sinHoras++; }
    if (f.cant === 0)                             { a.cantCero++; }
    if (f.obs) { a.obs++; motivos.push('observacion de migracion'); }
    if (motivos.length && ejemplos.length < 60) {
      ejemplos.push({
        fila: f.fila, semana: f.semana, maquina: f.maquina, proceso: f.proceso,
        material: f.material, unidad: f.unidad, cant: f.cant,
        motivo: motivos.join(', '), obs: f.obs
      });
    }
  }
  a.total = filas.length;
  a.ejemplos = ejemplos;
  return a;
}

/* ===================== FILTROS ===================== */
/* Los filtros viajan al SERVIDOR y se aplican antes de agregar: el tablero
   nunca recibe renglones que no va a pintar, y las reglas de permiso (quien
   puede filtrar por vendedor o cliente) no dependen del navegador. */

var SIN_DATO = '__SIN__';

/* Un filtro es una LISTA de valores (seleccion multiple); vacia = sin filtro.
   Acepta tambien un texto suelto por compatibilidad. */
function _lista_(v, max) {
  var arr = (v === null || v === undefined || v === '') ? []
    : (Object.prototype.toString.call(v) === '[object Array]' ? v : [v]);
  var out = [];
  for (var i = 0; i < arr.length && out.length < 300; i++) {
    var t = _texto_(arr[i], max);
    if (t) { out.push(t); }
  }
  return out;
}

function _fechaOk_(v) {
  var t = _texto_(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

function _fq_(f, ses) {
  f = f || {};
  var q = {
    sem: _lista_(f.sem, 10), mes: _lista_(f.mes, 7), anio: _lista_(f.anio, 4),
    maq: _lista_(f.maq, 120), ope: _lista_(f.ope, 60), mat: _lista_(f.mat, 150),
    ven: _lista_(f.ven, 60), cli: _lista_(f.cli, 80),
    desde: _fechaOk_(f.desde), hasta: _fechaOk_(f.hasta)
  };
  /* Vendedor y cliente salen de VENTAS: quien no ve ventas no filtra por ellos. */
  if (!ses.venta) { q.ven = []; q.cli = []; }
  return q;
}

/* ¿El valor cumple la lista? Lista vacia = si. SIN_DATO en la lista = "vacio". */
function _en_(arr, valor) {
  if (!arr.length) { return true; }
  if (!valor) { return arr.indexOf(SIN_DATO) >= 0; }
  return arr.indexOf(valor) >= 0;
}

/* Rango de fechas inclusivo (yyyy-MM-dd compara bien como texto). */
function _enRango_(q, fecha) {
  if (!q.desde && !q.hasta) { return true; }
  if (!fecha) { return false; }
  if (q.desde && fecha < q.desde) { return false; }
  if (q.hasta && fecha > q.hasta) { return false; }
  return true;
}

/* Sub-filtros de las tarjetas de PRODUCCION. Se combinan con Y. */
var SUBS = ['propios', 'maquila', 'planta', 'eventos', 'horas', 'merma', 'reimp'];

function _subs_(sub) {
  var arr = _lista_(sub, 20), out = [];
  for (var i = 0; i < arr.length; i++) { if (SUBS.indexOf(arr[i]) >= 0) { out.push(arr[i]); } }
  return out;
}

function _cumpleSub_(f, k) {
  switch (k) {
    case 'propios': return f.unidad === 'MT2' && _esImpresion_(f.proceso) && f.origen !== 'MAQUILA';
    case 'maquila': return f.unidad === 'MT2' && f.origen === 'MAQUILA';
    case 'planta':  return _cumpleSub_(f, 'propios') || _cumpleSub_(f, 'maquila');
    case 'eventos': return f.proceso === 'INSTALACION' || f.proceso === 'ENTREGA / RECOLECCION' ||
                           f.proceso === 'ROTULACION';
    case 'horas':   return f.horas > 0;
    case 'merma':   return f.merma > 0;
    case 'reimp':   return f.reimp === 'SI';
  }
  return true;
}

function _aplicaSub_(filas, subs) {
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var ok = true;
    for (var k = 0; k < subs.length; k++) {
      if (!_cumpleSub_(filas[i], subs[k])) { ok = false; break; }
    }
    if (ok) { out.push(filas[i]); }
  }
  return out;
}

/* ODC u ODP del pedido -> { ven, cli } tomados de VENTAS. Es lo que liga un
   renglon de produccion con su vendedor y su cliente. */
function _mapaOrdenes_() {
  var m = {};
  var v = _leerVentas_();
  for (var i = 0; i < v.length; i++) {
    var claves = [v[i].odc, v[i].odp];
    for (var k = 0; k < claves.length; k++) {
      if (!claves[k]) { continue; }
      var o = m[claves[k]];
      if (!o) { o = m[claves[k]] = { ven: '', cli: '' }; }
      if (!o.ven && v[i].vendedor) { o.ven = v[i].vendedor; }
      if (!o.cli && v[i].cliente)  { o.cli = v[i].cliente; }
    }
  }
  return m;
}

function _filtraProd_(filas, q) {
  var hayJoin = !!(q.ven.length || q.cli.length);
  var mapa = hayJoin ? _mapaOrdenes_() : null;
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var r = filas[i];
    if (!_en_(q.sem, r.semIni)) { continue; }
    if (!_en_(q.mes, r.fecha.slice(0, 7))) { continue; }
    if (!_en_(q.anio, r.fecha.slice(0, 4))) { continue; }
    if (!_enRango_(q, r.fecha)) { continue; }
    if (!_en_(q.maq, r.maquina)) { continue; }
    if (!_en_(q.ope, r.operador)) { continue; }
    if (!_en_(q.mat, r.material)) { continue; }
    if (hayJoin) {
      var j = (r.orden && mapa[r.orden]) || { ven: '', cli: '' };
      if (!_en_(q.ven, j.ven)) { continue; }
      if (!_en_(q.cli, j.cli)) { continue; }
    }
    out.push(r);
  }
  return out;
}

function _filtraCom_(filas, q) {
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var r = filas[i];
    if (!_en_(q.sem, r.semIni)) { continue; }
    if (!_en_(q.mes, r.fecha.slice(0, 7))) { continue; }
    if (!_en_(q.anio, r.fecha.slice(0, 4))) { continue; }
    if (!_enRango_(q, r.fecha)) { continue; }
    if (!_en_(q.maq, r.maquina)) { continue; }
    if (!_en_(q.mat, r.material)) { continue; }
    if (!_en_(q.ven, r.vendedor)) { continue; }
    if (!_en_(q.cli, r.cliente)) { continue; }
    out.push(r);
  }
  return out;
}

function _claves_(mapa, desc) {
  var arr = [];
  for (var k in mapa) { if (mapa.hasOwnProperty(k)) { arr.push(k); } }
  arr.sort();
  if (desc) { arr.reverse(); }
  return arr;
}

/* Todas las opciones de los selectores, de una sola vez, sobre los datos SIN
   filtrar. Los selectores no se encogen al filtrar: se limpian con un clic. */
function opcionesFiltros() {
  var ses = _ses_();
  _exigeRol_(ses, ['LECTOR', 'CAPTURA', 'MASTER']);
  var base = _leerBase_();
  var ven = ses.venta ? _leerVentas_() : [];
  var sem = {}, mes = {}, anio = {}, maq = {}, ope = {}, mat = {}, cli = {}, vend = {};

  function fechas(r) {
    if (r.semIni && !sem[r.semIni]) { sem[r.semIni] = r.semana || r.semIni; }
    if (r.fecha) { mes[r.fecha.slice(0, 7)] = true; anio[r.fecha.slice(0, 4)] = true; }
  }
  for (var i = 0; i < base.length; i++) {
    var b = base[i];
    fechas(b);
    if (b.maquina)  { maq[b.maquina] = true; }
    if (b.operador) { ope[b.operador] = true; }
    if (b.material) { mat[b.material] = true; }
  }
  for (var j = 0; j < ven.length; j++) {
    var v = ven[j];
    fechas(v);
    if (v.maquina)  { maq[v.maquina] = true; }
    if (v.material) { mat[v.material] = true; }
    if (v.cliente)  { cli[v.cliente] = true; }
    if (v.vendedor) { vend[v.vendedor] = true; }
  }
  if (ses.venta) {
    /* El catalogo manda: un vendedor dado de alta aparece aunque aun no tenga ventas. */
    var cv = _leerCatalogos_().VENDEDOR || [];
    for (var c = 0; c < cv.length; c++) { vend[cv[c]] = true; }
  }
  var semanas = [];
  var ks = _claves_(sem, true);
  for (var s = 0; s < ks.length; s++) { semanas.push({ v: ks[s], t: sem[ks[s]] }); }
  return {
    ses: ses, semanas: semanas, meses: _claves_(mes, true), anios: _claves_(anio, true),
    maquinas: _claves_(maq), operadores: _claves_(ope), materiales: _claves_(mat),
    vendedores: _claves_(vend), clientes: _claves_(cli)
  };
}

/* Agrega los renglones de produccion que le pasen (ya filtrados). */
function _agregaTablero_(filas) {
  var semanas = _ordenSemanas_(filas);

  var porSem = {};
  for (var s = 0; s < semanas.length; s++) {
    porSem[semanas[s]] = {
      semana: semanas[s], propios: 0, maquila: 0, planta: 0, delta: null,
      corte: 0, laminado: 0, laminas: 0, piezas: 0,
      inst: 0, entregas: 0, rotul: 0, horas: 0, merma: 0, reimp: 0
    };
  }
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var d = porSem[f.semana];
    if (!d) { continue; }
    var cc = _cc_(f.cant);
    if (f.unidad === 'MT2' && _esImpresion_(f.proceso)) {
      if (f.origen === 'MAQUILA') { d.maquila += cc; } else { d.propios += cc; }
    }
    if (f.unidad === 'MT2' && f.origen === 'MAQUILA' &&
        !_esImpresion_(f.proceso)) { d.maquila += cc; }
    if (f.unidad === 'MT2' && f.proceso === 'CORTE DE VINIL')     { d.corte += cc; }
    if (f.unidad === 'MT2' && f.proceso === 'LAMINADO / MONTAJE') { d.laminado += cc; }
    if (f.unidad === 'LAMINA') { d.laminas += cc; }
    if (f.unidad === 'PIEZA')  { d.piezas += cc; }
    if (f.proceso === 'INSTALACION')           { d.inst += cc; }
    if (f.proceso === 'ENTREGA / RECOLECCION') { d.entregas += cc; }
    if (f.proceso === 'ROTULACION')            { d.rotul += cc; }
    d.horas += _cc_(f.horas);
    d.merma += _cc_(f.merma);
    /* Las reimpresiones se cuentan como renglones enteros, no en centesimas. */
    if (f.reimp === 'SI') { d.reimp += 1; }
  }

  var serie = [];
  var prev = null;
  var totReimp = 0;
  var tot = {
    propios: 0, maquila: 0, planta: 0, laminas: 0, piezas: 0,
    inst: 0, entregas: 0, rotul: 0, horas: 0, merma: 0
  };
  for (var j = 0; j < semanas.length; j++) {
    var d2 = porSem[semanas[j]];
    var plantaCC = d2.propios + d2.maquila;
    tot.propios += d2.propios; tot.maquila += d2.maquila; tot.planta += plantaCC;
    tot.laminas += d2.laminas; tot.piezas += d2.piezas;
    tot.inst += d2.inst; tot.entregas += d2.entregas; tot.rotul += d2.rotul;
    tot.horas += d2.horas; tot.merma += d2.merma;
    totReimp += d2.reimp;
    d2.planta = _dc_(plantaCC);
    d2.propios = _dc_(d2.propios); d2.maquila = _dc_(d2.maquila);
    d2.corte = _dc_(d2.corte); d2.laminado = _dc_(d2.laminado);
    d2.laminas = _dc_(d2.laminas); d2.piezas = _dc_(d2.piezas);
    d2.inst = _dc_(d2.inst); d2.entregas = _dc_(d2.entregas); d2.rotul = _dc_(d2.rotul);
    d2.horas = _dc_(d2.horas); d2.merma = _dc_(d2.merma);
    /* delta null en la primera semana y cuando la anterior fue cero:
       dividir entre cero daria Infinity y eso no sobrevive el viaje. */
    d2.delta = (prev === null || prev === 0) ? null : _r2_((d2.planta / prev - 1) * 100);
    prev = d2.planta;
    serie.push(d2);
  }
  for (var k in tot) { if (tot.hasOwnProperty(k)) { tot[k] = _dc_(tot[k]); } }
  /* Se asigna DESPUES del ciclo de arriba: ese ciclo divide entre 100 y
     las reimpresiones son renglones, no centesimas. */
  tot.reimp = totReimp;
  tot.pctMaquila = tot.planta > 0 ? _r2_(tot.maquila / tot.planta * 100) : 0;
  tot.eventos = _r2_(tot.inst + tot.entregas + tot.rotul);
  tot.mermaPct = tot.propios > 0 ? _r2_(tot.merma / tot.propios * 100) : 0;
  tot.mt2Hora = tot.horas > 0 ? _r2_(tot.propios / tot.horas) : null;

  return {
    semanas: semanas,
    serie: serie,
    total: tot,
    porMaquina: _matriz_(filas, 'maquina', semanas),
    porMaterial: _matriz_(filas, 'material', semanas),
    porOperador: _matriz_(filas, 'operador', semanas),
    alertas: _alertas_(filas)
  };
}

/* ===================== COSTOS DE PRODUCCION ===================== */
/* Los costos viven en VENTAS (por proyecto). En PRODUCCION se reparten por
   FECHA DE PRODUCCION; si esa fecha falta o esta a mas de 90 dias de la de
   venta (error de captura), se usa la de venta. Aplican los filtros generales
   (semana, mes, rango, maquina, material, vendedor, cliente). NO aplican el de
   operador ni los sub-filtros de tarjeta: el costo es del proyecto, no de un
   renglon de trabajo. Dinero en centavos enteros: el total no depende del
   orden de suma. */

var COSTOS_CAMPOS = [
  ['mat', 'cMat'], ['merma', 'cMerma'], ['maq', 'maq'], ['inst', 'inst'],
  ['mo', 'mo'], ['hext', 'hext'], ['otros', 'otros'], ['carga', 'carga']
];

function _fechaProdEf_(r) {
  if (r.fprod && (!r.fecha || _diasEntre_(r.fecha, r.fprod) <= 90)) { return r.fprod; }
  return r.fecha;
}

function _mt2Planta_(f) {
  if (f.unidad !== 'MT2') { return 0; }
  return (_esImpresion_(f.proceso) || f.origen === 'MAQUILA') ? _cc_(f.cant) : 0;
}

function _cerosCosto_() {
  return { mat: 0, merma: 0, maq: 0, inst: 0, mo: 0, hext: 0, otros: 0, carga: 0, total: 0, mt2: 0 };
}

function _filaCosto_(k, etiqueta, a) {
  var o = { k: k, etiqueta: etiqueta };
  for (var i = 0; i < COSTOS_CAMPOS.length; i++) { o[COSTOS_CAMPOS[i][0]] = _dc_(a[COSTOS_CAMPOS[i][0]]); }
  o.total = _dc_(a.total);
  o.mt2 = _dc_(a.mt2);
  o.costoMt2 = a.mt2 > 0 ? _r2_(o.total / o.mt2) : null;
  return o;
}

function _costosProd_(q, prod) {
  var filas = _leerVentas_();
  var sem = {}, mes = {}, tot = _cerosCosto_(), semEt = {};
  function suma(a, c) {
    for (var i = 0; i < COSTOS_CAMPOS.length; i++) { a[COSTOS_CAMPOS[i][0]] += c[i]; }
    var t = 0; for (var k = 0; k < c.length; k++) { t += c[k]; }
    a.total += t;
  }
  for (var i = 0; i < filas.length; i++) {
    var r = filas[i];
    var fe = _fechaProdEf_(r);
    if (!fe) { continue; }
    var lunes = _semanaDe_(fe), mk = fe.slice(0, 7);
    if (!_en_(q.sem, lunes) || !_en_(q.mes, mk) || !_en_(q.anio, fe.slice(0, 4))) { continue; }
    if (!_enRango_(q, fe)) { continue; }
    if (!_en_(q.maq, r.maquina) || !_en_(q.mat, r.material)) { continue; }
    if (!_en_(q.ven, r.vendedor) || !_en_(q.cli, r.cliente)) { continue; }
    var c = [];
    for (var k = 0; k < COSTOS_CAMPOS.length; k++) { c.push(_cc_(r[COSTOS_CAMPOS[k][1]])); }
    if (!sem[lunes]) { sem[lunes] = _cerosCosto_(); semEt[lunes] = _etiquetaSemana_(lunes, []); }
    if (!mes[mk]) { mes[mk] = _cerosCosto_(); }
    suma(sem[lunes], c); suma(mes[mk], c); suma(tot, c);
  }
  /* MT2 de planta del mismo periodo, de los renglones de produccion que pasan
     los filtros generales: permite el costo por MT2 en la misma tabla. */
  for (var p = 0; p < prod.length; p++) {
    var m2 = _mt2Planta_(prod[p]);
    if (!m2) { continue; }
    if (sem[prod[p].semIni]) { sem[prod[p].semIni].mt2 += m2; }
    var pm = prod[p].fecha.slice(0, 7);
    if (mes[pm]) { mes[pm].mt2 += m2; }
    tot.mt2 += m2;
  }
  var semanal = [], mensual = [];
  var ks = _claves_(sem, false), km = _claves_(mes, false);
  for (var a = 0; a < ks.length; a++) { semanal.push(_filaCosto_(ks[a], semEt[ks[a]], sem[ks[a]])); }
  for (var b = 0; b < km.length; b++) { mensual.push(_filaCosto_(km[b], km[b], mes[km[b]])); }
  return { semanal: semanal, mensual: mensual, total: _filaCosto_('TOTAL', 'TOTAL', tot) };
}

/* ===================== API PUBLICA ===================== */

function cargarTablero(filtros, sub) {
  var ses = _ses_();
  _exigeRol_(ses, ['LECTOR', 'CAPTURA', 'MASTER']);
  var t0 = new Date().getTime();
  var q = _fq_(filtros, ses);
  var base = _filtraProd_(_leerBase_(), q);
  var subs = _subs_(sub);
  /* Las tarjetas (KPI) se calculan SIN el sub-filtro: son el menu desde el que
     se activa. Todo lo demas de la seccion si lo respeta. */
  var filas = subs.length ? _aplicaSub_(base, subs) : base;
  var res = _agregaTablero_(filas);
  return {
    sello: JG_SELLO,
    ses: ses,
    semanas: res.semanas,
    serie: res.serie,
    total: res.total,
    kpi: subs.length ? _agregaTablero_(base).total : res.total,
    subs: subs,
    porMaquina: res.porMaquina,
    porMaterial: res.porMaterial,
    porOperador: res.porOperador,
    alertas: res.alertas,
    costos: ses.venta ? _costosProd_(q, base) : null,
    ms: new Date().getTime() - t0
  };
}


function cargarCatalogos() {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  return _leerCatalogos_();
}

function detalleSemana(semana, filtros, sub) {
  var ses = _ses_();
  _exigeRol_(ses, ['LECTOR', 'CAPTURA', 'MASTER']);
  var s = String(semana || '');
  var q = _fq_(filtros, ses);
  q.sem = [];   /* la semana ya viene explicita */
  var filas = _filtraProd_(_leerBase_(), q);
  var subs = _subs_(sub);
  if (subs.length) { filas = _aplicaSub_(filas, subs); }
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].semana === s) { out.push(filas[i]); }
  }
  out.sort(function (a, b) {
    if (a.maquina !== b.maquina) { return a.maquina < b.maquina ? -1 : 1; }
    return b.cant - a.cant;
  });
  return { semana: s, filas: out };
}

/* ===================== ESCRITURA ===================== */

function _texto_(v, max) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s.length > max) { s = s.slice(0, max); }
  return s;
}

function _enCatalogo_(cats, llave, valor, obligatorio) {
  var lista = cats[llave] || [];
  if (!valor) {
    if (obligatorio) { throw new Error('Falta ' + llave + '.'); }
    return '';
  }
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i]).trim().toUpperCase() === valor.toUpperCase()) {
      return String(lista[i]).trim();
    }
  }
  throw new Error(llave + ' "' + valor + '" no esta en CATALOGOS. Darlo de alta primero.');
}

function _aDate_(iso) {
  /* Texto yyyy-MM-dd a Date local. new Date(texto) lo interpreta como UTC
     y la fecha se recorre un dia. */
  return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)));
}

function _semanaDe_(iso) {
  /* Lunes de la semana de la fecha dada, como texto yyyy-MM-dd.
     Se construye con numeros, nunca con new Date(texto): el parseo de
     texto asume UTC y recorre la fecha un dia. */
  var p = String(iso).split('-');
  var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (!y || !m || !d) { throw new Error('Fecha invalida.'); }
  var f = new Date(y, m - 1, d);
  var dow = f.getDay();
  var atras = (dow === 0) ? 6 : (dow - 1);
  f.setDate(f.getDate() - atras);
  return Utilities.formatDate(f, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _etiquetaSemana_(lunesIso, existentes) {
  /* Si ya hay renglones de esa semana, se reusa su etiqueta exacta.
     Inventar una segunda etiqueta para la misma semana parte el tablero. */
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].semIni === lunesIso && existentes[i].semana) { return existentes[i].semana; }
  }
  var p = lunesIso.split('-');
  var f = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  var fin = new Date(f.getTime());
  fin.setDate(fin.getDate() + 5);
  var tz = Session.getScriptTimeZone();
  return 'SEM ' + Utilities.formatDate(f, tz, 'dd/MM') + '-' +
    Utilities.formatDate(fin, tz, 'dd/MM/yy');
}

function guardarTrabajo(d) {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  if (!d) { throw new Error('No llego nada que guardar.'); }

  var cats = _leerCatalogos_();
  var fecha    = _texto_(d.fecha, 10);
  /* Los nombres de catalogo pueden ser largos (materiales de mas de 80
     caracteres): recortarlos aqui impedia que empataran con CATALOGOS. */
  var maquina  = _enCatalogo_(cats, 'MAQUINA',  _texto_(d.maquina, 80),  true);
  var proceso  = _enCatalogo_(cats, 'PROCESO',  _texto_(d.proceso, 80),  true);
  var material = _enCatalogo_(cats, 'MATERIAL', _texto_(d.material, 150), true);
  var unidad   = _enCatalogo_(cats, 'UNIDAD',   _texto_(d.unidad, 12),   true);
  var origen   = _enCatalogo_(cats, 'ORIGEN',   _texto_(d.origen, 12),   true);
  var paro     = _enCatalogo_(cats, 'MOTIVO_PARO', _texto_(d.paro, 40),  false);
  var turno    = _enCatalogo_(cats, 'TURNO',       _texto_(d.turno, 20),    false);
  var operador = _enCatalogo_(cats, 'OPERADOR',    _texto_(d.operador, 60), false);
  var reimp    = _enCatalogo_(cats, 'REIMPRESION', _texto_(d.reimp, 2),     false);
  var cant     = _num_(d.cant);
  var horas    = _num_(d.horas);
  var merma    = _num_(d.merma);
  var cliente  = _texto_(d.cliente, 120);
  var nota     = _texto_(d.nota, 500);
  var orden    = _texto_(d.orden, 30);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error('La fecha es obligatoria y va en formato yyyy-mm-dd.');
  }
  if (cant <= 0)  { throw new Error('La cantidad tiene que ser mayor que cero.'); }
  if (horas < 0 || merma < 0) { throw new Error('Horas y merma no pueden ser negativas.'); }
  if (unidad === 'MT2' && merma > cant) {
    throw new Error('La merma no puede ser mayor que lo producido.');
  }
  if (reimp === 'SI' && !nota) {
    throw new Error('Una reimpresion necesita una nota que explique el motivo.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('El sistema esta ocupado guardando otro trabajo.\n' +
      'Intenta de nuevo en unos segundos.');
  }
  try {
    var h = _hoja_(CFG.HOJA_BASE);
    var filas = _leerBase_();
    var lunes = _semanaDe_(fecha);
    var etiqueta = _etiquetaSemana_(lunes, filas);
    var maxId = 0;
    for (var i = 0; i < filas.length; i++) { if (filas[i].id > maxId) { maxId = filas[i].id; } }

    var reng = new Array(COL_N);
    reng[COL.ID - 1] = maxId + 1;
    reng[COL.FECHA - 1] = fecha;
    reng[COL.SEM_INICIO - 1] = lunes;
    reng[COL.SEMANA - 1] = etiqueta;
    reng[COL.MAQUINA - 1] = maquina;
    reng[COL.PROCESO - 1] = proceso;
    reng[COL.MATERIAL - 1] = material;
    reng[COL.UNIDAD - 1] = unidad;
    reng[COL.CANTIDAD - 1] = cant;
    reng[COL.ORIGEN - 1] = origen;
    reng[COL.CLIENTE_OT - 1] = cliente;
    reng[COL.HORAS_MAQ - 1] = horas > 0 ? horas : '';
    reng[COL.MERMA_MT2 - 1] = merma > 0 ? merma : '';
    reng[COL.MOTIVO_PARO - 1] = paro;
    reng[COL.NOTA - 1] = nota;
    reng[COL.CELDA_ORIGEN - 1] = 'CAPTURA EN APP';
    reng[COL.OBS_MIGRACION - 1] = '';
    reng[COL.ORDEN - 1] = orden;
    reng[COL.TURNO - 1] = turno;
    reng[COL.OPERADOR - 1] = operador;
    reng[COL.REIMPRESION - 1] = reimp;

    /* Una sola escritura por renglon, no una por celda. */
    h.getRange(h.getLastRow() + 1, 1, 1, COL_N).setValues([reng]);
    /* Formato explicito: la fecha entra como texto y hay que volverla fecha. */
    var nueva = h.getLastRow();
    h.getRange(nueva, COL.FECHA, 1, 2).setValues([[_aDate_(fecha), _aDate_(lunes)]]);
    h.getRange(nueva, COL.FECHA, 1, 2).setNumberFormat('dd/mm/yyyy');

    CacheService.getScriptCache().removeAll(['base_v' + JG_SELLO.esquema + '_' + (nueva - 1)]);
    _bitacora_(ses.correo, 'ALTA_TRABAJO',
      'id=' + (maxId + 1) + ' fila=' + nueva + ' ' + maquina + '/' + proceso + '/' + material +
      ' ' + cant + ' ' + unidad + ' semana=' + etiqueta +
      (turno ? ' turno=' + turno : '') + (operador ? ' operador=' + operador : '') +
      (reimp === 'SI' ? ' REIMPRESION' : ''));
    return { ok: true, id: maxId + 1, fila: nueva, semana: etiqueta };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== VENTAS (esquema 3) ===================== */
/* Todo lo de venta se resuelve EN EL SERVIDOR: el rol y el permiso de venta
   se calculan aqui, no en el HTML. Dinero en CENTAVOS enteros, igual que los
   MT2: el total no depende del orden de suma. */

function _exigeVenta_(ses, escribe) {
  var sinEscritura = escribe && ses.rol !== 'CAPTURA' && ses.rol !== 'MASTER';
  if (!ses.venta || sinEscritura) {
    _bitacora_(ses.correo, 'ACCESO_NEGADO', 'ventas escribe=' + !!escribe + ' rol=' + ses.rol);
    throw new Error('Sin autorizacion para esta accion.');
  }
}

function _leerVentas_() {
  var cache = CacheService.getScriptCache();
  var h = _hoja_(CFG.HOJA_VENTAS);
  var ultima = h.getLastRow();
  var clave = 'ventas_v' + JG_SELLO.esquema + '_' + ultima;
  var guardado = cache.get(clave);
  if (guardado) {
    try { return JSON.parse(guardado); } catch (e) { /* se relee */ }
  }
  if (ultima < 2) { return []; }
  if (ultima - 1 > CFG.TOPE_FILAS) {
    throw new Error('La hoja VENTAS supera ' + CFG.TOPE_FILAS +
      ' renglones. Hay que archivar por ano.');
  }
  /* VENTAS cambio de forma en el esquema 5 (se quito MODULO): con el codigo
     nuevo y la hoja vieja, todas las columnas se leerian corridas SIN avisar.
     Por eso se comprueban los encabezados antes de leer. */
  var encab = h.getRange(1, 1, 1, Math.min(CV_N, h.getMaxColumns())).getValues()[0];
  for (var e = 0; e < ENCABEZADOS_VENTAS.length; e++) {
    if (String(encab[e] || '').trim().toUpperCase() !== ENCABEZADOS_VENTAS[e]) {
      throw new Error('La hoja VENTAS todavia no tiene el esquema ' + JG_SELLO.esquema +
        ' (columna ' + (e + 1) + ' deberia ser ' + ENCABEZADOS_VENTAS[e] + '). ' +
        'Corre Produccion > Instalar / verificar hojas y vuelve a abrir el tablero.');
    }
  }
  var vals = h.getRange(2, 1, ultima - 1, Math.min(CV_N, h.getMaxColumns())).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[CV.FECHA_VENTA - 1] && !r[CV.CLIENTE - 1] && !r[CV.VENTA - 1]) { continue; }
    out.push({
      fila:     i + 2,
      id:       _num_(r[CV.ID - 1]),
      fecha:    _fecha_(r[CV.FECHA_VENTA - 1]),
      semIni:   _fecha_(r[CV.SEM_INICIO - 1]),
      semana:   String(r[CV.SEMANA - 1] || ''),
      fprod:    _fecha_(r[CV.FECHA_PROD - 1]),
      odc:      String(r[CV.ODC - 1] || ''),
      odp:      String(r[CV.ODP - 1] || ''),
      cliente:  String(r[CV.CLIENTE - 1] || ''),
      tipo:     String(r[CV.TIPO_PROYECTO - 1] || ''),
      proyecto: String(r[CV.PROYECTO - 1] || ''),
      maquina:  String(r[CV.MAQUINA - 1] || ''),
      material: String(r[CV.MATERIAL - 1] || ''),
      m2p:      _num_(r[CV.M2_PROYECTO - 1]),
      m2r:      _num_(r[CV.M2_REALES - 1]),
      venta:    _num_(r[CV.VENTA - 1]),
      cMat:     _num_(r[CV.COSTO_MATERIAL - 1]),
      cMerma:   _num_(r[CV.COSTO_MERMA - 1]),
      maq:      _num_(r[CV.MAQUILA - 1]),
      inst:     _num_(r[CV.INSTALACION - 1]),
      mo:       _num_(r[CV.MANO_OBRA - 1]),
      hext:     _num_(r[CV.HORAS_EXTRAS - 1]),
      otros:    _num_(r[CV.OTROS - 1]),
      carga:    _num_(r[CV.CARGA_ADMIN - 1]),
      factura:  String(r[CV.FACTURA - 1] || ''),
      fFactura: _fecha_(r[CV.FECHA_FACTURA - 1]),
      metodo:   String(r[CV.METODO_PAGO - 1] || ''),
      cobro:    String(r[CV.ESTATUS_COBRO - 1] || ''),
      estatus:  String(r[CV.ESTATUS_MONTO - 1] || ''),
      obs:      String(r[CV.OBS_MIGRACION - 1] || ''),
      vendedor: String(r[CV.VENDEDOR - 1] || '').trim()
    });
  }
  /* cache.put tiene tope de 100 KB por entrada: si no cabe, se relee. */
  try { cache.put(clave, JSON.stringify(out), CFG.CACHE_SEG); } catch (e) {}
  return out;
}

function _limpiaCacheVentas_() {
  var h = _hoja_(CFG.HOJA_VENTAS);
  CacheService.getScriptCache().removeAll([
    'ventas_v' + JG_SELLO.esquema + '_' + h.getLastRow(),
    'ventas_v' + JG_SELLO.esquema + '_' + (h.getLastRow() - 1)
  ]);
}

function _leerTarifas_() {
  var cache = CacheService.getScriptCache();
  var g = cache.get('tarifas_v' + JG_SELLO.esquema);
  if (g) { try { return JSON.parse(g); } catch (e) { /* se relee */ } }
  var h = _hoja_(CFG.HOJA_TARIFAS);
  var ultima = h.getLastRow();
  var out = { mat: {}, nombres: [], carga: 0 };
  if (ultima >= 2) {
    var vals = h.getRange(2, 1, ultima - 1, 5).getValues();
    for (var i = 0; i < vals.length; i++) {
      var m = String(vals[i][0] || '').trim();
      if (m) {
        out.mat[m.toUpperCase()] = { nombre: m, c: _num_(vals[i][1]) };
        out.nombres.push(m);
      }
      if (String(vals[i][3] || '').trim() === 'CARGA_M2') { out.carga = _num_(vals[i][4]); }
    }
  }
  try { cache.put('tarifas_v' + JG_SELLO.esquema, JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

function _clavePed_(f) { return f.odc || f.odp || ('F' + f.fila); }

function _hoyIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _diasEntre_(a, b) {
  return Math.round(Math.abs(_aDate_(a).getTime() - _aDate_(b).getTime()) / 86400000);
}

/* Filtro efectivo del area comercial: lo que elijas en la barra de COMERCIAL
   manda sobre la barra general en esa misma dimension; si la local esta en
   "Todas", se hereda la general. Operador no existe en VENTAS y se ignora. */
function _filtroEfectivoCom_(fg, fl, ses) {
  var g = _fq_(fg, ses), l = _fq_(fl, ses);
  function ef(a, b) { return b.length ? b : a; }
  return {
    sem: ef(g.sem, l.sem), mes: ef(g.mes, l.mes), anio: ef(g.anio, l.anio),
    maq: g.maq, mat: g.mat, ven: ef(g.ven, l.ven), cli: ef(g.cli, l.cli),
    desde: g.desde, hasta: g.hasta,
    ignorados: g.ope.length ? ['Operador'] : []
  };
}

function _semanasEntre_(a, b) {
  return Math.round((_aDate_(b).getTime() - _aDate_(a).getTime()) / (7 * 86400000)) + 1;
}

function cargarComercial(filtrosGlobal, filtrosLocal) {
  var ses = _ses_();
  _exigeVenta_(ses, false);
  var t0 = new Date().getTime();
  var todas = _leerVentas_();
  var q = _filtroEfectivoCom_(filtrosGlobal, filtrosLocal, ses);
  var filas = _filtraCom_(todas, q);
  var hoy = _hoyIso_();

  /* venta por pedido sobre TODAS las lineas: un filtro no debe hacer creer
     que un pedido no tiene monto cuando otra linea suya si lo trae. */
  var ventaPed = {};
  for (var i = 0; i < todas.length; i++) {
    var kp = _clavePed_(todas[i]);
    ventaPed[kp] = (ventaPed[kp] || 0) + _cc_(todas[i].venta);
  }

  var tot = 0, hastaHoy = 0;
  var peds = {}, clis = {};
  var semV = {}, semEt = {};
  var mMes = {}, mVen = {}, mCli = {}, venMes = {}, mesesSet = {};
  var cal = { pendConPista: 0, pendSinPista: 0, sinVendedor: 0, fechaFutura: 0,
    fechasDistantes: 0, sinMaterial: 0, m2Distantes: 0 };
  var graves = [], leves = [];

  function agg(mapa, k, vc, pk, cli) {
    var a = mapa[k];
    if (!a) { a = mapa[k] = { venta: 0, peds: {}, clis: {} }; }
    a.venta += vc;
    if (vc > 0) { a.peds[pk] = true; if (cli) { a.clis[cli] = true; } }
  }
  function cuenta(o) { var n = 0; for (var x in o) { if (o.hasOwnProperty(x)) { n++; } } return n; }

  for (var j = 0; j < filas.length; j++) {
    var f = filas[j];
    var vc = _cc_(f.venta);
    var pk = _clavePed_(f);
    var motivos = [];

    if (vc > 0) {
      tot += vc;
      peds[pk] = true;
      if (f.cliente) { clis[f.cliente] = true; }
      if (f.fecha && f.fecha <= hoy) { hastaHoy += vc; }
      var sk = f.semIni || f.fecha;
      if (sk) { semV[sk] = (semV[sk] || 0) + vc; semEt[sk] = f.semana || sk; }
      var nomVen = f.vendedor || '(SIN VENDEDOR)';
      agg(mVen, nomVen, vc, pk, f.cliente);
      if (!f.vendedor) { cal.sinVendedor++; motivos.push('sin vendedor'); }
      if (f.fecha) {
        var mk = f.fecha.slice(0, 7);
        mesesSet[mk] = true;
        agg(mMes, mk, vc, pk, f.cliente);
        if (!venMes[nomVen]) { venMes[nomVen] = {}; }
        venMes[nomVen][mk] = (venMes[nomVen][mk] || 0) + vc;
      }
      agg(mCli, f.cliente || '(SIN DATO)', vc, pk, f.cliente);
    } else {
      if (ventaPed[pk] > 0) { cal.pendConPista++; motivos.push('sin monto (otra linea del pedido si trae)'); }
      else { cal.pendSinPista++; motivos.push('pedido sin monto'); }
    }
    if (f.fecha > hoy) { cal.fechaFutura++; motivos.push('fecha de venta futura'); }
    if (f.fecha && f.fprod && _diasEntre_(f.fecha, f.fprod) > 90) {
      cal.fechasDistantes++; motivos.push('venta y produccion a >90 dias');
    }
    if (f.material === '(NO REPORTADO)' || !f.material) { cal.sinMaterial++; motivos.push('sin material'); }
    /* M2 de proyecto contra reales a mas de 5 veces: casi siempre un error de
       captura (8250 en lugar de 8.25) que infla costos y metros cuadrados. */
    if (f.m2p > 0 && f.m2r > 0 && (f.m2p / f.m2r > 5 || f.m2r / f.m2p > 5)) {
      cal.m2Distantes++; motivos.push('M2 de proyecto (' + f.m2p + ') y reales (' + f.m2r + ') difieren mas de 5 veces');
    }
    if (motivos.length) {
      var leve = motivos.length === 1 && motivos[0].indexOf('otra linea') >= 0;
      var dest = leve ? leves : graves;
      if (dest.length < 60) {
        dest.push({ id: f.id, fecha: f.fecha, cliente: f.cliente, proyecto: f.proyecto,
          vendedor: f.vendedor, venta: f.venta, motivo: motivos.join(', ') });
      }
    }
  }

  /* ---- semana mas reciente (no futura) y promedio semanal ---- */
  var sks = _claves_(semV, false), pasadas = [];
  for (var s = 0; s < sks.length; s++) { if (sks[s] <= hoy) { pasadas.push(sks[s]); } }
  var semUlt = null, promSem = null, nSem = 0;
  if (pasadas.length) {
    var ult = pasadas[pasadas.length - 1];
    var prevD = new Date(_aDate_(ult).getTime() - 7 * 86400000);
    var prevK = Utilities.formatDate(prevD, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var vUlt = semV[ult], vPrev = semV[prevK] || 0;
    semUlt = { etiqueta: semEt[ult], venta: _dc_(vUlt),
      vsAnterior: vPrev > 0 ? _r2_((vUlt / vPrev - 1) * 100) : null };
    nSem = _semanasEntre_(pasadas[0], ult);
    promSem = _r2_(_dc_(hastaHoy) / nSem);
  }
  var nPed = cuenta(peds);

  function lista(mapa, ordenarPor) {
    var arr = [];
    for (var k in mapa) {
      if (!mapa.hasOwnProperty(k)) { continue; }
      var a = mapa[k], np = cuenta(a.peds);
      arr.push({ nombre: k, venta: _dc_(a.venta), pct: tot > 0 ? _r2_(a.venta / tot * 100) : 0,
        pedidos: np, clientes: cuenta(a.clis), ticket: np > 0 ? _r2_(_dc_(a.venta) / np) : null });
    }
    arr.sort(ordenarPor === 'clave'
      ? function (x, y) { return x.nombre < y.nombre ? -1 : 1; }
      : function (x, y) { return y.venta - x.venta; });
    return arr;
  }

  var historico = lista(mMes, 'clave');
  for (var h = 0; h < historico.length; h++) {
    var antes = h > 0 ? historico[h - 1].venta : 0;
    historico[h].varPct = antes > 0 ? _r2_((historico[h].venta / antes - 1) * 100) : null;
  }
  var meses = _claves_(mesesSet, false);
  var vendedores = lista(mVen, 'venta');
  var matriz = [];
  for (var v = 0; v < vendedores.length; v++) {
    var nm = vendedores[v].nombre, val = [], tt = 0;
    for (var m = 0; m < meses.length; m++) {
      var c = (venMes[nm] && venMes[nm][meses[m]]) || 0;
      val.push(_dc_(c)); tt += c;
    }
    matriz.push({ nombre: nm, val: val, total: _dc_(tt) });
  }
  var clientes = lista(mCli, 'venta');
  if (clientes.length > 12) {
    var resto = { nombre: '(OTROS ' + (clientes.length - 12) + ')', venta: 0, pct: 0, pedidos: 0, clientes: 0, ticket: null };
    for (var r = 12; r < clientes.length; r++) {
      resto.venta += clientes[r].venta; resto.pct += clientes[r].pct; resto.pedidos += clientes[r].pedidos;
    }
    resto.venta = _r2_(resto.venta); resto.pct = _r2_(resto.pct);
    clientes = clientes.slice(0, 12); clientes.push(resto);
  }

  return {
    ses: ses,
    ignorados: q.ignorados,
    kpi: {
      venta: _dc_(tot), pedidos: nPed, clientes: cuenta(clis),
      ticket: nPed > 0 ? _r2_(_dc_(tot) / nPed) : null,
      semUltima: semUlt, promSemanal: promSem, nSemanas: nSem
    },
    porVendedor: vendedores,
    meses: meses,
    comparativo: matriz,
    historico: historico,
    porCliente: clientes,
    calidad: { c: cal, ejemplos: graves.concat(leves).slice(0, 80) },
    lineas: filas.length,
    ms: new Date().getTime() - t0
  };
}

function cargarCatalogosVenta() {
  var ses = _ses_();
  _exigeVenta_(ses, true);
  var cats = _leerCatalogos_();
  var tar = _leerTarifas_();
  var filas = _leerVentas_();
  var cli = {}, maq = {};
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].cliente) { cli[filas[i].cliente] = true; }
    if (filas[i].maquina && filas[i].maquina !== '(NO REPORTADA)') { maq[filas[i].maquina] = true; }
  }
  return {
    VENDEDOR: cats.VENDEDOR || [],
    METODO_PAGO: cats.METODO_PAGO || [], ESTATUS_COBRO: cats.ESTATUS_COBRO || [],
    TIPO_PROYECTO: cats.TIPO_PROYECTO || [],
    MATERIAL: tar.nombres, CARGA_M2: tar.carga,
    CLIENTE: Object.keys(cli).sort(), MAQUINA: Object.keys(maq).sort()
  };
}

/* Lista de proyectos para buscar y editar. Maximo 300, los mas recientes. */
function listarVentas(filtro) {
  var ses = _ses_();
  _exigeVenta_(ses, false);
  var q = String((filtro && filtro.q) || '').toUpperCase().trim();
  var soloPend = !!(filtro && filtro.soloPendientes);
  var filas = _leerVentas_();
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (filtro && filtro.id && f.id !== _num_(filtro.id)) { continue; }
    if (soloPend && f.venta > 0) { continue; }
    if (q) {
      var pajar = (f.cliente + ' ' + f.proyecto + ' ' + f.odc + ' ' + f.odp + ' ' +
        f.factura).toUpperCase();
      if (pajar.indexOf(q) < 0) { continue; }
    }
    out.push(f);
  }
  out.sort(function (a, b) {
    if (a.fecha !== b.fecha) { return a.fecha < b.fecha ? 1 : -1; }
    return b.id - a.id;
  });
  var total = out.length;
  out = out.slice(0, 300);
  var res = [];
  for (var j = 0; j < out.length; j++) {
    var o = out[j];
    res.push({
      id: o.id, fecha: o.fecha, odc: o.odc, odp: o.odp, cliente: o.cliente,
      proyecto: o.proyecto, venta: o.venta,
      factura: o.factura, fFactura: o.fFactura,
      metodo: o.metodo, cobro: o.cobro, vendedor: o.vendedor,
      pendiente: !(o.venta > 0), obs: o.obs
    });
  }
  return { total: total, filas: res };
}

function guardarVenta(d) {
  var ses = _ses_();
  _exigeVenta_(ses, true);
  if (!d) { throw new Error('No llego nada que guardar.'); }

  var cats = _leerCatalogos_();
  var tar = _leerTarifas_();
  var fecha    = _texto_(d.fecha, 10);
  var fprod    = _texto_(d.fprod, 10);
  var cliente  = _texto_(d.cliente, 80).toUpperCase().replace(/\s+/g, ' ');
  var proyecto = _texto_(d.proyecto, 160);
  var odc      = _texto_(d.odc, 30);
  var odp      = _texto_(d.odp, 30);
  var maquina  = _texto_(d.maquina, 80);
  var tipo     = _enCatalogo_(cats, 'TIPO_PROYECTO', _texto_(d.tipo, 30),     false);
  var vendedor = _enCatalogo_(cats, 'VENDEDOR',      _texto_(d.vendedor, 60),  false);
  var metodo   = _enCatalogo_(cats, 'METODO_PAGO',   _texto_(d.metodo, 30),   false);
  var cobro    = _enCatalogo_(cats, 'ESTATUS_COBRO', _texto_(d.cobro, 30),    false);
  var factura  = _texto_(d.factura, 30);
  var fFactura = _texto_(d.fFactura, 10);
  var m2p = _num_(d.m2p), m2r = _num_(d.m2r), venta = _num_(d.venta);
  var maq = _num_(d.maq), inst = _num_(d.inst), mo = _num_(d.mo);
  var hext = _num_(d.hext), otros = _num_(d.otros);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error('La fecha de venta es obligatoria y va en formato yyyy-mm-dd.');
  }
  if (fprod && !/^\d{4}-\d{2}-\d{2}$/.test(fprod)) { throw new Error('Fecha de produccion invalida.'); }
  if (fFactura && !/^\d{4}-\d{2}-\d{2}$/.test(fFactura)) { throw new Error('Fecha de factura invalida.'); }
  if (!cliente)  { throw new Error('Falta el cliente.'); }
  if (!proyecto) { throw new Error('Falta el nombre del proyecto.'); }
  if (venta < 0 || m2p < 0 || m2r < 0 || maq < 0 || inst < 0 || mo < 0 || hext < 0 || otros < 0) {
    throw new Error('Ningun importe ni cantidad puede ser negativo.');
  }

  /* Costos que se calculan solos con TARIFAS, igual que la hoja vieja:
     material = tarifa x m2 del proyecto; merma = tarifa x (m2 reales - m2 proyecto);
     carga administrativa = carga por m2 x m2 del proyecto. */
  var obs = [];
  var cMat = 0, cMerma = 0;
  var material = _texto_(d.material, 120);
  if (material) {
    var t = tar.mat[material.toUpperCase()];
    if (!t) { throw new Error('El material "' + material + '" no esta en la hoja TARIFAS.'); }
    material = t.nombre;
    cMat = _r2_(t.c * m2p);
    cMerma = _r2_(t.c * Math.max(m2r - m2p, 0));
  } else {
    material = '(NO REPORTADO)';
    obs.push('Sin material: costo de material y merma en cero.');
  }
  var carga = _r2_(tar.carga * m2p);
  var pendiente = venta <= 0;
  if (pendiente) { obs.push('Pendiente de monto de venta.'); }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('El sistema esta ocupado guardando otro registro.\n' +
      'Intenta de nuevo en unos segundos.');
  }
  try {
    var h = _hoja_(CFG.HOJA_VENTAS);
    var filas = _leerVentas_();
    var lunes = _semanaDe_(fecha);
    var etiqueta = _etiquetaSemana_(lunes, filas);
    var maxId = 0;
    for (var i = 0; i < filas.length; i++) { if (filas[i].id > maxId) { maxId = filas[i].id; } }

    var reng = new Array(CV_N);
    for (var c = 0; c < CV_N; c++) { reng[c] = ''; }
    reng[CV.ID - 1] = maxId + 1;
    reng[CV.FECHA_VENTA - 1] = fecha;
    reng[CV.SEM_INICIO - 1] = lunes;
    reng[CV.SEMANA - 1] = etiqueta;
    reng[CV.FECHA_PROD - 1] = fprod;
    reng[CV.ODC - 1] = odc;
    reng[CV.ODP - 1] = odp;
    reng[CV.CLIENTE - 1] = cliente;
    reng[CV.TIPO_PROYECTO - 1] = tipo;
    reng[CV.PROYECTO - 1] = proyecto;
    reng[CV.MAQUINA - 1] = maquina || '(NO REPORTADA)';
    reng[CV.MATERIAL - 1] = material;
    reng[CV.M2_PROYECTO - 1] = m2p || '';
    reng[CV.M2_REALES - 1] = m2r || '';
    reng[CV.VENTA - 1] = venta > 0 ? venta : '';
    reng[CV.COSTO_MATERIAL - 1] = cMat;
    reng[CV.COSTO_MERMA - 1] = cMerma;
    reng[CV.MAQUILA - 1] = maq;
    reng[CV.INSTALACION - 1] = inst;
    reng[CV.MANO_OBRA - 1] = mo;
    reng[CV.HORAS_EXTRAS - 1] = hext;
    reng[CV.OTROS - 1] = otros;
    reng[CV.CARGA_ADMIN - 1] = carga;
    reng[CV.VENDEDOR - 1] = vendedor;
    reng[CV.FACTURA - 1] = factura;
    reng[CV.METODO_PAGO - 1] = metodo;
    reng[CV.ESTATUS_COBRO - 1] = cobro || (factura ? 'FACTURADO' : '');
    reng[CV.ESTATUS_MONTO - 1] = pendiente ? 'PENDIENTE' : 'CON MONTO';
    reng[CV.CELDA_ORIGEN - 1] = 'CAPTURA EN APP';
    reng[CV.OBS_MIGRACION - 1] = obs.join(' ');

    var nueva = h.getLastRow() + 1;
    h.getRange(nueva, 1, 1, CV_N).setValues([reng]);
    /* Las fechas entran como texto: se vuelven fecha con formato explicito. */
    var fechas = [[_aDate_(fecha), _aDate_(lunes), fprod ? _aDate_(fprod) : '']];
    h.getRange(nueva, CV.FECHA_VENTA, 1, 1).setValue(fechas[0][0]);
    h.getRange(nueva, CV.SEM_INICIO, 1, 1).setValue(fechas[0][1]);
    h.getRange(nueva, CV.FECHA_PROD, 1, 1).setValue(fechas[0][2]);
    if (fFactura) { h.getRange(nueva, CV.FECHA_FACTURA, 1, 1).setValue(_aDate_(fFactura)); }
    h.getRange(nueva, CV.FECHA_VENTA, 1, 1).setNumberFormat('dd/mm/yyyy');
    h.getRange(nueva, CV.SEM_INICIO, 1, 1).setNumberFormat('dd/mm/yyyy');
    h.getRange(nueva, CV.FECHA_PROD, 1, 1).setNumberFormat('dd/mm/yyyy');
    h.getRange(nueva, CV.FECHA_FACTURA, 1, 1).setNumberFormat('dd/mm/yyyy');

    _limpiaCacheVentas_();
    _bitacora_(ses.correo, 'ALTA_VENTA',
      'id=' + (maxId + 1) + ' fila=' + nueva + ' ' + cliente + ' / ' + proyecto +
      ' venta=' + venta + ' semana=' + etiqueta);
    return { ok: true, id: maxId + 1, fila: nueva, semana: etiqueta, pendiente: pendiente };
  } finally {
    lock.releaseLock();
  }
}

/* Completa el monto de un pendiente y/o la cobranza de un proyecto ya
   capturado. Solo toca estas columnas: lo demas del renglon no se edita. */
function actualizarVenta(d) {
  var ses = _ses_();
  _exigeVenta_(ses, true);
  if (!d || !d.id) { throw new Error('Falta el ID del proyecto.'); }
  var cats = _leerCatalogos_();
  var id = _num_(d.id);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('El sistema esta ocupado. Intenta de nuevo en unos segundos.');
  }
  try {
    var h = _hoja_(CFG.HOJA_VENTAS);
    var ultima = h.getLastRow();
    var ids = ultima >= 2 ? h.getRange(2, 1, ultima - 1, 1).getValues() : [];
    var fila = 0;
    for (var i = 0; i < ids.length; i++) {
      if (_num_(ids[i][0]) === id) { fila = i + 2; break; }
    }
    if (!fila) { throw new Error('No encuentro el proyecto con ID ' + id + '.'); }

    var cambios = [];
    if (d.venta !== undefined && d.venta !== null && String(d.venta) !== '') {
      var v = _num_(d.venta);
      if (v <= 0) { throw new Error('El monto de venta tiene que ser mayor que cero.'); }
      var antes = _num_(h.getRange(fila, CV.VENTA).getValue());
      h.getRange(fila, CV.VENTA).setValue(v);
      h.getRange(fila, CV.ESTATUS_MONTO).setValue('CON MONTO');
      var obsAnt = String(h.getRange(fila, CV.OBS_MIGRACION).getValue() || '');
      h.getRange(fila, CV.OBS_MIGRACION).setValue(
        (obsAnt ? obsAnt + ' ' : '') + '[Monto capturado ' + _hoyIso_() + ' por ' + ses.correo + ']');
      cambios.push('venta ' + antes + '->' + v);
    }
    if (d.factura !== undefined) {
      var fac = _texto_(d.factura, 30);
      h.getRange(fila, CV.FACTURA).setValue(fac);
      cambios.push('factura=' + fac);
      if (fac && !_texto_(d.cobro, 30)) { h.getRange(fila, CV.ESTATUS_COBRO).setValue('FACTURADO'); }
    }
    if (d.fFactura !== undefined) {
      var ff = _texto_(d.fFactura, 10);
      if (ff && !/^\d{4}-\d{2}-\d{2}$/.test(ff)) { throw new Error('Fecha de factura invalida.'); }
      var cel = h.getRange(fila, CV.FECHA_FACTURA);
      if (ff) { cel.setValue(_aDate_(ff)); cel.setNumberFormat('dd/mm/yyyy'); } else { cel.clearContent(); }
      cambios.push('fecha factura=' + ff);
    }
    if (d.metodo !== undefined) {
      var me = _enCatalogo_(cats, 'METODO_PAGO', _texto_(d.metodo, 30), false);
      h.getRange(fila, CV.METODO_PAGO).setValue(me);
      cambios.push('metodo=' + me);
    }
    if (d.cobro !== undefined && _texto_(d.cobro, 30)) {
      var co = _enCatalogo_(cats, 'ESTATUS_COBRO', _texto_(d.cobro, 30), false);
      h.getRange(fila, CV.ESTATUS_COBRO).setValue(co);
      cambios.push('cobro=' + co);
    }
    if (d.vendedor !== undefined) {
      var vd = _enCatalogo_(cats, 'VENDEDOR', _texto_(d.vendedor, 60), false);
      h.getRange(fila, CV.VENDEDOR).setValue(vd);
      cambios.push('vendedor=' + vd);
    }
    if (!cambios.length) { throw new Error('No hay nada que actualizar.'); }

    _limpiaCacheVentas_();
    _bitacora_(ses.correo, 'EDITA_VENTA', 'id=' + id + ' fila=' + fila + ' ' + cambios.join(' | '));
    return { ok: true, id: id, fila: fila };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== CORRECCIONES PUNTUALES ===================== */
/* Corrige errores de captura que ya estan en los datos. Cada correccion:
   (1) solo actua si encuentra EXACTAMENTE el dato malo, asi que correrla dos
   veces no hace nada la segunda; (2) muestra antes y despues y pide
   confirmacion; (3) deja huella en OBS_MIGRACION y en BITACORA. */

function _r4_(n) { return Math.round(_num_(n) * 10000) / 10000; }

/* VINIL ED271: M2 de proyecto 8250 en lugar de 8.25 (la venta es de $3,135:
   a 8,250 m2 saldrian $0.38 por m2). Corrige VENTAS (m2 y costos congelados,
   con la MISMA formula del Excel original) y BASE (cantidad). */
function corregirViniEd271() {
  var ses = _ses_();
  _exigeRol_(ses, ['MASTER']);
  var ui = SpreadsheetApp.getUi();
  var M2_MAL = 8250, M2_BIEN = 8.25;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { throw new Error('El sistema esta ocupado. Intenta de nuevo en unos segundos.'); }
  try {
    var filas = _leerVentas_();
    var tar = _leerTarifas_();
    var objetivo = [];
    for (var i = 0; i < filas.length; i++) {
      if (filas[i].proyecto === 'VINIL ED271' && filas[i].m2p === M2_MAL) { objetivo.push(filas[i]); }
    }
    if (!objetivo.length) {
      ui.alert('Corregir VINIL ED271', 'No hay nada que corregir: no encuentro renglones de VINIL ED271 con ' +
        M2_MAL + ' m2 (ya estaban corregidos).', ui.ButtonSet.OK);
      return 'sin cambios';
    }
    var plan = [], txt = [];
    for (var k = 0; k < objetivo.length; k++) {
      var f = objetivo[k];
      var t = tar.mat[f.material.toUpperCase()];
      if (!t) { throw new Error('El material "' + f.material + '" no esta en TARIFAS: no puedo recalcular el costo.'); }
      /* Misma formula del Excel: material = tarifa x m2 proyecto;
         merma = tarifa x (m2 reales - m2 proyecto); carga = carga por m2 x m2 proyecto. */
      var nuevo = {
        cMat: _r4_(t.c * M2_BIEN),
        cMerma: _r4_(t.c * (f.m2r - M2_BIEN)),
        carga: _r4_(tar.carga * M2_BIEN)
      };
      plan.push({ f: f, n: nuevo });
      txt.push('ID ' + f.id + ' (fila ' + f.fila + '): M2 ' + f.m2p + ' -> ' + M2_BIEN +
        '\n   Costo material ' + f.cMat + ' -> ' + nuevo.cMat +
        '\n   Costo merma ' + f.cMerma + ' -> ' + nuevo.cMerma +
        '\n   Carga administrativa ' + f.carga + ' -> ' + nuevo.carga);
    }
    var r = ui.alert('Corregir VINIL ED271',
      'Se corregiran ' + plan.length + ' renglones de VENTAS y sus renglones de produccion en BASE:\n\n' +
      txt.join('\n\n') + '\n\n¿Aplicar la correccion?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) { return 'cancelado'; }

    var hv = _hoja_(CFG.HOJA_VENTAS), hb = _hoja_(CFG.HOJA_BASE);
    var nota = '[M2 corregido de ' + M2_MAL + ' a ' + M2_BIEN + ' el ' + _hoyIso_() + ' por ' + ses.correo + ']';
    var celdas = [], tocadosBase = 0;
    for (var p = 0; p < plan.length; p++) {
      var fila = plan[p].f.fila, n = plan[p].n;
      hv.getRange(fila, CV.M2_PROYECTO).setValue(M2_BIEN);
      hv.getRange(fila, CV.COSTO_MATERIAL).setValue(n.cMat);
      hv.getRange(fila, CV.COSTO_MERMA).setValue(n.cMerma);
      hv.getRange(fila, CV.CARGA_ADMIN).setValue(n.carga);
      var obs = String(hv.getRange(fila, CV.OBS_MIGRACION).getValue() || '');
      hv.getRange(fila, CV.OBS_MIGRACION).setValue((obs ? obs + ' ' : '') + nota);
      celdas.push(String(hv.getRange(fila, CV.CELDA_ORIGEN).getValue() || '').trim());
    }
    /* BASE: mismo renglon de origen (CELDA_ORIGEN) y el mismo dato malo. */
    var ub = hb.getLastRow();
    if (ub >= 2) {
      var bv = hb.getRange(2, 1, ub - 1, Math.min(COL_N, hb.getMaxColumns())).getValues();
      for (var j = 0; j < bv.length; j++) {
        var c = String(bv[j][COL.CELDA_ORIGEN - 1] || '').trim();
        if (c && celdas.indexOf(c) >= 0 && _num_(bv[j][COL.CANTIDAD - 1]) === M2_MAL) {
          hb.getRange(j + 2, COL.CANTIDAD).setValue(M2_BIEN);
          var ob = String(bv[j][COL.OBS_MIGRACION - 1] || '');
          hb.getRange(j + 2, COL.OBS_MIGRACION).setValue((ob ? ob + ' ' : '') + nota);
          tocadosBase++;
        }
      }
    }
    var cache = CacheService.getScriptCache();
    cache.removeAll(['base_v' + JG_SELLO.esquema + '_' + hb.getLastRow(),
      'ventas_v' + JG_SELLO.esquema + '_' + hv.getLastRow()]);
    var msg = 'VINIL ED271 corregido: ' + plan.length + ' renglones en VENTAS y ' + tocadosBase + ' en BASE.';
    _bitacora_(ses.correo, 'CORRECCION', msg + ' M2 ' + M2_MAL + ' -> ' + M2_BIEN);
    ui.alert('Corregir VINIL ED271', msg + '\n\nEspera hasta 2 minutos y pulsa Actualizar en el tablero.', ui.ButtonSet.OK);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/* ===================== INSTALACION Y MIGRACION ===================== */
/* Sin guion bajo: tienen que poder llamarse desde el editor y desde el menu. */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Produccion')
      .addItem('Abrir tablero', 'abrirTablero')
      .addSeparator()
      .addItem('Instalar / verificar hojas', 'instalar')
      .addItem('Vincular produccion con ventas (ORDEN)', 'vincularOrdenes')
      .addSeparator()
      .addItem('Corregir VINIL ED271 (M2 8250 a 8.25)', 'corregirViniEd271')
      .addItem('Ver version instalada', 'verVersion')
      .addToUi();
  } catch (e) { /* sin UI cuando corre por trigger */ }
}

function abrirTablero() {
  var html = HtmlService.createHtmlOutput(
    '<p style="font-family:Arial;font-size:13px">El tablero se abre como aplicacion web.<br><br>' +
    'Implementar &gt; Nueva implementacion &gt; Aplicacion web, y usar esa URL.</p>')
    .setWidth(380).setHeight(160);
  SpreadsheetApp.getUi().showModalDialog(html, JG_SELLO.nombre);
}

function verVersion() {
  var props = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert(
    JG_SELLO.nombre + '\n\nVersion: ' + JG_SELLO.version +
    '\nLiberada: ' + JG_SELLO.liberada +
    '\nEsquema de datos (codigo): ' + JG_SELLO.esquema +
    '\nEsquema de datos (instalado): ' + (props.getProperty('esquema') || 'sin registrar'));
}

function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hechos = [];

  var base = ss.getSheetByName(CFG.HOJA_BASE);
  if (!base) {
    /* Una instalacion nueva no tiene BASE todavia: se crea vacia con sus
       encabezados. Si el script esta pegado en el Sheet equivocado, aqui se
       nota porque faltaran tambien CATALOGOS y las demas hojas. */
    base = ss.insertSheet(CFG.HOJA_BASE);
    base.setFrozenRows(1);
    hechos.push('Hoja BASE creada vacia.');
  }
  var ven = ss.getSheetByName(CFG.HOJA_VENTAS);
  if (!ven) { ven = ss.insertSheet(CFG.HOJA_VENTAS); hechos.push('Hoja VENTAS creada.'); }

  /* Una hoja importada trae solo las columnas del esquema con que se migro:
     se agregan las que falten ANTES de tocar encabezados. */
  _aseguraColumnas_(base, COL_N);
  _aseguraColumnas_(ven, CV_N);
  /* La migracion de esquema va ANTES de verificar encabezados: una hoja vieja
     con datos tiene menos encabezados y la verificacion la rechazaria. */
  migrarEsquema(base, ven);
  hechos.push(migrarEncabezados(base, ENCABEZADOS_BASE));

  var cat = ss.getSheetByName(CFG.HOJA_CATALOGOS);
  if (!cat) { throw new Error('No encuentro la hoja CATALOGOS.'); }
  hechos.push(asegurarCatalogosVenta(cat));
  hechos.push(fusionarCatalogosProduccion(ss, cat));

  /* VENTAS y TARIFAS. Si ya importaste la migracion, solo se verifican los
     encabezados; si no existen, se crean vacias. */
  hechos.push(migrarEncabezados(ven, ENCABEZADOS_VENTAS));
  ven.setFrozenRows(1);
  hechos.push(_validaVendedor_(ven, cat));
  var tar = ss.getSheetByName(CFG.HOJA_TARIFAS);
  if (!tar) { tar = ss.insertSheet(CFG.HOJA_TARIFAS); hechos.push('Hoja TARIFAS creada.'); }
  hechos.push(migrarEncabezados(tar, ENCABEZADOS_TARIFAS));
  tar.setFrozenRows(1);
  hechos.push(_vincularOrdenes_());

  var bit = ss.getSheetByName(CFG.HOJA_BITACORA);
  if (!bit) {
    bit = ss.insertSheet(CFG.HOJA_BITACORA);
    hechos.push('Hoja BITACORA creada.');
  }
  hechos.push(migrarEncabezados(bit, ENCABEZADOS_BITACORA));
  bit.setFrozenRows(1);
  try {
    var p = bit.protect().setDescription('Bitacora append-only');
    p.removeEditors(p.getEditors());
    p.addEditor(Session.getEffectiveUser());
    hechos.push('Hoja BITACORA protegida.');
  } catch (e) { hechos.push('No se pudo proteger BITACORA: ' + e.message); }

  CacheService.getScriptCache().removeAll(['catalogos_v' + JG_SELLO.esquema,
    'tarifas_v' + JG_SELLO.esquema]);
  _bitacora_(_correoSeguro_(), 'INSTALACION', JG_SELLO.version + ' | ' + hechos.join(' '));

  try { SpreadsheetApp.getUi().alert('Instalacion\n\n' + hechos.join('\n')); } catch (e) {}
  return hechos;
}

function asegurarCatalogosVenta(cat) {
  /* Agrega a CATALOGOS las columnas nuevas de venta que falten. Nunca toca
     una columna que ya existe: si ya la editaste a mano, se respeta. */
  var ancho = Math.max(cat.getLastColumn(), 1);
  var encab = cat.getRange(1, 1, 1, ancho).getValues()[0];
  var existentes = {};
  for (var i = 0; i < encab.length; i++) {
    existentes[String(encab[i] || '').trim().toUpperCase()] = true;
  }
  var agregadas = [];
  var col = (cat.getLastRow() >= 1 && encab.join('').length) ? ancho + 1 : 1;
  for (var nombre in CATALOGOS_VENTA) {
    if (!CATALOGOS_VENTA.hasOwnProperty(nombre) || existentes[nombre]) { continue; }
    var lista = CATALOGOS_VENTA[nombre];
    var datos = [[nombre]];
    for (var j = 0; j < lista.length; j++) { datos.push([lista[j]]); }
    cat.getRange(1, col, datos.length, 1).setValues(datos);
    agregadas.push(nombre);
    col++;
  }
  return agregadas.length
    ? 'Catalogos agregados a CATALOGOS: ' + agregadas.join(', ') + '.'
    : 'Catalogos de venta ya existian.';
}

function fusionarCatalogosProduccion(ss, cat) {
  /* Si importaste la hoja CATALOGOS_PRODUCCION (la trae BASE_migracion.xlsx),
     sus valores se AGREGAN a CATALOGOS: columnas que falten y valores que no
     existan. Nunca se borra ni se cambia nada de lo que ya hay. */
  var src = ss.getSheetByName('CATALOGOS_PRODUCCION');
  if (!src) { return 'Sin hoja CATALOGOS_PRODUCCION: catalogos de produccion sin cambios.'; }
  var ult = src.getLastRow(), anc = src.getLastColumn();
  if (ult < 2 || anc < 1) { return 'CATALOGOS_PRODUCCION esta vacia.'; }
  var datos = src.getRange(1, 1, ult, anc).getValues();
  var agregados = [];
  for (var c = 0; c < anc; c++) {
    var nombre = String(datos[0][c] || '').trim().toUpperCase();
    if (!nombre) { continue; }
    var ancho = Math.max(cat.getLastColumn(), 1);
    var encab = cat.getRange(1, 1, 1, ancho).getValues()[0];
    var col = 0;
    for (var k = 0; k < encab.length; k++) {
      if (String(encab[k] || '').trim().toUpperCase() === nombre) { col = k + 1; break; }
    }
    if (!col) {
      col = encab.join('') === '' ? 1 : ancho + 1;
      cat.getRange(1, col).setValue(nombre);
    }
    var alto = Math.max(cat.getLastRow(), 1);
    var actuales = cat.getRange(1, col, alto, 1).getValues();
    var existen = {};
    var ultima = 1;
    for (var r = 1; r < actuales.length; r++) {
      var v = String(actuales[r][0] || '').trim();
      if (v) { existen[v.toUpperCase()] = true; ultima = r + 1; }
    }
    var nuevos = [];
    for (var f = 1; f < datos.length; f++) {
      var x = String(datos[f][c] || '').trim();
      if (x && !existen[x.toUpperCase()]) { existen[x.toUpperCase()] = true; nuevos.push([x]); }
    }
    if (nuevos.length) {
      cat.getRange(ultima + 1, col, nuevos.length, 1).setValues(nuevos);
      agregados.push(nombre + ' (+' + nuevos.length + ')');
    }
  }
  return agregados.length
    ? 'Catalogos de produccion fusionados: ' + agregados.join(', ') + '.'
    : 'Catalogos de produccion ya estaban completos.';
}

function _colPorNombre_(hoja, nombre) {
  var ancho = hoja.getLastColumn();
  if (ancho < 1) { return 0; }
  var encab = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  for (var i = 0; i < encab.length; i++) {
    if (String(encab[i] || '').trim().toUpperCase() === nombre) { return i + 1; }
  }
  return 0;
}

function _aseguraColumnas_(hoja, n) {
  var max = hoja.getMaxColumns();
  if (max < n) { hoja.insertColumnsAfter(max, n - max); }
}

/* La columna VENDEDOR de VENTAS se captura a mano en el Sheet: se le pone una
   lista desplegable que lee del catalogo, asi no se escriben nombres
   distintos para la misma persona y un vendedor nuevo (alta en CATALOGOS,
   columna VENDEDOR) aparece solo en la lista. */
function _validaVendedor_(ven, cat) {
  try {
    var ancho = Math.max(cat.getLastColumn(), 1);
    var encab = cat.getRange(1, 1, 1, ancho).getValues()[0];
    var col = 0;
    for (var i = 0; i < encab.length; i++) {
      if (String(encab[i] || '').trim().toUpperCase() === 'VENDEDOR') { col = i + 1; break; }
    }
    if (!col) { return 'No hay columna VENDEDOR en CATALOGOS: lista desplegable sin crear.'; }
    var filas = Math.max(ven.getMaxRows() - 1, 1);
    var regla = SpreadsheetApp.newDataValidation()
      .requireValueInRange(cat.getRange(2, col, 300, 1), true)
      .setAllowInvalid(false)
      .setHelpText('Elige un vendedor de la lista. Para agregar uno nuevo, anadelo en CATALOGOS, columna VENDEDOR.')
      .build();
    ven.getRange(2, CV.VENDEDOR, filas, 1).setDataValidation(regla);
    return 'Lista desplegable de VENDEDOR lista en VENTAS.';
  } catch (e) {
    return 'No se pudo crear la lista desplegable de VENDEDOR: ' + e.message;
  }
}

/* Rellena ORDEN en BASE a partir de VENTAS: ambos renglones nacieron de la
   misma celda del Excel original (CELDA_ORIGEN), asi que empatan sin
   adivinar. Solo escribe donde ORDEN esta vacio. Se puede correr las veces
   que sea necesario. */
function _vincularOrdenes_() {
  var base = _hoja_(CFG.HOJA_BASE), ven = _hoja_(CFG.HOJA_VENTAS);
  var ub = base.getLastRow(), uv = ven.getLastRow();
  if (ub < 2 || uv < 2) { return 'Vinculo ORDEN: sin datos en BASE o VENTAS todavia.'; }
  var vv = ven.getRange(2, 1, uv - 1, Math.min(CV_N, ven.getMaxColumns())).getValues();
  var porCelda = {};
  for (var i = 0; i < vv.length; i++) {
    var celda = String(vv[i][CV.CELDA_ORIGEN - 1] || '').trim();
    var orden = String(vv[i][CV.ODC - 1] || vv[i][CV.ODP - 1] || '').trim();
    if (celda && orden) { porCelda[celda] = orden; }
  }
  var bv = base.getRange(2, 1, ub - 1, Math.min(COL_N, base.getMaxColumns())).getValues();
  var out = [], nuevos = 0;
  for (var j = 0; j < bv.length; j++) {
    var actual = String(bv[j][COL.ORDEN - 1] || '').trim();
    var cb = String(bv[j][COL.CELDA_ORIGEN - 1] || '').trim();
    if (!actual && cb && porCelda[cb]) { out.push([porCelda[cb]]); nuevos++; }
    else { out.push([bv[j][COL.ORDEN - 1] === undefined ? '' : bv[j][COL.ORDEN - 1]]); }
  }
  if (nuevos) {
    base.getRange(2, COL.ORDEN, out.length, 1).setValues(out);
    CacheService.getScriptCache().removeAll(['base_v' + JG_SELLO.esquema + '_' + ub]);
  }
  return 'Vinculo ORDEN: ' + nuevos + ' renglones de produccion ligados a su venta.';
}

function vincularOrdenes() {
  var msg = _vincularOrdenes_();
  _bitacora_(_correoSeguro_(), 'VINCULO_ORDENES', msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

function migrarEncabezados(hoja, esperados) {
  /* Migracion EXPLICITA. "Crear la hoja si no existe" miente: una hoja que
     ya existe con encabezados viejos pasa la prueba y luego el codigo nuevo
     escribe en columnas que significan otra cosa. */
  var ancho = Math.max(hoja.getLastColumn(), esperados.length);
  var actual = hoja.getLastRow() >= 1
    ? hoja.getRange(1, 1, 1, ancho).getValues()[0]
    : [];
  var difiere = false;
  for (var i = 0; i < esperados.length; i++) {
    if (String(actual[i] || '').trim().toUpperCase() !== esperados[i]) { difiere = true; break; }
  }
  if (!difiere) { return 'Encabezados de "' + hoja.getName() + '" correctos.'; }
  if (hoja.getLastRow() > 1) {
    throw new Error('Los encabezados de "' + hoja.getName() + '" no coinciden con el esquema ' +
      JG_SELLO.esquema + ' y la hoja YA TIENE DATOS. Esperado: ' + esperados.join(' | ') +
      '. Encontrado: ' + actual.slice(0, esperados.length).join(' | ') +
      '. Hay que migrar a mano antes de continuar.');
  }
  hoja.getRange(1, 1, 1, esperados.length).setValues([esperados]);
  return 'Encabezados de "' + hoja.getName() + '" escritos.';
}

function migrarEsquema(base, ven) {
  var props = PropertiesService.getScriptProperties();
  var actual = Number(props.getProperty('esquema') || 0);
  if (actual === 0) { props.setProperty('esquema', '1'); actual = 1; }
  if (actual < 2) {
    /* v1 -> v2: TURNO, OPERADOR y REIMPRESION al final (columnas 18 a 20).
       Solo se escriben los encabezados si esas celdas estan vacias: nunca
       se pisa nada. Los renglones viejos quedan con esas columnas en blanco. */
    if (base) {
      var rng = base.getRange(1, COL.TURNO, 1, 3);
      var v = rng.getValues()[0];
      if (!v[0] && !v[1] && !v[2]) {
        rng.setValues([['TURNO', 'OPERADOR', 'REIMPRESION']]);
      }
    }
    props.setProperty('esquema', '2');
    actual = 2;
  }
  if (actual < 3) {
    /* v2 -> v3: hojas VENTAS y TARIFAS. Las crea o verifica instalar(); aqui
       solo se registra el peldano. */
    props.setProperty('esquema', '3');
    actual = 3;
  }
  if (actual < 4) {
    /* v3 -> v4: ORDEN al final de BASE y VENDEDOR al final de VENTAS. Solo se
       escribe el encabezado si la celda esta vacia. Los renglones viejos
       quedan en blanco; ORDEN se rellena con vincularOrdenes(). */
    if (base) {
      var cb = base.getRange(1, COL.ORDEN);
      if (!cb.getValue()) { cb.setValue('ORDEN'); }
    }
    /* VENTAS cambia de forma en la v5, asi que aqui se busca POR NOMBRE y se
       agrega al final: una posicion fija escribiria sobre otra columna. */
    if (ven && ven.getLastRow() >= 1 && !_colPorNombre_(ven, 'VENDEDOR')) {
      var ult = ven.getLastColumn();
      if (ven.getMaxColumns() <= ult) { ven.insertColumnsAfter(ven.getMaxColumns(), 1); }
      ven.getRange(1, ult + 1).setValue('VENDEDOR');
    }
    props.setProperty('esquema', '4');
    actual = 4;
  }
  if (actual < 5) {
    /* v4 -> v5: se QUITA la columna MODULO de VENTAS. Se busca por nombre; los
       datos de las demas columnas (vendedores capturados incluidos) se recorren
       solos hacia la izquierda. Si ya no existe, no hace nada. */
    if (ven && ven.getLastRow() >= 1) {
      var cm = _colPorNombre_(ven, 'MODULO');
      if (cm) { ven.deleteColumn(cm); }
    }
    props.setProperty('esquema', '5');
    actual = 5;
  }
  /* Peldanos futuros van aqui, siempre con if (actual < n), nunca de un salto:
     una instalacion puede estar dos o tres versiones atras. */
  return Number(props.getProperty('esquema'));
}

function _correoSeguro_() {
  try {
    return String(Session.getActiveUser().getEmail() || 'desconocido');
  } catch (e) { return 'desconocido'; }
}
