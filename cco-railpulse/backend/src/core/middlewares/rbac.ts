import { Request, Response, NextFunction } from 'express';

// Mock simplificado de validação JWT/RBAC para proteção de rotas de segurança
export const requireRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.headers['x-operator-role']; // Em produção: extrair do JWT
    if (role !== requiredRole && role !== 'ADMIN') {
      res.status(403).json({ error: 'Acesso negado. Credencial insuficiente para manobra de via.' });
      return;
    }
    next();
  };
};