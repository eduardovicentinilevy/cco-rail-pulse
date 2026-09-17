import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../config/env';

type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface Preferences {
  sound: boolean;
  desktop: boolean;
}

const DEFAULT_PREFERENCES: Preferences = { sound: true, desktop: false };

const readPreferences = (): Preferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.preferences);
    return raw ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

/** Dois tons curtos e descendentes — audível em sala de controle sem ser estridente. */
const BEEP_STEPS: ReadonlyArray<{ frequency: number; at: number; duration: number }> = [
  { frequency: 880, at: 0, duration: 0.14 },
  { frequency: 620, at: 0.17, duration: 0.2 },
];

export interface CriticalAlerts {
  preferences: Preferences;
  notificationPermission: NotificationPermissionState;
  toggleSound: () => void;
  /** Ativa notificações do sistema, pedindo permissão na primeira vez. */
  enableDesktop: () => Promise<void>;
  disableDesktop: () => void;
  /** Dispara o alerta configurado para um evento crítico. */
  notify: (title: string, body: string) => void;
}

/**
 * Alertas de eventos críticos para o operador.
 *
 * Em um CCO o painel raramente está em primeiro plano; som e notificação do
 * sistema são o que de fato chama a atenção. O som é sintetizado pela Web Audio
 * API, evitando carregar um arquivo de áudio.
 */
export const useCriticalAlerts = (): CriticalAlerts => {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(preferences));
    } catch {
      // Navegação privativa pode recusar a escrita; a preferência vale só nesta sessão.
    }
  }, [preferences]);

  useEffect(() => {
    const context = audioContextRef.current;
    return () => {
      void context?.close().catch(() => undefined);
    };
  }, []);

  const playBeep = useCallback(() => {
    try {
      // O contexto é criado sob demanda: antes de um gesto do usuário o
      // navegador o manteria suspenso de qualquer forma.
      audioContextRef.current ??= new AudioContext();
      const context = audioContextRef.current;
      if (context.state === 'suspended') void context.resume();

      for (const step of BEEP_STEPS) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = step.frequency;

        const start = context.currentTime + step.at;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + step.duration);

        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + step.duration + 0.02);
      }
    } catch {
      // Sem áudio disponível o alerta visual já cobre o operador.
    }
  }, []);

  const notify = useCallback(
    (title: string, body: string) => {
      if (preferences.sound) playBeep();

      if (preferences.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          // A tag agrupa alertas repetidos em vez de empilhar notificações.
          new Notification(title, { body, tag: 'railpulse-critical', silent: preferences.sound });
        } catch {
          // Alguns navegadores exigem service worker; silenciamos e seguimos.
        }
      }
    },
    [preferences.sound, preferences.desktop, playBeep],
  );

  const toggleSound = useCallback(() => {
    setPreferences((current) => {
      const next = { ...current, sound: !current.sound };
      // Um toque de retorno confirma que o som voltou a funcionar.
      if (next.sound) playBeep();
      return next;
    });
  }, [playBeep]);

  const enableDesktop = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }

    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setNotificationPermission(permission);
    setPreferences((current) => ({ ...current, desktop: permission === 'granted' }));
  }, []);

  const disableDesktop = useCallback(() => setPreferences((current) => ({ ...current, desktop: false })), []);

  return { preferences, notificationPermission, toggleSound, enableDesktop, disableDesktop, notify };
};
