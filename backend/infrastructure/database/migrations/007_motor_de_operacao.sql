-- 007_motor_de_operacao.sql
-- Motor de operação e manobra de energia: estado de marcha das composições e
-- as seções de alimentação do terceiro trilho.

-- Estado de marcha. Até aqui a composição guardava só a estação atual; o motor
-- precisa saber para que lado vai, para onde, quanto já andou do trecho e desde
-- quando, mais o tempo de parada restante e o motivo de uma retenção.
ALTER TABLE trains ADD COLUMN IF NOT EXISTS direction SMALLINT NOT NULL DEFAULT 1 CHECK (direction IN (1, -1));
ALTER TABLE trains ADD COLUMN IF NOT EXISTS next_station_code VARCHAR(10);
ALTER TABLE trains ADD COLUMN IF NOT EXISTS segment_progress REAL NOT NULL DEFAULT 0;
ALTER TABLE trains ADD COLUMN IF NOT EXISTS progress_at TIMESTAMPTZ;
ALTER TABLE trains ADD COLUMN IF NOT EXISTS remaining_ms INTEGER;
ALTER TABLE trains ADD COLUMN IF NOT EXISTS hold_reason VARCHAR(160);

-- Seções de alimentação do terceiro trilho, uma por subestação retificadora.
-- Nascem energizadas; o seed insere uma linha por SR do traçado.
CREATE TABLE IF NOT EXISTS power_sections (
    substation VARCHAR(10) PRIMARY KEY,
    energized BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    changed_by VARCHAR(50),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
