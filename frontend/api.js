// Konfigurasi API berdasarkan environment
const API_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;

console.log('API URL:', API_URL);

// Helper function untuk handle response
async function handleResponse(response) {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
}

// Authentication functions
export async function login(username, password) {
    const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
    });
    return handleResponse(response);
}

export async function logout() {
    const response = await fetch(`${API_URL}/logout`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function checkSession() {
    const response = await fetch(`${API_URL}/check-session`, {
        method: 'GET',
        credentials: 'include'
    });
    return handleResponse(response);
}

// Pencatatan functions
export async function fetchPencatatan(params = '') {
    const response = await fetch(`${API_URL}/pencatatan${params}`, {
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function createPencatatan(data) {
    const response = await fetch(`${API_URL}/pencatatan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

export async function updatePencatatan(id, data) {
    const response = await fetch(`${API_URL}/pencatatan/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

export async function deletePencatatan(id) {
    const response = await fetch(`${API_URL}/pencatatan/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(response);
}

// Statistics functions
export async function fetchStatistik() {
    const response = await fetch(`${API_URL}/statistik`, {
        credentials: 'include'
    });
    return handleResponse(response);
}

// Backup functions
export async function backupDatabase() {
    const response = await fetch(`${API_URL}/backup/db`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function backupArsip() {
    const response = await fetch(`${API_URL}/backup/arsip`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

// Redaksi functions
export async function fetchAllRedaksi() {
    const response = await fetch(`${API_URL}/redaksi`, {
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function createRedaksi(data) {
    const response = await fetch(`${API_URL}/redaksi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

export async function updateRedaksi(id, data) {
    const response = await fetch(`${API_URL}/redaksi/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

export async function deleteRedaksi(id) {
    const response = await fetch(`${API_URL}/redaksi/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(response);
}

// Archive functions
export async function uploadArsip(formData) {
    const response = await fetch(`${API_URL}/arsip`, {
        method: 'POST',
        credentials: 'include',
        body: formData
    });
    return handleResponse(response);
}

export function downloadArsip(archivePath) {
    // archivePath: path relatif (misal: 2025/202508/20250814/20250814_624_P.pdf)
    return `${API_URL}/arsip/download/${encodeURIComponent(archivePath)}`;
}

// Database setup
export async function setupDatabase() {
    const response = await fetch(`${API_URL}/setup-db`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

// Registration number functions
export async function bookRegNumber() {
    const response = await fetch(`${API_URL}/book-reg-number`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function releaseRegNumber(regNumber) {
    const response = await fetch(`${API_URL}/release-reg-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reg_number: regNumber })
    });
    return handleResponse(response);
}

export async function confirmRegNumber(regNumber) {
    const response = await fetch(`${API_URL}/confirm-reg-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reg_number: regNumber })
    });
    return handleResponse(response);
}

// Settings functions
export async function getSettings() {
    const response = await fetch(`${API_URL}/settings`, {
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function updateSettings(data) {
    const response = await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

export async function resetNumbers() {
    const response = await fetch(`${API_URL}/reset-numbers`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function resetDailyNumbers() {
    const response = await fetch(`${API_URL}/reset-daily-numbers`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function getDateStatistics() {
    const response = await fetch(`${API_URL}/date-statistics`, {
        credentials: 'include'
    });
    return handleResponse(response);
}

export async function switchSystemDate(date) {
    const response = await fetch(`${API_URL}/switch-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date })
    });
    return handleResponse(response);
}