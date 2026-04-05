export const RAIL_CONSTANTS = {
  // Limites de velocidade e engenharia
  MAX_SPEED_KMH: 120,
  WARNING_SPEED_KMH: 90,
  
  // Tempos limite (Thresholds)
  CRITICAL_DWELL_TIME_SECONDS: 45, // Retenção em plataforma que dispara alerta
  TARGET_HEADWAY_SECONDS: 90,      // Headway ideal da Linha Verde (1 minuto e meio)
  
  // Taxas de atualização do Front-end
  HEALTH_POLLING_INTERVAL_MS: 30000,
  ANALYTICS_POLLING_INTERVAL_MS: 60000,
};