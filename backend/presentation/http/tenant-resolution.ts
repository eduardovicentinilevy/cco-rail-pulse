// backend/presentation/http/tenant-resolution.ts
import type { Request } from 'express';
import { env } from '../../config/env';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const sanitize = (value: unknown): string | null => {
  const slug = String(value ?? '').trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
};

/**
 * Subdomínio do Host, quando a instalação serve vários clientes sob um domínio
 * base: `cliente.railpulse.app` com TENANT_BASE_DOMAIN=railpulse.app → `cliente`.
 */
const fromHost = (req: Request): string | null => {
  if (!env.tenantBaseDomain) return null;

  const host = String(req.headers.host ?? '').toLowerCase().split(':')[0];
  const suffix = `.${env.tenantBaseDomain}`;
  if (!host.endsWith(suffix)) return null;

  const subdomain = host.slice(0, -suffix.length);
  // Só o rótulo mais à esquerda; `a.b.dominio` não é um cliente chamado "a.b".
  return subdomain.includes('.') ? null : sanitize(subdomain);
};

/**
 * Cliente de uma requisição de login, na ordem: corpo, header, subdomínio, padrão.
 *
 * O corpo vem primeiro porque é o que a tela de acesso usa em desenvolvimento,
 * onde não há subdomínio. Em produção o subdomínio é quem manda, e o padrão
 * mantém funcionando a instalação de um cliente só.
 */
export const resolveTenantSlug = (req: Request): string =>
  sanitize((req.body as { tenantSlug?: unknown } | undefined)?.tenantSlug) ??
  sanitize(req.headers['x-tenant-slug']) ??
  fromHost(req) ??
  env.defaultTenantSlug;
