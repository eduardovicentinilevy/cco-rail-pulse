import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRUISE_SPEED_KMH,
  MAX_SPEED_KMH,
  RESTRICTED_SPEED_KMH,
  TrainSession,
  isTrainCommand,
} from '../domain/entities/TrainSession';
import { ValidationError } from '../shared/errors';

const buildTrain = () => new TrainSession('T-01', 'BRA', 45, 24.6, 'NORMAL', new Date('2026-09-16T10:00:00Z'));

describe('TrainSession — telemetria', () => {
  it('rejeita velocidade negativa', () => {
    assert.throws(() => buildTrain().updateTelemetry(-1, 24.6, 'NORMAL'), ValidationError);
  });

  it('rejeita velocidade acima do limite homologado', () => {
    assert.throws(() => buildTrain().updateTelemetry(MAX_SPEED_KMH + 1, 24.6, 'NORMAL'), ValidationError);
  });

  it('rejeita tensão inválida', () => {
    assert.throws(() => buildTrain().updateTelemetry(40, Number.NaN, 'NORMAL'), ValidationError);
  });

  it('atualiza o carimbo de tempo', () => {
    const train = buildTrain();
    const before = train.updatedAt.getTime();
    train.updateTelemetry(50, 24.5, 'NORMAL');
    assert.ok(train.updatedAt.getTime() > before);
  });
});

describe('TrainSession — comandos operacionais', () => {
  it('HALT imobiliza a composição', () => {
    const train = buildTrain();
    train.applyCommand('HALT');

    assert.equal(train.speedKmH, 0);
    assert.equal(train.status, 'EMERGÊNCIA');
  });

  it('RESTRICT_SPEED impõe a velocidade restrita', () => {
    const train = buildTrain();
    train.applyCommand('RESTRICT_SPEED');

    assert.equal(train.speedKmH, RESTRICTED_SPEED_KMH);
    assert.equal(train.status, 'ATENÇÃO');
  });

  it('RELEASE retoma a velocidade de cruzeiro', () => {
    const train = buildTrain();
    train.applyCommand('HALT');
    train.applyCommand('RELEASE');

    assert.equal(train.speedKmH, CRUISE_SPEED_KMH);
    assert.equal(train.status, 'NORMAL');
  });

  it('preserva posição e tensão medida — um comando não teletransporta o trem', () => {
    const train = buildTrain();
    train.applyCommand('HALT');

    assert.equal(train.currentStationCode, 'BRA');
    assert.equal(train.voltageKV, 24.6);
  });

  it('reconhece apenas comandos de domínio válidos', () => {
    assert.equal(isTrainCommand('HALT'), true);
    assert.equal(isTrainCommand('EMERGENCY_BRAKE_OVERRIDE'), false);
    assert.equal(isTrainCommand(42), false);
  });
});
