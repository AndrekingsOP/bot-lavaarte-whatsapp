const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// Webhook de Apps Script para Nómina y Logística
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyRY5VDZFm3EgSmeMFec6DyDE5X2-Jsv26KZn8iya7OPbrmoNxz-Z2ByuBnGTXF3zXS/exec';
const ID_GRUPO_LAVAARTE = '120363044348453055@g.us';

// DICCIONARIO FLEXIBLE DE HOTELES (SIN TILDES NI MAYÚSCULAS)
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

process.on('uncaughtException', (err) => {
  console.log('⚠️ [PREVENCIÓN] Error mitigado:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.log('⚠️ [PREVENCIÓN] Rechazo mitigado:', reason);
});

function normalizarTexto(txt) {
  if (!txt) return "";
  return txt.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function iniciarBot() {
  console.log('🔄 Inicializando cliente Baileys...');
  
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys_v2');
  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
  } catch (e) {
    version = [2, 3000, 1015901307];
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Lavaarte OS', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    shouldIgnoreJid: () => false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
      console.log('\n======================================================');
      console.log('📱 CÓDIGO QR GENERADO: ' + qrImageUrl);
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 Conexión cerrada (${statusCode}). Reconectando: ${debeReconectar}`);
      if (debeReconectar) setTimeout(() => iniciarBot(), 4000);
      else setTimeout(() => iniciarBot(), 5000);
    } else if (connection === 'open') {
      console.log('\n======================================================');
      console.log('🛡️ PUENTE LAVAARTE ACTIVO - NÓMINA + LOGÍSTICA HOTELES');
      console.log(`📡 Escuchando exclusivamente en: ${ID_GRUPO_LAVAARTE}`);
      console.log('======================================================\n');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m || !m.message) return;

    const jid = m.key.remoteJid;
    if (jid !== ID_GRUPO_LAVAARTE) return;

    const texto = m.message.conversation || 
                  m.message.extendedTextMessage?.text || 
                  m.message.imageMessage?.caption || "";
                  
    if (!texto.trim()) return;

    const textoNorm = normalizarTexto(texto);

    // 1. FILTRO DE EXCLUSIÓN TOTAL: Almuerzos y notas operativas se ignoran
    if (textoNorm.includes('almuerzo') || textoNorm.includes('almorzar') || textoNorm.includes('refrigerio') || textoNorm.includes('organizar') || textoNorm.includes('cerrar caja') || textoNorm.includes('entregarla')) {
      return;
    }

    // 2. EXTRACCIÓN DE HORA
    const ahora = new Date();
    let horaCalculada = ahora.toLocaleTimeString('en-US', { timeZone: 'America/Bogota', hour12: true });
    const fechaCalculada = ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });

    // Detectar patrones como "8:15", "8:50 am", "a las 9", "10:30pm"
    const matchHora = textoNorm.match(/(?:a las\s*)?(\b\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
    let textoSinHora = textoNorm;

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

        // Retiramos la hora detectada para que ningún número de la hora sea confundido con un código de empleado
        textoSinHora = textoSinHora.replace(matchHora[0], ' ');
      }
    }

    const remitenteRaw = m.key.participant || m.participant || "";
    let remitenteTel = remitenteRaw.split('@')[0].replace(/\D/g, '');
    if (remitenteTel.length > 10) remitenteTel = remitenteTel.slice(-10);
    const pushName = m.pushName || "Colaborador";

    // =========================================================================
    // CANAL 1: LOGÍSTICA DE HOTELES Y RUTAS (LLEGADA / SALIDA)
    // =========================================================================
    let hotelDetectado = null;
    for (const [clave, nombreOficial] of Object.entries(HOTELES_CANAL)) {
      if (textoNorm.includes(clave)) {
        hotelDetectado = nombreOficial;
        break;
      }
    }

    if (hotelDetectado) {
      const esSalida = ['salida', 'saliendo', 'me voy', 'despachado', 'fin', 'termino', 'terminamos', 'finaliza', 'finalizada', 'chao', 'listo hotel'].some(p => textoNorm.includes(p));
      const tipoEvento = esSalida ? "SALIDA" : "LLEGADA";

      console.log(`🏨 [LOGÍSTICA] Hotel: ${hotelDetectado} | ${tipoEvento} | Hora: ${horaCalculada} | Por: ${pushName}`);

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
        }, { timeout: 20000 });
      } catch (err) {
        console.error('❌ Error enviando logística:', err.message);
      }
      return;
    }

    // =========================================================================
    // CANAL 2: ASISTENCIA Y NÓMINA (ENTRADAS / SALIDAS FLEXIBLES)
    // =========================================================================
    const palabrasEntrada = [
      'ingreso', 'entrada', 'llegue', 'llego', 'buenos dias', 'buen dia', 
      'iniciando', 'inicio turno', 'presente', 'reporto entrada', 'reporte entrada',
      'hola', 'buenas', 'iniciamos', 'aqui planta', 'llegando', 'planta'
    ];
    const palabrasSalida = [
      'salida', 'me voy', 'chao', 'hasta manana', 'fin turno', 'termino', 
      'saliendo', 'salgo', 'termine', 'reporto salida', 'reporte salida', 'hasta luego'
    ];

    const esEntrada = palabrasEntrada.some(p => textoNorm.includes(p));
    const esSalida = palabrasSalida.some(p => textoNorm.includes(p));

    // Si no contiene palabras de entrada/salida o de saludo laboral, no procesa
    if (!esEntrada && !esSalida && !textoNorm.includes('codigo') && !textoNorm.includes('cod')) {
      return;
    }

    let tipoMov = esSalida ? "SALIDA" : "INGRESO";

    // EXTRACCIÓN DE CÓDIGO MANUAL ESTRICTO: Solo si viene precedido explícitamente por "codigo" o "cod"
    let codigoManual = "";
    const matchCodExplícito = textoSinHora.match(/\b(?:codigo|cod|id)\s*[:#-]?\s*(\d{1,3})\b/);
    if (matchCodExplícito) {
      codigoManual = matchCodExplícito[1];
    }

    // EXTRACCIÓN DEL NOMBRE DEL MENSAJE (ej: "Ingreso Michael 8:15" -> "MICHAEL")
    let palabrasRestantes = textoSinHora
      .replace(/buenos dias|buen dia|reporto entrada|reporto salida|reporte entrada|reporte salida|ingreso|entrada|salida|hora|de|a las|am|pm|hola|buenas|presente|iniciando|inicio|turno|codigo|cod|id/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length >= 3 && !['hoy', 'tarde', 'temprano', 'ya', 'listo', 'aqui', 'planta', 'para'].includes(w));

    let nombreObjetivo = "";
    if (palabrasRestantes.length > 0) {
      nombreObjetivo = palabrasRestantes[0].toUpperCase();
    }

    const obs = `Marcaje WhatsApp (${pushName}) | "${texto}"`;
    console.log(`👤 [ASISTENCIA] ${tipoMov} | Hora: ${horaCalculada} | Cel: ${remitenteTel} | NombreMsg: '${nombreObjetivo}' | Cod: '${codigoManual}'`);

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
      }, { timeout: 20000 });
    } catch (err) {
      console.error('❌ Error enviando nómina:', err.message);
    }
  });
}

iniciarBot();