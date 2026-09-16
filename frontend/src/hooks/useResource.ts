import { useCallback, useEffect, useState } from 'react';

interface Loaded<T> {
  key: string;
  data?: T;
  error?: string;
}

export interface Resource<T> {
  data: T | null;
  /** Mensagem de falha da consulta corrente, se houver. */
  error: string | null;
  isLoading: boolean;
  /** Refaz a consulta mantendo os mesmos parâmetros. */
  reload: () => void;
}

/**
 * Busca assíncrona com cancelamento e estado de carregamento derivado.
 *
 * O estado "carregando" não é gravado por um `setState` síncrono dentro do efeito
 * (o que provocaria renders em cascata): ele é inferido comparando a chave da
 * requisição corrente com a chave do último resultado recebido.
 *
 * `load` precisa ser memoizado pelo chamador (useCallback) e deve apenas buscar —
 * nunca alterar estado — para que o cancelamento funcione de forma previsível.
 */
export const useResource = <T>(
  key: string,
  load: () => Promise<T>,
  /** Notificado dentro do efeito (nunca durante o render) quando a busca falha. */
  onError?: (error: unknown) => void,
): Resource<T> => {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [attempt, setAttempt] = useState(0);

  const requestKey = `${key}#${attempt}`;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const data = await load();
        if (!cancelled) setLoaded({ key: requestKey, data });
      } catch (error) {
        if (cancelled) return;
        onError?.(error);
        setLoaded({ key: requestKey, error: error instanceof Error ? error.message : 'Falha ao carregar os dados.' });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [requestKey, load, onError]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const isCurrent = loaded?.key === requestKey;

  return {
    data: isCurrent ? (loaded.data ?? null) : null,
    error: isCurrent ? (loaded.error ?? null) : null,
    isLoading: !isCurrent,
    reload,
  };
};
