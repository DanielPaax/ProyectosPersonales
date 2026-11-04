/* =====================================================================
   ADMINISTRACION DE LA INTRANET: invitaciones y permisos por area
   =====================================================================
   Archivo NUEVO: en Apps Script crea un archivo de secuencia de comandos llamado "Admin" y pega esto.
   Solo entran los correos de ROLES.ADMIN (Code.gs). Nadie mas: ni MASTER, ni la hoja ACCESOS, ni un enlace personal.

   Cada persona tiene una fila en la hoja ACCESOS. La columna PERMISOS guarda el NIVEL por area:
     0 sin acceso | 1 VER | 2 ESCRIBIR (crear registros) | 3 EDITAR (modificar y eliminar)
   Cada nivel incluye los anteriores. Dashboard BFp y ERP aceptan los 3 niveles; Direccion y Finanzas son de consulta.
   Talento Humano lo ve todo el mundo y no se asigna aqui.

   La invitacion es un correo con el enlace de la intranet: la persona escribe su correo, recibe un codigo de 6 digitos y entra.
   Cualquier correo con fila en ACCESOS puede pedir su codigo, sea o no de un dominio autorizado. */

var ADMIN_AREAS = [
  { id: 'dashboard', nombre: 'Dashboard BFp', max: 3, nota: 'Ver tablero · escribir: capturar trabajos y ventas · editar: corregir proyectos' },
  { id: 'direccion', nombre: 'Dirección', max: 1, nota: 'Solo consulta' },
  { id: 'finanzas', nombre: 'Finanzas', max: 1, nota: 'Solo consulta' },
  { id: 'erp', nombre: 'ERP', max: 3, nota: 'Ver · escribir: crear clientes, cotizaciones, ODP… · editar: modificar, cancelar y eliminar' }
];
var ADMIN_MAX_CORREOS = 20;
var ADMIN_NIVEL_TXT = { 1: 'Ver', 2: 'Ver y escribir', 3: 'Ver, escribir y editar' };

function _exigeAdmin_(ses) {
  if (!_esAdmin_(ses)) {
    _bitacora_(ses && ses.correo, 'ACCESO_NEGADO', 'administracion');
    throw new Error('Area desconocida.');   /* igual que un modulo que no existe */
  }
}

function _filaAcceso_(t, correo) {
  var k = String(correo).trim().toLowerCase();
  for (var i = 0; i < t.filas.length; i++) { if (String(t.filas[i].CORREO).trim().toLowerCase() === k) { return t.filas[i]; } }
  return null;
}

/* Todo lo que la pantalla necesita: personas con acceso, areas asignables, dominios y accesos definidos en el codigo. */
function adminListar(clave) {
  var ses = _ses_(clave);
  _exigeAdmin_(ses);
  _limpiaCacheCatalogos_();
  var ac = _leerAccesos_(), usuarios = [];
  for (var c in ac) {
    if (!ac.hasOwnProperty(c)) { continue; }
    var a = ac[c];
    usuarios.push({ correo: c, niveles: a.niveles, verVentas: a.verVentas, invitadoPor: a.invitadoPor, invitadoEn: a.invitadoEn,
                    ultimoAcceso: a.ultimoAcceso, notas: a.notas, estado: a.ultimoAcceso ? 'Activo' : 'Pendiente' });
  }
  usuarios.sort(function (x, y) { return x.correo < y.correo ? -1 : 1; });
  var codigo = [], listas = ['ADMIN', 'MASTER', 'SOCIOS', 'CAPTURA', 'VENTAS', 'DIRECCION', 'FINANZAS', 'DASHBOARD'];
  for (var l = 0; l < listas.length; l++) {
    var lst = ROLES[listas[l]] || [];
    for (var j = 0; j < lst.length; j++) { codigo.push({ correo: String(lst[j]).toLowerCase(), lista: listas[l] }); }
  }
  var cuota = 0; try { cuota = MailApp.getRemainingDailyQuota(); } catch (e) { cuota = 0; }
  return { yo: ses.correo, areas: ADMIN_AREAS, usuarios: usuarios, dominios: (ROLES.DOMINIOS || []).slice(), codigo: codigo, cuota: cuota,
           url: _urlPublica_() };
}

/* Limpia y valida los niveles: solo areas asignables, enteros de 0 a su maximo. */
function _limpiaNiveles_(niv) {
  var out = {};
  for (var i = 0; i < ADMIN_AREAS.length; i++) {
    var a = ADMIN_AREAS[i], v = Number(niv && niv[a.id]);
    if (!isFinite(v) || v < 0) { v = 0; }
    out[a.id] = Math.min(Math.floor(v), a.max);
  }
  return out;
}

function _correosDe_(txt) {
  var partes = String(Array.isArray(txt) ? txt.join(',') : (txt || '')).split(/[\s,;]+/), out = [], visto = {};
  for (var i = 0; i < partes.length; i++) {
    var c = partes[i].trim().toLowerCase();
    if (!c) { continue; }
    if (c.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) { throw new Error('"' + partes[i] + '" no es un correo válido.'); }
    if (!visto[c]) { visto[c] = true; out.push(c); }
  }
  return out;
}

function _enviaInvitacion_(correo, ses, niveles, verVentas, nota) {
  var url = _urlPublica_(), filas = '', texto = '';
  for (var i = 0; i < ADMIN_AREAS.length; i++) {
    var n = niveles[ADMIN_AREAS[i].id];
    if (n > 0) {
      filas += '<li><b>' + ADMIN_AREAS[i].nombre + '</b>: ' + ADMIN_NIVEL_TXT[n] + '</li>';
      texto += '- ' + ADMIN_AREAS[i].nombre + ': ' + ADMIN_NIVEL_TXT[n] + '\n';
    }
  }
  filas += '<li><b>Talento Humano</b>: Ver</li>'; texto += '- Talento Humano: Ver\n';
  if (verVentas) { filas += '<li>Puedes ver ventas y costos.</li>'; texto += '- Puedes ver ventas y costos.\n'; }
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#242191">' +
    '<div style="background:#0D3894;color:#fff;padding:16px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">Intranet BIG FOOT print</div>' +
    '<div style="border:1px solid #E1E7F4;border-top:none;border-radius:0 0 12px 12px;padding:22px">' +
    '<p style="margin:0 0 10px">Hola, <b>' + ses.correo + '</b> te invitó a la intranet de BIG FOOT print.</p>' +
    (nota ? '<p style="margin:0 0 10px;padding:10px 12px;background:#F3F6FC;border-radius:8px">' + String(nota).replace(/[<>&]/g, '') + '</p>' : '') +
    '<p style="margin:0 0 6px">Tu acceso:</p><ul style="margin:0 0 14px;padding-left:20px">' + filas + '</ul>' +
    '<p style="margin:0 0 14px"><a href="' + url + '" style="display:inline-block;background:#DF4A10;color:#fff;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:999px">Entrar a la intranet</a></p>' +
    '<p style="margin:0;font-size:13px;color:#5A6285">No necesitas contraseña: escribe este correo (<b>' + correo + '</b>) y te enviamos un código de 6 dígitos.</p>' +
    '</div></div>';
  MailApp.sendEmail({ to: correo, subject: 'Te invitaron a la Intranet BIG FOOT print', htmlBody: html,
    body: ses.correo + ' te invitó a la Intranet BIG FOOT print.\n\nTu acceso:\n' + texto + '\nEntra en ' + url + ' con este correo (' + correo + '): te enviamos un código de 6 dígitos.',
    name: 'Intranet BIG FOOT print', replyTo: ses.correo });
}

/* Invita (o cambia permisos). d = { correos, niveles:{area:nivel}, verVentas, notas, enviar }.
   Una persona nueva se agrega a ACCESOS; una existente conserva su fecha de invitacion y se le actualizan los permisos. */
function adminGuardar(d, clave) {
  var ses = _ses_(clave, true);
  _exigeAdmin_(ses);
  if (!d) { throw new Error('No llego nada que guardar.'); }
  var correos = _correosDe_(d.correos);
  if (!correos.length) { throw new Error('Escribe al menos un correo.'); }
  if (correos.length > ADMIN_MAX_CORREOS) { throw new Error('Máximo ' + ADMIN_MAX_CORREOS + ' correos por invitación.'); }
  var niveles = _limpiaNiveles_(d.niveles), verVentas = !!d.verVentas, enviar = !!d.enviar;
  var nota = String(d.notas || '').trim().slice(0, 300);
  var hay = false;
  for (var k in niveles) { if (niveles.hasOwnProperty(k) && niveles[k] > 0) { hay = true; } }
  if (!hay && !verVentas && enviar) { /* solo Talento Humano: se permite, la invitacion lo dice */ }
  var cuota = 0; try { cuota = MailApp.getRemainingDailyQuota(); } catch (e) { cuota = 0; }
  if (enviar && cuota < correos.length) { throw new Error('Hoy solo quedan ' + cuota + ' correos por enviar (límite diario de Google). Guarda sin enviar o espera a mañana.'); }
  var areasTxt = [];
  for (var i = 0; i < ADMIN_AREAS.length; i++) { if (niveles[ADMIN_AREAS[i].id] > 0) { areasTxt.push(ADMIN_AREAS[i].id); } }
  var cap = (niveles.dashboard >= 2 || niveles.erp >= 2) ? 'SI' : '';
  var ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var resultados = [];
  _conCandado_(function () {
    var t = _tablaI_('ACCESOS');
    for (var j = 0; j < correos.length; j++) {
      var c = correos[j], r = { correo: c, ok: true, nuevo: false, enviado: false, error: '' };
      if (_enLista_(ROLES.BLOQUEADOS || [], c)) { r.ok = false; r.error = 'Este correo está bloqueado en el código.'; resultados.push(r); continue; }
      if (_enLista_(ROLES.ADMIN || [], c)) { r.ok = false; r.error = 'Es administrador: no necesita permisos.'; resultados.push(r); continue; }
      var campos = { AREAS: areasTxt.join(', '), VER_VENTAS: verVentas ? 'SI' : '', CAPTURAR: cap, PERMISOS: _textoPermisos_(niveles) };
      if (nota) { campos.NOTAS = nota; }
      var fila = _filaAcceso_(t, c);
      if (fila) { _ponI_(t, fila._fila, campos); }
      else {
        r.nuevo = true;
        campos.CORREO = c; campos.INVITADO_POR = ses.correo; campos.INVITADO_EN = ahora; if (!campos.NOTAS) { campos.NOTAS = ''; }
        _agregaI_(t, campos);
        t = _tablaI_('ACCESOS');
      }
      _bitacora_(ses.correo, r.nuevo ? 'ADMIN_INVITA' : 'ADMIN_PERMISOS', c + ' | ' + _textoPermisos_(niveles) + (verVentas ? ' | ventas' : ''));
      if (enviar) {
        try { _enviaInvitacion_(c, ses, niveles, verVentas, nota); r.enviado = true; if (fila) { _ponI_(t, fila._fila, { INVITADO_EN: ahora }); } }
        catch (e) { r.error = 'Se guardó el acceso, pero el correo no salió: ' + String(e && e.message ? e.message : e).slice(0, 160); }
      }
      resultados.push(r);
    }
  });
  _limpiaCacheCatalogos_();
  return { resultados: resultados };
}

/* Quita a la persona de ACCESOS y cierra sus sesiones abiertas. Si su correo es de un dominio autorizado seguira pudiendo
   entrar con el acceso basico (Talento Humano). */
function adminRevocar(correo, clave) {
  var ses = _ses_(clave, true);
  _exigeAdmin_(ses);
  var c = String(correo || '').trim().toLowerCase(), dominio = false;
  _conCandado_(function () {
    var t = _tablaI_('ACCESOS'), f = _filaAcceso_(t, c);
    if (!f) { throw new Error('Ese correo no está en la lista de accesos.'); }
    t.h.deleteRow(f._fila);
  });
  _revocaSesiones_(c);
  _limpiaCacheCatalogos_();
  var d = c.slice(c.lastIndexOf('@') + 1), doms = ROLES.DOMINIOS || [];
  for (var i = 0; i < doms.length; i++) { if (String(doms[i]).toLowerCase() === d) { dominio = true; } }
  _bitacora_(ses.correo, 'ADMIN_QUITA', c);
  return { ok: true, dominio: dominio };
}

function adminReenviar(correo, clave) {
  var ses = _ses_(clave, true);
  _exigeAdmin_(ses);
  var c = String(correo || '').trim().toLowerCase();
  _limpiaCacheCatalogos_();
  var a = _accesoDeCorreo_(c);
  if (!a) { throw new Error('Ese correo no está en la lista de accesos.'); }
  var niv = {};
  for (var i = 0; i < ADMIN_AREAS.length; i++) { niv[ADMIN_AREAS[i].id] = a.niveles[ADMIN_AREAS[i].id] || 0; }
  _enviaInvitacion_(c, ses, niv, a.verVentas, '');
  var t = _tablaI_('ACCESOS'), f = _filaAcceso_(t, c);
  if (f) { _ponI_(t, f._fila, { INVITADO_EN: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') }); }
  _limpiaCacheCatalogos_();
  _bitacora_(ses.correo, 'ADMIN_REENVIA', c);
  return { ok: true };
}

function adminCerrarSesiones(correo, clave) {
  var ses = _ses_(clave, true);
  _exigeAdmin_(ses);
  var c = String(correo || '').trim().toLowerCase();
  if (!c) { throw new Error('Falta el correo.'); }
  _revocaSesiones_(c);
  _bitacora_(ses.correo, 'ADMIN_CIERRA_SESIONES', c);
  return { ok: true };
}
