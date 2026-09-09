// frontend/src/assets/avatar-placeholder.ts
// Avatar de fallback embutido: renderiza mesmo sem rede, ao contrário de uma URL externa.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="32" fill="#1f1f1f"/>
  <circle cx="32" cy="25" r="11" fill="#ff6600"/>
  <path d="M10 60c0-12.2 9.8-22 22-22s22 9.8 22 22z" fill="#ff6600" opacity="0.75"/>
</svg>`;

export const AVATAR_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`;
