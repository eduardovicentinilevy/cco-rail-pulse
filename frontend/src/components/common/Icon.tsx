// frontend/src/components/common/Icon.tsx
import React from 'react';

/**
 * Conjunto de ícones do console: traço único de 1,75 px em grade de 24 px, pontas
 * e junções arredondadas, cor herdada do texto (`currentColor`).
 *
 * Substitui os glifos Unicode e emojis que a interface usava como ícone — cada
 * sistema operacional os desenha com um peso (e às vezes uma cor) diferente, o
 * que quebrava o alinhamento da navegação e ignorava o tema do console.
 */
const PATHS = {
  // --- Navegação -----------------------------------------------------------
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  star: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l3.6-5" />
      <path d="M3.5 20.5h17" />
    </>
  ),
  train: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="3" />
      <path d="M5 11h14" />
      <path d="M8.6 14.3h.01M15.4 14.3h.01" />
      <path d="M8.5 17.5l-2 3M15.5 17.5l2 3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.9L3.2 17.5a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5M12 17.2h.01" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.2 14.2a4.7 4.7 0 0 1 4.3 5.3" />
    </>
  ),
  camera: (
    <>
      <rect x="3.5" y="7" width="11" height="10" rx="2" />
      <path d="M14.5 10.5l6-3v9l-6-3" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15.5h10.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 7.3 8.1 3.75 3.75 0 0 0 7 15.5z" />
      <path d="M8.5 18.5l-.8 2M12.5 18.5l-.8 2M16.5 18.5l-.8 2" />
    </>
  ),
  bolt: <path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z" />,
  'chart-line': (
    <>
      <path d="M4 4v15.5h16" />
      <path d="M7.5 15l3.5-4.5 3 2.5 4.5-6.5" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
  wrench: (
    <path d="M15.6 4.4a4.5 4.5 0 0 0-5.9 5.9L4.4 15.6a2.1 2.1 0 0 0 3 3l5.3-5.3a4.5 4.5 0 0 0 5.9-5.9l-2.7 2.7-2.4-.6-.6-2.4z" />
  ),
  'chart-bar': (
    <>
      <path d="M4 4v15.5h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h15M16 5l3 3-3 3" />
      <path d="M20 16H5M8 13l-3 3 3 3" />
    </>
  ),
  message: (
    <path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-6.5l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z" />
  ),
  clipboard: (
    <>
      <rect x="9" y="3.5" width="6" height="3.5" rx="1" />
      <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7a1.5 1.5 0 0 0-1.5-1.5H15" />
      <path d="M8.5 12h7M8.5 15.5h5" />
    </>
  ),
  'id-card': (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <circle cx="8.5" cy="10.8" r="2" />
      <path d="M5.5 15.8a3 3 0 0 1 6 0M14.5 10h4M14.5 13.5h3" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4.5" width="16" height="6" rx="1.5" />
      <rect x="4" y="13.5" width="16" height="6" rx="1.5" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h5M11 16.5h5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4.5 7.5H13M17 7.5h2.5M4.5 16.5H7M11 16.5h8.5" />
      <circle cx="15" cy="7.5" r="2" />
      <circle cx="9" cy="16.5" r="2" />
    </>
  ),
  'chevrons-left': <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />,
  'chevrons-right': <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />,

  // --- Cabeçalho e ações -----------------------------------------------------
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
      <path d="M15 9a4.5 4.5 0 0 1 0 6M17.6 6.4a8 8 0 0 1 0 11.2" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  moon: <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7.5 7.5 0 0 0 10.2 10.2z" />,
  logout: (
    <>
      <path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />
      <path d="M10 12h10M16.5 8.5L20 12l-3.5 3.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.5v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6z" />
      <path d="M9 12l2.2 2.2L15 10.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V4h10v4" />
      <path d="M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-6A1.5 1.5 0 0 1 4.5 8h15A1.5 1.5 0 0 1 21 9.5v6a1.5 1.5 0 0 1-1.5 1.5H17" />
      <rect x="7" y="13.5" width="10" height="6.5" rx="1" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5M12 12h.01" />
    </>
  ),
  list: <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  pin: (
    <>
      <path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </>
  ),
  stop: (
    <>
      <path d="M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z" />
      <path d="M8.5 12h7" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </>
  ),
  'file-text': (
    <>
      <path d="M7 3.5h7L18.5 8v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5" />
    </>
  ),

  // --- Estado e feedback -------------------------------------------------------
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12.3l2.8 2.8L16 9.7" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'chevron-up': <path d="M6 14.5l6-6 6 6" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  /** Lado do ícone. O padrão acompanha o tamanho do texto ao redor. */
  size?: number | string;
  /** Preenche a forma com a cor do texto (ex.: estrela de favorito ativo). */
  filled?: boolean;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = '1.15em', filled = false, className }) => (
  <svg
    className={className ? `rp-icon ${className}` : 'rp-icon'}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {PATHS[name]}
  </svg>
);
