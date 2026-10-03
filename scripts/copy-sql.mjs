// scripts/copy-sql.mjs
//
// O `tsc` só emite JavaScript: os arquivos .sql das migrações precisam ser
// copiados para `backend/dist` para que a imagem de produção — que roda o
// build compilado, sem o código-fonte — encontre as migrações.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const assets = [['backend/infrastructure/database/migrations', 'backend/dist/infrastructure/database/migrations']];

for (const [from, to] of assets) {
  const source = path.join(root, from);
  const target = path.join(root, to);

  if (!fs.existsSync(source)) {
    console.error(`[build] Diretório de origem ausente: ${from}`);
    process.exit(1);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`[build] ${from} -> ${to}`);
}
