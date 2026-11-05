/* =====================================================================
   MIGRACION DE PROPIETARIO (de un correo a otro)
   =====================================================================
   Archivo NUEVO: en Apps Script crea un archivo de secuencia de comandos llamado "Migracion" y pega esto.
   Menu "Migracion de propietario" del Sheet:
     1. Diagnostico ............ que hay que mover o revisar (corre en la cuenta ACTUAL, antes de migrar)
     2. Compartir archivos ..... da acceso a la carpeta de Marketing a la cuenta NUEVA (cuenta ACTUAL)
     3. Reubicar archivos ...... copia a la carpeta de la cuenta nueva los archivos de Marketing (cuenta NUEVA, en la copia)
     4. Cambiar un correo ...... reemplaza el correo viejo por el nuevo en las hojas, con vista previa (cuenta NUEVA)
   Nada se borra: el original queda intacto hasta que tu decidas. */

function _migUi_() { return SpreadsheetApp.getUi(); }

function _migPide_(titulo, texto) {
  var r = _migUi_().prompt(titulo, texto, _migUi_().ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== _migUi_().Button.OK) { return ''; }
  return String(r.getResponseText() || '').trim().toLowerCase();
}

/* 1. Diagnostico */
function migracionDiagnostico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), L = [];
  var duenio = '(no se pudo leer)';
  try { duenio = DriveApp.getFileById(ss.getId()).getOwner().getEmail(); } catch (e) { /* sin permiso */ }
  L.push('Propietario del archivo: ' + duenio);
  L.push('Cuenta que ejecuta este codigo: ' + Session.getEffectiveUser().getEmail());
  L.push('URL publica de la app: ' + _urlPublica_());
  L.push('URL_APP fija en Code.gs: ' + (URL_APP || '(vacia)') + (URL_APP && URL_APP !== _urlPublica_() ? '  <- DISTINTA de la actual: actualizala' : ''));
  L.push('ROLES.ADMIN en Code.gs: ' + (ROLES.ADMIN || []).join(', '));
  L.push('ROLES.MASTER en Code.gs: ' + (ROLES.MASTER || []).join(', '));
  var props = PropertiesService.getScriptProperties().getKeys();
  L.push('Propiedades del script (no se copian al "Hacer una copia"): ' + props.length);
  L.push('  -> La firma de sesiones se regenera sola: todos tendran que volver a pedir su codigo.');
  var tr = ScriptApp.getProjectTriggers(); L.push('Activadores (triggers): ' + tr.length + (tr.length ? '  <- hay que recrearlos en la cuenta nueva' : ''));
  try {
    var fid = PropertiesService.getScriptProperties().getProperty('MKT_CARPETA');
    if (fid) { var f = DriveApp.getFolderById(fid), n = 0, it = f.getFiles(); while (it.hasNext()) { it.next(); n++; } L.push('Carpeta de Marketing: ' + f.getName() + ' (' + n + ' archivos)'); }
    else { L.push('Carpeta de Marketing: aun no se creo.'); }
  } catch (e2) { L.push('Carpeta de Marketing: no se pudo leer (' + e2.message + ')'); }
  var h = ss.getSheetByName('MKT_ARCHIVOS'); L.push('Archivos registrados en MKT_ARCHIVOS: ' + (h ? Math.max(0, h.getLastRow() - 1) : 0));
  var q = 0; try { q = MailApp.getRemainingDailyQuota(); } catch (e3) { /* nada */ }
  L.push('Correos que puede enviar hoy esta cuenta: ' + q + ' (Gmail personal ~100, Workspace ~1500)');
  _migUi_().alert('Diagnostico de migracion', L.join('\n'), _migUi_().ButtonSet.OK);
  return L;
}

/* 2. Compartir la carpeta de Marketing con la cuenta nueva (corre en la cuenta ACTUAL) */
function migracionCompartirArchivos() {
  var correo = _migPide_('Compartir archivos de Marketing', 'Correo de la cuenta NUEVA (queda como editor de la carpeta):');
  if (!correo) { return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { _migUi_().alert('Correo no valido.'); return; }
  var fid = PropertiesService.getScriptProperties().getProperty('MKT_CARPETA');
  if (!fid) { _migUi_().alert('Marketing todavia no tiene carpeta de archivos: no hay nada que compartir.'); return; }
  var f = DriveApp.getFolderById(fid); f.addEditor(correo);
  _migUi_().alert('Listo. ' + correo + ' ya es editor de «' + f.getName() + '». Ahora, en la copia, corre "Reubicar archivos".');
}

/* 3. Copiar los archivos de Marketing a la carpeta de la cuenta nueva (corre en la COPIA, con la cuenta NUEVA). Se puede repetir. */
function migracionReubicarArchivos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), h = ss.getSheetByName('MKT_ARCHIVOS');
  if (!h || h.getLastRow() < 2) { _migUi_().alert('No hay archivos de Marketing registrados.'); return; }
  var carpeta = _mktCarpeta_(), idCarpeta = carpeta.getId();
  var enc = MKT_HOJAS.MKT_ARCHIVOS, cD = enc.indexOf('DRIVE_ID') + 1, cN = enc.indexOf('NOMBRE') + 1;
  var n = h.getLastRow() - 1, v = h.getRange(2, 1, n, enc.length).getValues();
  var ok = 0, ya = 0, falla = [], t0 = new Date().getTime();
  for (var i = 0; i < v.length; i++) {
    if (new Date().getTime() - t0 > 270000) { falla.push('Se agoto el tiempo: vuelve a correr la opcion para continuar.'); break; }
    var id = String(v[i][cD - 1]);
    if (!id) { continue; }
    try {
      var f = DriveApp.getFileById(id), padres = f.getParents(), propio = false;
      while (padres.hasNext()) { if (padres.next().getId() === idCarpeta) { propio = true; } }
      if (propio) { ya++; continue; }
      var c = f.makeCopy(String(v[i][cN - 1]) || f.getName(), carpeta);
      h.getRange(i + 2, cD).setNumberFormat('@').setValue(c.getId()); ok++;
    } catch (e) { falla.push(String(v[i][cN - 1]) + ': ' + e.message); }
  }
  _migUi_().alert('Archivos copiados: ' + ok + '\nYa estaban en tu carpeta: ' + ya + '\nCon problema: ' + falla.length + (falla.length ? '\n\n' + falla.slice(0, 8).join('\n') : ''));
}

/* 4. Reemplazar un correo por otro en las hojas (vista previa y luego aplica). Solo celdas cuyo contenido ES el correo (o una lista con ese correo). */
function _migReemplazaCorreo_(ss, viejo, nuevo, aplicar) {
  var hojas = ss.getSheets(), cuenta = {}, total = 0;
  var re = new RegExp('(^|[\\s,;])' + viejo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s,;])', 'ig');
  for (var s = 0; s < hojas.length; s++) {
    var h = hojas[s], nom = h.getName();
    if (nom === 'BASE' || nom === 'VENTAS') { continue; }   /* son datos de produccion: no llevan correos */
    var nf = h.getLastRow(), nc = h.getLastColumn();
    if (nf < 1 || nc < 1) { continue; }
    var rg = h.getRange(1, 1, nf, nc), v = rg.getValues(), cambio = false;
    for (var i = 0; i < v.length; i++) {
      for (var j = 0; j < v[i].length; j++) {
        var x = v[i][j];
        if (typeof x === 'string' && x.toLowerCase().indexOf(viejo) >= 0) {
          var y = x.replace(re, function (m, pre) { return pre + nuevo; });
          if (y !== x) { cuenta[nom] = (cuenta[nom] || 0) + 1; total++; if (aplicar) { v[i][j] = y; cambio = true; } }
        }
      }
    }
    if (aplicar && cambio) { rg.setValues(v); }
  }
  return { total: total, porHoja: cuenta };
}

function migracionCambiarCorreo() {
  var viejo = _migPide_('Cambiar un correo', 'Correo VIEJO (el que se va a reemplazar):');
  if (!viejo) { return; }
  var nuevo = _migPide_('Cambiar un correo', 'Correo NUEVO:');
  if (!nuevo || nuevo === viejo) { return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), p = _migReemplazaCorreo_(ss, viejo, nuevo, false);
  var det = Object.keys(p.porHoja).map(function (k) { return '  ' + k + ': ' + p.porHoja[k]; }).join('\n');
  if (!p.total) { _migUi_().alert('No encontre «' + viejo + '» en ninguna hoja.'); return; }
  var r = _migUi_().alert('Vista previa', 'Se reemplazara «' + viejo + '» por «' + nuevo + '» en ' + p.total + ' celdas:\n' + det + '\n\n¿Aplicar?', _migUi_().ButtonSet.YES_NO);
  if (r !== _migUi_().Button.YES) { return; }
  var q = _migReemplazaCorreo_(ss, viejo, nuevo, true);
  _limpiaCacheCatalogos_();
  _migUi_().alert('Hecho: ' + q.total + ' celdas actualizadas.\nRecuerda cambiar tambien ROLES.ADMIN / ROLES.MASTER en Code.gs (estan en el codigo, no en las hojas).');
}
