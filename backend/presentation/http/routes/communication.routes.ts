// backend/presentation/http/routes/communication.routes.ts
import { Router } from 'express';
import {
  CHANNEL_LABELS,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  isCommunicationChannel,
  isCommunicationDirection,
} from '../../../domain/communications';
import { CommunicationRepository } from '../../../infrastructure/database/repositories/CommunicationRepository';
import { ValidationError } from '../../../shared/errors';
import { toBoundedInt } from '../../../shared/http';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';

export const communicationRouter: Router = Router();

// O registro é da operação da linha e cita estações e composições dela.
communicationRouter.use(verifyJwt, withLineCatalog);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_MESSAGE_LENGTH = 5;
const MAX_MESSAGE_LENGTH = 500;

const optionalText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

communicationRouter.get('/meta', (_req, res) => {
  res.status(200).json({
    channels: COMMUNICATION_CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] })),
    directions: COMMUNICATION_DIRECTIONS,
  });
});

communicationRouter.get('/', async (req: ScopedRequest, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const channel = isCommunicationChannel(req.query.channel) ? req.query.channel : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const page = await CommunicationRepository.list({ lineId: req.catalog!.id, limit, offset, channel, search });
  res.status(200).json(page);
});

communicationRouter.post('/', async (req: ScopedRequest, res) => {
  const catalog = req.catalog!;
  const body = req.body ?? {};

  if (!isCommunicationChannel(body.channel)) {
    throw new ValidationError(`Canal inválido. Use um de: ${COMMUNICATION_CHANNELS.join(', ')}.`);
  }
  if (!isCommunicationDirection(body.direction)) {
    throw new ValidationError(`Sentido inválido. Use um de: ${COMMUNICATION_DIRECTIONS.join(', ')}.`);
  }

  const message = String(body.message ?? '').trim();
  if (message.length < MIN_MESSAGE_LENGTH) {
    throw new ValidationError(`Descreva a comunicação com ao menos ${MIN_MESSAGE_LENGTH} caracteres.`);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`A comunicação não pode exceder ${MAX_MESSAGE_LENGTH} caracteres.`);
  }

  const stationCode = optionalText(body.stationCode)?.toUpperCase() ?? null;
  // Quem diz se o código existe é a malha da linha da sessão, e o erro nomeia a linha.
  if (stationCode) catalog.requireStation(stationCode);

  const communication = await CommunicationRepository.create({
    lineId: catalog.id,
    channel: body.channel,
    direction: body.direction,
    stationCode,
    trainId: optionalText(body.trainId)?.toUpperCase() ?? null,
    operatorId: req.operator!.credential,
    message,
  });

  res.status(201).json(communication);
});
