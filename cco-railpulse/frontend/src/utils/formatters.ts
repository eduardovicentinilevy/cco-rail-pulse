export const formatters = {
  toHourMinute: (isoDate: string): string => {
    return new Date(isoDate).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  formatCoordinate: (coord: number): string => {
    return coord.toFixed(5);
  },

  calculatePercentage: (value: number, max: number): number => {
    if (max === 0) return 0;
    const percent = (value / max) * 100;
    return Math.min(Math.max(percent, 0), 100);
  }
};