import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import * as BaileysModule from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baileysPkg = BaileysModule.default?.default ? BaileysModule.default : (BaileysModule.default || BaileysModule);
const makeWASocket = baileysPkg.default || baileysPkg.makeWASocket || BaileysModule.makeWASocket;
const useMultiFileAuthState = baileysPkg.useMultiFileAuthState || BaileysModule.useMultiFileAuthState;
const DisconnectReason = baileysPkg.DisconnectReason || BaileysModule.DisconnectReason;
const fetchLatestBaileysVersion = baileysPkg.fetchLatestBaileysVersion || BaileysModule.fetchLatestBaileysVersion;

// =========================================================================
// 1. SERVIDOR WEB INDEPENDIENTE
// =========================================================================
const app = express();
const PORT = process.env.PORT || 10000;
let qrActual = null;
let estadoConexion = "Iniciando cliente WhatsApp...";
let sockGlobal = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/whatsapp-qr', async (req, res) => {
  if (estadoConexion === "CONECTADO") {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WhatsApp Lavaarte SAS</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: white;">
        <div style="max-width: 480px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 16px;">
          <h1 style="color: #22c55e; font-size: 24px;">✅ Bot WhatsApp Lavaarte Activo</h1>
          <p style="color: #94a3b8; font-size: 15px;">Operando 24/7 en Render.</p>
          <div style="background: #0f172a; padding: 12px; border-radius: 8px; margin-top: 20px; font-size: 13px; color: #38bdf8;">
            📡 Escuchando grupo operativo y listo para despachar recibos a clientes
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
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Escanear QR</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 25px; background: #0f172a; color: white;">
          <div style="max-width: 450px; margin: 0 auto; background: #1e293b; padding: 25px; border-radius: 16px;">
            <h2 style="color: #38bdf8; font-size: 22px;">📱 Escanea el QR de Lavaarte</h2>
            <p style="color: #94a3b8; font-size: 14px;">Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo:</p>
            <div style="background: white; display: inline-block; padding: 16px; border-radius: 14px;">
              <img src="${qrDataUrl}" style="width: 260px; height: 260px; display: block;" />
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Actualiza cada 15 segundos automáticamente.</p>
          </div>
          <script>setTimeout(() => window.location.reload(), 15000);</script>
        </body>
        </html>
      `);
    } catch (err) {
      return res.send("Error: " + err.message);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Conectando...</title></head>
    <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: white;">
      <h2>⏳ Iniciando cliente WhatsApp...</h2>
      <script>setTimeout(() => window.location.reload(), 5000);</script>
    </body>
    </html>
  `);
});

// Endpoint para recibir la orden desde el Software Web y despacharla al cliente
app.post('/api/enviar-recibo', async (req, res) => {
  const { telefono, mensaje } = req.body;

  if (estadoConexion !== "CONECTADO" || !sockGlobal) {
    return res.status(503).json({ ok: false, error: 'WhatsApp desconectado en el Bot' });
  }

  if (!telefono || !mensaje) {
    return res.status(400).json({ ok: false, error: 'Falta teléfono o mensaje' });
  }

  try {
    const cleanNumber = telefono.replace(/\D/g, '');
    const jid = `57${cleanNumber}@s.whatsapp.net`;
    console.log(`📤 [RECIBO CLIENTE] Enviando comprobante directo a: ${cleanNumber}`);
    await sockGlobal.sendMessage(jid, { text: mensaje });
    res.json({ ok: true, mensaje: 'Comprobante enviado exitosamente' });
  } catch (err) {
    console.error('❌ Error enviando mensaje a cliente:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 [RENDER OK] Servidor Bot activo en el puerto ${PORT}`);
});

// =========================================================================
// 2. CONFIGURACIÓN LOGÍSTICA Y ASISTENCIA (GRUPO OPERATIVO)
// =========================================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyRY5VDZFm3EgSmeMFec6DyDE5X2-Jsv26KZn8iya7OPbrmoNxz-Z2ByuBnGTXF3zXS/exec';
const ID_GRUPO_LAVAARTE = '120363044348453055@g.us';

const HOTELES_CANAL = {
  'ruta oriente': 'RUTA ORIENTE', 'ruta norte': 'RUTA NORTE', 'wyndham': 'WYNDHAM', 'whymdam': 'WYNDHAM',
  'whymd': 'WYNDHAM', 'wyndam': 'WYNDHAM', 'windham': 'WYNDHAM', 'whindham': 'WYNDHAM', 'whynham': 'WYNDHAM',
  'whimdam': 'WYNDHAM', 'wynd': 'WYNDHAM', 'whym': 'WYNDHAM', 'oceania': 'OCEANIA', 'oceana': 'OCEANIA',
  'oceani': 'OCEANIA', 'hilton': 'HILTON', 'hampton': 'HAMPTON', 'fontana': 'FONTANA', 'dann': 'DANN',
  'suite': 'SUITE', 'virrey': 'VIRREY', 'andes plaza': 'ANDES PLAZA', 'andes': 'ANDES PLAZA',
  'bogota plaza': 'BOGOTÁ PLAZA', 'bogota p': 'BOGOTÁ PLAZA', 'almacen': 'ALMACÉN CENTRAL'
};

process.on('uncaughtException', (err) => console.log('⚠️ [PREVENCIÓN]:', err.message));
process.on('unhandledRejection', (reason) => console.log('⚠️ [PREVENCIÓN]:', reason));

function normalizarTexto(txt) {
  return txt ? txt.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
}

function extraerTelefono10Digitos(jidStr) {
  if (!jidStr) return "";
  let limpio = jidStr.split('@')[0].split(':')[0].replace(/\D/g, '');
  return limpio.length > 10 ? limpio.slice(-10) : limpio;
}

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

    sockGlobal = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        qrActual = qr;
        estadoConexion = "QR_PENDIENTE";
        try { qrcodeTerminal.generate(qr, { small: true }); } catch (e) {}
      }
      if (connection === 'close') {
        estadoConexion = "DESCONECTADO";
        sockGlobal = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const debeReconectar = statusCode !== DisconnectReason.loggedOut;
        if (debeReconectar) {
          reintentando = true;
          setTimeout(() => { reintentando = false; iniciarBot(); }, 5000);
        }
      } else if (connection === 'open') {
        qrActual = null;
        estadoConexion = "CONECTADO";
        console.log('🛡️ PUENTE LAVAARTE ACTIVO - NÓMINA + LOGÍSTICA + RECIBOS');
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      const m = messages[0];
      if (!m || !m.message || m.key.remoteJid !== ID_GRUPO_LAVAARTE) return;

      const texto = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
      if (!texto.trim()) return;

      const textoNorm = normalizarTexto(texto);
      if (['almuerzo', 'almorzar', 'refrigerio', 'organizar', 'cerrar caja', 'entregarla'].some(p => textoNorm.includes(p))) return;

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
        try {
          await axios.post(APPS_SCRIPT_URL, {
            canal: "LOGISTICA_HOTELES", hotel: hotelDetectado, tipo: tipoEvento,
            hora: horaCalculada, fecha: fechaCalculada, telefono: remitenteTel,
            push_name: pushName, mensaje_raw: texto
          }, { timeout: 20000 });
        } catch (err) { console.error('Error logística:', err.message); }
        return;
      }

      const palabrasEntrada = ['ingreso', 'entrada', 'llegue', 'llego', 'buenos dias', 'buen dia', 'iniciando', 'inicio turno', 'presente', 'reporto entrada', 'reporte entrada', 'hola', 'buenas', 'iniciamos', 'aqui planta', 'llegando', 'planta'];
      const palabrasSalida = ['salida', 'me voy', 'chao', 'hasta manana', 'fin turno', 'termino', 'saliendo', 'salgo', 'termine', 'reporto salida', 'reporte salida', 'hasta luego'];

      const esEntrada = palabrasEntrada.some(p => textoNorm.includes(p));
      const esSalida = palabrasSalida.some(p => textoNorm.includes(p));

      if (!esEntrada && !esSalida && !textoNorm.includes('codigo') && !textoNorm.includes('cod')) return;

      let tipoMov = esSalida ? "SALIDA" : "INGRESO";
      let codigoManual = "";
      const matchCodExplícito = textoSinHora.match(/\b(?:codigo|cod|id)\s*[:#-]?\s*(\d{1,3})\b/);
      if (matchCodExplícito) codigoManual = matchCodExplícito[1];

      let palabrasRestantes = textoSinHora
        .replace(/buenos dias|buen dia|reporto entrada|reporto salida|reporte entrada|reporte salida|ingreso|entrada|salida|hora|de|a las|am|pm|hola|buenas|presente|iniciando|inicio|turno|codigo|cod|id/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim().split(/\s+/)
        .filter(w => w.length >= 3 && !['hoy', 'tarde', 'temprano', 'ya', 'listo', 'aqui', 'planta', 'para'].includes(w));

      let nombreObjetivo = palabrasRestantes.length > 0 ? palabrasRestantes[0].toUpperCase() : "";

      try {
        await axios.post(APPS_SCRIPT_URL, {
          canal: "NOMINA", telefono: remitenteTel, codigo_manual: codigoManual,
          nombre: nombreObjetivo, push_name: pushName, tipo: tipoMov,
          hora: horaCalculada, fecha: fechaCalculada,
          observaciones: `Marcaje WhatsApp (${pushName}) | "${texto}"`
        }, { timeout: 20000 });
      } catch (err) { console.error('Error nómina:', err.message); }
    });

  } catch (errGlobal) {
    console.error('Error Baileys:', errGlobal.message);
    reintentando = true;
    setTimeout(() => { reintentando = false; iniciarBot(); }, 6000);
  }
}

iniciarBot();
