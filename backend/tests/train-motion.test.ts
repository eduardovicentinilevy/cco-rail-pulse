import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { jitteredDelay, nextDirection } from '../application/services/TrainMotionSimulator';
import { linhaUniCatalog } from './helpers/catalog';

describe('TrainMotionSimulator — sentido do vaivém', () => {
  const maxIndex = linhaUniCatalog().size - 1;

  it('força o sentido de ida ao chegar ao terminal inicial', () => {
    assert.equal(nextDirection(0, maxIndex, -1), 1);
  });

  it('força o sentido de volta ao chegar ao terminal final', () => {
    assert.equal(nextDirection(maxIndex, maxIndex, 1), -1);
  });

  it('mantém o sentido corrente em qualquer estação intermediária', () => {
    assert.equal(nextDirection(5, maxIndex, 1), 1);
    assert.equal(nextDirection(5, maxIndex, -1), -1);
  });

  it('percorre a linha inteira e retorna, sem nunca sair dos limites', () => {
    let index = 0;
    let direction = nextDirection(index, maxIndex, 1);

    const visited = [index];
    for (let step = 0; step < maxIndex * 2; step += 1) {
      index += direction;
      visited.push(index);
      assert.ok(index >= 0 && index <= maxIndex, `índice fora da malha: ${index}`);
      direction = nextDirection(index, maxIndex, direction);
    }

    // Uma ida completa e uma volta completa devolvem o trem ao terminal de origem.
    assert.equal(visited.at(-1), 0);
    assert.ok(visited.includes(maxIndex));
  });
});

describe('TrainMotionSimulator — dessincronização entre composições', () => {
  it('mantém a variação dentro de ±35% do intervalo base', () => {
    for (const random of [0, 0.25, 0.5, 0.75, 1]) {
      const delay = jitteredDelay(4000, () => random);
      assert.ok(delay >= 2600 && delay <= 5400, `delay ${delay}ms fora da faixa esperada (random=${random})`);
    }
  });

  it('não produz sempre o mesmo atraso — senão os trens voltariam a andar em lockstep', () => {
    const samples = new Set(Array.from({ length: 20 }, () => jitteredDelay(4000)));
    assert.ok(samples.size > 1, 'todas as amostras de jitter vieram idênticas');
  });
});
