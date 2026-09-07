import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { db } from '../../infrastructure/database/postgres';
import { PgOperatorRepository } from '../../infrastructure/repositories/pg-operator.repository';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { ExecuteTrainCommandUseCase } from '../../application/use-cases/ExecuteTrainCommandUseCase';
import { verifyJwt, AuthenticatedRequest } from './middlewares/auth.middleware';
import { domainEventBus } from '../../application/events/event-bus';

dotenv.config();

const app = express();
const server = http.createServer(app);
const operatorRepo = new PgOperatorRepository();
const executeTrainCommandUseCase = new ExecuteTrainCommandUseCase();

// Malha da Linha 6-Laranja (Linha Uni) — códigos oficiais das 15 estações
const LINE_STATION_CODES = [
  'BRA', 'MAR', 'ITA', 'JPI', 'FGO', 'SMA', 'AGB', 'POM',
  'PDZ', 'PUC', 'FAA', 'HGM', '14B', 'BLV', 'SJQ',
];

const JWT_SECRET = process.env.JWT_SECRET || 'railpulse_cco_super_secure_secret_key_2026';

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// ==========================================
// ROTAS HTTP (REST API)
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  const { operatorId, password } = req.body;

  if (!operatorId || !password) {
    return res.status(400).json({ error: 'Credencial e senha são obrigatórias.' });
  }

  try {
    const operator = await operatorRepo.findById(operatorId);
    
    if (!operator) {
      await bcrypt.compare(password, '$2b$10$InvalidHashMockToPreventTimingAttackDummyString');
      return res.status(401).json({ error: 'Credencial inválida ou operador inativo.' });
    }

    const isPasswordValid = await bcrypt.compare(password, operator.password_hash);
    
    if (!isPasswordValid) {
      await operatorRepo.logAudit(operator.id, 'LOGIN_FAILED', 'AUTH_SYSTEM', 'UNAUTHORIZED');
      return res.status(401).json({ error: 'Credencial inválida ou operador inativo.' });
    }

    const token = jwt.sign(
      { operatorId: operator.id, role: operator.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await operatorRepo.logAudit(operator.id, 'LOGIN_SUCCESS', 'AUTH_SYSTEM', 'SUCCESS');

    return res.status(200).json({
      token,
      operatorId: operator.id,
      role: operator.role,
      name: operator.name,
      avatarUrl: operator.avatar_url
    });

  } catch (error) {
    console.error('[AUTH-FATAL] Erro na rota de login:', error);
    return res.status(500).json({ error: 'Erro interno no servidor de autenticação.' });
  }
});

app.get('/api/operator/profile', verifyJwt, async (req: AuthenticatedRequest, res) => {
  try {
    const operatorId = req.operator?.operatorId;
    const operator = await operatorRepo.findById(operatorId!);
    if (!operator) return res.status(404).json({ error: 'Operador não encontrado.' });

    return res.status(200).json({
      operatorId: operator.id,
      name: operator.name,
      role: operator.role,
      avatarUrl: operator.avatar_url
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

app.get('/api/audit-logs', verifyJwt, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.query(
      `SELECT id, operator_id, action, target, status, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 50`
    );

    return res.status(200).json(
      result.rows.map((row: any) => ({
        id: String(row.id),
        timestamp: row.created_at,
        operatorId: row.operator_id,
        action: row.action,
        target: row.target,
        status: row.status,
      }))
    );
  } catch (error) {
    console.error('[AUDIT-FATAL] Erro ao buscar trilha de auditoria:', error);
    return res.status(500).json({ error: 'Erro ao buscar trilha de auditoria.' });
  }
});

app.get('/health', async (req, res) => {
  try {
    const dbCheck = await db.query('SELECT NOW()');
    return res.status(200).json({ 
      status: 'ONLINE', 
      database: 'CONNECTED', 
      serverTime: dbCheck.rows[0].now,
      architecture: 'Event-Driven (EDA)',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    return res.status(500).json({ status: 'OFFLINE', database: 'DISCONNECTED' });
  }
});

// ==========================================
// GATEWAY DE EVENTOS E WEBSOCKET
// ==========================================

io.on('connection', (socket) => {
  console.log(`[CCO-GATEWAY] Painel de operação conectado: ${socket.id}`);

  // Listeners assíncronos do Event Bus
  const onTelemetryBatch = (batch: any) => socket.emit('telemetry:batch', batch);
  const onCriticalAlert = (alert: any) => socket.emit('alert:critical', alert);

  // Inscreve este socket nos eventos globais do CCO
  domainEventBus.on('telemetry:updated', onTelemetryBatch);
  domainEventBus.on('system:alert', onCriticalAlert);

  socket.on('train:command', async (data: { operatorId: string; trainId: string; command: string; targetBlock?: string }) => {
    try {
      const operatorId = data.operatorId || 'SYSTEM';
      const targetBlock = data.targetBlock || data.trainId;

      const mappedCommand =
        data.command === 'EMERGENCY_BRAKE_OVERRIDE' ? 'HALT' :
        data.command === 'SPEED_RESTRICTION_20KM' ? 'RESTRICT_SPEED' :
        'RELEASE';

      // Aplica a regra de domínio (validação, cálculo de status/velocidade) e persiste o novo estado do trem
      const updatedTrain = executeTrainCommandUseCase.execute({
        operatorId,
        trainId: data.trainId,
        command: mappedCommand,
        targetBlock,
      });
      await TrainRepository.save(updatedTrain);

      await operatorRepo.logAudit(operatorId, `EXEC_${data.command}`, `TRAIN_${data.trainId}`, 'EXECUTED');

      domainEventBus.emit('system:alert', {
        severity: mappedCommand === 'HALT' ? 'CRITICAL' : 'INFO',
        message: `Comando ${data.command} executado no ${data.trainId} pelo operador ${operatorId}`,
        timestamp: new Date().toISOString()
      });

      io.emit('train:updated', {
        trainId: updatedTrain.trainId,
        currentStationCode: updatedTrain.currentStationCode,
        speedKmH: updatedTrain.speedKmH,
        voltageKV: updatedTrain.voltageKV,
        status: updatedTrain.status,
      });

      socket.emit('train:command:acknowledged', { trainId: data.trainId, command: data.command, status: 'EXECUTED' });
    } catch (err) {
      console.error('[WS-ERROR]', err);
      socket.emit('train:command:acknowledged', { trainId: data.trainId, command: data.command, status: 'FAILED' });
    }
  });

  socket.on('disconnect', () => {
    // Clean-up vital para evitar vazamento de memória (Memory Leak)
    domainEventBus.off('telemetry:updated', onTelemetryBatch);
    domainEventBus.off('system:alert', onCriticalAlert);
    console.log(`[CCO-GATEWAY] Painel desconectado: ${socket.id}`);
  });
});

// SIMULADOR DE HARDWARE: Dispara telemetria de tensão para toda a malha a cada 3 segundos
const STATION_BASE_VOLTAGE: Record<string, number> = { ITA: 22.0, FGO: 23.2 };

setInterval(() => {
  const batch = LINE_STATION_CODES.map((code) => {
    const base = STATION_BASE_VOLTAGE[code] ?? 24.5;
    const voltageKV = Number((base + Math.random() * 0.6).toFixed(2));
    const status = voltageKV < 22.5 ? 'CRÍTICO' : voltageKV < 23.8 ? 'ATENÇÃO' : 'NORMAL';
    return { currentStationCode: code, voltageKV, status };
  });

  domainEventBus.emit('telemetry:updated', batch);
}, 3000);

// ==========================================
// INICIALIZAÇÃO E AUTO-MIGRAÇÃO (BOOTSTRAP)
// ==========================================

const PORT = process.env.PORT || 3333;

const bootstrap = async () => {
  try {
    const client = await db.connect();
    console.log('[DB-POOL] Conexão com PostgreSQL estabelecida com sucesso.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS operators (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        operator_id VARCHAR(50),
        action VARCHAR(100) NOT NULL,
        target VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS trains (
        train_id VARCHAR(20) PRIMARY KEY,
        current_station_code VARCHAR(10) NOT NULL,
        speed_kmh NUMERIC(5, 1) NOT NULL,
        voltage_kv NUMERIC(5, 2) NOT NULL,
        status VARCHAR(20) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const defaultPasswordHash = await bcrypt.hash('123456', 10);
    await client.query(`
      INSERT INTO operators (id, name, role, password_hash, avatar_url, is_active)
      VALUES ('EDP-042', 'Eduardo Vicentini Levy', 'OPERATOR_SOC', $1, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', TRUE)
      ON CONFLICT (id) DO UPDATE
      SET password_hash = $1;
    `, [defaultPasswordHash]);

    const seedTrains: Array<[string, string, number, number, string]> = [
      ['T-01', 'BRA', 45, 24.6, 'NORMAL'],
      ['T-04', 'FGO', 30, 23.2, 'ATENÇÃO'],
      ['T-07', 'PDZ', 50, 24.5, 'NORMAL'],
      ['T-12', '14B', 48, 24.6, 'NORMAL'],
    ];
    for (const [trainId, stationCode, speed, voltage, status] of seedTrains) {
      await client.query(
        `INSERT INTO trains (train_id, current_station_code, speed_kmh, voltage_kv, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (train_id) DO NOTHING`,
        [trainId, stationCode, speed, voltage, status]
      );
    }

    client.release();

    server.listen(PORT, () => {
      console.log(`========================================================`);
      console.log(`🚀 RailPulse CCO Backend Event-Driven ativo na porta ${PORT}`);
      console.log(`========================================================`);
    });
  } catch (error) {
    console.error('[BOOT-FATAL] Falha crítica de inicialização. Servidor abortado.', error);
    process.exit(1);
  }
};

bootstrap();