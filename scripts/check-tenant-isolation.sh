#!/usr/bin/env bash
#
# Verifica que dois clientes coexistem na mesma instalação sem se enxergarem.
#
# Cria um segundo cliente com a credencial de operador e a numeração de
# composição repetidas de propósito — é exatamente a colisão que obrigava a um
# fork por cliente antes do multi-tenant — e confere, pela API, que cada sessão
# só alcança a própria linha.
#
# Espera um backend já migrado contra o banco apontado pelas variáveis de
# ambiente. Sobe e derruba o servidor por conta própria.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3333}"
PSQL=(psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-railpulse_cco}")
SERVER_LOG="${SERVER_LOG:-$(mktemp -t railpulse-isolation-XXXXXX.log)}"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo "FALHOU: $*" >&2
  echo "--- últimas linhas do backend ($SERVER_LOG) ---" >&2
  tail -20 "$SERVER_LOG" >&2 || true
  exit 1
}

wait_for_health() {
  for _ in $(seq 1 30); do
    if curl -sf "$BASE_URL/health" | grep -q '"status":"ONLINE"'; then
      return 0
    fi
    sleep 1
  done
  fail "o backend não respondeu ONLINE em $BASE_URL"
}

# Token de sessão de um cliente, pelo slug.
token_for() {
  curl -sf -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"operatorId\":\"EDP-042\",\"password\":\"${SEED_OPERATOR_PASSWORD:-123456}\",\"tenantSlug\":\"$1\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).token??''))"
}

# --- Segundo cliente -------------------------------------------------------
# Reaproveita o hash do operador semeado para poder autenticar nos dois clientes
# com a mesma senha, sem precisar de bcrypt aqui.
HASH="$("${PSQL[@]}" -t -A -c "SELECT password_hash FROM operators WHERE login_id = 'EDP-042' LIMIT 1")"
[ -n "$HASH" ] || fail "operador semeado EDP-042 não encontrado — o banco foi migrado?"

"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -v hash="$HASH" -f "$(dirname "$0")/fixtures/second-tenant.sql"

# --- Sobe o backend --------------------------------------------------------
# A saída vai para um arquivo: herdando o stdout, o servidor mantém o pipe aberto
# e trava quem estiver lendo a saída deste script.
npx tsx backend/presentation/http/server.ts >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
wait_for_health

TOKEN_UNI="$(token_for linha-uni)"
TOKEN_OUTRO="$(token_for metro-ci)"
[ -n "$TOKEN_UNI" ] || fail "login no cliente linha-uni não devolveu token"
[ -n "$TOKEN_OUTRO" ] || fail "login no cliente metro-ci não devolveu token"

get() { curl -sf "$BASE_URL$2" -H "Authorization: Bearer $1"; }

MALHA_UNI="$(get "$TOKEN_UNI" /api/network/stations)"
MALHA_OUTRO="$(get "$TOKEN_OUTRO" /api/network/stations)"

# Cada sessão nomeia a sua própria linha — o nome vem do banco, não de constante.
grep -q '"code":"L6"' <<<"$MALHA_UNI" || fail "a sessão de linha-uni não recebeu a linha L6"
grep -q '"code":"M1"' <<<"$MALHA_OUTRO" || fail "a sessão de metro-ci não recebeu a linha M1"

# E nenhuma estação da outra.
if grep -q '"code":"JAB"' <<<"$MALHA_UNI"; then fail "estação do metro-ci vazou para a sessão de linha-uni"; fi
if grep -q '"code":"SJQ"' <<<"$MALHA_OUTRO"; then fail "estação de linha-uni vazou para a sessão de metro-ci"; fi

# Mesma numeração de composição (T-01), composições diferentes: cada uma circula
# por estações da sua própria linha. Comparar contra a malha, e não contra uma
# estação fixa, é o que torna a verificação estável — o simulador move os trens.
estacao_da_t01() {
  get "$1" /api/network/trains \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const t=JSON.parse(d).find(x=>x.trainId==='T-01');process.stdout.write(t?t.currentStationCode:'')})"
}
codigos_da_malha() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).stations.map(s=>s.code).join(' ')))" <<<"$1"
}

T01_UNI="$(estacao_da_t01 "$TOKEN_UNI")"
T01_OUTRO="$(estacao_da_t01 "$TOKEN_OUTRO")"
[ -n "$T01_UNI" ] || fail "a sessão de linha-uni não enxerga a composição T-01"
[ -n "$T01_OUTRO" ] || fail "a sessão de metro-ci não enxerga a composição T-01"

grep -qw "$T01_UNI" <<<"$(codigos_da_malha "$MALHA_UNI")" \
  || fail "a T-01 de linha-uni está em $T01_UNI, que não é estação da sua linha"
grep -qw "$T01_OUTRO" <<<"$(codigos_da_malha "$MALHA_OUTRO")" \
  || fail "a T-01 de metro-ci está em $T01_OUTRO, que não é estação da sua linha"
echo "  T-01 de linha-uni em $T01_UNI; T-01 de metro-ci em $T01_OUTRO — composições distintas."

# Abrir ocorrência numa estação de outra linha é erro de validação, não sucesso.
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/incidents" \
  -H "Authorization: Bearer $TOKEN_UNI" -H 'Content-Type: application/json' \
  -d '{"title":"Vazamento","description":"Estação de outro cliente.","stationCode":"JAB","category":"ENERGIA","severity":"BAIXA"}')"
[ "$STATUS" = "400" ] || fail "ocorrência em estação de outra linha devolveu HTTP $STATUS, esperado 400"

# A equipe de um cliente não lista o operador homônimo do outro.
EQUIPE_OUTRO="$(get "$TOKEN_OUTRO" /api/team)"
if grep -q 'Lívia Nakamura' <<<"$EQUIPE_OUTRO"; then fail "equipe de linha-uni vazou para a sessão de metro-ci"; fi

echo "OK: os dois clientes coexistem sem enxergar a operação um do outro."
