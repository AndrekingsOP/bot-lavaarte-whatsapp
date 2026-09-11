const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyRY5VDZFm3EgSmeMFec6DyDE5X2-Jsv26KZn8iya7OPbrmoNxz-Z2ByuBnGTXF3zXS/exec';
const ID_GRUPO_LAVAARTE = '120363044348453055@g.us';

// DICCIONARIO DE HOTELES + CONTROL DE RUTAS
const HOTELES_CANAL = {
  'ruta oriente': 'RUTA ORIENTE',
  'ruta norte': 'RUTA NORTE',
  'wyndham': 'WYNDHAM',
  'whymdam': 'WYNDHAM',
  'whymd': 'WYNDHAM',
  'wyndam': 'WYNDHAM',
  'windham': 'WYNDHAM',
  'whindham': 'WYNDHAM',
  'whynham': 'WYNDHAM',
  'whimdam': 'WYNDHAM',
  'wynd': 'WYNDHAM',
  'whym': 'WYNDHAM',
  'oceania': 'OCEANIA',
  'oceana': 'OCEANIA',
  'oceani': 'OCEANIA',
  'hilton': 'HILTON',
  'hampton': 'HAMPTON',
  'fontana': 'FONTANA',
  'dann': 'DANN',
  'suite': 'SUITE',
  'virrey': 'VIRREY',
  'andes plaza': 'ANDES PLAZA',
  'andes': 'ANDES PLAZA',
  'bogota plaza': 'BOGOTÁ PLAZA',
  'bogota p': 'BOGOTÁ PLAZA',
  'almacen': 'ALMACÉN CENTRAL'
};

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Lavaarte OS', 'Chrome', '1.0.0'],
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- ESCANEA ESTE CÓDIGO QR ---');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = statusCode !== DisconnectReason.loggedOut;
      if (debeReconectar) setTimeout(() => iniciarBot(), 3000);
    } else if (connection === 'open') {
      console.log('\n======================================================');
      console.log('🛡️ PUENTE LAVAARTE ACTIVO - NÓMINA + LOGÍSTICA HOTELES');
      console.log(`Canal exclusivo: ${ID_GRUPO_LAVAARTE}`);
      console.log('======================================================\n');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m.message) return;

    const jid = m.key.remoteJid;
    if (jid !== ID_GRUPO_LAVAARTE) return;

    const texto = m.message.conversation || 
                  m.message.extendedTextMessage?.text || 
                  m.message.imageMessage?.caption || "";
                  
    if (!texto.trim()) return;

    const textoNorm = texto.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim();

    // 1. FILTRO DE EXCLUSIÓN TOTAL
    if (textoNorm.includes('almuerzo') || textoNorm.includes('almorzar') || textoNorm.includes('organizar') || textoNorm.includes('cerrar caja') || textoNorm.includes('entregarla')) {
      return;
    }

    // 2. EXTRACCIÓN DE FECHA Y HORA (TIEMPO REAL BOGOTÁ)
    const ahora = new Date();
    let horaCalculada = ahora.toLocaleTimeString('en-US', { timeZone: 'America/Bogota', hour12: true });
    const fechaCalculada = ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });

    const matchHora = textoNorm.match(/(?:a las\s*)?(\b\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
    if (matchHora && (matchHora[2] !== undefined || matchHora[3] !== undefined || textoNorm.includes('hora') || textoNorm.includes(' a las '))) {
      let hh = parseInt(matchHora[1], 10);
      let mm = matchHora[2] ? matchHora[2] : "00";
      let mod = matchHora[3] ? matchHora[3].replace(/\./g, '') : "";

      if (hh <= 24) {
        if (!mod) {
          if (hh >= 1 && hh <= 11 && (textoNorm.includes('tarde') || textoNorm.includes('salida') || (hh >= 1 && hh <= 5))) mod = "pm";
          else if (hh >= 6 && hh <= 11) mod = "am";
          else if (hh >= 12) mod = "pm";
          else mod = "am";
        }
        if (mod === "pm" && hh < 12) hh += 12;
        if (mod === "am" && hh === 12) hh = 0;

        const ampm = hh >= 12 ? 'PM' : 'AM';
        const hh12 = hh % 12 === 0 ? 12 : hh % 12;
        const hhStr = hh12 < 10 ? `0${hh12}` : `${hh12}`;
        horaCalculada = `${hhStr}:${mm}:00 ${ampm}`;
      }
    }

    const remitenteRaw = m.key.participant || m.participant || "";
    let remitenteTel = remitenteRaw.split('@')[0].replace(/\D/g, '');
    if (remitenteTel.length > 10) remitenteTel = remitenteTel.slice(-10);
    const pushName = m.pushName || "Colaborador";

    // =========================================================================
    // CASO A: LOGÍSTICA DE HOTELES Y RUTAS (LLEGADA / SALIDA)
    // =========================================================================
    let hotelDetectado = null;
    for (const [clave, nombreOficial] of Object.entries(HOTELES_CANAL)) {
      if (textoNorm.includes(clave)) {
        hotelDetectado = nombreOficial;
        break;
      }
    }

    if (hotelDetectado) {
      const esSalida = ['salida', 'saliendo', 'me voy', 'despachado', 'fin', 'termino', 'terminamos', 'finaliza', 'finalizada'].some(p => textoNorm.includes(p));
      const tipoEvento = esSalida ? "SALIDA" : "LLEGADA";

      console.log(`🏨 Logística/Ruta: [${hotelDetectado}] | ${tipoEvento} | Hora: ${horaCalculada} | Por: ${pushName}`);

      try {
        await axios.post(APPS_SCRIPT_URL, {
          canal: "LOGISTICA_HOTELES",
          hotel: hotelDetectado,
          tipo: tipoEvento,
          hora: horaCalculada,
          fecha: fechaCalculada,
          telefono: remitenteTel,
          push_name: pushName,
          mensaje_raw: texto
        });
      } catch (err) {
        console.error('Error enviando logística:', err.message);
      }
      return;
    }

    // =========================================================================
    // CASO B: ASISTENCIA Y NÓMINA (FILTRADO POR TELÉFONO O CÓDIGO)
    // =========================================================================
    const palabrasEntrada = ['ingreso', 'entrada', 'llegue', 'llego', 'buenos dias', 'buen dia', 'iniciando', 'inicio turno', 'presente', 'reporto entrada', 'reparto entrada', 'reporte entrada'];
    const palabrasSalida = ['salida', 'me voy', 'chao', 'hasta manana', 'fin turno', 'termino', 'saliendo', 'salgo', 'termine', 'reporto salida', 'reparto salida', 'reporte salida'];

    const esEntrada = palabrasEntrada.some(p => textoNorm.includes(p));
    const esSalida = palabrasSalida.some(p => textoNorm.includes(p));

    if (!esEntrada && !esSalida) return;

    let tipoMov = esSalida ? "SALIDA" : "INGRESO";

    let codigoManual = "";
    const matchCodigo = textoNorm.match(/(?:codigo|cod|id)?\s*(\b\d{1,3}\b)/);
    if (matchCodigo && !textoNorm.includes(' a las ') && matchCodigo[1].length <= 3) {
      codigoManual = matchCodigo[1];
    }

    let textoLimpio = textoNorm
      .replace(/buenos dias|buen dia|reporto entrada|reporto salida|reparto entrada|reparto salida|reporto|reparto|reporte|ingreso|entrada|salida|hora|de|a las|am|pm|\b\d{1,2}:\d{2}\b/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    let nombreObjetivo = "";
    const muletillas = ['hoy', 'tarde', 'temprano', 'ya', 'listo', 'aqui', 'turno', 'planta'];
    const palabras = textoLimpio.split(/\s+/).filter(w => w.length >= 3 && !muletillas.includes(w));
    if (palabras.length > 0) {
      nombreObjetivo = palabras[0].toUpperCase();
    }

    const obs = `Marcaje WhatsApp (${pushName}) | "${texto}"`;
    console.log(`👤 Asistencia: ${tipoMov} | Hora: ${horaCalculada} | Cel: ${remitenteTel} | CodManual: ${codigoManual || 'N/A'}`);

    try {
      await axios.post(APPS_SCRIPT_URL, {
        canal: "NOMINA",
        telefono: remitenteTel,
        codigo_manual: codigoManual,
        nombre: nombreObjetivo,
        push_name: pushName,
        tipo: tipoMov,
        hora: horaCalculada,
        fecha: fechaCalculada,
        observaciones: obs
      });
    } catch (err) {
      console.error('Error enviando nómina:', err.message);
    }
  });
}

iniciarBot();