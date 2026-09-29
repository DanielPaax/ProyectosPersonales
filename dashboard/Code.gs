var JG_SELLO = {
  producto: 'dashboard-produccion-gran-formato',
  nombre:   'Dashboard de Produccion Gran Formato',
  version:  '1.1.0',
  liberada: '2026-09-29',
  esquema:  2
};

/* ===================== CONFIGURACION ===================== */
/* Regla: lo administrable va al panel; QUIEN administra vive en codigo. */

var CFG = {
  HOJA_BASE:      'BASE',
  HOJA_CATALOGOS: 'CATALOGOS',
  HOJA_BITACORA:  'BITACORA',
  CACHE_SEG:      120,
  TOPE_FILAS:     20000
};

/* Roles por correo. Todo el dominio lee; solo estos capturan o administran. */
/* OJO: estos correos tienen que ser del MISMO dominio del despliegue
   (gpowib.com). Una cuenta personal de Gmail nunca va a empatar y esa
   persona se queda como LECTOR sin entender por que. */
var ROLES = {
  MASTER:  ['eduardo.gongora@gpowib.com'],
  CAPTURA: ['eduardo.gongora@gpowib.com']
};

/* Columnas de BASE. El orden es contrato: no se reordena sin subir esquema.
   Esquema 2: se agregan TURNO, OPERADOR y REIMPRESION al final. */
var COL = {
  ID: 1, FECHA: 2, SEM_INICIO: 3, SEMANA: 4, MAQUINA: 5, PROCESO: 6,
  MATERIAL: 7, UNIDAD: 8, CANTIDAD: 9, ORIGEN: 10, CLIENTE_OT: 11,
  HORAS_MAQ: 12, MERMA_MT2: 13, MOTIVO_PARO: 14, NOTA: 15,
  CELDA_ORIGEN: 16, OBS_MIGRACION: 17,
  TURNO: 18, OPERADOR: 19, REIMPRESION: 20
};
var COL_N = 20;

var ENCABEZADOS_BASE = [
  'ID', 'FECHA', 'SEM_INICIO', 'SEMANA', 'MAQUINA', 'PROCESO', 'MATERIAL',
  'UNIDAD', 'CANTIDAD', 'ORIGEN', 'CLIENTE_OT', 'HORAS_MAQ', 'MERMA_MT2',
  'MOTIVO_PARO', 'NOTA', 'CELDA_ORIGEN', 'OBS_MIGRACION',
  'TURNO', 'OPERADOR', 'REIMPRESION'
];
var ENCABEZADOS_BITACORA = ['TIMESTAMP', 'CORREO', 'ACCION', 'DETALLE'];

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
  return { correo: correo, rol: rol };
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
  var vals = h.getRange(2, 1, ultima - 1, COL_N).getValues();
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
      reimp:    String(r[COL.REIMPRESION - 1] || '')
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

/* ===================== API PUBLICA ===================== */

function cargarTablero() {
  var ses = _ses_();
  _exigeRol_(ses, ['LECTOR', 'CAPTURA', 'MASTER']);
  var t0 = new Date().getTime();

  var filas = _leerBase_();
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
    sello: JG_SELLO,
    ses: ses,
    semanas: semanas,
    serie: serie,
    total: tot,
    porMaquina: _matriz_(filas, 'maquina', semanas),
    porMaterial: _matriz_(filas, 'material', semanas),
    porOperador: _matriz_(filas, 'operador', semanas),
    alertas: _alertas_(filas),
    ms: new Date().getTime() - t0
  };
}

function cargarCatalogos() {
  var ses = _ses_();
  _exigeRol_(ses, ['CAPTURA', 'MASTER']);
  return _leerCatalogos_();
}

function detalleSemana(semana) {
  var ses = _ses_();
  _exigeRol_(ses, ['LECTOR', 'CAPTURA', 'MASTER']);
  var s = String(semana || '');
  var filas = _leerBase_();
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
  var maquina  = _enCatalogo_(cats, 'MAQUINA',  _texto_(d.maquina, 40),  true);
  var proceso  = _enCatalogo_(cats, 'PROCESO',  _texto_(d.proceso, 40),  true);
  var material = _enCatalogo_(cats, 'MATERIAL', _texto_(d.material, 40), true);
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

/* ===================== INSTALACION Y MIGRACION ===================== */
/* Sin guion bajo: tienen que poder llamarse desde el editor y desde el menu. */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Produccion')
      .addItem('Abrir tablero', 'abrirTablero')
      .addSeparator()
      .addItem('Instalar / verificar hojas', 'instalar')
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
    throw new Error('No encuentro la hoja BASE. Este script va dentro\n' +
      'del Sheet de la plantilla.');
  }
  /* La migracion de esquema va ANTES de verificar encabezados: una hoja v1
     con datos tiene 17 encabezados y la verificacion de 20 la rechazaria. */
  migrarEsquema(base);
  hechos.push(migrarEncabezados(base, ENCABEZADOS_BASE));

  var cat = ss.getSheetByName(CFG.HOJA_CATALOGOS);
  if (!cat) { throw new Error('No encuentro la hoja CATALOGOS.'); }

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

  CacheService.getScriptCache().remove('catalogos_v' + JG_SELLO.esquema);
  _bitacora_(_correoSeguro_(), 'INSTALACION', JG_SELLO.version + ' | ' + hechos.join(' '));

  try { SpreadsheetApp.getUi().alert('Instalacion\n\n' + hechos.join('\n')); } catch (e) {}
  return hechos;
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

function migrarEsquema(base) {
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
  /* Peldanos futuros van aqui, siempre con if (actual < n), nunca de un salto:
     una instalacion puede estar dos o tres versiones atras. */
  return Number(props.getProperty('esquema'));
}

function _correoSeguro_() {
  try {
    return String(Session.getActiveUser().getEmail() || 'desconocido');
  } catch (e) { return 'desconocido'; }
}
