#!/usr/bin/env python3
"""Genera la hoja BASE de produccion (esquema 2, 20 columnas) a partir de la hoja
'BASE DE DATOS' del archivo de seguimiento. Un renglon por linea de proyecto.

Supuestos (todos quedan escritos en OBS_MIGRACION cuando aplican):
  - CANTIDAD   = M2 Proyecto (lo entregado); MERMA_MT2 = M2 reales - M2 proyecto.
  - FECHA      = fecha de PRODUCCION (el tablero de produccion mide produccion).
                 Si esa fecha es imposible, se usa la de venta y se avisa.
  - PROCESO    = se deduce de la maquina (Konica = gran formato, Mimaki = HD).
  - HORAS_MAQ  = columna 'Horas' del impresor; vacia si no se capturo.
  - REIMPRESION = 'SI' cuando el nombre del proyecto contiene REIMP.

Uso:  python3 migrar_produccion.py ARCHIVO_DE_PRODUCCION_2026.xlsx [salida.xlsx]
"""
import sys, re, datetime, collections, warnings
import openpyxl

warnings.filterwarnings('ignore')

ENCABEZADOS_BASE = [
    'ID', 'FECHA', 'SEM_INICIO', 'SEMANA', 'MAQUINA', 'PROCESO', 'MATERIAL',
    'UNIDAD', 'CANTIDAD', 'ORIGEN', 'CLIENTE_OT', 'HORAS_MAQ', 'MERMA_MT2',
    'MOTIVO_PARO', 'NOTA', 'CELDA_ORIGEN', 'OBS_MIGRACION',
    'TURNO', 'OPERADOR', 'REIMPRESION', 'ORDEN', 'ACABADOS_1', 'ACABADOS_2', 'ACABADOS_3'
]
VENTANA_INI = datetime.date(2025, 12, 29)   # lunes de la primera semana del archivo
SIN_OPERADOR = {'MAQUILA', 'SERIGRAFIA'}    # no son personas

# Errores de captura conocidos del archivo original: fila de Excel -> M2 correcto.
# VINIL ED271 traia 8250 m2 en lugar de 8.25 (la venta es de $3,135: a 8,250 m2
# saldrian $0.38 por m2). Los costos se recalculan con la misma formula del Excel.
CORRECCIONES_M2 = {135: 8.25, 136: 8.25}



def txt(v):
    return re.sub(r'\s+', ' ', str(v)).strip() if v not in (None, '') else ''


def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def lunes(d):
    return d - datetime.timedelta(days=d.weekday())


def etiqueta(l):
    return 'SEM %s-%s' % (l.strftime('%d/%m'), (l + datetime.timedelta(days=5)).strftime('%d/%m/%y'))


def proceso_y_unidad(maquina, impresor_tipo):
    m = maquina.upper()
    if 'SERIGRAFIA' in m:
        return 'SERIGRAFIA', 'PIEZA', 'Unidad supuesta (PIEZA): serigrafia no se mide en MT2.'
    if 'PLOTTER' in m:
        return 'CORTE DE VINIL', 'MT2', ''
    if 'MIMAKI' in m or 'ALTA RESOLUCION' in m:
        return 'IMPRESION HD', 'MT2', ''
    if 'KONICA' in m or 'GRAN FORMATO' in m:
        return 'IMPRESION GRAN FORMATO', 'MT2', ''
    return 'IMPRESION GRAN FORMATO', 'MT2', 'Maquina no reportada: proceso supuesto.'


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ruta = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else 'BASE_migracion.xlsx'
    hoy = datetime.date.today()
    tope = hoy + datetime.timedelta(days=7)

    ws = openpyxl.load_workbook(ruta, data_only=True)['BASE DE DATOS']
    crudas = []
    for xl, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if r[1] is not None:
            crudas.append((xl, r))

    filas, omitidas, resumen = [], [], collections.Counter()
    for xl, r in crudas:
        m2 = num(r[13])
        if not m2 or m2 <= 0:
            omitidas.append((xl, txt(r[10]), 'sin M2 de proyecto'))
            continue
        fv, fp = r[1].date(), (r[2].date() if r[2] else None)
        obs = []
        if xl in CORRECCIONES_M2 and m2 != CORRECCIONES_M2[xl]:
            obs.append('M2 corregido de %g a %g (error de captura).' % (m2, CORRECCIONES_M2[xl]))
            m2 = CORRECCIONES_M2[xl]
            resumen['m2_corregido'] += 1

        # ---- fecha: la de produccion si es plausible ------------------------
        ok = lambda d: d is not None and VENTANA_INI <= d <= tope
        if ok(fp):
            fecha = fp
        elif ok(fv):
            fecha = fv
            obs.append('Fecha de produccion imposible (%s): se uso la de venta.' %
                       (fp.strftime('%d/%m/%Y') if fp else 'vacia'))
            resumen['fecha_de_venta'] += 1
        else:
            fecha = fp or fv
            obs.append('Ninguna fecha es plausible (%s): revisar a mano.' % fecha.strftime('%d/%m/%Y'))
            resumen['fecha_dudosa'] += 1

        impresor = txt(r[36])
        maquina = txt(r[11]) or '(NO REPORTADA)'
        proceso, unidad, nota_proc = proceso_y_unidad(txt(r[11]), impresor)
        if nota_proc:
            obs.append(nota_proc)
            resumen['proceso_supuesto'] += 1
        origen = 'MAQUILA' if (impresor.upper() == 'MAQUILA' or (num(r[18]) or 0) > 0) else 'PROPIO'

        reales = num(r[14])
        merma = 0.0
        if unidad == 'MT2' and reales is not None:
            if reales < m2:
                obs.append('M2 reales menores al proyecto: merma en cero.')
                resumen['merma_negativa'] += 1
            else:
                merma = round(reales - m2, 4)
        horas = num(r[37])
        horas = horas if horas and horas > 0 else None

        nombre = txt(r[10])
        reimp = 'SI' if re.search(r'reimp', nombre, re.I) else 'NO'
        nota = ('Reimpresion segun el nombre del proyecto: ' + nombre) if reimp == 'SI' else ''
        resumen['reimp'] += reimp == 'SI'

        operador = '' if impresor.upper() in SIN_OPERADOR else impresor.title()
        ref = txt(r[4]) or txt(r[5])
        cliente_ot = (nombre + (' / ' + ref if ref else ''))[:120]

        l = lunes(fecha)
        filas.append([
            None, fecha, l, etiqueta(l), maquina, proceso,
            txt(r[12]) or '(NO REPORTADO)', unidad, round(m2, 4), origen, cliente_ot,
            horas, merma if merma > 0 else None, '', nota,
            'BASE DE DATOS!B%d' % xl, ' '.join(obs), '', operador, reimp, ref, '', '', ''
        ])

    filas.sort(key=lambda f: (f[1], f[15]))
    for i, f in enumerate(filas, start=1):
        f[0] = i

    # ---- conciliacion ---------------------------------------------------------
    esperado = sum(CORRECCIONES_M2.get(xl, num(r[13]) or 0) for xl, r in crudas if (num(r[13]) or 0) > 0)
    obtenido = sum(f[8] for f in filas)
    ok_m2 = abs(esperado - obtenido) < 0.01

    # ---- libro de salida --------------------------------------------------------
    wb = openpyxl.Workbook()
    b = wb.active
    b.title = 'BASE'
    b.append(ENCABEZADOS_BASE)
    for f in filas:
        b.append(f)
    for fila in b.iter_rows(min_row=2):
        fila[1].number_format = 'dd/mm/yyyy'
        fila[2].number_format = 'dd/mm/yyyy'
    b.freeze_panes = 'A2'

    # catalogos que usa la captura; instalar() los fusiona en CATALOGOS sin pisar
    cats = collections.OrderedDict()
    cats['MAQUINA'] = sorted({f[4] for f in filas if f[4] != '(NO REPORTADA)'})
    cats['PROCESO'] = sorted({f[5] for f in filas} | {
        'LAMINADO / MONTAJE', 'INSTALACION', 'ENTREGA / RECOLECCION', 'ROTULACION'})
    cats['MATERIAL'] = sorted({f[6] for f in filas if f[6] != '(NO REPORTADO)'})
    cats['UNIDAD'] = sorted({f[7] for f in filas} | {'LAMINA', 'EVENTO'})
    cats['ORIGEN'] = ['PROPIO', 'MAQUILA']
    cats['OPERADOR'] = sorted({f[18] for f in filas if f[18]})
    cats['TURNO'] = ['MATUTINO', 'VESPERTINO', 'NOCTURNO']
    cats['REIMPRESION'] = ['SI', 'NO']
    cats['ACABADO'] = ['SOLO REFILADO', 'BARNIZ UV', 'OJILLOS', 'BASTILLA', 'BOLSA SIMPLE',
                       'COSTURA', 'BOLSA REFORZADA']
    cats['MOTIVO_PARO'] = ['FALLA DE MAQUINA', 'FALTA DE MATERIAL', 'MANTENIMIENTO',
                           'ESPERA DE AUTORIZACION', 'FALTA DE ENERGIA']
    c = wb.create_sheet('CATALOGOS_PRODUCCION')
    c.append(list(cats.keys()))
    for i in range(max(len(v) for v in cats.values())):
        c.append([v[i] if i < len(v) else None for v in cats.values()])
    wb.save(salida)

    # ---- reporte ----------------------------------------------------------------
    sem = collections.Counter(f[3] for f in filas)
    print('Renglones en BASE: %d de %d del Excel (omitidos: %d)' % (len(filas), len(crudas), len(omitidas)))
    for o in omitidas:
        print('   omitido fila Excel %d (%s): %s' % o)
    print('MT2/unidades: esperado %.2f | migrado %.2f | %s' % (esperado, obtenido, 'OK' if ok_m2 else 'NO CUADRA'))
    print('Semanas distintas: %d | maquila: %d | reimpresiones: %d' %
          (len(sem), sum(1 for f in filas if f[9] == 'MAQUILA'), resumen['reimp']))
    print('Fecha de produccion imposible -> usada la de venta: %d | sin fecha plausible: %d' %
          (resumen['fecha_de_venta'], resumen['fecha_dudosa']))
    print('Proceso supuesto (maquina no reportada): %d | merma negativa llevada a cero: %d' %
          (resumen['proceso_supuesto'], resumen['merma_negativa']))
    print('Con horas capturadas: %d de %d' % (sum(1 for f in filas if f[11]), len(filas)))
    print('Por proceso:', dict(collections.Counter(f[5] for f in filas)))
    print('Salida:', salida)
    if not ok_m2:
        sys.exit(2)


if __name__ == '__main__':
    main()
