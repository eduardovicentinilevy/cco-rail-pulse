// frontend/src/components/views/AssetMaintenanceView.tsx
import React from 'react';

interface SubstationAsset {
  code: string;
  name: string;
  voltage: string;
  loadPercent: number;
  status: 'OPERACIONAL' | 'MANUTENÇÃO_PREVENTIVA' | 'ALERTA_TERMICO';
}

export const AssetMaintenanceView: React.FC = () => {
  const assets: SubstationAsset[] = [
    { code: 'TSS-01', name: 'Subestação Retificadora Brasilândia', voltage: '88 kV / 750V', loadPercent: 64, status: 'OPERACIONAL' },
    { code: 'TSS-02', name: 'Subestação Itaberaba / João Paulo', voltage: '88 kV / 750V', loadPercent: 89, status: 'ALERTA_TERMICO' },
    { code: 'TSS-03', name: 'Subestação Freguesia do Ó', voltage: '88 kV / 750V', loadPercent: 42, status: 'OPERACIONAL' },
    { code: 'TSS-04', name: 'Subestação João Dias / Pompéia', voltage: '88 kV / 750V', loadPercent: 78, status: 'MANUTENÇÃO_PREVENTIVA' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2 style={styles.title}>Saúde de Ativos e Energia (TSS & AMV)</h2>
          <p style={styles.subtitle}>Monitoramento de subestações de tração, rede aérea e desvios de via</p>
        </div>
      </div>

      <div style={styles.grid}>
        {assets.map(asset => (
          <div key={asset.code} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.assetCode}>{asset.code}</span>
              <span style={{
                ...styles.badge,
                backgroundColor: asset.status === 'OPERACIONAL' ? 'rgba(52, 211, 153, 0.15)' : asset.status === 'ALERTA_TERMICO' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: asset.status === 'OPERACIONAL' ? '#34d399' : asset.status === 'ALERTA_TERMICO' ? '#fca5a5' : '#fbbf24'
              }}>
                {asset.status}
              </span>
            </div>
            <h3 style={styles.assetName}>{asset.name}</h3>
            <div style={styles.specRow}>
              <span>Classe de Tensão:</span>
              <strong style={styles.mono}>{asset.voltage}</strong>
            </div>
            <div style={styles.specRow}>
              <span>Carga Atual do Trafo:</span>
              <strong style={styles.mono}>{asset.loadPercent}%</strong>
            </div>
            <div style={styles.progressBarBg}>
              <div style={{
                ...styles.progressBarFill,
                width: `${asset.loadPercent}%`,
                backgroundColor: asset.loadPercent > 80 ? '#ef4444' : '#a0522d'
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: '"Montserrat", sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#ebcf98' },
  subtitle: { fontSize: '0.75rem', color: '#a89d93', marginTop: '0.2rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' },
  card: { backgroundColor: '#110a06', border: '1px solid #331e13', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  assetCode: { fontSize: '0.7rem', fontWeight: 'bold', backgroundColor: '#1c100a', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#ebcf98', fontFamily: 'monospace' },
  assetName: { fontSize: '0.9rem', fontWeight: 700, color: '#fdf8f0', height: '2.4em' },
  specRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a89d93' },
  mono: { color: '#ebcf98', fontFamily: 'monospace' },
  progressBarBg: { width: '100%', height: '6px', backgroundColor: '#1c100a', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' },
  progressBarFill: { height: '100%', transition: 'width 0.4s ease' },
  badge: { fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' }
};