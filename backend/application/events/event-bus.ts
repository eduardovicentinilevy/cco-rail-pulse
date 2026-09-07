import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    // Previne warnings de memory leak caso muitos painéis se conectem simultaneamente
    this.setMaxListeners(50);
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
}

export const domainEventBus = EventBus.getInstance();