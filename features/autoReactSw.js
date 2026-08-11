async function handleAutoReactSw(sock, session, msg) {
    if (session.settings.autoReactSw && msg.key.remoteJid === 'status@broadcast') {
        if (msg.key.fromMe) return;

        const maxTime = 5 * 60 * 1000;
        const timeDiff = Date.now() - (msg.messageTimestamp * 1000);

        if (timeDiff <= maxTime) {
            try {
                await sock.readMessages([msg.key]);

                const emojiRaw = session.settings.reactEmoji ? session.settings.reactEmoji.trim() : '';
                const emojiList = Array.from(emojiRaw).filter(e => e.trim().length > 0);

                if (emojiList.length > 0) {
                    const chosenEmoji = emojiList[Math.floor(Math.random() * emojiList.length)];
                    const authorJid = msg.key.participant || msg.participant;

                    if (authorJid) {
                        await sock.sendMessage('status@broadcast', { 
                            react: { text: chosenEmoji, key: msg.key } 
                        }, { statusJidList: [authorJid] });
                    }
                }
            } catch (err) {
                console.error('Error Auto SW:', err.message);
            }
        }
    }
}

module.exports = { handleAutoReactSw };
