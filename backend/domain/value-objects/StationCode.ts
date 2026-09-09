// backend/domain/value-objects/StationCode.ts
import { isKnownStation } from '../line';
import { ValidationError } from '../../shared/errors';

/** Código ATS de 3 caracteres de uma estação da malha (padrão CCO Linha Uni). */
export class StationCode {
  private readonly value: string;

  constructor(value: string) {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (normalized.length === 0) {
      throw new ValidationError('O código da estação não pode ser vazio.');
    }
    if (normalized.length !== 3) {
      throw new ValidationError('O código da estação deve possuir exatamente 3 caracteres (Padrão CCO Linha Uni).');
    }
    if (!isKnownStation(normalized)) {
      throw new ValidationError(`O código "${normalized}" não pertence à malha da Linha 6-Laranja.`);
    }

    this.value = normalized;
  }

  public getValue(): string {
    return this.value;
  }

  public toString(): string {
    return this.value;
  }

  public equals(other: StationCode): boolean {
    return this.value === other.value;
  }
}
