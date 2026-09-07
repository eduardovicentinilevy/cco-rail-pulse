// frontend/src/components/views/TimetableDispatchView.tsx
import React from 'react';

interface TrainDispatch {
  id: string;
  line: string;
  scheduledTime: string;
  actualTime: string;
  operator: string;
  status: 'EM_HORA' | 'ATRASADO' | 'ANTECIPADO';
  headwaySec: number;
}

const STATUS_STYLE: Record<TrainDispatch['status'], { bg: string; color: string }> = {
  EM_HORA: { bg: 'rgba(0, 255, 102, 0.12)', color: 'var(--uni-success)' },
  ATRASADO: { bg: 'rgba(255, 0, 0, 0.15)', color: 'var(--uni-danger)' },
  ANTECIPADO: { bg: 'rgba(255, 102, 0, 0.15)', color: 'var(--uni-warning)' },
};

const DISPATCHES: TrainDispatch[] = [
  { id: 'T-01', line: 'Linha 6-Laranja', scheduledTime: '06:00:00', actualTime: '06:00:12', operator: 'EDP-042', status: 'EM_HORA', headwaySec: 180 },
  { id: 'T-02', line: 'Linha 6-Laranja', scheduledTime: '06:03:00', actualTime: '06:03:45', operator: 'MAR-109', status: 'ATRASADO', headwaySec: 195 },
  { id: 'T-03', line: 'Linha 6-Laranja', scheduledTime: '06:06:00', actualTime: '06:06:02', operator: 'SOU-012', status: 'EM_HORA', headwaySec: 182 },
  { id: 'T-04', line: 'Linha 6-Laranja', scheduledTime: '06:09:00', actualTime: '06:08:50', operator: 'LIV-551', status: 'ANTECIPADO', headwaySec: 170 },
];

export const TimetableDispatchView: React.FC = () => {
  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <span style={styles.pageTag}>Operação</span>
          <h2 style={styles.title}>Controle de Escala e Partidas (Headway)</h2>
          <p style={styles.subtitle}>Gestão de intervalos e cumprimento de tabela horária na malha</p>
        </div>
        <button style={styles.actionBtn}>+ Inserir Trem Extra</button>
      </div>

      <div style={styles.tableCard}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.trHead}>
              <th style={styles.th}>ID do Trem</th>
              <th style={styles.th}>Eixo</th>
              <th style={styles.th}>Partida Tabela</th>
              <th style={styles.th}>Partida Real</th>
              <th style={styles.th}>Operador Responsável</th>
              <th style={styles.th}>Headway Alvo</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {DISPATCHES.map(item => {
              const statusStyle = STATUS_STYLE[item.status];
              return (
                <tr key={item.id} style={styles.trBody}>
                  <td style={{ ...styles.td, fontWeight: 'bold', color: 'var(--uni-text-main)' }}>{item.id}</td>
                  <td style={styles.td}>{item.line}</td>
                  <td style={styles.tdFontMono}>{item.scheduledTime}</td>
                  <td style={styles.tdFontMono}>{item.actualTime}</td>
                  <td style={styles.td}>{item.operator}</td>
                  <td style={styles.tdFontMono}>{item.headwaySec}s</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--uni-font)', animation: 'railpulse-fade-in 0.3s ease' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' },
  pageTag: { fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--uni-orange)', letterSpacing: '0.08em' },
  title: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--uni-text-main)', margin: '0.35rem 0 0.2rem' },
  subtitle: { fontSize: '0.75rem', color: 'var(--uni-text-muted)', margin: 0 },
  actionBtn: { backgroundColor: 'var(--uni-orange)', border: 'none', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' },
  tableCard: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { backgroundColor: 'var(--uni-bg-primary)', borderBottom: '1px solid var(--uni-border)' },
  th: { padding: '0.85rem 1rem', fontSize: '0.7rem', color: 'var(--uni-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  trBody: { borderBottom: '1px solid var(--uni-border)', transition: 'background-color 0.2s' },
  td: { padding: '0.85rem 1rem', fontSize: '0.75rem', color: 'var(--uni-text-main)' },
  tdFontMono: { padding: '0.85rem 1rem', fontSize: '0.75rem', color: 'var(--uni-orange)', fontFamily: 'monospace' },
  badge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }
};
