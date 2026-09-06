// frontend/src/components/views/TimetableDispatchView.tsx
import React, { useState } from 'react';

interface TrainDispatch {
  id: string;
  line: string;
  scheduledTime: string;
  actualTime: string;
  operator: string;
  status: 'EM_HORA' | 'ATRASADO' | 'ANTECIPADO';
  headwaySec: number;
}

export const TimetableDispatchView: React.FC = () => {
  const [dispatches, setDispatches] = useState<TrainDispatch[]>([
    { id: 'T-01', line: 'Linha 6-Laranja', scheduledTime: '06:00:00', actualTime: '06:00:12', operator: 'EDP-042', status: 'EM_HORA', headwaySec: 180 },
    { id: 'T-02', line: 'Linha 6-Laranja', scheduledTime: '06:03:00', actualTime: '06:03:45', operator: 'MAR-109', status: 'ATRASADO', headwaySec: 195 },
    { id: 'T-03', line: 'Linha 6-Laranja', scheduledTime: '06:06:00', actualTime: '06:06:02', operator: 'SOU-012', status: 'EM_HORA', headwaySec: 182 },
    { id: 'T-04', line: 'Linha 6-Laranja', scheduledTime: '06:09:00', actualTime: '06:08:50', operator: 'LIV-551', status: 'ANTECIPADO', headwaySec: 170 },
  ]);

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
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
            {dispatches.map(item => (
              <tr key={item.id} style={styles.trBody}>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#ebcf98' }}>{item.id}</td>
                <td style={styles.td}>{item.line}</td>
                <td style={styles.tdFontMono}>{item.scheduledTime}</td>
                <td style={styles.tdFontMono}>{item.actualTime}</td>
                <td style={styles.td}>{item.operator}</td>
                <td style={styles.tdFontMono}>{item.headwaySec}s</td>
                <td style={styles.td}>
                  <span style={{
                    ...styles.badge,
                    backgroundColor: item.status === 'EM_HORA' ? 'rgba(52, 211, 153, 0.15)' : item.status === 'ATRASADO' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: item.status === 'EM_HORA' ? '#34d399' : item.status === 'ATRASADO' ? '#fca5a5' : '#fbbf24'
                  }}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: '"Montserrat", sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#ebcf98' },
  subtitle: { fontSize: '0.75rem', color: '#a89d93', marginTop: '0.2rem' },
  actionBtn: { backgroundColor: '#a0522d', border: 'none', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' },
  tableCard: { backgroundColor: '#110a06', border: '1px solid #331e13', borderRadius: '12px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { backgroundColor: '#1c100a', borderBottom: '1px solid #331e13' },
  th: { padding: '0.85rem 1rem', fontSize: '0.7rem', color: '#a89d93', textTransform: 'uppercase', letterSpacing: '0.05em' },
  trBody: { borderBottom: '1px solid #24140b', transition: 'background-color 0.2s' },
  td: { padding: '0.85rem 1rem', fontSize: '0.75rem', color: '#d8cbb8' },
  tdFontMono: { padding: '0.85rem 1rem', fontSize: '0.75rem', color: '#ebcf98', fontFamily: 'monospace' },
  badge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }
};