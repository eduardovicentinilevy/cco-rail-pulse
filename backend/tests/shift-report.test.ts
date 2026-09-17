import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BuildShiftReportUseCase } from '../application/use-cases/BuildShiftReportUseCase';
import { ValidationError } from '../shared/errors';

const useCase = new BuildShiftReportUseCase();

describe('BuildShiftReportUseCase — validação da janela', () => {
  it('rejeita data inválida', async () => {
    await assert.rejects(() => useCase.execute(new Date('não é uma data')), ValidationError);
  });

  it('rejeita início no futuro', async () => {
    await assert.rejects(() => useCase.execute(new Date(Date.now() + 60_000)), ValidationError);
  });

  it('rejeita janela maior que 24 horas', async () => {
    await assert.rejects(() => useCase.execute(new Date(Date.now() - 25 * 3600_000)), ValidationError);
  });
});
