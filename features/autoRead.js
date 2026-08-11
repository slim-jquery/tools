async function handleAutoRead(sock, session, msg) {
    if (session.settings.autoReadMsg && !msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
        try {
            await sock.readMessages([msg.key]);
        } catch (err) {
            console.error('Error Auto Read Message:', err.message);
        }
    }
}

module.exports = { handleAutoRead };
