// frontend/src/components/reports/AuditLogsView.tsx
import React, { useEffect, useState } from 'react';
import type { AuditLogEntry } from '../../types';

interface AuditLogsViewProps {
  token: string;
  onClose: () => void;
}

type FetchState = 'loading' | 'ready' | 'error';

const badgeStyle = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized.includes('FAIL') || normalized.includes('UNAUTHORIZED') || normalized.includes('CRITICAL')) {
    return { backgroundColor: 'rgba(255, 0, 0, 0.15)', color: 'var(--uni-danger)' };
  }
  if (normalized.includes('SUCCESS') || normalized.includes('EXECUTED')) {
    return { backgroundColor: 'rgba(0, 255, 102, 0.12)', color: 'var(--uni-success)' };
  }
  return { backgroundColor: 'rgba(255, 102, 0, 0.15)', color: 'var(--uni-warning)' };
};

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ token, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [state, setState] = useState<FetchState>('loading');

  useEffect(() => {
    let cancelled = false;

    const fetchLogs = async () => {
      try {
        const response = await fetch('http://localhost:3333/api/audit-logs', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Falha ao buscar trilha de auditoria.');
        const data: AuditLogEntry[] = await response.json();
        if (!cancelled) {
          setLogs(data);
          setState('ready');
        }
      } catch (error) {
        console.error('[AUDIT] Erro:', error);
        if (!cancelled) setState('error');
      }
    };

    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>Trilha de Auditoria & Compliance SOC</h3>
            <p style={styles.modalSub}>Registro imutável de comandos críticos e eventos operacionais</p>
          </div>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {state === 'loading' && <p style={styles.emptyState}>Carregando trilha de auditoria…</p>}
        {state === 'error' && <p style={styles.emptyState}>Não foi possível carregar os registros de auditoria.</p>}
        {state === 'ready' && logs.length === 0 && (
          <p style={styles.emptyState}>Nenhum evento de auditoria registrado ainda.</p>
        )}

        {state === 'ready' && logs.length > 0 && (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Horário</th>
                  <th style={styles.th}>Operador</th>
                  <th style={styles.th}>Ação Executada</th>
                  <th style={styles.th}>Alvo</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={styles.trBody}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', color: 'var(--uni-orange)' }}>LOG-{log.id}</td>
                    <td style={styles.tdMono}>{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                    <td style={styles.td}>{log.operatorId}</td>
                    <td style={{ ...styles.td, fontWeight: 'bold' }}>{log.action}</td>
                    <td style={styles.td}>{log.target}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...badgeStyle(log.status) }}>{log.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontFamily: 'var(--uni-font)', backdropFilter: 'blur(4px)' },
  modal: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '16px', width: '90%', maxWidth: '900px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--uni-border)', paddingBottom: '0.75rem' },
  modalTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  modalSub: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', marginTop: '0.2rem' },
  closeButton: { background: 'none', border: 'none', color: 'var(--uni-text-muted)', fontSize: '1rem', cursor: 'pointer' },
  emptyState: { fontSize: '0.8rem', color: 'var(--uni-text-muted)', textAlign: 'center', padding: '2rem 0' },
  tableContainer: { overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--uni-border)', maxHeight: '55vh', overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { backgroundColor: 'var(--uni-bg-primary)', borderBottom: '1px solid var(--uni-border)' },
  th: { padding: '0.75rem 1rem', fontSize: '0.7rem', color: 'var(--uni-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  trBody: { borderBottom: '1px solid var(--uni-border)', backgroundColor: 'var(--uni-bg-secondary)' },
  td: { padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--uni-text-main)' },
  tdMono: { padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--uni-orange)', fontFamily: 'monospace' },
  badge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }
};
