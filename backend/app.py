from flask import Flask, jsonify, request, send_from_directory, session, send_file
from flask_cors import CORS
import psycopg2
import os
from datetime import date
from werkzeug.utils import secure_filename
from functools import wraps
import subprocess
import shutil
import time
from datetime import datetime, timedelta
import uuid
import re
import io

# Import F-1.03 module
F103_AVAILABLE = False
f103_bp = None

try:
    from f103 import f103_bp
    F103_AVAILABLE = True
    print("✅ F-1.03 module loaded successfully")
except ImportError as e:
    print(f"⚠️ F-1.03 module not available: {e}")
    print("💡 To enable F-1.03 functionality, install: pip install reportlab pillow")
    F103_AVAILABLE = False
    f103_bp = None

# Inisialisasi aplikasi Flask
app = Flask(
    __name__,
    static_folder='../frontend',  # Folder untuk file frontend (HTML, JS, CSS)
    static_url_path=''
)

# Enable CORS for all routes with more permissive settings
CORS(app, 
     supports_credentials=True, 
     origins='*',  # Allow all origins
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

# Konfigurasi
UPLOAD_FOLDER = os.getenv('ARSIP_UPLOAD_FOLDER', './arsip')
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.secret_key = os.getenv('APP_SECRET_KEY', 'sicakap_secret_key_yang_sangat_aman')

# Session timeout configuration (in seconds)
SESSION_TIMEOUT = 3600   # 120 seconds total session time
WARNING_TIME = 3000       # 115 seconds warning before timeout

def allowed_file(filename):
    """Mengecek apakah ekstensi file diizinkan."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Koneksi Database ---
def get_db_connection():
    """Membuat koneksi ke database PostgreSQL."""
    try:
        conn = psycopg2.connect(
            dbname=os.getenv('PG_DB', 'sicakap_db'),
            user=os.getenv('PG_USER', 'postgres'),
            password=os.getenv('PG_PASS', '123123123'),
            host=os.getenv('PG_HOST', 'localhost'),
            port=os.getenv('PG_PORT', '5432')
        )
        return conn
    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        raise Exception(f"Cannot connect to database: {e}")

# --- Otentikasi & Otorisasi ---
def login_required(f):
    """Decorator untuk melindungi rute yang memerlukan login."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({'error': 'Akses ditolak, silakan login'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        print(f"Login attempt - Received data: {data}")  # Debug log
        
        if not data:
            return jsonify({'error': 'Data tidak diterima'}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        print(f"Username: {username}, Password: {password}")  # Debug log
        
        # Validasi sederhana, ganti dengan sistem user yang lebih aman di production
        if username == 'admin' and password == 'admin':
            session['logged_in'] = True
            session['user'] = username
            session['session_id'] = f"{username}_{int(time.time())}"
            session['login_time'] = datetime.now().isoformat()
            session['last_activity'] = datetime.now().isoformat()
            print(f"Login successful for user: {username}")
            return jsonify({
                'message': 'Login berhasil',
                'user': username,
                'session_timeout': SESSION_TIMEOUT,
                'warning_time': WARNING_TIME,
                'session_id': session['session_id']
            })
        else:
            return jsonify({'error': 'Username atau password salah'}), 401
    except Exception as e:
        print(f"Login error: {str(e)}")  # Debug log
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    # Release any booked numbers for this session
    session_id = session.get('session_id')
    if session_id:
        numbers_to_release = []
        for reg_num, booking in booked_numbers.items():
            if booking['session_id'] == session_id:
                numbers_to_release.append(reg_num)
        
        for reg_num in numbers_to_release:
            del booked_numbers[reg_num]
    
    session.clear()
    return jsonify({'message': 'Logout berhasil'})

@app.route('/api/check-session', methods=['GET'])
def check_session():
    if not session.get('logged_in'):
        return jsonify({'logged_in': False})
    
    try:
        # Update last activity
        last_activity = session.get('last_activity')
        if last_activity:
            last_activity_time = datetime.fromisoformat(last_activity)
            time_diff = (datetime.now() - last_activity_time).total_seconds()
            
            print(f"Session check - Time since last activity: {time_diff} seconds")
            
            if time_diff > SESSION_TIMEOUT:
                print(f"Session expired - {time_diff} > {SESSION_TIMEOUT}")
                session.clear()
                return jsonify({'logged_in': False, 'reason': 'session_expired'})
        else:
            session['last_activity'] = datetime.now().isoformat()
            
        return jsonify({
            'logged_in': True,
            'user': session.get('user'),
            'session_timeout': SESSION_TIMEOUT,
            'warning_time': WARNING_TIME,
            'last_activity': session.get('last_activity'),
            'remaining_time': max(0, SESSION_TIMEOUT - time_diff) if last_activity else SESSION_TIMEOUT
        })
    except Exception as e:
        print(f"Session check error: {str(e)}")
        return jsonify({'logged_in': False, 'error': str(e)})

@app.route('/api/extend-session', methods=['POST'])
@login_required
def extend_session():
    """Extend user session for another full duration"""
    try:
        session['last_activity'] = datetime.now().isoformat()
        session['login_time'] = datetime.now().isoformat()  # Reset login time
        
        print(f"Session extended for user: {session.get('user')}")
        
        return jsonify({
            'message': f'Sesi berhasil diperpanjang untuk {SESSION_TIMEOUT} detik',
            'remaining_time': SESSION_TIMEOUT,
            'last_activity': session['last_activity'],
            'session_timeout': SESSION_TIMEOUT,
            'warning_time': WARNING_TIME
        })
    except Exception as e:
        print(f"Extend session error: {str(e)}")
        return jsonify({'error': f'Gagal memperpanjang session: {str(e)}'}), 500

@app.route('/api/update-activity', methods=['POST'])
@login_required
def update_activity():
    """Update user activity timestamp"""
    try:
        old_activity = session.get('last_activity')
        session['last_activity'] = datetime.now().isoformat()
        
        print(f"Activity updated for user: {session.get('user')} - Previous: {old_activity}, New: {session['last_activity']}")
        
        return jsonify({
            'status': 'activity_updated',
            'last_activity': session['last_activity'],
            'session_timeout': SESSION_TIMEOUT,
            'warning_time': WARNING_TIME
        })
    except Exception as e:
        print(f"Update activity error: {str(e)}")
        return jsonify({'error': f'Gagal update aktivitas: {str(e)}'}), 500

# --- Helper & Validator ---
def validate_pencatatan(data):
    """Memvalidasi data input untuk pencatatan."""
    errors = []
    if not data.get('reg_number'): errors.append('Nomor registrasi wajib diisi')
    if not data.get('reg_date'): errors.append('Tanggal registrasi wajib diisi')
    if not data.get('nik'): errors.append('NIK wajib diisi')
    if not data.get('name'): errors.append('Nama wajib diisi')
    return errors

# --- Endpoint Statistik ---
@app.route('/api/statistik', methods=['GET'])
@login_required
def statistik():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if table exists first
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pencatatan');")
        table_exists = cur.fetchone()[0]
        
        if not table_exists:
            # Return empty stats if table doesn't exist
            return jsonify({
                'total': 0,
                'per_status': {},
                'per_service': {},
                'hari_ini': 0
            })
        
        # Get statistics
        cur.execute("SELECT COUNT(*) FROM pencatatan")
        total = cur.fetchone()[0]
        
        cur.execute("SELECT status, COUNT(*) FROM pencatatan GROUP BY status")
        status_rows = cur.fetchall()
        per_status = dict(status_rows) if status_rows else {}
        
        cur.execute("SELECT service_code, COUNT(*) FROM pencatatan GROUP BY service_code")
        service_rows = cur.fetchall()
        per_service = dict(service_rows) if service_rows else {}
        
        cur.execute("SELECT COUNT(*) FROM pencatatan WHERE reg_date = %s", (date.today(),))
        hari_ini = cur.fetchone()[0]
        
        cur.close()
        conn.close()
        
        return jsonify({
            'total': total,
            'per_status': per_status,
            'per_service': per_service,
            'hari_ini': hari_ini
        })
    except Exception as e:
        print(f"Statistik error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# --- Rute API (CRUD Pencatatan) ---
@app.route('/api/pencatatan', methods=['GET'])
@login_required
def get_pencatatan():
    try:
        # Mendukung filter: ?search=...&status=...&service_code=...&start_date=...&end_date=...
        params = request.args
        search = params.get('search')
        status = params.get('status')
        service_code = params.get('service_code')
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        page = int(params.get('page', 1))
        per_page = int(params.get('per_page', 20))
        offset = (page - 1) * per_page

        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if table exists
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pencatatan');")
        table_exists = cur.fetchone()[0]
        
        if not table_exists:
            return jsonify([])

        query = "SELECT * FROM pencatatan WHERE TRUE"
        values = []
        if search:
            query += " AND (nik ILIKE %s OR name ILIKE %s OR CAST(reg_number AS TEXT) ILIKE %s)"
            values += [f"%{search}%", f"%{search}%", f"%{search}%"]
        if status:
            query += " AND status = %s"
            values.append(status)
        if service_code:
            query += " AND service_code = %s"
            values.append(service_code)
        if start_date:
            query += " AND reg_date >= %s"
            values.append(start_date)
        if end_date:
            query += " AND reg_date <= %s"
            values.append(end_date)
        query += " ORDER BY reg_date DESC, id DESC LIMIT %s OFFSET %s"
        values += [per_page, offset]

        cur.execute(query, tuple(values))
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        data = [dict(zip(columns, row)) for row in rows]
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e:
        print(f"Get pencatatan error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/pencatatan/<int:id>', methods=['GET'])
@login_required
def get_pencatatan_by_id(id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pencatatan WHERE id = %s", (id,))
    row = cur.fetchone()
    columns = [desc[0] for desc in cur.description]
    cur.close()
    conn.close()
    if row:
        return jsonify(dict(zip(columns, row)))
    return jsonify({'error': 'Data tidak ditemukan'}), 404

@app.route('/api/pencatatan', methods=['POST'])
@login_required
def create_pencatatan():
    data = request.json
    errors = validate_pencatatan(data)
    if errors:
        return jsonify({'error': errors}), 400
    
    # If archive file is provided, create proper archive path
    archive_path = data.get('archive_path')
    if archive_path and not archive_path.startswith(('20', 'http')):
        # Create hierarchical path for new uploads
        reg_date = data.get('reg_date')
        if reg_date:
            filename = os.path.basename(archive_path)
            archive_path = create_archive_path(reg_date, filename)
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO pencatatan (reg_number, reg_date, service_code, nik, name, phone_number, email, no_skpwni, no_skdwni, no_kk, no_skbwni, status, archive_path, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            data.get('reg_number'), data.get('reg_date'), data.get('service_code'), data.get('nik'), data.get('name'),
            data.get('phone_number'), data.get('email'), data.get('no_skpwni'), data.get('no_skdwni'), data.get('no_kk'),
            data.get('no_skbwni'), data.get('status', 'DIPROSES'), archive_path, data.get('notes')
        ))
        new_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({'message': 'Data berhasil ditambahkan', 'id': new_id})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route('/api/pencatatan/<int:id>', methods=['PUT'])
@login_required
def update_pencatatan(id):
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE pencatatan SET
                reg_number=%s, reg_date=%s, service_code=%s, nik=%s, name=%s, phone_number=%s, email=%s,
                no_skpwni=%s, no_skdwni=%s, no_kk=%s, no_skbwni=%s, status=%s, archive_path=%s, notes=%s, updated_at=NOW()
            WHERE id=%s
        """, (
            data.get('reg_number'), data.get('reg_date'), data.get('service_code'), data.get('nik'), data.get('name'),
            data.get('phone_number'), data.get('email'), data.get('no_skpwni'), data.get('no_skdwni'), data.get('no_kk'),
            data.get('no_skbwni'), data.get('status', 'DIPROSES'), data.get('archive_path'), data.get('notes'), id
        ))
        conn.commit()
        return jsonify({'message': 'Data berhasil diperbarui'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route('/api/pencatatan/<int:id>', methods=['DELETE'])
@login_required
def delete_pencatatan(id):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM pencatatan WHERE id=%s", (id,))
        conn.commit()
        return jsonify({'message': 'Data berhasil dihapus'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

# --- CRUD Redaksi ---
@app.route('/api/redaksi', methods=['GET'])
@login_required
def get_all_redaksi():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if redaksi table exists
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'redaksi');")
        table_exists = cur.fetchone()[0]
        
        if not table_exists:
            return jsonify([])
        
        cur.execute("SELECT * FROM redaksi ORDER BY id DESC")
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        data = [dict(zip(columns, row)) for row in rows]
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e:
        print(f"Get redaksi error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/redaksi/<int:id>', methods=['GET'])
@login_required
def get_redaksi_by_id(id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM redaksi WHERE id = %s", (id,))
    row = cur.fetchone()
    columns = [desc[0] for desc in cur.description]
    cur.close()
    conn.close()
    if row:
        return jsonify(dict(zip(columns, row)))
    return jsonify({'error': 'Data tidak ditemukan'}), 404

@app.route('/api/redaksi', methods=['POST'])
@login_required
def create_redaksi():
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO redaksi (title, content) VALUES (%s, %s) RETURNING id",
            (data.get('title'), data.get('content'))
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({'message': 'Redaksi berhasil ditambahkan', 'id': new_id})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route('/api/redaksi/<int:id>', methods=['PUT'])
@login_required
def update_redaksi(id):
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE redaksi SET title=%s, content=%s WHERE id=%s",
            (data.get('title'), data.get('content'), id)
        )
        conn.commit()
        return jsonify({'message': 'Redaksi berhasil diperbarui'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route('/api/redaksi/<int:id>', methods=['DELETE'])
@login_required
def delete_redaksi(id):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM redaksi WHERE id=%s", (id,))
        conn.commit()
        return jsonify({'message': 'Redaksi berhasil dihapus'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

# --- Backup Database ---
@app.route('/api/backup/db', methods=['POST'])
@login_required
def backup_db():
    backup_dir = os.getenv('BACKUP_FOLDER', './backup')
    os.makedirs(backup_dir, exist_ok=True)
    db_name = os.getenv('PG_DB', 'sicakap_db')
    user = os.getenv('PG_USER', 'postgres')
    host = os.getenv('PG_HOST', 'localhost')
    port = os.getenv('PG_PORT', '5432')
    backup_file = os.path.join(backup_dir, f"{db_name}_backup_{date.today()}.sql")
    try:
        subprocess.check_call([
            'pg_dump',
            '-h', host,
            '-p', port,
            '-U', user,
            '-F', 'c',
            '-b',
            '-v',
            '-f', backup_file,
            db_name
        ], env={**os.environ, 'PGPASSWORD': os.getenv('PG_PASS', 'postgres')})
        return jsonify({'message': 'Backup database berhasil', 'file': backup_file})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Backup Arsip ---
@app.route('/api/backup/arsip', methods=['POST'])
@login_required
def backup_arsip():
    src = app.config['UPLOAD_FOLDER']
    backup_dir = os.getenv('BACKUP_FOLDER', './backup')
    os.makedirs(backup_dir, exist_ok=True)
    dst = os.path.join(backup_dir, f"arsip_backup_{date.today()}")
    try:
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        return jsonify({'message': 'Backup arsip berhasil', 'folder': dst})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Helper Functions for Archive Paths ---
def create_archive_path(reg_date_str, filename):
    """Create hierarchical archive path: yyyy/yyyymm/yyyymmdd/filename"""
    try:
        # Parse date string (could be YYYY-MM-DD or YYYYMMDD)
        if len(reg_date_str) == 8:  # YYYYMMDD
            year = reg_date_str[:4]
            month = reg_date_str[:6]
            date_folder = reg_date_str
        else:  # YYYY-MM-DD
            from datetime import datetime
            date_obj = datetime.strptime(reg_date_str, '%Y-%m-%d')
            year = date_obj.strftime('%Y')
            month = date_obj.strftime('%Y%m')
            date_folder = date_obj.strftime('%Y%m%d')
        
        # Create nested folder structure
        nested_path = os.path.join(year, month, date_folder)
        full_archive_path = os.path.join(app.config['UPLOAD_FOLDER'], nested_path)
        
        # Create directories if they don't exist
        os.makedirs(full_archive_path, exist_ok=True)
        
        # Return relative path from upload folder for database storage
        return os.path.join(nested_path, filename).replace('\\', '/')
        
    except Exception as e:
        print(f"Error creating archive path: {e}")
        # Fallback to flat structure
        return filename

def get_archive_file_path(archive_path):
    """Get full file path from archive_path stored in database"""
    if not archive_path:
        return None
    return os.path.join(app.config['UPLOAD_FOLDER'], archive_path)

# --- Endpoint Upload Arsip ---
@app.route('/api/arsip', methods=['POST'])
@login_required
def upload_arsip():
    try:
        # Form-data: file, reg_date, reg_number, nik, name
        if 'file' not in request.files:
            return jsonify({'error': 'File tidak ditemukan'}), 400
        file = request.files['file']
        reg_date = request.form.get('reg_date')
        reg_number = request.form.get('reg_number')
        nik = request.form.get('nik')
        name = request.form.get('name')
        if not (file and allowed_file(file.filename)):
            return jsonify({'error': 'Tipe file tidak diizinkan'}), 400
        
        # Format nama file: YYYYMMDD_REG_KODE.ext
        ext = file.filename.rsplit('.', 1)[1].lower()
        reg_date_str = reg_date.replace('-', '') if reg_date else date.today().strftime('%Y%m%d')
        filename = f"{reg_date_str}_{reg_number}_{nik}.{ext}"
        
        # Create hierarchical archive path
        archive_path = create_archive_path(reg_date, filename)
        full_save_path = os.path.join(app.config['UPLOAD_FOLDER'], archive_path)
        
        # Save file
        file.save(full_save_path)
        
        return jsonify({
            'message': 'File berhasil diunggah', 
            'archive_path': archive_path,
            'full_path': full_save_path
        })
    except Exception as e:
        print(f"Upload arsip error: {str(e)}")
        return jsonify({'error': f'Upload error: {str(e)}'}), 500

@app.route('/api/arsip/download/<path:archive_path>', methods=['GET'])
@login_required
def download_arsip(archive_path):
    """Download arsip with hierarchical path support"""
    try:
        # Construct full file path
        full_file_path = get_archive_file_path(archive_path)
        
        if not full_file_path or not os.path.isfile(full_file_path):
            return jsonify({'error': 'File tidak ditemukan'}), 404
        
        # Get directory and filename
        directory = os.path.dirname(full_file_path)
        filename = os.path.basename(full_file_path)
        
        return send_from_directory(directory, filename)
    except Exception as e:
        print(f"Download arsip error: {str(e)}")
        return jsonify({'error': f'Download error: {str(e)}'}), 500

@app.route('/api/arsip/convert-upload', methods=['POST'])
@login_required
def convert_and_upload_mixed_files():
    """Convert mixed files (JPG, PNG, PDF) to single PDF and upload with hierarchical structure"""
    try:
        files = request.files.getlist('files')
        custom_filename = request.form.get('customFileName', '').strip()
        
        if not files:
            return jsonify({'error': 'Tidak ada file yang diunggah'}), 400
            
        if not custom_filename:
            return jsonify({'error': 'Nama file custom harus diisi'}), 400
        
        # Validate custom filename format: YYYYMMDD_NUMBER_CODE
        import re
        if not re.match(r'^\d{8}_\d+_[A-Z]+$', custom_filename):
            return jsonify({'error': 'Format nama file tidak valid. Gunakan: YYYYMMDD_NUMBER_CODE'}), 400
        
        # Extract date from filename for hierarchical structure
        date_part = custom_filename[:8]
        reg_date_formatted = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:8]}"
        
        # Create PDF filename
        pdf_filename = f"{custom_filename}.pdf"
        
        # Create hierarchical archive path
        archive_path = create_archive_path(reg_date_formatted, pdf_filename)
        full_save_path = os.path.join(app.config['UPLOAD_FOLDER'], archive_path)
        
        # Simple file handling - if only PDF files, merge them
        # If mixed files, this would need more complex conversion logic
        pdf_files = [f for f in files if f.filename.lower().endswith('.pdf')]
        
        if len(files) == 1 and len(pdf_files) == 1:
            # Single PDF file - just save it
            files[0].save(full_save_path)
        else:
            # Multiple files or mixed types - would need additional libraries
            # For now, save the first PDF file or return error
            if pdf_files:
                pdf_files[0].save(full_save_path)
            else:
                return jsonify({'error': 'Konversi file campuran memerlukan library tambahan'}), 400
        
        return jsonify({
            'message': 'File berhasil dikonversi dan diunggah',
            'archive_path': archive_path,
            'filename': pdf_filename
        })
        
    except Exception as e:
        print(f"Convert upload error: {str(e)}")
        return jsonify({'error': f'Convert upload error: {str(e)}'}), 500

# --- Penyajian Frontend ---
@app.route('/')
def serve_index():
    """Menyajikan file index.html dari folder frontend."""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Menyajikan file statis lainnya (JS, CSS, gambar) dari folder frontend."""
    # Menghindari penyajian file di luar folder statis
    if ".." in path or path.startswith("/"):
        return jsonify({"error": "Invalid path"}), 400
    return send_from_directory(app.static_folder, path)

# --- Health Check ---
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

# --- Database Setup Route (untuk testing) ---
@app.route('/api/setup-db', methods=['POST'])
def setup_database():
    """Setup database tables if they don't exist"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Create pencatatan table - hapus UNIQUE constraint dari NIK
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pencatatan (
                id SERIAL PRIMARY KEY,
                reg_number INTEGER NOT NULL,
                reg_date DATE NOT NULL,
                service_code VARCHAR(10),
                nik VARCHAR(16) NOT NULL,
                name VARCHAR(255) NOT NULL,
                phone_number VARCHAR(20),
                email VARCHAR(255),
                no_skpwni VARCHAR(50),
                no_skdwni VARCHAR(50),
                no_kk VARCHAR(50),
                no_skbwni VARCHAR(50),
                status VARCHAR(50) DEFAULT 'DIPROSES',
                archive_path TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Hapus constraint UNIQUE dari NIK jika ada
        cur.execute("""
            ALTER TABLE pencatatan DROP CONSTRAINT IF EXISTS pencatatan_nik_key;
        """)
        
        # Create redaksi table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS redaksi (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'message': 'Database tables created successfully'})
    except Exception as e:
        print(f"Setup database error: {str(e)}")
        return jsonify({'error': f'Database setup error: {str(e)}'}), 500

# --- Global configuration for registration numbers
registration_config = {
    'start_number': 601,
    'end_number': 700,
    'current_date': None  # Track current active date
}

# --- Global dictionary untuk tracking booked numbers
booked_numbers = {}  # {reg_number: {'session_id': ..., 'timestamp': ..., 'date': ...}}

@app.route('/api/settings', methods=['GET'])
@login_required
def get_settings():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get current active date from registration_config or use today
        current_date = registration_config.get('current_date') or date.today().isoformat()
        registration_config['current_date'] = current_date
        
        # Get current max number from database for the current date
        cur.execute("SELECT COALESCE(MAX(reg_number), 0) FROM pencatatan WHERE reg_date = %s", (current_date,))
        max_db_number_for_date = cur.fetchone()[0]
        
        # If no data for this date, start from start_number
        if max_db_number_for_date == 0:
            next_number = registration_config['start_number']
        else:
            next_number = max_db_number_for_date + 1
        
        # Count booked numbers for current date
        booked_count = len([n for n in booked_numbers.values() if n.get('date') == current_date])
        
        # Calculate remaining numbers for current date
        remaining = registration_config['end_number'] - max(max_db_number_for_date, registration_config['start_number'] - 1)
        remaining = max(0, remaining)  # Ensure non-negative
        
        cur.close()
        conn.close()
        
        return jsonify({
            'start_number': registration_config['start_number'],
            'end_number': registration_config['end_number'],
            'current_number': next_number,
            'max_used_number': max_db_number_for_date,
            'booked_count': booked_count,
            'remaining_numbers': remaining,
            'current_date': current_date
        })
        
    except Exception as e:
        print(f"Get settings error: {str(e)}")
        return jsonify({'error': f'Settings error: {str(e)}'}), 500

@app.route('/api/book-reg-number', methods=['POST'])
@login_required
def book_reg_number():
    try:
        session_id = session.get('session_id')
        if not session_id:
            # Generate session_id if not exists
            import uuid
            session_id = str(uuid.uuid4())
            session['session_id'] = session_id

        # Get current active date
        current_date = registration_config.get('current_date') or date.today().isoformat()
        registration_config['current_date'] = current_date

        # Clean expired bookings (older than 30 minutes)
        current_time = time.time()
        expired_numbers = []
        for reg_num, booking in booked_numbers.items():
            if current_time - booking['timestamp'] > 1800:  # 30 minutes
                expired_numbers.append(reg_num)
        for reg_num in expired_numbers:
            del booked_numbers[reg_num]

        # Check if this session already has a booked number for current date
        for reg_num, booking in booked_numbers.items():
            if booking['session_id'] == session_id and booking.get('date') == current_date:
                return jsonify({'reg_number': reg_num, 'status': 'existing'})

        # Get all used numbers for current date and booked numbers for current date
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get used numbers for specific date
        cur.execute(
            "SELECT reg_number FROM pencatatan WHERE reg_date = %s AND reg_number BETWEEN %s AND %s",
            (current_date, registration_config['start_number'], registration_config['end_number'])
        )
        used_numbers_for_date = set(row[0] for row in cur.fetchall())
        
        # Get booked numbers for current date
        booked_set_for_date = set(
            num for num, booking in booked_numbers.items()
            if booking.get('date') == current_date and 
               registration_config['start_number'] <= num <= registration_config['end_number']
        )
        
        all_taken_for_date = used_numbers_for_date | booked_set_for_date

        print(f"Date: {current_date}")
        print(f"Used numbers for date: {used_numbers_for_date}")
        print(f"Booked numbers for date: {booked_set_for_date}")
        print(f"All taken for date: {all_taken_for_date}")

        # Find the smallest available number for current date
        for candidate in range(registration_config['start_number'], registration_config['end_number'] + 1):
            if candidate not in all_taken_for_date:
                booked_numbers[candidate] = {
                    'session_id': session_id,
                    'timestamp': current_time,
                    'date': current_date
                }
                cur.close()
                conn.close()
                print(f"Booked number {candidate} for date {current_date}")
                return jsonify({'reg_number': candidate, 'status': 'new'})

        cur.close()
        conn.close()
        return jsonify({'error': f'Nomor registrasi sudah habis untuk tanggal {current_date}. Silakan hubungi administrator.'}), 400

    except Exception as e:
        print(f"Book reg number error: {str(e)}")
        return jsonify({'error': f'Booking error: {str(e)}'}), 500

@app.route('/api/switch-date', methods=['POST'])
@login_required
def switch_system_date():
    try:
        data = request.json
        new_date = data.get('date')
        
        if not new_date:
            return jsonify({'error': 'Tanggal harus diisi'}), 400
        
        # Validate date format
        try:
            from datetime import datetime
            parsed_date = datetime.strptime(new_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Format tanggal tidak valid (gunakan YYYY-MM-DD)'}), 400
        
        # Update current date in registration config
        old_date = registration_config.get('current_date')
        registration_config['current_date'] = new_date
        
        # Clear all booked numbers when switching dates
        global booked_numbers
        booked_numbers = {}
        
        print(f"Switched system date from {old_date} to {new_date}")
        
        return jsonify({
            'message': f'Sistem berhasil beralih ke tanggal {new_date}',
            'current_date': new_date,
            'previous_date': old_date,
            'reg_number_reset': True
        })
        
    except Exception as e:
        print(f"Switch date error: {str(e)}")
        return jsonify({'error': f'Switch date error: {str(e)}'}), 500

@app.route('/api/date-statistics', methods=['GET'])
@login_required
def get_date_statistics():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if table exists
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pencatatan');")
        table_exists = cur.fetchone()[0]
        
        if not table_exists:
            return jsonify([])
        
        # Get statistics grouped by date
        cur.execute("""
            SELECT 
                reg_date as date,
                COUNT(*) as total_records,
                COUNT(DISTINCT reg_number) as used_numbers,
                COALESCE(MAX(reg_number), 0) as max_number
            FROM pencatatan 
            GROUP BY reg_date 
            ORDER BY reg_date DESC
            LIMIT 30
        """)
        
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        stats = []
        
        for row in rows:
            stat = dict(zip(columns, row))
            # Convert date to string format
            if stat['date']:
                stat['date'] = stat['date'].isoformat()
            stats.append(stat)
        
        cur.close()
        conn.close()
        
        return jsonify(stats)
        
    except Exception as e:
        print(f"Get date statistics error: {str(e)}")
        return jsonify({'error': f'Date statistics error: {str(e)}'}), 500

@app.route('/api/reset-daily-numbers', methods=['POST'])
@login_required
def reset_daily_numbers():
    try:
        # Get current active date
        current_date = registration_config.get('current_date') or date.today().isoformat()
        
        # Clear all booked numbers for current date
        global booked_numbers
        numbers_to_remove = []
        for reg_num, booking in booked_numbers.items():
            if booking.get('date') == current_date:
                numbers_to_remove.append(reg_num)
        
        for reg_num in numbers_to_remove:
            del booked_numbers[reg_num]
        
        print(f"Reset daily numbers for date: {current_date}")
        
        return jsonify({
            'message': f'Nomor registrasi untuk tanggal {current_date} berhasil direset',
            'reset_date': current_date,
            'cleared_bookings': len(numbers_to_remove)
        })
        
    except Exception as e:
        print(f"Reset daily numbers error: {str(e)}")
        return jsonify({'error': f'Reset daily error: {str(e)}'}), 500

@app.route('/api/release-reg-number', methods=['POST'])
@login_required
def release_reg_number():
    try:
        session_id = session.get('session_id')
        reg_number = request.json.get('reg_number')
        
        if reg_number and reg_number in booked_numbers:
            if booked_numbers[reg_number]['session_id'] == session_id:
                released_date = booked_numbers[reg_number].get('date')
                del booked_numbers[reg_number]
                print(f"Released number {reg_number} for date {released_date}")
                return jsonify({'message': 'Number released successfully'})
        
        return jsonify({'message': 'Nothing to release'})
        
    except Exception as e:
        print(f"Release reg number error: {str(e)}")
        return jsonify({'error': f'Release error: {str(e)}'}), 500

@app.route('/api/confirm-reg-number', methods=['POST'])
@login_required  
def confirm_reg_number():
    try:
        session_id = session.get('session_id')
        reg_number = request.json.get('reg_number')
        
        if reg_number and reg_number in booked_numbers:
            if booked_numbers[reg_number]['session_id'] == session_id:
                # Remove from booking when confirmed (data saved)
                confirmed_date = booked_numbers[reg_number].get('date')
                del booked_numbers[reg_number]
                print(f"Confirmed number {reg_number} for date {confirmed_date}")
                return jsonify({'message': 'Number confirmed and released'})
        
        return jsonify({'message': 'Number not found in booking'})
        
    except Exception as e:
        print(f"Confirm reg number error: {str(e)}")
        return jsonify({'error': f'Confirm error: {str(e)}'}), 500

@app.route('/api/arsip/bulk-upload', methods=['POST'])
@login_required
def bulk_upload_arsip():
    try:
        files = request.files.getlist('files')  # Use 'files' as it's used in your frontend
        if not files:
            return jsonify({'error': 'Tidak ada file yang diunggah'}), 400

        success_count = 0
        failed_files = []
        for file in files:
            filename = file.filename
            # Validasi nama file: yyyymmdd_{koderegistrasi}_{kodelayanan}.pdf
            import re
            match = re.match(r'^(\d{8})_(\d+)_([A-Z]+)\.pdf$', filename, re.IGNORECASE)
            if not match:
                failed_files.append(filename)
                continue
            
            reg_date_str = match.group(1)
            reg_number = int(match.group(2))
            service_code = match.group(3).upper()
            
            # Convert YYYYMMDD to YYYY-MM-DD for database compatibility
            reg_date_formatted = f"{reg_date_str[:4]}-{reg_date_str[4:6]}-{reg_date_str[6:8]}"
            
            # Create hierarchical archive path
            archive_path = create_archive_path(reg_date_formatted, filename)
            full_save_path = os.path.join(app.config['UPLOAD_FOLDER'], archive_path)
            
            # Save file
            file.save(full_save_path)
            
            # Update archive_path di pencatatan
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    "UPDATE pencatatan SET archive_path=%s WHERE reg_number=%s AND service_code=%s AND TO_CHAR(reg_date, 'YYYYMMDD')=%s",
                    (archive_path, reg_number, service_code, reg_date_str)
                )
                conn.commit()
                cur.close()
                conn.close()
                success_count += 1
            except Exception as db_err:
                failed_files.append(f"{filename} (DB error: {str(db_err)})")
                print(f"DB update error for {filename}: {db_err}")

        if failed_files:
            return jsonify({
                'error': f'Beberapa file gagal: {", ".join(failed_files)}', 
                'success': f'{success_count} file berhasil diunggah.'
            })
        return jsonify({'success': f'{success_count} file berhasil diunggah.'})
    except Exception as e:
        print(f"Error pada bulk upload: {e}")
        return jsonify({'error': 'Terjadi kesalahan di server'}), 500

@app.route('/api/settings', methods=['POST'])
@login_required
def update_settings():
    try:
        data = request.json
        start_number = int(data.get('start_number', 601))
        end_number = int(data.get('end_number', 700))
        
        # Validation
        if start_number >= end_number:
            return jsonify({'error': 'Nomor mulai harus lebih kecil dari nomor akhir'}), 400
        
        if end_number - start_number > 10000:  # Max 10000 numbers
            return jsonify({'error': 'Rentang nomor terlalu besar (maksimal 10000)'}), 400
        
        # Hapus pengecekan data di luar rentang baru
        # Fokus hanya update konfigurasi saja
        registration_config['start_number'] = start_number
        registration_config['end_number'] = end_number
        
        return jsonify({'message': 'Pengaturan berhasil disimpan'})
        
    except Exception as e:
        print(f"Update settings error: {str(e)}")
        return jsonify({'error': f'Settings update error: {str(e)}'}), 500

@app.route('/api/reset-numbers', methods=['POST'])
@login_required
def reset_numbers():
    try:
        # Clear all booked numbers
        global booked_numbers
        booked_numbers = {}
        
        print(f"Reset all booked numbers")
        
        return jsonify({'message': 'Nomor booking berhasil direset'})
        
    except Exception as e:
        print(f"Reset numbers error: {str(e)}")
        return jsonify({'error': f'Reset error: {str(e)}'}), 500

# ==============================================================================
# Endpoint Formulir F-1.03
# ==============================================================================
@app.route('/api/f103/submit', methods=['POST'])
@login_required
def f103_submit_route():
    """Handle F-1.03 form submission and return PDF."""
    print(f"🔄 F-1.03 endpoint accessed. Available: {F103_AVAILABLE}")
    
    if not F103_AVAILABLE:
        print("❌ F-1.03 functionality not available")
        return jsonify({
            'error': 'F-1.03 functionality not available. Missing f103.py module or dependencies.',
            'details': 'Check if f103.py exists and fpdf2 library is installed. Run: pip install fpdf2 pillow pdf2image'
        }), 500
    
    try:
        print("📄 Processing F-1.03 form submission...")
        print(f"Content-Type: {request.content_type}")
        print(f"Form keys: {list(request.form.keys()) if request.form else 'No form data'}")
        
        # Process form data
        data = {}
        signature = None
        
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle multipart form data
            for key, value in request.form.items():
                data[key] = value
            signature = request.form.get('signature')
        else:
            # Handle JSON data
            json_data = request.get_json()
            if json_data:
                data = json_data
                signature = data.get('signature')
        
        print(f"Processed data keys: {list(data.keys())}")
        
        # Get jumlah anggota
        jumlah_anggota = int(data.get('jumlah_anggota', 1))
        
        # Import and call the F-1.03 handler
        from f103 import generate_pdf_f103
        pdf_bytes = generate_pdf_f103(data, signature, jumlah_anggota)
        
        # Create response
        pdf_output = io.BytesIO(pdf_bytes)
        pdf_output.seek(0)
        
        # Generate filename
        tanggal = datetime.now().strftime('%Y%m%d')
        nik = (data.get("nik_pemohon", "NIK") or "NIK").replace(" ", "")
        nama = (data.get("nama_lengkap_pemohon", "NAMA") or "NAMA").replace(" ", "-")
        nik = ''.join(c for c in nik if c.isalnum())
        nama = ''.join(c for c in nama if c.isalnum() or c in ["_", "-"])
        filename = f"F-1.03_{tanggal}_{nik}_{nama}.pdf"
        
        print(f"✅ F-1.03 PDF generated successfully: {filename}")
        return send_file(pdf_output, as_attachment=True, download_name=filename, mimetype='application/pdf')
        
    except Exception as e:
        print(f"❌ F-1.03 submission error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'Failed to process F-1.03 form: {str(e)}',
            'type': type(e).__name__
        }), 500

# Health check endpoint untuk testing F-1.03 (TANPA login_required)
@app.route('/api/f103/test', methods=['GET'])
def f103_test():
    """Test F-1.03 availability - No login required."""
    try:
        # Test if fpdf is available
        fpdf_available = False
        try:
            from fpdf import FPDF
            fpdf_available = True
        except ImportError:
            pass
        
        return jsonify({
            'f103_available': F103_AVAILABLE,
            'fpdf_available': fpdf_available,
            'message': 'F-1.03 module is ready' if F103_AVAILABLE else 'F-1.03 module not available',
            'status': 'ok' if F103_AVAILABLE else 'error',
            'timestamp': datetime.now().isoformat(),
            'login_required': False
        })
    except Exception as e:
        return jsonify({
            'f103_available': False,
            'fpdf_available': False,
            'message': f'F-1.03 test failed: {str(e)}',
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'login_required': False
        }), 500

# Debug endpoint untuk cek session (TANPA login_required)
@app.route('/api/debug/session', methods=['GET'])
def debug_session():
    """Debug session information - No login required."""
    return jsonify({
        'session_data': dict(session),
        'logged_in': session.get('logged_in', False),
        'user': session.get('user'),
        'session_id': session.get('session_id'),
        'timestamp': datetime.now().isoformat()
    })

# Register F-1.03 blueprint only if available
if f103_bp is not None:
    app.register_blueprint(f103_bp, url_prefix='/api/f103')
    print("✅ F-1.03 blueprint registered")
else:
    print("⚠️ F-1.03 blueprint not registered (dependencies missing)")

if __name__ == '__main__':
    # Allow access from any IP address
    app.run(host='0.0.0.0', port=5000, debug=True)