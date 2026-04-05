import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

class WebSocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(WS_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000, // Backoff limit
        timeout: 20000,
      });

      this.socket.on('connect', () => console.info('[WS] Conexão vitalícia com CCO-RailPulse estabelecida.'));
      this.socket.on('disconnect', (reason) => console.warn(`[WS] Alerta de desconexão: ${reason}. Tentando reconectar...`));
    }
    return this.socket;
  }

  getSocket(): Socket {
    if (!this.socket) return this.connect();
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const wsService = new WebSocketService();