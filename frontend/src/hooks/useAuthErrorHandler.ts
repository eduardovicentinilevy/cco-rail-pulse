import { useCallback } from 'react';
import { ApiError } from '../services/api';

/**
 * Converte uma falha de requisição em encerramento de turno quando a sessão
 * expirou ou o credenciamento foi revogado; demais erros seguem para a tela.
 */
export const useAuthErrorHandler = (onAuthError: (message: string) => void, context: string) =>
  useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.isAuthError) {
        onAuthError(`Sua sessão expirou ao ${context}.`);
      }
    },
    [onAuthError, context],
  );
