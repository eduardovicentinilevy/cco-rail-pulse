// frontend/src/components/views/AssetMaintenanceView.tsx
import React from 'react';

interface SubstationAsset {
  code: string;
  name: string;
  voltage: string;
  loadPercent: number;
  status: 'OPERACIONAL' | 'MANUTENÇÃO_PREVENTIVA' | 'ALERTA_TERMICO';
}

const STATUS_STYLE: Record<SubstationAsset['status'], { bg: string; color: string }> = {
  OPERACIONAL: { bg: 'rgba(0, 255, 102, 0.12)', color: 'var(--uni-success)' },
  ALERTA_TERMICO: { bg: 'rgba(255, 0, 0, 0.15)', color: 'var(--uni-danger)' },
  MANUTENÇÃO_PREVENTIVA: { bg: 'rgba(255, 102, 0, 0.15)', color: 'var(--uni-warning)' },
};

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
          <span style={styles.pageTag}>Ativos & Energia</span>
          <h2 style={styles.title}>Saúde de Ativos e Energia (TSS &amp; AMV)</h2>
          <p style={styles.subtitle}>Monitoramento de subestações de tração, rede aérea e desvios de via</p>
        </div>
      </div>

      <div style={styles.grid}>
        {assets.map(asset => {
          const statusStyle = STATUS_STYLE[asset.status];
          return (
            <div key={asset.code} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.assetCode}>{asset.code}</span>
                <span style={{ ...styles.badge, backgroundColor: statusStyle.bg, color: statusStyle.color }}>
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
                  backgroundColor: asset.loadPercent > 80 ? 'var(--uni-danger)' : 'var(--uni-orange)'
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--uni-font)', animation: 'railpulse-fade-in 0.3s ease' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pageTag: { fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--uni-orange)', letterSpacing: '0.08em' },
  title: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--uni-text-main)', margin: '0.35rem 0 0.2rem' },
  subtitle: { fontSize: '0.75rem', color: 'var(--uni-text-muted)', margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' },
  card: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  assetCode: { fontSize: '0.7rem', fontWeight: 'bold', backgroundColor: 'var(--uni-bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: 'var(--uni-orange)', fontFamily: 'monospace' },
  assetName: { fontSize: '0.9rem', fontWeight: 700, color: 'var(--uni-text-main)', height: '2.4em', margin: 0 },
  specRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--uni-text-muted)' },
  mono: { color: 'var(--uni-text-main)', fontFamily: 'monospace' },
  progressBarBg: { width: '100%', height: '6px', backgroundColor: 'var(--uni-bg-primary)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' },
  progressBarFill: { height: '100%', transition: 'width 0.4s ease' },
  badge: { fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' }
};
