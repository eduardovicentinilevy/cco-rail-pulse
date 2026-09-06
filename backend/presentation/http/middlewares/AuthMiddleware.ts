// src/presentation/http/middlewares/AuthMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  operatorId: string;
  role: string;
  iat: number;
  exp: number;
}

// Estende a tipagem do Request do Express para incluir os dados do operador autenticado
declare global {
  namespace Express {
    interface Request {
      operator?: TokenPayload;
    }
  }
}

export const AuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Erro no formato do token (Bearer token esperado).' });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ error: 'Token malformatado.' });
  }

  const secret = process.env.JWT_SECRET || 'railpulse_secure_jwt_secret_key_2026';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }

    req.operator = decoded as TokenPayload;
    return next();
  });
};