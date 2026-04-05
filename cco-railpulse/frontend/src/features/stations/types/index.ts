export interface DwellTimeEventDTO {
  train_id: number;
  door_open_time: string;
  door_close_time: string;
  dwell_time_seconds: number;
}

export interface DwellTimeResponseDTO {
  average_dwell_time_seconds: number;
  total_stops_analyzed: number;
  events: DwellTimeEventDTO[];
}