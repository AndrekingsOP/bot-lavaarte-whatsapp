# =========================================================================
# BOT WHATSAPP ASISTENCIA - LAVAARTE SAS (ENTRADAS Y SALIDAS)
# REPOSITORIO INDEPENDIENTE: CONTROL DE ASISTENCIA Y PERSONAL
# =========================================================================

import os
import json
import requests
import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# URL del Webhook de Apps Script donde se guardan las asistencias
# (Apunta a la hoja REGISTRO_ASISTENCIA / INGRESO - SALIDA - NOMINA)
URL_APPS_SCRIPT_ASISTENCIA = os.getenv(
    'URL_APPS_SCRIPT_ASISTENCIA', 
    'https://script.google.com/macros/s/AKfycbxqnfe5kd_b0gB50r0IKw69pkRdsYq4vEHLIpwpRZpDYeTMq5TvWVCnsstm7Tj2W0we/exec'
)

# Token de verificación para configurar Webhook de WhatsApp Cloud API
VERIFY_TOKEN = os.getenv('VERIFY_TOKEN', 'LAVAARTE_WHATSAPP_TOKEN_2026')

# MAPA OFICIAL DE COLABORADORES POR NÚMERO O CÓDIGO
# Formato estándar colombiano: 57 + 10 dígitos
EMPLEADOS_LAVAARTE = {
    "573100000001": {"codigo": "EMP-01", "nombre": "CARLOS ANDRES SUAREZ"},
    "573200000002": {"codigo": "EMP-02", "nombre": "LUIS ALEJANDRO GARZON"},
    "573000000003": {"codigo": "EMP-03", "nombre": "OPERARIO PLANTA 1"},
    "573000000004": {"codigo": "EMP-04", "nombre": "CONDUCTOR RUTA 1"}
}

def normalizar_texto(txt):
    if not txt:
        return ""
    return str(txt).strip().lower()

def detectar_tipo_asistencia(mensaje):
    """
    Detecta estrictamente entradas y salidas.
    Descarta reportes de almuerzos, pausas o mensajes informativos para no ensuciar Sheets.
    """
    m = normalizar_texto(mensaje)
    
    # 1. Filtro de exclusión: descarta pausas y almuerzos
    if any(p in m for p in ["almuerzo", "almorzar", "pausa", "descanso", "refrigerio"]):
        return None

    # 2. Detección de Entrada
    if any(p in m for p in ["entrada", "ingreso", "llegue", "llegué", "iniciando", "inicio turno", "buenos dias", "buenos días", "marcar entrada"]):
        return "ENTRADA"

    # 3. Detección de Salida
    if any(p in m for p in ["salida", "fin turno", "terminando", "me voy", "hasta mañana", "marcar salida", "salí", "sali"]):
        return "SALIDA"

    return None

def registrar_en_google_sheets(datos_asistencia):
    """Envía el registro a Google Sheets con hora oficial de Bogotá (GMT-5)."""
    try:
        payload = {
            "accion": "REGISTRAR_ASISTENCIA",
            "asistencia": datos_asistencia
        }
        resp = requests.post(
            URL_APPS_SCRIPT_ASISTENCIA, 
            data=json.dumps(payload), 
            headers={'Content-Type': 'application/json'}, 
            timeout=30
        )
        return resp.json()
    except Exception as e:
        print(f"❌ Error al enviar a Sheets: {e}")
        return {"status": "ERROR", "mensaje": str(e)}

# RUTA 1: Verificación del Webhook de WhatsApp (GET)
@app.route('/webhook', methods=['GET'])
def verificar_webhook():
    hub_mode = request.args.get('hub.mode')
    hub_token = request.args.get('hub.verify_token')
    hub_challenge = request.args.get('hub.challenge')

    if hub_mode == 'subscribe' and hub_token == VERIFY_TOKEN:
        print("✅ Webhook de WhatsApp verificado exitosamente.")
        return hub_challenge, 200
    return "Token inválido", 403

# RUTA 2: Recepción de Mensajes de WhatsApp (POST)
@app.route('/webhook', methods=['POST'])
def recibir_mensaje():
    data = request.get_json()
    
    # Manejo de peticiones de prueba o vacías
    if not data:
        return jsonify({"status": "NO_DATA"}), 200

    try:
        # Estructura de WhatsApp Business Cloud API
        entry = data.get('entry', [{}])[0]
        changes = entry.get('changes', [{}])[0]
        value = changes.get('value', {})
        messages = value.get('messages', [])

        if not messages:
            return jsonify({"status": "EVENT_NOT_A_MESSAGE"}), 200

        msg_obj = messages[0]
        numero_remitente = str(msg_obj.get('from', '')).replace('+', '').strip()
        tipo_msg = msg_obj.get('type')
        texto_mensaje = ""

        if tipo_msg == 'text':
            texto_mensaje = msg_obj.get('text', {}).get('body', '')
        elif tipo_msg == 'interactive':
            texto_mensaje = msg_obj.get('interactive', {}).get('button_reply', {}).get('title', '')
        else:
            return jsonify({"status": "IGNORED_TYPE"}), 200

        tipo_movimiento = detectar_tipo_asistencia(texto_mensaje)

        # Si es un mensaje operativo no relacionado a entrada/salida, se ignora limpiamente
        if not tipo_movimiento:
            print(f"ℹ️ Mensaje ignorado de {numero_remitente}: '{texto_mensaje}'")
            return jsonify({"status": "IGNORED_NON_ATTENDANCE"}), 200

        # Obtener colaborador oficial vinculado al número
        colaborador = EMPLEADOS_LAVAARTE.get(numero_remitente, {
            "codigo": "DESCONOCIDO",
            "nombre": f"Colaborador ({numero_remitente})"
        })

        ahora_bogota = datetime.datetime.now()
        fecha_str = ahora_bogota.strftime("%d/%m/%Y")
        hora_str = ahora_bogota.strftime("%I:%M:%S %p")

        datos_registro = {
            "fecha": fecha_str,
            "hora": hora_str,
            "numero_telefono": numero_remitente,
            "codigo_empleado": colaborador["codigo"],
            "nombre_empleado": colaborador["nombre"],
            "tipo_registro": tipo_movimiento,
            "mensaje_original": texto_mensaje
        }

        print(f"⏰ Registrando {tipo_movimiento} de {colaborador['nombre']} a las {hora_str}")
        resultado = registrar_en_google_sheets(datos_registro)

        return jsonify({
            "status": "SUCCESS",
            "tipo": tipo_movimiento,
            "empleado": colaborador["nombre"],
            "sheets_resp": resultado
        }), 200

    except Exception as e:
        print(f"❌ Error procesando webhook WhatsApp: {e}")
        return jsonify({"status": "ERROR", "mensaje": str(e)}), 500

@app.route('/', methods=['GET'])
def home():
    return "🚀 Servicio Bot WhatsApp Asistencia - Lavaarte SAS Online", 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
