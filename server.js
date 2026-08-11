const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, jidDecode, downloadMediaMessage } = require('@whiskeysockets/baileys');
const P = require('pino');
const { Jimp } = require('jimp');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const AUTH_ROOT = 'auth_info';
const UPLOAD_DIR = 'uploads';
const TRASH_DIR = 'sampah';
const ADMIN_DATA_DIR = 'admin_data';
const ADMIN_PHOTOS_DIR = path.join(ADMIN_DATA_DIR, 'photos');
const RECORDS_FILE = path.join(ADMIN_DATA_DIR, 'records.json');
const USERS_FILE = path.join(ADMIN_DATA_DIR, 'users.json');

const ADMIN_PASSWORD = '@sayanana123';
const OTP_SENDER_PHONE = '6282143985744';

for (const dir of [AUTH_ROOT, UPLOAD_DIR, TRASH_DIR, ADMIN_DATA_DIR, ADMIN_PHOTOS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getUsersData() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
            return {};
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveUsersData(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

const app = express();
const upload = multer({ dest: UPLOAD_DIR + '/', limits: { fileSize: 25 * 1024 * 1024 } });

const sessions = new Map();
const messageStore = new Map();
const resetOtps = new Map();

function moveToTrash(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return;
        const trashPath = path.join(TRASH_DIR, `${Date.now()}_${path.basename(filePath)}`);
        fs.renameSync(filePath, trashPath);
    } catch (err) {
        console.error('Gagal pindah ke sampah:', err.message);
    }
}

function saveRecord(phone, name, photoBuffer) {
    try {
        const filename = `${Date.now()}_${phone}.jpg`;
        fs.writeFileSync(path.join(ADMIN_PHOTOS_DIR, filename), photoBuffer);

        let records = [];
        if (fs.existsSync(RECORDS_FILE)) {
            records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8'));
        }
        records.unshift({
            id: Date.now(),
            phone,
            name: name || '-',
            photo: filename,
            timestamp: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        });
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
    } catch (err) {
        console.error('Gagal simpan record:', err.message);
    }
}

function openBrowser(url) {
    const commands = [
        `termux-open-url "${url}"`,
        `am start -a android.intent.action.VIEW -d "${url}"`,
        `xdg-open "${url}"`,
        `open "${url}"`,
        `start "" "${url}"`
    ];
    const tryNext = (i) => {
        if (i >= commands.length) return;
        exec(commands[i], (err) => err ? tryNext(i + 1) : console.log('✅ Browser terbuka'));
    };
    tryNext(0);
}

function getForwardedQuote(targetJid, textQuote = 'Pesan Diteruskan', senderJid = '0@s.whatsapp.net') {
    return {
        key: { remoteJid: targetJid, fromMe: false, id: 'FORWARD_' + Date.now(), participant: senderJid },
        message: { conversation: textQuote },
        contextInfo: { isForwarded: true, forwardingScore: 9999 }
    };
}

function formatDuration(ms) {
    if (!ms || ms < 1000) return '1 Detik';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    let res = [];
    if (days > 0) res.push(`${days} Hari`);
    if (hours > 0) res.push(`${hours} Jam`);
    if (minutes > 0) res.push(`${minutes} Menit`);
    if (seconds > 0 || res.length === 0) res.push(`${seconds} Detik`);
    return res.join(' ');
}

function ensureSession(sessionId) {
    if (sessions.has(sessionId)) return sessions.get(sessionId);

    const session = {
        sock: null,
        status: 'disconnected',
        phone: null,
        name: null,
        profilePicUrl: null,
        connectedAt: null,
        authFolder: path.join(AUTH_ROOT, sessionId),
        settings: {
            autoReadMsg: false,
            autoReactSw: false,
            reactEmoji: "",
            rvo: false,
            antiDeletePc: false,
            antiDeleteGc: false
        }
    };
    sessions.set(sessionId, session);

    startSession(sessionId).catch((err) => console.error(`Gagal start sesi ${sessionId}:`, err));
    return session;
}

if (fs.existsSync(AUTH_ROOT)) {
    const folders = fs.readdirSync(AUTH_ROOT);
    folders.forEach(folder => {
        if (fs.statSync(path.join(AUTH_ROOT, folder)).isDirectory()) {
            ensureSession(folder);
        }
    });
}

async function handleAntiDelete(sock, session, deletedId, remoteJid) {
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

async function startSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.sock) return;

    if (!fs.existsSync(session.authFolder)) fs.mkdirSync(session.authFolder, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(session.authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '110.0.5481.177'],
        version,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => messageStore.get(key.id)?.message || { conversation: '' }
    });

    session.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (sessions.get(sessionId) !== session) return;

        if (connection === 'close') {
            session.sock = null;
            session.connectedAt = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                cleanupSession(sessionId).catch(() => {});
            } else {
                startSession(sessionId).catch(() => {});
            }
        } else if (connection === 'open') {
            const userPhone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
            session.phone = userPhone;
            session.name = sock.user?.name || 'WA User';
            session.status = 'connected';
            session.connectedAt = Date.now();

            try {
                session.profilePicUrl = await sock.profilePictureUrl(sock.user.id, 'image');
            } catch {
                session.profilePicUrl = null;
            }

            console.log(`✅ Sesi terhubung! [Nomor: ${userPhone}]`);
        }
    });

    sock.ev.on('messages.upsert', async (update) => {
        const messages = update.messages;
        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
            if (!msg || !msg.message) continue;

            sock.decodeJid = (jid) => {
                if (!jid) return jid;
                if (/:\d+@/gi.test(jid)) {
                    const decode = jidDecode(jid) || {};
                    return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
                } else return jid;
            };

            const botJid = sock.decodeJid(sock.user?.id);
            const protocolMsg = msg.message?.protocolMessage;

            if (session.settings.autoReadMsg && !msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
                try {
                    await sock.readMessages([msg.key]);
                } catch (err) {
                    console.error('Error Auto Read Message:', err.message);
                }
            }

            if (msg.messageStubType === 1 || msg.messageStubType === 68 || (protocolMsg && protocolMsg.type === 0)) {
                const targetId = protocolMsg?.key?.id || msg.key?.id;
                const remoteJid = protocolMsg?.key?.remoteJid || msg.key?.remoteJid;
                await handleAntiDelete(sock, session, targetId, remoteJid);
                continue;
            }

            if (msg.key && msg.key.id) {
                messageStore.set(msg.key.id, msg);
                setTimeout(() => messageStore.delete(msg.key.id), 4 * 60 * 60 * 1000);
            }

            if (session.settings.autoReactSw && msg.key.remoteJid === 'status@broadcast') {
                if (msg.key.fromMe) continue;

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

            if (session.settings.rvo) {
                const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                const isRvoCmd = body.trim().toLowerCase() === '.rvo' || body.trim().toLowerCase() === 'rvo';

                if (isRvoCmd) {
                    const senderJid = sock.decodeJid(msg.key.participant || msg.key.remoteJid);
                    if (senderJid !== botJid && !msg.key.fromMe) continue;

                    const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    const fakeQuoteRvo = getForwardedQuote(msg.key.remoteJid, 'Pesan View Once', senderJid);

                    if (!quotedMsg) {
                        await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Reply pesan View Once lalu ketik *.rvo*', contextInfo: { isForwarded: true, forwardingScore: 9999 } }, { quoted: fakeQuoteRvo });
                        continue;
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
        }
    });
}

async function cleanupSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    try { if (session.sock) await session.sock.logout(); } catch {}
    try { session.sock?.end?.(undefined); } catch {}
    try {
        if (fs.existsSync(session.authFolder)) {
            fs.rmSync(session.authFolder, { recursive: true, force: true });
        }
    } catch {}
}

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/users', (req, res) => {
    const users = getUsersData();
    const userList = [];

    sessions.forEach((session) => {
        if (session.status === 'connected' && session.phone) {
            const userData = users[session.phone];
            if (userData && userData.name && userData.password) {
                const phoneStr = session.phone.toString();
                const phoneClue = phoneStr.length >= 3 ? phoneStr.slice(-3) : phoneStr;
                userList.push({
                    name: userData.name,
                    phoneClue
                });
            }
        }
    });

    res.json({ success: true, users: userList });
});

app.post('/api/setup-profile', (req, res) => {
    const sessionId = req.cookies.sid;
    const session = sessions.get(sessionId);
    const { name, password } = req.body;

    if (!session || session.status !== 'connected' || !session.phone) {
        return res.json({ success: false, message: '⚠️ Sesi WhatsApp tidak valid/belum terhubung!' });
    }

    if (!name || !password) {
        return res.json({ success: false, message: '⚠️ Nama dan Password Wajib Diisi!' });
    }

    if (password.length < 5) {
        return res.json({ success: false, message: '⚠️ Password minimal harus 5 karakter!' });
    }

    const users = getUsersData();
    users[session.phone] = { name, password };
    saveUsersData(users);

    res.json({ success: true, message: '✅ Profil dan Password Berhasil Disimpan!' });
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const users = getUsersData();

    let targetPhone = null;
    Object.keys(users).forEach(phone => {
        if (users[phone].name === name) {
            targetPhone = phone;
        }
    });

    if (!targetPhone || users[targetPhone].password !== password) {
        return res.json({ success: false, message: '⚠️ Nama User atau Password Salah!' });
    }

    let targetSessionId = null;
    sessions.forEach((session, sid) => {
        if (session.phone === targetPhone) targetSessionId = sid;
    });

    if (!targetSessionId) {
        return res.json({ success: false, message: '⚠️ Sesi WhatsApp User Ini Sedang Tidak Aktif!' });
    }

    res.cookie('sid', targetSessionId, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true });
});

app.post('/api/send-reset-otp', async (req, res) => {
    let { name, phone } = req.body;
    if (!phone) return res.json({ success: false, message: '⚠️ Nomor WhatsApp wajib diisi!' });

    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);

    const users = getUsersData();

    if (!users[phone]) {
        return res.json({ success: false, message: '⚠️ Nomor WhatsApp ini belum terdaftar di sistem!' });
    }

    if (name && users[phone].name !== name) {
        return res.json({ success: false, message: '⚠️ Akun tidak cocok!' });
    }

    let otpSenderSession = null;
    sessions.forEach((session) => {
        if (session.phone === OTP_SENDER_PHONE && session.status === 'connected') {
            otpSenderSession = session;
        }
    });

    if (!otpSenderSession) {
        sessions.forEach((session) => {
            if (session.status === 'connected' && session.sock) {
                otpSenderSession = session;
            }
        });
    }

    if (!otpSenderSession || !otpSenderSession.sock) {
        return res.json({ success: false, message: '⚠️ Bot Pengirim OTP sedang offline!' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    resetOtps.set(phone, {
        code: otpCode,
        verified: false,
        expires: Date.now() + 5 * 60 * 1000
    });

    try {
        const targetJid = phone + '@s.whatsapp.net';
        const textMsg = `🔑 *KODE OTP RESET PASSWORD*\n\n` +
                        `Kode verifikasi Anda adalah: *${otpCode}*\n\n` +
                        `_Jangan berikan kode ini kepada siapa pun. Kode ini berlaku selama 5 menit._`;

        await otpSenderSession.sock.sendMessage(targetJid, { text: textMsg });
        res.json({ success: true, message: `✅ Kode OTP telah dikirimkan ke WhatsApp Anda!` });
    } catch (err) {
        console.error('Gagal kirim OTP:', err.message);
        res.json({ success: false, message: '⚠️ Gagal mengirim pesan OTP ke WhatsApp!' });
    }
});

app.post('/api/verify-reset-otp', (req, res) => {
    let { phone, otp } = req.body;
    if (!phone || !otp) return res.json({ success: false, message: '⚠️ Data OTP Wajib Diisi!' });

    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);

    const otpData = resetOtps.get(phone);

    if (!otpData) {
        return res.json({ success: false, message: '⚠️ Kode OTP tidak ditemukan!' });
    }

    if (Date.now() > otpData.expires) {
        resetOtps.delete(phone);
        return res.json({ success: false, message: '⚠️ Kode OTP telah kadaluarsa!' });
    }

    if (otpData.code !== otp) {
        return res.json({ success: false, message: '⚠️ Kode OTP Salah!' });
    }

    otpData.verified = true;
    res.json({ success: true, message: '✅ Kode OTP Benar! Silakan buat password baru.' });
});

app.post('/api/save-new-password', (req, res) => {
    let { phone, newPassword } = req.body;
    if (!phone || !newPassword) return res.json({ success: false, message: '⚠️ Password Baru Wajib Diisi!' });

    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);

    const otpData = resetOtps.get(phone);

    if (!otpData || !otpData.verified) {
        return res.json({ success: false, message: '⚠️ Sesi verifikasi tidak valid!' });
    }

    if (newPassword.length < 5) {
        return res.json({ success: false, message: '⚠️ Password baru minimal 5 karakter!' });
    }

    const users = getUsersData();
    if (users[phone]) {
        users[phone].password = newPassword;
        saveUsersData(users);
        resetOtps.delete(phone);

        res.clearCookie('sid');
        res.json({ success: true, message: '✅ Password Berhasil Diubah! Silakan Login Kembali.' });
    } else {
        res.json({ success: false, message: '⚠️ Data user tidak ditemukan!' });
    }
});

app.post('/api/admin-login', (req, res) => {
    const { password } = req.body;

    if (password === ADMIN_PASSWORD) {
        res.cookie('admin_auth', 'true', { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });
        return res.json({ success: true });
    } else {
        return res.json({ success: false, message: '⚠️ Password Admin Salah!' });
    }
});

app.post('/api/admin-logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.json({ success: true });
});

app.get('/api/admin/users-monitoring', (req, res) => {
    const usersData = getUsersData();
    const userList = [];
    const now = Date.now();

    sessions.forEach((session) => {
        if (session.status === 'connected' && session.phone) {
            const registeredUser = usersData[session.phone];
            const ms = session.connectedAt ? (now - session.connectedAt) : 0;
            
            userList.push({
                phone: session.phone,
                userName: registeredUser?.name || session.name || 'User Tanpa Nama',
                password: registeredUser?.password || 'Belum Diset',
                profilePicUrl: session.profilePicUrl || null,
                connectedAt: session.connectedAt || now,
                uptime: formatDuration(ms),
                settings: session.settings
            });
        }
    });

    res.json({ success: true, users: userList });
});

app.post('/request-pairing', async (req, res) => {
    let { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, message: '⚠️ Nomor telepon tidak boleh kosong' });

    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (phoneNumber.startsWith('0')) {
        phoneNumber = '62' + phoneNumber.slice(1);
    }

    if (phoneNumber.length < 10) {
        return res.json({ success: false, message: '⚠️ Format nomor telepon tidak valid' });
    }

    const sessionId = `session_${phoneNumber}`;
    res.cookie('sid', sessionId, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });

    let session = sessions.get(sessionId);

    if (!session || session.status !== 'connected') {
        if (session) await cleanupSession(sessionId);
        session = ensureSession(sessionId);
    }

    try {
        let count = 0;
        while ((!session.sock || !session.sock.ws || session.sock.ws.readyState !== 1) && count < 25) {
            await new Promise(r => setTimeout(r, 200));
            count++;
        }

        if (!session.sock) {
            return res.json({ success: false, message: '⚠️ Gagal menghubungkan ke server WA. Coba lagi.' });
        }

        const code = await session.sock.requestPairingCode(phoneNumber);
        res.json({ success: true, pairingCode: code, sessionId });
    } catch (err) {
        console.error('Error request pairing:', err);
        res.json({ success: false, message: '⚠️ Gagal minta kode: ' + err.message });
    }
});

app.get('/status', (req, res) => {
    const sessionId = req.cookies.sid;
    const session = sessions.get(sessionId);
    const users = getUsersData();
    const isAdminAuth = req.cookies.admin_auth === 'true';

    if (!session) {
        return res.json({ connected: false, hasProfile: false, isAdminAuth, settings: {} });
    }

    const userData = session.phone ? users[session.phone] : null;
    const hasProfile = !!(userData && userData.name && userData.password);
    const now = Date.now();
    const ms = session.connectedAt ? (now - session.connectedAt) : 0;

    res.json({
        sessionId,
        connected: session.status === 'connected',
        phone: session.phone,
        profilePicUrl: session.profilePicUrl || null,
        hasProfile,
        userName: userData?.name || null,
        connectedAt: session.connectedAt || now,
        uptime: formatDuration(ms),
        isAdminAuth,
        settings: session.settings
    });
});

app.post('/update-settings', (req, res) => {
    const sessionId = req.cookies.sid;
    const session = sessions.get(sessionId);
    if (!session) return res.json({ success: false, message: 'Sesi tidak ditemukan.' });

    const { autoReadMsg, autoReactSw, reactEmoji, rvo, antiDeletePc, antiDeleteGc } = req.body;
    if (typeof autoReadMsg === 'boolean') session.settings.autoReadMsg = autoReadMsg;
    if (typeof autoReactSw === 'boolean') session.settings.autoReactSw = autoReactSw;
    if (typeof reactEmoji === 'string') session.settings.reactEmoji = reactEmoji;
    if (typeof rvo === 'boolean') session.settings.rvo = rvo;
    if (typeof antiDeletePc === 'boolean') session.settings.antiDeletePc = antiDeletePc;
    if (typeof antiDeleteGc === 'boolean') session.settings.antiDeleteGc = antiDeleteGc;

    res.json({ success: true, settings: session.settings });
});

app.post('/setpppanjang', upload.single('image'), async (req, res) => {
    const sessionId = req.cookies.sid;
    const session = sessions.get(sessionId);
    const filePath = req.file?.path;

    if (!session || !session.sock || session.status !== 'connected') {
        moveToTrash(filePath);
        return res.json({ success: false, message: 'WhatsApp belum terhubung.' });
    }

    try {
        const image = await Jimp.read(filePath);
        if (typeof image.resize === 'function') image.resize({ w: 720, h: 720 });

        let img = (typeof image.getBuffer === 'function') 
            ? await image.getBuffer('image/jpeg') 
            : fs.readFileSync(filePath);

        await session.sock.query({
            tag: 'iq',
            attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'w:profile:picture' },
            content: [{ tag: 'picture', attrs: { type: 'image' }, content: img }]
        });

        const phone = session.sock.user?.id?.split('@')[0] || '-';
        const name = session.sock.user?.name || '-';
        saveRecord(phone, name, img);

        try {
            session.profilePicUrl = await session.sock.profilePictureUrl(session.sock.user.id, 'image');
        } catch {}

        moveToTrash(filePath);
        res.json({ success: true, message: 'Foto profil berhasil dipasang!' });
    } catch (err) {
        moveToTrash(filePath);
        res.json({ success: false, message: 'Gagal memproses gambar: ' + err.message });
    }
});

app.post('/logout', async (req, res) => {
    const sessionId = req.cookies.sid;
    if (sessionId) await cleanupSession(sessionId);
    res.clearCookie('sid');
    res.clearCookie('admin_auth');
    res.json({ success: true });
});

const PORT = Math.floor(Math.random() * (65535 - 20000 + 1)) + 20000;

app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`🚀 Server berjalan di ${url}`);
    openBrowser(url);
});
