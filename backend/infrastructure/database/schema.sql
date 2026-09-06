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
INSERT INTO operators (id, name, role, password_hash) 
VALUES (
    'EDP-042', 
    'Eduardo Operador', 
    'SUPERVISOR', 
    '$2b$10$X7x2eUv08P.OOTI5/dC5t.2rB8E3eG3t0dY5r9aX/tG0z3t9a5xQe'
) ON CONFLICT (id) DO NOTHING;