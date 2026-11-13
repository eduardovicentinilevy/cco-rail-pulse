-- 004_mfa_replay_guard.sql
-- Impede o reuso do mesmo código TOTP dentro da janela de tolerância (±30s):
-- o último passo aceito fica registrado no operador.

ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_last_used_step BIGINT;
