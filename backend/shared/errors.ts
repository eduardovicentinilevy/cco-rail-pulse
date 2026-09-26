/** Erro de aplicação com status HTTP associado, tratado pelo error handler central. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Acesso negado.') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(404, message, 'NOT_FOUND');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas tentativas. Aguarde alguns instantes.') {
    super(429, message, 'TOO_MANY_REQUESTS');
  }
}

/** Recurso sob disputa: outra transação já detém o lock pessimista sobre o mesmo registro. */
export class ConflictError extends AppError {
  constructor(message = 'Recurso em uso por outra operação. Tente novamente em instantes.') {
    super(409, message, 'CONFLICT');
  }
}
