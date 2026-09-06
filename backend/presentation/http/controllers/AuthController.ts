// src/presentation/http/controllers/AuthController.ts
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuditLogger } from '../../../infrastructure/security/AuditLogger';

export class AuthController {
  public static async login(req: Request, res: Response) {
    const { operatorId, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress;

    // Simulação de validação de credenciais (em produção, validaria contra repositório seguro com hash Bcrypt)
    if (!operatorId || !password) {
      AuditLogger.record({
        operatorId: operatorId || 'DESCONHECIDO',
        action: 'LOGIN_FAILED',
        targetResource: 'CCO-AUTH',
        ipAddress: ip,
        severity: 'WARNING'
      });
      return res.status(400).json({ error: 'Matrícula e senha são obrigatórias.' });
    }

    // Geração do token JWT restrito ao CCO
    const secret = process.env.JWT_SECRET || 'railpulse_secure_jwt_secret_key_2026';
    const token = jwt.sign(
      { operatorId: operatorId.toUpperCase(), role: 'OPERATOR_SOC' },
      secret,
      { expiresIn: '8h' } // Turno de trabalho padrão
    );

    AuditLogger.record({
      operatorId: operatorId.toUpperCase(),
      action: 'LOGIN_SUCCESS',
      targetResource: 'CCO-AUTH',
      ipAddress: ip,
      severity: 'INFO'
    });

    return res.status(200).json({
      status: 'AUTHENTICATED',
      operator: operatorId.toUpperCase(),
      token,
      expiresIn: '8h'
    });
  }
}