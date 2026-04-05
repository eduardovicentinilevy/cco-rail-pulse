import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import http from 'http';

export const initializeWebSocket = async (server: http.Server) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    connectionStateRecovery: { maxDisconnectionDuration: 5000 } // Auto-reconnect vital
  });

  const redisUrl = `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;

  // Clientes para o Adapter do Socket.io (Escalonamento Horizontal SIL 4)
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  
  // Cliente EXCLUSIVO para ouvir o Simulador (A Ponte de Dados)
  const telemetrySubscriber = pubClient.duplicate();

  pubClient.on('error', (err) => console.error('[REDIS] Pub Error', err));
  subClient.on('error', (err) => console.error('[REDIS] Sub Error', err));
  telemetrySubscriber.on('error', (err) => console.error('[REDIS] Telemetry Error', err));

  await Promise.all([
    pubClient.connect(), 
    subClient.connect(),
    telemetrySubscriber.connect() // Conectando a ponte
  ]);
  
  io.adapter(createAdapter(pubClient, subClient));

  // ======================================================================
  // 🌉 A PONTE: Redis Pub/Sub (Simulador) -> Socket.io (Front-end)
  // ======================================================================
  // Aqui escutamos o canal 'telemetry' onde o simulador joga os dados crus
  await telemetrySubscriber.subscribe('telemetry', (message) => {
    try {
      const payload = JSON.parse(message);
      const fleetCode = payload.fleet_code || 'J'; // Identifica a frota
      
      // Repassa EXATAMENTE para a sala que o Front-end se inscreveu
      io.to(`fleet_${fleetCode}`).emit('TELEMETRY_UPDATE', payload);
    } catch (error) {
      console.error('[WS] Erro ao ler pacote da via:', error);
    }
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Operador conectado: ${socket.id}`);

    // Isolamento SIL 0: Apenas transmissão passiva e telemetria
    socket.on('telemetry:subscribe', (fleetId) => {
      console.log(`[WS] Operador ${socket.id} inscrito na vigilância da Frota ${fleetId}`);
      socket.join(`fleet_${fleetId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Operador desconectado: ${socket.id}`);
    });
  });

  return io;
};