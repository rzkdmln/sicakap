// Mengimpor semua fungsi yang diperlukan dari api.js
import {
    login, logout, checkSession, fetchPencatatan, createPencatatan,
    updatePencatatan, deletePencatatan, fetchStatistik, backupDatabase,
    backupArsip, fetchAllRedaksi, createRedaksi, updateRedaksi,
    deleteRedaksi, uploadArsip, setupDatabase, bookRegNumber,
    releaseRegNumber, confirmRegNumber, getSettings, updateSettings,
    resetNumbers, downloadArsip, resetDailyNumbers, getDateStatistics,
    switchSystemDate
} from './api.js';
import { initRedaksiManagement } from './redaksi.js';

// State global untuk pagination dan filter
let currentPage = 1;

// Variabel global untuk melacak nomor registrasi yang sedang di-booking
let currentBookedNumber = null;

// State untuk sub-tab redaksi
let currentRedaksiSubtab = 'kepindahan';

// Mengambil elemen-elemen DOM yang sering digunakan
const loginModal = document.getElementById('loginModal');
const app = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const notification = document.getElementById('notification');
const arsipPreviewModal = document.getElementById('arsipPreviewModal');
const arsipPreviewContainer = document.getElementById('arsipPreviewContainer');
const closePreviewBtn = document.getElementById('closePreviewBtn');

// Helper: hitung No. Arsip yyyymmdd_{NoReg}_{Kode}
function computeArchiveCode() {
    const regDateEl = document.getElementById('regDate');
    const regNumberEl = document.getElementById('regNumber');
    const serviceCodeEl = document.getElementById('serviceCode');
    const archiveCodeEl = document.getElementById('archiveCode');
    if (!archiveCodeEl) return;

    const regDate = (regDateEl?.value || '').trim();      // format input: YYYY-MM-DD
    const yyyymmdd = regDate ? regDate.replaceAll('-', '') : '';
    const regNum = (regNumberEl?.value || '').trim();
    const svc = (serviceCodeEl?.value || '').trim().toUpperCase();

    // Hanya tampilkan jika ketiganya terisi
    if (yyyymmdd && regNum && svc) {
        archiveCodeEl.value = `${yyyymmdd}_${regNum}_${svc}`;
    } else {
        archiveCodeEl.value = '';
    }
}

// Function to set default date
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const lastAccessDate = localStorage.getItem('sicakap_last_access_date');
    const savedDate = localStorage.getItem('sicakap_current_date');
    
    // Check if it's a new day since last access
    const isNewDay = lastAccessDate !== today;
    
    // On a new day, always use today's date by default
    const defaultDate = isNewDay ? today : (savedDate || today);
    
    const regDateEl = document.getElementById('regDate');
    if (regDateEl) {
        regDateEl.value = defaultDate;
    }
    
    // Save today as last access date
    localStorage.setItem('sicakap_last_access_date', today);
    
    // If it's explicitly a new day, update current date preference
    if (isNewDay) {
        localStorage.setItem('sicakap_current_date', today);
        console.log(`New day detected! Updated to: ${today}`);
    }
    
    // Update No. Arsip jika memungkinkan
    computeArchiveCode();
    
    // Check for date change and sync registration number
    checkDateChange(isNewDay);
}

// Inisialisasi aplikasi saat DOM selesai dimuat
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App starting...');
    
    // Set tanggal default pada form input
    setDefaultDate();
    
    // Deteksi host saat ini (untuk pengembangan vs produksi)
    const currentHost = window.location.host;
    console.log('Current host:', currentHost);
    
    // Di masa depan, URL API bisa diubah di sini jika diperlukan
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.log('Running on a server, API URL should be configured correctly.');
        // Logika untuk mengubah API_URL di api.js bisa ditambahkan di sini
    }
    
    await initializeApp();
    
    // Initialize sidebar toggle functionality
    initializeSidebarToggle();
    
    // Initialize redaksi management after a short delay to ensure DOM is ready
    setTimeout(() => {
        if (typeof initRedaksiManagement === 'function') {
            initRedaksiManagement();
            console.log('Redaksi management initialized'); // Debug log
        } else {
            console.error('initRedaksiManagement function not found');
        }
    }, 100);

    // Set default values dan update fields setelah DOM siap
    setTimeout(() => {
        updateDynamicFields();
        
        // Add event listeners untuk copy buttons
        document.getElementById('copyRedaksiProses')?.addEventListener('click', () => {
            copyRedaksiToClipboard('redaksiProses');
        });
        
        document.getElementById('copyRedaksiBerhasil')?.addEventListener('click', () => {
            copyRedaksiToClipboard('redaksiBerhasil');
        });
        
        // Add event listeners untuk update redaksi saat field berubah
        document.getElementById('regDate')?.addEventListener('change', async (e) => {
            const newDate = e.target.value;
            
            // Save selected date
            localStorage.setItem('sicakap_current_date', newDate);
            
            // Switch system date and refresh registration number
            try {
                // Release current booked number first
                if (currentBookedNumber) {
                    await releaseRegNumber(currentBookedNumber);
                    currentBookedNumber = null;
                }
                
                // Switch to new date
                await switchSystemDate(newDate);
                
                // Get new registration number for the new date
                if (document.getElementById('input').classList.contains('active')) {
                    setTimeout(() => {
                        loadInputPage();
                    }, 300);
                }
                
                showNotification(`Beralih ke tanggal ${new Date(newDate).toLocaleDateString('id-ID')}`, 'info');
            } catch (error) {
                console.log('Date switch not available, using local mode');
            }
            
            updateRedaksiFields();
        });
        
        document.getElementById('email')?.addEventListener('input', updateRedaksiFields);
        document.getElementById('noSKPWNI')?.addEventListener('input', updateRedaksiFields);
        document.getElementById('noKK')?.addEventListener('input', updateRedaksiFields);
        
    }, 500);
});

// Fungsi untuk memeriksa sesi dan menampilkan halaman yang sesuai
async function initializeApp() {
    try {
        console.log('Checking session...');
        const sessionResult = await checkSession();
        console.log('Session check result:', sessionResult);
        
        if (sessionResult.logged_in) {
            console.log('Already logged in, showing app...');
            showApp();
            loadDashboard();
        } else {
            console.log('Not logged in, showing login form...');
            showLogin();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        console.log('Showing login form due to session check failure...');
        showLogin();
    }
}

// Fungsi untuk menampilkan halaman login
function showLogin() {
    loginModal.style.display = 'flex';
    app.style.display = 'none';
}

// Fungsi untuk menampilkan aplikasi utama
function showApp() {
    loginModal.style.display = 'none';
    app.style.display = 'flex';
}

// Handler untuk form login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.textContent = '';
        loginError.style.display = 'none';
    }
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    console.log('Form submitted with:', { username, password: '***' });
    
    if (!username || !password) {
        const errorMessage = 'Username dan password harus diisi';
        if (loginError) {
            loginError.textContent = errorMessage;
            loginError.style.display = 'block';
        } else {
            alert(errorMessage);
        }
        return;
    }
    
    try {
        console.log('Attempting login...');
        const result = await login(username, password);
        console.log('Login result:', result);
        
        if (result.message && result.message === 'Login berhasil') {
            console.log('Login successful, showing app...');
            showNotification('Login berhasil!', 'success');
            showApp();
            loadDashboard();
            loginForm.reset();
            
            // Initialize session management
            await initializeSessionManagement(result);
        } else {
            const errorMessage = result.error || 'Response tidak valid dari server';
            console.error('Login failed:', errorMessage);
            if (loginError) {
                loginError.textContent = errorMessage;
                loginError.style.display = 'block';
            } else {
                alert(`Login gagal: ${errorMessage}`);
            }
        }
    } catch (error) {
        console.error('Login network error:', error);
        const errorMessage = 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
        if (loginError) {
            loginError.textContent = errorMessage;
            loginError.style.display = 'block';
        } else {
            alert(errorMessage);
        }
    }
});

// Handler untuk tombol logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        console.log('Logout button clicked');
        
        // Clear all session timers safely
        if (sessionConfig.warningTimer) {
            clearTimeout(sessionConfig.warningTimer);
            sessionConfig.warningTimer = null;
        }
        if (sessionConfig.sessionTimer) {
            clearTimeout(sessionConfig.sessionTimer);
            sessionConfig.sessionTimer = null;
        }
        if (activityUpdateTimer) {
            clearTimeout(activityUpdateTimer);
            activityUpdateTimer = null;
        }
        
        // Release any booked registration number
        if (currentBookedNumber) {
            try {
                await releaseRegNumber(currentBookedNumber);
                currentBookedNumber = null;
            } catch (error) {
                console.log('Failed to release reg number during logout:', error);
            }
        }
        
        // Perform logout API call
        await logout();
        
        // Show success notification
        showNotification('Logout berhasil!', 'success');
        
        // Show login screen
        showLogin();
        loginForm.reset();
        
        // Clear login error
        if (loginError) {
            loginError.textContent = '';
            loginError.style.display = 'none';
        }
        
        // Reset session config to defaults
        sessionConfig = {
            timeout: 3600, // 60 minutes
            warningTime: 3000, // 5 minutes
            lastActivity: null,
            warningShown: false,
            warningTimer: null,
            sessionTimer: null,
            activityTimer: null
        };
        
        // Reset UI state
        toggleFloatingRegNumber(false);
        
        console.log('Logout completed successfully');
        
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Gagal saat proses logout.', 'error');
        
        // Force logout even if API fails
        showLogin();
        loginForm.reset();
        
        // Reset session config anyway
        sessionConfig = {
            timeout: 120,
            warningTime: 10,
            lastActivity: null,
            warningShown: false,
            warningTimer: null,
            sessionTimer: null,
            activityTimer: null
        };
        
        // Clear timers anyway
        if (activityUpdateTimer) {
            clearTimeout(activityUpdateTimer);
            activityUpdateTimer = null;
        }
    }
});

// Handler untuk navigasi menu
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) {
            showPage(page);
            setActiveMenu(item);
        }
    });
});

function setActiveMenu(activeItem) {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    activeItem.classList.add('active');
}

function showPage(pageId) {
    if (currentBookedNumber && pageId !== 'input') {
        releaseRegNumber(currentBookedNumber).catch(err => console.error('Failed to release number on page change:', err));
        currentBookedNumber = null;
    }
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.add('active');
    }
    
    // Hide floating reg number when not on input page
    if (pageId !== 'input') {
        toggleFloatingRegNumber(false);
    }
    
    switch(pageId) {
        case 'dashboard': loadDashboard(); break;
        case 'data': loadDataTable(); break;
        case 'input': loadInputPage(); break;
        case 'formulir': loadFormulirPage(); break;
        case 'redaksi': loadRedaksi(); break;
        case 'pengaturan': loadPengaturan(); break;
    }
}

// Function to show/hide floating registration number
function toggleFloatingRegNumber(show = false, regNumber = null) {
    const floatingElement = document.getElementById('floatingRegNumber');
    const floatingValue = document.getElementById('floatingRegValue');
    
    if (!floatingElement || !floatingValue) return;
    
    if (show && regNumber) {
        floatingValue.textContent = regNumber;
        floatingElement.style.display = 'block';
        
        // Add pulse animation for new number
        floatingElement.classList.add('pulse');
        setTimeout(() => {
            floatingElement.classList.remove('pulse');
        }, 600);
    } else {
        floatingElement.style.display = 'none';
    }
}

// Function to update floating registration number
function updateFloatingRegNumber(regNumber) {
    const floatingValue = document.getElementById('floatingRegValue');
    const floatingElement = document.getElementById('floatingRegNumber');
    
    if (floatingValue && regNumber) {
        floatingValue.textContent = regNumber;
        
        // Add pulse animation when number changes
        if (floatingElement) {
            floatingElement.classList.add('pulse');
            setTimeout(() => {
                floatingElement.classList.remove('pulse');
            }, 600);
        }
    }
}

// Memuat halaman input dan memesan nomor registrasi baru
async function loadInputPage() {
    try {
        // Ensure we're using the correct date first
        const regDateEl = document.getElementById('regDate');
        if (regDateEl) {
            const currentDate = regDateEl.value;
            const systemDate = localStorage.getItem('sicakap_current_date');
            
            // If form date doesn't match system date, switch first
            if (currentDate !== systemDate) {
                await switchSystemDate(currentDate);
                localStorage.setItem('sicakap_current_date', currentDate);
            }
        }
        
        const result = await bookRegNumber();
        if (result.reg_number) {
            document.getElementById('regNumber').value = result.reg_number;
            currentBookedNumber = result.reg_number;

            // Hitung No. Arsip setelah mendapat No. Reg
            computeArchiveCode();

            // Show floating registration number
            toggleFloatingRegNumber(true, result.reg_number);

            const message = result.status === 'existing' 
                ? `Nomor registrasi sebelumnya dikembalikan: ${result.reg_number}`
                : `Nomor registrasi baru: ${result.reg_number}`;
            showNotification(message, result.status === 'existing' ? 'info' : 'success');
        }
    } catch (error) {
        console.error('Failed to book reg number:', error);
        showNotification('Gagal mendapatkan nomor registrasi', 'error');
        toggleFloatingRegNumber(false);
    }
}

// Memuat data statistik untuk dashboard
async function loadDashboard() {
    try {
        const stats = await fetchStatistik();
        document.getElementById('totalCount').textContent = stats.total || 0;
        document.getElementById('todayCount').textContent = stats.hari_ini || 0;
        document.getElementById('prosesCount').textContent = stats.per_status?.DIPROSES || 0;
        document.getElementById('selesaiCount').textContent = stats.per_status?.SELESAI || 0;
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showNotification('Gagal memuat data dashboard', 'error');
    }
}

// Memuat tabel data dengan filter dan pagination
async function loadDataTable(page = 1) {
    try {
        const params = new URLSearchParams({
            search: document.getElementById('searchInput').value.trim(),
            status: document.getElementById('statusFilter').value,
            service_code: document.getElementById('serviceFilter').value,
            start_date: document.getElementById('startDateFilter').value,
            end_date: document.getElementById('endDateFilter').value,
            page: page,
            per_page: 20
        });

        // Hapus parameter kosong
        for (const [key, value] of params.entries()) {
            if (!value) {
                params.delete(key);
            }
        }
        
        const res = await fetch(`/api/pencatatan?${params.toString()}`, { credentials: 'include' });
        const data = await res.json();

        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = ''; // Kosongkan tabel sebelum diisi

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Data tidak ditemukan.</td></tr>`;
        } else {
            data.forEach(item => {
                const row = document.createElement('tr');
                // Ubah: const filename = item.archive_path ? item.archive_path.split(/[\\/]/).pop() : null;
                // const arsipCol = filename
                //     ? `<button class="btn-sm btn-secondary" title="Preview Arsip" onclick="window.previewArsip('${filename}')">🔍</button>`
                //     : `<span class="status-badge status-ditolak" title="Belum ada arsip">✗</span>`;
                const archivePath = item.archive_path || '';
                const arsipCol = archivePath
                    ? `<button class="btn-sm btn-secondary" title="Preview Arsip" onclick="window.previewArsip('${archivePath.replace(/\\/g, '/')}')">🔍</button>`
                    : `<span class="status-badge status-ditolak" title="Belum ada arsip">✗</span>`;


                // Generate archive code: yyyymmdd_regNumber_serviceCode
                const regDate = new Date(item.reg_date);
                const yyyymmdd = regDate.getFullYear().toString() + 
                    (regDate.getMonth() + 1).toString().padStart(2, '0') + 
                    regDate.getDate().toString().padStart(2, '0');
                const archiveCode = `${yyyymmdd}_${item.reg_number}_${item.service_code || ''}`;
                
                // Add service code class for color coding
                const serviceCodeClass = item.service_code ? `service-${item.service_code}` : '';
                
                row.innerHTML = `
                    <td>${item.reg_number}</td>
                    <td>${new Date(item.reg_date).toLocaleDateString('id-ID')}</td>
                    <td>${item.nik}</td>
                    <td>${item.name}</td>
                    <td><span class="status-badge status-${item.status ? item.status.toLowerCase() : ''}">${item.status || ''}</span></td>
                    <td><code class="archive-code ${serviceCodeClass}">${archiveCode}</code></td>
                    <td>${arsipCol}</td>
                    <td>
                        <button class="btn-sm btn-view" onclick="window.viewData(${item.id})">👁️ Lihat</button>
                        <button class="btn-sm btn-edit" onclick="editData(${item.id})">✏️ Edit</button>
                        <button class="btn-sm btn-delete" onclick="deleteData(${item.id})">🗑️ Hapus</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
        
        document.getElementById('pageInfo').textContent = `Halaman ${page}`;
        currentPage = page;
    } catch (error) {
        console.error('Failed to load data table:', error);
        showNotification('Gagal memuat data pencatatan', 'error');
        document.getElementById('dataTableBody').innerHTML = `<tr><td colspan="8" style="text-align:center; color: red;">Gagal memuat data.</td></tr>`;
    }
}

// Event handler untuk filter dan pagination pada tabel data
document.getElementById('searchBtn')?.addEventListener('click', () => loadDataTable(1));
document.getElementById('searchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadDataTable(1); });
document.getElementById('statusFilter')?.addEventListener('change', () => loadDataTable(1));
document.getElementById('serviceFilter')?.addEventListener('change', () => loadDataTable(1));
document.getElementById('startDateFilter')?.addEventListener('change', () => loadDataTable(1));
document.getElementById('endDateFilter')?.addEventListener('change', () => loadDataTable(1));
document.getElementById('prevBtn')?.addEventListener('click', () => { if (currentPage > 1) loadDataTable(currentPage - 1); });
document.getElementById('nextBtn')?.addEventListener('click', () => loadDataTable(currentPage + 1));

// Add input event listeners for real-time validation and auto-complete
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
});

// Global function untuk updateDynamicFields agar bisa dipanggil dari HTML
window.updateDynamicFields = function() {
    const code = document.getElementById('serviceCode').value;
    const fields = {
        'fieldNoSKPWNI': 'noSKPWNI',
        'fieldNoSKDWNI': 'noSKDWNI',
        'fieldNoSKBWNI': 'noSKBWNI',
        'fieldNoKK': 'noKK'
    };

    // Sembunyikan dan reset semua field dinamis
    for (const [fieldId, inputId] of Object.entries(fields)) {
        const fieldElement = document.getElementById(fieldId);
        const inputElement = document.getElementById(inputId);
        if (fieldElement && inputElement) {
            fieldElement.style.display = 'none';
            inputElement.required = false;
            inputElement.value = ''; // Reset value
        }
    }

    // Tampilkan dan set 'required' sesuai kode layanan
    const showAndRequire = (fieldIds) => {
        fieldIds.forEach(id => {
            const fieldElement = document.getElementById(id);
            const inputElement = document.getElementById(fields[id]);
            if (fieldElement && inputElement) {
                fieldElement.style.display = 'block';
                inputElement.required = true;
            }
        });
    };

    console.log('Service code changed to:', code); // Debug log

    if (code === 'P') {
        showAndRequire(['fieldNoSKPWNI']);
        console.log('Showing SKPWNI field for Pindah');
    } else if (code === 'D') {
        showAndRequire(['fieldNoSKDWNI', 'fieldNoKK']);
        console.log('Showing SKDWNI and KK fields for Datang');
    } else if (code === 'B') {
        showAndRequire(['fieldNoSKBWNI', 'fieldNoKK']);
        console.log('Showing SKBWNI and KK fields for Batal');
    } else if (code === 'BP') {
        showAndRequire(['fieldNoSKBWNI', 'fieldNoSKPWNI']);
        console.log('Showing SKBWNI and SKPWNI fields for Batal & Pindah Ulang');
    } else if (code === 'PSD') {
        showAndRequire(['fieldNoKK']);
        console.log('Showing KK field for Pindah Satu Desa');
    } else if (code === 'L') {
        showAndRequire(Object.keys(fields));
        console.log('Showing all fields for Lokal');
    }

    // Update No. Arsip saat kode layanan berubah
    computeArchiveCode();
    // Update Redaksi berdasarkan kode layanan
    updateRedaksiFields();
};

// Function untuk update redaksi fields
window.updateRedaksiFields = function() {
    const code = document.getElementById('serviceCode').value;
    const regDate = document.getElementById('regDate').value;
    const regNumber = document.getElementById('regNumber').value;
    const email = document.getElementById('email').value;
    
    const redaksiProsesEl = document.getElementById('redaksiProses');
    const redaksiBerhasilEl = document.getElementById('redaksiBerhasil');
    
    if (!code || !regDate || !regNumber) {
        if (redaksiProsesEl) redaksiProsesEl.value = '';
        if (redaksiBerhasilEl) redaksiBerhasilEl.value = '';
        return;
    }
    
    const yyyymmdd = regDate.replace(/-/g, '');
    const archiveCode = `${yyyymmdd}_${regNumber}_${code}`;
    
    let redaksiProses = '';
    let redaksiBerhasil = '';
    
    if (code === 'P' || code === 'BP') {
        // Redaksi untuk Pindah dan Batal & Pindah Ulang
        redaksiProses = `${archiveCode} Terima kasih, pengajuan Anda telah selesai. Saat ini surat Kepindahan sedang dalam proses ditanda tangani oleh Kepala Dinas, setelah itu akan otomatis terkirim ke email Anda. Mohon DICEK dan DI-REFRESH secara berkala di FOLDER UTAMA atau FOLDER SPAM, sampai Surat Keterangan Pindah terkirim ke email Anda (maksimal dua hari kerja). Selanjutnya Anda dapat mengunduh dan mencetaknya secara mandiri dengan membuka email tersebut di komputer/laptop, lalu serahkan Surat Keterangan Pindah beserta KTP-el asli Anda kepada Dinas Kependudukan daerah tujuan. Dokumen SKPWNI hanya berlaku selama 100 hari sejak tanggal diterbitkan.`;
        
        // Sensor dua digit terakhir SKPWNI
        const noSkpwni = document.getElementById('noSKPWNI')?.value || '{no_skpwni}';
        const censoredSkpwni = noSkpwni !== '{no_skpwni}' && noSkpwni.length > 2 
            ? noSkpwni.slice(0, -2) + '**' 
            : noSkpwni;
        
        redaksiBerhasil = `––– bit.ly/UlasanDisdukcapilGarut ––– Mohon kesediaan Anda untuk memberikan penilaian dan ulasan terkait pengalaman Anda dalam menggunakan layanan Dinas Kependudukan dan Pencatatan Sipil Kabupaten Garut pada link tersebut di browser Anda. Penilaian serta ulasan Anda sangat berarti bagi kami untuk terus meningkatkan kualitas layanan. Jika terdapat pertanyaan atau kendala, silakan dapat menghubungi layanan informasi Disdukcapil Garut via DM Instagram @dukcapilgarut atau WA 085183033205 (CHAT ONLY). Terima kasih. Nomor Surat Kepindahan Anda: ${censoredSkpwni}. Email Anda: ${email || '{alamat_email}'}.`;
    } else if (code === 'D' || code === 'B' || code === 'PSD' || code === 'L') {
        // Redaksi untuk Datang, Batal, Pindah Satu Desa, Lokal
        redaksiProses = `${archiveCode} Terima kasih, pengajuan Anda telah selesai. Saat ini Kartu Keluarga terbaru sedang dalam proses ditanda tangani oleh Kepala Dinas, setelah itu akan otomatis terkirim ke email Anda. Mohon DICEK dan DI-REFRESH secara berkala di FOLDER UTAMA atau FOLDER SPAM, sampai Kartu Keluarga terkirim ke email Anda (maksimal dua hari kerja). Selanjutnya Kartu Keluarga dapat Anda cetak secara mandiri, dengan membuka email tersebut di komputer/laptop. Jika Anda belum memiliki Identitas Kependudukan Digital (IKD/KTP Digital), silakan mendaftar ke kantor kecamatan setempat. Untuk pencetakan KTP-el ulang karena pindah domisili, silakan mendatangi Kantor Disdukcapil Garut. Bila Anda memiliki pertanyaan, silakan menghubungi petugas di kecamatan setempat, atau DM Instagram @dukcapilgarut.`;
        
        const noKK = document.getElementById('noKK')?.value || '{nokartukeluarga}';
        redaksiBerhasil = `––– bit.ly/UlasanDisdukcapilGarut ––– Mohon kesediaan Anda untuk memberikan penilaian dan ulasan terkait pengalaman Anda dalam menggunakan layanan Dinas Kependudukan dan Pencatatan Sipil Kabupaten Garut pada link tersebut di browser Anda. Penilaian serta ulasan Anda sangat berarti bagi kami untuk terus meningkatkan kualitas layanan. Jika terdapat pertanyaan atau kendala, silakan dapat menghubungi layanan informasi Disdukcapil Garut via DM Instagram @dukcapilgarut atau WA 085183033205 (CHAT ONLY). Terima kasih. Nomor Kartu Keluarga Anda: ${noKK}. Email Anda: ${email || '{alamatemail}'}.`;
    }
    
    if (redaksiProsesEl) redaksiProsesEl.value = redaksiProses;
    if (redaksiBerhasilEl) redaksiBerhasilEl.value = redaksiBerhasil;
};

// Function to copy redaksi to clipboard
window.copyRedaksiToClipboard = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element || !element.value) {
        showNotification('Tidak ada teks untuk disalin', 'warning');
        return;
    }

    const textToCopy = element.value;

    // Method 1: Modern clipboard API (HTTPS only)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showCopySuccess(elementId);
        }).catch(() => {
            // Fallback to method 2 if clipboard API fails
            fallbackCopyTextToClipboard(textToCopy, elementId);
        });
    } else {
        // Method 2: Fallback untuk browser lama atau HTTP
        fallbackCopyTextToClipboard(textToCopy, elementId);
    }
};

// Fallback copy function
function fallbackCopyTextToClipboard(text, elementId) {
    try {
        // Create temporary textarea
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        
        // Select and copy
        textArea.focus();
        textArea.select();
        
        // Try execCommand
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            showCopySuccess(elementId);
        } else {
            // Last resort: show text in prompt for manual copy
            showManualCopy(text);
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showManualCopy(text);
    }
}

// Show copy success notification
function showCopySuccess(elementId) {
    const btn = elementId === 'redaksiProses' ? 
        document.getElementById('copyRedaksiProses') : 
        document.getElementById('copyRedaksiBerhasil');
    
    if (btn) {
        const originalText = btn.innerHTML;
        const originalBg = btn.style.backgroundColor;
        
        btn.innerHTML = '✅ Tersalin';
        btn.style.backgroundColor = '#28a745';
        btn.style.color = 'white';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = originalBg;
            btn.style.color = '';
        }, 2000);
    }
    
    showNotification('Redaksi berhasil disalin ke clipboard!', 'success');
}

// Show manual copy dialog
function showManualCopy(text) {
    const result = prompt('Copy gagal otomatis. Silakan copy manual teks berikut (Ctrl+C):', text);
    if (result !== null) {
        showNotification('Silakan copy manual dari dialog yang muncul', 'info');
    }
}

// Memuat halaman pengaturan nomor registrasi - Update dengan tanggal
async function loadPengaturan() {
    try {
        const settings = await getSettings();
        
        document.getElementById('startNumber').value = settings.start_number;
        document.getElementById('endNumber').value = settings.end_number;
        document.getElementById('currentNumber').value = settings.current_number;
        document.getElementById('remainingNumbers').value = settings.remaining_numbers;
        document.getElementById('infoTotalData').textContent = settings.max_used_number || 0;
        document.getElementById('infoUsedNumbers').textContent = settings.max_used_number || 0;
        document.getElementById('infoBookedNumbers').textContent = settings.booked_count || 0;
        
        // Tampilkan tanggal aktif sistem
        const currentDate = settings.current_date || new Date().toISOString().split('T')[0];
        document.getElementById('currentSystemDate').textContent = new Date(currentDate).toLocaleDateString('id-ID');
        
        // Update status sistem berdasarkan remaining numbers
        const statusElement = document.getElementById('infoSystemStatus');
        if (settings.remaining_numbers < 10) {
            statusElement.textContent = 'Nomor Hampir Habis';
            statusElement.className = 'status-badge status-ditolak';
        } else if (settings.remaining_numbers < 50) {
            statusElement.textContent = 'Perhatian';
            statusElement.className = 'status-badge status-diproses';
        } else {
            statusElement.textContent = 'Normal';
            statusElement.className = 'status-badge status-selesai';
        }
        
        // Load statistics per tanggal (hanya jika endpoint tersedia)
        try {
            await loadDateStatistics();
        } catch (error) {
            console.log('Date statistics endpoint not available yet');
            // Hide the statistics table if endpoint not ready
            const statsTable = document.querySelector('.card:last-child');
            if (statsTable) {
                statsTable.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        showNotification('Gagal memuat pengaturan', 'error');
    }
}

// Load statistics berdasarkan tanggal
async function loadDateStatistics() {
    try {
        const stats = await getDateStatistics();
        console.log('Loaded date statistics:', stats);
        renderDateStatistics(stats);
    } catch (error) {
        console.log('Date statistics endpoint not available, using mock data for fallback');
        const mockStats = [
            { date: '2025-08-11', total_records: 1, used_numbers: 1, max_number: 601 },
            { date: '2025-08-10', total_records: 0, used_numbers: 0, max_number: 0 }
        ];
        renderDateStatistics(mockStats);
    }
}

// Render statistics table
function renderDateStatistics(stats) {
    const statsTableBody = document.getElementById('dateStatsTableBody');
    
    if (statsTableBody && stats && stats.length > 0) {
        statsTableBody.innerHTML = '';
        stats.forEach(stat => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(stat.date).toLocaleDateString('id-ID')}</td>
                <td>${stat.total_records || 0}</td>
                <td>${stat.used_numbers || 0}</td>
                <td>${stat.max_number || 0}</td>
                <td>
                    <button class="btn-sm btn-secondary" onclick="switchToDate('${stat.date}')" title="Beralih ke tanggal ini">
                        📅 Pilih
                    </button>
                </td>
            `;
            statsTableBody.appendChild(row);
        });
    } else {
        if (statsTableBody) {
            statsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Belum ada data statistik</td></tr>';
        }
    }
}

// Switch ke tanggal tertentu
window.switchToDate = async function(date) {
    try {
        // Release current booked number before switching
        if (currentBookedNumber) {
            await releaseRegNumber(currentBookedNumber);
            currentBookedNumber = null;
        }
        
        const result = await switchSystemDate(date);
        
        if (result.message) {
            showNotification(`Sistem berhasil beralih ke tanggal ${new Date(date).toLocaleDateString('id-ID')}`, 'success');
            
            // Update form tanggal di input
            const regDateEl = document.getElementById('regDate');
            if (regDateEl) {
                regDateEl.value = date;
                // Save to localStorage
                localStorage.setItem('sicakap_current_date', date);
                updateRedaksiFields();
            }
            
            // Refresh pengaturan
            setTimeout(() => {
                loadPengaturan();
            }, 500);
            
            // Auto refresh nomor registrasi jika sedang di halaman input
            if (document.getElementById('input').classList.contains('active')) {
                setTimeout(() => {
                    loadInputPage();
                }, 500);
            }
        } else {
            showNotification(result.error || 'Gagal beralih tanggal', 'error');
        }
    } catch (error) {
        console.error('Failed to switch date:', error);
        showNotification('Terjadi kesalahan saat beralih tanggal', 'error');
    }
};

// Function to auto-detect date change and switch system date
async function checkDateChange(isNewDay = false) {
    try {
        const regDateEl = document.getElementById('regDate');
        const currentFormDate = regDateEl ? regDateEl.value : new Date().toISOString().split('T')[0];
        const lastDate = localStorage.getItem('sicakap_last_date');
        
        if ((lastDate && lastDate !== currentFormDate) || isNewDay) {
            console.log(`Date change detected from ${lastDate || 'none'} to ${currentFormDate}`);
            
            // Auto switch to form date if different
            try {
                // Release current booked number first if any
                if (currentBookedNumber) {
                    await releaseRegNumber(currentBookedNumber);
                    currentBookedNumber = null;
                }
                
                // Switch to new date
                await switchSystemDate(currentFormDate);
                
                // Get new registration number if on input page
                if (document.getElementById('input').classList.contains('active')) {
                    setTimeout(() => {
                        loadInputPage();
                    }, 300);
                }
                
                if (!isNewDay) { // Only show notification for manual changes
                    showNotification(`Tanggal sistem disesuaikan ke ${new Date(currentFormDate).toLocaleDateString('id-ID')}`, 'info');
                }
            } catch (error) {
                console.log('Date switch API not available, using local storage');
            }
        }
        
        // Save current form date
        localStorage.setItem('sicakap_last_date', currentFormDate);
    } catch (error) {
        console.error('Failed to check date change:', error);
    }
}

// Handler untuk mereset nomor yang di-booking - Update dengan sistem tanggal
document.getElementById('resetNumbersBtn')?.addEventListener('click', async () => {
    const result = await Swal.fire({
        title: 'Reset Nomor Registrasi',
        html: ``
            + `<p>Pilih jenis reset yang ingin dilakukan:</p>`
            + `<div style="text-align: left; margin: 15px 0;">`
            + `<strong>🔄 Reset Booking:</strong> Reset nomor yang sedang di-booking saja<br>`
            + `<strong>📅 Reset Harian:</strong> Reset nomor kembali ke awal untuk tanggal aktif<br>`
            + `<strong>🗓️ Ganti Tanggal:</strong> Beralih ke tanggal tertentu`
            + `</div>`,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '🔄 Reset Booking',
        denyButtonText: '📅 Reset Harian',
        cancelButtonText: '❌ Batal',
        confirmButtonColor: '#6c757d',
        denyButtonColor: '#dc3545',
        footer: '<button id="changeDateBtn" class="swal2-styled" style="background: #17a2b8;">🗓️ Ganti Tanggal</button>',
        didOpen: () => {
            document.getElementById('changeDateBtn')?.addEventListener('click', async () => {
                Swal.close();
                const { value: newDate } = await Swal.fire({
                    title: 'Pilih Tanggal',
                    html: '<input type="date" id="newDate" class="swal2-input" style="text-align: center;">',
                    showCancelButton: true,
                    confirmButtonText: 'Beralih',
                    cancelButtonText: 'Batal',
                    preConfirm: () => {
                        const date = document.getElementById('newDate').value;
                        if (!date) {
                            Swal.showValidationMessage('Pilih tanggal yang valid');
                            return false;
                        }
                        return date;
                    }
                });

                if (newDate) {
                    switchToDate(newDate);
                }
            });
        }
    });

    if (result.isConfirmed) {
        // Reset booking saja
        try {
            const resetResult = await resetNumbers();
            showNotification(resetResult.message || 'Nomor booking berhasil direset!', 'success');
            loadPengaturan();
        } catch (error) {
            console.error('Failed to reset booking:', error);
            showNotification('Gagal mereset nomor booking', 'error');
        }
    } else if (result.isDenied) {
        // Reset harian - kembali ke nomor awal untuk hari ini
        const confirmReset = await Swal.fire({
            title: 'Konfirmasi Reset Harian',
            text: 'Ini akan mereset nomor registrasi kembali ke nomor awal untuk tanggal aktif saat ini. Yakin ingin melanjutkan?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Reset Harian',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#dc3545'
        });

        if (confirmReset.isConfirmed) {
            try {
                let resetResult = await resetDailyNumbers();
                showNotification(resetResult.message || 'Nomor registrasi harian berhasil direset!', 'success');
                loadPengaturan();
                
                // Refresh input page jika aktif
                if (document.getElementById('input').classList.contains('active')) {
                    setTimeout(() => {
                        loadInputPage();
                    }, 500);
                }
            } catch (error) {
                console.error('Failed to reset daily numbers:', error);
                showNotification('Gagal mereset nomor harian', 'error');
            }
        }
    }
});

// --- Form Submit Input Data ---
document.getElementById('inputForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Collect form data first
    const regNumber = document.getElementById('regNumber').value;
    const regDate = document.getElementById('regDate').value;
    const serviceCode = document.getElementById('serviceCode').value;
    const nik = document.getElementById('nik').value;
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    const email = document.getElementById('email').value;
    const status = document.getElementById('status').value;
    const archiveCode = document.getElementById('archiveCode').value;
    
    // Get dynamic fields based on service code
    const noSKPWNI = document.getElementById('noSKPWNI').value;
    const noSKDWNI = document.getElementById('noSKDWNI').value;
    const noSKBWNI = document.getElementById('noSKBWNI').value;
    const noKK = document.getElementById('noKK').value;

    // Validate required fields
    if (!serviceCode || !nik || !name || !phone || !email) {
        showNotification('Mohon lengkapi semua field yang wajib diisi', 'warning');
        return;
    }

    // Get service code label for display
    const serviceLabels = {
        'P': 'P - Pindah',
        'D': 'D - Datang', 
        'B': 'B - Batal',
        'BP': 'BP - Batal dan Pindah Ulang',
        'PSD': 'PSD - Pindah Satu Desa',
        'L': 'L - Lokal'
    };

    // Build dynamic fields summary
    let dynamicFieldsHtml = '';
    if (serviceCode === 'P' && noSKPWNI) {
        dynamicFieldsHtml += `<tr><td><strong>No. SKPWNI:</strong></td><td>${noSKPWNI}</td></tr>`;
    }
    if ((serviceCode === 'D' || serviceCode === 'B') && noSKDWNI) {
        dynamicFieldsHtml += `<tr><td><strong>No. SKDWNI:</strong></td><td>${noSKDWNI}</td></tr>`;
    }
    if ((serviceCode === 'B' || serviceCode === 'BP') && noSKBWNI) {
        dynamicFieldsHtml += `<tr><td><strong>No. SKBWNI:</strong></td><td>${noSKBWNI}</td></tr>`;
    }
    if ((serviceCode === 'D' || serviceCode === 'B' || serviceCode === 'PSD' || serviceCode === 'L') && noKK) {
        dynamicFieldsHtml += `<tr><td><strong>No. KK:</strong></td><td>${noKK}</td></tr>`;
    }
    if (serviceCode === 'BP' && noSKPWNI) {
        dynamicFieldsHtml += `<tr><td><strong>No. SKPWNI:</strong></td><td>${noSKPWNI}</td></tr>`;
    }
    if (serviceCode === 'L') {
        if (noSKPWNI) dynamicFieldsHtml += `<tr><td><strong>No. SKPWNI:</strong></td><td>${noSKPWNI}</td></tr>`;
        if (noSKDWNI) dynamicFieldsHtml += `<tr><td><strong>No. SKDWNI:</strong></td><td>${noSKDWNI}</td></tr>`;
        if (noSKBWNI) dynamicFieldsHtml += `<tr><td><strong>No. SKBWNI:</strong></td><td>${noSKBWNI}</td></tr>`;
    }

    // Show confirmation dialog with data summary
    const result = await Swal.fire({
        title: 'Konfirmasi Simpan Data',
        html: `
            <div style="text-align: left; max-height: 400px; overflow-y: auto;">
                <p style="text-align: center; margin-bottom: 1rem; color: #666;">
                    <strong>Pastikan data di bawah ini sudah benar sebelum menyimpan:</strong>
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>No. Registrasi:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${regNumber || 'Otomatis'}</td></tr>
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>Tanggal:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${new Date(regDate).toLocaleDateString('id-ID')}</td></tr>
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>Layanan:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${serviceLabels[serviceCode]}</td></tr>
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>NIK:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${nik}</td></tr>
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>Nama:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${name}</td></tr>
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>No. HP:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${phone}</td></tr>
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${email}</td></tr>
                    ${dynamicFieldsHtml}
                    <tr><td style="padding: 0.5rem; border-bottom: 1px solid #eee;"><strong>Status:</strong></td><td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${status}</td></tr>
                    ${archiveCode ? `<tr><td style="padding: 0.5rem;"><strong>No. Arsip:</strong></td><td style="padding: 0.5rem;">${archiveCode}</td></tr>` : ''}
                </table>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✅ Ya, Simpan Data',
        cancelButtonText: '❌ Batal',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        width: '600px',
        customClass: {
            container: 'swal-wide'
        }
    });

    // If user cancels, stop here
    if (!result.isConfirmed) {
        return;
    }

    // Proceed with saving if confirmed
    let regNumberValue = regNumber;
    if (!regNumberValue) {
        // Jika kosong, booking otomatis
        const booking = await bookRegNumber();
        regNumberValue = booking.reg_number;
        document.getElementById('regNumber').value = regNumberValue;
    }

    const formData = {
        reg_number: parseInt(regNumberValue),
        reg_date: regDate,
        service_code: serviceCode,
        nik: nik,
        name: name,
        phone_number: phone,
        email: email,
        status: status,
        notes: '',
        no_skpwni: noSKPWNI,
        no_skdwni: noSKDWNI,
        no_skbwni: noSKBWNI,
        no_kk: noKK
    };

    try {
        const result = await createPencatatan(formData);
        if (result.message) {
            // Confirm nomor yang sudah dipakai
            if (currentBookedNumber) {
                await confirmRegNumber(currentBookedNumber);
            }
            
            Swal.fire({
                icon: 'success',
                title: 'Data berhasil disimpan!',
                html: `
                    <div style="text-align: center;">
                        <p>Data pencatatan telah berhasil disimpan.</p>
                        <p><strong>No. Registrasi:</strong> ${regNumberValue}</p>
                        ${archiveCode ? `<p><strong>No. Arsip:</strong> ${archiveCode}</p>` : ''}
                    </div>
                `,
                confirmButtonText: 'OK',
                timer: 3000,
                timerProgressBar: true
            });
            
            // Reset form
            document.getElementById('inputForm').reset();
            updateDynamicFields();
            setDefaultDate();
            
            // Langsung booking nomor registrasi selanjutnya untuk input cepat
            try {
                const nextBooking = await bookRegNumber();
                if (nextBooking.reg_number) {
                    currentBookedNumber = nextBooking.reg_number;
                    document.getElementById('regNumber').value = nextBooking.reg_number;
                    
                    // Update No. Arsip untuk entri berikutnya
                    computeArchiveCode();
                    
                    // Update floating registration number with new number
                    updateFloatingRegNumber(nextBooking.reg_number);
                    
                    showNotification(`Siap untuk entri berikutnya - Nomor: ${nextBooking.reg_number}`, 'info');
                } else {
                    showNotification('Nomor registrasi habis, tidak bisa booking nomor berikutnya', 'warning');
                    toggleFloatingRegNumber(false);
                }
            } catch (error) {
                console.error('Failed to book next reg number:', error);
                showNotification('Gagal booking nomor berikutnya, refresh halaman', 'warning');
                toggleFloatingRegNumber(false);
            }
            
        } else {
            showNotification(result.error || 'Gagal menyimpan data', 'error');
        }
    } catch (error) {
        console.error('Failed to save data:', error);
        showNotification('Terjadi kesalahan saat menyimpan data', 'error');
    }
});

// Handler untuk tombol backup
document.getElementById('backupDbBtn')?.addEventListener('click', async () => {
    try {
        const result = await backupDatabase();
        showNotification(result.message || 'Backup database berhasil!', 'success');
    } catch (error) {
        showNotification('Backup database gagal', 'error');
    }
});

document.getElementById('backupArsipBtn')?.addEventListener('click', async () => {
    try {
        const result = await backupArsip();
        showNotification(result.message || 'Backup arsip berhasil!', 'success');
    } catch (error) {
        showNotification('Backup arsip gagal', 'error');
    }
});

// Handler untuk bulk upload arsip - PERBAIKI ERROR HANDLING
document.getElementById('bulkArsipForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const filesInput = document.getElementById('bulkArsipFiles');
    const resultDiv = document.getElementById('bulkArsipResult');
    
    if (!filesInput.files || filesInput.files.length === 0) {
        showNotification('Pilih minimal 1 file untuk diupload', 'warning');
        return;
    }
    
    // Validasi nama file sebelum upload
    const validFiles = [];
    const invalidFiles = [];
    const filePattern = /^(\d{8})_(\d+)_([A-Z]+)\.pdf$/i;
    
    for (let file of filesInput.files) {
        if (filePattern.test(file.name)) {
            validFiles.push(file);
        } else {
            invalidFiles.push(file.name);
        }
    }
    
    if (invalidFiles.length > 0) {
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <strong>File dengan format nama tidak valid:</strong><br>
                ${invalidFiles.join('<br>')}
                <br><br>
                <strong>Format yang benar:</strong> yyyymmdd_nomorregistrasi_kode.pdf<br>
                <strong>Contoh:</strong> 20250810_601_D.pdf
            </div>
        `;
        return;
    }
    
    if (validFiles.length === 0) {
        showNotification('Tidak ada file dengan format nama yang valid', 'error');
        return;
    }
    
    // Proses upload
    resultDiv.innerHTML = '<div class="alert alert-info">⏳ Mengupload file...</div>';
    
    try {
        const formData = new FormData();
        validFiles.forEach(file => {
            formData.append('files', file);
        });
        
        // Gunakan API_URL dari api.js yang sudah dinamis
        const API_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
        
        const response = await fetch(`${API_URL}/arsip/bulk-upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>✅ Upload berhasil!</strong><br>
                    ${result.success}
                </div>
            `;
            filesInput.value = ''; // Reset input file
            showNotification('Upload arsip berhasil!', 'success');
            
            // Refresh halaman data jika sedang aktif
            if (document.getElementById('data').classList.contains('active')) {
                loadDataTable(currentPage);
            }
        } else if (result.error && result.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-warning">
                    <strong>⚠️ Upload selesai dengan peringatan:</strong><br>
                    ${result.success}<br><br>
                    <strong>File yang gagal:</strong><br>
                    ${result.error}
                </div>
            `;
            filesInput.value = '';
            showNotification('Upload selesai dengan beberapa file yang gagal', 'warning');
        } else {
            throw new Error(result.error || 'Upload gagal');
        }
        
    } catch (error) {
        console.error('Bulk upload error:', error);
        
        if (error.message.includes('Failed to fetch') || error.message.includes('ERR_FAILED')) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <strong>❌ Koneksi gagal!</strong><br>
                    Server backend tidak merespons. Pastikan:
                    <ul style="text-align: left; margin-top: 10px;">
                        <li>Flask server sudah dijalankan</li>
                        <li>Server berjalan di port 5000</li>
                        <li>Endpoint /api/arsip/bulk-upload tersedia</li>
                    </ul>
                    <small>Error: ${error.message}</small>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <strong>❌ Upload gagal!</strong><br>
                    ${error.message || 'Terjadi kesalahan saat upload'}
                </div>
            `;
        }
        showNotification('Upload arsip gagal', 'error');
    }
});

// Memuat daftar redaksi
async function loadRedaksi() {
    try {
        const redaksiList = await fetchAllRedaksi();
        const container = document.getElementById('redaksiList');
        container.innerHTML = '';
        
        if (redaksiList.length === 0) {
            container.innerHTML = '<div class="no-data">Belum ada redaksi yang tersimpan.</div>';
            return;
        }
        
        redaksiList.forEach(item => {
            const div = document.createElement('div');
            div.className = 'redaksi-item';
            div.innerHTML = `
                <div class="redaksi-header">
                    <h4>${item.title}</h4>
                    <span class="redaksi-category">${getCategoryLabel(item.category || 'umum')}</span>
                </div>
                <p>${item.content}</p>
                <div class="redaksi-actions">
                    <button class="btn-sm btn-edit" onclick="window.redaksiManager.editRedaksi(${item.id})">📝 Edit</button>
                    <button class="btn-sm btn-delete" onclick="window.redaksiManager.deleteRedaksi(${item.id})">🗑️ Hapus</button>
                    <button class="btn-sm btn-copy" onclick="window.redaksiManager.copyRedaksi('${item.content.replace(/'/g, "\\'")}')">📋 Copy</button>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Failed to load redaksi:', error);
        showNotification('Gagal memuat data redaksi', 'error');
        const container = document.getElementById('redaksiList');
        container.innerHTML = '<div class="no-data error">Gagal memuat data redaksi. <br><button class="btn-secondary" onclick="loadRedaksi()">🔄 Coba Lagi</button></div>';
    }
}

// Get Category Label helper function
function getCategoryLabel(category) {
    const labels = {
        'kepindahan': 'Kepindahan',
        'kedatangan': 'Kedatangan',
        'umum': 'Umum'
    };
    return labels[category] || 'Umum';
}

// Handler untuk setup database
document.getElementById('setupDbBtn')?.addEventListener('click', async () => {
    if (confirm('Yakin ingin melakukan setup database? Tindakan ini akan membuat tabel jika belum ada.')) {
        try {
            const result = await setupDatabase();
            showNotification(result.message || 'Database setup berhasil!', 'success');
            loadDashboard(); // Refresh dashboard
        } catch (error) {
            console.error('Setup database failed:', error);
            showNotification('Setup database gagal', 'error');
        }
    }
});

// Handler untuk menyimpan pengaturan
document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settingsData = {
        start_number: parseInt(document.getElementById('startNumber').value),
        end_number: parseInt(document.getElementById('endNumber').value)
    };
    
    try {
        const result = await updateSettings(settingsData);
        if (result.message) {
            showNotification('Pengaturan berhasil disimpan!', 'success');
            loadPengaturan(); // Muat ulang info terbaru
        } else {
            showNotification(result.error || 'Gagal menyimpan pengaturan', 'error');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        showNotification('Terjadi kesalahan saat menyimpan pengaturan', 'error');
    }
});

// Menampilkan notifikasi sementara
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    
    // Check if notification element exists
    if (!notification) {
        console.error('Notification element not found');
        // Fallback: show alert if notification element doesn't exist
        alert(`${type.toUpperCase()}: ${message}`);
        return;
    }
    
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Handler untuk menutup modal preview arsip
closePreviewBtn?.addEventListener('click', () => {
    arsipPreviewModal.style.display = 'none';
    arsipPreviewContainer.innerHTML = '';
});

// Global functions for onclick handlers
window.editData = async function(id) {
    try {
        // Fetch data by ID untuk edit
        const res = await fetch(`/api/pencatatan/${id}`, { credentials: 'include' });
        const data = await res.json();
        
        if (data.error) {
            showNotification('Data tidak ditemukan', 'error');
            return;
        }
        
        // Tampilkan form edit dengan SweetAlert2
        const { value: formValues } = await Swal.fire({
            title: `Edit Data - No. Reg: ${data.reg_number}`,
            html: `
                <div style="text-align: left;">
                    <div style="margin-bottom: 15px;">
                        <label>NIK Pemohon:</label>
                        <input id="edit-nik" class="swal2-input" value="${data.nik || ''}" maxlength="16" style="margin: 5px 0;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>Nama Pemohon:</label>
                        <input id="edit-name" class="swal2-input" value="${data.name || ''}" style="margin: 5px 0;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>No. HP:</label>
                        <input id="edit-phone" class="swal2-input" value="${data.phone_number || ''}" style="margin: 5px 0;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>Email:</label>
                        <input id="edit-email" class="swal2-input" value="${data.email || ''}" type="email" style="margin: 5px 0;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>Status:</label>
                        <select id="edit-status" class="swal2-input" style="margin: 5px 0;">
                            <option value="DIPROSES" ${data.status === 'DIPROSES' ? 'selected' : ''}>Diproses</option>
                            <option value="SELESAI" ${data.status === 'SELESAI' ? 'selected' : ''}>Selesai</option>
                            <option value="DITOLAK" ${data.status === 'DITOLAK' ? 'selected' : ''}>Ditolak</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label>Catatan:</label>
                        <textarea id="edit-notes" class="swal2-textarea" style="margin: 5px 0;">${data.notes || ''}</textarea>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Update Data',
            cancelButtonText: 'Batal',
            preConfirm: () => {
                return {
                    nik: document.getElementById('edit-nik').value,
                    name: document.getElementById('edit-name').value,
                    phone_number: document.getElementById('edit-phone').value,
                    email: document.getElementById('edit-email').value,
                    status: document.getElementById('edit-status').value,
                    notes: document.getElementById('edit-notes').value
                }
            }
        });

        if (formValues) {
            // Gabungkan data lama dengan data baru
            const updateData = { ...data, ...formValues };
            
            // Kirim update ke server
            const updateRes = await fetch(`/api/pencatatan/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(updateData)
            });
            
            const updateResult = await updateRes.json();
            
            if (updateResult.message) {
                showNotification('Data berhasil diperbarui!', 'success');
                loadDataTable(currentPage); // Refresh table
            } else {
                showNotification(updateResult.error || 'Gagal memperbarui data', 'error');
            }
        }
        
    } catch (error) {
        console.error('Edit data error:', error);
        showNotification('Terjadi kesalahan saat edit data', 'error');
    }
};

window.deleteData = async function(id) {
    try {
        // Konfirmasi hapus dengan SweetAlert2
        const result = await Swal.fire({
            title: 'Hapus Data?',
            text: 'Data yang dihapus tidak dapat dikembalikan!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Ya, Hapus!',
            cancelButtonText: 'Batal'
        });

        if (result.isConfirmed) {
            // Kirim request delete ke server
            const deleteRes = await fetch(`/api/pencatatan/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            const deleteResult = await deleteRes.json();
            
            if (deleteResult.message) {
                Swal.fire('Terhapus!', 'Data berhasil dihapus.', 'success');
                loadDataTable(currentPage); // Refresh table
            } else {
                showNotification(deleteResult.error || 'Gagal menghapus data', 'error');
            }
        }
        
    } catch (error) {
        console.error('Delete data error:', error);
        showNotification('Terjadi kesalahan saat hapus data', 'error');
    }
};

// Ubah window.previewArsip agar menerima path relatif (archive_path)
window.previewArsip = async function(archivePath) {
    try {
        // Show the modal
        const modal = document.getElementById('arsipPreviewModal');
        const container = document.getElementById('arsipPreviewContainer');
        
        // Clear previous content
        container.innerHTML = '<div class="loading">Loading preview...</div>';
        
        // Show the modal
        modal.style.display = 'flex';
        
        // Get download URL from API
        const downloadUrl = downloadArsip(archivePath);

        // Dapatkan ekstensi file dari archivePath
        const filename = archivePath.split(/[\\/]/).pop() || '';
        // Check if file is PDF
        if (filename.toLowerCase().endsWith('.pdf')) {
            // Use direct embed with fallback download link for PDFs
            container.innerHTML = `
                <div style="height: 100%; display: flex; flex-direction: column;">
                    <embed 
                        src="${downloadUrl}"
                        type="application/pdf"
                        width="100%"
                        height="100%"
                        style="flex: 1; min-height: 80vh;"
                    >
                </div>
            `;
        } else if (['jpg', 'jpeg', 'png'].some(ext => filename.toLowerCase().endsWith(ext))) {
            // Create image preview
            container.innerHTML = `
                <img 
                    src="${downloadUrl}"
                    style="max-width: 100%; max-height: 90vh;"
                    alt="Preview of ${filename}"
                >
            `;
        } else {
            // Unsupported file type
            container.innerHTML = `
                <div class="error-message" style="padding: 20px;">
                    <h3>Tidak dapat menampilkan preview</h3>
                    <p>Tipe file tidak didukung untuk preview.</p>
                    <a href="${downloadUrl}" class="btn-primary" target="_blank" download>⬇️ Download File</a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Preview error:', error);
        document.getElementById('arsipPreviewContainer').innerHTML = `
            <div class="error-message" style="padding: 20px;">
                <h3>Gagal memuat preview</h3>
                <p>${error.message || 'Terjadi kesalahan saat memuat file'}</p>
            </div>
        `;
    }
};

// ====== Fallback: Database Lokal Redaksi Tolak ======
const LOCAL_REDAKSI_TOLAK = [
    // Kepindahan
    { category: 'kepindahan', keywords: ['f103', 'monitor', 'f-1.03', 'f1.03'], title: 'f103 monitor', content: 'Mohon maaf, foto formulir F-1.03 agar difoto secara fisik dan tidak diperkenankan dalam bentuk FOTO LAYAR MONITOR/PONSEL. Silakan ajukan kembali dengan melampirkan formulir F-1.03 yang ditulis dengan pulpen tinta hitam, ditandatangani, dan difoto langsung secara fisik. Terima kasih.' },
    { category: 'kepindahan', keywords: ['foto kk', 'monitor', 'kk monitor'], title: 'foto KK layar monitor', content: 'Mohon maaf, Kartu keluarga harus difoto secara fisik dan tidak diperkenankan dalam bentuk FOTO LAYAR MONITOR/PONSEL. Terima kasih.' },
    { category: 'kepindahan', keywords: ['kurang jelas', 'blur', 'buram', 'pecah', 'foto formulir'], title: 'foto formulir kurang jelas', content: '(1) Mohon maaf, foto formulir F-1.03 yang Anda unggah kurang jelas dan sulit dibaca (GAMBAR PECAH/BLUR/BURAM/DIFOTO TERLALU JAUH). Silakan ajukan kembali dan unggah dokumen dengan kualitas foto yang lebih baik, mudah dibaca serta pencahayaan yang baik. (2) Mohon detail isian pada pengajuan di Pastioke diisi alamat tujuan. Terima kasih.' },
    { category: 'kepindahan', keywords: ['tanda tangan', 'terpotong', 'formulir'], title: 'tanda tangan terpotong', content: 'Mohon maaf, pengajuan ditolak karena foto formulir F-1.03 Anda terpotong di bagian tanda tangan. Mohon unggah foto formulir tersebut secara keseluruhan dan jelas. Terima kasih.' },
    // ... sisa data redaksi lokal lainnya ...
];

// Get Default Redaksi Data - Hapus data hardcoded dan kembalikan array kosong
function getDefaultRedaksiData() {
    return []; 
}

// ====== Helper kategori (jika backend tidak punya kolom category) ======
function detectCategory(item) {
    const explicit = (item.category || '').toString().toLowerCase().trim();
    if (explicit === 'kepindahan' || explicit === 'kedatangan') return explicit;
    const t = (item.title || '').toLowerCase();
    const c = (item.content || '').toLowerCase();
    if (t.includes('kedatangan') || c.includes('kedatangan') || c.includes('skpwni')) return 'kedatangan';
    if (t.includes('kepindahan') || c.includes('kepindahan') || c.includes('f-1.03') || c.includes('f103') || c.includes('kartu keluarga')) return 'kepindahan';
    return 'umum';
}

// ====== Loader Redaksi: gabung DB + lokal, filter live ======
async function loadRedaksiTemplates(category = 'kepindahan', searchTerm = '') {
    try {
        const dbRedaksiList = await fetchAllRedaksi();
        const localCategories = JSON.parse(localStorage.getItem('redaksiCategories') || '{}');
        
        const normalizedDbRedaksi = (Array.isArray(dbRedaksiList) ? dbRedaksiList : []).map(d => ({
            id: `db-${d.id}`,
            title: d.title || '-',
            content: d.content || '',
            category: localCategories[d.id] || d.category || 'umum',
            keywords: [],
            source: 'database'
        }));

        const normalizedLocalTolak = LOCAL_REDAKSI_TOLAK.map((item, index) => ({
            ...item,
            id: `local-${index}`,
            source: 'local'
        }));

        const allItems = [...normalizedDbRedaksi, ...normalizedLocalTolak];
        
        const seen = new Set();
        const uniqueItems = allItems.filter(it => {
            const key = `${(it.title || '').trim()}|${(it.content || '').trim()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const container = document.getElementById('redaksiTemplates');
        if (!container) return;
        container.innerHTML = '<div class="text-center">Memuat data...</div>';

        let items = uniqueItems.filter(item => {
            const cat = (item.category && typeof item.category === 'string')
                ? item.category.toLowerCase()
                : detectCategory(item);
            if (cat === 'umum') return true;
            return cat === (category || 'kepindahan');
        });

        const q = (searchTerm || '').toLowerCase().trim();
        if (q) {
            items = items.filter(it => {
                const inTitle = (it.title || '').toLowerCase().includes(q);
                const inContent = (it.content || '').toLowerCase().includes(q);
                const inKeywords = Array.isArray(it.keywords) && it.keywords.some(k => (k || '').toLowerCase().includes(q));
                return inTitle || inContent || inKeywords;
            });
        }

        if ( items.length === 0) {
            container.innerHTML = '<p class="text-center" style="color:#6c757d;">Tidak ada template redaksi yang ditemukan.</p>';
            return;
        }

        container.innerHTML = '';
        items.forEach(item => {
            const safeContent = (item.content || '').replace(/`/g, '\\`').replace(/'/g, "\\'");
            const sourceIcon = item.source === 'database' ? '💾' : '📝';
            const sourceTitle = item.source === 'database' ? 'Dari Manajemen Redaksi' : 'Template Bawaan';

            const div = document.createElement('div');
            div.className = 'redaksi-template-item';
            div.innerHTML = `
                <div class="redaksi-template-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <h4 class="redaksi-template-title" style="margin:0;">
                        ${sourceIcon} ${item.title || '-'}
                        <small style="color:#6c757d;font-weight:normal;" title="${sourceTitle}">(${item.source})</small>
                    </h4>
                    <button class="copy-btn" onclick="copyToClipboard(this, \`${safeContent}\`)">📋 Copy</button>
                </div>
                <div class="redaksi-template-content">${item.content || ''}</div>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Failed to load redaksi templates:', err);
        showNotification('Gagal memuat template redaksi', 'error');
    }
}

// Perbaiki copy: terima tombol sebagai argumen dan fallback untuk non-HTTPS
window.copyToClipboard = async function(btnEl, text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        if (btnEl && btnEl instanceof HTMLElement) {
            const old = btnEl.innerHTML;
            btnEl.innerHTML = '✅ Tersalin';
            btnEl.classList.add('copied');
            setTimeout(() => { btnEl.innerHTML = old; btnEl.classList.remove('copied'); }, 1500);
        }
        showNotification('Template berhasil disalin ke clipboard', 'success');
    } catch (e) {
        console.error('Copy failed:', e);
        try { window.prompt('Salin manual (Ctrl+C), lalu tekan OK:', text); } catch (_) {}
        showNotification('Gagal menyalin. Silakan salin manual.', 'error');
    }
}

// Tab functionality - Satu handler untuk semua tab utama
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = e.target.dataset.tab;
        
        console.log('Tab clicked:', tabId);
        
        // Remove active class from all tab buttons and panes
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding pane
        e.target.classList.add('active');
        const targetPane = document.getElementById(tabId);
        if (targetPane) {
            targetPane.classList.add('active');
        }
        
        // Show/hide floating reg number based on active tab
        const currentPage = document.querySelector('.page.active');
        const isInputPage = currentPage && currentPage.id === 'input';
        const isInputFormTab = tabId === 'input-form';
        const regNumber = document.getElementById('regNumber')?.value;
        
        if (isInputPage && isInputFormTab && regNumber && currentBookedNumber) {
            toggleFloatingRegNumber(true, regNumber);
        } else {
            toggleFloatingRegNumber(false);
        }
        
        // Load redaksi templates if switching to redaksi-tolak tab
        if (tabId === 'redaksi-tolak') {
            const activeSubTab = document.querySelector('.sub-tab-button.active');
            const currentSubTab = activeSubTab ? activeSubTab.dataset.subtab : 'kepindahan';
            const searchTerm = document.getElementById('redaksiSearchInput')?.value?.trim() || '';
            loadRedaksiTemplates(currentSubTab, searchTerm);
        }
    });
});

// Sub-tab di dalam Redaksi Tolak
document.querySelectorAll('.sub-tab-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        console.log('Sub-tab clicked:', e.currentTarget.dataset.subtab);
        
        // Remove active class from all sub-tab buttons
        document.querySelectorAll('.sub-tab-button').forEach(b => b.classList.remove('active'));
        
        // Add active class to clicked sub-tab button
        e.currentTarget.classList.add('active');
        
        // Update current sub-tab and load templates
        currentRedaksiSubtab = e.currentTarget.dataset.subtab;
        const q = document.getElementById('redaksiSearchInput')?.value?.trim() || '';
        loadRedaksiTemplates(currentRedaksiSubtab, q);
        
        console.log('Sub-tab switched to:', currentRedaksiSubtab);
    });
});

// Add event listeners for redaksi search functionality
document.addEventListener('DOMContentLoaded', () => {
    // Add live search event listener (filters as you type)
    const searchInput = document.getElementById('redaksiSearchInput');
    if (searchInput) {
        // Live search on input change
        searchInput.addEventListener('input', debounce(() => {
            const searchTerm = document.getElementById('redaksiSearchInput')?.value?.trim() || '';
            loadRedaksiTemplates(currentRedaksiSubtab, searchTerm);
        }, 300));
    }
});

// Debounce helper function to limit how often a function can execute
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to initialize sidebar toggle functionality
function initializeSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    
    if (!sidebar || !sidebarToggle) {
        console.error('Sidebar or toggle button not found');
        return;
    }
    
    // Toggle sidebar on button click
    sidebarToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        sidebar.classList.toggle('collapsed');
        
        // Update toggle icon
        const icon = sidebarToggle.querySelector('span');
        if (sidebar.classList.contains('collapsed')) {
            icon.textContent = '☰';
        } else {
            icon.textContent = '✕';
        }
    });
    
    // Hover expand functionality when collapsed
    sidebar.addEventListener('mouseenter', () => {
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('hover-expanded');
        }
    });
    
    sidebar.addEventListener('mouseleave', () => {
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('hover-expanded');
        }
    });
    
    // Prevent sidebar from closing when clicking inside
    sidebar.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Close sidebar when clicking outside (on mobile)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && !sidebar.classList.contains('collapsed')) {
            if (!sidebar.contains(e.target)) {
                sidebar.classList.add('collapsed');
                const icon = sidebarToggle.querySelector('span');
                icon.textContent = '☰';
            }
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('hover-expanded');
        }
    });
}

// Add click handler for floating registration number (optional - untuk fokus ke field nomor registrasi)
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    
    // Add click handler for floating registration number
    document.getElementById('floatingRegNumber')?.addEventListener('click', () => {
        const regNumberField = document.getElementById('regNumber');
        if (regNumberField) {
            regNumberField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            regNumberField.focus();
        }
        
        // Salin nomor registrasi ke clipboard
        const regNumber = document.getElementById('floatingRegValue')?.textContent;
        if (regNumber) {
            copyToClipboard(null, regNumber); // Gunakan fungsi copyToClipboard yang sudah ada
        }
    });
});

// Update file input styling when files are selected
document.addEventListener('DOMContentLoaded', () => {
    // Add file input change handler for better UI feedback
    const fileInput = document.getElementById('bulkArsipFiles');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                this.classList.add('has-files');
            } else {
                this.classList.remove('has-files');
            }
        });
    }
    
    // Initialize mixed file conversion functionality
    initializeFileConversion();
});

// Initialize file conversion functionality
function initializeFileConversion() {
    const mixedFilesInput = document.getElementById('mixedFiles');
    const customFileNameInput = document.getElementById('customFileName');
    const filePreviewList = document.getElementById('filePreviewList');
    const conversionForm = document.getElementById('conversionForm');
    
    let selectedFiles = [];
    
    if (!mixedFilesInput) return;
    
    // Handle file selection
    mixedFilesInput.addEventListener('change', function(e) {
        selectedFiles = Array.from(e.target.files);
        updateFilePreview();
        this.classList.toggle('has-files', selectedFiles.length > 0);
    });
    
    // Auto-generate filename based on current date
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    customFileNameInput.placeholder = `${dateStr}_601_D`;
    
    // Update file preview
    function updateFilePreview() {
        if (selectedFiles.length === 0) {
            filePreviewList.classList.remove('show');
            filePreviewList.innerHTML = '<div class="empty-preview">Belum ada file yang dipilih</div>';
            return;
        }
        
        // Show the preview container
        filePreviewList.classList.add('show');
        filePreviewList.innerHTML = '';
        
        selectedFiles.forEach((file, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item';
            
            const isImage = file.type.startsWith('image/');
            const isPDF = file.type === 'application/pdf';
            
            previewItem.innerHTML = `
                <button class="remove-file" onclick="removeFile(${index})" title="Hapus file">×</button>
                ${isImage ? 
                    `<img src="${URL.createObjectURL(file)}" alt="${file.name}">` : 
                    '<div class="file-icon">📄</div>'
                }
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            `;
            
            filePreviewList.appendChild(previewItem);
        });
    }
    
    // Remove file function
    window.removeFile = function(index) {
        selectedFiles.splice(index, 1);
        updateFilePreview();
        
        // Update file input
        const dt = new DataTransfer();
        selectedFiles.forEach(file => dt.items.add(file));
        mixedFilesInput.files = dt.files;
        
        mixedFilesInput.classList.toggle('has-files', selectedFiles.length > 0);
        
        // Hide preview if no files left
        if (selectedFiles.length === 0) {
            filePreviewList.classList.remove('show');
        }
    };
    
    // Handle form submission
    conversionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFileConversion();
    });
    
    // Validate filename input
    customFileNameInput.addEventListener('input', function() {
        const value = this.value;
        const pattern = /^\d{8}_\d+_[A-Z]+$/;
        
        if (value && !pattern.test(value)) {
            this.setCustomValidity('Format harus: yyyymmdd_nomorregistrasi_kodelayanan (contoh: 20250808_653_D)');
        } else {
            this.setCustomValidity('');
        }
    });
}

// Handle file conversion and upload
async function handleFileConversion() {
    const customFileName = document.getElementById('customFileName').value.trim();
    const resultDiv = document.getElementById('conversionResult');
    const convertBtn = document.getElementById('convertBtn');
    const mixedFiles = document.getElementById('mixedFiles').files;
    const filePreviewList = document.getElementById('filePreviewList');
    
    if (!customFileName || mixedFiles.length === 0) {
        showNotification('Pilih file dan masukkan nama file yang valid', 'warning');
        return;
    }
    
    // Validate filename format
    const pattern = /^\d{8}_\d+_[A-Z]+$/;
    if (!pattern.test(customFileName)) {
        showNotification('Format nama file tidak valid. Gunakan: yyyymmdd_nomorregistrasi_kodelayanan', 'error');
        return;
    }
    
    try {
        convertBtn.disabled = true;
        convertBtn.innerHTML = '⏳ Converting...';
        resultDiv.innerHTML = '<div class="alert alert-info">🔄 Mengkonversi dan menggabung file...</div>';
        
        // Convert and merge files to PDF
        const pdfBytes = await convertFilesToPDF(Array.from(mixedFiles));
        
        // Create blob and file
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const finalFileName = `${customFileName}.pdf`;
        const pdfFile = new File([pdfBlob], finalFileName, { type: 'application/pdf' });
        
        // Upload the converted file
        const formData = new FormData();
        formData.append('files', pdfFile);
        
        const API_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
        const response = await fetch(`${API_URL}/arsip/bulk-upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>✅ Upload berhasil!</strong><br>
                    ${result.success}
                </div>
            `;
            
            // Reset form and hide preview
            document.getElementById('conversionForm').reset();
            filePreviewList.classList.remove('show');
            filePreviewList.innerHTML = '<div class="empty-preview">Belum ada file yang dipilih</div>';
            document.getElementById('mixedFiles').classList.remove('has-files');
            
            showNotification('File berhasil dikonversi dan diupload!', 'success');
            
            // Refresh data table if active
            if (document.getElementById('data').classList.contains('active')) {
                loadDataTable(currentPage);
            }
        } else {
            throw new Error(result.error || 'Upload gagal');
        }
        
    } catch (error) {
        console.error('Conversion error:', error);
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <strong>❌ Konversi gagal!</strong><br>
                ${error.message || 'Terjadi kesalahan saat konversi'}
            </div>
        `;
        showNotification('Konversi file gagal', 'error');
    } finally {
        convertBtn.disabled = false;
        convertBtn.innerHTML = '🔄 Convert & Upload';
    }
}

// Convert mixed files to single PDF
async function convertFilesToPDF(files) {
    const { PDFDocument, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        
        if (file.type === 'application/pdf') {
            // Merge existing PDF
            const existingPdf = await PDFDocument.load(arrayBuffer);
            const pageIndices = existingPdf.getPageIndices();
            const copiedPages = await pdfDoc.copyPages(existingPdf, pageIndices);
            copiedPages.forEach(page => pdfDoc.addPage(page));
        } else if (file.type.startsWith('image/')) {
            // Convert image to PDF page
            let image;
            if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                image = await pdfDoc.embedJpg(arrayBuffer);
            } else if (file.type === 'image/png') {
                image = await pdfDoc.embedPng(arrayBuffer);
            } else {
                continue; // Skip unsupported image types
            }
            
            // Calculate page size to fit image
            const maxWidth = 595; // A4 width in points
            const maxHeight = 842; // A4 height in points
            const imgWidth = image.width;
            const imgHeight = image.height;
            
            let width = imgWidth;
            let height = imgHeight;
            
            // Scale down if too large
            if (width > maxWidth || height > maxHeight) {
                const scaleX = maxWidth / width;
                const scaleY = maxHeight / height;
                const scale = Math.min(scaleX, scaleY);
                width *= scale;
                height *= scale;
            }
            
            const page = pdfDoc.addPage([Math.max(width, 200), Math.max(height, 200)]);
            page.drawImage(image, {
                x: (page.getWidth() - width) / 2,
                y: (page.getHeight() - height) / 2,
                width,
                height,
            });
        }
    }
    
    return await pdfDoc.save();
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// F-1.03 Modal functionality dengan API Wilayah Indonesia
let signaturePad;
const API_KEY = "456b6a18b2e754d25f5fe768210a543374025aed8fc124f910a2006ef2f28eff";

// Data provinsi untuk inisialisasi
const provinsiList = [
    {"id":"11","name":"ACEH"},
    {"id":"12","name":"SUMATERA UTARA"},
    {"id":"13","name":"SUMATERA BARAT"},
    {"id":"14","name":"RIAU"},
    {"id":"15","name":"JAMBI"},
    {"id":"16","name":"SUMATERA SELATAN"},
    {"id":"17","name":"BENGKULU"},
    {"id":"18","name":"LAMPUNG"},
    {"id":"19","name":"KEPULAUAN BANGKA BELITUNG"},
    {"id":"21","name":"KEPULAUAN RIAU"},
    {"id":"31","name":"DKI JAKARTA"},
    {"id":"32","name":"JAWA BARAT"},
    {"id":"33","name":"JAWA TENGAH"},
    {"id":"34","name":"DAERAH ISTIMEWA YOGYAKARTA"},
    {"id":"35","name":"JAWA TIMUR"},
    {"id":"36","name":"BANTEN"},
    {"id":"51","name":"BALI"},
    {"id":"52","name":"NUSA TENGGARA BARAT"},
    {"id":"53","name":"NUSA TENGGARA TIMUR"},
    {"id":"61","name":"KALIMANTAN BARAT"},
    {"id":"62","name":"KALIMANTAN TENGAH"},
    {"id":"63","name":"KALIMANTAN SELATAN"},
    {"id":"64","name":"KALIMANTAN TIMUR"},
    {"id":"65","name":"KALIMANTAN UTARA"},
    {"id":"71","name":"SULAWESI UTARA"},
    {"id":"72","name":"SULAWESI TENGAH"},
    {"id":"73","name":"SULAWESI SELATAN"},
    {"id":"74","name":"SULAWESI TENGGARA"},
    {"id":"75","name":"GORONTALO"},
    {"id":"76","name":"SULAWESI BARAT"},
    {"id":"81","name":"MALUKU"},
    {"id":"82","name":"MALUKU UTARA"},
    {"id":"91","name":"PAPUA"},
    {"id":"92","name":"PAPUA BARAT"},
    {"id":"93","name":"PAPUA SELATAN"},
    {"id":"94","name":"PAPUA TENGAH"},
    {"id":"95","name":"PAPUA PEGUNUNGAN"}
];

// Global function to open F-1.03 modal
window.openF103Modal = function() {
    const modal = document.getElementById('f103Modal');
    modal.style.display = 'flex';
    
    console.log('Opening F-1.03 modal...');
    
    // Initialize signature pad and form functionality dengan delay lebih lama
    setTimeout(() => {
        initializeSignaturePad();
        initializeF103Form();
        initializeWilayahAPI();
        
        // Force canvas visibility check
        const canvas = document.getElementById('signature-pad');
        if (canvas) {
            console.log('Canvas found after modal open:', {
                width: canvas.width,
                height: canvas.height,
                styleWidth: canvas.style.width,
                styleHeight: canvas.style.height,
                clientWidth: canvas.clientWidth,
                clientHeight: canvas.clientHeight
            });
        } else {
            console.error('Canvas not found after modal open!');
        }
    }, 300); // Increased delay
};

// Global function to close F-1.03 modal
window.closeF103Modal = function() {
    const modal = document.getElementById('f103Modal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('form-f103').reset();
    if (signaturePad) {
        signaturePad.clear();
    }
};

// Initialize signature pad
function initializeSignaturePad() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas || signaturePad) return;
    
    if (window.SignaturePad) {
        console.log('Initializing signature pad...');
        
        // Reset canvas to proper dimensions and centering
        canvas.width = 600;
        canvas.height = 250;
        canvas.style.width = '100%';
        canvas.style.maxWidth = '600px';
        canvas.style.height = '250px';
        canvas.style.border = '2px solid #ddd';
        canvas.style.borderRadius = '8px';
        canvas.style.background = 'white';
        canvas.style.cursor = 'crosshair';
        canvas.style.touchAction = 'none';
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto'; // Center the canvas
        
        // Clear any existing signature pad
        if (signaturePad) {
            signaturePad.clear();
            signaturePad = null;
        }
        
        // Initialize new signature pad
        signaturePad = new SignaturePad(canvas, {
            penColor: 'black',
            backgroundColor: 'rgba(255,255,255,1)',
            minWidth: 1,
            maxWidth: 3,
            velocityFilterWeight: 0.7,
            throttle: 16
        });
        
        // Force canvas to clear and redraw properly
        signaturePad.clear();
        
        // Pen color buttons with improved styling
        document.getElementById('blackPen')?.addEventListener('click', () => {
            signaturePad.penColor = 'black';
            updatePenButtonStyles('blackPen');
        });
        
        document.getElementById('bluePen')?.addEventListener('click', () => {
            signaturePad.penColor = '#0066cc';
            updatePenButtonStyles('bluePen');
        });
        
        document.getElementById('redPen')?.addEventListener('click', () => {
            signaturePad.penColor = '#cc0000';
            updatePenButtonStyles('redPen');
        });
        
        // Clear signature button
        document.getElementById('clearSign')?.addEventListener('click', () => {
            signaturePad.clear();
        });
        
        // Initial pen button style
        updatePenButtonStyles('blackPen');
        
        // Enhanced resize handler
        function resizeCanvas() {
            if (!signaturePad) return;
            
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            const data = signaturePad.toData();
            
            // Force dimensions
            canvas.width = 600 * ratio;
            canvas.height = 250 * ratio;
            canvas.style.width = '100%';
            canvas.style.maxWidth = '600px';
            canvas.style.height = '250px';
            
            // Scale the drawing context
            const ctx = canvas.getContext('2d');
            ctx.scale(ratio, ratio);
            
            // Restore signature data
            signaturePad.clear();
            signaturePad.fromData(data);
        }
        
        // Add resize event listener
        window.addEventListener("resize", resizeCanvas);
        
        // Force initial resize
        setTimeout(resizeCanvas, 100);
        
        console.log('Signature pad initialized successfully with dimensions:', canvas.width, 'x', canvas.height);
        console.log('Canvas style dimensions:', canvas.style.width, 'x', canvas.style.height);
    } else {
        console.error('SignaturePad library not loaded');
        showNotification('Library tanda tangan tidak tersedia', 'error');
    }
}

// Update pen button styles to show active color
function updatePenButtonStyles(activeButtonId) {
    const buttons = ['blackPen', 'bluePen', 'redPen'];
    buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Remove active class first
            button.classList.remove('active');
            
            if (buttonId === activeButtonId) {
                button.classList.add('active');
                button.style.border = '3px solid #fff';
                button.style.boxShadow = '0 0 15px rgba(0,0,0,0.4)';
                button.style.transform = 'scale(1.05)';
            } else {
                button.style.border = '2px solid transparent';
                button.style.boxShadow = 'none';
                button.style.transform = 'scale(1)';
            }
        }
    });
}

// Initialize F-1.03 form dengan input filters
function initializeF103Form() {
    // Apply input filters menggunakan fungsi utilitas
    applyInputFilter('input[name="nama_lengkap_pemohon"]', /[^a-zA-Z\s]/g, 60, true);
    applyInputFilter('input[name="no_kk"], input[name="nik_pemohon"]', /[^0-9]/g, 16);
    applyInputFilter('input[name="asal_rt"], input[name="pindah_rt"], input[name="asal_rw"], input[name="pindah_rw"]', /[^0-9]/g, 3);
    applyInputFilter('input[name="asal_kodepos"], input[name="pindah_kodepos"]', /[^0-9]/g, 5);
    applyInputFilter('input[name="alamat_asal"], input[name="alamat_pindah"]', null, 100, true);
    
    // Numeric inputs for KITAS/KITAP and country code
    applyInputFilter('input[name="nomor_kitas_kitap"], input[name="kode_negara"]', /[^0-9]/g);
    applyInputFilter('input[name="rencana_pindah_tgl"], input[name="rencana_pindah_bln"], input[name="rencana_pindah_thn"]', /[^0-9]/g);
    
    // Email lowercase
    document.querySelectorAll('input[name="email"]').forEach(el => {
        el.addEventListener('input', function() {
            this.value = this.value.toLowerCase();
        });
    });
    
    // Phone number formatting
    const phoneInput = document.querySelector('input[name="no_hp"]');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            let value = this.value.replace(/[^0-9]/g, '');
            if (value.startsWith('0')) {
                value = value.substring(1);
            }
            this.value = value;
        });
    }
    
    // Setup "Alasan Lainnya" toggle
    setupAlasanLainnyaToggle();
    
    // Setup region handlers untuk klasifikasi kepindahan
    setupKlasifikasiHandlers();
}

// Setup toggle for "Alasan Lainnya"
function setupAlasanLainnyaToggle() {
    const alasanRadios = document.querySelectorAll('input[name="alasan_pindah"]');
    const alasanLainnyaContainer = document.getElementById('alasanLainnyaContainer');
    const alasanLainnyaInput = document.querySelector('input[name="alasan_lainnya"]');
    
    alasanRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'LAINNYA') {
                alasanLainnyaContainer.style.display = 'block';
                alasanLainnyaInput.required = true;
            } else {
                alasanLainnyaContainer.style.display = 'none';
                alasanLainnyaInput.required = false;
                alasanLainnyaInput.value = '';
            }
        });
    });
}

// Initialize API Wilayah Indonesia
function initializeWilayahAPI() {
    // Setup alamat asal
    setupWilayahDropdowns('asal');
    
    // Setup alamat pindah
    setupWilayahDropdowns('pindah');
    
    // Setup hidden field updates
    setupWilayahHiddenFields();
}

// Setup wilayah dropdowns untuk asal atau pindah
function setupWilayahDropdowns(prefix) {
    const provSel = document.getElementById(`${prefix}_prov`);
    const kabSel = document.getElementById(`${prefix}_kab`);
    const kecSel = document.getElementById(`${prefix}_kec`);
    const desaSel = document.getElementById(`${prefix}_desa`);
    
    if (!provSel || !kabSel || !kecSel || !desaSel) return;
    
    // Populate provinsi untuk alamat asal
    if (prefix === 'asal') {
        setOptions(provSel, provinsiList);
    }
    
    // Disable child dropdowns initially
    kabSel.disabled = true;
    kecSel.disabled = true;
    desaSel.disabled = true;
    
    // Province change handler
    provSel.addEventListener('change', function() {
        resetChildDropdowns(kabSel, kecSel, desaSel);
        if (!this.value) return;
        
        kabSel.innerHTML = '<option value="">Memuat...</option>';
        kabSel.disabled = true;
        
        fetch(`https://api.binderbyte.com/wilayah/kabupaten?api_key=${API_KEY}&id_provinsi=${this.value}`)
            .then(res => res.json())
            .then(res => {
                setOptions(kabSel, res.value);
                kabSel.disabled = false;
                updateWilayahHidden(`${prefix}_prov`, `${prefix}_prov_nama`);
            })
            .catch(err => {
                console.error('Error loading kabupaten:', err);
                kabSel.innerHTML = '<option value="">Error loading data</option>';
            });
    });
    
    // Kabupaten change handler
    kabSel.addEventListener('change', function() {
        resetChildDropdowns(kecSel, desaSel);
        if (!this.value) return;
        
        kecSel.innerHTML = '<option value="">Memuat...</option>';
        kecSel.disabled = true;
        
        fetch(`https://api.binderbyte.com/wilayah/kecamatan?api_key=${API_KEY}&id_kabupaten=${this.value}`)
            .then(res => res.json())
            .then(res => {
                setOptions(kecSel, res.value);
                kecSel.disabled = false;
                updateWilayahHidden(`${prefix}_kab`, `${prefix}_kab_nama`);
            })
            .catch(err => {
                console.error('Error loading kecamatan:', err);
                kecSel.innerHTML = '<option value="">Error loading data</option>';
            });
    });
    
    // Kecamatan change handler
    kecSel.addEventListener('change', function() {
        resetChildDropdowns(desaSel);
        if (!this.value) return;
        
        desaSel.innerHTML = '<option value="">Memuat...</option>';
        desaSel.disabled = true;
        
        fetch(`https://api.binderbyte.com/wilayah/kelurahan?api_key=${API_KEY}&id_kecamatan=${this.value}`)
            .then(res => res.json())
            .then(res => {
                setOptions(desaSel, res.value);
                desaSel.disabled = false;
                updateWilayahHidden(`${prefix}_kec`, `${prefix}_kec_nama`);
            })
            .catch(err => {
                console.error('Error loading kelurahan:', err);
                desaSel.innerHTML = '<option value="">Error loading data</option>';
            });
    });
    
    // Desa change handler
    desaSel.addEventListener('change', function() {
        updateWilayahHidden(`${prefix}_desa`, `${prefix}_desa_nama`);
    });
}

// Helper functions for wilayah API
function setOptions(select, data) {
    select.innerHTML = '<option value="">Pilih...</option>';
    data.forEach(item => {
        select.innerHTML += `<option value="${item.id}">${(item.name || '').toUpperCase()}</option>`;
    });
}

function setOptionsStrikeDisable(select, data, excludeValue) {
    select.innerHTML = '<option value="">Pilih...</option>';
    data.forEach(item => {
        if (item.id === excludeValue) {
            select.innerHTML += `<option value="${item.id}" disabled style="text-decoration:line-through;color:#888;">${(item.name || '').toUpperCase()} (ASAL)</option>`;
        } else {
            select.innerHTML += `<option value="${item.id}">${(item.name || '').toUpperCase()}</option>`;
        }
    });
}

// Hapus deklarasi ganda berikut ini (jika ada di bawah):
// function setOptionsStrikeDisableProvinsi(select, data, excludeValue) { ... }

// Setup hidden fields untuk nama wilayah
function setupWilayahHiddenFields() {
    // Add hidden fields untuk nama wilayah if not exist
    const form = document.getElementById('form-f103');
    const hiddenFields = [
        'asal_prov_nama', 'asal_kab_nama', 'asal_kec_nama', 'asal_desa_nama',
        'pindah_prov_nama', 'pindah_kab_nama', 'pindah_kec_nama', 'pindah_desa_nama'
    ];
    
    hiddenFields.forEach(fieldName => {
        if (!document.querySelector(`input[name="${fieldName}"]`)) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = fieldName;
            form.appendChild(hidden);
        }
    });
}

// Update hidden field dengan nama wilayah
function updateWilayahHidden(selectId, hiddenId) {
    const select = document.getElementById(selectId);
    const hidden = document.querySelector(`input[name="${hiddenId}"]`);
    if (select && hidden) {
        const selected = select.options[select.selectedIndex];
        hidden.value = selected && selected.value ? selected.text : '';
    }
}

// Generate PDF function
window.generateF103PDF = async function() {
    const form = document.getElementById('form-f103');
    const formData = new FormData(form);
    
    // Validate form
    if (!form.checkValidity()) {
        showNotification('Mohon lengkapi semua field yang wajib diisi', 'warning');
        form.reportValidity();
        return;
    }
    
    // Validate signature if required
    const enableSignature = document.getElementById('enableSignature').checked;
    if (enableSignature && signaturePad && signaturePad.isEmpty()) {
        showNotification('Tanda tangan digital wajib diisi', 'warning');
        return;
    }
    
    // Add signature if enabled
    if (enableSignature && signaturePad) {
        formData.append('signature', signaturePad.toDataURL());
    }
    
    // Tambahkan custom_signer_name jika diaktifkan dan diisi
    const enableCustomSigner = document.getElementById('enableCustomSigner');
    const customSignerName = document.getElementById('custom_signer_name');
    if (enableCustomSigner && enableCustomSigner.checked && customSignerName && customSignerName.value.trim()) {
        formData.set('custom_signer_name', customSignerName.value.trim());
    } else {
        formData.delete('custom_signer_name');
    }

    try {
        showNotification('Sedang membuat PDF...', 'info');
        
        // Submit to backend
        const API_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
        const response = await fetch(`${API_URL}/f103/submit`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Endpoint F-1.03 belum tersedia di backend. Silakan hubungi administrator untuk mengaktifkan fitur ini.');
            } else if (response.status === 500) {
                throw new Error('Server error: Endpoint F-1.03 belum diimplementasi di backend.');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Download the PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Get filename from response headers or generate one
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'F-1.03.pdf';
        if (disposition && disposition.includes('filename=')) {
            filename = disposition.split('filename=')[1].replace(/"/g, '');
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('PDF berhasil dibuat dan didownload!', 'success');
        
        // Close modal after successful generation
        setTimeout(() => {
            closeF103Modal();
        }, 2000);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        
        // Show user-friendly error message
        if (error.message.includes('Endpoint F-1.03 belum')) {
            Swal.fire({
                icon: 'warning',
                title: 'Fitur Belum Tersedia',
                html: `
                    <p>Fitur generate PDF untuk formulir F-1.03 belum tersedia di backend.</p>
                    <p><strong>Solusi sementara:</strong></p>
                    <ul style="text-align: left; margin: 1rem 0;">
                        <li>Anda dapat mengisi formulir secara manual</li>
                        <li>Screenshot formulir yang sudah diisi</li>
                        <li>Atau tunggu update backend yang menyediakan endpoint ini</li>
                    </ul>
                `,
                confirmButtonText: 'OK'
            });
        } else {
            showNotification('Gagal membuat PDF. Silakan coba lagi atau hubungi administrator.', 'error');
        }
    }
};

// Generate Image function for F-1.03
window.generateF103Image = async function() {
    const form = document.getElementById('form-f103');
    const formData = new FormData(form);

    // Validate form
    if (!form.checkValidity()) {
        showNotification('Mohon lengkapi semua field yang wajib diisi', 'warning');
        form.reportValidity();
        return;
    }

    // Validate signature if required
    const enableSignature = document.getElementById('enableSignature').checked;
    if (enableSignature && signaturePad && signaturePad.isEmpty()) {
        showNotification('Tanda tangan digital wajib diisi', 'warning');
        return;
    }

    // Add signature if enabled
    if (enableSignature && signaturePad) {
        formData.append('signature', signaturePad.toDataURL());
    }

    // Tambahkan custom_signer_name jika diaktifkan dan diisi
    const enableCustomSigner = document.getElementById('enableCustomSigner');
    const customSignerName = document.getElementById('custom_signer_name');
    if (enableCustomSigner && enableCustomSigner.checked && customSignerName && customSignerName.value.trim()) {
        formData.set('custom_signer_name', customSignerName.value.trim());
    } else {
        formData.delete('custom_signer_name');
    }

    try {
        showNotification('Sedang membuat gambar...', 'info');
        
        // Submit to backend image endpoint
        const API_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
        const response = await fetch(`${API_URL}/f103/submit_img`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Endpoint F-1.03 image belum tersedia di backend. Silakan hubungi administrator untuk mengaktifkan fitur ini.');
            } else if (response.status === 500) {
                throw new Error('Server error: Endpoint F-1.03 image belum diimplementasi di backend.');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Get filename from response headers or generate one
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'F-1.03.png';
        if (disposition && disposition.includes('filename=')) {
            filename = disposition.split('filename=')[1].replace(/"/g, '');
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Gambar berhasil dibuat dan didownload!', 'success');
        
        // Close modal after successful generation
        setTimeout(() => {
            closeF103Modal();
        }, 2000);
        
    } catch (error) {
        console.error('Error generating image:', error);
        
        // Show user-friendly error message
        if (error.message.includes('Endpoint F-1.03 image belum')) {
            Swal.fire({
                icon: 'warning',
                title: 'Fitur Belum Tersedia',
                html: `
                    <p>Fitur generate gambar untuk formulir F-1.03 belum tersedia di backend.</p>
                    <p><strong>Solusi sementara:</strong></p>
                    <ul style="text-align: left; margin: 1rem 0;">
                        <li>Anda dapat mengisi formulir secara manual</li>
                        <li>Screenshot formulir yang sudah diisi</li>
                        <li>Atau tunggu update backend yang menyediakan endpoint ini</li>
                    </ul>
                `,
                confirmButtonText: 'OK'
            });
        } else {
            showNotification('Gagal membuat gambar. Silakan coba lagi atau hubungi administrator.', 'error');
        }
    }
};

// Initialize signature pad functionality
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    
    // Signature pad toggle with proper initialization
    document.getElementById('enableSignature')?.addEventListener('change', function() {
        const signatureSection = document.getElementById('signatureSection');
        console.log('Signature toggle changed:', this.checked);
        
        if (this.checked) {
            signatureSection.style.display = 'block';
            
            // Initialize with delay to ensure DOM is ready
            setTimeout(() => {
                initializeSignaturePad();
                
                // Double-check canvas visibility
                const canvas = document.getElementById('signature-pad');
                if (canvas) {
                    console.log('Canvas after initialization:', {
                        width: canvas.width,
                        height: canvas.height,
                        styleWidth: canvas.style.width,
                        styleHeight: canvas.style.height,
                        display: window.getComputedStyle(canvas).display,
                        visibility: window.getComputedStyle(canvas).visibility
                    });
                }
            }, 200);
        } else {
            signatureSection.style.display = 'none';
            if (signaturePad) {
                signaturePad.clear();
            }
        }
    });
});

// Function to load Formulir page
function loadFormulirPage() {
    // Add any initialization logic for the Formulir page here
    console.log('Formulir page loaded');
    
    // Ensure F-1.03 modal functionality is ready
    setTimeout(() => {
        // Initialize F-1.03 modal if not already done
        if (typeof window.openF103Modal !== 'function') {
            console.log('Initializing F-1.03 modal functionality...');
            initializeF103Modal();
        }
    }, 100);
}

// Fungsi utilitas untuk apply input filter
function applyInputFilter(selector, filterRegex, maxLength = null, toUpperCase = false) {
    document.querySelectorAll(selector).forEach(el => {
        el.addEventListener('input', function() {
            if (filterRegex) {
                this.value = this.value.replace(filterRegex, '');
            }
            if (toUpperCase) {
                this.value = this.value.toUpperCase();
            }
            if (maxLength && this.value.length > maxLength) {
                this.value = this.value.slice(0, maxLength);
            }
        });
    });
}

// Function to update family member table based on selected count
window.updateFamilyMemberTable = function() {
    const jumlahAnggota = parseInt(document.getElementById('jumlah_anggota_f103').value);
    const tableBody = document.getElementById('familyMemberTableBody');
    
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Create rows based on selected count
    for (let i = 1; i <= jumlahAnggota; i++) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${i}</td>
            <td style="border: 1px solid #ddd; padding: 4px;">
                <input type="text" name="anggota_nik_${i}" maxlength="16" placeholder="16 digit NIK" style="width: 100%; border: none; padding: 4px;" ${i === 1 ? 'required' : ''}>
            </td>
            <td style="border: 1px solid #ddd; padding: 4px;">
                <input type="text" name="anggota_nama_${i}" placeholder="Nama lengkap" style="width: 100%; border: none; padding: 4px;" ${i === 1 ? 'required' : ''}>
            </td>
            <td style="border: 1px solid #ddd; padding: 4px;">
                <select name="anggota_shdk_${i}" style="width: 100%; border: none; padding: 4px;" ${i === 1 ? 'required' : ''}>
                    <option value="">Pilih SHDK...</option>
                    <option value="KEPALA KELUARGA" ${i === 1 ? 'selected' : ''}>KEPALA KELUARGA</option>
                    <option value="SUAMI">SUAMI</option>
                    <option value="ISTRI">ISTRI</option>
                    <option value="ANAK">ANAK</option>
                    <option value="MENANTU">MENANTU</option>
                    <option value="CUCU">CUCU</option>
                    <option value="ORANG TUA">ORANG TUA</option>
                    <option value="MERTUA">MERTUA</option>
                    <option value="FAMILI LAIN">FAMILI LAIN</option>
                </select>
            </td>
        `;
        tableBody.appendChild(row);
    }
    
    console.log(`Updated family member table for ${jumlahAnggota} members`);
};

function resetChildDropdowns(...selects) {
    selects.forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">Pilih...</option>';
            select.disabled = true;
        }
    });
}

// Setup klasifikasi kepindahan handlers
function setupKlasifikasiHandlers() {
    const klasifikasiRadios = document.querySelectorAll('input[name="klasifikasi_kepindahan"]');
    let isCopyingPindahWilayah = false;
    
    klasifikasiRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            setAlamatPindahByKlasifikasi();
        });
    });
    
    // Alamat asal change handlers untuk update alamat pindah
    ['asal_prov', 'asal_kab', 'asal_kec', 'asal_desa'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', setAlamatPindahByKlasifikasi);
        }
    });
    
    function setAlamatPindahByKlasifikasi() {
        const pindahProvSel = document.getElementById('pindah_prov');
        const pindahKabSel = document.getElementById('pindah_kab');
        const pindahKecSel = document.getElementById('pindah_kec');
        const pindahDesaSel = document.getElementById('pindah_desa');
        
        const asalProvSel = document.getElementById('asal_prov');
        const asalKabSel = document.getElementById('asal_kab');
        const asalKecSel = document.getElementById('asal_kec');
        const asalDesaSel = document.getElementById('asal_desa');
        
        // Reset all destination selects
        resetChildDropdowns(pindahKabSel, pindahKecSel, pindahDesaSel);
        
        const selected = document.querySelector('input[name="klasifikasi_kepindahan"]:checked');
        if (!selected) {
            pindahProvSel.disabled = true;
            resetChildDropdowns(pindahKabSel, pindahKecSel, pindahDesaSel);
            return;
        }
        
        const klasifikasi = selected.value;
        
        function copyOptionValueAndText(target, source) {
            if (target && source) {
                isCopyingPindahWilayah = true;
                target.innerHTML = '';
                for (let i = 0; i < source.options.length; i++) {
                    const opt = source.options[i].cloneNode(true);
                    target.appendChild(opt);
                }
                target.value = source.value;
                target.disabled = true;
                isCopyingPindahWilayah = false;
            }
        }
        
        switch(klasifikasi) {
            case 'antar_provinsi':
                // Enable all provinces except current
                setOptionsStrikeDisableProvinsi(pindahProvSel, provinsiList, asalProvSel.value);
                pindahProvSel.disabled = false;
                break;
                
            case 'antar_kabupaten':
                // Copy province, enable kabupaten
                copyOptionValueAndText(pindahProvSel, asalProvSel);
                if (asalProvSel.value) {
                    fetch(`https://api.binderbyte.com/wilayah/kabupaten?api_key=${API_KEY}&id_provinsi=${asalProvSel.value}`)
                        .then(res => res.json())
                        .then(res => {
                            setOptionsStrikeDisable(pindahKabSel, res.value, asalKabSel.value);
                            pindahKabSel.disabled = false;
                        });
                }
                break;
                
            case 'antar_kecamatan':
                // Copy province and kabupaten, enable kecamatan
                copyOptionValueAndText(pindahProvSel, asalProvSel);
                copyOptionValueAndText(pindahKabSel, asalKabSel);
                if (asalKabSel.value) {
                    fetch(`https://api.binderbyte.com/wilayah/kecamatan?api_key=${API_KEY}&id_kabupaten=${asalKabSel.value}`)
                        .then(res => res.json())
                        .then(res => {
                            setOptionsStrikeDisable(pindahKecSel, res.value, asalKecSel.value);
                            pindahKecSel.disabled = false;
                        });
                }
                break;
                
            case 'antar_desa':
                // Copy province, kabupaten, and kecamatan, enable desa
                copyOptionValueAndText(pindahProvSel, asalProvSel);
                copyOptionValueAndText(pindahKabSel, asalKabSel);
                copyOptionValueAndText(pindahKecSel, asalKecSel);
                copyOptionValueAndText(pindahDesaSel, asalDesaSel);
                if (asalKecSel.value) {
                    fetch(`https://api.binderbyte.com/wilayah/kelurahan?api_key=${API_KEY}&id_kecamatan=${asalKecSel.value}`)
                        .then(res => res.json())
                        .then(res => {
                            setOptionsStrikeDisable(pindahDesaSel, res.value, asalDesaSel.value);
                            pindahDesaSel.disabled = false;
                        });
                }
                break;
                
            case 'dalam_satu_desa':
                // Copy all asal values
                copyOptionValueAndText(pindahProvSel, asalProvSel);
                copyOptionValueAndText(pindahKabSel, asalKabSel);
                copyOptionValueAndText(pindahKecSel, asalKecSel);
                copyOptionValueAndText(pindahDesaSel, asalDesaSel);
                break;
        }
    }
}

function setOptionsStrikeDisableProvinsi(select, data, excludeValue) {
    select.innerHTML = '<option value="">Pilih...</option>';
    data.forEach(item => {
        if (item.id === excludeValue) {
            select.innerHTML += `<option value="${item.id}" disabled style="text-decoration:line-through;color:#888;">${(item.name || '').toUpperCase()} (ASAL)</option>`;
        } else {
            select.innerHTML += `<option value="${item.id}">${(item.name || '').toUpperCase()}</option>`;
        }
    });
}

// Tambahkan modal HTML untuk detail data jika belum ada
if (!document.getElementById('viewDataModal')) {
    const modal = document.createElement('div');
    modal.id = 'viewDataModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h2 style="margin:0;font-size:1.3rem;">Detail Data Pencatatan</h2>
                <button id="closeViewDataModal" class="btn-close-preview" style="font-size:1.5rem;">×</button>
            </div>
            <div id="viewDataModalBody" style="margin-top:1rem;"></div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('closeViewDataModal').onclick = function() {
        modal.style.display = 'none';
        document.getElementById('viewDataModalBody').innerHTML = '';
    };
}

// Helper: Mapping field label ke Bahasa Indonesia
const FIELD_LABELS_ID = {
    id: "ID",
    reg_number: "No. Registrasi",
    reg_date: "Tanggal Registrasi",
    service_code: "Kode Layanan",
    nik: "NIK",
    name: "Nama",
    phone_number: "No. HP",
    email: "Email",
    no_skpwni: "No. SKPWNI",
    no_skdwni: "No. SKDWNI",
    no_kk: "No. KK",
    status: "Status",
    archive_path: "Arsip",
    notes: "Catatan",
    created_at: "Dibuat Pada",
    updated_at: "Diperbarui Pada",
    no_skbwni: "No. SKBWNI"
    // Tambahkan field lain jika perlu
};

// Helper: Format tanggal ke Indonesia (misal: Rabu, 13 Agustus 2025 15.21.32 WIB)
function formatTanggalIndonesia(dtStr) {
    if (!dtStr) return '';
    try {
        // Coba parse ISO atau format lain
        let dt = new Date(dtStr);
        if (isNaN(dt.getTime())) {
            // Coba parse dari format lain (misal: Wed, 13 Aug 2025 15:21:32 GMT)
            dt = new Date(Date.parse(dtStr));
        }
        if (isNaN(dt.getTime())) return dtStr;

        // Hari dan bulan dalam Bahasa Indonesia
        const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        const bulan = [
            'Januari','Februari','Maret','April','Mei','Juni',
            'Juli','Agustus','September','Oktober','November','Desember'
        ];
        const h = hari[dt.getDay()];
        const tgl = dt.getDate();
        const bln = bulan[dt.getMonth()];
        const thn = dt.getFullYear();
        const jam = dt.getHours().toString().padStart(2, '0');
        const menit = dt.getMinutes().toString().padStart(2, '0');
        const detik = dt.getSeconds().toString().padStart(2, '0');
        return `${h}, ${tgl} ${bln} ${thn} ${jam}.${menit}.${detik} WIB`;
    } catch {
        return dtStr;
    }
}

window.viewData = async function(id) {
    try {
        const res = await fetch(`/api/pencatatan/${id}`, { credentials: 'include' });
        const data = await res.json();
        if (data.error) {
            showNotification('Data tidak ditemukan', 'error');
            return;
        }
        // Generate redaksi proses & berhasil
        const { redaksiProses, redaksiBerhasil } = generateRedaksiForData(data);

        // Tampilkan semua field data dengan label Indonesia & format tanggal
        let html = `<table style="width:100%;font-size:0.97em;border-collapse:collapse;">`;
        for (const [k, v] of Object.entries(data)) {
            let label = FIELD_LABELS_ID[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            let value = v == null ? '' : v;
            // Format tanggal untuk field tertentu
            if (['created_at', 'updated_at', 'reg_date'].includes(k) && value) {
                value = formatTanggalIndonesia(value);
            }
            html += `<tr>
                <td style="font-weight:600;padding:4px 8px;text-align:right;width:160px;">${label}</td>
                <td style="padding:4px 8px;">${value}</td>
            </tr>`;
        }
        html += `</table><hr style="margin:1.2em 0;">`;

        // Tombol copy redaksi
        html += `
        <div class="form-group">
            <label>Redaksi Proses:</label>
            <button type="button" class="btn-secondary" onclick="window.copyRedaksiText(\`${escapeRedaksi(redaksiProses)}\`, this)">📋 Copy</button>
        </div>
        <div class="form-group" style="margin-top:0.5em;">
            <label>Redaksi Berhasil:</label>
            <button type="button" class="btn-secondary" onclick="window.copyRedaksiText(\`${escapeRedaksi(redaksiBerhasil)}\`, this)">📋 Copy</button>
        </div>
        `;

        document.getElementById('viewDataModalBody').innerHTML = html;
        document.getElementById('viewDataModal').style.display = 'flex';
    } catch (err) {
        showNotification('Gagal memuat detail data', 'error');
    }
};

// Helper untuk escape teks redaksi agar aman di template string
function escapeRedaksi(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/'/g, "\\'");
}

// Fungsi generate redaksi proses & berhasil (logic sama dengan updateRedaksiFields)
function generateRedaksiForData(data) {
    const code = data.service_code;
    // Ambil tanggal dalam format yyyy-mm-dd (bukan GMT)
    let regDate = data.reg_date;
    let regNumber = data.reg_number;
    const email = data.email;
    const noSKPWNI = data.no_skpwni;
    const noKK = data.no_kk;

    // Ambil tanggal dalam format yyyy-mm-dd jika reg_date mengandung GMT/dll
    if (regDate && typeof regDate === 'string') {
        // Coba ambil yyyy-mm-dd dari string
        let match = regDate.match(/(\d{4}-\d{2}-\d{2})/);
        if (match) {
            regDate = match[1];
        } else {
            // Jika tidak ada, coba parse Date dan format ke yyyy-mm-dd
            const dt = new Date(regDate);
            if (!isNaN(dt.getTime())) {
                regDate = dt.toISOString().split('T')[0];
            }
        }
    }

    if (!code || !regDate || !regNumber) return { redaksiProses: '', redaksiBerhasil: '' };
    const yyyymmdd = regDate.replace(/-/g, '');
    const archiveCode = `${yyyymmdd}_${regNumber}_${code}`;
    let redaksiProses = '';
    let redaksiBerhasil = '';
    
    if (code === 'P' || code === 'BP') {
        redaksiProses = `${archiveCode} Terima kasih, pengajuan Anda telah selesai. Saat ini surat Kepindahan sedang dalam proses ditanda tangani oleh Kepala Dinas, setelah itu akan otomatis terkirim ke email Anda. Mohon DICEK dan DI-REFRESH secara berkala di FOLDER UTAMA atau FOLDER SPAM, sampai Surat Keterangan Pindah terkirim ke email Anda (maksimal dua hari kerja). Selanjutnya Anda dapat mengunduh dan mencetaknya secara mandiri dengan membuka email tersebut di komputer/laptop, lalu serahkan Surat Keterangan Pindah beserta KTP-el asli Anda kepada Dinas Kependudukan daerah tujuan. Dokumen SKPWNI hanya berlaku selama 100 hari sejak tanggal diterbitkan.`;
        // Sensor dua digit terakhir SKPWNI
        const censoredSkpwni = noSKPWNI && noSKPWNI.length > 2 ? noSKPWNI.slice(0, -2) + '**' : (noSKPWNI || '{no_skpwni}');
        redaksiBerhasil = `––– bit.ly/UlasanDisdukcapilGarut ––– Mohon kesediaan Anda untuk memberikan penilaian dan ulasan terkait pengalaman Anda dalam menggunakan layanan Dinas Kependudukan dan Pencatatan Sipil Kabupaten Garut pada link tersebut di browser Anda. Penilaian serta ulasan Anda sangat berarti bagi kami untuk terus meningkatkan kualitas layanan. Jika terdapat pertanyaan atau kendala, silakan dapat menghubungi layanan informasi Disdukcapil Garut via DM Instagram @dukcapilgarut atau WA 085183033205 (CHAT ONLY). Terima kasih. Nomor Surat Kepindahan Anda: ${censoredSkpwni}. Email Anda: ${email || '{alamat_email}'}.`;
    } else if (code === 'D' || code === 'B' || code === 'PSD' || code === 'L') {
        redaksiProses = `${archiveCode} Terima kasih, pengajuan Anda telah selesai. Saat ini Kartu Keluarga terbaru sedang dalam proses ditanda tangani oleh Kepala Dinas, setelah itu akan otomatis terkirim ke email Anda. Mohon DICEK dan DI-REFRESH secara berkala di FOLDER UTAMA atau FOLDER SPAM, sampai Kartu Keluarga terkirim ke email Anda (maksimal dua hari kerja). Selanjutnya Kartu Keluarga dapat Anda cetak secara mandiri, dengan membuka email tersebut di komputer/laptop. Jika Anda belum memiliki Identitas Kependudukan Digital (IKD/KTP Digital), silakan mendaftar ke kantor kecamatan setempat. Untuk pencetakan KTP-el ulang karena pindah domisili, silakan mendatangi Kantor Disdukcapil Garut. Bila Anda memiliki pertanyaan, silakan menghubungi petugas di kecamatan setempat, atau DM Instagram @dukcapilgarut.`;
        
        const noKK = document.getElementById('noKK')?.value || '{nokartukeluarga}';
        redaksiBerhasil = `––– bit.ly/UlasanDisdukcapilGarut ––– Mohon kesediaan Anda untuk memberikan penilaian dan ulasan terkait pengalaman Anda dalam menggunakan layanan Dinas Kependudukan dan Pencatatan Sipil Kabupaten Garut pada link tersebut di browser Anda. Penilaian serta ulasan Anda sangat berarti bagi kami untuk terus meningkatkan kualitas layanan. Jika terdapat pertanyaan atau kendala, silakan dapat menghubungi layanan informasi Disdukcapil Garut via DM Instagram @dukcapilgarut atau WA 085183033205 (CHAT ONLY). Terima kasih. Nomor Kartu Keluarga Anda: ${noKK}. Email Anda: ${email || '{alamatemail}'}.`;
    }
    return { redaksiProses, redaksiBerhasil };
}

// Fungsi global untuk copy redaksi dari modal detail
window.copyRedaksiText = function(text, btn) {
    // Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const old = btn.innerHTML;
                btn.innerHTML = '✅ Tersalin';
                btn.disabled = true;
                setTimeout(() => { btn.innerHTML = old; btn.disabled = false; }, 1500);
            }
            showNotification('Redaksi berhasil disalin ke clipboard!', 'success');
        }).catch(() => fallbackCopyRedaksiText(text, btn));
    } else {
        fallbackCopyRedaksiText(text, btn);
    }
};
function fallbackCopyRedaksiText(text, btn) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (btn) {
            const old = btn.innerHTML;
            btn.innerHTML = '✅ Tersalin';
            btn.disabled = true;
            setTimeout(() => { btn.innerHTML = old; btn.disabled = false; }, 1500);
        }
        showNotification('Redaksi berhasil disalin ke clipboard!', 'success');
    } catch (e) {
        console.error('Fallback copy failed:', e);
        try { window.prompt('Salin manual (Ctrl+C), lalu tekan OK:', text); } catch (_) {}
        showNotification('Gagal menyalin. Silakan salin manual.', 'error');
    }
}

// Session management configuration
let sessionConfig = {
    timeout: 120, // 120 seconds total session
    warningTime: 10, // 10 seconds warning before timeout
    lastActivity: null,
    warningShown: false,
    warningTimer: null,
    sessionTimer: null,
    activityTimer: null
};

// Declare activityUpdateTimer at global scope
let activityUpdateTimer = null;

// Function to initialize session management after successful login
async function initializeSessionManagement(loginResult) {
    try {
        console.log('Initializing session management...', loginResult);
        
        // Get session config from server if available
        if (loginResult.session_timeout) {
            sessionConfig.timeout = loginResult.session_timeout;
        }
        if (loginResult.warning_time) {
            sessionConfig.warningTime = loginResult.warning_time;
        }
        
        sessionConfig.lastActivity = Date.now();
        sessionConfig.warningShown = false;
        
        // Start activity tracking
        startActivityTracking();
        
        // Start session timers
        startSessionTimers();
        
        console.log('Session management initialized:', {
            timeout: sessionConfig.timeout,
            warningTime: sessionConfig.warningTime,
            warningAt: `${sessionConfig.timeout - sessionConfig.warningTime} seconds`,
            timeoutAt: `${sessionConfig.timeout} seconds`
        });
    } catch (error) {
        console.error('Failed to initialize session management:', error);
    }
}

// Function to track user activity
function startActivityTracking() {
    try {
        console.log('Starting activity tracking...');
        
        const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
        
        events.forEach(event => {
            document.addEventListener(event, updateLastActivity, true);
        });
        
        // Clear existing timer if any
        if (activityUpdateTimer) {
            clearInterval(activityUpdateTimer);
            activityUpdateTimer = null;
        }
        
        // Update activity on server periodically (every 30 seconds)
        activityUpdateTimer = setInterval(async () => {
            try {
                await fetch('/api/update-activity', {
                    method: 'POST',
                    credentials: 'include'
                });
                console.log('Activity updated on server');
            } catch (error) {
                console.log('Activity update failed - session may have expired');
                // Don't clear the timer here, let it continue trying
            }
        }, 30000); // Update every 30 seconds
        
        console.log('Activity tracking started successfully');
    } catch (error) {
        console.error('Failed to start activity tracking:', error);
    }
}

// Function to update last activity timestamp
function updateLastActivity() {
    sessionConfig.lastActivity = Date.now();
    
    // Reset warning if user becomes active again
    if (sessionConfig.warningShown) {
        console.log('User became active during warning - resetting session');
        sessionConfig.warningShown = false;
        Swal.close();
        restartSessionTimers();
    }
}

// Function to start session timers
function startSessionTimers() {
    try {
        console.log('Starting session timers...');
        
        // Clear existing timers
        if (sessionConfig.warningTimer) {
            clearTimeout(sessionConfig.warningTimer);
            sessionConfig.warningTimer = null;
        }
        if (sessionConfig.sessionTimer) {
            clearTimeout(sessionConfig.sessionTimer);
            sessionConfig.sessionTimer = null;
        }
        
        const warningTimeMs = (sessionConfig.timeout - sessionConfig.warningTime) * 1000;
        const timeoutMs = sessionConfig.timeout * 1000;
        
        console.log('Session timer configuration:', {
            warningIn: `${(sessionConfig.timeout - sessionConfig.warningTime)} seconds`,
            timeoutIn: `${sessionConfig.timeout} seconds`,
            warningTimeMs,
            timeoutMs
        });
        
        // Set warning timer
        sessionConfig.warningTimer = setTimeout(() => {
            console.log('Warning timer triggered');
            showSessionWarning();
        }, warningTimeMs);
        
        // Set session timeout timer
        sessionConfig.sessionTimer = setTimeout(() => {
            console.log('Session timeout timer triggered');
            handleSessionTimeout();
        }, timeoutMs);
        
        console.log('Session timers started successfully');
    } catch (error) {
        console.error('Failed to start session timers:', error);
    }
}

// Function to restart session timers
function restartSessionTimers() {
    console.log('Restarting session timers');
    startSessionTimers();
}

// Function to show session warning modal
function showSessionWarning() {
    if (sessionConfig.warningShown) return;
    
    console.log('Showing session warning');
    sessionConfig.warningShown = true;
    const remainingSeconds = sessionConfig.warningTime;
    
    Swal.fire({
        title: '⚠️ Peringatan Session',
        html: `
            <div style="text-align: center;">
                <p style="font-size: 1.1rem; margin-bottom: 1rem;">
                    Session Anda akan berakhir dalam:
                </p>
                <div style="font-size: 2rem; font-weight: bold; color: #dc3545; margin: 1rem 0;">
                    <span id="countdown">${formatTime(remainingSeconds)}</span>
                </div>
                <p style="color: #666;">
                    Klik "Perpanjang Session" untuk melanjutkan atau "Logout" untuk keluar sekarang.
                </p>
                <div style="margin-top: 1rem; padding: 0.5rem; background: #f8f9fa; border-radius: 4px; font-size: 0.9rem; color: #666;">
                    <strong>Debug Info:</strong><br>
                    Total Session: ${sessionConfig.timeout}s | Warning: ${sessionConfig.warningTime}s
                </div>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '🔄 Perpanjang Session',
        denyButtonText: '🚪 Logout Sekarang',
        cancelButtonText: '❌ Tutup',
        confirmButtonColor: '#28a745',
        denyButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        allowOutsideClick: false,
        allowEscapeKey: false,
        timer: sessionConfig.warningTime * 1000,
        timerProgressBar: true,
        didOpen: () => {
            startCountdown(remainingSeconds);
        },
        willClose: () => {
            // If modal closes without action, treat as session timeout
            if (sessionConfig.warningShown) {
                console.log('Warning modal closed without action - triggering timeout');
                handleSessionTimeout();
            }
        }
    }).then((result) => {
        sessionConfig.warningShown = false;
        
        if (result.isConfirmed) {
            // Extend session
            console.log('User chose to extend session');
            extendSession();
        } else if (result.isDenied) {
            // Logout immediately
            console.log('User chose manual logout');
            handleManualLogout();
        } else {
            // Dismissed or timeout
            console.log('Warning dismissed or timed out');
        }
        // If dismissed (X button or outside click), session will timeout naturally
    });
}

// Function to start countdown in warning modal
function startCountdown(seconds) {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;
    
    let remaining = seconds;
    
    const countdownInterval = setInterval(() => {
        remaining--;
        
        if (countdownElement) {
            countdownElement.textContent = formatTime(remaining);
            
            // Change color as time runs out
            if (remaining <= 3) {
                countdownElement.style.color = '#dc3545';
                countdownElement.style.animation = 'pulse 0.5s infinite';
            } else if (remaining <= 5) {
                countdownElement.style.color = '#fd7e14';
                countdownElement.style.animation = 'pulse 1s infinite';
            }
        }
        
        if (remaining <= 0 || !sessionConfig.warningShown) {
            clearInterval(countdownInterval);
        }
    }, 1000);
}

// Function to format time (MM:SS)
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Function to extend session
async function extendSession() {
    try {
        console.log('Attempting to extend session');
        const response = await fetch('/api/extend-session', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Session extension result:', result);
            
            // Update session config with new timeout
            if (result.remaining_time) {
                sessionConfig.timeout = result.remaining_time;
            }
            
            // Restart timers
            sessionConfig.lastActivity = Date.now();
            restartSessionTimers();
            
            // Show success message
            Swal.fire({
                title: '✅ Session Diperpanjang',
                text: `Session Anda telah berhasil diperpanjang untuk ${sessionConfig.timeout} detik.`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
            
            console.log('Session extended successfully');
        } else {
            throw new Error('Failed to extend session');
        }
    } catch (error) {
        console.error('Session extension failed:', error);
        
        Swal.fire({
            title: '❌ Gagal Memperpanjang Session',
            text: 'Tidak dapat memperpanjang session. Anda akan di-logout.',
            icon: 'error',
            confirmButtonText: 'OK'
        }).then(() => {
            handleSessionTimeout();
        });
    }
}

// Function to handle session timeout
function handleSessionTimeout() {
    console.log('Handling session timeout');
    
    // Clear all timers
    if (sessionConfig.warningTimer) {
        clearTimeout(sessionConfig.warningTimer);
        sessionConfig.warningTimer = null;
    }
    if (sessionConfig.sessionTimer) {
        clearTimeout(sessionConfig.sessionTimer);
        sessionConfig.sessionTimer = null;
    }
    if (activityUpdateTimer) {
        clearInterval(activityUpdateTimer);
        activityUpdateTimer = null;
    }
    
    console.log('Session timeout - cleaning up');
    
    // Close any open modals
    Swal.close();
    
    // Show timeout modal
    Swal.fire({
        title: '⏰ Session Berakhir',
        html: `
            <div style="text-align: center;">
                <div style="font-size: 4rem; margin: 1rem 0;">⏰</div>
                <p style="font-size: 1.1rem; margin-bottom: 1rem;">
                    Session Anda telah berakhir karena tidak ada aktivitas.
                </p>
                <p style="color: #666;">
                    Untuk keamanan, Anda akan di-logout secara otomatis.
                </p>
                <div style="margin-top: 1rem; padding: 0.5rem; background: #f8f9fa; border-radius: 4px; font-size: 0.9rem; color: #666;">
                    <strong>Session Duration:</strong> ${sessionConfig.timeout} seconds
                </div>
            </div>
        `,
        icon: 'warning',
        confirmButtonText: '🔑 Login Ulang',
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonColor: '#667eea'
    }).then(() => {
        performLogout();
    });
    
    // Auto logout after 5 seconds even if user doesn't click
    setTimeout(() => {
        Swal.close();
        performLogout();
    }, 5000);
}

// Function to handle manual logout from warning
async function handleManualLogout() {
    try {
        console.log('Performing manual logout');
        // Release any booked registration number
        if (currentBookedNumber) {
            await releaseRegNumber(currentBookedNumber);
            currentBookedNumber = null;
        }
        
        // Perform logout
        await logout();
        performLogout();
        
        showNotification('Logout berhasil!', 'success');
    } catch (error) {
        console.error('Manual logout error:', error);
        performLogout(); // Force logout even if API fails
    }
}

// Function to perform logout (common cleanup)
function performLogout() {
    console.log('Performing logout cleanup');
    
    // Clear all timers safely
    if (sessionConfig.warningTimer) {
        clearTimeout(sessionConfig.warningTimer);
        sessionConfig.warningTimer = null;
    }
    if (sessionConfig.sessionTimer) {
        clearTimeout(sessionConfig.sessionTimer);
        sessionConfig.sessionTimer = null;
    }
    if (activityUpdateTimer) {
        clearInterval(activityUpdateTimer);
        activityUpdateTimer = null;
    }
    
    // Reset session config
    sessionConfig = {
        timeout: 120,
        warningTime: 10,
        lastActivity: null,
        warningShown: false,
        warningTimer: null,
        sessionTimer: null,
        activityTimer: null
    };
    
    // Clear booked number
    currentBookedNumber = null;
    
    // Show login screen
    showLogin();
    loginForm.reset();
    
    // Clear any error messages
    if (loginError) {
        loginError.textContent = '';
        loginError.style.display = 'none';
    }
    
    // Reset UI state
    toggleFloatingRegNumber(false);
    
    console.log('User logged out due to session timeout');
}

// Add CSS for pulse animation
if (!document.getElementById('session-styles')) {
    const style = document.createElement('style');
    style.id = 'session-styles';
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        .session-warning {
            animation: pulse 2s infinite;
        }
        
        .session-countdown {
            font-family: 'Courier New', monospace;
            font-weight: bold;
        }
    `;
    document.head.appendChild(style);
}

// Tambahkan event listener untuk tombol download Excel
document.getElementById('downloadExcelBtn')?.addEventListener('click', async () => {
    try {
        // Ambil filter dari toolbar
        const params = new URLSearchParams({
            search: document.getElementById('searchInput').value.trim(),
            status: document.getElementById('statusFilter').value,
            service_code: document.getElementById('serviceFilter').value,
            start_date: document.getElementById('startDateFilter').value,
            end_date: document.getElementById('endDateFilter').value,
            page: 1,
            per_page: 1000 // Ambil maksimal 1000 data
        });
        // Hapus parameter kosong
        for (const [key, value] of params.entries()) {
            if (!value) params.delete(key);
        }
        // Fetch data dari backend
        const res = await fetch(`/api/pencatatan?${params.toString()}`, { credentials: 'include' });
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            showNotification('Tidak ada data untuk diunduh', 'warning');
            return;
        }
        // Kolom sesuai tabel pencatatan (urutan database)
        const headers = [
            'ID',
            'No. Registrasi',
            'Tanggal Registrasi',
            'Kode Layanan',
            'NIK',
            'Nama',
            'No. HP',
            'Email',
            'No. SKPWNI',
            'No. SKDWNI',
            'No. KK',
            'Status',
            'Arsip',
            'Catatan',
            'Dibuat Pada',
            'Diperbarui Pada',
            'No. SKBWNI'
        ];
        // Map data ke urutan kolom di atas
        const rows = data.map(item => [
            item.id ?? '',
            item.reg_number ?? '',
            item.reg_date ? formatTanggalExport(item.reg_date) : '',
            item.service_code ?? '',
            item.nik ?? '',
            item.name ?? '',
            item.phone_number ?? '',
            item.email ?? '',
            item.no_skpwni ?? '',
            item.no_skdwni ?? '',
            item.no_kk ?? '',
            item.status ?? '',
            item.archive_path ?? '',
            item.notes ?? '',
            item.created_at ? formatTanggalExport(item.created_at, true) : '',
            item.updated_at ? formatTanggalExport(item.updated_at, true) : '',
            item.no_skbwni ?? ''
        ]);
        // Fungsi format tanggal (YYYY-MM-DD atau ISO ke dd/mm/yyyy hh:mm:ss)
        function formatTanggalExport(dt, withTime = false) {
            if (!dt) return '';
            const d = new Date(dt);
            if (isNaN(d.getTime())) return dt;
            const pad = n => n.toString().padStart(2, '0');
            const tgl = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
            if (!withTime) return tgl;
            return `${tgl} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
        // Export pakai SheetJS jika ada, fallback ke CSV
        if (window.XLSX) {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "DataPencatatan");
            XLSX.writeFile(wb, "DataPencatatan.xlsx");
        } else {
            let csv = headers.join(',') + '\n';
            rows.forEach(row => {
                csv += row.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'DataPencatatan.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        }
        showNotification('Data berhasil diunduh', 'success');
    } catch (err) {
        showNotification('Gagal mengunduh data', 'error');
    }
});
