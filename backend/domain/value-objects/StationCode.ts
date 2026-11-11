// backend/domain/value-objects/StationCode.ts
import { normalizeStationCode } from '../line';
import type { LineCatalog } from '../line';
import { ValidationError } from '../../shared/errors';

/**
 * Código ATS de 3 caracteres de uma estação (padrão CCO).
 *
 * Valida apenas o formato. Saber se o código pertence a uma malha é pergunta do
 * catálogo daquela linha (`LineCatalog.requireStation`), não deste objeto: um
 * value object não tem como saber de qual cliente é o código que recebeu.
 */
export class StationCode {
  private readonly value: string;

  constructor(value: string) {
    const normalized = normalizeStationCode(value);

    if (normalized.length === 0) {
      throw new ValidationError('O código da estação não pode ser vazio.');
    }
    if (normalized.length !== 3) {
      throw new ValidationError('O código da estação deve possuir exatamente 3 caracteres (padrão CCO).');
    }

    this.value = normalized;
  }

  /** Código válido e pertencente à malha da linha informada. */
  public static inLine(value: string, catalog: LineCatalog): StationCode {
    const code = new StationCode(value);
    catalog.requireStation(code.getValue());
    return code;
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
