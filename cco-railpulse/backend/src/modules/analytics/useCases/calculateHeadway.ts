import { HeadwayQueryDTO } from '../entities/AnalyticsModels';
import { AnalyticsRepository } from '../repositories/analyticsRepository';

export class CalculateHeadwayUseCase {
  static async execute(query: HeadwayQueryDTO) {
    const data = await AnalyticsRepository.getHeadwayDistribution(query);
    
    // Fallback unificado mantendo exatamente a mesma assinatura de propriedades
    if (!data || data.length === 0) {
      return { 
        fleet: query.fleet_code,
        period: { start: query.start_time, end: query.end_time },
        average_headway_seconds: 0, 
        events: [] // Padronizado com a expectativa do React
      };
    }

    // Cálculo matemático mantido
    const totalHeadway = data.reduce((acc, curr) => acc + Number(curr.headway_seconds), 0);
    const averageHeadway = totalHeadway / data.length;

    return {
      fleet: query.fleet_code,
      period: { start: query.start_time, end: query.end_time },
      average_headway_seconds: Math.round(averageHeadway),
      events: data // A chave agora é 'events', como o Front-end exige
    };
  }
}