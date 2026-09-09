// backend/infrastructure/security/AuditLogger.ts
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../shared/logger';

const logger = createLogger('SOC-AUDIT');

export interface AuditEvent {
  timestamp: string;
  operatorId: string;
  action: string;
  targetResource: string;
  ipAddress?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

/**
 * Trilha de auditoria em arquivo (append-only), complementar à tabela `audit_logs`.
 * Serve de evidência local caso o banco esteja indisponível durante um incidente.
 */
export class AuditLogger {
  private static readonly logFilePath = path.resolve(process.cwd(), 'logs', 'audit-security.log');
  private static directoryReady = false;

  private static ensureDirectory(): void {
    if (this.directoryReady) return;
    fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true });
    this.directoryReady = true;
  }

  public static record(event: Omit<AuditEvent, 'timestamp'>): void {
    const entry: AuditEvent = { timestamp: new Date().toISOString(), ...event };

    try {
      this.ensureDirectory();
      fs.appendFile(this.logFilePath, `${JSON.stringify(entry)}\n`, (error) => {
        if (error) logger.error('Falha ao gravar log de auditoria em disco.', error);
      });
    } catch (error) {
      logger.error('Falha ao preparar o diretório de logs de auditoria.', error);
    }

    if (entry.severity !== 'INFO') {
      logger.warn(`[${entry.severity}] ${entry.operatorId} → ${entry.action} em ${entry.targetResource}`);
    }
  }
}
