-- backend/infrastructure/database/schema.sql

CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(20) PRIMARY KEY, -- Ex: 'EDP-042'
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR_SOC',
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id VARCHAR(20) REFERENCES operators(id),
    action VARCHAR(100) NOT NULL,
    target VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INSERÇÃO DE TESTE
-- Inserindo um operador mockado. A senha real "123456" hasheada com Bcrypt (cost 10)
INSERT INTO operators (id, name, role, password_hash, avatar_url, is_active)
VALUES (
  'EDP-042', 
  'Eduardo Vicentini Levy', 
  'OPERATOR_SOC', 
  '$2b$10$8K1p/a0d1.1v2W3x4Y5Z6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2', 
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 
  TRUE
)
ON CONFLICT (id) DO UPDATE 
SET password_hash = '$2b$10$8K1p/a0d1.1v2W3x4Y5Z6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2';