// frontend/src/services/websocket.service.ts
import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;
  private backendUrl = 'http://localhost:3333';

  public connect(): Socket {
    if (!this.socket) {
      this.socket = io(this.backendUrl, {
        // CORREÇÃO: O Polling deve vir primeiro para o handshake do Socket.io
        transports: ['polling', 'websocket'], 
        autoConnect: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect_error', (error) => {
        console.warn('[WS] Tentando reconectar ao gateway de telemetria...', error.message);
      });
    }

    if (!this.socket.connected) {
      this.socket.connect();
    }

    return this.socket;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public emitCommand(trainId: string, command: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('train:command', { trainId, command });
    } else {
      console.error('[WS-ERROR] Falha ao enviar comando: Socket desconectado.');
    }
  }
}

export const wsService = new WebSocketService();