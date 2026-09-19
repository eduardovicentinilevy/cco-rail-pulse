// backend/domain/password-policy.ts
import crypto from 'crypto';

/**
 * Política de senha do CCO.
 *
 * Módulo puro (sem banco, sem env obrigatório) para poder ser exercitado por
 * testes unitários e reutilizado tanto no cadastro de operadores quanto na
 * troca de senha e na validação da carga inicial.
 */

/** Mínimo exigido por padrão. Pode ser elevado por ambiente, nunca reduzido. */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * O bcrypt ignora silenciosamente tudo além de 72 bytes: aceitar uma senha
 * maior daria ao operador uma falsa sensação de robustez.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Termos banidos: senhas de demonstração, jargão do produto e clássicos de dicionário. */
const BLOCKED_TERMS = [
  '123456',
  '1234567',
  'password',
  'passwd',
  'senha',
  'senha123',
  'qwerty',
  'qwert',
  'abc123',
  'admin',
  'administrador',
  'operador',
  'supervisor',
  'railpulse',
  'rail pulse',
  'linha6',
  'linha-6',
  'laranja',
  'metro',
  'trocar',
  'mudar',
] as const;

const SEQUENCE_LENGTH = 4;
const MAX_REPEATED_RUN = 3;

/** Contexto do dono da senha — impede que a credencial ou o nome virem a própria senha. */
export interface PasswordContext {
  operatorId?: string;
  name?: string;
}

export interface PasswordPolicyOptions {
  minLength?: number;
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Fragmentos derivados da identidade que não podem aparecer dentro da senha. */
const identityFragments = ({ operatorId, name }: PasswordContext): string[] => {
  const fragments: string[] = [];

  if (operatorId) {
    const id = normalize(operatorId);
    fragments.push(id, id.replace(/[^a-z0-9]/g, ''));
    for (const part of id.split(/[^a-z0-9]+/)) fragments.push(part);
  }

  if (name) {
    for (const part of normalize(name).split(/\s+/)) fragments.push(part);
  }

  return [...new Set(fragments.filter((fragment) => fragment.length >= 3))];
};

/** Detecta 1234 / 4321 / abcd / dcba — corridas óbvias no teclado ou no alfabeto. */
const hasRunningSequence = (value: string): boolean => {
  let ascending = 1;
  let descending = 1;

  for (let index = 1; index < value.length; index += 1) {
    const delta = value.charCodeAt(index) - value.charCodeAt(index - 1);
    ascending = delta === 1 ? ascending + 1 : 1;
    descending = delta === -1 ? descending + 1 : 1;
    if (ascending >= SEQUENCE_LENGTH || descending >= SEQUENCE_LENGTH) return true;
  }

  return false;
};

const hasLongRepeatedRun = (value: string): boolean => {
  let run = 1;

  for (let index = 1; index < value.length; index += 1) {
    run = value[index] === value[index - 1] ? run + 1 : 1;
    if (run > MAX_REPEATED_RUN) return true;
  }

  return false;
};

/**
 * Devolve a lista de violações da política — vazia quando a senha é aceitável.
 * Retornar todas de uma vez evita o vaivém de corrigir um requisito por tentativa.
 */
export const validatePassword = (
  password: string,
  context: PasswordContext = {},
  { minLength = PASSWORD_MIN_LENGTH }: PasswordPolicyOptions = {},
): string[] => {
  const violations: string[] = [];
  const effectiveMinLength = Math.max(minLength, PASSWORD_MIN_LENGTH);

  if (typeof password !== 'string' || password.length === 0) {
    return ['Informe a nova senha.'];
  }

  if (password.length < effectiveMinLength) {
    violations.push(`Use ao menos ${effectiveMinLength} caracteres.`);
  }

  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    violations.push(`Use no máximo ${PASSWORD_MAX_BYTES} bytes (o algoritmo de hash ignora o excedente).`);
  }

  if (password.trim() !== password) {
    violations.push('Não use espaços no início ou no fim.');
  }

  if (!/[a-z]/.test(password)) violations.push('Inclua ao menos uma letra minúscula.');
  if (!/[A-Z]/.test(password)) violations.push('Inclua ao menos uma letra maiúscula.');
  if (!/\d/.test(password)) violations.push('Inclua ao menos um número.');
  if (!/[^A-Za-z0-9]/.test(password)) violations.push('Inclua ao menos um símbolo.');

  const normalized = normalize(password);

  if (BLOCKED_TERMS.some((term) => normalized.includes(term))) {
    violations.push('Evite senhas de dicionário ou termos ligados ao sistema.');
  }

  if (hasRunningSequence(normalized)) {
    violations.push('Evite sequências como 1234 ou abcd.');
  }

  if (hasLongRepeatedRun(normalized)) {
    violations.push(`Evite repetir o mesmo caractere mais de ${MAX_REPEATED_RUN} vezes seguidas.`);
  }

  if (identityFragments(context).some((fragment) => normalized.includes(fragment))) {
    violations.push('A senha não pode conter a sua credencial nem partes do seu nome.');
  }

  return violations;
};

export const isPasswordCompliant = (password: string, context?: PasswordContext, options?: PasswordPolicyOptions): boolean =>
  validatePassword(password, context, options).length === 0;

/** Mensagem única, pronta para a resposta HTTP e para o log de boot. */
export const describeViolations = (violations: string[]): string =>
  `A senha não atende à política de segurança. ${violations.join(' ')}`;

const GENERATOR_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%&*?+=';

/**
 * Senha aleatória em conformidade com a política, usada como credencial
 * de primeiro acesso quando o operador inicial é criado sem senha definida.
 */
export const generateCompliantPassword = (length = 20): string => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = Array.from(crypto.randomBytes(length))
      .map((byte) => GENERATOR_ALPHABET[byte % GENERATOR_ALPHABET.length])
      .join('');

    if (isPasswordCompliant(candidate)) return candidate;
  }

  // Inalcançável na prática; mantido para não devolver uma senha fraca em silêncio.
  throw new Error('[PASSWORD] Não foi possível gerar uma senha em conformidade com a política.');
};
