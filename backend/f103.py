# Import dependencies dengan error handling yang lebih baik
try:
    from flask import request, send_file, Blueprint, jsonify
    FLASK_AVAILABLE = True
except ImportError as e:
    print(f"❌ Flask not available: {e}")
    FLASK_AVAILABLE = False

try:
    from fpdf import FPDF
    import base64
    import os
    from datetime import datetime
    import uuid
    FPDF_AVAILABLE = True
    print("✅ FPDF imported successfully")
except ImportError as e:
    print(f"❌ FPDF not available: {e}")
    print("💡 Install with: pip install fpdf2")
    FPDF_AVAILABLE = False

try:
    import io
    from PIL import Image
    import tempfile
    from pdf2image import convert_from_bytes
    BASIC_DEPS_AVAILABLE = True
except ImportError as e:
    print(f"❌ Basic dependencies not available: {e}")
    BASIC_DEPS_AVAILABLE = False

# Only create blueprint if all dependencies are available
if FLASK_AVAILABLE and FPDF_AVAILABLE and BASIC_DEPS_AVAILABLE:
    f103_bp = Blueprint('f103', __name__)
    print("✅ F-1.03 blueprint created successfully")
    
    @f103_bp.route('/test', methods=['GET'])
    def test_f103():
        """Test endpoint untuk memastikan F-1.03 module tersedia"""
        return jsonify({
            'status': 'success',
            'message': 'F-1.03 module is available',
            'fpdf_available': FPDF_AVAILABLE,
            'timestamp': datetime.now().isoformat()
        })

    @f103_bp.route('/submit', methods=['POST'])
    def submit_f103():
        """Endpoint untuk menghasilkan dan mengunduh file PDF."""
        try:
            print("📄 Starting F-1.03 PDF generation...")
            
            # Get form data - handle both form-data and JSON
            if request.content_type and 'multipart/form-data' in request.content_type:
                data = request.form.to_dict(flat=False)
                signature = request.form.get('signature')
            else:
                data = request.json or {}
                signature = data.get('signature')
            
            # Convert single-item lists to strings for easier processing
            processed_data = {}
            for key, value in data.items():
                if isinstance(value, list) and len(value) == 1:
                    processed_data[key] = value[0]
                elif isinstance(value, list):
                    processed_data[key] = value
                else:
                    processed_data[key] = value
            
            print(f"Processed form data keys: {list(processed_data.keys())}")
            
            jumlah_anggota = int(processed_data.get('jumlah_anggota', 1))
            
            # Generate PDF
            pdf_bytes = generate_pdf_f103(processed_data, signature, jumlah_anggota)
            
            pdf_output = io.BytesIO(pdf_bytes)
            pdf_output.seek(0)
            
            # Format nama file PDF
            tanggal = datetime.now().strftime('%Y%m%d')
            nik = (processed_data.get("nik_pemohon", "NIK") or "NIK").replace(" ", "")
            nama = (processed_data.get("nama_lengkap_pemohon", "NAMA") or "NAMA").replace(" ", "-")
            nik = ''.join(c for c in nik if c.isalnum())
            nama = ''.join(c for c in nama if c.isalnum() or c in ["_", "-"])
            filename = f"F-1.03_{tanggal}_{nik}_{nama}.pdf"
            
            print(f"✅ PDF generated successfully: {filename}")
            return send_file(pdf_output, as_attachment=True, download_name=filename, mimetype='application/pdf')
            
        except Exception as e:
            print(f"❌ Error in F-1.03 submit: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to generate PDF: {str(e)}'}), 500

    @f103_bp.route('/submit_img', methods=['POST'])
    def submit_img():
        """Endpoint untuk menghasilkan dan mengunduh file PNG."""
        data = request.form.to_dict(flat=False)
        signature = request.form.get('signature')
        jumlah_anggota = int(request.form.get('jumlah_anggota', 1))

        # Panggil fungsi helper yang sama untuk membuat PDF
        pdf_bytes = generate_pdf_f103(data, signature, jumlah_anggota)
        
        # Konversi PDF bytes ke gambar (PNG)
        images = convert_from_bytes(pdf_bytes, fmt='png', dpi=200)
        img_io = io.BytesIO()
        if images:
            images[0].save(img_io, format='PNG')
        img_io.seek(0)

        # Format nama file PNG
        tanggal_ymd = datetime.now().strftime('%Y%m%d')
        nik = (data.get("nik_pemohon", ["NIK"])[0] or "NIK").replace(" ", "")
        nama = (data.get("nama_lengkap_pemohon", ["NAMA"])[0] or "NAMA").replace(" ", "-")
        nik = ''.join(c for c in nik if c.isalnum())
        nama = ''.join(c for c in nama if c.isalnum() or c in ["_", "-"])
        filename = f"F-1.03_{tanggal_ymd}_{nik}_{nama}.png"

        return send_file(img_io, as_attachment=True, download_name=filename, mimetype='image/png')

    def handle_f103_submission(data, signature_data=None):
        """Handle F-1.03 form submission for PDF generation"""
        try:
            print("📄 Processing F-1.03 form submission...")
            
            # Get jumlah anggota from form data
            jumlah_anggota = int(data.get('jumlah_anggota', [1])[0] if isinstance(data.get('jumlah_anggota'), list) else data.get('jumlah_anggota', 1))
            
            # Generate PDF
            pdf_bytes = generate_pdf_f103(data, signature_data, jumlah_anggota)
            
            # Generate filename
            nama_pemohon = data.get('nama_lengkap_pemohon', ['Unknown'])[0] if isinstance(data.get('nama_lengkap_pemohon'), list) else data.get('nama_lengkap_pemohon', 'Unknown')
            filename = f"F-1.03_{nama_pemohon.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            
            return pdf_bytes, filename
            
        except Exception as e:
            print(f"❌ Error in handle_f103_submission: {e}")
            import traceback
            traceback.print_exc()
            raise e

    def submit_img(data, signature_data=None):
        """Generate image version of F-1.03"""
        try:
            print("🔄 Starting F-1.03 image generation...")
            
            # Get jumlah anggota from form data
            jumlah_anggota = int(data.get('jumlah_anggota', [1])[0] if isinstance(data.get('jumlah_anggota'), list) else data.get('jumlah_anggota', 1))
            
            # First generate PDF
            pdf_bytes = generate_pdf_f103(data, signature_data, jumlah_anggota)
            
            # Convert PDF to image using PIL and pdf2image
            try:
                from pdf2image import convert_from_bytes
                from PIL import Image
                import io
                
                # Convert PDF to images
                images = convert_from_bytes(pdf_bytes, dpi=200, first_page=1, last_page=1)
                
                if images:
                    # Get the first page as image
                    img = images[0]
                    
                    # Convert to PNG bytes
                    img_buffer = io.BytesIO()
                    img.save(img_buffer, format='PNG', quality=95, optimize=True)
                    img_bytes = img_buffer.getvalue()
                    
                    # Generate filename
                    nama_pemohon = data.get('nama_lengkap_pemohon', ['Unknown'])[0] if isinstance(data.get('nama_lengkap_pemohon'), list) else data.get('nama_lengkap_pemohon', 'Unknown')
                    filename = f"F-1.03_{nama_pemohon.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                    
                    return img_bytes, filename
                else:
                    raise Exception("Failed to convert PDF to image")
                    
            except ImportError:
                print("⚠️ pdf2image not available, returning PDF instead")
                # Fallback: return PDF with .png extension (browser will handle)
                nama_pemohon = data.get('nama_lengkap_pemohon', ['Unknown'])[0] if isinstance(data.get('nama_lengkap_pemohon'), list) else data.get('nama_lengkap_pemohon', 'Unknown')
                filename = f"F-1.03_{nama_pemohon.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                return pdf_bytes, filename
                
        except Exception as e:
            print(f"❌ F-1.03 image generation error: {e}")
            import traceback
            traceback.print_exc()
            raise e

    def generate_pdf_f103(data, signature=None, jumlah_anggota=1):
        """Generate PDF untuk formulir F-1.03 dengan data lengkap"""
        try:
            print(f"📄 Generating PDF with {jumlah_anggota} family members...")
            
            # Initialize PDF
            pdf = FPDF(format='A4')
            pdf.set_margins(left=5, top=3, right=5)
            pdf.set_auto_page_break(auto=True, margin=3)
            pdf.add_page()
            
            # Title
            pdf.set_font("Arial", style="B", size=10)
            pdf.cell(180, 7, "FORMULIR PENDAFTARAN PERPINDAHAN PENDUDUK", 1, 0, 'C')
            pdf.cell(20, 7, "F-1.03", 1, 1, 'C')
            pdf.set_font("Arial", size=8)
            pdf.ln(1)
            
            # Helper function untuk get form data dengan fallback
            def get_form_data(key, default=''):
                value = data.get(key, default)
                if isinstance(value, list):
                    return value[0] if value else default
                return str(value) if value else default
            
            # Baris 1 - No. KK (kotak 16 digit)
            pdf.cell(40, 5, "1.   No. KK", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            no_kk = get_form_data("no_kk").replace(" ", "")
            box_w = 5
            box_h = 5
            for i in range(16):
                digit = no_kk[i] if i < len(no_kk) else ""
                pdf.cell(box_w, box_h, digit, 1, 0, 'C')
            pdf.cell(5, 3, "", 0, 0)  # Spacer
            pdf.cell(12, 5, "No. HP", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(53, 5, get_form_data("no_hp"), 1, 1)

            # Baris 2 - Nama Lengkap Pemohon
            pdf.cell(40, 5, "2.   Nama Lengkap Pemohon", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(80, 5, get_form_data("nama_lengkap_pemohon"), 1)
            pdf.cell(5, 3, "", 0, 0)  # Spacer
            pdf.cell(12, 5, "Email", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(53, 5, get_form_data("email"), 1, 1)

            # Baris 3 - NIK (kotak 16 digit)
            pdf.cell(40, 5, "3.   NIK", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            nik = get_form_data("nik_pemohon").replace(" ", "")
            for i in range(16):
                digit = nik[i] if i < len(nik) else ""
                pdf.cell(box_w, box_h, digit, 1, 0, 'C')
            pdf.ln(5)

            # 4. Jenis Permohonan
            y_before = pdf.get_y()
            x_before = pdf.get_x()
            pdf.cell(40, 20, "4.   Jenis Permohonan", 1, 0, 'L')
            pdf.cell(5, 15, ":", 0, 0, 'C')
            pdf.set_font("Arial", style="B", size=8)
            pdf.cell(60, 5, "SURAT KETERANGAN KEPENDUDUK", 0, 1, 'L')
            pdf.set_font("Arial", style="", size=8)
            jenis_pilihan = [
                "Surat Keterangan Pindah",
                "Surat Keterangan Pindah Luar Negeri (SKPLN)",
                "Surat Keterangan Tempat Tinggal (SKTT) Bagi OA Tinggal Terbatas"
            ]
            jawaban_radio = get_form_data("jenis_permohonan")
            pdf.set_xy(x_before + 45, y_before + 5)
            for p in jenis_pilihan:
                pdf.cell(5, 5, "X" if p == jawaban_radio else "", 1, 0, 'C')
                pdf.cell(90, 5, p, 0, 1, 'L')
                pdf.set_x(x_before + 45)
            pdf.cell(0, 1, "", 0, 1)

            # 5. Alamat Asal
            pdf.cell(40, 5, "5.   Alamat Asal", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(120, 5, get_form_data('alamat_asal'), 1, 0)
            pdf.cell(1, 3, "", 0, 0)
            pdf.cell(7, 5, "RT:", 0, 0)
            pdf.cell(10, 5, get_form_data('asal_rt'), 1, 0, 'C')
            pdf.cell(7, 5, "RW:", 0, 0)
            pdf.cell(10, 5, get_form_data('asal_rw'), 1, 1, 'C')
            pdf.cell(45, 5, "", 0, 0)
            pdf.cell(20, 5, "a. Desa/Kel.", 0, 0)
            pdf.cell(50, 5, get_form_data('asal_desa_nama').upper(), 1, 0)
            pdf.cell(15, 5, "", 0, 0)
            pdf.cell(20, 5, "b. Kec.", 0, 0)
            pdf.cell(50, 5, get_form_data('asal_kec_nama').upper(), 1, 1)
            pdf.cell(45, 5, "", 0, 0)
            pdf.cell(20, 5, "c. Kab./Kota", 0, 0)
            pdf.cell(50, 5, get_form_data('asal_kab_nama').upper(), 1, 0)
            pdf.cell(15, 5, "", 0, 0)
            pdf.cell(20, 5, "d. Provinsi", 0, 0)
            pdf.cell(50, 5, get_form_data('asal_prov_nama').upper(), 1, 1)
            pdf.cell(45, 5, "", 0, 0)
            pdf.cell(20, 5, "     Kode Pos:", 0, 0)
            kodepos = get_form_data('asal_kodepos')
            for i in range(5):
                digit = kodepos[i] if i < len(kodepos) else ""
                pdf.cell(5, 5, digit, 1, 0, 'C')
            pdf.ln(5)

            # 6. Klasifikasi Kepindahan
            y_before = pdf.get_y()
            x_before = pdf.get_x()
            pdf.cell(40, 25, "6.   Klasifikasi Kepindahan", 1, 0, 'L')
            pdf.cell(5, 25, ":", 0, 0, 'C')
            pilihan = [
                "Dalam satu desa/kelurahan atau yang disebut dengan nama lain",
                "Antar desa/kelurahan /yang disebut dg nama lain dalam 1 kec.",
                "Antar kecamatan/yang disebut dg nama lain dalam satu kab/kota",
                "Antar kabupaten/kota dalam satu provinsi",
                "Antar provinsi"
            ]
            mapping_klasifikasi = {
                "dalam_satu_desa": pilihan[0],
                "antar_desa": pilihan[1],
                "antar_kecamatan": pilihan[2],
                "antar_kabupaten": pilihan[3],
                "antar_provinsi": pilihan[4]
            }
            value_radio = get_form_data("klasifikasi_kepindahan")
            jawaban = mapping_klasifikasi.get(value_radio, "")
            pdf.set_xy(x_before + 45, y_before)
            for p in pilihan:
                pdf.cell(5, 5, "X" if jawaban == p else "", 1, 0, 'C')
                pdf.cell(135, 5, p, 0, 1, 'L')
                pdf.set_x(x_before + 45)
            pdf.cell(0, 1, "", 0, 1)

            # 7. Alamat Pindah - PERBAIKI BAGIAN INI
            pdf.cell(40, 5, "7.   Alamat Pindah", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(120, 5, get_form_data('alamat_pindah'), 1, 0)
            pdf.cell(1, 3, "", 0, 0)
            pdf.cell(7, 5, "RT:", 0, 0)
            pdf.cell(10, 5, get_form_data('pindah_rt'), 1, 0, 'C')
            pdf.cell(7, 5, "RW:", 0, 0)
            pdf.cell(10, 5, get_form_data('pindah_rw'), 1, 1, 'C')
            pdf.cell(45, 5, "", 0, 0)
            pdf.cell(20, 5, "a. Desa/Kel.", 0, 0)
            pdf.cell(50, 5, get_form_data('pindah_desa_nama').upper(), 1, 0)
            pdf.cell(15, 5, "", 0, 0)
            pdf.cell(20, 5, "b. Kec.", 0, 0)
            pdf.cell(50, 5, get_form_data('pindah_kec_nama').upper(), 1, 1)
            pdf.cell(45, 5, "", 0, 0)
            pdf.cell(20, 5, "c. Kab./Kota", 0, 0)
            pdf.cell(50, 5, get_form_data('pindah_kab_nama').upper(), 1, 0)
            pdf.cell(15, 5, "", 0, 0)
            pdf.cell(20, 5, "d. Provinsi", 0, 0)
            pdf.cell(50, 5, get_form_data('pindah_prov_nama').upper(), 1, 1)
            pdf.cell(45, 5, "", 0, 0)
            pdf.cell(20, 5, "Kode Pos", 0, 0)
            pindah_kodepos = get_form_data('pindah_kodepos')
            for i in range(5):
                digit = pindah_kodepos[i] if i < len(pindah_kodepos) else ""
                pdf.cell(5, 5, digit, 1, 0, 'C')
            pdf.ln(6)

            # 8. Alasan Pindah - PERBAIKI CHECKBOX
            y_before = pdf.get_y()
            x_before = pdf.get_x()
            pdf.cell(40, 10, "8.   Alasan Pindah", 1, 0, 'L')
            pdf.cell(5, 5, ":", 0, 0, 'C')
            alasan_pilihan = [
                "PEKERJAAN", "PENDIDIKAN", "KEAMANAN", "KESEHATAN",
                "PERUMAHAN", "KELUARGA", "LAINNYA"
            ]
            alasan_selected = get_form_data("alasan_pindah").upper()
            alasan_lainnya = get_form_data("alasan_lainnya") if alasan_selected == "LAINNYA" else ""
            
            x_alasan = x_before + 45
            y_alasan = y_before
            # Kolom 1-4
            pdf.set_xy(x_alasan, y_alasan)
            for i in range(2):
                checked = "X" if alasan_pilihan[i] == alasan_selected else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(15, 5, alasan_pilihan[i].title(), 0, 1, 'L')
                pdf.set_x(x_alasan)
            x2 = x_alasan + 40
            pdf.set_xy(x2, y_alasan)
            for i in range(2, 4):
                checked = "X" if alasan_pilihan[i] == alasan_selected else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(15, 5, alasan_pilihan[i].title(), 0, 1, 'L')
                pdf.set_x(x2)
            x3 = x2 + 40
            pdf.set_xy(x3, y_alasan)
            for i in range(4, 6):
                checked = "X" if alasan_pilihan[i] == alasan_selected else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(15, 5, alasan_pilihan[i].title(), 0, 1, 'L')
                pdf.set_x(x3)
            x4 = x3 + 40
            pdf.set_xy(x4, y_alasan)
            checked = "X" if alasan_selected == "LAINNYA" else ""
            pdf.cell(5, 5, checked, 1, 0, 'C')
            pdf.cell(15, 5, "Lainnya", 0, 1, 'L')
            pdf.set_x(x4)
            if alasan_selected == "LAINNYA":
                pdf.cell(30, 5, alasan_lainnya.upper() if alasan_lainnya else " ", 'B', 1, 'C')
            pdf.ln(6)

            # 9. Jenis Kepindahan - PERBAIKI CHECKBOX
            y_before = pdf.get_y()
            x_before = pdf.get_x()
            pdf.cell(40, 10, "9.   Jenis Kepindahan", 1, 0, 'L')
            pdf.cell(5, 10, ":", 0, 0, 'C')
            jenis_kepindahan_pilihan = [
                "KEPALA_KELUARGA", "KEPALA_DAN_SELURUH_ANGGOTA",
                "KEPALA_DAN_SEBAGIAN_ANGGOTA", "ANGGOTA_KELUARGA"
            ]
            jenis_labels = [
                "Kepala Keluarga", "Kepala & Seluruh Anggota Keluarga",
                "Kepala dan Sebagian Anggota Keluarga", "Anggota Keluarga"
            ]
            jawaban_jk = get_form_data("jenis_kepindahan")
            x_jk = x_before + 45
            y_jk = y_before
            pdf.set_xy(x_jk, y_jk)
            for i in range(2):
                checked = "X" if jenis_kepindahan_pilihan[i] == jawaban_jk else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(40, 5, jenis_labels[i], 0, 1, 'L')
                pdf.set_x(x_jk)
            x2_jk = x_jk + 80
            pdf.set_xy(x2_jk, y_jk)
            for i in range(2, 4):
                checked = "X" if jenis_kepindahan_pilihan[i] == jawaban_jk else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(60, 5, jenis_labels[i], 0, 1, 'L')
                pdf.set_x(x2_jk)
            pdf.ln(1)

            # 10. Status KK Tidak Pindah - PERBAIKI CHECKBOX
            pilihan_tidak_pindah = ["NUMPANG_KK", "MEMBUAT_KK_BARU", "KK_TETAP"]
            pilihan_labels = ["Numpang KK", "Membuat KK Baru", "KK Tetap"]
            jawaban_tidak_pindah = get_form_data("status_kk_tidak_pindah")
            y_before = pdf.get_y()
            x_before = pdf.get_x()
            pdf.multi_cell(40, 5, "10. Anggota Tidak Pindah", 1, 'L')
            pdf.set_xy(x_before + 40, y_before)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            x1 = x_before + 45
            pdf.set_xy(x1, y_before)
            for i in range(2):
                checked = "X" if pilihan_tidak_pindah[i] == jawaban_tidak_pindah else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(35, 5, pilihan_labels[i], 0, 1, 'L')
                pdf.set_x(x1)
            x2 = x1 + 80
            pdf.set_xy(x2, y_before)
            checked = "X" if pilihan_tidak_pindah[2] == jawaban_tidak_pindah else ""
            pdf.cell(5, 5, checked, 1, 0, 'C')
            pdf.cell(35, 5, pilihan_labels[2], 0, 1, 'L')
            pdf.ln(6)

            # 11. Status KK Pindah - PERBAIKI CHECKBOX
            pilihan_yang_pindah = ["NUMPANG_KK", "MEMBUAT_KK_BARU", "KK_TETAP"]
            jawaban_yang_pindah = get_form_data("status_kk_pindah")
            y_before = pdf.get_y()
            x_before = pdf.get_x()
            pdf.multi_cell(40, 5, "11. Anggota yang Pindah", 1, 'L')
            pdf.set_xy(x_before + 40, y_before)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            x1 = x_before + 45
            pdf.set_xy(x1, y_before)
            for i in range(2):
                checked = "X" if pilihan_yang_pindah[i] == jawaban_yang_pindah else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(35, 5, pilihan_labels[i], 0, 1, 'L')
                pdf.set_x(x1)
            x2 = x1 + 80
            pdf.set_xy(x2, y_before)
            checked = "X" if pilihan_yang_pindah[2] == jawaban_yang_pindah else ""
            pdf.cell(5, 5, checked, 1, 0, 'C')
            pdf.cell(35, 5, pilihan_labels[2], 0, 1, 'L')
            pdf.ln(5)

            # 12. Daftar Anggota Keluarga yang Pindah
            pdf.cell(190, 5, "12. Daftar Anggota Keluarga yang Pindah", 0, 1)
            pdf.set_font("Arial", size=8)
            pdf.set_fill_color(200, 200, 200)
            pdf.cell(10, 5, "NO", 1, 0, 'C', True)
            pdf.cell(80, 5, "NIK", 1, 0, 'C', True)
            pdf.cell(75, 5, "NAMA LENGKAP", 1, 0, 'C', True)
            pdf.cell(35, 5, "Hub Keluarga (SHDK)", 1, 1, 'C', True)
            pdf.cell(10, 0, "", 0, 0)
            for _ in range(16):
                pdf.cell(5, 5, "", 1, 0)
            pdf.cell(75, 0, "", 0, 0)
            pdf.cell(35, 0, "", 0, 1)
            for i in range(1, jumlah_anggota + 1):
                pdf.cell(10, 5, str(i), 1, 0, 'C')
                nik_anggota = get_form_data(f"anggota_nik_{i}").replace(" ", "")
                for j in range(16):
                    digit = nik_anggota[j] if j < len(nik_anggota) else ""
                    pdf.cell(5, 5, digit, 1, 0, 'C')
                pdf.cell(75, 5, get_form_data(f"anggota_nama_{i}"), 1, 0)
                pdf.cell(35, 5, get_form_data(f"anggota_shdk_{i}"), 1, 1)
            pdf.set_font("Arial", size=8)
            pdf.ln(1)

            # 13-16. Bagian Orang Asing
            pdf.set_font("Arial", style="B", size=6)
            pdf.cell(190, 4, "Diisi oleh Penduduk OA (Orang Asing) pemegang ITAS yg mengajukan SKTT dan OA Pemegang ITAP yg Mengajukan Sur Ket Kependudukan Lainnya", 0, 1)
            pdf.set_font("Arial", size=8)
            pdf.cell(40, 5, "13. Nama Sponsor", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(155, 5, get_form_data("nama_sponsor"), 1, 1)
            pdf.cell(40, 5, "14. Tipe Sponsor", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            x_tipe = pdf.get_x()
            tipe_pilihan = ["Organisasi", "Pemerintah", "Perusahaan", "Perorangan", "Tanpa Sponsor"]
            tipe_jawaban = get_form_data("tipe_sponsor")
            pdf.set_x(x_tipe)
            for tipe in tipe_pilihan:
                checked = "X" if tipe == tipe_jawaban else ""
                pdf.cell(5, 5, checked, 1, 0, 'C')
                pdf.cell(25, 5, tipe, 0, 0, 'L')
            pdf.ln(5)
            pdf.cell(40, 5, "15. Alamat Sponsor", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(155, 5, get_form_data("alamat_sponsor"), 1, 1)
            pdf.set_xy(pdf.get_x(), pdf.get_y())
            pdf.multi_cell(40, 4, "16. Nomor dan Tanggal\n     KITAS & KITAP", 1, 'L')
            pdf.set_xy(pdf.get_x() + 0, pdf.get_y() - 8)
            pdf.cell(5, 6, ":", 0, 0, 'C')
            nomor_kitas = get_form_data('nomor_kitas_kitap')
            for i in range(12):
                digit = nomor_kitas[i] if i < len(nomor_kitas) else ""
                pdf.cell(5, 5, digit, 1, 0, 'C')
            pdf.cell(5, 5, "", 0, 0)
            tgl_kitas = get_form_data('tanggal_kitas_kitap')
            for i in range(12):
                digit = tgl_kitas[i] if i < len(tgl_kitas) else ""
                pdf.cell(5, 5, digit, 1, 0, 'C')
            pdf.ln(6)
            pdf.cell(45, 3, "", 0, 0)
            pdf.cell(59, 3, "Nomor", 0, 0, 'C')
            pdf.cell(10, 3, "", 0, 0)
            pdf.cell(54, 3, "Tanggal Masa Berlaku", 0, 1, 'C')

            # 17-20. Bagian SKPLN
            pdf.set_font("Arial", style="B", size=6)
            pdf.cell(190, 4, "Diisi oleh Penduduk yang Mengajukan Surat Keterangan Pindah Luar Negeri (SKPLN)", 0, 1)
            pdf.set_font("Arial", size=8)
            pdf.cell(40, 5, "17. Negara Tujuan", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(115, 5, get_form_data("negara_tujuan"), 1, 0)
            pdf.cell(5, 5, "", 0, 0)
            pdf.cell(20, 5, "Kode Negara:", 0, 0, 'R')
            kode_negara = get_form_data("kode_negara")
            for i in range(3):
                digit = kode_negara[i] if i < len(kode_negara) else ""
                pdf.cell(5, 5, digit, 1, 0, 'C')
            pdf.ln(5)
            pdf.cell(40, 5, "18. Alamat Tujuan", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(155, 5, get_form_data("alamat_negara_tujuan"), 1, 1)
            pdf.cell(40, 5, "19. Penanggung Jawab", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(155, 5, get_form_data("penanggung_jawab"), 1, 1)
            pdf.cell(40, 5, "20. Rencana Pindah", 1)
            pdf.cell(5, 5, ":", 0, 0, 'C')
            pdf.cell(7, 5, "Tgl.", 0, 0, 'C')
            pdf.cell(10, 5, get_form_data('rencana_pindah_tgl'), 1, 0, 'C')
            pdf.cell(5, 5, "", 0, 0, 'C')
            pdf.cell(7, 5, "Bln.", 0, 0, 'C')
            pdf.cell(10, 5, get_form_data('rencana_pindah_bln'), 1, 0, 'C')
            pdf.cell(5, 5, "", 0, 0, 'C')
            pdf.cell(7, 5, "Thn.", 0, 0, 'C')
            thn = get_form_data('rencana_pindah_thn')
            for i in range(4):
                digit = thn[i] if i < len(thn) else ""
                pdf.cell(5, 5, digit, 1, 0, 'C')
            pdf.ln(4)

            # Tanda Tangan
            pdf.set_font("Arial", size=7)
            y_ttd = pdf.get_y()
            x_left = 10
            x_right = 120
            tanggal_str = datetime.now().strftime('%d-%m-%Y')
            pdf.set_xy(x_right, y_ttd)
            pdf.cell(70, 5, f"Garut, {tanggal_str}", 0, 1, 'C')
            pdf.set_xy(x_left, y_ttd + 6)
            pdf.cell(70, 2, "Mengetahui,", 0, 0, 'C')
            pdf.set_xy(x_right, y_ttd + 6)
            pdf.cell(70, 0, "Pemohon", 0, 1, 'C')
            pdf.set_xy(x_left, y_ttd + 7)
            pdf.multi_cell(70, 3, "Kepala Dinas Kependudukan dan\nPencatatan Sipil Kab. Garut", 0, 'C')
            
            signature_filename = "signature.png"
            if signature:
                try:
                    header, encoded = signature.split(",", 1)
                    img_bytes = base64.b64decode(encoded)
                    # Menyimpan gambar ke file sementara karena fpdf versi ini tidak mendukung objek BytesIO
                    with open(signature_filename, "wb") as f:
                        f.write(img_bytes)
                    pdf.image(signature_filename, x=x_right + 20, y=y_ttd + 7, w=30, h=15)
                except (ValueError, TypeError):
                    # Handle error jika format signature salah
                    pass

            pdf.set_xy(x_left, y_ttd + 20)
            pdf.set_font("Arial", size=7)
            pdf.cell(70, 4, "....................................................", 0, 0, 'C')
            pdf.set_xy(x_right, y_ttd + 20)
            # Gunakan custom_signer_name jika ada, fallback ke nama_lengkap_pemohon
            custom_signer = get_form_data("custom_signer_name")
            nama_pemohon = get_form_data("nama_lengkap_pemohon")
            signer_name = custom_signer.strip() if custom_signer.strip() else nama_pemohon
            pdf.cell(70, 4, signer_name.upper(), 0, 1, 'C')

            # Menghapus file tanda tangan sementara jika ada
            if os.path.exists(signature_filename):
                os.remove(signature_filename)
            
            # Mengembalikan output PDF sebagai bytes
            return pdf.output(dest='S')
        
        except Exception as e:
            print(f"❌ Error in PDF generation: {e}")
            import traceback
            traceback.print_exc()
            raise e

else:
    # Dependencies not available, create a dummy blueprint
    f103_bp = None
    print("❌ F-1.03 module cannot be created - missing dependencies")
    print("💡 Install required packages: pip install fpdf2 pillow")

# Test function untuk memastikan module bisa diimport
def test_f103_module():
    """Test function to verify module is working."""
    if f103_bp is not None:
        print("🧪 F-1.03 module test successful")
        return True
    else:
        print("⚠️ F-1.03 module test failed - dependencies missing")
        return False

# Run test saat module diimport (hanya jika tidak dalam testing)
if __name__ != "__main__":
    try:
        test_f103_module()
    except Exception as e:
        print(f"⚠️ F-1.03 module test failed: {e}")
