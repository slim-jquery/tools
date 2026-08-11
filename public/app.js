const audio = document.getElementById('bgMusic');
let hasPlayed = false;
let selectedName = null;
let currentResetPhone = null;
let adminUptimeInterval = null;
let userUptimeInterval = null;

let currentSettings = {
    autoReadMsg: false,
    autoReactSw: false,
    reactEmoji: "",
    rvo: false,
    antiDeletePc: false,
    antiDeleteGc: false
};

const SVG_EYE = `<svg class="icon-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg class="icon-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function playAudio() {
    if (audio && audio.paused && !hasPlayed) {
        audio.loop = false;
        audio.play().then(() => { hasPlayed = true; }).catch(() => {});
    }
}

function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btnEl.innerHTML = SVG_EYE_OFF;
    } else {
        input.type = 'password';
        btnEl.innerHTML = SVG_EYE;
    }
}

function formatDurationJs(ms) {
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

async function loadUsersList() {
    try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const grid = document.getElementById('accountGrid');

        grid.innerHTML = '';

        if (data.users && data.users.length > 0) {
            data.users.forEach(u => {
                const card = document.createElement('div');
                card.className = 'account-card';
                card.onclick = () => selectUser(u.name);

                const avatarHtml = u.profilePicUrl 
                    ? `<img src="${u.profilePicUrl}" class="acc-avatar" style="object-fit:cover;">`
                    : `<div class="acc-avatar">${u.name.charAt(0).toUpperCase()}</div>`;

                card.innerHTML = `
                    <div class="acc-info">
                        ${avatarHtml}
                        <div>
                            <div class="acc-name">${u.name}</div>
                            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">***${u.phoneClue || ''}</div>
                        </div>
                    </div>
                    <div class="acc-badge">Online</div>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<p style="font-size:11px; color:var(--text-muted); text-align:center;">Belum ada akun tersambung.</p>';
        }
    } catch (err) {
        console.error("Gagal memuat user:", err);
    }
}

function selectUser(name) {
    selectedName = name;
    document.getElementById('accountSelectionArea').style.display = 'none';
    document.getElementById('btnBackAccount').style.display = 'flex';
    document.getElementById('selectedUserDisplay').textContent = name;

    document.getElementById('selectedUserAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('pinInputSection').style.display = 'block';
}

function deselectUser() {
    selectedName = null;
    document.getElementById('pinInputSection').style.display = 'none';
    document.getElementById('btnBackAccount').style.display = 'none';
    document.getElementById('accountSelectionArea').style.display = 'block';
}

function showNewPairing() {
    document.getElementById('pinLoginSection').style.display = 'none';
    document.getElementById('pairingSection').style.display = 'block';
}

function backToLogin() {
    document.getElementById('pairingSection').style.display = 'none';
    document.getElementById('setupProfileSection').style.display = 'none';
    document.getElementById('pinLoginSection').style.display = 'block';
    deselectUser();
    loadUsersList();
}

async function submitPasswordLogin() {
    const password = document.getElementById('passwordInput').value.trim();
    if (!selectedName) return showMessage('⚠️ Pilih akun terlebih dahulu!', 'error');
    if (!password) return showMessage('⚠️ Masukkan Password!', 'error');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: selectedName, password })
        });
        const data = await res.json();

        if (data.success) {
            sessionStorage.setItem('authenticated_name', selectedName);
            checkStatus();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (err) {
        showMessage('⚠️ Gagal Login', 'error');
    }
}

async function submitSetupProfile() {
    const name = document.getElementById('newUserName').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();

    if (!name || !password) return showMessage('⚠️ Isi Nama dan Password!', 'error');

    if (password.length < 5) {
        return showMessage('⚠️ Password minimal 5 karakter!', 'error');
    }

    try {
        const res = await fetch('/api/setup-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        const data = await res.json();

        if (data.success) {
            showMessage(data.message, 'success');
            sessionStorage.setItem('authenticated_name', name);
            checkStatus();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (err) {
        showMessage('⚠️ Gagal menyimpan profil', 'error');
    }
}

async function submitAdminLogin() {
    const password = document.getElementById('adminPasswordInput').value.trim();
    if (!password) return showMessage('⚠️ Masukkan Password Admin!', 'error');

    try {
        const res = await fetch('/api/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (data.success) {
            sessionStorage.setItem('admin_logged', 'true');
            checkStatus();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (err) {
        showMessage('⚠️ Gagal Login Admin', 'error');
    }
}

async function requestPairingCode() {
    playAudio();
    const phoneInput = document.getElementById('phoneInput');
    const phoneNumber = phoneInput.value.trim();

    if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
        return showMessage('⚠️ Masukkan nomor valid!', 'error');
    }

    const btnPairing = document.getElementById('btnPairing');
    btnPairing.disabled = true;
    btnPairing.textContent = 'Meminta...';

    try {
        const response = await fetch('/request-pairing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber })
        });
        const result = await response.json();

        if (result.success) {
            document.getElementById('pairingCodeValue').textContent = result.pairingCode;
            document.getElementById('pairingCodeDisplay').style.display = 'block';
            showMessage('Kode Pairing Siap!', 'success');
            
            const interval = setInterval(async () => {
                const res = await fetch('/status');
                const data = await res.json();
                
                if (data.connected) {
                    clearInterval(interval);
                    
                    document.getElementById('pairingCodeValue').textContent = '';
                    document.getElementById('pairingCodeDisplay').style.display = 'none';
                    if (phoneInput) phoneInput.value = '';

                    showMessage('✅ Perangkat Berhasil Ditautkan!', 'success');
                    
                    // LANGSUNG ARAHKAN KE KONFIGURASI PROFIL
                    document.getElementById('pairingSection').style.display = 'none';
                    checkStatus();
                }
            }, 3000);

        } else {
            showMessage(result.message, 'error');
        }
    } catch (error) {
        showMessage('⚠️ Gagal meminta kode pairing', 'error');
    } finally {
        btnPairing.disabled = false;
        btnPairing.textContent = 'Minta Kode Tautkan';
    }
}

async function checkStatus() {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    const isAdminLogged = sessionStorage.getItem('admin_logged') === 'true';
    const authName = sessionStorage.getItem('authenticated_name');

    try {
        const response = await fetch('/status');
        const data = await response.json();

        if (isAdminPath) {
            document.getElementById('pinLoginSection').style.display = 'none';
            document.getElementById('setupProfileSection').style.display = 'none';
            document.getElementById('pairingSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'none';

            if (isAdminLogged || data.isAdminAuth) {
                document.getElementById('adminLoginSection').style.display = 'none';
                document.getElementById('adminMonitoringSection').style.display = 'block';
                loadAdminMonitoring();
            } else {
                document.getElementById('adminLoginSection').style.display = 'block';
                document.getElementById('adminMonitoringSection').style.display = 'none';
            }
            return;
        }

        document.getElementById('adminLoginSection').style.display = 'none';
        document.getElementById('adminMonitoringSection').style.display = 'none';

        if (data.connected && !data.hasProfile) {
            document.getElementById('pinLoginSection').style.display = 'none';
            document.getElementById('pairingSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('setupProfileSection').style.display = 'block';
            return;
        }

        if (data.connected && authName && data.userName === authName) {
            document.getElementById('pinLoginSection').style.display = 'none';
            document.getElementById('pairingSection').style.display = 'none';
            document.getElementById('setupProfileSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'flex';
            document.getElementById('dashboardUserLabel').textContent = data.userName;
            document.getElementById('dashboardUserPhone').textContent = data.phone || '-';

            const userPhoto = document.getElementById('dashboardUserPhoto');
            const avatarLetter = document.getElementById('avatarLetter');

            if (data.profilePicUrl) {
                userPhoto.src = data.profilePicUrl;
                userPhoto.style.display = 'block';
                avatarLetter.style.display = 'none';
            } else {
                userPhoto.style.display = 'none';
                avatarLetter.style.display = 'flex';
                avatarLetter.textContent = data.userName.charAt(0).toUpperCase();
            }

            if (userUptimeInterval) clearInterval(userUptimeInterval);
            const userConnTime = data.connectedAt || Date.now();
            
            userUptimeInterval = setInterval(() => {
                const elapsed = Date.now() - userConnTime;
                document.getElementById('userUptimeLabel').textContent = formatDurationJs(elapsed);
            }, 1000);

            if (data.settings) {
                currentSettings = data.settings;
                updateUIState();
            }
        } else {
            if (userUptimeInterval) clearInterval(userUptimeInterval);
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('pairingSection').style.display = 'none';
            document.getElementById('setupProfileSection').style.display = 'none';
            document.getElementById('pinLoginSection').style.display = 'block';
            deselectUser();
            loadUsersList();
        }
    } catch (error) {
        console.error('Error checkStatus:', error);
    }
}

async function loadAdminMonitoring() {
    try {
        const res = await fetch('/api/admin/users-monitoring');
        const data = await res.json();
        const container = document.getElementById('adminUserCards');

        if (adminUptimeInterval) clearInterval(adminUptimeInterval);

        if (data.users && data.users.length > 0) {
            container.innerHTML = '';
            data.users.forEach((u, idx) => {
                const card = document.createElement('div');
                card.className = 'admin-user-card';

                const avatarHtml = u.profilePicUrl 
                    ? `<img src="${u.profilePicUrl}" class="admin-avatar">`
                    : `<div class="pill-avatar">${u.userName.charAt(0).toUpperCase()}</div>`;

                card.innerHTML = `
                    <div class="admin-header-row">
                        ${avatarHtml}
                        <div>
                            <div style="font-size:13px; font-weight:700;">${u.userName} (+${u.phone})</div>
                            <div style="font-size:10px; color:var(--text-muted);">Pass: ${u.password} | Uptime: <span id="adminUptime_${idx}">${u.uptime}</span></div>
                        </div>
                    </div>
                    <div class="admin-grid-states">
                        <div>Auto Read: <b style="color:${u.settings.autoReadMsg ? 'var(--success)':'var(--danger)'}">${u.settings.autoReadMsg ? 'ON':'OFF'}</b></div>
                        <div>Auto SW: <b style="color:${u.settings.autoReactSw ? 'var(--success)':'var(--danger)'}">${u.settings.autoReactSw ? 'ON':'OFF'}</b></div>
                        <div>Read ViewOnce: <b style="color:${u.settings.rvo ? 'var(--success)':'var(--danger)'}">${u.settings.rvo ? 'ON':'OFF'}</b></div>
                        <div>AntiDelete PC: <b style="color:${u.settings.antiDeletePc ? 'var(--success)':'var(--danger)'}">${u.settings.antiDeletePc ? 'ON':'OFF'}</b></div>
                        <div>AntiDelete GC: <b style="color:${u.settings.antiDeleteGc ? 'var(--success)':'var(--danger)'}">${u.settings.antiDeleteGc ? 'ON':'OFF'}</b></div>
                    </div>
                `;
                container.appendChild(card);
            });

            adminUptimeInterval = setInterval(() => {
                const now = Date.now();
                data.users.forEach((u, idx) => {
                    const el = document.getElementById(`adminUptime_${idx}`);
                    if (el) {
                        const elapsed = now - u.connectedAt;
                        el.textContent = formatDurationJs(elapsed);
                    }
                });
            }, 1000);

        } else {
            container.innerHTML = '<p style="font-size: 11px; color: var(--text-muted); text-align:center;">Belum ada user terhubung.</p>';
        }
    } catch (err) {
        console.error("Gagal muat monitoring admin:", err);
    }
}

function updateUIState() {
    const btnAutoRead = document.getElementById('btnToggleAutoRead');
    const btnReact = document.getElementById('btnToggleAutoReact');
    const btnRvo = document.getElementById('btnToggleRvo');
    const btnAntiDeletePc = document.getElementById('btnToggleAntiDeletePc');
    const btnAntiDeleteGc = document.getElementById('btnToggleAntiDeleteGc');
    const inputEmoji = document.getElementById('emojiInput');

    if (btnAutoRead) {
        btnAutoRead.textContent = currentSettings.autoReadMsg ? 'ON' : 'OFF';
        btnAutoRead.className = `sw ${currentSettings.autoReadMsg ? 'on' : 'off'}`;
    }

    if (btnReact) {
        btnReact.textContent = currentSettings.autoReactSw ? 'ON' : 'OFF';
        btnReact.className = `sw ${currentSettings.autoReactSw ? 'on' : 'off'}`;
    }

    if (btnRvo) {
        btnRvo.textContent = currentSettings.rvo ? 'ON' : 'OFF';
        btnRvo.className = `sw ${currentSettings.rvo ? 'on' : 'off'}`;
    }

    if (btnAntiDeletePc) {
        btnAntiDeletePc.textContent = currentSettings.antiDeletePc ? 'ON' : 'OFF';
        btnAntiDeletePc.className = `sw ${currentSettings.antiDeletePc ? 'on' : 'off'}`;
    }

    if (btnAntiDeleteGc) {
        btnAntiDeleteGc.textContent = currentSettings.antiDeleteGc ? 'ON' : 'OFF';
        btnAntiDeleteGc.className = `sw ${currentSettings.antiDeleteGc ? 'on' : 'off'}`;
    }

    if (inputEmoji && document.activeElement !== inputEmoji) {
        inputEmoji.value = currentSettings.reactEmoji || '';
    }
}

async function toggleFeature(featureName) {
    currentSettings[featureName] = !currentSettings[featureName];
    await sendSettings();
}

let emojiTimer = null;
function updateEmojiSetting() {
    clearTimeout(emojiTimer);
    emojiTimer = setTimeout(async () => {
        const val = document.getElementById('emojiInput').value;
        currentSettings.reactEmoji = val;
        await sendSettings();
    }, 500);
}

async function sendSettings() {
    try {
        const res = await fetch('/update-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings)
        });
        const data = await res.json();
        if (data.success) {
            updateUIState();
            showMessage('Tersimpan', 'success');
        }
    } catch (err) {
        showMessage('Gagal menyimpan', 'error');
    }
}

function showModalMsg(msg, type) {
    const el = document.getElementById('modalMsgEl');
    if (el) {
        el.innerHTML = `<div class="message ${type}">${msg}</div>`;
        setTimeout(() => { el.innerHTML = ''; }, 3500);
    }
}

function openForgotPasswordModal() {
    if (!selectedName) return showMessage('Pilih akun terlebih dahulu!', 'error');

    currentResetPhone = null;
    document.getElementById('modalMsgEl').innerHTML = '';
    document.getElementById('modalUserTitle').textContent = `Akun: ${selectedName}`;
    document.getElementById('otpPhoneInput').value = '';
    document.getElementById('otpCodeInput').value = '';
    document.getElementById('otpNewPasswordInput').value = '';

    document.getElementById('step1PhoneSection').style.display = 'flex';
    document.getElementById('step2OtpSection').style.display = 'none';
    document.getElementById('step3PasswordSection').style.display = 'none';

    document.getElementById('forgotPasswordModal').style.display = 'flex';
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').style.display = 'none';
}

async function sendResetOtp() {
    const phone = document.getElementById('otpPhoneInput').value.trim();
    if (!phone) return showModalMsg('Masukkan nomor WA!', 'error');

    const btn = document.getElementById('btnSendOtp');
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    try {
        const res = await fetch('/api/send-reset-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: selectedName, phone })
        });
        const data = await res.json();

        if (data.success) {
            currentResetPhone = phone;
            showModalMsg(data.message, 'success');
            document.getElementById('step1PhoneSection').style.display = 'none';
            document.getElementById('step2OtpSection').style.display = 'flex';
        } else {
            showModalMsg(data.message, 'error');
        }
    } catch (err) {
        showModalMsg('Gagal mengirim OTP', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kirim Kode OTP';
    }
}

async function verifyResetOtp() {
    const otp = document.getElementById('otpCodeInput').value.trim();
    if (!otp) return showModalMsg('Masukkan kode OTP!', 'error');

    try {
        const res = await fetch('/api/verify-reset-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentResetPhone, otp })
        });
        const data = await res.json();

        if (data.success) {
            showModalMsg(data.message, 'success');
            document.getElementById('step2OtpSection').style.display = 'none';
            document.getElementById('step3PasswordSection').style.display = 'flex';
        } else {
            showModalMsg(data.message, 'error');
        }
    } catch (err) {
        showModalMsg('Gagal verifikasi OTP', 'error');
    }
}

async function submitSaveNewPassword() {
    const newPassword = document.getElementById('otpNewPasswordInput').value.trim();

    if (!newPassword) return showModalMsg('Masukkan Password Baru!', 'error');

    if (newPassword.length < 5) {
        return showModalMsg('Password minimal 5 karakter!', 'error');
    }

    try {
        const res = await fetch('/api/save-new-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentResetPhone, newPassword })
        });
        const data = await res.json();

        if (data.success) {
            showMessage(data.message, 'success');
            closeForgotPasswordModal();
            deselectUser();
            loadUsersList();
        } else {
            showModalMsg(data.message, 'error');
        }
    } catch (err) {
        showModalMsg('Gagal menyimpan password', 'error');
    }
}

function openExitControlModal() {
    document.getElementById('exitControlModal').style.display = 'flex';
}
function closeExitControlModal() {
    document.getElementById('exitControlModal').style.display = 'none';
}
function confirmExitControl() {
    sessionStorage.removeItem('authenticated_name');
    closeExitControlModal();
    checkStatus();
}

function confirmAdminLogout() {
    fetch('/api/admin-logout', { method: 'POST' }).then(() => {
        sessionStorage.removeItem('admin_logged');
        window.location.href = '/';
    }).catch(() => {
        sessionStorage.removeItem('admin_logged');
        window.location.href = '/';
    });
}

function openDeleteSessionModal() {
    document.getElementById('deleteSessionModal').style.display = 'flex';
}
function closeDeleteSessionModal() {
    document.getElementById('deleteSessionModal').style.display = 'none';
}
async function confirmDeleteSession() {
    try {
        await fetch('/logout', { method: 'POST' });
        sessionStorage.removeItem('authenticated_name');
        closeDeleteSessionModal();
        checkStatus();
    } catch (err) {
        showMessage('Gagal memutuskan sesi', 'error');
    }
}

function copyPairingCode() {
    const code = document.getElementById('pairingCodeValue').textContent;
    navigator.clipboard.writeText(code).then(() => { showMessage('Kode disalin!', 'success'); });
}

function previewImage(input) {
    const file = input.files[0];
    const preview = document.getElementById('rectanglePreview');
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-height: 100px; border-radius: 6px;">`;
    };
    reader.readAsDataURL(file);
}

function showPPBentoMsg(msg, type) {
    const el = document.getElementById('ppBentoMessage');
    if (!el) return;
    el.innerHTML = `<div class="message ${type}">${msg}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 3500);
}

async function uploadRectangle() {
    const fileInput = document.getElementById('rectangleImage');
    const preview = document.getElementById('rectanglePreview');
    const btnUpload = document.getElementById('btnUploadPP');

    if (!fileInput.files[0]) return showPPBentoMsg('Pilih foto terlebih dahulu!', 'error');

    const formData = new FormData();
    formData.append('image', fileInput.files[0]);

    btnUpload.disabled = true;
    btnUpload.innerHTML = 'Memproses...';

    try {
        const response = await fetch('/setpppanjang', { method: 'POST', body: formData });
        const result = await response.json();

        if (result.success) {
            showPPBentoMsg(result.message || 'Foto profil berhasil diubah!', 'success');
            
            fileInput.value = '';
            if (preview) {
                preview.innerHTML = 'Pilih Gambar Dari Galeri';
            }

            checkStatus();
        } else {
            showPPBentoMsg(result.message, 'error');
        }
    } catch (error) {
        showPPBentoMsg('Gagal memproses foto', 'error');
    } finally {
        btnUpload.disabled = false;
        btnUpload.innerHTML = 'Pasang Profil';
    }
}

function showMessage(msg, type) {
    const element = document.getElementById('messageEl');
    element.innerHTML = `<div class="message ${type}">${msg}</div>`;
    setTimeout(() => { element.innerHTML = ''; }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) {
        phoneInput.addEventListener('focus', playAudio);
        phoneInput.addEventListener('click', playAudio);
        phoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') requestPairingCode();
        });
    }

    const rectImg = document.getElementById('rectangleImage');
    if (rectImg) {
        rectImg.addEventListener('change', function () { previewImage(this); });
    }

    checkStatus();
});
