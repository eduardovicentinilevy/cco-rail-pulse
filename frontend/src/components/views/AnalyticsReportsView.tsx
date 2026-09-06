// frontend/src/components/views/AnalyticsReportsView.tsx
import React from 'react';

export const AnalyticsReportsView: React.FC = () => {
  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
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
            <div style={{ ...styles.bar, height: '75%', backgroundColor: '#a0522d' }} />
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
  container: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: '"Montserrat", sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#ebcf98' },
  subtitle: { fontSize: '0.75rem', color: '#a89d93', marginTop: '0.2rem' },
  actionBtn: { backgroundColor: '#1c100a', border: '1px solid #331e13', color: '#ebcf98', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' },
  metricCard: { backgroundColor: '#110a06', border: '1px solid #331e13', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  metricLabel: { fontSize: '0.7rem', color: '#a89d93', fontWeight: 600, textTransform: 'uppercase' },
  metricValue: { fontSize: '1.5rem', fontWeight: 800, color: '#ebcf98', fontFamily: 'monospace' },
  metricSub: { fontSize: '0.65rem', color: '#887c71' },
  chartSection: { backgroundColor: '#110a06', border: '1px solid #331e13', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  sectionTitle: { fontSize: '0.85rem', fontWeight: 700, color: '#ebcf98' },
  chartPlaceholder: { display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '180px', paddingBottom: '1rem', borderBottom: '1px solid #24140b' },
  barGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '36px', backgroundColor: '#331e13', borderRadius: '6px 6px 0 0', transition: 'height 0.4s' },
  barLabel: { fontSize: '0.65rem', color: '#a89d93', textAlign: 'center' }
};