// frontend/src/lib/format.ts

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export const formatTime = (value: Date | string | number = new Date()): string =>
  TIME_FORMAT.format(new Date(value));

export const formatDateTime = (value: Date | string | number): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMAT.format(date);
};

/** Converte segundos em `HH:MM:SS`. */
export const formatDuration = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const formatNumber = (value: number, fractionDigits = 1): string =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });

/** Escapa um valor para CSV (RFC 4180). */
const escapeCsv = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (headers: string[], rows: Array<Array<unknown>>): string =>
  [headers, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\r\n');

/** Dispara o download de um conteúdo textual gerado no cliente. */
export const downloadTextFile = (filename: string, content: string, mimeType = 'text/csv;charset=utf-8'): void => {
  // BOM garante que o Excel em pt-BR interprete os acentos corretamente.
  const blob = new Blob([`\uFEFF${content}`], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
