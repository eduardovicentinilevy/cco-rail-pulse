-- 008_app_meta.sql
-- Metadados da instalação. A chave 'line' guarda qual malha o banco representa,
-- para que uma troca de linha descarte o estado operacional da malha anterior.
--
-- Só a tabela é schema; a adoção da malha em si não é uma migração, porque não
-- acontece numa versão fixa do schema: ela compara o que está gravado aqui com
-- o `LINE_ID` do código e roda sempre que os dois divergirem. Fica em
-- `line-adoption.ts`, junto das migrações no caminho de deploy.
CREATE TABLE IF NOT EXISTS app_meta (
    key VARCHAR(40) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
