const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const P = require('pino');

function getForwardedQuote(targetJid, textQuote = 'Pesan Diteruskan', senderJid = '0@s.whatsapp.net') {
    return {
        key: { remoteJid: targetJid, fromMe: false, id: 'FORWARD_' + Date.now(), participant: senderJid },
        message: { conversation: textQuote },
        contextInfo: { isForwarded: true, forwardingScore: 9999 }
    };
}

async function handleRvo(sock, session, msg) {
    if (!session.settings.rvo) return;

    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const isRvoCmd = body.trim().toLowerCase() === '.rvo' || body.trim().toLowerCase() === 'rvo';

    if (isRvoCmd) {
        const botJid = sock.decodeJid(sock.user?.id);
        const senderJid = sock.decodeJid(msg.key.participant || msg.key.remoteJid);
        if (senderJid !== botJid && !msg.key.fromMe) return;

        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const fakeQuoteRvo = getForwardedQuote(msg.key.remoteJid, 'Pesan View Once', senderJid);

        if (!quotedMsg) {
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Reply pesan View Once lalu ketik *.rvo*', contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuoteRvo });
            return;
        }

        const viewOnceContent = quotedMsg.viewOnceMessageV2?.message || quotedMsg.viewOnceMessage?.message || quotedMsg.viewOnceMessageV2Extension?.message || quotedMsg;
        const mediaType = Object.keys(viewOnceContent)[0];

        if (['imageMessage', 'videoMessage', 'audioMessage'].includes(mediaType)) {
            try {
                const buffer = await downloadMediaMessage({ message: viewOnceContent }, 'buffer', {}, { logger: P({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const mediaData = viewOnceContent[mediaType];
                const captionText = `📥 *READ VIEW ONCE*\n\n• *Caption Asli:* ${mediaData.caption || '-'}`;

                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: captionText, contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuoteRvo });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption: captionText, contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuoteRvo });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(msg.key.remoteJid, { audio: buffer, ptt: true, mimetype: 'audio/mp4', contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuoteRvo });
                }
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengambil media View Once.' }, { quoted: fakeQuoteRvo });
            }
        }
    }
}

module.exports = { handleRvo };
