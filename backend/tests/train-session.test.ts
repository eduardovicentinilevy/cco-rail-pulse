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

const buildTrain = () => new TrainSession('T-01', 'BRA', 45, 752, 'NORMAL', new Date('2026-09-16T10:00:00Z'));

describe('TrainSession — telemetria', () => {
  it('rejeita velocidade negativa', () => {
    assert.throws(() => buildTrain().updateTelemetry(-1, 752, 'NORMAL'), ValidationError);
  });

  it('rejeita velocidade acima do limite homologado', () => {
    assert.throws(() => buildTrain().updateTelemetry(MAX_SPEED_KMH + 1, 752, 'NORMAL'), ValidationError);
  });

  it('rejeita tensão inválida', () => {
    assert.throws(() => buildTrain().updateTelemetry(40, Number.NaN, 'NORMAL'), ValidationError);
  });

  it('atualiza o carimbo de tempo', () => {
    const train = buildTrain();
    const before = train.updatedAt.getTime();
    train.updateTelemetry(50, 748, 'NORMAL');
    assert.ok(train.updatedAt.getTime() > before);
  });
});

describe('TrainSession — marcha entre estações', () => {
  const T0 = new Date('2026-11-05T12:00:00Z');
  const at = (ms: number) => new Date(T0.getTime() + ms);

  it('parte da plataforma e avança proporcionalmente ao tempo', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);

    assert.equal(train.phase, 'EM_MARCHA');
    assert.equal(train.speedKmH, CRUISE_SPEED_KMH);
    assert.equal(train.progressAt(at(30_000)), 0.5);
    assert.equal(train.remainingAt(at(30_000)), 30_000);
    assert.equal(train.isArrivalDue(at(59_999)), false);
    assert.equal(train.isArrivalDue(at(60_000)), true);
  });

  it('chega à estação de destino, para e lê a tensão de lá', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    train.arrive(744.5, 1, at(60_000));

    assert.equal(train.currentStationCode, 'MAR');
    assert.equal(train.motion, null);
    assert.equal(train.speedKmH, 0);
    assert.equal(train.voltageV, 744.5);
    assert.equal(train.phase, 'PLATAFORMA');
  });

  it('suspende a marcha no ponto em que está e retoma depois', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    train.suspend('Seção SR-01 sem tensão no terceiro trilho', at(15_000));

    assert.equal(train.phase, 'PARADO_ENTRE_ESTACOES');
    assert.equal(train.progressAt(at(50_000)), 0.25);
    assert.equal(train.remainingAt(at(50_000)), null);

    train.resume(20_000, CRUISE_SPEED_KMH, at(50_000));
    assert.equal(train.phase, 'EM_MARCHA');
    assert.equal(train.holdReason, null);
    assert.equal(train.progressAt(at(60_000)), 0.625);
  });

  it('retém na plataforma com motivo e libera', () => {
    const train = buildTrain();
    assert.equal(train.hold('Aguardando via livre — T-04 à frente', T0), true);
    assert.equal(train.hold('Aguardando via livre — T-04 à frente', T0), false);
    assert.equal(train.phase, 'RETIDO');
    assert.equal(train.clearHold(T0), true);
    assert.equal(train.phase, 'PLATAFORMA');
  });

  it('não parte imobilizada nem duas vezes', () => {
    const halted = new TrainSession('T-02', 'BRA', 0, 752, 'EMERGÊNCIA', T0);
    assert.throws(() => halted.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0), ValidationError);

    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    assert.throws(() => train.depart('ITA', 60_000, CRUISE_SPEED_KMH, T0), ValidationError);
  });

  it('inverte o sentido só parada na plataforma', () => {
    const train = buildTrain();
    train.reverse(T0);
    assert.equal(train.direction, -1);
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    assert.throws(() => train.reverse(T0), ValidationError);
  });

  it('o snapshot leva o andamento medido no instante da serialização', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    const snapshot = train.toSnapshot(at(45_000));

    assert.equal(snapshot.phase, 'EM_MARCHA');
    assert.equal(snapshot.nextStationCode, 'MAR');
    assert.deepEqual(snapshot.movement, { progress: 0.75, remainingMs: 15_000 });
  });
});

describe('TrainSession — comandos operacionais', () => {
  const T0 = new Date('2026-11-05T12:00:00Z');
  const at = (ms: number) => new Date(T0.getTime() + ms);

  it('HALT imobiliza a composição', () => {
    const train = buildTrain();
    train.applyCommand('HALT', T0);

    assert.equal(train.speedKmH, 0);
    assert.equal(train.status, 'EMERGÊNCIA');
    assert.equal(train.phase, 'IMOBILIZADO');
  });

  it('HALT em marcha para o trem no meio do trecho, sem teletransporte', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    train.applyCommand('HALT', at(30_000));

    assert.equal(train.currentStationCode, 'BRA');
    assert.equal(train.motion?.toStationCode, 'MAR');
    assert.equal(train.progressAt(at(90_000)), 0.5);
    assert.equal(train.speedKmH, 0);
  });

  it('RESTRICT_SPEED em marcha recalcula o trecho, mais devagar', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    train.applyCommand('RESTRICT_SPEED', at(30_000));

    assert.equal(train.status, 'ATENÇÃO');
    assert.equal(train.speedKmH, RESTRICTED_SPEED_KMH);
    assert.ok((train.remainingAt(at(30_000)) ?? 0) > 30_000, 'a 20 km/h a metade restante leva mais que 30 s');
  });

  it('RELEASE na plataforma normaliza sem dar velocidade a trem parado', () => {
    const train = buildTrain();
    train.applyCommand('HALT', T0);
    train.applyCommand('RELEASE', T0);

    assert.equal(train.status, 'NORMAL');
    assert.equal(train.speedKmH, 0);
  });

  it('RELEASE entre estações retoma a marcha à velocidade de cruzeiro', () => {
    const train = buildTrain();
    train.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    train.applyCommand('HALT', at(30_000));
    train.applyCommand('RELEASE', at(40_000));

    assert.equal(train.phase, 'EM_MARCHA');
    assert.equal(train.speedKmH, CRUISE_SPEED_KMH);
    assert.equal(train.progressAt(at(40_000)), 0.5);
  });

  it('o relógio acelerado encurta o trecho recalculado na mesma proporção', () => {
    const real = buildTrain();
    real.depart('MAR', 60_000, CRUISE_SPEED_KMH, T0);
    real.applyCommand('RESTRICT_SPEED', T0, 1);

    const fast = buildTrain();
    fast.depart('MAR', 6_000, CRUISE_SPEED_KMH, T0);
    fast.applyCommand('RESTRICT_SPEED', T0, 10);

    assert.ok(Math.abs((fast.remainingAt(T0) ?? 0) - (real.remainingAt(T0) ?? 0) / 10) < 1);
  });

  it('preserva posição e tensão medida — um comando não teletransporta o trem', () => {
    const train = buildTrain();
    train.applyCommand('HALT');

    assert.equal(train.currentStationCode, 'BRA');
    assert.equal(train.voltageV, 752);
  });

  it('reconhece apenas comandos de domínio válidos', () => {
    assert.equal(isTrainCommand('HALT'), true);
    assert.equal(isTrainCommand('EMERGENCY_BRAKE_OVERRIDE'), false);
    assert.equal(isTrainCommand(42), false);
  });
});
