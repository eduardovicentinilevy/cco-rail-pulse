-- Segundo cliente para a verificação de isolamento (scripts/check-tenant-isolation.sh).
-- A credencial 'EDP-042' e a composição 'T-01' repetem as do cliente semeado de
-- propósito: são únicas por cliente e por linha, não globalmente.
-- Recebe o hash da senha em :hash, para autenticar com a mesma senha do seed.

WITH novo_cliente AS (
  INSERT INTO tenants (slug, name) VALUES ('metro-ci', 'Metrô CI')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), nova_linha AS (
  INSERT INTO lines (tenant_id, code, name)
  SELECT id, 'M1', 'Linha 1-Azul' FROM novo_cliente
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO stations (line_id, code, name, position, substation, nominal_voltage_kv, headway_seconds, map_x, map_y)
SELECT nova_linha.id, v.code, v.nome, v.pos, 'TSS-A1', 24.5, 180, v.mx, 0.5
FROM nova_linha, (VALUES ('JAB', 'Jabaquara', 1, 0.15), ('TUC', 'Tucuruvi', 2, 0.85)) AS v(code, nome, pos, mx)
ON CONFLICT (line_id, code) DO NOTHING;

INSERT INTO operators (tenant_id, login_id, name, role, password_hash)
SELECT id, 'EDP-042', 'Homônimo do Metrô', 'OPERADOR', :'hash'
FROM tenants WHERE slug = 'metro-ci'
ON CONFLICT (tenant_id, login_id) DO NOTHING;

INSERT INTO trains (line_id, train_id, current_station_code, speed_kmh, voltage_kv, status)
SELECT l.id, 'T-01', 'JAB', 60, 24.5, 'NORMAL'
FROM lines l JOIN tenants t ON t.id = l.tenant_id
WHERE t.slug = 'metro-ci'
ON CONFLICT (line_id, train_id) DO NOTHING;
