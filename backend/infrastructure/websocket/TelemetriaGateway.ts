// src/infrastructure/websocket/TelemetriaGateway.ts
import { Server, Socket } from 'socket.io';
import { TrainSession } from '../../domain/entities/TrainSession';

export class TelemetriaGateway {
  private io: Server;
  private activeTrains: Map<string, TrainSession> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.initializeMockData();
    this.setupListeners();
    this.startTelemetryBroadcastLoop();
  }

  private initializeMockData() {
    this.activeTrains.set('T-01', new TrainSession('T-01', 'BRA', 45, 24.8, 'NORMAL', new Date()));
    this.activeTrains.set('T-02', new TrainSession('T-02', 'MAR', 50, 25.0, 'NORMAL', new Date()));
    this.activeTrains.set('T-03', new TrainSession('T-03', 'IVP', 0, 24.9, 'ATENÇÃO', new Date()));
  }

  private setupListeners() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[CCO-WS] Operador conectado com ID: ${socket.id}`);

      // Envia o estado atual imediatamente ao conectar
      socket.emit('telemetry:sync', Array.from(this.activeTrains.values()));

      // Ouve comandos críticos de parada ou restrição de velocidade enviados pelo painel do operador
      socket.on('train:command', (data: { trainId: string; command: 'HALT' | 'RESTRICT' }) => {
        console.log(`[CCO-SECURITY] Comando crítico recebido para ${data.trainId}: ${data.command}`);
        
        const train = this.activeTrains.get(data.trainId);
        if (train) {
          train.status = data.command === 'HALT' ? 'EMERGÊNCIA' : 'ATENÇÃO';
          train.speedKmH = data.command === 'HALT' ? 0 : 30;
          
          // Broadcast para todos os operadores conectados na sala do CCO
          this.io.emit('telemetry:update', train);
        }
      });

      socket.on('disconnect', () => {
        console.log(`[CCO-WS] Operador desconectado: ${socket.id}`);
      });
    });
  }

  private startTelemetryBroadcastLoop() {
    // Simula variação de telemetria em tempo real a cada 3 segundos
    setInterval(() => {
      this.activeTrains.forEach((train) => {
        const deltaSpeed = Math.floor(Math.random() * 5) - 2;
        const newSpeed = Math.max(0, Math.min(80, train.speedKmH + deltaSpeed));
        const newVoltage = Number((24.5 + Math.random() * 1.0).toFixed(1));

        train.updateTelemetry(newSpeed, newVoltage, train.status);
      });

      // Emite o lote atualizado para todos os clientes conectados
      this.io.emit('telemetry:batch', Array.from(this.activeTrains.values()));
    }, 3000);
  }
}