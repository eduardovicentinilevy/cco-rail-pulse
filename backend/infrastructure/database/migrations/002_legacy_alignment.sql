-- 002_legacy_alignment.sql
-- Alinha bancos criados antes desta numeração ao estado da linha de base.
--
-- Em um banco novo esta migração não encontra nada a converter: as colunas já
-- nascem em 001 e o DEFAULT do perfil já é o correto. Ela existe para os bancos
-- que rodaram as versões anteriores do CCO.

-- Bancos anteriores ao 2FA não têm as colunas do segundo fator.
ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 'OPERATOR_SOC' é jargão de centro de operações de segurança, herdado por engano.
UPDATE operators SET role = 'OPERADOR' WHERE role = 'OPERATOR_SOC';

-- O DEFAULT declarado no CREATE TABLE não alcança tabelas que já existiam.
ALTER TABLE operators ALTER COLUMN role SET DEFAULT 'OPERADOR';
