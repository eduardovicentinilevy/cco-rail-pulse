import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadMigrations } from '../infrastructure/database/migrator';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'infrastructure', 'database', 'migrations');

const withTempMigrations = <T>(files: Record<string, string>, handler: (directory: string) => T): T => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'railpulse-migrations-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(directory, name), content);
    }
    return handler(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

describe('Migrações versionadas', () => {
  it('carrega as migrações do projeto em ordem crescente e sem versões repetidas', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);

    assert.ok(migrations.length > 0, 'o projeto precisa ter ao menos a migração de linha de base');

    const versions = migrations.map((migration) => migration.version);
    assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
    assert.equal(new Set(versions).size, versions.length);
    assert.equal(migrations[0].version, 1);
  });

  it('gera o mesmo checksum para o mesmo conteúdo', () => {
    const [first] = loadMigrations(MIGRATIONS_DIR);
    const [again] = loadMigrations(MIGRATIONS_DIR);

    assert.equal(first.checksum, again.checksum);
    assert.match(first.checksum, /^[a-f0-9]{64}$/);
  });

  it('recusa arquivo fora do padrão NNN_nome.sql', () => {
    withTempMigrations({ 'adiciona-coluna.sql': 'SELECT 1;' }, (directory) => {
      assert.throws(() => loadMigrations(directory), /Nome de migração inválido/);
    });
  });

  it('recusa duas migrações com a mesma versão', () => {
    withTempMigrations({ '007_alfa.sql': 'SELECT 1;', '007_beta.sql': 'SELECT 2;' }, (directory) => {
      assert.throws(() => loadMigrations(directory), /compartilham a versão 7/);
    });
  });

  it('ignora arquivos que não são .sql', () => {
    withTempMigrations({ '001_base.sql': 'SELECT 1;', 'README.md': 'nota' }, (directory) => {
      assert.equal(loadMigrations(directory).length, 1);
    });
  });
});
