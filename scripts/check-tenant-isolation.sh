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
SERVER_PGID=""

# `npx tsx` gera um filho node, e matar só o pai deixaria a porta ocupada para a
# próxima execução. Daí o grupo de processos próprio, derrubado por inteiro.
cleanup() {
  [ -n "$SERVER_PGID" ] && kill -- -"$SERVER_PGID" 2>/dev/null || true
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
# Um servidor que já esteja de pé nesta porta foi iniciado antes de o segundo
# cliente existir, e responderia a esta verificação com o estado de antes dela.
if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
  echo "FALHOU: já há um backend respondendo em $BASE_URL — encerre-o antes desta verificação." >&2
  exit 1
fi

# A saída vai para um arquivo: herdando o stdout, o servidor mantém o pipe aberto
# e trava quem estiver lendo a saída deste script.
setsid npx tsx backend/presentation/http/server.ts >"$SERVER_LOG" 2>&1 &
SERVER_PGID=$!
wait_for_health

TOKEN_UNI="$(token_for metro-sp)"
TOKEN_OUTRO="$(token_for metro-ci)"
[ -n "$TOKEN_UNI" ] || fail "login no cliente metro-sp não devolveu token"
[ -n "$TOKEN_OUTRO" ] || fail "login no cliente metro-ci não devolveu token"

get() { curl -sf "$BASE_URL$2" -H "Authorization: Bearer $1"; }

MALHA_UNI="$(get "$TOKEN_UNI" /api/network/stations)"
MALHA_OUTRO="$(get "$TOKEN_OUTRO" /api/network/stations)"

# Cada sessão nomeia a sua própria linha — o nome vem do banco, não de constante.
grep -q '"code":"L2"' <<<"$MALHA_UNI" || fail "a sessão de metro-sp não recebeu a linha L2"
grep -q '"code":"M1"' <<<"$MALHA_OUTRO" || fail "a sessão de metro-ci não recebeu a linha M1"

# E nenhuma estação da outra.
if grep -q '"code":"JAB"' <<<"$MALHA_UNI"; then fail "estação do metro-ci vazou para a sessão de metro-sp"; fi
if grep -q '"code":"VPT"' <<<"$MALHA_OUTRO"; then fail "estação de metro-sp vazou para a sessão de metro-ci"; fi

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
[ -n "$T01_UNI" ] || fail "a sessão de metro-sp não enxerga a composição T-01"
[ -n "$T01_OUTRO" ] || fail "a sessão de metro-ci não enxerga a composição T-01"

grep -qw "$T01_UNI" <<<"$(codigos_da_malha "$MALHA_UNI")" \
  || fail "a T-01 de metro-sp está em $T01_UNI, que não é estação da sua linha"
grep -qw "$T01_OUTRO" <<<"$(codigos_da_malha "$MALHA_OUTRO")" \
  || fail "a T-01 de metro-ci está em $T01_OUTRO, que não é estação da sua linha"
echo "  T-01 de metro-sp em $T01_UNI; T-01 de metro-ci em $T01_OUTRO — composições distintas."

# Abrir ocorrência numa estação de outra linha é erro de validação, não sucesso.
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/incidents" \
  -H "Authorization: Bearer $TOKEN_UNI" -H 'Content-Type: application/json' \
  -d '{"title":"Vazamento","description":"Estação de outro cliente.","stationCode":"JAB","category":"ENERGIA","severity":"BAIXA"}')"
[ "$STATUS" = "400" ] || fail "ocorrência em estação de outra linha devolveu HTTP $STATUS, esperado 400"

# A equipe de um cliente não lista o operador homônimo do outro.
EQUIPE_OUTRO="$(get "$TOKEN_OUTRO" /api/team)"
if grep -q 'Lívia Nakamura' <<<"$EQUIPE_OUTRO"; then fail "equipe de metro-sp vazou para a sessão de metro-ci"; fi

# --- Alarmes, comunicações e procedimentos ---------------------------------
# As três seções mais novas também pendem da linha. Abrir uma ocorrência gera
# um alarme persistido: ele tem de aparecer para quem abriu e para mais ninguém.
MARCA="ISOLAMENTO-$$"
curl -sf -o /dev/null -X POST "$BASE_URL/api/incidents" \
  -H "Authorization: Bearer $TOKEN_UNI" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$MARCA\",\"description\":\"Ocorrência de verificação do isolamento.\",\"category\":\"ENERGIA\",\"severity\":\"CRÍTICA\"}" \
  || fail "não foi possível abrir a ocorrência de verificação em metro-sp"

# A gravação do alarme é assíncrona em relação à resposta da ocorrência.
for _ in $(seq 1 10); do
  ALARMES_UNI="$(get "$TOKEN_UNI" '/api/alarms?limit=50')"
  grep -q "$MARCA" <<<"$ALARMES_UNI" && break
  sleep 1
done
grep -q "$MARCA" <<<"$ALARMES_UNI" || fail "o alarme da ocorrência não chegou à Central de Alarmes de metro-sp"

ALARMES_OUTRO="$(get "$TOKEN_OUTRO" '/api/alarms?limit=50')"
if grep -q "$MARCA" <<<"$ALARMES_OUTRO"; then fail "alarme de metro-sp vazou para a sessão de metro-ci"; fi

# Comunicação registrada num cliente não aparece no diário do outro.
curl -sf -o /dev/null -X POST "$BASE_URL/api/communications" \
  -H "Authorization: Bearer $TOKEN_UNI" -H 'Content-Type: application/json' \
  -d "{\"channel\":\"RADIO_TREM\",\"direction\":\"ENVIADA\",\"message\":\"$MARCA — contato de verificação.\"}" \
  || fail "não foi possível registrar a comunicação de verificação em metro-sp"

COMUNICACOES_OUTRO="$(get "$TOKEN_OUTRO" '/api/communications?limit=50')"
if grep -q "$MARCA" <<<"$COMUNICACOES_OUTRO"; then fail "comunicação de metro-sp vazou para a sessão de metro-ci"; fi

# Uma comunicação citando estação da outra linha é recusada pela malha da sessão.
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/communications" \
  -H "Authorization: Bearer $TOKEN_UNI" -H 'Content-Type: application/json' \
  -d '{"channel":"RADIO_TREM","direction":"ENVIADA","stationCode":"JAB","message":"Contato com estação de outro cliente."}')"
[ "$STATUS" = "400" ] || fail "comunicação em estação de outra linha devolveu HTTP $STATUS, esperado 400"

# O manual é da linha: metro-ci nasce com o seu próprio, vazio, e não herda o de metro-sp.
PROCEDIMENTOS_UNI="$(get "$TOKEN_UNI" /api/procedures)"
PROCEDIMENTOS_OUTRO="$(get "$TOKEN_OUTRO" /api/procedures)"
grep -q 'frenagem de emergência' <<<"$PROCEDIMENTOS_UNI" \
  || fail "a sessão de metro-sp não recebeu o manual semeado da sua linha"
if grep -q 'frenagem de emergência' <<<"$PROCEDIMENTOS_OUTRO"; then
  fail "o manual de metro-sp vazou para a sessão de metro-ci"
fi
echo "  Alarme, comunicação e manual ficaram na linha de origem."

# --- Ordens de serviço ------------------------------------------------------
# A OS é manutenção num ativo da linha e tem id sequencial compartilhado entre
# clientes, então o vizinho não pode nem listá-la nem abri-la pelo id.
OS_UNI="$(curl -sf -X POST "$BASE_URL/api/work-orders" \
  -H "Authorization: Bearer $TOKEN_UNI" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$MARCA — disjuntor da SR\",\"description\":\"Ordem de verificação do isolamento.\",\"category\":\"SUBESTACAO_SR\",\"priority\":\"ALTA\"}")" \
  || fail "não foi possível abrir a ordem de serviço de verificação em metro-sp"

OS_ID="$(sed -n 's/.*"id":"\{0,1\}\([0-9]\{1,\}\)"\{0,1\}.*/\1/p' <<<"$OS_UNI" | head -1)"
[ -n "$OS_ID" ] || fail "não foi possível ler o id da ordem de serviço criada"

ORDENS_OUTRO="$(get "$TOKEN_OUTRO" '/api/work-orders?limit=50')"
if grep -q "$MARCA" <<<"$ORDENS_OUTRO"; then fail "ordem de serviço de metro-sp vazou para a sessão de metro-ci"; fi

# Chutar o id não atravessa a fronteira: a linha entra no WHERE junto do id.
STATUS="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN_OUTRO" "$BASE_URL/api/work-orders/$OS_ID")"
[ "$STATUS" = "404" ] || fail "leitura da OS #$OS_ID pelo vizinho devolveu HTTP $STATUS, esperado 404"

# E nem pelo caminho de escrita.
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE_URL/api/work-orders/$OS_ID/status" \
  -H "Authorization: Bearer $TOKEN_OUTRO" -H 'Content-Type: application/json' \
  -d '{"status":"CANCELADA"}')"
[ "$STATUS" = "404" ] || fail "tratativa da OS #$OS_ID pelo vizinho devolveu HTTP $STATUS, esperado 404"

# O painel de OS do vizinho continua zerado.
ESTATISTICAS_OUTRO="$(get "$TOKEN_OUTRO" /api/work-orders/stats)"
grep -q '"open":0' <<<"$ESTATISTICAS_OUTRO" \
  || fail "as estatísticas de OS de metro-ci contaram ordem de outro cliente: $ESTATISTICAS_OUTRO"
echo "  Ordem de serviço #$OS_ID ficou invisível e intocável para o outro cliente."

# --- Energia de tração ------------------------------------------------------
# A subestação retificadora é dado da malha: os dois clientes têm uma 'SR-01', e
# ela é a mesma chave em tabela compartilhada. Desenergizar a de um não pode
# apagar a tensão da do outro.
SECOES_UNI="$(get "$TOKEN_UNI" /api/energy/sections)"
SECOES_OUTRO="$(get "$TOKEN_OUTRO" /api/energy/sections)"
grep -q '"substation":"SR-07"' <<<"$SECOES_UNI" || fail "a sessão de metro-sp não recebeu as seções da sua malha"
if grep -q '"substation":"SR-07"' <<<"$SECOES_OUTRO"; then
  fail "seção de energia de metro-sp vazou para a sessão de metro-ci"
fi

# Cada seção lista as estações que alimenta — as da própria linha.
if grep -q '"JAB"' <<<"$SECOES_UNI"; then fail "a SR-01 de metro-sp listou estação de metro-ci"; fi
grep -q '"JAB"' <<<"$SECOES_OUTRO" || fail "a SR-01 de metro-ci não listou as estações dela"

curl -sf -o /dev/null -X POST "$BASE_URL/api/energy/sections/SR-01" \
  -H "Authorization: Bearer $TOKEN_OUTRO" -H 'Content-Type: application/json' \
  -d '{"energized":false,"reason":"Verificação do isolamento entre clientes."}' \
  || fail "não foi possível desenergizar a SR-01 de metro-ci"

secao_sr01() {
  get "$1" /api/energy/sections \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d).sections.find(x=>x.substation==='SR-01');process.stdout.write(s?String(s.energized):'')})"
}
[ "$(secao_sr01 "$TOKEN_OUTRO")" = "false" ] || fail "a SR-01 de metro-ci não ficou desenergizada"
[ "$(secao_sr01 "$TOKEN_UNI")" = "true" ] \
  || fail "desenergizar a SR-01 de metro-ci apagou a tensão da SR-01 de metro-sp"

# E manobrar uma SR que não existe na malha da sessão é erro de validação.
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/energy/sections/SR-07" \
  -H "Authorization: Bearer $TOKEN_OUTRO" -H 'Content-Type: application/json' \
  -d '{"energized":false,"reason":"Seção de outro cliente."}')"
[ "$STATUS" = "400" ] || fail "manobra em SR de outra linha devolveu HTTP $STATUS, esperado 400"
echo "  SR-01 homônima manobrada num cliente, intacta no outro."

# Reenergiza para não deixar o banco de verificação com uma seção fora de serviço.
curl -sf -o /dev/null -X POST "$BASE_URL/api/energy/sections/SR-01" \
  -H "Authorization: Bearer $TOKEN_OUTRO" -H 'Content-Type: application/json' \
  -d '{"energized":true,"reason":"Fim da verificação."}' || true

# --- Chegadas ---------------------------------------------------------------
# O quadro de chegadas é da malha da sessão, e nomeia os sentidos pelos terminais
# dela — não por ponto cardeal nem pelos terminais da linha de demonstração.
CHEGADAS_OUTRO="$(get "$TOKEN_OUTRO" /api/network/arrivals)"
grep -q 'Jabaquara' <<<"$CHEGADAS_OUTRO" || fail "as chegadas de metro-ci não nomearam os terminais da linha dela"
if grep -q 'Vila Prudente' <<<"$CHEGADAS_OUTRO"; then
  fail "os terminais de metro-sp vazaram para o quadro de chegadas de metro-ci"
fi
echo "  Quadro de chegadas nomeou os terminais de cada linha."

echo "OK: os dois clientes coexistem sem enxergar a operação um do outro."
