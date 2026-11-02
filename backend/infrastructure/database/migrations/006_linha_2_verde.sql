-- 006_linha_2_verde.sql
-- Troca da malha: Linha 6-Laranja (catenária, 25 kV CA) pela Linha 2-Verde
-- (terceiro trilho, 750 Vcc). Muda a unidade das colunas de tensão e descarta o
-- estado operacional da malha anterior, que não existe mais no traçado.

-- Tensão: de kV de catenária para V de terceiro trilho. Os blocos IF rodam uma
-- única vez; em bancos que já nasceram com as colunas em volts não fazem nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trains' AND column_name = 'voltage_kv'
  ) THEN
    ALTER TABLE trains RENAME COLUMN voltage_kv TO voltage_v;
    ALTER TABLE trains ALTER COLUMN voltage_v TYPE NUMERIC(6, 1);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telemetry_samples' AND column_name = 'min_kv'
  ) THEN
    ALTER TABLE telemetry_samples RENAME COLUMN min_kv TO min_v;
    ALTER TABLE telemetry_samples RENAME COLUMN avg_kv TO avg_v;
    ALTER TABLE telemetry_samples RENAME COLUMN max_kv TO max_v;
    ALTER TABLE telemetry_samples
      ALTER COLUMN min_v TYPE NUMERIC(6, 1),
      ALTER COLUMN avg_v TYPE NUMERIC(6, 1),
      ALTER COLUMN max_v TYPE NUMERIC(6, 1);
  END IF;
END $$;

-- Estado da malha anterior. Composições paradas em estações que não existem
-- neste traçado ficariam fora do simulador para sempre, e a série histórica
-- está em kV, numa escala que os painéis agora leem como volts. Ocorrências,
-- ordens de serviço e comunicações ficam: são registro histórico, não estado.
--
-- Os códigos abaixo são os da Linha 2-Verde nesta versão, escritos à mão de
-- propósito: uma migração aplicada é um retrato de um momento e não pode mudar
-- de efeito quando `domain/line.ts` mudar.
DELETE FROM trains
WHERE current_station_code <> ALL (ARRAY[
  'VMD','SUM','CLI','CNS','TRI','BGD','PSO','ANR','CKB','SIM','AIP','SAC','TTI','VPT'
]::text[]);

DELETE FROM telemetry_samples
WHERE station_code <> ALL (ARRAY[
  'VMD','SUM','CLI','CNS','TRI','BGD','PSO','ANR','CKB','SIM','AIP','SAC','TTI','VPT'
]::text[]);

-- Procedimentos da Linha 6-Laranja substituídos pela biblioteca da Linha 2; o
-- seed insere os novos títulos.
DELETE FROM procedures
WHERE title = ANY (ARRAY[
  'Desenergização de trecho da catenária',
  'Subtensão ou sobretensão em subestação (TSS)',
  'Risco de alagamento no entorno do Rio Tietê',
  'Falha de comunicação com o sistema ATS'
]::text[]);

-- Subestação de tração (TSS, em CA) virou subestação retificadora (SR, em CC).
-- As ordens de serviço ficam; só o rótulo da categoria muda.
UPDATE work_orders SET category = 'SUBESTACAO_SR' WHERE category = 'TSS_SUBESTACAO';
