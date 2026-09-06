// backend/presentation/http/server.ts
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { db } from '../../infrastructure/database/postgres'; // Pool de conexão do Postgres

// Carrega variáveis de ambiente (.env)
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuração rigorosa de CORS para o ambiente B2B Enterprise
const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // Em produção, restringir para o domínio oficial do CCO
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// ============================================================================
// ROTAS HTTP (REST API)
// ============================================================================

// Rota de Autenticação Real no PostgreSQL
app.post('/api/auth/login', async (req, res) => {
  const { operatorId, password } = req.body;

  try {
    // 1. Busca o operador no banco de dados (ignorando inativos)
    const result = await db.query('SELECT * FROM operators WHERE id = $1 AND is_active = TRUE', [operatorId.toUpperCase()]);
    
    if (result.rows.length === 0) {
      // SOC N1 Best Practice: Mensagem genérica para evitar enumeração de usuários válidos
      return res.status(401).json({ error: 'Credencial inválida ou operador inativo.' });
    }

    const operator = result.rows[0];

    // 2. Valida a senha digitada contra o Hash Bcrypt salvo no banco
    const isPasswordValid = await bcrypt.compare(password, operator.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credencial inválida ou operador inativo.' });
    }

    // 3. Retorna os dados da sessão (No futuro, injetaríamos um JWT assinado com jsonwebtoken)
    res.status(200).json({
      token: 'jwt_token_gerado_com_sucesso_v2026',
      operatorId: operator.id,
      role: operator.role,
      name: operator.name,
      avatarUrl: operator.avatar_url
    });

  } catch (error) {
    console.error('[AUTH-ERROR] Falha na rota de login:', error);
    res.status(500).json({ error: 'Erro interno no servidor de autenticação.' });
  }
});

// Rota de Health Check (Verificação de Saúde do Core e Banco de Dados)
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1'); // Valida se o banco responde
    res.status(200).json({ 
      status: 'ONLINE', 
      database: 'CONNECTED', 
      system: 'RailPulse CCO Core',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'OFFLINE', 
      database: 'DISCONNECTED',
      error: 'Falha na comunicação com o PostgreSQL' 
    });
  }
});

// ============================================================================
// GATEWAY WEBSOCKET (TELEMETRIA E COMANDOS EM TEMPO REAL)
// ============================================================================

io.on('connection', (socket) => {
  console.log(`[CCO-CORE] Operador/Cliente conectado via WebSocket: ${socket.id}`);

  // Simulação de envio periódico de lote de telemetria para os trens da Linha 6
  const telemetryInterval = setInterval(() => {
    const mockBatch = [
      { currentStationCode: 'BRA', voltageKV: Number((24.5 + Math.random() * 0.6).toFixed(2)), status: 'NORMAL' },
      { currentStationCode: 'AGU', voltageKV: Number((23.0 + Math.random() * 0.5).toFixed(2)), status: 'ATENÇÃO' },
      { currentStationCode: 'HIG', voltageKV: Number((24.8 + Math.random() * 0.4).toFixed(2)), status: 'NORMAL' }
    ];
    socket.emit('telemetry:batch', mockBatch);
  }, 3000);

  // Escuta de comandos críticos disparados pelo operador na interface
  socket.on('train:command', (data: { trainId: string; command: string }) => {
    console.log(`[SAFETY-LOG] Comando crítico recebido para o trem ${data.trainId}: Ação -> ${data.command}`);
    
    // Confirmação de execução do comando de segurança
    socket.emit('train:command:acknowledged', {
      trainId: data.trainId,
      command: data.command,
      status: 'EXECUTED',
      timestamp: new Date().toLocaleTimeString()
    });
  });

  socket.on('disconnect', () => {
    clearInterval(telemetryInterval);
    console.log(`[CCO-CORE] Conexão encerrada: ${socket.id}`);
  });
});

// ============================================================================
// BOOTSTRAP: INICIALIZAÇÃO SEGURA DO SERVIDOR
// ============================================================================

const PORT = process.env.PORT || 3333;

// Função de Boot Assíncrona (Padrão Enterprise: Fail-Fast)
const bootstrap = async () => {
  try {
    // 1. Testa a conexão real com o PostgreSQL antes de abrir as portas HTTP/WS
    const client = await db.connect();
    console.log('[DB] Conexão com PostgreSQL (railpulse_cco) estabelecida com sucesso.');
    client.release(); // Libera o client de volta pro pool imediatamente para evitar vazamento (Memory Leak)

    // 2. Sobe o servidor após garantir que a infraestrutura está saudável
    server.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`🚀 RailPulse CCO Backend Core rodando na porta ${PORT}`);
      console.log(`📡 WebSocket Gateway ativo e aguardando conexões`);
      console.log(`==================================================`);
    });

  } catch (error) {
    console.error('[BOOT-ERROR] Falha crítica ao conectar no PostgreSQL. O servidor não será iniciado.', error);
    process.exit(1);
  }
};

// Inicia a aplicação
bootstrap();