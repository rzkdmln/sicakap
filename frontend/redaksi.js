// Redaksi Management Functions
let redaksiData = [];
let editingRedaksiId = null;

// Initialize Redaksi Management
export function initRedaksiManagement() {
    loadRedaksiData();
    setupRedaksiEventListeners();
}

// Setup Event Listeners
function setupRedaksiEventListeners() {
    // Add Redaksi Button
    const addBtn = document.getElementById('addRedaksiBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            openRedaksiModal();
        });
    }

    // Modal Close Buttons
    const closeModal = document.getElementById('closeRedaksiModal');
    const cancelBtn = document.getElementById('cancelRedaksi');
    const closeDeleteModal = document.getElementById('closeDeleteModal');
    const cancelDelete = document.getElementById('cancelDelete');
    
    if (closeModal) closeModal.addEventListener('click', closeRedaksiModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeRedaksiModal);
    if (closeDeleteModal) closeDeleteModal.addEventListener('click', closeDeleteConfirmModal);
    if (cancelDelete) cancelDelete.addEventListener('click', closeDeleteConfirmModal);

    // Form Submit
    const redaksiForm = document.getElementById('redaksiForm');
    if (redaksiForm) {
        redaksiForm.addEventListener('submit', handleRedaksiSubmit);
    }

    // Delete Confirmation
    const confirmDelete = document.getElementById('confirmDelete');
    if (confirmDelete) {
        confirmDelete.addEventListener('click', handleDeleteConfirm);
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            if (e.target.id === 'redaksiModal') closeRedaksiModal();
            if (e.target.id === 'deleteConfirmModal') closeDeleteConfirmModal();
        }
    });
}

// Load Redaksi Data
async function loadRedaksiData() {
    try {
        const response = await fetch('/api/redaksi', { credentials: 'include' });
        if (response.ok) {
            redaksiData = await response.json();
            console.log('Loaded redaksi data from server:', redaksiData); // Debug log
            
            // Fallback: merge with local category data if backend doesn't support category
            const localCategories = JSON.parse(localStorage.getItem('redaksiCategories') || '{}');
            console.log('Local categories from localStorage:', localCategories); // Debug log
            
            redaksiData = redaksiData.map(item => {
                const originalCategory = item.category;
                const localCategory = localCategories[item.id];
                const finalCategory = localCategory || originalCategory || 'umum';
                
                console.log(`Item ${item.id}: server=${originalCategory}, local=${localCategory}, final=${finalCategory}`);
                
                return {
                    ...item,
                    category: finalCategory
                };
            });
            
            console.log('Final merged redaksi data:', redaksiData); // Debug log
        } else {
            redaksiData = [];
        }
        renderRedaksiList();
    } catch (error) {
        console.error('Error loading redaksi:', error);
        redaksiData = [];
        renderRedaksiList();
    }
}

// Render Redaksi List (for redaksi page)
function renderRedaksiList() {
    const redaksiList = document.getElementById('redaksiList');
    if (!redaksiList) return;
    
    if (redaksiData.length === 0) {
        redaksiList.innerHTML = '<div class="no-data">Belum ada redaksi yang tersimpan. <br><button class="btn-primary" onclick="window.redaksiManager.openAddModal()">➕ Tambah Redaksi Pertama</button></div>';
        return;
    }

    redaksiList.innerHTML = redaksiData.map(redaksi => `
        <div class="redaksi-item">
            <div class="redaksi-header">
                <h4>${redaksi.title}</h4>
                <span class="redaksi-category">${getCategoryLabel(redaksi.category)}</span>
            </div>
            <p>${redaksi.content}</p>
            <div class="redaksi-actions">
                <button class="btn-sm btn-edit" onclick="window.redaksiManager.editRedaksi(${redaksi.id})">📝 Edit</button>
                <button class="btn-sm btn-delete" onclick="window.redaksiManager.deleteRedaksi(${redaksi.id})">🗑️ Hapus</button>
                <button class="btn-sm btn-copy" onclick="window.redaksiManager.copyRedaksi('${redaksi.content.replace(/'/g, "\\'")}')">📋 Copy</button>
            </div>
        </div>
    `).join('');
}

// Get Category Label
function getCategoryLabel(category) {
    const labels = {
        'kepindahan': 'Kepindahan',
        'kedatangan': 'Kedatangan',
        'umum': 'Umum'
    };
    return labels[category] || 'Umum';
}

// Open Redaksi Modal
function openRedaksiModal(redaksi = null) {
    const modal = document.getElementById('redaksiModal');
    const title = document.getElementById('redaksiModalTitle');
    const form = document.getElementById('redaksiForm');
    
    if (!modal || !title || !form) {
        console.error('Modal elements not found'); // Debug log
        return;
    }
    
    if (redaksi) {
        // Edit mode
        title.textContent = 'Edit Redaksi';
        document.getElementById('redaksiId').value = redaksi.id;
        document.getElementById('redaksiTitle').value = redaksi.title;
        document.getElementById('redaksiCategory').value = redaksi.category || 'umum';
        document.getElementById('redaksiContent').value = redaksi.content;
        editingRedaksiId = redaksi.id;
        console.log('Editing redaksi:', redaksi); // Debug log
    } else {
        // Add mode
        title.textContent = 'Tambah Redaksi';
        form.reset();
        document.getElementById('redaksiId').value = '';
        // Set default category to 'umum' instead of empty
        document.getElementById('redaksiCategory').value = 'umum';
        editingRedaksiId = null;
        console.log('Adding new redaksi'); // Debug log
    }
    
    modal.style.display = 'block';
    const titleInput = document.getElementById('redaksiTitle');
    if (titleInput) {
        titleInput.focus();
    }
}

// Close Redaksi Modal
function closeRedaksiModal() {
    const modal = document.getElementById('redaksiModal');
    const form = document.getElementById('redaksiForm');
    if (modal) modal.style.display = 'none';
    if (form) form.reset();
    editingRedaksiId = null;
}

// Close Delete Confirmation Modal
function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
}

// Handle Redaksi Form Submit
async function handleRedaksiSubmit(e) {
    e.preventDefault();
    
    const formData = {
        title: document.getElementById('redaksiTitle').value.trim(),
        category: document.getElementById('redaksiCategory').value,
        content: document.getElementById('redaksiContent').value.trim()
    };

    console.log('Form data being sent:', formData); // Debug log

    if (!formData.title || !formData.category || !formData.content) {
        alert('Mohon lengkapi semua field yang diperlukan.');
        return;
    }

    try {
        let response;
        
        if (editingRedaksiId) {
            // Update existing redaksi
            response = await fetch(`/api/redaksi/${editingRedaksiId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
            });
        } else {
            // Add new redaksi
            response = await fetch('/api/redaksi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
            });
        }

        const result = await response.json();
        console.log('Server response:', result); // Debug log

        if (response.ok && result.message) {
            // Store category in localStorage (prioritize over server data)
            const localCategories = JSON.parse(localStorage.getItem('redaksiCategories') || '{}');
            
            if (editingRedaksiId) {
                localCategories[editingRedaksiId] = formData.category;
            } else if (result.id) {
                localCategories[result.id] = formData.category;
            } else {
                // If server doesn't return ID, try to find the newly created item
                const currentData = await fetch('/api/redaksi', { credentials: 'include' });
                if (currentData.ok) {
                    const allData = await currentData.json();
                    const newItem = allData.find(item => 
                        item.title === formData.title && 
                        item.content === formData.content
                    );
                    if (newItem) {
                        localCategories[newItem.id] = formData.category;
                    }
                }
            }
            
            localStorage.setItem('redaksiCategories', JSON.stringify(localCategories));
            console.log('Updated localStorage categories:', localCategories); // Debug log
            
            closeRedaksiModal();
            await loadRedaksiData();
            showNotification(editingRedaksiId ? 'Redaksi berhasil diperbarui!' : 'Redaksi berhasil ditambahkan!', 'success');
        } else {
            showNotification(result.error || 'Gagal menyimpan redaksi', 'error');
        }
    } catch (error) {
        console.error('Error saving redaksi:', error);
        showNotification('Terjadi kesalahan saat menyimpan redaksi.', 'error');
    }
}

// Edit Redaksi
function editRedaksi(id) {
    const redaksi = redaksiData.find(r => r.id == id);
    if (redaksi) {
        openRedaksiModal(redaksi);
    }
}

// Delete Redaksi
function deleteRedaksi(id) {
    const redaksi = redaksiData.find(r => r.id == id);
    if (redaksi) {
        document.getElementById('deleteRedaksiTitle').textContent = redaksi.title;
        document.getElementById('deleteConfirmModal').style.display = 'block';
        document.getElementById('confirmDelete').dataset.redaksiId = id;
    }
}

// Handle Delete Confirmation
async function handleDeleteConfirm() {
    const id = document.getElementById('confirmDelete').dataset.redaksiId;
    
    try {
        const response = await fetch(`/api/redaksi/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Remove from localStorage as well
            const localCategories = JSON.parse(localStorage.getItem('redaksiCategories') || '{}');
            delete localCategories[id];
            localStorage.setItem('redaksiCategories', JSON.stringify(localCategories));
            
            closeDeleteConfirmModal();
            await loadRedaksiData();
            showNotification('Redaksi berhasil dihapus!', 'success');
        } else {
            showNotification(result.error || 'Gagal menghapus redaksi', 'error');
        }
    } catch (error) {
        console.error('Error deleting redaksi:', error);
        showNotification('Terjadi kesalahan saat menghapus redaksi', 'error');
    }
}

// Copy Redaksi Content
function copyRedaksi(content) {
    navigator.clipboard.writeText(content).then(() => {
        showNotification('Redaksi berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Redaksi berhasil disalin ke clipboard!', 'success');
    });
}

// Show Notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

// Export functions to global scope for onclick handlers
window.redaksiManager = {
    editRedaksi,
    deleteRedaksi,
    copyRedaksi,
    openAddModal: () => openRedaksiModal()
};

// Load from localStorage on initialization
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('redaksiData');
    if (saved) {
        redaksiData = JSON.parse(saved);
    }
});
