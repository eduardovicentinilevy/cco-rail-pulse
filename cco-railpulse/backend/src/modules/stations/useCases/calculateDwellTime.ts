import { DwellTimeQueryDTO } from '../entities/StationModels';
import { StationRepository } from '../repositories/stationRepository';

export class CalculateDwellTimeUseCase {
  static async execute(query: DwellTimeQueryDTO) {
    const data = await StationRepository.getDwellTimes(query);
    
    if (!data.length) return { average_dwell_time: 0, events: [] };

    // Calcula a média global de retenção em plataforma para a amostra
    const totalDwell = data.reduce((acc, curr) => acc + Number(curr.dwell_time_seconds), 0);
    const averageDwell = totalDwell / data.length;

    return {
      period: { start: query.start_time, end: query.end_time },
      filter: query.fleet_code ? `Fleet ${query.fleet_code}` : 'All Fleets',
      average_dwell_time_seconds: Math.round(averageDwell),
      total_stops_analyzed: data.length,
      events: data
    };
  }
}