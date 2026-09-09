// frontend/src/services/websocket.service.ts
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import type { CommandAck, StationTelemetry, SystemAlert, Train } from '../types';

/** Eventos emitidos pelo gateway do CCO em direção ao painel. */
export interface ServerEvents {
  'telemetry:batch': (batch: StationTelemetry[]) => void;
  'train:sync': (trains: Train[]) => void;
  'train:updated': (train: Train) => void;
  'alert:critical': (alert: SystemAlert) => void;
  'train:command:acknowledged': (ack: CommandAck) => void;
}

export interface ClientEvents {
  'train:command': (payload: { trainId: string; command: string; targetBlock?: string }) => void;
}

export type CcoSocket = Socket<ServerEvents, ClientEvents>;

/**
 * Conexão única com o gateway de telemetria.
 *
 * O token JWT vai no handshake: o backend autentica a conexão e deriva o operador
 * dali, em vez de confiar no `operatorId` enviado em cada comando.
 */
class WebSocketService {
  private socket: CcoSocket | null = null;
  private token: string | null = null;

  public connect(token: string): CcoSocket {
    // Troca de operador (ou token renovado) exige uma conexão nova.
    if (this.socket && this.token !== token) {
      this.disconnect();
    }

    if (!this.socket) {
      this.token = token;
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Number.POSITIVE_INFINITY,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });
    }

    if (!this.socket.connected) {
      this.socket.connect();
    }

    return this.socket;
  }

  public get current(): CcoSocket | null {
    return this.socket;
  }

  /** Força uma nova tentativa imediata — usado pelo botão "Reconectar". */
  public reconnect(): void {
    if (!this.socket) return;
    this.socket.disconnect();
    this.socket.connect();
  }

  public sendCommand(trainId: string, command: string, targetBlock?: string): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit('train:command', { trainId, command, targetBlock });
    return true;
  }

  public disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.token = null;
  }
}

export const wsService = new WebSocketService();
