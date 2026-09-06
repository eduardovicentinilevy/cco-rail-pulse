// frontend/src/components/reports/AuditLogsView.tsx
import React from 'react';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  operatorId: string;
  action: string;
  target: string;
  status: 'SUCCESS' | 'WARNING' | 'CRITICAL';
}

export const AuditLogsView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const logs: AuditLogEntry[] = [
    { id: 'LOG-881', timestamp: '06:14:22', operatorId: 'EDP-042', action: 'EMERGENCY_BRAKE_TRIGGER', target: 'TRAIN-04 (Brasilândia)', status: 'CRITICAL' },
    { id: 'LOG-880', timestamp: '05:50:12', operatorId: 'MAR-109', action: 'SPEED_RESTRICTION_20', target: 'TRAIN-02 (Água Branca)', status: 'WARNING' },
    { id: 'LOG-879', timestamp: '05:30:00', operatorId: 'SYS-CORE', action: 'AUTOMATIC_HEADWAY_SYNC', target: 'Linha 6 - Tronco', status: 'SUCCESS' },
  ];

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
                  <td style={{ ...styles.td, fontFamily: 'monospace', color: 'var(--uni-orange)' }}>{log.id}</td>
                  <td style={styles.tdMono}>{log.timestamp}</td>
                  <td style={styles.td}>{log.operatorId}</td>
                  <td style={{ ...styles.td, fontWeight: 'bold' }}>{log.action}</td>
                  <td style={styles.td}>{log.target}</td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: log.status === 'SUCCESS' ? 'rgba(16, 185, 129, 0.15)' : log.status === 'WARNING' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: log.status === 'SUCCESS' ? 'var(--uni-success)' : log.status === 'WARNING' ? 'var(--uni-warning)' : 'var(--uni-danger)'
                    }}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  tableContainer: { overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--uni-border)' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { backgroundColor: 'var(--uni-bg-primary)', borderBottom: '1px solid var(--uni-border)' },
  th: { padding: '0.75rem 1rem', fontSize: '0.7rem', color: 'var(--uni-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  trBody: { borderBottom: '1px solid var(--uni-border)', backgroundColor: 'var(--uni-bg-secondary)' },
  td: { padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--uni-text-main)' },
  tdMono: { padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--uni-orange)', fontFamily: 'monospace' },
  badge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }
};