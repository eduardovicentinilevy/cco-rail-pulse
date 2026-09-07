// frontend/src/components/views/AnalyticsReportsView.tsx
import React from 'react';

export const AnalyticsReportsView: React.FC = () => {
  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <span style={styles.pageTag}>Análises</span>
          <h2 style={styles.title}>Relatórios de Desempenho & KPIs</h2>
          <p style={styles.subtitle}>Índices de pontualidade, oferta de lugares e conformidade operacional</p>
        </div>
        <button style={styles.actionBtn}>Exportar Relatório PDF</button>
      </div>

      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Índice de Pontualidade (IP)</span>
          <span style={styles.metricValue}>99.4%</span>
          <span style={styles.metricSub}>Meta contratual: &gt; 98.5%</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Disponibilidade de Frota</span>
          <span style={styles.metricValue}>18 / 18</span>
          <span style={styles.metricSub}>Trens operacionais na via</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Demanda Acumulada Dia</span>
          <span style={styles.metricValue}>342.100</span>
          <span style={styles.metricSub}>Passageiros transportados</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Consumo Médio de Energia</span>
          <span style={styles.metricValue}>2.41 kWh</span>
          <span style={styles.metricSub}>Por trem-km percorrido</span>
        </div>
      </div>

      <div style={styles.chartSection}>
        <h3 style={styles.sectionTitle}>Análise de Interferências por Categoria (Últimos 30 dias)</h3>
        <div style={styles.chartPlaceholder}>
          <div style={styles.barGroup}>
            <div style={{ ...styles.bar, height: '40%' }} />
            <span style={styles.barLabel}>Porta de Plataforma</span>
          </div>
          <div style={styles.barGroup}>
            <div style={{ ...styles.bar, height: '15%' }} />
            <span style={styles.barLabel}>Sinalização CBTC</span>
          </div>
          <div style={styles.barGroup}>
            <div style={{ ...styles.bar, height: '75%', backgroundColor: 'var(--uni-orange)' }} />
            <span style={styles.barLabel}>Alimentação Aérea</span>
          </div>
          <div style={styles.barGroup}>
            <div style={{ ...styles.bar, height: '25%' }} />
            <span style={styles.barLabel}>Via Permanente</span>
          </div>
        </div>
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
  actionBtn: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', color: 'var(--uni-text-main)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' },
  metricCard: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  metricLabel: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', fontWeight: 600, textTransform: 'uppercase' },
  metricValue: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--uni-text-main)', fontFamily: 'monospace' },
  metricSub: { fontSize: '0.65rem', color: 'var(--uni-text-muted)' },
  chartSection: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  sectionTitle: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  chartPlaceholder: { display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '180px', paddingBottom: '1rem', borderBottom: '1px solid var(--uni-border)' },
  barGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '36px', backgroundColor: 'var(--uni-border)', borderRadius: '6px 6px 0 0', transition: 'height 0.4s' },
  barLabel: { fontSize: '0.65rem', color: 'var(--uni-text-muted)', textAlign: 'center' }
};
