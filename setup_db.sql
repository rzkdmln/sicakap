CREATE DATABASE sicakap_db;

\c sicakap_db

-- Hapus UNIQUE constraint dari NIK karena bisa ada orang yang pindah domisili lebih dari 1x
CREATE TABLE pencatatan (id SERIAL PRIMARY KEY,reg_number INTEGER NOT NULL,reg_date DATE NOT NULL,service_code VARCHAR(10),nik VARCHAR(16) NOT NULL,name VARCHAR(255) NOT NULL,phone_number VARCHAR(20),email VARCHAR(255),no_skpwni VARCHAR(50),no_skdwni VARCHAR(50),no_kk VARCHAR(50),no_skbwni VARCHAR(50),status VARCHAR(50) DEFAULT 'SELESAI',archive_path TEXT,notes TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

-- Jika tabel sudah ada, hapus constraint UNIQUE dari NIK
ALTER TABLE pencatatan DROP CONSTRAINT IF EXISTS pencatatan_nik_key;

CREATE TABLE redaksi (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'umum',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clear any existing default data
DELETE FROM redaksi WHERE id IN (1, 2);

-- Jika tabel redaksi sudah ada tanpa kolom category, tambahkan kolom tersebut
ALTER TABLE redaksi ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'umum';

-- Update existing records yang tidak memiliki category
UPDATE redaksi SET category = 'umum' WHERE category IS NULL OR category = '';

-- Add session management table (optional for tracking active sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Create index for session cleanup
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
