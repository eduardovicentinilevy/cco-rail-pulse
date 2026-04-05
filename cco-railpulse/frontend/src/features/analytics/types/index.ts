export interface HeadwaySeriesDTO {
  train_id: number;
  event_time: string;
  headway_seconds: number;
}

export interface HeadwayResponseDTO {
  fleet: string;
  average_headway_seconds: number;
  series: HeadwaySeriesDTO[];
}