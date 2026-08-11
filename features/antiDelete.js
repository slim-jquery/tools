const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const P = require('pino');

function getForwardedQuote(targetJid, textQuote = 'Pesan Diteruskan', senderJid = '0@s.whatsapp.net') {
    return {
        key: { remoteJid: targetJid, fromMe: false, id: 'FORWARD_' + Date.now(), participant: senderJid },
        message: { conversation: textQuote },
        contextInfo: { isForwarded: true, forwardingScore: 9999 }
    };
}

async function handleAntiDelete(sock, session, deletedId, remoteJid, messageStore) {
    if (!deletedId) return;
    const savedMsg = messageStore.get(deletedId);
    if (!savedMsg) return;

    const chatJid = savedMsg.key.remoteJid || remoteJid;
    const isGroup = chatJid.endsWith('@g.us');

    if (isGroup && !session.settings.antiDeleteGc) return;
    if (!isGroup && !session.settings.antiDeletePc) return;

    const sender = savedMsg.key.participant || savedMsg.key.remoteJid || chatJid;
    const cleanSender = sender ? sender.split('@')[0] : 'Pengirim';

    let infoText = `🚨 *PESAN TERHAPUS DETECTED*\n\n` +
                   `• *Pengirim:* @${cleanSender}\n` +
                   `• *Tipe Chat:* ${isGroup ? 'Grup' : 'Pribadi'}\n`;

    const messageContent = savedMsg.message;
    if (!messageContent) return;

    const textContent = messageContent.conversation || 
                        messageContent.extendedTextMessage?.text || 
                        messageContent.imageMessage?.caption || 
                        messageContent.videoMessage?.caption;

    const fakeQuote = getForwardedQuote(chatJid, '⚠️ Pesan Terhapus', sender);

    if (textContent) {
        infoText += `• *Isi Pesan:* ${textContent}`;
        await sock.sendMessage(chatJid, { text: infoText, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuote });
    } else {
        const mediaType = Object.keys(messageContent)[0];
        if (['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage'].includes(mediaType)) {
            try {
                const buffer = await downloadMediaMessage(savedMsg, 'buffer', {}, { logger: P({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const typeName = mediaType.replace('Message', '');
                infoText += `• *Media Terhapus:* (${typeName})`;

                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(chatJid, { image: buffer, caption: infoText, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuote });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(chatJid, { video: buffer, caption: infoText, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuote });
                } else if (mediaType === 'stickerMessage') {
                    await sock.sendMessage(chatJid, { text: infoText, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuote });
                    await sock.sendMessage(chatJid, { sticker: buffer });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(chatJid, { text: infoText, mentions: [sender], contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuote });
                    await sock.sendMessage(chatJid, { audio: buffer, ptt: true, mimetype: 'audio/mp4' });
                }
            } catch (err) {
                console.error('Gagal restore media:', err.message);
            }
        }
    }
}

module.exports = { handleAntiDelete };
