import { HeadwayQueryDTO } from '../entities/AnalyticsModels';
import { AnalyticsRepository } from '../repositories/analyticsRepository';

export class CalculateDwellTimeUseCase {
  static async execute(query: HeadwayQueryDTO) {
    const data = await AnalyticsRepository.getDwellTimeDistribution(query);
    
    if (!data || data.length === 0) {
      return { 
        fleet: query.fleet_code,
        period: { start: query.start_time, end: query.end_time },
        events: [] 
      };
    }

    // O repositório já retorna o formato { station, dwell_seconds } exigido pelo gráfico
    return {
      fleet: query.fleet_code,
      period: { start: query.start_time, end: query.end_time },
      events: data.map(item => ({
        station: item.station,
        dwell_seconds: Number(item.dwell_seconds)
      }))
    };
  }
}