import express from 'express';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import axios from 'axios';
import baileys from '@whiskeysockets/baileys';

const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = baileys;

// =========================================================================
// 1. SERVIDOR WEB INDEPENDIENTE (NUNCA CAE ANTE ERRORES DE BAILEYS)
// =========================================================================
const app = express();
const PORT = process.env.PORT || 10000;
let qrActual = null;
let estadoConexion = "Iniciando cliente WhatsApp...";

app.get('/', async (req, res) => {
  if (estadoConexion === "CONECTADO") {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Lavaarte SAS</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px; background: #0f172a; color: white; min-height: 100vh; margin: 0; box-sizing: border-box;">
        <div style="max-width: 480px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <h1 style="color: #22c55e; margin-top: 0; font-size: 24px;">✅ Bot WhatsApp Lavaarte Activo</h1>
          <p style="color: #94a3b8; font-size: 15px;">La sesión de WhatsApp está vinculada y operando de forma continua 24/7 en Render.</p>
          <div style="background: #0f172a; padding: 12px; border-radius: 8px; margin-top: 20px; font-size: 13px; color: #38bdf8;">
            📡 Escuchando grupo operativo y nómina
          </div>
        </div>
      </body>
      </html>
    `);
  }

  if (qrActual) {
    try {
      const qrDataUrl = await QRCode.toDataURL(qrActual);
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Escanear QR - WhatsApp Lavaarte</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 25px; background: #0f172a; color: white; min-height: 100vh; margin: 0; box-sizing: border-box;">
          <div style="max-width: 450px; margin: 0 auto; background: #1e293b; padding: 25px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <h2 style="color: #38bdf8; margin-top: 0; font-size: 22px;">📱 Escanea el QR de Lavaarte</h2>
            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">
              Abre WhatsApp en tu celular &gt; <b>Dispositivos vinculados</b> &gt; <b>Vincular dispositivo</b>:
            </p>
            <div style="background: white; display: inline-block; padding: 16px; border-radius: 14px;">
              <img src="${qrDataUrl}" style="width: 260px; height: 260px; display: block;" alt="Código QR WhatsApp" />
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 20px;">
              ⏳ Esta pantalla se actualiza sola cada 15 segundos con el código más reciente.
            </p>
          </div>
          <script>
            setTimeout(function() { window.location.reload(); }, 15000);
          </script>
        </body>
        </html>
      `);
    } catch (err) {
      return res.send("Error generando código QR en pantalla: " + err.message);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Conectando WhatsApp...</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px; background: #0f172a; color: white; min-height: 100vh; margin: 0;">
      <div style="max-width: 450px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 16px;">
        <h2 style="color: #facc15; margin-top: 0;">⏳ Iniciando cliente WhatsApp...</h2>
        <p style="color: #94a3b8;">Generando llaves y solicitando QR a WhatsApp...</p>
      </div>
      <script>
        setTimeout(function() { window.location.reload(); }, 5000);
      </script>
    </body>
    </html>
  `);
});

// Levantar servidor web de inmediato
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 [RENDER OK] Servidor Web activo escuchando en el puerto ${PORT}`);
});

// =========================================================================
// 2. CONFIGURACIÓN LOGÍSTICA Y ASISTENCIA LAVAARTE
// =========================================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyRY5VDZFm3EgSmeMFec6DyDE5X2-Jsv26KZn8iya7OPbrmoNxz-Z2ByuBnGTXF3zXS/exec';
const ID_GRUPO_LAVAARTE = '120363044348453055@g.us';

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

function extraerTelefono10Digitos(jidStr) {
  if (!jidStr) return "";
  let limpio = jidStr.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (limpio.length > 10) {
    return limpio.slice(-10);
  }
  return limpio;
}

// =========================================================================
// 3. NÚCLEO AUTÓNOMO BAILEYS CON RECONEXIÓN SEGURA
// =========================================================================
let reintentando = false;

async function iniciarBot() {
  if (reintentando) return;
  console.log('🔄 Inicializando cliente Baileys con sesión persistente...');

  try {
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
        qrActual = qr;
        estadoConexion = "QR_PENDIENTE";
        console.log('\n📲 [CÓDIGO QR DISPONIBLE] Escanéalo en la consola o abre la URL web de Render:');
        try {
          qrcodeTerminal.generate(qr, { small: true });
        } catch (e) {}
      }

      if (connection === 'close') {
        estadoConexion = "DESCONECTADO";
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const debeReconectar = statusCode !== DisconnectReason.loggedOut;
        console.log(`🔌 Conexión cerrada (${statusCode}). Reconectando: ${debeReconectar}`);
        
        if (debeReconectar) {
          reintentando = true;
          setTimeout(() => {
            reintentando = false;
            iniciarBot();
          }, 5000);
        }
      } else if (connection === 'open') {
        qrActual = null;
        estadoConexion = "CONECTADO";
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

      // Filtro de exclusión total
      if (textoNorm.includes('almuerzo') || textoNorm.includes('almorzar') || textoNorm.includes('refrigerio') || textoNorm.includes('organizar') || textoNorm.includes('cerrar caja') || textoNorm.includes('entregarla')) {
        return;
      }

      // Extracción de hora Bogotá
      const ahora = new Date();
      let horaCalculada = ahora.toLocaleTimeString('en-US', { timeZone: 'America/Bogota', hour12: true });
      const fechaCalculada = ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });

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

          textoSinHora = textoSinHora.replace(matchHora[0], ' ');
        }
      }

      const remitenteRaw = m.key.participantPn || m.key.participant || m.participant || "";
      let remitenteTel = extraerTelefono10Digitos(remitenteRaw);
      const pushName = (m.pushName || "").trim() || "Colaborador";

      // Canal 1: Logística de Hoteles
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

        console.log(`🏨 [LOGÍSTICA] Hotel: ${hotelDetectado} | ${tipoEvento} | Hora: ${horaCalculada} | Por: ${pushName} (${remitenteTel})`);

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

      // Canal 2: Asistencia y Nómina
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

      if (!esEntrada && !esSalida && !textoNorm.includes('codigo') && !textoNorm.includes('cod')) {
        return;
      }

      let tipoMov = esSalida ? "SALIDA" : "INGRESO";

      let codigoManual = "";
      const matchCodExplícito = textoSinHora.match(/\b(?:codigo|cod|id)\s*[:#-]?\s*(\d{1,3})\b/);
      if (matchCodExplícito) {
        codigoManual = matchCodExplícito[1];
      }

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
      console.log(`👤 [ASISTENCIA] ${tipoMov} | Hora: ${horaCalculada} | Cel: ${remitenteTel} | PushName: '${pushName}' | NombreMsg: '${nombreObjetivo}' | Cod: '${codigoManual}'`);

      try {
        const res = await axios.post(APPS_SCRIPT_URL, {
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
        console.log('✅ Respuesta Apps Script Nómina:', res.data);
      } catch (err) {
        console.error('❌ Error enviando nómina:', err.message);
      }
    });

  } catch (errGlobal) {
    console.error('⚠️ [ERROR INICIALIZACIÓN BAILEYS]:', errGlobal.message);
    reintentando = true;
    setTimeout(() => {
      reintentando = false;
      iniciarBot();
    }, 6000);
  }
}

iniciarBot();
