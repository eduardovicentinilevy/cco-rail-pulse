// src/domain/value-objects/StationCode.ts
export class StationCode {
  private readonly value: string;

  constructor(value: string) {
    this.validate(value);
    this.value = value.toUpperCase();
  }

  private validate(value: string): void {
    if (!value || value.trim().length === 0) {
      throw new Error("O código da estação não pode ser vazio.");
    }
    if (value.length !== 3) {
      throw new Error("O código da estação deve possuir exatamente 3 caracteres (Padrão CCO Linha Uni).");
    }
  }

  public getValue(): string {
    return this.value;
  }
}