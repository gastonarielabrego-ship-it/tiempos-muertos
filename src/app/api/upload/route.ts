import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No se recibio ningun archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamic import for xlsx (only on server)
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El archivo esta vacio' }, { status: 400 });
    }

    // Auto-detect column mappings
    const headers = Object.keys(rows[0]);
    console.log('[upload] Headers:', headers);

    const colMap: Record<string, string> = {};

    // Map headers to fields - case insensitive
    const headerLower = headers.map(h => h.toLowerCase().trim());
    for (const [field, aliases] of [
      ['codUti', ['coduti', 'cod_uti', 'codigo', 'codigouti', 'legajo', 'cod operator', 'cod operador']],
      ['nomUti', ['nomuti', 'nom_uti', 'nombre', 'nombreuti', 'nombre uti', 'nom operator', 'nom operador', 'apellidos y nombres', 'apellido y nombre', 'ayn']],
      ['fecha', ['fecha', 'date', 'dia']],
      ['hora', ['hora', 'hour', 'time', 'hora escaneo', 'horario', 'hora (arg)']],
      ['codAct', ['codact', 'cod_act', 'cod_actividad', 'actividad', 'codigo actividad']],
      ['zonSts', ['zonsts', 'zon_sts', 'zona', 'sector', 'ubicacion', 'zonast']],
      ['allSts', ['allsts', 'all_sts', 'allejadostatus', 'allestado', 'all_estado']],
      ['dplSts', ['dplsts', 'dpl_sts', 'desplegadostatus', 'dpl_estado', 'desplegado']],
      ['nivSts', ['nivsts', 'niv_sts', 'nivelstatus', 'niv_estado', 'nivel']],
      ['codPro', ['codpro', 'cod_pro', 'codigoproducto', 'codigo producto', 'ean', 'ean13', 'codigo', 'codproducto', 'producto']],
      ['pcbPro', ['pcbpro', 'pcb_pro', 'pcb', 'unidadespcb', 'cantidadpcb']],
      ['bultos', ['bultos', 'bulto', 'cajas', 'cantidad']],
    ] as [string, string[]][]) {
      for (const alias of aliases) {
        const idx = headerLower.indexOf(alias);
        if (idx !== -1) {
          colMap[field] = headers[idx];
          break;
        }
      }
    }

    console.log('[upload] Column mapping:', colMap);

    // Parse rows
    const records: Record<string, unknown>[] = [];
    for (const row of rows) {
      const getVal = (field: string): unknown => {
        const col = colMap[field];
        if (!col) return field === 'hora' ? '' : 0;
        const val = row[col];
        if (val === undefined || val === null || val === '') return field === 'hora' ? '' : 0;
        return val;
      };

      // Parse fecha
      let fechaVal: string;
      const rawFecha = getVal('fecha');
      if (typeof rawFecha === 'number') {
        const d = new Date((rawFecha - 25569) * 86400000);
        fechaVal = d.toISOString().split('T')[0];
      } else {
        const fStr = String(rawFecha);
        if (/^\d{4}-\d{2}-\d{2}/.test(fStr)) {
          fechaVal = fStr.split('T')[0];
        } else if (/^\d{2}\/\d{2}\/\d{4}/.test(fStr)) {
          const [d, m, y] = fStr.split('/');
          fechaVal = `${y}-${m}-${d}`;
        } else if (/^\d{2}-\d{2}-\d{4}/.test(fStr)) {
          const [d, m, y] = fStr.split('-');
          fechaVal = `${y}-${m}-${d}`;
        } else {
          const d = new Date(fStr);
          fechaVal = isNaN(d.getTime()) ? fStr : d.toISOString().split('T')[0];
        }
      }

      // Parse hora
      let horaVal = '';
      const rawHora = getVal('hora');
      if (rawHora && String(rawHora).trim()) {
        const hStr = String(rawHora).trim();
        if (typeof rawHora === 'number' || /^\d+\.\d+$/.test(hStr)) {
          const totalSeconds = Math.round(Number(hStr) * 86400);
          const h = Math.floor(totalSeconds / 3600);
          const m = Math.floor((totalSeconds % 3600) / 60);
          const s = totalSeconds % 60;
          horaVal = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } else if (/^\d{1,2}:\d{2}(:\d{2})?/.test(hStr)) {
          const parts = hStr.split(':');
          const h = String(parts[0]).padStart(2, '0');
          const m = String(parts[1]).padStart(2, '0');
          const s = parts[2] ? String(parts[2]).padStart(2, '0') : '00';
          horaVal = `${h}:${m}:${s}`;
        } else {
          const d = new Date(hStr);
          if (!isNaN(d.getTime())) {
            horaVal = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
          } else {
            horaVal = hStr;
          }
        }
      }

      records.push({
        codUti: String(getVal('codUti')),
        nomUti: String(getVal('nomUti')),
        fecha: fechaVal,
        hora: horaVal,
        codAct: Number(getVal('codAct')) || 0,
        zonSts: String(getVal('zonSts')) || null,
        allSts: Number(getVal('allSts')) || 0,
        dplSts: Number(getVal('dplSts')) || 0,
        nivSts: Number(getVal('nivSts')) || 0,
        codPro: String(getVal('codPro')),
        pcbPro: Number(getVal('pcbPro')) || 0,
        bultos: Number(getVal('bultos')) || 0,
      });
    }

    const withCodUti = records.filter(r => r.codUti && r.codUti.trim());
    if (withCodUti.length === 0) {
      return NextResponse.json({
        error: 'No se pudo mapear la columna de operador (codUti). Headers: ' + headers.join(', '),
      }, { status: 400 });
    }

    await db.scanRecord.deleteMany();
    const result = await db.scanRecord.createMany({ data: records });

    return NextResponse.json({
      totalRecords: withCodUti.length,
      inserted: result.count,
      columnMapping: colMap,
      sampleRecord: records[0],
      horaDetected: records.filter(r => r.hora && r.hora.trim()).length,
      horaMissing: records.filter(r => !r.hora || !r.hora.trim()).length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Error al procesar el archivo',
    }, { status: 500 });
  }
}