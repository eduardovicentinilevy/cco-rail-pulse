// frontend/src/data/lineGeometry.ts
// Projeção do mapa da linha.
//
// Tudo o que o mapa desenha sai daqui, por uma única projeção: mudar o
// enquadramento move o desenho inteiro junto, em vez de deixar referências
// desenhadas à mão soltas do trilho.
//
// A versão anterior projetava as coordenadas geográficas das 14 estações da
// Linha 2-Verde, escritas neste arquivo. A malha é cadastro, então o que entra
// agora é a coordenada normalizada (0–1) que vem com cada estação, e o que sai
// é o ponto no SVG. A projeção de uma malha de verdade, por latitude e
// longitude, cabe quando essas colunas existirem — ver `docs/multi-tenant.md`.
import type { Station } from '../types';
import type { Point } from '../lib/curve';

export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 440;

/** Folga nas laterais do quadro, para a linha sem coordenadas cadastradas. */
const PADDING = 70;

const round = (value: number): number => Math.round(value * 10) / 10;

/** Coordenada normalizada (0–1) do traçado para o ponto no SVG. */
export const project = (x: number, y: number): Point => ({
  x: round(x * VIEW_WIDTH),
  y: round(y * VIEW_HEIGHT),
});

/**
 * Posição de uma estação na tela.
 *
 * Vem de `mapX`/`mapY` do catálogo — coordenadas normalizadas cadastradas por
 * linha. Antes o traçado de uma linha específica estava escrito no componente,
 * o que desenhava a mesma linha para qualquer cliente. Sem coordenada
 * cadastrada, as estações são distribuídas ao longo de um eixo reto, para que
 * uma linha recém-cadastrada ainda apareça no mapa.
 */
export const projectStation = (station: Station, index: number, total: number): Point => {
  if (station.mapX != null && station.mapY != null) {
    return project(station.mapX, station.mapY);
  }

  const progress = total > 1 ? index / (total - 1) : 0.5;
  return { x: round(PADDING + progress * (VIEW_WIDTH - 2 * PADDING)), y: VIEW_HEIGHT / 2 };
};
