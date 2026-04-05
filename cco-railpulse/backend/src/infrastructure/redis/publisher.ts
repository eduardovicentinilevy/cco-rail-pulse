import { createClient } from 'redis';
import 'dotenv/config';

const publisher = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

publisher.on('error', (err) => console.error('[Redis Publisher] Erro:', err));

export const connectPublisher = async () => {
  if (!publisher.isOpen) await publisher.connect();
};

export const publishEvent = async (channel: string, message: any) => {
  try {
    await connectPublisher();
    await publisher.publish(channel, JSON.stringify(message));
  } catch (error) {
    console.error(`[Redis] Falha ao publicar no canal ${channel}:`, error);
  }
};