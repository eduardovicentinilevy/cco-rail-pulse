// src/infrastructure/security/AuditLogger.ts
import fs from 'fs';
import path from 'path';

export interface AuditEvent {
  timestamp: string;
  operatorId: string;
  action: string;
  targetResource: string;
  ipAddress?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export class AuditLogger {
  private static logFilePath = path.resolve(process.cwd(), 'logs', 'audit-security.log');

  public static record(eventOmitTimestamp: Omit<AuditEvent, 'timestamp'>): void {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      ...eventOmitTimestamp,
    };

    const logEntry = JSON.stringify(event) + '\n';

    // Garante que o diretório de logs exista
    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFile(this.logFilePath, logEntry, (err) => {
      if (err) {
        console.error('[CRITICAL-SECURITY] Falha ao gravar log de auditoria:', err);
      }
    });

    // Em ambiente SOC, eventos críticos também geram alertas imediatos no console
    if (event.severity === 'CRITICAL' || event.severity === 'WARNING') {
      console.warn(`[SOC-ALERT] [${event.severity}] Operador: ${event.operatorId} | Ação: ${event.action} em ${event.targetResource}`);
    }
  }
}