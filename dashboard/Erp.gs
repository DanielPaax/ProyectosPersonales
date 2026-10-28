/**
 * ERP (Clientes, cotizaciones, ODP, produccion, compras, inventario, facturacion)
 * ---------------------------------------------------------------------------
 * Vive en el MISMO archivo que el Dashboard: sus hojas llevan el prefijo ERP_
 * (ERP_Clientes, ERP_Cotizaciones, ERP_ODP...). Todo el codigo va dentro de `ERP`
 * para no chocar con los nombres del Dashboard. Entrada unica: erpApi() al final.
 *
 * FLUJO
 *   CRM:        Cliente > Cotizacion > (Aprobar) > ODP
 *   Produccion: ODP > produccion por maquina (escribe en BASE) y consumo de material (kardex PEPS)
 *               + costos (MO, instalacion, maquila...) > costo, utilidad y merma de la ODP
 *   Ventas:     Factura emitida (ligada a ODP) > cuentas por cobrar > cobros
 *   Compras:    Factura recibida > inventario / maquila a ODP / gasto > cuentas por pagar > pagos
 *   Almacen:    Conteo fisico > ajuste de inventario
 *
 * ALIMENTA AL DASHBOARD: cada ODP mantiene su renglon en VENTAS (ventaSync_) y cada registro de
 * produccion escribe un renglon en BASE (con la ODP en la columna ORDEN). El Dashboard y Direccion
 * leen esas dos hojas como siempre.
 */
var ERP = (function () {

/**
 * ERP IMPRENTA — Google Apps Script
 * --------------------------------------------------------------
 * Las hojas del Google Sheet son la base de datos; la app web son las pantallas.
 *
 * FLUJO
 *   CRM:        Cliente → Cotización → (Aprobar) → ODP
 *   Producción: ODP → Consumo de material (PEPS, descuenta inventario) + Costos (MO, instalación, maquila…)
 *               → Costo, utilidad y merma (m² usados vs m² vendidos) se recalculan solos
 *   Ventas:     Factura emitida (ligada a ODP) → Cuentas por cobrar → Cobros
 *   Compras:    Factura recibida (SAT) → Inventario (capas PEPS) / Maquila a ODP / Gasto → Cuentas por pagar → Pagos
 *   Almacén:    Conteo físico → Ajuste de inventario
 *
 * Primera vez: ejecuta la función setup() desde el editor.
 */

// ID de la hoja de Google Sheets que funciona como base de datos

// ==================== ESQUEMA ====================
const SCHEMA = {
  Config:        ['Clave', 'Valor', 'Descripcion'],
  Usuarios:      ['Email', 'Nombre', 'Rol', 'Activo', 'PrefijoCot'],
  Clientes:      ['ID', 'Nombre', 'RFC', 'Contacto', 'Telefono', 'Email', 'Comercial', 'DiasCredito', 'FechaAlta', 'Notas',
                  'RazonSocial', 'Domicilio', 'Colonia', 'Ciudad', 'CP', 'Estado'],
  Proveedores:   ['ID', 'Nombre', 'RFC', 'Contacto', 'Telefono', 'Email', 'DiasCredito', 'Notas'],
  Materiales:    ['Clave', 'Descripcion', 'Tipo', 'Unidad', 'StockMinimo', 'Activo', 'CostoReferencia', 'Presentacion'],
  Capas:         ['ID', 'Clave', 'Fecha', 'Origen', 'CantInicial', 'CantRestante', 'CostoUnit'],
  Kardex:        ['ID', 'Fecha', 'Clave', 'Tipo', 'Cantidad', 'CostoUnit', 'Importe', 'Referencia', 'ODP', 'Usuario', 'Notas'],
  Compras:       ['ID', 'Fecha', 'ProveedorID', 'Proveedor', 'FolioSAT', 'Tipo', 'ODP', 'Subtotal', 'IVA', 'Total', 'Vencimiento', 'Pagado', 'Saldo', 'Estatus', 'Usuario', 'Notas', 'Retenciones'],
  CompraDetalle: ['CompraID', 'Clave', 'Cantidad', 'CostoUnit', 'Importe'],
  Pagos:         ['ID', 'Fecha', 'CompraID', 'Monto', 'Referencia', 'Usuario'],
  Cotizaciones:  ['Folio', 'Fecha', 'ClienteID', 'Cliente', 'Comercial', 'Descripcion', 'M2', 'Subtotal', 'IVA', 'Total', 'Estatus', 'ODP', 'ProximoSeguimiento', 'Notas',
                  'Proyecto', 'RazonSocial', 'Terminados', 'Descuento', 'TipoProyecto', 'AgenteVentas', 'DescuentoPct', 'Indicaciones'],
  CotDetalle:    ['Folio', 'Linea', 'Descripcion', 'Ancho', 'Alto', 'Cantidad', 'M2', 'PrecioM2', 'PrecioUnit', 'Importe', 'Unidad',
                  'Impresion', 'TintaBlanca', 'Barniz', 'Acabado1', 'Param1', 'Acabado2', 'Param2', 'Acabado3', 'Param3', 'Detalle', 'CostoMaterial', 'CostoTinta', 'CostoAcabados', 'PrecioManual'],
  Seguimiento:   ['ID', 'Fecha', 'ClienteID', 'Cliente', 'Cotizacion', 'Comercial', 'Tipo', 'Nota', 'ProximaAccion'],
  ODP:           ['Folio', 'Fecha', 'Cotizacion', 'ClienteID', 'Cliente', 'Comercial', 'Descripcion', 'M2Vendidos', 'PrecioVenta', 'FechaEntrega', 'Estatus',
                  'Facturado', 'CostoMaterial', 'CostoTinta', 'CostoMO', 'CostoMaquila', 'CostoOtros', 'CostoTotal', 'Utilidad', 'Margen',
                  'M2Usados', 'MermaM2', 'MermaPct', 'CostoMerma', 'Factura',
                  'Proyecto', 'HorarioEntrega', 'RecolectaCliente', 'DireccionEntrega', 'Domicilio', 'Colonia', 'Ciudad', 'CP', 'Estado',
                  'Telefono', 'Email', 'RecibeProduccion', 'TipoProyecto', 'AgenteVentas'],
  ODPDetalle:    ['ODP', 'Linea', 'Piezas', 'Ancho', 'Alto', 'M2', 'Material', 'Maquina', 'Archivo', 'Acabados'],
  ODPCostos:     ['ID', 'ODP', 'Fecha', 'Tipo', 'Concepto', 'Cantidad', 'CostoUnit', 'Importe', 'CompraID', 'Usuario'],
  Facturas:      ['ID', 'Fecha', 'FolioSAT', 'ClienteID', 'Cliente', 'Comercial', 'ODP', 'Subtotal', 'IVA', 'Total', 'Vencimiento', 'Cobrado', 'Saldo', 'Estatus', 'Notas'],
  Cobros:        ['ID', 'Fecha', 'FacturaID', 'Monto', 'Referencia', 'Usuario'],
  Conteos:       ['ID', 'Fecha', 'Clave', 'Sistema', 'Fisico', 'Diferencia', 'CostoUnit', 'ImporteDif', 'Aplicado', 'Usuario'],
};

// Permisos por rol
const ROLES_ERP = {
  ADMIN:      ['*'],
  DIRECCION:  ['dash', 'fin', 'reportes', 'crm_ver', 'odp_ver', 'inv_ver', 'cxc_ver', 'cxp_ver'],
  COMERCIAL:  ['dash', 'crm', 'odp_ver', 'cxc_ver'],
  PRODUCCION: ['dash', 'odp', 'odp_ver', 'consumo', 'inv_ver', 'prod'],
  CONSULTA:   ['dash', 'crm_ver', 'odp_ver'],
  ALMACEN:    ['dash', 'inv', 'inv_ver', 'compras', 'consumo', 'conteo'],
  FINANZAS:   ['dash', 'fin', 'reportes', 'compras', 'cxp', 'cxp_ver', 'cxc', 'cxc_ver', 'facturas', 'odp_ver', 'inv_ver', 'crm_ver'],
};

const TIPOS_MATERIAL = ['Sustrato', 'Tinta', 'Consumible'];
const UNIDADES = ['m2', 'ml', 'pza', 'lt', 'kg', 'rollo', 'hoja'];
const TIPOS_COSTO = ['Mano de obra', 'Instalación', 'Tinta/consumible', 'Maquila', 'Otro'];
const EST_COT = ['Borrador', 'Enviada', 'Negociación', 'Aprobada', 'Rechazada'];
const EST_ODP = ['Abierta', 'En producción', 'Terminada', 'Facturada', 'Cerrada', 'Cancelada'];
const TIPOS_COMPRA = ['Inventario', 'Maquila ODP', 'Gasto'];
const TIPOS_SEG = ['Llamada', 'WhatsApp', 'Correo', 'Visita', 'Reunión', 'Otro'];
const FIN_FIELDS = ['CostoMaterial', 'CostoTinta', 'CostoMO', 'CostoMaquila', 'CostoOtros', 'CostoTotal', 'Utilidad', 'Margen', 'CostoMerma'];

const TERMINOS_DEF = 'Cotización válida por 7 días, a partir de entregada para ser procesada se deberá recibir la confirmación de esta mediante orden de compra. Una vez autorizada la cotización, cualquier cancelación o devolución fuera de garantía generará un cargo del 20% del total aquí expresado.';
const CONFIG_DEFAULTS = [
  ['EMPRESA', 'Mi Imprenta', 'Nombre que aparece en la app'],
  ['IVA', '0.16', 'Tasa de IVA (0.16 = 16%)'],
  ['PREFIJO_ODP', '', 'Prefijo del consecutivo de producción (vacío = solo número)'],
  ['CONSEC_ODP', '1', 'Siguiente número de ODP: pon aquí el que sigue de tu consecutivo actual'],
  ['DIGITOS_ODP', '4', 'Dígitos del número de ODP (4 → ODP-0001)'],
  ['PREFIJO_COT', 'COT-', 'Prefijo de cotizaciones'],
  ['CONSEC_COT', '1', 'Siguiente número de cotización'],
  ['MERMA_ALERTA', '0.10', 'Merma a partir de la cual se marca en rojo (0.10 = 10%)'],
  ['COT_MARGEN', '0.40', 'Margen sobre el PRECIO de cotización: precio = costo ÷ (1 − margen); 0.40 = costo ÷ 0.60'],
  ['COT_TINTA_GF', '3.25', 'Costo de tinta por m² en Gran Formato'],
  ['COT_TINTA_HD', '15.35', 'Costo de tinta por m² en HD'],
  ['COT_TINTA_UV', '25.35', 'Costo de tinta por m² en UV'],
  ['COT_OJILLO', '2', 'Costo por ojillo'],
  ['COT_BASTILLA_CM', '5', 'Bastilla por defecto (cm por lado) si no se captura'],
  ['COT_BOLSA_SELLADO_CM', '5', 'Sellado/bastilla de la bolsa (cm): cada lado suma 2 × bolsa + sellado'],
  ['COT_MULT_SOBRE', 'TINTA', 'Los multiplicadores de UV (tinta blanca x2, barniz x2, ambos x3) se aplican a: TINTA o TOTAL'],
  ['MARGEN_MINIMO', '0.30', 'Margen por debajo del cual se marca en rojo (0.30 = 30%)'],
  ['COMERCIAL_VE_COSTOS', 'NO', 'SI = los comerciales ven costo y utilidad de sus ODP'],
  ['COT_TERMINOS', TERMINOS_DEF, 'Términos y condiciones que salen en el PDF de la cotización'],
  ['COT_BANCO', 'BBVA BANCOMER', 'Banco para depósito (PDF de cotización)'],
  ['COT_CLABE', '0123 2000 1102 1322 55', 'CLABE para transferencia (PDF de cotización)'],
  ['COT_CUENTA', '0110213225', 'Número de cuenta (PDF de cotización)'],
  ['DIAS_CREDITO_PROV', '30', 'Días de crédito para proveedores nuevos que se dan de alta desde un XML'],
  ['RECIBE_PRODUCCION', 'ERNESTO RUIZ / CÉSAR MÁRQUEZ', 'Quién recibe en producción (sale en la ODP)'],
];
const SCHEMA_VER = '6';









/** Crea hojas faltantes y agrega columnas nuevas del esquema (no borra nada). */
function fixSheets_(ss) {
  Object.keys(SCHEMA).forEach(function (name) {
    let s = ss.getSheetByName(PREF + name);
    if (!s) s = ss.insertSheet(PREF + name);
    const want = SCHEMA[name];
    const lc = s.getLastColumn();
    const have = lc ? s.getRange(1, 1, 1, lc).getValues()[0].map(str_) : [];
    if (have.filter(String).length === 0) {
      s.getRange(1, 1, 1, want.length).setValues([want]);
    } else {
      const missing = want.filter(function (h) { return have.indexOf(h) < 0; });
      if (missing.length) s.getRange(1, lc + 1, 1, missing.length).setValues([missing]);
    }
    const n = Math.max(s.getLastColumn(), want.length);
    s.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    s.setFrozenRows(1);
  });
}



// ==================== API ====================
const ACTIONS = {
  init: a_init, lookups: a_lookups, dashboard: a_dashboard,
  clientes: a_clientes, saveCliente: a_saveCliente,
  proveedores: a_proveedores, saveProveedor: a_saveProveedor,
  materiales: a_materiales, saveMaterial: a_saveMaterial, kardex: a_kardex,
  conteos: a_conteos, conteo: a_conteo,
  compras: a_compras, compraDetalle: a_compraDetalle, saveCompra: a_saveCompra, cancelarCompra: a_cancelarCompra, registrarPago: a_registrarPago,
  cotizaciones: a_cotizaciones, cotDetalle: a_cotDetalle, saveCot: a_saveCot, tarifas: a_tarifas, saveTarifa: a_saveTarifa, cotCalcular: a_cotCalcular, aprobarCot: a_aprobarCot, pdfCot: a_pdfCot, pdfODP: a_pdfODP,
  seguimiento: a_seguimiento, saveSeg: a_saveSeg,
  odps: a_odps, odpDetalle: a_odpDetalle, saveODP: a_saveODP, consumir: a_consumir, devolver: a_devolver,
  agregarCosto: a_agregarCosto, anularCosto: a_anularCosto,
  facturas: a_facturas, facturaDetalle: a_facturaDetalle, saveFactura: a_saveFactura, cancelarFactura: a_cancelarFactura, registrarCobro: a_registrarCobro,
  reporteVentas: a_reporteVentas, catalogosProd: a_catalogosProd, produccionODP: a_produccionODP, registrarProduccion: a_registrarProduccion,
  usuarios: a_usuarios, saveUsuario: a_saveUsuario, config: a_config, saveConfig: a_saveConfig,
};



// ==================== UTILIDADES ====================
function tz_() { return Session.getScriptTimeZone() || 'America/Mexico_City'; }
function fmtDate_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function hoy_() { return fmtDate_(new Date()); }
function toDate_(s) { const m = String(s == null ? '' : s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function addDays_(s, n) { const d = toDate_(s) || new Date(); d.setDate(d.getDate() + (Number(n) || 0)); return fmtDate_(d); }
function diffDays_(a, b) { const x = toDate_(a), y = toDate_(b); return x && y ? Math.round((y - x) / 86400000) : 0; }
function num_(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function r2_(n) { return Math.round(n * 100) / 100; }
function r4_(n) { return Math.round(n * 10000) / 10000; }
function r6_(n) { return Math.round(n * 1e6) / 1e6; }
function str_(v) { return v == null ? '' : String(v).trim(); }
function req_(v, label) { if (str_(v) === '') throw new Error('Falta: ' + label); return str_(v); }
function inList_(v, list, label) { v = str_(v); if (list.indexOf(v) < 0) throw new Error(label + ' inválido: ' + v); return v; }
function fecha_(s, label) { s = str_(s) || hoy_(); if (!toDate_(s)) throw new Error('Fecha inválida en ' + label + ' (usa AAAA-MM-DD)'); return s; }
function fechaOpc_(s, label) { return str_(s) ? fecha_(s, label) : ''; }
function sum_(rows, k) { return rows.reduce(function (s, r) { return s + num_(r[k]); }, 0); }
function ivaRate_() { return num_(cfg_('IVA', '0.16')); }
function inRange_(d, a, b) { return !!d && d >= a && d <= b; }

// ==================== CAPA DE DATOS ====================
let _C = {}, _H = {};
function resetCache_() { _C = {}; _H = {}; }
// (db_ / sh_ / hdr_ ahora usan las hojas ERP_* del archivo base)


function hdr_(n) {
  if (!_H[n]) { const s = sh_(n), lc = s.getLastColumn(); _H[n] = lc ? s.getRange(1, 1, 1, lc).getValues()[0].map(str_) : []; }
  return _H[n];
}
function read_(n) {
  if (_C[n]) return _C[n];
  const s = sh_(n), h = hdr_(n), lr = s.getLastRow(), out = [];
  if (lr > 1 && h.length) {
    const vals = s.getRange(2, 1, lr - 1, h.length).getValues();
    vals.forEach(function (r, i) {
      if (r.every(function (v) { return v === '' || v === null; })) return;
      const o = { _row: i + 2 };
      h.forEach(function (k, j) { if (!k) return; let v = r[j]; if (v instanceof Date) v = fmtDate_(v); o[k] = v == null ? '' : v; });
      out.push(o);
    });
  }
  _C[n] = out;
  return out;
}
function cell_(v) {
  if (v == null) return '';
  if (typeof v === 'string') {
    const d = toDate_(v);
    if (d) return d;
    if (/^[=+\-@]/.test(v) && isNaN(Number(v))) return "'" + v;
  }
  return v;
}
function rowArr_(n, o) { return hdr_(n).map(function (k) { return k ? cell_(o[k]) : ''; }); }
function insert_(n, o) { const s = sh_(n); s.appendRow(rowArr_(n, o)); o._row = s.getLastRow(); if (_C[n]) _C[n].push(o); return o; }
function update_(n, o, ch) { Object.assign(o, ch || {}); sh_(n).getRange(o._row, 1, 1, hdr_(n).length).setValues([rowArr_(n, o)]); return o; }
function find_(n, k, v) { const s = str_(v).toLowerCase(); return read_(n).find(function (r) { return str_(r[k]).toLowerCase() === s; }); }
function insertMany_(n, arr) {
  if (!arr.length) return;
  const s = sh_(n), rows = arr.map(function (o) { return rowArr_(n, o); });
  s.getRange(s.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  delete _C[n];
}
function deleteWhere_(n, pred) {
  const rows = read_(n).filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  const s = sh_(n);
  rows.forEach(function (r) { s.deleteRow(r); });
  delete _C[n];
}
function clean_(o) { if (!o) return o; const c = Object.assign({}, o); delete c._row; return c; }
function mustFind_(n, k, v, label) { const r = find_(n, k, v); if (!r) throw new Error(label + ' no encontrado: ' + v); return r; }

function cfg_(k, def) { const r = find_('Config', 'Clave', k); return r && str_(r.Valor) !== '' ? str_(r.Valor) : (def === undefined ? '' : def); }
function setCfg_(k, v, desc) { const r = find_('Config', 'Clave', k); if (r) update_('Config', r, { Valor: v }); else insert_('Config', { Clave: k, Valor: v, Descripcion: desc || 'Contador interno' }); }
function seq_(key, prefix, pad) {
  const n = Math.max(1, Math.floor(num_(cfg_(key, '1'))));
  setCfg_(key, n + 1);
  return prefix + String(n).padStart(pad || 4, '0');
}


function can_(u, p) { const l = ROLES_ERP[u.rol] || []; return l.indexOf('*') >= 0 || l.indexOf(p) >= 0; }
function need_(u, p) { if (!can_(u, p)) throw new Error('Tu rol (' + u.rol + ') no tiene permiso para esta acción.'); }
function needAny_(u, ps) { if (!ps.some(function (p) { return can_(u, p); })) throw new Error('Tu rol (' + u.rol + ') no tiene permiso para esta acción.'); }
function esComercial_(u) { return u.rol === 'COMERCIAL'; }
function scope_(u, rows) { return esComercial_(u) ? rows.filter(function (r) { return str_(r.Comercial).toLowerCase() === u.email; }) : rows; }
function ownOr_(u, row) { if (esComercial_(u) && str_(row.Comercial).toLowerCase() !== u.email) throw new Error('Este registro pertenece a otro comercial.'); }
function veCostos_(u) { return can_(u, 'fin') || (esComercial_(u) && cfg_('COMERCIAL_VE_COSTOS', 'NO').toUpperCase() === 'SI'); }
function vePrecio_(u) { return veCostos_(u) || can_(u, 'crm') || can_(u, 'crm_ver'); }

// ==================== INICIO ====================
function a_init(u) {
  return {
    user: u, perms: ROLES_ERP[u.rol], hoy: hoy_(),
    cfg: {
      EMPRESA: cfg_('EMPRESA', 'ERP'), IVA: ivaRate_(),
      COT_MARGEN: margenCot_(), MERMA_ALERTA: num_(cfg_('MERMA_ALERTA', '0.10')), MARGEN_MINIMO: num_(cfg_('MARGEN_MINIMO', '0.30')),
      VE_COSTOS: veCostos_(u), VE_PRECIO: vePrecio_(u),
    },
    cat: { UNIDADES_COT: UNIDADES_COT, DESCUENTOS_COT: DESCUENTOS_COT, TIPOS_MATERIAL: TIPOS_MATERIAL, UNIDADES: UNIDADES, TIPOS_COSTO: TIPOS_COSTO, EST_COT: EST_COT, EST_ODP: EST_ODP,
           TIPOS_COMPRA: TIPOS_COMPRA, TIPOS_SEG: TIPOS_SEG, ROLES_ERP: Object.keys(ROLES_ERP) },
  };
}

function a_lookups(u) {
  const st = stockMap_();
  const verProv = can_(u, 'compras') || can_(u, 'cxp') || can_(u, 'cxp_ver');
  return {
    clientes: scope_(u, read_('Clientes')).map(function (c) { return { ID: c.ID, Nombre: c.Nombre, Comercial: c.Comercial, DiasCredito: c.DiasCredito, RazonSocial: c.RazonSocial || '' }; })
      .sort(function (a, b) { return str_(a.Nombre).localeCompare(str_(b.Nombre)); }),
    proveedores: verProv ? read_('Proveedores').map(function (p) { return { ID: p.ID, Nombre: p.Nombre, DiasCredito: p.DiasCredito, RFC: str_(p.RFC).toUpperCase() }; })
      .sort(function (a, b) { return str_(a.Nombre).localeCompare(str_(b.Nombre)); }) : [],
    materiales: read_('Materiales').filter(function (m) { return str_(m.Activo).toUpperCase() !== 'NO'; }).map(function (m) {
      return { Clave: m.Clave, Descripcion: m.Descripcion, Unidad: m.Unidad, Tipo: m.Tipo, Stock: r2_((st[m.Clave] || {}).stock || 0),
               M2Pres: num_((str_(m.Presentacion).match(/=\s*([\d.]+)\s*m/) || [])[1]) };
    }),
    odps: scope_(u, read_('ODP')).filter(function (o) { return ['Cerrada', 'Cancelada'].indexOf(o.Estatus) < 0; })
      .map(function (o) { return { Folio: o.Folio, Cliente: o.Cliente, Descripcion: o.Descripcion }; }).reverse(),
    comerciales: read_('Usuarios').filter(function (x) { return ['COMERCIAL', 'ADMIN', 'DIRECCION'].indexOf(str_(x.Rol).toUpperCase()) >= 0 && str_(x.Activo).toUpperCase() !== 'NO'; })
      .map(function (x) { return { Email: str_(x.Email).toLowerCase(), Nombre: x.Nombre }; }),
  };
}

// ==================== TABLERO ====================
function ventaODP_(o) { const f = num_(o.Facturado); return f > 0 ? f : num_(o.PrecioVenta); }

function a_dashboard(u, p) {
  const hoy = hoy_();
  const desde = str_(p.desde) || hoy.slice(0, 8) + '01', hasta = str_(p.hasta) || hoy;
  const out = { desde: desde, hasta: hasta };

  if (can_(u, 'fin')) {
    const odps = read_('ODP').filter(function (o) { return o.Estatus !== 'Cancelada' && inRange_(o.Fecha, desde, hasta); });
    const venta = r2_(odps.reduce(function (s, o) { return s + ventaODP_(o); }, 0));
    const costo = r2_(sum_(odps, 'CostoTotal'));
    const m2u = sum_(odps, 'M2Usados'), merma = sum_(odps, 'MermaM2');
    out.produccion = {
      odps: odps.length, venta: venta, costo: costo, utilidad: r2_(venta - costo), margen: venta ? r4_((venta - costo) / venta) : 0,
      m2Vendidos: r2_(sum_(odps, 'M2Vendidos')), m2Usados: r2_(m2u), mermaM2: r2_(merma), mermaPct: m2u ? r4_(merma / m2u) : 0,
      costoMerma: r2_(sum_(odps, 'CostoMerma')),
    };
    const fac = read_('Facturas').filter(function (f) { return f.Estatus !== 'Cancelada'; });
    out.facturado = r2_(sum_(fac.filter(function (f) { return inRange_(f.Fecha, desde, hasta); }), 'Subtotal'));
    out.cobrado = r2_(sum_(read_('Cobros').filter(function (c) { return inRange_(c.Fecha, desde, hasta); }), 'Monto'));
    const fs = fac.filter(function (f) { return num_(f.Saldo) > 0.009; });
    out.cxc = { saldo: r2_(sum_(fs, 'Saldo')), vencido: r2_(sum_(fs.filter(function (f) { return f.Vencimiento && f.Vencimiento < hoy; }), 'Saldo')), n: fs.length };
    const cs = read_('Compras').filter(function (c) { return c.Estatus !== 'Cancelada' && num_(c.Saldo) > 0.009; });
    const en7 = addDays_(hoy, 7);
    out.cxp = {
      saldo: r2_(sum_(cs, 'Saldo')),
      vencido: r2_(sum_(cs.filter(function (c) { return c.Vencimiento && c.Vencimiento < hoy; }), 'Saldo')),
      prox7: r2_(sum_(cs.filter(function (c) { return c.Vencimiento && c.Vencimiento >= hoy && c.Vencimiento <= en7; }), 'Saldo')),
      n: cs.length,
    };
    out.peoresMargen = odps.filter(function (o) { return ventaODP_(o) > 0 && num_(o.CostoTotal) > 0; })
      .sort(function (a, b) { return num_(a.Margen) - num_(b.Margen); }).slice(0, 5)
      .map(function (o) { return { Folio: o.Folio, Cliente: o.Cliente, Venta: ventaODP_(o), Utilidad: num_(o.Utilidad), Margen: num_(o.Margen) }; });
    out.mayorMerma = odps.filter(function (o) { return num_(o.M2Usados) > 0; })
      .sort(function (a, b) { return num_(b.MermaPct) - num_(a.MermaPct); }).slice(0, 5)
      .map(function (o) { return { Folio: o.Folio, Cliente: o.Cliente, M2Usados: num_(o.M2Usados), MermaM2: num_(o.MermaM2), MermaPct: num_(o.MermaPct), CostoMerma: num_(o.CostoMerma) }; });
  }

  if (can_(u, 'inv_ver') || can_(u, 'inv')) {
    const st = stockMap_();
    let valor = 0; Object.keys(st).forEach(function (k) { valor += st[k].valor; });
    out.inventario = {
      valor: r2_(valor),
      bajoMinimo: read_('Materiales').filter(function (m) { return str_(m.Activo).toUpperCase() !== 'NO' && num_(m.StockMinimo) > 0 && ((st[m.Clave] || {}).stock || 0) < num_(m.StockMinimo); })
        .map(function (m) { return { Clave: m.Clave, Descripcion: m.Descripcion, Unidad: m.Unidad, Stock: r2_((st[m.Clave] || {}).stock || 0), StockMinimo: num_(m.StockMinimo) }; }),
    };
  }

  if (can_(u, 'odp_ver')) {
    out.odpAbiertas = scope_(u, read_('ODP')).filter(function (o) { return ['Abierta', 'En producción', 'Terminada'].indexOf(o.Estatus) >= 0; })
      .sort(function (a, b) { return str_(a.FechaEntrega || '9999').localeCompare(str_(b.FechaEntrega || '9999')); })
      .map(function (o) { return { Folio: o.Folio, Cliente: o.Cliente, Descripcion: o.Descripcion, FechaEntrega: o.FechaEntrega, Estatus: o.Estatus, Atrasada: !!(o.FechaEntrega && o.FechaEntrega < hoy) }; });
  }

  if (can_(u, 'crm') || can_(u, 'crm_ver')) {
    const cots = scope_(u, read_('Cotizaciones'));
    const porEst = {};
    EST_COT.forEach(function (e) { porEst[e] = { n: 0, monto: 0 }; });
    cots.filter(function (c) { return inRange_(c.Fecha, desde, hasta); }).forEach(function (c) {
      const e = porEst[c.Estatus] || (porEst[c.Estatus] = { n: 0, monto: 0 }); e.n++; e.monto = r2_(e.monto + num_(c.Subtotal));
    });
    const abiertas = cots.filter(function (c) { return ['Borrador', 'Enviada', 'Negociación'].indexOf(c.Estatus) >= 0; });
    const lim = addDays_(hoy, 7);
    const pend = [];
    abiertas.forEach(function (c) { if (c.ProximoSeguimiento && c.ProximoSeguimiento <= lim) pend.push({ Fecha: c.ProximoSeguimiento, Cliente: c.Cliente, Ref: c.Folio, Nota: c.Descripcion, Vencido: c.ProximoSeguimiento < hoy }); });
    scope_(u, read_('Seguimiento')).forEach(function (s) {
      if (s.ProximaAccion && s.ProximaAccion >= addDays_(hoy, -30) && s.ProximaAccion <= lim && !s.Cotizacion) pend.push({ Fecha: s.ProximaAccion, Cliente: s.Cliente, Ref: s.ID, Nota: s.Nota, Vencido: s.ProximaAccion < hoy });
    });
    const ganadas = porEst['Aprobada'].monto, perdidas = porEst['Rechazada'].monto;
    out.crm = {
      porEstatus: porEst, pipeline: r2_(sum_(abiertas, 'Subtotal')), pipelineN: abiertas.length,
      conversion: (ganadas + perdidas) > 0 ? r4_(ganadas / (ganadas + perdidas)) : 0,
      pendientes: pend.sort(function (a, b) { return a.Fecha.localeCompare(b.Fecha); }),
    };
  }

  if (!can_(u, 'fin') && can_(u, 'cxc_ver')) {
    const fs = scope_(u, read_('Facturas')).filter(function (f) { return f.Estatus !== 'Cancelada' && num_(f.Saldo) > 0.009; });
    out.cxc = { saldo: r2_(sum_(fs, 'Saldo')), vencido: r2_(sum_(fs.filter(function (f) { return f.Vencimiento && f.Vencimiento < hoy; }), 'Saldo')), n: fs.length };
  }
  return out;
}

// ==================== CLIENTES / PROVEEDORES ====================
function a_clientes(u) { needAny_(u, ['crm', 'crm_ver', 'facturas', 'cxc']); return scope_(u, read_('Clientes')).map(clean_); }

function a_saveCliente(u, p) {
  need_(u, 'crm');
  const nombre = req_(p.Nombre, 'Nombre');
  let comercial = str_(p.Comercial).toLowerCase() || u.email;
  if (esComercial_(u)) comercial = u.email;
  const data = { Nombre: nombre, RFC: str_(p.RFC).toUpperCase(), Contacto: str_(p.Contacto), Telefono: str_(p.Telefono), Email: str_(p.Email),
                 Comercial: comercial, DiasCredito: num_(p.DiasCredito), Notas: str_(p.Notas),
                 RazonSocial: str_(p.RazonSocial), Domicilio: str_(p.Domicilio), Colonia: str_(p.Colonia), Ciudad: str_(p.Ciudad), CP: str_(p.CP), Estado: str_(p.Estado) };
  if (str_(p.ID)) {
    const c = mustFind_('Clientes', 'ID', p.ID, 'Cliente'); ownOr_(u, c);
    if (esComercial_(u)) data.Comercial = c.Comercial;
    return clean_(update_('Clientes', c, data));
  }
  if (find_('Clientes', 'Nombre', nombre)) throw new Error('Ya existe un cliente con ese nombre.');
  data.ID = seq_('SEQ_CLIENTE', 'CL-', 4); data.FechaAlta = hoy_();
  return clean_(insert_('Clientes', data));
}

function a_proveedores(u) { needAny_(u, ['compras', 'cxp', 'cxp_ver']); return read_('Proveedores').map(clean_); }

function a_saveProveedor(u, p) {
  needAny_(u, ['compras', 'cxp']);
  const nombre = req_(p.Nombre, 'Nombre');
  const data = { Nombre: nombre, RFC: str_(p.RFC).toUpperCase(), Contacto: str_(p.Contacto), Telefono: str_(p.Telefono), Email: str_(p.Email),
                 DiasCredito: num_(p.DiasCredito), Notas: str_(p.Notas) };
  if (str_(p.ID)) return clean_(update_('Proveedores', mustFind_('Proveedores', 'ID', p.ID, 'Proveedor'), data));
  if (find_('Proveedores', 'Nombre', nombre)) throw new Error('Ya existe un proveedor con ese nombre.');
  data.ID = seq_('SEQ_PROVEEDOR', 'PR-', 4);
  return clean_(insert_('Proveedores', data));
}

// ==================== INVENTARIO (PEPS) ====================
function stockMap_() {
  const m = {};
  read_('Capas').forEach(function (c) {
    const k = str_(c.Clave);
    const s = m[k] || (m[k] = { stock: 0, valor: 0, costoVigente: 0, _f: null, _fr: 0, last: 0, _lf: null });
    const r = num_(c.CantRestante), cu = num_(c.CostoUnit), f = str_(c.Fecha);
    if (s._lf === null || f >= s._lf) { s._lf = f; s.last = cu; }
    if (r > 1e-9) {
      s.stock += r; s.valor += r * cu;
      if (s._f === null || f < s._f || (f === s._f && c._row < s._fr)) { s._f = f; s._fr = c._row; s.costoVigente = cu; }
    }
  });
  return m;
}

function entrada_(clave, cant, costo, fecha, origen, tipoK, ref, odp, u, notas) {
  cant = r6_(num_(cant)); costo = num_(costo);
  if (cant <= 0) throw new Error('La cantidad debe ser mayor a cero.');
  insert_('Capas', { ID: seq_('SEQ_CAPA', 'CP-', 6), Clave: clave, Fecha: fecha, Origen: origen, CantInicial: cant, CantRestante: cant, CostoUnit: r6_(costo) });
  return insert_('Kardex', { ID: seq_('SEQ_KARDEX', 'K-', 6), Fecha: fecha, Clave: clave, Tipo: tipoK, Cantidad: cant, CostoUnit: r4_(costo),
                            Importe: r2_(cant * costo), Referencia: ref, ODP: odp || '', Usuario: u.email, Notas: str_(notas) });
}

function salida_(clave, cant, fecha, tipoK, ref, odp, u, notas) {
  cant = r6_(num_(cant));
  if (cant <= 0) throw new Error('La cantidad debe ser mayor a cero.');
  const capas = read_('Capas').filter(function (c) { return str_(c.Clave) === clave && num_(c.CantRestante) > 1e-9; })
    .sort(function (a, b) { return str_(a.Fecha) < str_(b.Fecha) ? -1 : str_(a.Fecha) > str_(b.Fecha) ? 1 : a._row - b._row; });
  const disp = capas.reduce(function (s, c) { return s + num_(c.CantRestante); }, 0);
  if (disp + 1e-6 < cant) throw new Error('Stock insuficiente de ' + clave + ': hay ' + r2_(disp) + ', se piden ' + cant + '. Registra primero la compra o haz un ajuste por conteo.');
  let rest = cant, imp = 0;
  for (let i = 0; i < capas.length && rest > 1e-9; i++) {
    const c = capas[i], take = Math.min(rest, num_(c.CantRestante));
    update_('Capas', c, { CantRestante: r6_(num_(c.CantRestante) - take) });
    imp += take * num_(c.CostoUnit); rest -= take;
  }
  return insert_('Kardex', { ID: seq_('SEQ_KARDEX', 'K-', 6), Fecha: fecha, Clave: clave, Tipo: tipoK, Cantidad: cant, CostoUnit: r4_(imp / cant),
                            Importe: r2_(imp), Referencia: ref, ODP: odp || '', Usuario: u.email, Notas: str_(notas) });
}

function a_materiales(u) {
  needAny_(u, ['inv_ver', 'inv', 'compras', 'consumo']);
  const st = stockMap_();
  return read_('Materiales').map(function (m) {
    const s = st[m.Clave] || {}, stock = r2_(s.stock || 0);
    return Object.assign(clean_(m), { Stock: stock, CostoVigente: r4_(s.costoVigente || s.last || 0), Valor: r2_(s.valor || 0),
                                      BajoMinimo: num_(m.StockMinimo) > 0 && stock < num_(m.StockMinimo) });
  });
}

function a_saveMaterial(u, p) {
  need_(u, 'inv');
  const clave = req_(p.Clave, 'Clave').toUpperCase();
  const data = { Descripcion: req_(p.Descripcion, 'Descripción'), Tipo: inList_(p.Tipo, TIPOS_MATERIAL, 'Tipo'), Unidad: req_(p.Unidad, 'Unidad'),
                 StockMinimo: num_(p.StockMinimo), Activo: str_(p.Activo).toUpperCase() === 'NO' ? 'NO' : 'SI' };
  const ex = find_('Materiales', 'Clave', clave);
  if (p._edit) { if (!ex) throw new Error('Material no encontrado'); return clean_(update_('Materiales', ex, data)); }
  if (ex) throw new Error('Ya existe la clave ' + clave);
  data.Clave = clave;
  return clean_(insert_('Materiales', data));
}

function a_kardex(u, p) {
  needAny_(u, ['inv_ver', 'inv']);
  const clave = str_(p.Clave), odp = str_(p.ODP), desde = str_(p.desde) || '0000', hasta = str_(p.hasta) || '9999';
  return read_('Kardex').filter(function (k) {
    return (!clave || str_(k.Clave) === clave) && (!odp || str_(k.ODP) === odp) && str_(k.Fecha) >= desde && str_(k.Fecha) <= hasta;
  }).slice(-1000).reverse().map(clean_);
}

function a_conteos(u) { needAny_(u, ['conteo', 'inv']); return read_('Conteos').slice(-500).reverse().map(clean_); }

function a_conteo(u, p) {
  need_(u, 'conteo');
  const m = mustFind_('Materiales', 'Clave', p.Clave, 'Material');
  const fisico = num_(p.Fisico);
  if (str_(p.Fisico) === '' || fisico < 0) throw new Error('Captura la cantidad física contada.');
  const fecha = fecha_(p.Fecha, 'Fecha');
  const st = stockMap_()[m.Clave] || { stock: 0, costoVigente: 0, last: 0 };
  const sistema = r6_(st.stock), dif = r6_(fisico - sistema), cu = st.costoVigente || st.last || 0;
  const c = { ID: seq_('SEQ_CONTEO', 'CF-', 5), Fecha: fecha, Clave: m.Clave, Sistema: r2_(sistema), Fisico: fisico, Diferencia: r2_(dif),
              CostoUnit: r4_(cu), ImporteDif: r2_(dif * cu), Aplicado: 'NO', Usuario: u.email };
  if ((p.Aplicar === true || str_(p.Aplicar).toUpperCase() === 'SI') && Math.abs(dif) > 1e-6) {
    if (dif < 0) { const k = salida_(m.Clave, -dif, fecha, 'AJUSTE-', 'Conteo ' + c.ID, '', u, 'Faltante en conteo físico'); c.ImporteDif = -num_(k.Importe); }
    else entrada_(m.Clave, dif, cu, fecha, 'Conteo ' + c.ID, 'AJUSTE+', 'Conteo ' + c.ID, '', u, 'Sobrante en conteo físico');
    c.Aplicado = 'SI';
  }
  return clean_(insert_('Conteos', c));
}

// ==================== COMPRAS / CUENTAS POR PAGAR ====================
function conVenc_(rows, hoy) {
  return rows.map(function (r) {
    const venc = num_(r.Saldo) > 0.009 && r.Estatus !== 'Cancelada' && r.Vencimiento && r.Vencimiento < hoy;
    return Object.assign(clean_(r), { DiasVencido: venc ? diffDays_(r.Vencimiento, hoy) : 0 });
  });
}

function a_compras(u) { needAny_(u, ['compras', 'cxp', 'cxp_ver']); return conVenc_(read_('Compras'), hoy_()).reverse(); }

function a_compraDetalle(u, p) {
  needAny_(u, ['compras', 'cxp', 'cxp_ver']);
  const c = mustFind_('Compras', 'ID', p.ID, 'Compra');
  return {
    compra: clean_(c),
    lineas: read_('CompraDetalle').filter(function (d) { return d.CompraID === c.ID; }).map(clean_),
    pagos: read_('Pagos').filter(function (d) { return d.CompraID === c.ID; }).map(clean_),
  };
}

function a_saveCompra(u, p) {
  need_(u, 'compras');
  const prov = provCompra_(p);
  const folio = str_(p.FolioSAT).toUpperCase();
  if (folio && read_('Compras').some(function (c) { return str_(c.FolioSAT).toUpperCase() === folio && c.Estatus !== 'Cancelada'; }))
    throw new Error('Ya registraste una compra con el folio ' + folio + '.');
  const tipo = inList_(p.Tipo, TIPOS_COMPRA, 'Tipo de compra');
  const fecha = fecha_(p.Fecha, 'Fecha');
  let lineas = [], subtotal, odp = null;
  if (tipo === 'Inventario') {
    lineas = (p.lineas || []).filter(function (l) { return str_(l.Clave) && num_(l.Cantidad) > 0; }).map(function (l) {
      const m = mustFind_('Materiales', 'Clave', l.Clave, 'Material');
      if (num_(l.CostoUnit) < 0) throw new Error('Costo negativo en ' + m.Clave);
      return { Clave: m.Clave, Cantidad: r6_(num_(l.Cantidad)), CostoUnit: r6_(num_(l.CostoUnit)) };
    });
    if (!lineas.length) throw new Error('Agrega al menos un material con cantidad.');
    subtotal = r2_(lineas.reduce(function (s, l) { return s + l.Cantidad * l.CostoUnit; }, 0));
  } else {
    subtotal = r2_(num_(p.Subtotal));
    if (subtotal <= 0) throw new Error('Captura el subtotal.');
    if (tipo === 'Maquila ODP') {
      odp = mustFind_('ODP', 'Folio', req_(p.ODP, 'ODP'), 'ODP');
      if (odp.Estatus === 'Cancelada') throw new Error('La ODP está cancelada.');
    }
  }
  const iva = str_(p.IVA) !== '' ? r2_(num_(p.IVA)) : r2_(subtotal * ivaRate_());
  const ret = r2_(num_(p.Retenciones));
  const total = r2_(subtotal + iva - ret);
  const c = insert_('Compras', {
    ID: seq_('SEQ_COMPRA', 'FC-', 5), Fecha: fecha, ProveedorID: prov.ID, Proveedor: prov.Nombre, FolioSAT: folio, Tipo: tipo,
    ODP: odp ? odp.Folio : '', Subtotal: subtotal, IVA: iva, Total: total, Vencimiento: addDays_(fecha, num_(prov.DiasCredito)),
    Pagado: 0, Saldo: total, Estatus: 'Pendiente', Usuario: u.email, Notas: str_(p.Notas), Retenciones: ret || '',
  });
  lineas.forEach(function (l) {
    insert_('CompraDetalle', { CompraID: c.ID, Clave: l.Clave, Cantidad: l.Cantidad, CostoUnit: l.CostoUnit, Importe: r2_(l.Cantidad * l.CostoUnit) });
    entrada_(l.Clave, l.Cantidad, l.CostoUnit, fecha, c.ID, 'ENTRADA', 'Compra ' + c.ID + (folio ? ' / ' + folio : '') + ' ' + prov.Nombre, '', u, '');
  });
  if (odp) {
    insert_('ODPCostos', { ID: seq_('SEQ_COSTO', 'OC-', 6), ODP: odp.Folio, Fecha: fecha, Tipo: 'Maquila', Concepto: prov.Nombre + (folio ? ' · ' + folio : ''),
                           Cantidad: 1, CostoUnit: subtotal, Importe: subtotal, CompraID: c.ID, Usuario: u.email });
    recalcODP_(odp.Folio);
  }
  return clean_(c);
}

/** Proveedor de la compra: por ID, o por RFC del XML (si no existe se da de alta). */
function provCompra_(p) {
  if (str_(p.ProveedorID) && p.ProveedorID !== '__NUEVO__') return mustFind_('Proveedores', 'ID', p.ProveedorID, 'Proveedor');
  const rfc = str_(p.ProvRFC).toUpperCase();
  if (!rfc) throw new Error('Falta: Proveedor');
  const ex = read_('Proveedores').find(function (x) { return str_(x.RFC).toUpperCase() === rfc; });
  if (ex) return ex;
  let nombre = str_(p.ProvNombre) || rfc;
  if (find_('Proveedores', 'Nombre', nombre)) nombre += ' (' + rfc + ')';
  return insert_('Proveedores', { ID: seq_('SEQ_PROVEEDOR', 'PR-', 4), Nombre: nombre, RFC: rfc, DiasCredito: num_(cfg_('DIAS_CREDITO_PROV', '30')),
                                  Notas: 'Alta automática desde XML' });
}

function a_cancelarCompra(u, p) {
  needAny_(u, ['cxp', 'fin']);
  const c = mustFind_('Compras', 'ID', p.ID, 'Compra');
  if (c.Estatus === 'Cancelada') throw new Error('Ya está cancelada.');
  if (num_(c.Pagado) > 0) throw new Error('Tiene pagos registrados; no se puede cancelar.');
  const capas = read_('Capas').filter(function (k) { return k.Origen === c.ID; });
  if (capas.some(function (k) { return Math.abs(num_(k.CantRestante) - num_(k.CantInicial)) > 1e-6; }))
    throw new Error('Parte de ese material ya se consumió. Corrige con un ajuste por conteo físico.');
  const hoy = hoy_();
  capas.forEach(function (k) {
    update_('Capas', k, { CantRestante: 0 });
    insert_('Kardex', { ID: seq_('SEQ_KARDEX', 'K-', 6), Fecha: hoy, Clave: k.Clave, Tipo: 'CANCELACION', Cantidad: num_(k.CantInicial), CostoUnit: num_(k.CostoUnit),
                        Importe: r2_(num_(k.CantInicial) * num_(k.CostoUnit)), Referencia: 'Cancela compra ' + c.ID, ODP: '', Usuario: u.email, Notas: str_(p.Motivo) });
  });
  read_('ODPCostos').filter(function (k) { return k.CompraID === c.ID; }).forEach(function (k) {
    update_('ODPCostos', k, { Importe: 0, Concepto: 'ANULADO · ' + k.Concepto }); recalcODP_(k.ODP);
  });
  return clean_(update_('Compras', c, { Estatus: 'Cancelada', Saldo: 0, Notas: (str_(c.Notas) + ' | Cancelada: ' + str_(p.Motivo)).trim() }));
}

function a_registrarPago(u, p) {
  need_(u, 'cxp');
  const c = mustFind_('Compras', 'ID', p.CompraID, 'Compra');
  if (c.Estatus === 'Cancelada') throw new Error('La compra está cancelada.');
  const monto = r2_(num_(p.Monto));
  if (monto <= 0) throw new Error('Monto inválido.');
  if (monto > num_(c.Saldo) + 0.01) throw new Error('El pago excede el saldo (' + r2_(num_(c.Saldo)) + ').');
  insert_('Pagos', { ID: seq_('SEQ_PAGO', 'PG-', 5), Fecha: fecha_(p.Fecha, 'Fecha'), CompraID: c.ID, Monto: monto, Referencia: str_(p.Referencia), Usuario: u.email });
  const pagado = r2_(num_(c.Pagado) + monto), saldo = r2_(num_(c.Total) - pagado);
  return clean_(update_('Compras', c, { Pagado: pagado, Saldo: Math.max(0, saldo), Estatus: saldo <= 0.009 ? 'Pagada' : 'Parcial' }));
}

// ==================== CRM ====================
function a_cotizaciones(u) { needAny_(u, ['crm', 'crm_ver']); return scope_(u, read_('Cotizaciones')).map(clean_).reverse(); }

function a_cotDetalle(u, p) {
  needAny_(u, ['crm', 'crm_ver']);
  const c = mustFind_('Cotizaciones', 'Folio', p.Folio, 'Cotización'); ownOr_(u, c);
  const vc = veCostos_(u);
  return { cot: clean_(c), lineas: lineasDe_('CotDetalle', 'Folio', c.Folio).map(function (l) { if (!vc) { delete l.CostoMaterial; delete l.CostoTinta; delete l.CostoAcabados; } return l; }) };
}

function lineasDe_(hoja, k, folio) {
  return read_(hoja).filter(function (l) { return str_(l[k]) === str_(folio); })
    .sort(function (a, b) { return num_(a.Linea) - num_(b.Linea); }).map(clean_);
}

const UNIDADES_COT = ['m2', 'mtl', 'lamina', 'pz'];
const PRESENTACIONES = ['lamina', 'rollo', 'hoja', 'bobina', 'otro'];
const COBROS = ['m2', 'mtl', 'lamina', 'pz', 'otro'];
const DESCUENTOS_COT = [0, 5, 10, 15, 20, 25];

/** Nombre del catalogo (CATALOGOS del Dashboard) en su forma canonica, o '' si no existe. */
function enCatalogo_(lista, v) {
  v = str_(v).toUpperCase();
  return (lista || []).filter(function (x) { return String(x).toUpperCase() === v; })[0] || '';
}

// ---- TARIFAS: catalogo unico de materiales, con costo por unidad (NA = no aplica cobro por esa unidad)
function nz_(v) { const t = str_(v).toUpperCase(); if (t === '' || t === 'NA' || t === 'N/A') return null; const n = num_(v); return n > 0 ? n : null; }
function tarHoja_() {
  const h = _hoja_(CFG.HOJA_TARIFAS);
  _aseguraColumnas_(h, TAR_COL_EXT + TAR_EXT.length - 1);
  const cab = h.getRange(1, TAR_COL_EXT, 1, TAR_EXT.length).getValues()[0];
  if (cab.some(function (x, i) { return str_(x).toUpperCase() !== TAR_EXT[i]; })) h.getRange(1, TAR_COL_EXT, 1, TAR_EXT.length).setValues([TAR_EXT]);
  return h;
}
/** Todas las filas de TARIFAS con su detalle. */
function tarifasDet_() {
  const h = tarHoja_(), n = h.getLastRow() - 1, out = [];
  if (n < 1) return out;
  const v = h.getRange(2, 1, n, TAR_COL_EXT + TAR_EXT.length - 1).getValues();
  v.forEach(function (r, i) {
    const mat = str_(r[0]); if (!mat) return;
    const o = TAR_COL_EXT - 1;
    out.push({ fila: i + 2, material: mat, costoM2: nz_(r[1]), proveedor: str_(r[o]), presentacion: str_(r[o + 1]), ancho: num_(r[o + 2]), largo: num_(r[o + 3]),
               costo: num_(r[o + 4]), cobroPor: str_(r[o + 5]), costoMtl: nz_(r[o + 6]), costoLamina: nz_(r[o + 7]), costoPz: nz_(r[o + 8]), actualizado: str_(r[o + 9]) });
  });
  return out;
}
function costoUnidad_(t, u) { return ({ m2: t.costoM2, mtl: t.costoMtl, lamina: t.costoLamina, pz: t.costoPz }[u]) || null; }
function margenCot_() { return num_(cfg_('COT_MARGEN', '0.40')); }
const IMPRESIONES = ['Gran Formato', 'HD', 'UV', 'Sin impresión'];
function sinAcentos_(t) { return str_(t).toUpperCase().replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I').replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U'); }
/** Que hace un acabado del catalogo ACABADO: por palabra clave del nombre. */
function tipoAcabado_(nombre) {
  const n = sinAcentos_(nombre);
  return n.indexOf('OJILLO') >= 0 ? 'ojillos' : n.indexOf('BASTILLA') >= 0 ? 'bastilla' : n.indexOf('BOLSA') >= 0 ? 'bolsa' : 'otro';
}
function tintaRate_(imp) { return imp === 'UV' ? num_(cfg_('COT_TINTA_UV', '25.35')) : imp === 'HD' ? num_(cfg_('COT_TINTA_HD', '15.35')) : imp === 'Gran Formato' ? num_(cfg_('COT_TINTA_GF', '3.25')) : 0; }

/** Calculo de UNA partida. Precio = (material + tinta + acabados) / (1 - margen).
 *  - material: costo de TARIFAS de la unidad (m2, mtl, lamina, pz) x cantidad base; m2 incluye lo que suman bastilla/bolsa.
 *  - tinta: m2 x tarifa (GF 3.25, HD 15.35, UV 25.35); en UV, tinta blanca x2, barniz a registro x2, ambos x3.
 *  - acabados: ojillos = $2 c/u (por pieza x cantidad); bastilla suma cm a cada lado (ancho y alto + 2 x cm);
 *    bolsa suma 2 x cm + sellado a cada lado.
 *  Si capturan el precio a mano (PrecioManual) el importe es cantidad base x ese precio. Lanza error si no se puede calcular. */
function calcPartida_(t, l, cats) {
  const an = num_(l.Ancho), al = num_(l.Alto), q = num_(l.Cantidad) || 1;
  const imp = IMPRESIONES.indexOf(str_(l.Impresion)) >= 0 ? str_(l.Impresion) : 'Gran Formato';
  const blanca = imp === 'UV' && /^(si|sí|1|true|on)$/i.test(str_(l.TintaBlanca)), barniz = imp === 'UV' && /^(si|sí|1|true|on)$/i.test(str_(l.Barniz));
  // acabados
  const acab = [], marg = [];
  let ojillos = 0, ext = 0;
  [1, 2, 3].forEach(function (i) {
    const nom = str_(l['Acabado' + i]); if (!nom) return;
    const cat = enCatalogo_((cats || {}).ACABADO, nom);
    if (!cat) throw new Error('El acabado "' + nom + '" no está en el catálogo ACABADO.');
    if (acab.some(function (a) { return a.nombre === cat; })) throw new Error('El acabado "' + cat + '" está repetido.');
    const tipo = tipoAcabado_(cat), par = num_(l['Param' + i]);
    if (tipo === 'ojillos') { if (!(par > 0)) throw new Error('Indica cuántos ojillos lleva cada pieza.'); ojillos += par; }
    if (tipo === 'bastilla') { const cm = par > 0 ? par : num_(cfg_('COT_BASTILLA_CM', '5')); ext = Math.max(ext, cm / 100); }
    if (tipo === 'bolsa') { if (!(par > 0)) throw new Error('Indica los cm de la bolsa.'); ext = Math.max(ext, (2 * par + num_(cfg_('COT_BOLSA_SELLADO_CM', '5'))) / 100); }
    acab.push({ nombre: cat, tipo: tipo, par: par });
  });
  const anE = an + 2 * ext, alE = al + 2 * ext;
  const m2 = num_(l.M2) > 0 ? num_(l.M2) : anE * alE * q;
  const uni = str_(l.Unidad) ? inList_(str_(l.Unidad), UNIDADES_COT, 'Unidad') : (UNIDADES_COT.indexOf(t.cobroPor) >= 0 && costoUnidad_(t, t.cobroPor) ? t.cobroPor : (UNIDADES_COT.filter(function (u) { return costoUnidad_(t, u); })[0] || 'm2'));
  const base = uni === 'm2' ? m2 : uni === 'mtl' ? (alE > 0 ? alE * q : q) : q;
  const manual = num_(l.PrecioManual) === 1 || /^(si|sí|1|true)$/i.test(str_(l.PrecioManual));
  const unidadesOk = {}; UNIDADES_COT.forEach(function (u) { unidadesOk[u] = !!costoUnidad_(t, u); });
  let cMat = 0, cTin = 0, cAca = 0, importe, precio;
  if (manual && num_(l.PrecioM2) > 0) {
    precio = num_(l.PrecioM2); importe = r2_(base * precio);
  } else {
    const cu = costoUnidad_(t, uni);
    if (!cu) throw new Error('"' + t.material + '" no tiene costo por ' + uni + ' (NA). Elige otra unidad o captura el precio.');
    cMat = base * cu;
    const mult = (blanca && barniz) ? 3 : (blanca || barniz) ? 2 : 1, sobreTotal = str_(cfg_('COT_MULT_SOBRE', 'TINTA')).toUpperCase() === 'TOTAL';
    cTin = m2 * tintaRate_(imp) * (sobreTotal ? 1 : mult);
    cAca = ojillos * q * num_(cfg_('COT_OJILLO', '2'));
    let costo = cMat + cTin + cAca; if (sobreTotal) costo *= mult;
    const mg = num_(cfg_('COT_MARGEN', '0.40'));
    importe = r2_(costo / (1 - mg)); precio = base ? r4_(importe / base) : 0;
  }
  const det = [imp + (blanca ? ' + tinta blanca' : '') + (barniz ? ' + barniz a registro' : '')].concat(acab.map(function (a) {
    return a.nombre + (a.tipo === 'ojillos' ? ' (' + a.par + ' por pieza)' : (a.tipo === 'bastilla' || a.tipo === 'bolsa') ? ' (' + (a.par > 0 ? a.par : num_(cfg_('COT_BASTILLA_CM', '5'))) + ' cm)' : ''); })).join(' · ');
  return { Unidad: uni, unidadesOk: unidadesOk, M2: r4_(m2), Cantidad: q, Precio: precio, Importe: importe, PrecioUnit: r2_(importe / q), Impresion: imp,
           TintaBlanca: blanca ? 'SI' : '', Barniz: barniz ? 'SI' : '', acab: acab, Detalle: det, CostoMaterial: r2_(cMat), CostoTinta: r2_(cTin), CostoAcabados: r2_(cAca), manual: manual };
}

/** Partidas de cotización ya calculadas. MATERIAL = TARIFAS (catalogo unico). */
function lineasCot_(arr) {
  const out = [], tars = {}, cats = _leerCatalogos_();
  tarifasDet_().forEach(function (t) { tars[t.material.toUpperCase()] = t; });
  (arr || []).forEach(function (l) {
    const desc = str_(l.Descripcion);
    if (!desc && !num_(l.PrecioM2) && !num_(l.Ancho) && !num_(l.Alto) && !num_(l.M2)) return;
    if (!desc) throw new Error('Falta el material en una partida.');
    const t = tars[desc.toUpperCase()];
    if (!t) throw new Error('El material "' + desc + '" no está en el catálogo (hoja TARIFAS). Elígelo de la lista.');
    const r = calcPartida_(t, l, cats), o = { Descripcion: t.material, Ancho: num_(l.Ancho) || '', Alto: num_(l.Alto) || '', Cantidad: r.Cantidad, M2: r.M2, PrecioM2: r.Precio, PrecioUnit: r.PrecioUnit,
      Importe: r.Importe, Unidad: r.Unidad, Impresion: r.Impresion, TintaBlanca: r.TintaBlanca, Barniz: r.Barniz, Detalle: r.Detalle, CostoMaterial: r.CostoMaterial, CostoTinta: r.CostoTinta, CostoAcabados: r.CostoAcabados, PrecioManual: r.manual ? 'SI' : '' };
    r.acab.forEach(function (a, i) { o['Acabado' + (i + 1)] = a.nombre; o['Param' + (i + 1)] = a.par || ''; });
    out.push(o);
  });
  return out;
}

/** Vista previa en vivo del formulario: calcula cada partida (sin guardar) y los totales. Un error en una partida no tumba las demas. */
function a_cotCalcular(u, p) {
  needAny_(u, ['crm', 'crm_ver']);
  const tars = {}, cats = _leerCatalogos_(), vc = veCostos_(u);
  tarifasDet_().forEach(function (t) { tars[t.material.toUpperCase()] = t; });
  let bruto = 0;
  const lineas = (p.lineas || []).map(function (l) {
    const desc = str_(l.Descripcion), t = tars[desc.toUpperCase()];
    if (!desc) return { vacia: true };
    if (!t) return { error: 'El material no está en el catálogo (TARIFAS).' };
    try {
      const r = calcPartida_(t, l, cats); bruto += r.Importe;
      const o = { Unidad: r.Unidad, unidadesOk: r.unidadesOk, M2: r.M2, Precio: r.Precio, PrecioUnit: r.PrecioUnit, Importe: r.Importe, Detalle: r.Detalle };
      if (vc) { o.CostoMaterial = r.CostoMaterial; o.CostoTinta = r.CostoTinta; o.CostoAcabados = r.CostoAcabados; }
      return o;
    } catch (e) {
      const o = { error: e.message };
      try { const uo = {}; UNIDADES_COT.forEach(function (x) { uo[x] = !!costoUnidad_(t, x); }); o.unidadesOk = uo; } catch (_) {}
      return o;
    }
  });
  const pct = str_(p.DescuentoPct) === '' ? 0 : num_(p.DescuentoPct), desc = r2_(bruto * pct / 100), sub = r2_(bruto - desc), iva = r2_(sub * ivaRate_());
  return { lineas: lineas, bruto: r2_(bruto), descuento: desc, subtotal: sub, iva: iva, total: r2_(sub + iva), m2: r4_(lineas.reduce(function (s, x) { return s + (x.M2 || 0); }, 0)) };
}

// ---- Carga de material (formulario de ADMINISTRACION) -> hoja TARIFAS
function a_tarifas(u) { need_(u, 'material'); return tarifasDet_(); }

function a_saveTarifa(u, p) {
  need_(u, 'material');
  const mat = req_(p.MATERIAL, 'Material').replace(/\s+/g, ' ');
  if (mat.length > 150) throw new Error('El nombre del material es demasiado largo (máximo 150).');
  const pres = inList_(str_(p.PRESENTACION) || 'otro', PRESENTACIONES, 'Presentación');
  const cobro = inList_(req_(p.COBRO_POR, 'Cobro por'), COBROS, 'Cobro por');
  const costo = num_(p.COSTO), ancho = num_(p.ANCHO), largo = num_(p.LARGO);
  if (!(costo > 0)) throw new Error('Captura el costo (mayor que cero).');
  if (ancho < 0 || largo < 0) throw new Error('Ancho y largo no pueden ser negativos.');
  const todas = tarifasDet_();
  const orig = str_(p.MaterialOriginal).toUpperCase();
  const ex = orig ? todas.filter(function (t) { return t.material.toUpperCase() === orig; })[0] : null;
  if (orig && !ex) throw new Error('No encuentro el material "' + p.MaterialOriginal + '" para modificarlo.');
  const dup = todas.filter(function (t) { return t.material.toUpperCase() === mat.toUpperCase() && (!ex || t.fila !== ex.fila); })[0];
  if (dup) throw new Error('Ya existe un material llamado "' + dup.material + '".');
  // costos por unidad. Con medidas, COSTO es el de la presentacion (rollo, lamina...); sin medidas, es el costo de la unidad de cobro.
  const m2pres = ancho * largo, conMedidas = m2pres > 0;
  const c = { m2: null, mtl: null, lamina: null, pz: null };
  if (conMedidas) {
    c.m2 = costo / m2pres;
    if (pres === 'rollo' || pres === 'bobina') c.mtl = costo / largo;
    if (pres === 'lamina' || pres === 'hoja') c.lamina = costo;
    if (cobro === 'pz') c.pz = costo;
  } else if (cobro !== 'otro') { c[cobro] = costo; }
  if (cobro !== 'otro' && !c[cobro]) throw new Error('Con esa presentación y medidas no se puede calcular el costo por ' + cobro + '. Revisa presentación, ancho y largo.');
  const v = function (x) { return x ? r4_(x) : 'NA'; };
  const h = tarHoja_(), hoy = hoy_();
  let fila = ex ? ex.fila : h.getLastRow() + 1;
  h.getRange(fila, 1, 1, 2).setValues([[mat, v(c.m2)]]);
  h.getRange(fila, TAR_COL_EXT, 1, TAR_EXT.length).setValues([[str_(p.PROVEEDOR), pres, ancho || '', largo || '', costo, cobro, v(c.mtl), v(c.lamina), v(c.pz), hoy]]);
  _limpiaCacheCatalogos_();
  const mg = 1 / (1 - margenCot_());
  return { fila: fila, material: mat, costoM2: v(c.m2), costoMtl: v(c.mtl), costoLamina: v(c.lamina), costoPz: v(c.pz), cobroPor: cobro,
           precios: { m2: c.m2 ? r2_(c.m2 * mg) : 'NA', mtl: c.mtl ? r2_(c.mtl * mg) : 'NA', lamina: c.lamina ? r2_(c.lamina * mg) : 'NA', pz: c.pz ? r2_(c.pz * mg) : 'NA' },
           avisoDashboard: c.m2 ? '' : 'Sin costo por m²: el Dashboard costeará este material en $0 por m².' };
}

function folioCot_(u) {
  const usr = find_('Usuarios', 'Email', u.email);
  const pre = usr ? str_(usr.PrefijoCot).toUpperCase() : '';
  for (let i = 0; i < 50; i++) {
    const f = pre ? seq_('CONSEC_COT_' + pre, pre, 3) : seq_('CONSEC_COT', cfg_('PREFIJO_COT', 'COT-'), 4);
    if (!find_('Cotizaciones', 'Folio', f)) return f;
  }
  throw new Error('No se pudo generar folio de cotización; revisa los consecutivos en Configuración.');
}

function a_saveCot(u, p) {
  need_(u, 'crm');
  const cli = mustFind_('Clientes', 'ID', req_(p.ClienteID, 'Cliente'), 'Cliente'); ownOr_(u, cli);
  const lineas = lineasCot_(p.lineas);
  const usaLineas = lineas.length > 0;
  const bruto = usaLineas ? r2_(sum_(lineas, 'Importe')) : r2_(num_(p.Subtotal));
  const pct = str_(p.DescuentoPct) === '' ? 0 : num_(p.DescuentoPct);
  if (DESCUENTOS_COT.indexOf(pct) < 0) throw new Error('El descuento debe ser 0%, 5%, 10%, 15%, 20% o 25%.');
  const descu = r2_(bruto * pct / 100);
  const agente = enCatalogo_(_leerCatalogos_().VENDEDOR, req_(p.AgenteVentas, 'Agente de ventas'));
  if (!agente) throw new Error('El agente de ventas "' + str_(p.AgenteVentas) + '" no está en el catálogo COMERCIAL de CATALOGOS.');
  const sub = r2_(bruto - descu), iva = r2_(sub * ivaRate_());
  const proyecto = str_(p.Proyecto);
  const descr = str_(p.Descripcion) || proyecto || lineas.map(function (l) { return l.Descripcion; }).join(' / ');
  const data = { Fecha: fecha_(p.Fecha, 'Fecha'), ClienteID: cli.ID, Cliente: cli.Nombre, Comercial: str_(cli.Comercial).toLowerCase() || u.email,
                 Descripcion: req_(descr, 'Descripción o partidas'), M2: usaLineas ? r4_(sum_(lineas, 'M2')) : num_(p.M2),
                 Subtotal: sub, IVA: iva, Total: r2_(sub + iva),
                 ProximoSeguimiento: fechaOpc_(p.ProximoSeguimiento, 'Próximo seguimiento'), Notas: str_(p.Notas),
                 Proyecto: proyecto, TipoProyecto: str_(p.TipoProyecto), RazonSocial: str_(p.RazonSocial), Terminados: str_(p.Terminados), Descuento: descu || '',
                 AgenteVentas: agente, DescuentoPct: pct || '', Indicaciones: str_(p.Indicaciones) };
  let c;
  if (str_(p.Folio)) {
    c = mustFind_('Cotizaciones', 'Folio', p.Folio, 'Cotización'); ownOr_(u, c);
    if (c.ODP) throw new Error('La cotización ya generó la ' + c.ODP + '; ya no se puede editar.');
    data.Estatus = inList_(p.Estatus || c.Estatus, EST_COT, 'Estatus');
    if (data.Estatus === 'Aprobada') throw new Error('Para aprobar usa el botón “Aprobar → ODP”.');
    update_('Cotizaciones', c, data);
  } else {
    data.Folio = folioCot_(u); data.Estatus = 'Borrador'; data.ODP = '';
    c = insert_('Cotizaciones', data);
  }
  deleteWhere_('CotDetalle', function (l) { return str_(l.Folio) === str_(c.Folio); });
  insertMany_('CotDetalle', lineas.map(function (l, i) { return Object.assign({ Folio: c.Folio, Linea: i + 1 }, l); }));
  return clean_(c);
}

function a_aprobarCot(u, p) {
  needAny_(u, ['crm', 'odp']);
  const c = mustFind_('Cotizaciones', 'Folio', p.Folio, 'Cotización'); ownOr_(u, c);
  if (c.ODP) throw new Error('Ya tiene la ' + c.ODP + '.');
  if (c.Estatus === 'Rechazada') throw new Error('La cotización está rechazada.');
  const cli = find_('Clientes', 'ID', c.ClienteID) || {};
  const o = crearODP_(Object.assign(datosCliODP_(cli), {
    Cotizacion: c.Folio, ClienteID: c.ClienteID, Cliente: c.Cliente, Comercial: c.Comercial, Descripcion: c.Descripcion, Proyecto: c.Proyecto || c.Descripcion, TipoProyecto: str_(c.TipoProyecto), AgenteVentas: str_(c.AgenteVentas),
    M2Vendidos: num_(c.M2), PrecioVenta: num_(c.Subtotal), FechaEntrega: fechaOpc_(p.FechaEntrega, 'Fecha de entrega') }));
  const lin = lineasDe_('CotDetalle', 'Folio', c.Folio);
  insertMany_('ODPDetalle', lin.map(function (l, i) {
    return { ODP: o.Folio, Linea: i + 1, Piezas: l.Cantidad, Ancho: l.Ancho, Alto: l.Alto, M2: l.M2, Material: l.Descripcion, Maquina: '',
             Archivo: c.Proyecto || '', Acabados: str_(l.Detalle) };
  }));
  update_('Cotizaciones', c, { Estatus: 'Aprobada', ODP: o.Folio });
  return { Folio: o.Folio };
}

function a_seguimiento(u) { needAny_(u, ['crm', 'crm_ver']); return scope_(u, read_('Seguimiento')).map(clean_).reverse(); }

function a_saveSeg(u, p) {
  need_(u, 'crm');
  const cli = mustFind_('Clientes', 'ID', req_(p.ClienteID, 'Cliente'), 'Cliente'); ownOr_(u, cli);
  const prox = fechaOpc_(p.ProximaAccion, 'Próxima acción');
  let cot = null;
  if (str_(p.Cotizacion)) { cot = mustFind_('Cotizaciones', 'Folio', p.Cotizacion, 'Cotización'); ownOr_(u, cot); }
  const s = insert_('Seguimiento', { ID: seq_('SEQ_SEG', 'SG-', 5), Fecha: fecha_(p.Fecha, 'Fecha'), ClienteID: cli.ID, Cliente: cli.Nombre,
                                    Cotizacion: cot ? cot.Folio : '', Comercial: str_(cli.Comercial).toLowerCase() || u.email,
                                    Tipo: inList_(p.Tipo || 'Llamada', TIPOS_SEG, 'Tipo'), Nota: req_(p.Nota, 'Nota'), ProximaAccion: prox });
  if (cot && ['Borrador', 'Enviada', 'Negociación'].indexOf(cot.Estatus) >= 0) {
    const ch = { ProximoSeguimiento: prox };
    if (cot.Estatus === 'Borrador') ch.Estatus = 'Enviada';
    update_('Cotizaciones', cot, ch);
  }
  return clean_(s);
}

// ==================== PRODUCCIÓN (ODP) ====================
function datosCliODP_(cli) {
  return { Domicilio: str_(cli.Domicilio), Colonia: str_(cli.Colonia), Ciudad: str_(cli.Ciudad), CP: str_(cli.CP), Estado: str_(cli.Estado),
           Telefono: str_(cli.Telefono), Email: str_(cli.Email) };
}
const ODP_TXT = ['Proyecto', 'HorarioEntrega', 'RecolectaCliente', 'DireccionEntrega', 'Domicilio', 'Colonia', 'Ciudad', 'CP', 'Estado', 'Telefono', 'Email', 'RecibeProduccion', 'TipoProyecto', 'AgenteVentas'];

/** Partidas de ODP: m² = piezas × ancho × alto (como en el formato). */
function lineasODP_(arr) {
  const out = [];
  (arr || []).forEach(function (l) {
    const pz = num_(l.Piezas), an = num_(l.Ancho), al = num_(l.Alto);
    const t = { Material: str_(l.Material), Maquina: str_(l.Maquina), Archivo: str_(l.Archivo), Acabados: str_(l.Acabados) };
    if (!pz && !an && !al && !t.Material && !t.Maquina && !t.Archivo && !t.Acabados) return;
    out.push(Object.assign({ Piezas: pz || '', Ancho: an || '', Alto: al || '', M2: r4_((pz || 1) * an * al) }, t));
  });
  return out;
}
function guardarLineasODP_(folio, lineas) {
  deleteWhere_('ODPDetalle', function (l) { return str_(l.ODP) === str_(folio); });
  insertMany_('ODPDetalle', lineas.map(function (l, i) { return Object.assign({ ODP: folio, Linea: i + 1 }, l); }));
}

function crearODP_(d) {
  const pr = find_('Config', 'Clave', 'PREFIJO_ODP');
  const folio = seq_('CONSEC_ODP', pr ? str_(pr.Valor) : 'ODP-', num_(cfg_('DIGITOS_ODP', '4')) || 4);
  if (find_('ODP', 'Folio', folio)) throw new Error('El folio ' + folio + ' ya existe. Revisa CONSEC_ODP en Configuración.');
  const o = Object.assign({ Folio: folio, Fecha: hoy_(), Estatus: 'Abierta', Facturado: 0, CostoMaterial: 0, CostoTinta: 0, CostoMO: 0, CostoMaquila: 0,
                            CostoOtros: 0, CostoTotal: 0, Utilidad: 0, Margen: 0, M2Usados: 0, MermaM2: 0, MermaPct: 0, CostoMerma: 0, Factura: '',
                            RecibeProduccion: cfg_('RECIBE_PRODUCCION', '') }, d);
  insert_('ODP', o);
  recalcODP_(folio);
  return o;
}

/** Recalcula costo, utilidad y merma de una ODP a partir de Kardex, ODPCostos y Facturas. */
function recalcODP_(folio) {
  const o = find_('ODP', 'Folio', folio); if (!o) return;
  const mats = {}; read_('Materiales').forEach(function (m) { mats[str_(m.Clave)] = m; });
  let cMat = 0, cTin = 0, cMO = 0, cMaq = 0, cOtr = 0, m2u = 0;
  read_('Kardex').forEach(function (k) {
    if (str_(k.ODP) !== str_(folio)) return;
    const sg = k.Tipo === 'SALIDA' ? 1 : k.Tipo === 'DEVOLUCION' ? -1 : 0; if (!sg) return;
    const m = mats[str_(k.Clave)] || {}, imp = sg * num_(k.Importe);
    if (m.Tipo === 'Sustrato') { cMat += imp; if (str_(m.Unidad).toLowerCase() === 'm2') m2u += sg * num_(k.Cantidad); }
    else cTin += imp;
  });
  read_('ODPCostos').forEach(function (c) {
    if (str_(c.ODP) !== str_(folio)) return;
    const imp = num_(c.Importe);
    if (c.Tipo === 'Mano de obra' || c.Tipo === 'Instalación') cMO += imp;
    else if (c.Tipo === 'Maquila') cMaq += imp;
    else if (c.Tipo === 'Tinta/consumible') cTin += imp;
    else cOtr += imp;
  });
  // sin kardex (inventario aun no se usa): el material se costea con TARIFAS y los m2 salen de la produccion en BASE, igual que en el Dashboard
  let costoMermaT = null;
  if (cMat === 0 && m2u === 0) {
    const info = prodInfo_(o);
    if (info.cMat > 0 || info.m2r > 0) { cMat = info.cMat; m2u = info.m2r; costoMermaT = info.cMerma; }
  }
  const facturado = r2_(sum_(read_('Facturas').filter(function (f) { return str_(f.ODP) === str_(folio) && f.Estatus !== 'Cancelada'; }), 'Subtotal'));
  const venta = facturado > 0 ? facturado : num_(o.PrecioVenta);
  const total = cMat + cTin + cMO + cMaq + cOtr, util = venta - total;
  const m2v = num_(o.M2Vendidos), merma = m2u > 0 ? Math.max(0, m2u - m2v) : 0;
  update_('ODP', o, {
    Facturado: facturado, CostoMaterial: r2_(cMat), CostoTinta: r2_(cTin), CostoMO: r2_(cMO), CostoMaquila: r2_(cMaq), CostoOtros: r2_(cOtr),
    CostoTotal: r2_(total), Utilidad: r2_(util), Margen: venta ? r4_(util / venta) : 0,
    M2Usados: r2_(m2u), MermaM2: r2_(merma), MermaPct: m2u > 0 ? r4_(merma / m2u) : 0, CostoMerma: costoMermaT !== null ? r2_(costoMermaT) : (m2u > 0 ? r2_(merma * cMat / m2u) : 0),
  });
  ventaSync_(folio);
}

function odpOut_(u, o) {
  const c = clean_(o);
  if (!veCostos_(u)) FIN_FIELDS.forEach(function (k) { delete c[k]; });
  if (!vePrecio_(u)) { delete c.PrecioVenta; delete c.Facturado; }
  return c;
}

function a_odps(u) { need_(u, 'odp_ver'); return scope_(u, read_('ODP')).map(function (o) { return odpOut_(u, o); }).reverse(); }

function a_odpDetalle(u, p) {
  need_(u, 'odp_ver');
  const o = mustFind_('ODP', 'Folio', p.Folio, 'ODP'); ownOr_(u, o);
  const vc = veCostos_(u);
  const mats = {}; read_('Materiales').forEach(function (m) { mats[m.Clave] = m; });
  const consumos = read_('Kardex').filter(function (k) { return str_(k.ODP) === str_(o.Folio); }).map(function (k) {
    const c = clean_(k); c.Descripcion = (mats[k.Clave] || {}).Descripcion || ''; c.Unidad = (mats[k.Clave] || {}).Unidad || '';
    if (!vc) { delete c.CostoUnit; delete c.Importe; } return c;
  });
  const costos = read_('ODPCostos').filter(function (k) { return str_(k.ODP) === str_(o.Folio); }).map(function (k) {
    const c = clean_(k); if (!vc) { delete c.CostoUnit; delete c.Importe; } return c;
  });
  const facturas = vePrecio_(u) ? read_('Facturas').filter(function (f) { return str_(f.ODP) === str_(o.Folio); }).map(clean_) : [];
  return { odp: odpOut_(u, o), lineas: lineasDe_('ODPDetalle', 'ODP', o.Folio), consumos: consumos, costos: costos, facturas: facturas };
}

function a_saveODP(u, p) {
  needAny_(u, ['odp', 'crm']);
  if (!str_(p.Folio)) {
    const cli = mustFind_('Clientes', 'ID', req_(p.ClienteID, 'Cliente'), 'Cliente'); ownOr_(u, cli);
    const lin = lineasODP_(p.lineas);
    const d = datosCliODP_(cli);
    ODP_TXT.forEach(function (k) { if (p[k] !== undefined && str_(p[k]) !== '') d[k] = str_(p[k]); });
    const o = crearODP_(Object.assign(d, { Fecha: fecha_(p.Fecha, 'Fecha'), Cotizacion: '', ClienteID: cli.ID, Cliente: cli.Nombre, Comercial: str_(cli.Comercial).toLowerCase(),
                          Descripcion: req_(p.Descripcion || p.Proyecto, 'Descripción'), M2Vendidos: lin.length ? r4_(sum_(lin, 'M2')) : num_(p.M2Vendidos),
                          PrecioVenta: r2_(num_(p.PrecioVenta)), FechaEntrega: fechaOpc_(p.FechaEntrega, 'Fecha de entrega') }));
    if (lin.length) guardarLineasODP_(o.Folio, lin);
    return { Folio: o.Folio };
  }
  const o = mustFind_('ODP', 'Folio', p.Folio, 'ODP'); ownOr_(u, o);
  const ch = {};
  ODP_TXT.forEach(function (k) { if (p[k] !== undefined) ch[k] = str_(p[k]); });
  if (p.lineas !== undefined) {
    const lin = lineasODP_(p.lineas);
    guardarLineasODP_(o.Folio, lin);
    if (lin.length) ch.M2Vendidos = r4_(sum_(lin, 'M2'));
  }
  if (p.Descripcion !== undefined) ch.Descripcion = req_(p.Descripcion, 'Descripción');
  if (p.M2Vendidos !== undefined && ch.M2Vendidos === undefined) ch.M2Vendidos = num_(p.M2Vendidos);
  if (p.FechaEntrega !== undefined) ch.FechaEntrega = fechaOpc_(p.FechaEntrega, 'Fecha de entrega');
  if (p.PrecioVenta !== undefined && (can_(u, 'crm') || can_(u, 'fin'))) ch.PrecioVenta = r2_(num_(p.PrecioVenta));
  if (p.Estatus !== undefined) ch.Estatus = inList_(p.Estatus, EST_ODP, 'Estatus');
  update_('ODP', o, ch);
  recalcODP_(o.Folio);
  return { Folio: o.Folio };
}

function odpActiva_(folio) {
  const o = mustFind_('ODP', 'Folio', req_(folio, 'ODP'), 'ODP');
  if (o.Estatus === 'Cerrada' || o.Estatus === 'Cancelada') throw new Error('La ' + o.Folio + ' está ' + o.Estatus.toLowerCase() + '.');
  return o;
}

function a_consumir(u, p) {
  need_(u, 'consumo');
  const o = odpActiva_(p.ODP);
  const m = mustFind_('Materiales', 'Clave', req_(p.Clave, 'Material'), 'Material');
  const k = salida_(m.Clave, num_(p.Cantidad), fecha_(p.Fecha, 'Fecha'), 'SALIDA', 'Consumo ' + o.Folio, o.Folio, u, p.Notas);
  if (o.Estatus === 'Abierta') update_('ODP', o, { Estatus: 'En producción' });
  recalcODP_(o.Folio);
  return { ID: k.ID };
}

function a_devolver(u, p) {
  need_(u, 'consumo');
  const o = odpActiva_(p.ODP);
  const m = mustFind_('Materiales', 'Clave', req_(p.Clave, 'Material'), 'Material');
  const cant = num_(p.Cantidad);
  let q = 0, imp = 0;
  read_('Kardex').forEach(function (k) {
    if (str_(k.ODP) !== str_(o.Folio) || str_(k.Clave) !== m.Clave) return;
    if (k.Tipo === 'SALIDA') { q += num_(k.Cantidad); imp += num_(k.Importe); }
    if (k.Tipo === 'DEVOLUCION') { q -= num_(k.Cantidad); imp -= num_(k.Importe); }
  });
  if (cant <= 0) throw new Error('Cantidad inválida.');
  if (cant > q + 1e-6) throw new Error('En esta ODP solo hay ' + r2_(q) + ' ' + m.Unidad + ' consumidos de ' + m.Clave + '.');
  const k = entrada_(m.Clave, cant, q > 0 ? imp / q : 0, fecha_(p.Fecha, 'Fecha'), 'Devolución ' + o.Folio, 'DEVOLUCION', 'Devolución ' + o.Folio, o.Folio, u, p.Notas);
  recalcODP_(o.Folio);
  return { ID: k.ID };
}

function a_agregarCosto(u, p) {
  needAny_(u, ['odp', 'fin']);
  const o = odpActiva_(p.ODP);
  const cant = str_(p.Cantidad) === '' ? 1 : num_(p.Cantidad), cu = num_(p.CostoUnit);
  if (cant <= 0 || cu < 0) throw new Error('Cantidad o costo inválido.');
  const c = insert_('ODPCostos', { ID: seq_('SEQ_COSTO', 'OC-', 6), ODP: o.Folio, Fecha: fecha_(p.Fecha, 'Fecha'), Tipo: inList_(p.Tipo, TIPOS_COSTO, 'Tipo'),
                                   Concepto: req_(p.Concepto, 'Concepto'), Cantidad: cant, CostoUnit: cu, Importe: r2_(cant * cu), CompraID: '', Usuario: u.email });
  recalcODP_(o.Folio);
  return clean_(c);
}

function a_anularCosto(u, p) {
  needAny_(u, ['odp', 'fin']);
  const c = mustFind_('ODPCostos', 'ID', p.ID, 'Costo');
  if (c.CompraID) throw new Error('Este costo viene de la compra ' + c.CompraID + '; cancela la compra en su lugar.');
  odpActiva_(c.ODP);
  update_('ODPCostos', c, { Importe: 0, Concepto: 'ANULADO · ' + c.Concepto });
  recalcODP_(c.ODP);
  return true;
}

// ==================== FACTURAS / CUENTAS POR COBRAR ====================
function a_facturas(u) { needAny_(u, ['cxc', 'cxc_ver', 'facturas']); return conVenc_(scope_(u, read_('Facturas')), hoy_()).reverse(); }

function a_facturaDetalle(u, p) {
  needAny_(u, ['cxc', 'cxc_ver', 'facturas']);
  const f = mustFind_('Facturas', 'ID', p.ID, 'Factura'); ownOr_(u, f);
  return { factura: clean_(f), cobros: read_('Cobros').filter(function (c) { return c.FacturaID === f.ID; }).map(clean_) };
}

function a_saveFactura(u, p) {
  need_(u, 'facturas');
  const folio = req_(p.FolioSAT, 'Folio / UUID').toUpperCase();
  if (read_('Facturas').some(function (f) { return str_(f.FolioSAT).toUpperCase() === folio && f.Estatus !== 'Cancelada'; }))
    throw new Error('Ya existe una factura con el folio ' + folio + '.');
  let cli, odp = null;
  if (str_(p.ODP)) {
    odp = mustFind_('ODP', 'Folio', p.ODP, 'ODP');
    if (odp.Estatus === 'Cancelada') throw new Error('La ODP está cancelada.');
    cli = mustFind_('Clientes', 'ID', odp.ClienteID, 'Cliente');
  } else cli = mustFind_('Clientes', 'ID', req_(p.ClienteID, 'Cliente'), 'Cliente');
  const sub = r2_(num_(p.Subtotal));
  if (sub <= 0) throw new Error('Captura el subtotal.');
  const iva = str_(p.IVA) !== '' ? r2_(num_(p.IVA)) : r2_(sub * ivaRate_());
  const fecha = fecha_(p.Fecha, 'Fecha'), total = r2_(sub + iva);
  const f = insert_('Facturas', {
    ID: seq_('SEQ_FACTURA', 'FV-', 5), Fecha: fecha, FolioSAT: folio, ClienteID: cli.ID, Cliente: cli.Nombre,
    Comercial: odp ? odp.Comercial : str_(cli.Comercial).toLowerCase(), ODP: odp ? odp.Folio : '', Subtotal: sub, IVA: iva, Total: total,
    Vencimiento: addDays_(fecha, num_(cli.DiasCredito)), Cobrado: 0, Saldo: total, Estatus: 'Pendiente', Notas: str_(p.Notas),
  });
  if (odp) {
    const ch = { Factura: str_(odp.Factura) ? str_(odp.Factura) + ', ' + folio : folio };
    if (['Abierta', 'En producción', 'Terminada'].indexOf(odp.Estatus) >= 0) ch.Estatus = 'Facturada';
    update_('ODP', odp, ch);
    recalcODP_(odp.Folio);
  }
  return clean_(f);
}

function a_cancelarFactura(u, p) {
  need_(u, 'facturas');
  const f = mustFind_('Facturas', 'ID', p.ID, 'Factura');
  if (f.Estatus === 'Cancelada') throw new Error('Ya está cancelada.');
  if (num_(f.Cobrado) > 0) throw new Error('Tiene cobros registrados; no se puede cancelar.');
  update_('Facturas', f, { Estatus: 'Cancelada', Saldo: 0, Notas: (str_(f.Notas) + ' | Cancelada: ' + str_(p.Motivo)).trim() });
  if (f.ODP) recalcODP_(f.ODP);
  return true;
}

function a_registrarCobro(u, p) {
  need_(u, 'cxc');
  const f = mustFind_('Facturas', 'ID', p.FacturaID, 'Factura');
  if (f.Estatus === 'Cancelada') throw new Error('La factura está cancelada.');
  const monto = r2_(num_(p.Monto));
  if (monto <= 0) throw new Error('Monto inválido.');
  if (monto > num_(f.Saldo) + 0.01) throw new Error('El cobro excede el saldo (' + r2_(num_(f.Saldo)) + ').');
  insert_('Cobros', { ID: seq_('SEQ_COBRO', 'CB-', 5), Fecha: fecha_(p.Fecha, 'Fecha'), FacturaID: f.ID, Monto: monto, Referencia: str_(p.Referencia), Usuario: u.email });
  const cob = r2_(num_(f.Cobrado) + monto), saldo = r2_(num_(f.Total) - cob);
  const r = update_('Facturas', f, { Cobrado: cob, Saldo: Math.max(0, saldo), Estatus: saldo <= 0.009 ? 'Pagada' : 'Parcial' });
  if (f.ODP) recalcODP_(f.ODP);   // el cobro cambia el estatus en VENTAS
  return clean_(r);
}

// ==================== REPORTE DE VENTAS CON MERMA ====================
function a_reporteVentas(u, p) {
  need_(u, 'reportes');
  const hoy = hoy_();
  const desde = str_(p.desde) || hoy.slice(0, 8) + '01', hasta = str_(p.hasta) || hoy;
  const nom = {}; read_('Usuarios').forEach(function (x) { nom[str_(x.Email).toLowerCase()] = str_(x.Nombre); });
  const rows = read_('ODP').filter(function (o) { return o.Estatus !== 'Cancelada' && inRange_(o.Fecha, desde, hasta); }).map(function (o) {
    return { Folio: o.Folio, Fecha: o.Fecha, Cliente: o.Cliente, Comercial: nom[str_(o.Comercial).toLowerCase()] || o.Comercial, Descripcion: o.Descripcion, Estatus: o.Estatus,
             Factura: o.Factura, Venta: r2_(ventaODP_(o)), Facturado: num_(o.Facturado), CostoMaterial: num_(o.CostoMaterial), CostoTinta: num_(o.CostoTinta),
             CostoMO: num_(o.CostoMO), CostoMaquila: num_(o.CostoMaquila), CostoOtros: num_(o.CostoOtros), CostoTotal: num_(o.CostoTotal),
             Utilidad: num_(o.Utilidad), Margen: num_(o.Margen), M2Vendidos: num_(o.M2Vendidos), M2Usados: num_(o.M2Usados),
             MermaM2: num_(o.MermaM2), MermaPct: num_(o.MermaPct), CostoMerma: num_(o.CostoMerma) };
  });
  function tot(list) {
    const t = {}; ['Venta', 'Facturado', 'CostoMaterial', 'CostoTinta', 'CostoMO', 'CostoMaquila', 'CostoOtros', 'CostoTotal', 'Utilidad', 'M2Vendidos', 'M2Usados', 'MermaM2', 'CostoMerma']
      .forEach(function (k) { t[k] = r2_(sum_(list, k)); });
    t.Margen = t.Venta ? r4_(t.Utilidad / t.Venta) : 0; t.MermaPct = t.M2Usados ? r4_(t.MermaM2 / t.M2Usados) : 0; t.ODPs = list.length;
    return t;
  }
  function agrupa(k) {
    const g = {}; rows.forEach(function (r) { const key = str_(r[k]) || '(sin asignar)'; (g[key] = g[key] || []).push(r); });
    return Object.keys(g).map(function (key) { return Object.assign({ Grupo: key }, tot(g[key])); }).sort(function (a, b) { return b.Venta - a.Venta; });
  }
  return { desde: desde, hasta: hasta, rows: rows, total: tot(rows), porCliente: agrupa('Cliente'), porComercial: agrupa('Comercial') };
}

// ==================== ADMINISTRACIÓN ====================
function a_usuarios(u) { need_(u, '*'); return read_('Usuarios').map(clean_); }

function a_saveUsuario(u, p) {
  need_(u, '*');
  const email = req_(p.Email, 'Correo').toLowerCase();
  const data = { Nombre: req_(p.Nombre, 'Nombre'), Rol: inList_(str_(p.Rol).toUpperCase(), Object.keys(ROLES_ERP), 'Rol'), Activo: str_(p.Activo).toUpperCase() === 'NO' ? 'NO' : 'SI',
                 PrefijoCot: str_(p.PrefijoCot).toUpperCase().replace(/[^A-Z0-9-]/g, '') };
  const ex = find_('Usuarios', 'Email', email);
  if (ex) {
    const quedaAdmin = read_('Usuarios').some(function (x) { return x !== ex && str_(x.Rol).toUpperCase() === 'ADMIN' && str_(x.Activo).toUpperCase() !== 'NO'; });
    if (str_(ex.Rol).toUpperCase() === 'ADMIN' && (data.Rol !== 'ADMIN' || data.Activo === 'NO') && !quedaAdmin) throw new Error('Debe quedar al menos un ADMIN activo.');
    return clean_(update_('Usuarios', ex, data));
  }
  data.Email = email;
  return clean_(insert_('Usuarios', data));
}

function a_config(u) { need_(u, '*'); return read_('Config').filter(function (c) { return str_(c.Clave).indexOf('SEQ_') !== 0; }).map(clean_); }

function a_saveConfig(u, p) {
  need_(u, '*');
  const c = mustFind_('Config', 'Clave', p.Clave, 'Parámetro');
  return clean_(update_('Config', c, { Valor: str_(p.Valor) }));
}

// ==================== PDF (formatos Bigfoot) ====================
function a_pdfCot(u, p) {
  needAny_(u, ['crm', 'crm_ver']);
  const c = mustFind_('Cotizaciones', 'Folio', p.Folio, 'Cotización'); ownOr_(u, c);
  const html = htmlCot_(c, lineasDe_('CotDetalle', 'Folio', c.Folio));
  return pdfOut_(html, 'Cotizacion ' + c.Folio + ' - ' + (str_(c.Proyecto) || str_(c.Cliente)));
}

function a_pdfODP(u, p) {
  need_(u, 'odp_ver');
  const o = mustFind_('ODP', 'Folio', p.Folio, 'ODP'); ownOr_(u, o);
  const html = htmlODP_(o, lineasDe_('ODPDetalle', 'ODP', o.Folio));
  return pdfOut_(html, 'ODP ' + o.Folio + ' - ' + (str_(o.Proyecto) || str_(o.Cliente)));
}

/** El convertidor de PDF de Google ignora "background:" en estilos; se agrega bgcolor/background-color. */
function pdfColor_(html) {
  return html.replace(/<td([^>]*?) style="([^"]*?)background:(#[0-9a-fA-F]{3,6});/g, '<td$1 bgcolor="$3" style="$2background-color:$3;');
}
function pdfOut_(html, nombre) {
  const name = nombre.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) + '.pdf';
  const pdf = Utilities.newBlob(pdfColor_(html), 'text/html', 'doc.html').getAs('application/pdf');
  return { name: name, b64: Utilities.base64Encode(pdf.getBytes()), html: html };
}

function h_(v) {
  return str_(v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/\n/g, '<br>');
}
function mon_(n) {
  n = r2_(num_(n)); const p = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + '$' + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + p[1];
}
function cifra_(n, d) { n = num_(n); if (!n) return ''; const f = Math.pow(10, d == null ? 2 : d); return String(Math.round(n * f) / f); }
function fechaTxt_(s) { const d = toDate_(s); return d ? Utilities.formatDate(d, tz_(), 'dd/MM/yyyy') : str_(s); }
function nombreUsuario_(email) { const x = find_('Usuarios', 'Email', email); return x && str_(x.Nombre) ? str_(x.Nombre) : str_(email); }

function htmlCot_(c, lin) {
  const B = '#1d3e81', O = '#df4b12';
  if (!lin.length) lin = [{ Descripcion: c.Descripcion, Cantidad: 1, PrecioUnit: num_(c.Subtotal) + num_(c.Descuento), Importe: num_(c.Subtotal) + num_(c.Descuento) }];
  const bruto = r2_(sum_(lin, 'Importe')), des = num_(c.Descuento);
  const lab = 'color:' + B + ';font-weight:bold;font-style:italic;';
  const head = 'background:' + B + ';color:#fff;font-weight:bold;font-style:italic;text-align:center;padding:4px;';
  let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#222;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}table{border-collapse:collapse}td{vertical-align:top;font-size:9pt;font-family:Arial,Helvetica,sans-serif}' +
    '</style></head><body>';
  // encabezado
  h += '<table width="100%"><tr><td width="60%"><img src="' + IMG_.logo + '" style="height:48px"></td>' +
    '<td width="40%" align="right"><table width="150"><tr><td style="' + head + '">Folio</td></tr>' +
    '<tr><td style="border:1px solid ' + B + ';text-align:center;padding:4px;font-weight:bold">' + h_(c.Folio) + '</td></tr></table></td></tr></table>';
  // datos
  h += '<table width="100%" style="margin-top:14px"><tr><td width="62%"><table width="100%">' +
    '<tr><td width="24%" style="background:' + B + ';color:#fff;font-weight:bold;font-style:italic;padding:4px">Proyecto</td>' +
    '<td style="background:' + B + ';color:#fff;padding:4px">' + h_(c.Proyecto || c.Descripcion) + '</td></tr>' +
    '<tr><td style="' + lab + 'padding:3px 4px">Cliente</td><td style="padding:3px 4px">' + h_(c.Cliente) + '</td></tr>' +
    '<tr><td style="' + lab + 'padding:3px 4px">Razón Social</td><td style="padding:3px 4px">' + h_(c.RazonSocial) + '</td></tr>' +
    '<tr><td style="' + lab + 'padding:3px 4px">Ejecutivo</td><td style="padding:3px 4px">' + h_(nombreUsuario_(c.Comercial)) + '</td></tr>' +
    '</table></td><td width="38%" align="right" style="vertical-align:bottom"><span style="' + lab + '">Fecha</span>&nbsp; ' + fechaTxt_(c.Fecha) + '</td></tr></table>';
  // partidas
  h += '<table width="100%" style="margin-top:14px"><tr>' +
    '<td width="46%" style="' + head + '">Descripción</td><td width="12%" style="' + head + '">Medidas</td>' +
    '<td width="11%" style="' + head + '">Cantidad</td><td width="15%" style="' + head + '">Precio Unit.</td>' +
    '<td width="16%" style="' + head.replace(B, O) + '">Total</td></tr>';
  lin.forEach(function (l) {
    const td = 'style="background:#f2f2f2;padding:6px 4px;border-bottom:1px solid #fff;';
    h += '<tr><td ' + td + '">' + h_(l.Descripcion) + (str_(l.Detalle) ? '<br><span style="font-size:7.5pt;color:#555">' + h_(l.Detalle) + '</span>' : '') + '</td>' +
      '<td ' + td + 'text-align:center">' + (num_(l.Ancho) && num_(l.Alto) ? cifra_(l.Ancho, 3) + ' X ' + cifra_(l.Alto, 3) : '') + '</td>' +
      '<td ' + td + 'text-align:center">' + cifra_(l.Cantidad, 2) + '</td>' +
      '<td ' + td + 'text-align:right">' + mon_(l.PrecioUnit) + '</td>' +
      '<td ' + td + 'text-align:right">' + mon_(l.Importe) + '</td></tr>';
  });
  h += '</table>';
  // terminados + totales
  const tr = function (l, v, b) { return '<tr><td style="text-align:right;padding:3px 8px;' + (b ? 'font-weight:bold;' : '') + '">' + l + '</td><td style="text-align:right;padding:3px 4px;' + (b ? 'font-weight:bold;border-top:1px solid ' + B + ';' : '') + '">' + v + '</td></tr>'; };
  h += '<table width="100%" style="margin-top:4px"><tr><td width="62%"><table width="100%"><tr><td style="' + head + '">Terminados y observaciones</td></tr>' +
    '<tr><td style="padding:5px 4px;font-size:8.5pt">' + h_(c.Terminados) + '</td></tr></table></td>' +
    '<td width="38%"><table width="100%">' + tr('Subtotal', mon_(bruto)) + (des ? tr('Descuento', '-' + mon_(des)) : '') +
    tr('IVA', mon_(c.IVA)) + tr('Total', mon_(c.Total), true) + '</table></td></tr></table>';
  // términos, banco, marca de agua
  h += '<table width="100%" style="margin-top:22px"><tr><td width="58%">' +
    '<div style="' + lab + 'margin-bottom:4px">Términos y Condiciones</div><div style="font-size:7.5pt;line-height:1.35">' + h_(cfg_('COT_TERMINOS', TERMINOS_DEF)) + '</div>' +
    '<div style="' + lab + 'margin:18px 0 4px">Datos para depósito o transferencia bancaria</div><div style="font-size:8pt;line-height:1.6">' +
    'BANCO: ' + h_(cfg_('COT_BANCO', '')) + '<br>CLABE: ' + h_(cfg_('COT_CLABE', '')) + '<br>CUENTA: ' + h_(cfg_('COT_CUENTA', '')) + '</div></td>' +
    '<td width="42%" align="center" style="vertical-align:middle"><img src="' + IMG_.marca + '" style="width:150px"></td></tr></table>';
  h += '<div style="text-align:center;margin-top:40px"><img src="' + IMG_.pie + '" style="width:430px"></div>';
  return h + '</body></html>';
}

function htmlODP_(o, lin) {
  const B = '#1d3e81', L = '#d2d2e5', BD = 'border:1px solid #9a9a9a;';
  const lb = function (t, cs) { return '<td' + (cs ? ' colspan="' + cs + '"' : '') + ' style="' + BD + 'background:' + L + ';font-weight:bold;text-align:center;padding:5px 2px">' + t + '</td>'; };
  const vl = function (t, cs, al) { return '<td' + (cs ? ' colspan="' + cs + '"' : '') + ' style="' + BD + 'text-align:' + (al || 'center') + ';padding:3px 3px">' + (t === '' || t == null ? '&nbsp;' : t) + '</td>'; };
  const band = function (t) { return '<tr><td colspan="9" style="' + BD + 'background:' + B + ';color:#fff;font-weight:bold;text-align:center;padding:4px">' + t + '</td></tr>'; };
  let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;font-size:7pt;color:#111;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}table{border-collapse:collapse}td{vertical-align:middle;font-size:7pt;font-family:Arial,Helvetica,sans-serif}</style></head><body>';
  h += '<table width="100%"><tr><td width="70%"><img src="' + IMG_.logo + '" style="height:46px"></td><td width="30%" align="right">' +
    '<table width="130"><tr><td style="background:' + B + ';color:#fff;font-weight:bold;font-size:6.5pt;text-align:center;padding:3px">FOLIO CONSECUTIVO</td></tr>' +
    '<tr><td style="border:1px solid ' + B + ';color:#e00000;font-weight:bold;font-size:14pt;text-align:center;padding:4px">' + h_(o.Folio) + '</td></tr></table></td></tr></table>';
  h += '<table width="100%" style="margin-top:10px">' +
    '<tr><td width="12%"></td><td width="7%"></td><td width="7%"></td><td width="8%"></td><td width="15%"></td><td width="13%"></td><td width="13%"></td><td width="15%"></td><td width="10%"></td></tr>';
  h += band('ORDEN DE PRODUCCIÓN');
  const ent = [fechaTxt_(o.FechaEntrega), h_(o.HorarioEntrega)].filter(String).join(' ');
  h += '<tr>' + lb('CLIENTE') + vl(h_(o.Cliente), 4) + lb('FECHA DE ENTRADA') + vl(fechaTxt_(o.Fecha)) + lb('FECHA Y HORARIO DE ENTREGA') + vl(ent) + '</tr>';
  h += '<tr>' + lb('PROYECTO') + vl(h_(o.Proyecto || o.Descripcion), 4) + lb('RECOLECTA CLIENTE') + vl(h_(o.RecolectaCliente)) + lb('DIRECCIÓN DE ENTREGA') + vl(h_(o.DireccionEntrega)) + '</tr>';
  h += '<tr>' + lb('DOMICILIO') + vl(h_(o.Domicilio), 8, 'left') + '</tr>';
  h += '<tr>' + lb('COLONIA') + vl(h_(o.Colonia), 4) + lb('CIUDAD') + vl(h_(o.Ciudad)) + lb('TELÉFONO') + vl(h_(o.Telefono)) + '</tr>';
  h += '<tr>' + lb('C.P.') + vl(h_(o.CP), 4) + lb('ESTADO') + vl(h_(o.Estado)) + lb('EMAIL') + vl(h_(o.Email)) + '</tr>';
  h += '<tr>' + lb('EJECUTIVO COMERCIAL') + vl(h_(nombreUsuario_(o.Comercial)), 5) + lb('RECIBE EN PRODUCCIÓN') + vl(h_(o.RecibeProduccion), 2) + '</tr>';
  h += '<tr>' + lb('PIEZAS') + lb('ANCHO') + lb('ALTO') + lb('TOTAL M2') + lb('MATERIAL') + lb('MÁQUINA') + lb('ARCHIVO') + lb('ACABADOS Y TERMINADOS', 2) + '</tr>';
  const n = Math.max(10, lin.length);
  for (let i = 0; i < n; i++) {
    const l = lin[i] || {};
    h += '<tr>' + vl(cifra_(l.Piezas, 2)) + vl(num_(l.Ancho) ? num_(l.Ancho).toFixed(2) : '') + vl(num_(l.Alto) ? num_(l.Alto).toFixed(2) : '') +
      vl(num_(l.M2) ? num_(l.M2).toFixed(3) : '') + vl(h_(l.Material)) + vl(h_(l.Maquina)) + vl(h_(l.Archivo)) + vl(h_(l.Acabados), 2) + '</tr>';
  }
  h += '<tr>' + lb('TOTAL M2') + vl('') + vl('') + vl('<b>' + num_(lin.length ? sum_(lin, 'M2') : o.M2Vendidos).toFixed(3) + '</b>') + vl('', 5) + '</tr>';
  h += band('IMPRESOR');
  h += '<tr>' + lb('NOMBRE / IMPRESOR:', 2) + vl('', 7) + '</tr>';
  h += '<tr>' + lb('TIPO DE MATERIAL', 2) + lb('ANCHO DE MATERIAL', 3) + lb('METROS LINEALES', 2) + lb('CANTIDAD UTILIZADA') + lb('% MERMA') + '</tr>';
  for (let j = 0; j < 5; j++) h += '<tr>' + vl('', 2) + vl('', 3) + vl('', 2) + vl('') + vl('') + '</tr>';
  h += '<tr>' + lb('TOTAL', 2) + vl('', 3) + vl('', 2) + vl('') + vl('') + '</tr>';
  h += '<tr><td colspan="9" style="' + BD + 'height:46px;vertical-align:bottom;text-align:center">______________________________________________________</td></tr>';
  h += '<tr><td colspan="9" style="' + BD + 'font-weight:bold;text-align:center;padding:3px">FIRMA Y NOMBRE DE QUIÉN RECIBE</td></tr>';
  h += '</table></body></html>';
  return h;
}

const IMG_ = {
  logo: 'data:image/png;base64,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',
  pie: 'data:image/png;base64,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',
  marca: 'data:image/png;base64,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'
};

// ==================== HOJAS DEL ERP DENTRO DEL ARCHIVO BASE ====================
const PREF = 'ERP_';
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(n) {
  const s = ss_().getSheetByName(PREF + n);
  if (!s) throw new Error('Falta la hoja "' + PREF + n + '". Corre Produccion > Instalar / verificar hojas.');
  return s;
}

/** Numero de ODP mas alto que ya existe en VENTAS/BASE: el ERP sigue el consecutivo desde ahi.
 *  Un renglon con un numero absurdo (un dedazo como 69773 entre 7049) no cuenta: se descartan los que se disparan. */
function maxOdp_() {
  const nums = [];
  try { _leerVentas_().forEach(function (v) { if (/^\d+$/.test(str_(v.odp))) nums.push(Number(v.odp)); }); } catch (e) {}
  try { _leerBase_().forEach(function (b) { if (/^\d+$/.test(str_(b.orden))) nums.push(Number(b.orden)); }); } catch (e) {}
  nums.sort(function (a, b) { return b - a; });
  while (nums.length > 1 && nums[0] > nums[1] + 500) nums.shift();
  return nums.length ? nums[0] : 0;
}

/** Crea / repara las hojas ERP_*, parametros y usuarios iniciales. Seguro de correr varias veces. */
function instalar() {
  fixSheets_(ss_());
  resetCache_();
  if (!find_('Config', 'Clave', 'PREFIJO_ODP')) insert_('Config', { Clave: 'PREFIJO_ODP', Valor: '', Descripcion: 'Prefijo del consecutivo de producción (vacío = solo número)' });
  if (!find_('Config', 'Clave', 'CONSEC_ODP')) insert_('Config', { Clave: 'CONSEC_ODP', Valor: String(maxOdp_() + 1), Descripcion: 'Siguiente número de ODP (continúa tu consecutivo de VENTAS)' });
  CONFIG_DEFAULTS.forEach(function (c) { if (!find_('Config', 'Clave', c[0])) insert_('Config', { Clave: c[0], Valor: c[1], Descripcion: c[2] }); });
  if (read_('Usuarios').length === 0) {
    (ROLES.MASTER || []).forEach(function (e) {
      insert_('Usuarios', { Email: String(e).toLowerCase(), Nombre: String(e).split('@')[0], Rol: 'ADMIN', Activo: 'SI', PrefijoCot: '' });
    });
  }
  PropertiesService.getScriptProperties().setProperty('ERP_SCHEMA_VER', SCHEMA_VER);
  return 'ERP listo: hojas ' + Object.keys(SCHEMA).length + ', consecutivo ODP desde ' + cfg_('CONSEC_ODP', '?') + '.';
}
function asegura_() {
  if (PropertiesService.getScriptProperties().getProperty('ERP_SCHEMA_VER') === SCHEMA_VER && ss_().getSheetByName(PREF + 'Config')) return;
  instalar();
}

// ==================== QUIEN ERES EN EL ERP ====================
/** Rol ERP de una sesion de la intranet, o null si no tiene acceso al ERP.
 *  MASTER = ADMIN; si no, la hoja ERP_Usuarios; si no, la hoja ACCESOS (area erp). Enlaces personales: no. */
function rolDe(ses) {
  if (!ses || !ses.correo) return null;
  if (ses.rol === 'MASTER') return 'ADMIN';
  if (ses.porClave) return ses.rol === 'SOCIO' ? 'DIRECCION' : null;   // enlace de socio: consulta (los enlaces nunca escriben)
  const correo = String(ses.correo).toLowerCase();
  if (ss_().getSheetByName(PREF + 'Usuarios')) {
    const x = read_('Usuarios').find(function (r) { return str_(r.Email).toLowerCase() === correo && str_(r.Activo).toUpperCase() !== 'NO'; });
    if (x) { const rol = str_(x.Rol).toUpperCase(); return ROLES_ERP[rol] ? rol : null; }
  }
  const ac = _accesoDeCorreo_(correo);
  if (ac && ac.areas.indexOf('erp') >= 0) return ac.capturar ? 'COMERCIAL' : 'CONSULTA';
  if (ses.rol === 'SOCIO') return 'DIRECCION';
  return null;
}
function usuarioDe_(ses) {
  const rol = rolDe(ses);
  if (!rol) throw new Error('Sin autorizacion para esta accion.');
  let nombre = ses.correo;
  if (ss_().getSheetByName(PREF + 'Usuarios')) {
    const x = read_('Usuarios').find(function (r) { return str_(r.Email).toLowerCase() === String(ses.correo).toLowerCase(); });
    if (x && str_(x.Nombre)) nombre = str_(x.Nombre);
  }
  return { email: String(ses.correo).toLowerCase(), nombre: nombre, rol: rol };
}

// ==================== PRODUCCION (BASE) Y VENTAS (dashboard) ====================
function a_catalogosProd(u) {
  needAny_(u, ['prod', 'odp', 'odp_ver', 'crm']);
  const c = _leerCatalogos_(), out = {};
  ['MAQUINA', 'PROCESO', 'MATERIAL', 'UNIDAD', 'ORIGEN', 'MOTIVO_PARO', 'TURNO', 'OPERADOR', 'ACABADO', 'REIMPRESION', 'TIPO_PROYECTO', 'VENDEDOR']
    .forEach(function (k) { out[k] = c[k] || []; });
  out.IMPRESIONES = IMPRESIONES;
  return out;
}

function a_produccionODP(u, p) {
  need_(u, 'odp_ver');
  const o = mustFind_('ODP', 'Folio', p.Folio, 'ODP'); ownOr_(u, o);
  const rows = _leerBase_().filter(function (b) { return str_(b.orden) === str_(o.Folio); });
  const t = { cant: 0, merma: 0, horas: 0 };
  rows.forEach(function (b) { t.cant += b.cant; t.merma += b.merma; t.horas += b.horas; });
  return { rows: rows.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }), tot: { cant: r2_(t.cant), merma: r2_(t.merma), horas: r2_(t.horas) } };
}

/** Un renglon de produccion de una ODP: escribe en BASE (lo que lee el Dashboard) con la ODP en ORDEN. */
function a_registrarProduccion(u, p) {
  need_(u, 'prod');
  const o = odpActiva_(p.ODP);
  const d = {
    fecha: p.fecha || hoy_(), maquina: p.maquina, proceso: p.proceso, material: p.material, unidad: p.unidad, cant: p.cant,
    origen: p.origen || 'PLANTA', horas: p.horas, merma: p.merma, paro: p.paro, turno: p.turno, operador: p.operador,
    reimp: p.reimp || 'NO', nota: p.nota, acabado1: p.acabado1, acabado2: p.acabado2, acabado3: p.acabado3,
    orden: o.Folio, cliente: o.Cliente,
  };
  const r = _guardarTrabajoCore_(d, { correo: u.email });   // toma su propio candado
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    resetCache_();
    const oo = find_('ODP', 'Folio', o.Folio);
    if (oo && oo.Estatus === 'Abierta') update_('ODP', oo, { Estatus: 'En producción' });
    recalcODP_(o.Folio);   // tambien actualiza su renglon en VENTAS
  } finally { lock.releaseLock(); }
  return r;
}

/** Mantiene UN renglon en VENTAS por ODP (alta o actualizacion). Si algo falla no tumba al ERP: queda en BITACORA. */
function ventaSync_(folio) {
  try { ventaSyncCore_(folio); }
  catch (e) { try { _bitacora_('ERP', 'ERP_SYNC_ERROR', str_(folio) + ': ' + ((e && e.message) || e)); } catch (_) {} }
}

/** Produccion (BASE) y costo por tarifa de una ODP: lo que comparten VENTAS y el calculo de la ODP. */
function prodInfo_(o) {
  const f = str_(o.Folio);
  const cats = _leerCatalogos_(), tar = _leerTarifas_();
  const lineas = lineasDe_('ODPDetalle', 'ODP', f);
  const base = _leerBase_().filter(function (b) { return str_(b.orden) === f; });
  const propias = base.filter(function (b) { return str_(b.origen).toUpperCase() !== 'MAQUILA'; });
  const m2 = function (b) { return /^M(T)?2$/i.test(b.unidad); };

  // dominante por cantidad producida
  function dom(campo) {
    const g = {}; propias.forEach(function (b) { if (b[campo]) g[b[campo]] = (g[b[campo]] || 0) + b.cant; });
    let best = '', v = -1; Object.keys(g).forEach(function (k) { if (g[k] > v) { v = g[k]; best = k; } });
    return best;
  }
  const enCat = function (lista, v) { v = str_(v).toUpperCase(); return (lista || []).filter(function (x) { return String(x).toUpperCase() === v; })[0] || ''; };
  const maquina = dom('maquina') || enCat(cats.MAQUINA, (lineas[0] || {}).Maquina);
  let material = dom('material') || enCat(cats.MATERIAL, (lineas[0] || {}).Material);
  const m2p = num_(o.M2Vendidos);
  const prodM2 = propias.filter(m2).reduce(function (s, b) { return s + b.cant + b.merma; }, 0);
  const m2r = prodM2 > 0 ? r2_(prodM2) : 0;

  const obs = ['ERP'];
  let cMat = 0, cMerma = 0;
  const t = material ? _tarifaMat_(material, tar, cats) : null;
  if (t) { material = t.nombre; cMat = r2_(t.c * m2p); cMerma = r2_(t.c * Math.max(m2r - m2p, 0)); if (t.sinTarifa) obs.push('Material sin tarifa: costo de material y merma en cero.'); }
  else { material = '(NO REPORTADO)'; obs.push('Sin material: costo de material y merma en cero.'); }

  return { cats: cats, tar: tar, base: base, propias: propias, lineas: lineas, maquina: maquina, material: material, m2p: m2p, m2r: m2r, cMat: cMat, cMerma: cMerma, obs: obs };
}

function ventaSyncCore_(folio) {
  const o = find_('ODP', 'Folio', folio); if (!o) return;
  const f = str_(o.Folio);
  _limpiaCacheVentas_();
  const h = _hoja_(CFG.HOJA_VENTAS);
  const ventas = _leerVentas_();
  const ex = ventas.filter(function (v) { return str_(v.odp) === f; })[0];
  if (o.Estatus === 'Cancelada') { if (ex) { h.deleteRow(ex.fila); _limpiaCacheVentas_(); } return; }

  const info = prodInfo_(o);
  const cats = info.cats, tar = info.tar, base = info.base, maquina = info.maquina, material = info.material, m2p = info.m2p, m2r = info.m2r;
  const cMat = info.cMat, cMerma = info.cMerma, obs = info.obs;
  const enCat = function (lista, v) { v = str_(v).toUpperCase(); return (lista || []).filter(function (x) { return String(x).toUpperCase() === v; })[0] || ''; };
  const costos = read_('ODPCostos').filter(function (c) { return str_(c.ODP) === f; });
  const suma = function (tipos) { return r2_(costos.filter(function (c) { return tipos.indexOf(c.Tipo) >= 0; }).reduce(function (s, c) { return s + num_(c.Importe); }, 0)); };
  const venta = r2_(ventaODP_(o));
  const facts = read_('Facturas').filter(function (x) { return str_(x.ODP) === f && x.Estatus !== 'Cancelada'; });
  const factura = facts.map(function (x) { return str_(x.FolioSAT) || str_(x.ID); }).join(' / ');
  const fFactura = facts.length ? facts.map(function (x) { return str_(x.Fecha); }).sort()[0] : '';
  const cobrado = facts.length > 0 && facts.every(function (x) { return num_(x.Saldo) <= 0.009; });

  let vendedor = enCat(cats.VENDEDOR, o.AgenteVentas);
  const us = read_('Usuarios').filter(function (x) { return str_(x.Email).toLowerCase() === str_(o.Comercial).toLowerCase(); })[0];
  if (!vendedor && us) vendedor = enCat(cats.VENDEDOR, us.Nombre);
  const tipoProy = enCat(cats.TIPO_PROYECTO, o.TipoProyecto);
  const fprod = base.length ? base.map(function (b) { return b.fecha; }).sort()[0] : '';
  const cliente = str_(o.Cliente).toUpperCase().replace(/\s+/g, ' ');
  const proyecto = str_(o.Proyecto) || str_(o.Descripcion);

  const campos = {};
  campos[CV.ODP] = f; campos[CV.CLIENTE] = cliente; campos[CV.TIPO_PROYECTO] = tipoProy; campos[CV.PROYECTO] = proyecto;
  campos[CV.MAQUINA] = maquina || '(NO REPORTADA)'; campos[CV.MATERIAL] = material;
  campos[CV.M2_PROYECTO] = m2p || ''; campos[CV.M2_REALES] = m2r || ''; campos[CV.VENTA] = venta > 0 ? venta : '';
  campos[CV.COSTO_MATERIAL] = cMat; campos[CV.COSTO_MERMA] = cMerma;
  campos[CV.MAQUILA] = suma(['Maquila']); campos[CV.INSTALACION] = suma(['Instalación']); campos[CV.MANO_OBRA] = suma(['Mano de obra']);
  campos[CV.HORAS_EXTRAS] = 0; campos[CV.OTROS] = suma(['Tinta/consumible', 'Otro']); campos[CV.CARGA_ADMIN] = r2_(tar.carga * m2p);
  campos[CV.FACTURA] = factura;
  campos[CV.ESTATUS_COBRO] = facts.length ? (cobrado ? 'COBRADO' : 'FACTURADO') : '';
  campos[CV.ESTATUS_MONTO] = venta > 0 ? 'CON MONTO' : 'PENDIENTE';

  if (ex) {
    const fila = h.getRange(ex.fila, 1, 1, CV_N - 1).getValues()[0];
    Object.keys(campos).forEach(function (k) { fila[k - 1] = campos[k]; });
    if (ex.tipo) fila[CV.TIPO_PROYECTO - 1] = ex.tipo;          // lo capturado a mano en el Dashboard se respeta
    if (ex.vendedor && !vendedor) fila[CV.VENDEDOR - 1] = ex.vendedor;
    if (vendedor) fila[CV.VENDEDOR - 1] = vendedor;
    if (fprod) fila[CV.FECHA_PROD - 1] = _aDate_(fprod);
    fila[CV.FECHA_FACTURA - 1] = fFactura ? _aDate_(fFactura) : '';
    fila[CV.CELDA_ORIGEN - 1] = fila[CV.CELDA_ORIGEN - 1] || 'ERP';
    h.getRange(ex.fila, 1, 1, CV_N - 1).setValues([fila]);
  } else {
    const fecha = str_(o.Fecha) || hoy_();
    const lunes = _semanaDe_(fecha), etiqueta = _etiquetaSemana_(lunes, ventas);
    let maxId = 0; ventas.forEach(function (v) { if (v.id > maxId) maxId = v.id; });
    const reng = []; for (let c = 0; c < CV_N; c++) reng.push('');
    Object.keys(campos).forEach(function (k) { reng[k - 1] = campos[k]; });
    reng[CV.ID - 1] = maxId + 1; reng[CV.FECHA_VENTA - 1] = _aDate_(fecha); reng[CV.SEM_INICIO - 1] = _aDate_(lunes); reng[CV.SEMANA - 1] = etiqueta;
    reng[CV.FECHA_PROD - 1] = fprod ? _aDate_(fprod) : ''; reng[CV.FECHA_FACTURA - 1] = fFactura ? _aDate_(fFactura) : '';
    reng[CV.VENDEDOR - 1] = vendedor; reng[CV.CELDA_ORIGEN - 1] = 'ERP'; reng[CV.OBS_MIGRACION - 1] = obs.join(' ');
    const nueva = h.getLastRow() + 1;
    h.getRange(nueva, 1, 1, CV_N).setValues([reng]);
    [CV.FECHA_VENTA, CV.SEM_INICIO, CV.FECHA_PROD, CV.FECHA_FACTURA].forEach(function (c) { h.getRange(nueva, c).setNumberFormat('dd/mm/yyyy'); });
    h.getRange(nueva, CV.MERMA_PCT).setFormula(_formulaMerma_(nueva));
    h.getRange(nueva, CV.MERMA_PCT).setNumberFormat('0.00%');
  }
  _limpiaCacheVentas_();
}

/** Carga los datos iniciales (ErpDatos.gs). Una hoja que ya tiene datos no se toca; los usuarios se agregan si faltan. */
function importar() {
  asegura_(); resetCache_();
  const D = (typeof ERP_DATOS === 'undefined') ? null : ERP_DATOS;
  if (!D) throw new Error('Falta el archivo ErpDatos.gs en el proyecto.');
  const out = [];
  const usuarios = read_('Usuarios').map(function (x) { return str_(x.Email).toLowerCase(); });
  let nu = 0;
  (D.Usuarios || []).forEach(function (u) { if (usuarios.indexOf(str_(u.Email).toLowerCase()) < 0) { insert_('Usuarios', u); nu++; } });
  out.push('Usuarios: ' + nu + ' agregados');
  ['Clientes', 'Proveedores', 'Materiales', 'Compras', 'Facturas'].forEach(function (n) {
    const filas = D[n] || [];
    if (read_(n).length) { out.push(n + ': ya tenía datos, no se tocó'); return; }
    insertMany_(n, filas); resetCache_();
    out.push(n + ': ' + filas.length + ' cargados');
  });
  let nc = 0;
  Object.keys(D.Config || {}).forEach(function (k) {
    const v = D.Config[k], r = find_('Config', 'Clave', k);
    if (r) { if (k.indexOf('SEQ_') === 0 || k.indexOf('CONSEC_') === 0) { if (num_(v[0]) > num_(r.Valor)) { update_('Config', r, { Valor: v[0] }); nc++; } } else if (str_(r.Valor) === '' || k === 'EMPRESA') { update_('Config', r, { Valor: v[0] }); nc++; } }
    else { insert_('Config', { Clave: k, Valor: v[0], Descripcion: v[1] }); nc++; }
  });
  out.push('Parámetros ajustados: ' + nc);
  return out.join('\n');
}

/** Vuelve a calcular y reescribir en VENTAS todas las ODP (menu: util tras cambiar tarifas o catalogos). */
function resincronizar() {
  let n = 0;
  read_('ODP').forEach(function (o) { recalcODP_(o.Folio); n++; });
  return n;
}

// ==================== EJECUCION ====================
const LECTURAS = { cotCalcular: 1, tarifas: 1, init: 1, lookups: 1, dashboard: 1, clientes: 1, proveedores: 1, materiales: 1, kardex: 1, conteos: 1, compras: 1, compraDetalle: 1,
  cotizaciones: 1, cotDetalle: 1, seguimiento: 1, odps: 1, odpDetalle: 1, facturas: 1, facturaDetalle: 1, reporteVentas: 1, usuarios: 1, config: 1,
  pdfCot: 1, pdfODP: 1, catalogosProd: 1, produccionODP: 1 };
const SIN_CANDADO = { registrarProduccion: 1 };

function run(action, p, ses) {
  const fn = ACTIONS[action];
  if (!fn) throw new Error('Acción desconocida: ' + action);
  const lock = LockService.getScriptLock();
  const usa = !SIN_CANDADO[action];
  if (usa) lock.waitLock(30000);
  try {
    resetCache_();
    asegura_();
    return fn(usuarioDe_(ses), p || {});
  } finally { if (usa) { try { lock.releaseLock(); } catch (_) {} } }
}

function correoRegistrado(correo) {
  if (!ss_().getSheetByName(PREF + 'Usuarios')) return false;
  correo = String(correo || '').toLowerCase();
  return read_('Usuarios').some(function (r) { return str_(r.Email).toLowerCase() === correo && str_(r.Activo).toUpperCase() !== 'NO'; });
}

return { run: run, instalar: instalar, importar: importar, rolDe: rolDe, correoRegistrado: correoRegistrado, resincronizar: resincronizar, esLectura: function (a) { return !!LECTURAS[a]; } };
})();

// ==================== PUNTOS DE ENTRADA (fuera de ERP) ====================
/* Desde la intranet. `clave` = sesion por codigo. Devuelve JSON {ok,data|error}. */
function erpApi(accion, payloadJson, clave) {
  try {
    var ses = _ses_(clave, !ERP.esLectura(String(accion)));
    if (!ERP.rolDe(ses)) { _bitacora_(ses.correo, 'ACCESO_NEGADO', 'erp ' + accion); throw new Error('Sin autorizacion para esta accion.'); }
    var p = payloadJson ? JSON.parse(payloadJson) : {};
    return JSON.stringify({ ok: true, data: ERP.run(String(accion), p || {}, ses) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: (e && e.message) || String(e) });
  }
}

/* Menu Produccion > ERP: crea o repara las hojas ERP_*. */
function erpInstalar() {
  var msg = ERP.instalar();
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* sin interfaz */ }
  return msg;
}
function erpImportarDatos() {
  var msg = ERP.importar();
  try { SpreadsheetApp.getUi().alert('Importación del ERP\n\n' + msg); } catch (e) { /* sin interfaz */ }
  return msg;
}
function erpResincronizar() {
  var n = ERP.resincronizar();
  try { SpreadsheetApp.getUi().alert('Se actualizaron ' + n + ' ODP en VENTAS.'); } catch (e) { /* sin interfaz */ }
  return n;
}
