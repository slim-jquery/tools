const { Jimp, JimpMime } = require('jimp');
const path = require('path');
const fs = require('fs');

const TRASH_DIR = 'sampah';
const ADMIN_DATA_DIR = 'admin_data';
const ADMIN_PHOTOS_DIR = path.join(ADMIN_DATA_DIR, 'photos');
const RECORDS_FILE = path.join(ADMIN_DATA_DIR, 'records.json');

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

async function handleSetPPPanjang(req, res, sessions) {
    const sessionId = req.cookies.sid;
    const session = sessions.get(sessionId);
    const filePath = req.file?.path;

    if (!session || !session.sock || session.status !== 'connected') {
        moveToTrash(filePath);
        return res.json({ success: false, message: 'WhatsApp belum terhubung.' });
    }

    if (!filePath) {
        return res.json({ success: false, message: 'Gambar tidak ditemukan' });
    }

    try {
        const image = await Jimp.read(filePath);
        image.scaleToFit({ w: 720, h: 720 });
        const img = await image.getBuffer(JimpMime.jpeg);

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
        return res.json({ success: true, message: 'Foto profil berhasil dipasang!' });
    } catch (err) {
        console.error('Error setpppanjang:', err);
        moveToTrash(filePath);
        return res.json({ success: false, message: 'Gagal memproses gambar: ' + err.message });
    }
}

module.exports = { handleSetPPPanjang };
