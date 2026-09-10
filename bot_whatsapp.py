# =========================================================================
# BOT WHATSAPP LAVAARTE SAS: NÓMINA / ASISTENCIA + LOGÍSTICA HOTELES
# SERVIDOR PUENTE WEBHOOK -> GOOGLE APPS SCRIPT
# =========================================================================

import os
import json
import requests
import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# URL pública de tu Apps Script implementado
URL_APPS_SCRIPT = os.getenv(
    'URL_APPS_SCRIPT',
    'https://script.google.com/macros/s/AKfycbxqnfe5kd_b0gB50r0IKw69pkRdsYq4vEHLIpwpRZpDYeTMq5TvWVCnsstm7Tj2W0we/exec'
)

HOTELES_CONOCIDOS = [
    "WYNDHAM", "HILTON", "HAMPTON", "OCEANIA", "FONTANA", "ALMACEN", 
    "ALMACÉN", "DANN", "SUITE", "VIRREY", "ANDES PLAZA", "BOGOTA PLAZA", 
    "BOGOTÁ PLAZA", "EFICACIA"
]

def normalizar(txt):
    if not txt:
        return ""
    import unicodedata
    t = unicodedata.normalize('NFD', str(txt))
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return t.upper().strip()

def extraer_telefono_10_digitos(raw_tel):
    if not raw_tel:
        return ""
    # Remover todo lo que no sea número (ej: 57310... -> 310...)
    nums = ''.join(filter(str.isdigit, str(raw_tel)))
    if len(nums) > 10:
        return nums[-10:]
    return nums

def parsear_mensaje_whatsapp(data):
    """
    Decodifica payloads directos (Baileys/Evolution API/Z-API) 
    o anidados de Meta Cloud API.
    """
    texto = ""
    telefono = ""
    push_name = ""

    # Caso 1: Payload plano / estándar
    if "mensaje" in data or "body" in data or "text" in data:
        texto = data.get("mensaje") or data.get("body") or data.get("text") or ""
        telefono = data.get("telefono") or data.get("from") or data.get("sender") or ""
        push_name = data.get("push_name") or data.get("name") or ""
    
    # Caso 2: Payload anidado tipo Evolution API
    elif "data" in data and isinstance(data["data"], dict):
        d = data["data"]
        msg_obj = d.get("message", {})
        texto = msg_obj.get("conversation") or msg_obj.get("extendedTextMessage", {}).get("text") or ""
        telefono = d.get("key", {}).get("remoteJid", "") or d.get("pushName", "")
        push_name = d.get("pushName", "")

    # Caso 3: Meta Cloud API oficial
    elif "entry" in data:
        try:
            entry = data.get('entry', [{}])[0]
            changes = entry.get('changes', [{}])[0]
            val = changes.get('value', {})
            msgs = val.get('messages', [])
            if msgs:
                m = msgs[0]
                texto = m.get('text', {}).get('body', '')
                telefono = m.get('from', '')
                contacts = val.get('contacts', [{}])
                push_name = contacts[0].get('profile', {}).get('name', '')
        except Exception:
            pass

    return str(texto).strip(), str(telefono).strip(), str(push_name).strip()

@app.route('/', methods=['GET'])
def index():
    return "🚀 Servidor WhatsApp Lavaarte SAS Activo (Nómina y Rutas)", 200

# Aceptamos tanto la raíz como /webhook por compatibilidad con cualquier gateway
@app.route('/', methods=['POST'])
@app.route('/webhook', methods=['GET', 'POST'])
def handle_webhook():
    # Verificación GET para gateways que requieran handshake
    if request.method == 'GET':
        challenge = request.args.get('hub.challenge')
        if challenge:
            return challenge, 200
        return "Webhook Endpoint Listo", 200

    data = request.get_json(force=True, silent=True) or {}
    print(f"\n📩 [EVENTO RECIBIDO] Payload: {json.dumps(data, ensure_ascii=False)}")

    texto, telefono_raw, push_name = parsear_mensaje_whatsapp(data)
    
    if not texto and not telefono_raw:
        print("⚠️ Evento descartado: No contiene texto ni remitente válido.")
        return jsonify({"status": "IGNORED", "reason": "No text/sender"}), 200

    texto_norm = normalizar(texto)
    tel_10 = extraer_telefono_10_digitos(telefono_raw)

    ahora_bog = datetime.datetime.now()
    fecha_hoy = ahora_bog.strftime("%d/%m/%Y")
    hora_str = ahora_bog.strftime("%I:%M:%S %p")

    # =========================================================================
    # DETECCIÓN DE CANAL: ¿LOGÍSTICA DE HOTELES O NÓMINA?
    # =========================================================================
    hotel_detectado = None
    for h in HOTELES_CONOCIDOS:
        if normalizar(h) in texto_norm:
            hotel_detectado = h
            break

    # 1. CANAL LOGÍSTICA DE HOTELES
    if hotel_detectado:
        tipo_accion = "LLEGADA"
        if any(w in texto_norm for w in ["SALIDA", "SALI", "SALIENDO", "TERMINE", "FIN"]):
            tipo_accion = "SALIDA"
            
        payload_sheets = {
            "canal": "LOGISTICA_HOTELES",
            "hotel": hotel_detectado,
            "tipo": tipo_accion,
            "fecha": fecha_hoy,
            "hora": hora_str,
            "push_name": push_name or f"Tel {tel_10}",
            "telefono": tel_10,
            "mensaje_raw": texto
        }
        print(f"🏨 [LOGÍSTICA] Hotel: {hotel_detectado} | Acción: {tipo_accion} | Conductor: {payload_sheets['push_name']}")

    # 2. CANAL NÓMINA Y ASISTENCIA
    else:
        # Descartar pausas/almuerzo
        if any(p in texto_norm for p in ["ALMUERZO", "ALMORZAR", "PAUSA", "DESCANSO", "REFRIGERIO"]):
            print(f"ℹ️ [NÓMINA] Mensaje de pausa descartado: '{texto}'")
            return jsonify({"status": "IGNORED", "reason": "Pausa/Almuerzo"}), 200

        tipo_marcaje = "INGRESO"
        if any(w in texto_norm for w in ["SALIDA", "FIN TURNO", "ME VOY", "HASTA MANANA", "SALI", "MARCAR SALIDA"]):
            tipo_marcaje = "SALIDA"

        # Detección de código manual si escriben por ejemplo "Código 12" o "Cod 5"
        codigo_manual = ""
        palabras = texto_norm.split()
        for i, p in enumerate(palabras):
            if p in ["CODIGO", "COD"] and i + 1 < len(palabras):
                codigo_manual = ''.join(filter(str.isdigit, palabras[i+1]))

        payload_sheets = {
            "canal": "NOMINA",
            "tipo": tipo_marcaje,
            "fecha": fecha_hoy,
            "hora": hora_str,
            "telefono": tel_10,
            "codigo_manual": codigo_manual,
            "nombre": texto,
            "observaciones": f"Marcaje WhatsApp: '{texto}'"
        }
        print(f"⏰ [NÓMINA] Marcaje: {tipo_marcaje} | Tel: {tel_10} | Mensaje: '{texto}'")

    # =========================================================================
    # REENVÍO A GOOGLE APPS SCRIPT
    # =========================================================================
    try:
        resp = requests.post(
            URL_APPS_SCRIPT, 
            data=json.dumps(payload_sheets), 
            headers={'Content-Type': 'application/json'}, 
            timeout=25
        )
        print(f"✅ Respuesta Sheets: {resp.text}")
        return jsonify({"status": "SUCCESS", "sheets_response": resp.json() if resp.text.startswith('{') else resp.text}), 200
    except Exception as e:
        print(f"❌ Error al enviar a Sheets: {e}")
        return jsonify({"status": "ERROR", "error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
