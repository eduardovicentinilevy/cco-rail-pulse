// backend/infrastructure/repositories/pg-line-catalog.repository.ts
import { db } from '../database/postgres';
import { LineCatalog } from '../../domain/line';
import type { LineIdentity, LineStation } from '../../domain/line';
import { createLogger } from '../../shared/logger';

const logger = createLogger('LINE-CATALOG');

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

interface LineRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  code: string;
  name: string;
}

interface StationRow {
  id: string;
  code: string;
  name: string;
  position: number;
  substation: string;
  nominal_voltage_kv: string;
  headway_seconds: number | null;
  map_x: string | null;
  map_y: string | null;
}

/** `pg` devolve NUMERIC como string para preservar precisão — normalizamos na borda. */
const toNumberOrNull = (value: string | null): number | null => (value == null ? null : Number(value));

const toStation = (row: StationRow): LineStation => ({
  id: row.id,
  code: row.code,
  name: row.name,
  position: Number(row.position),
  substation: row.substation,
  nominalVoltageKV: Number(row.nominal_voltage_kv),
  headwaySeconds: row.headway_seconds,
  mapX: toNumberOrNull(row.map_x),
  mapY: toNumberOrNull(row.map_y),
});

const LINE_COLUMNS = `l.id, l.tenant_id, t.name AS tenant_name, l.code, l.name`;

/**
 * Catálogo de malha lido do banco, com cache em processo por linha.
 *
 * Estação muda uma vez por década, mas é consultada em toda validação de
 * ocorrência e em todo ciclo do simulador — reler a cada vez seria uma ida ao
 * banco por leitura de telemetria. O cache é invalidado explicitamente por quem
 * escreve na malha (hoje só a semeadura; na interface de cadastro, o CRUD).
 */
export class PgLineCatalogRepository {
  private readonly cache = new Map<string, LineCatalog>();

  public async tenantBySlug(slug: string): Promise<TenantRecord | null> {
    const result = await db.query<{ id: string; slug: string; name: string; is_active: boolean }>(
      `SELECT id, slug, name, is_active FROM tenants WHERE slug = $1`,
      [slug.trim().toLowerCase()],
    );
    const row = result.rows[0];
    return row ? { id: row.id, slug: row.slug, name: row.name, isActive: row.is_active } : null;
  }

  /** Linha padrão do cliente: a primeira ativa, em ordem de código. */
  public async defaultLineId(tenantId: string): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM lines WHERE tenant_id = $1 AND is_active = TRUE ORDER BY code ASC LIMIT 1`,
      [tenantId],
    );
    return result.rows[0]?.id ?? null;
  }

  public async activeLineIds(): Promise<string[]> {
    const result = await db.query<{ id: string }>(
      `SELECT l.id
       FROM lines l
       JOIN tenants t ON t.id = l.tenant_id
       WHERE l.is_active = TRUE AND t.is_active = TRUE
       ORDER BY t.slug ASC, l.code ASC`,
    );
    return result.rows.map((row) => row.id);
  }

  public async byId(lineId: string): Promise<LineCatalog | null> {
    const cached = this.cache.get(lineId);
    if (cached) return cached;

    const line = await db.query<LineRow>(
      `SELECT ${LINE_COLUMNS} FROM lines l JOIN tenants t ON t.id = l.tenant_id WHERE l.id = $1`,
      [lineId],
    );
    const row = line.rows[0];
    if (!row) return null;

    const catalog = new LineCatalog(toIdentity(row), await this.loadStations(lineId));
    this.cache.set(lineId, catalog);
    return catalog;
  }

  /**
   * Catálogo obrigatório. Uma sessão só existe com uma linha válida no token, de
   * modo que a ausência aqui é linha removida sob os pés do operador, não erro de
   * entrada — por isso Error e não ValidationError.
   */
  public async require(lineId: string): Promise<LineCatalog> {
    const catalog = await this.byId(lineId);
    if (!catalog) {
      throw new Error(`Linha ${lineId} não encontrada ou desativada.`);
    }
    return catalog;
  }

  /** Confirma que a linha pertence ao cliente — o token traz as duas informações separadas. */
  public async requireInTenant(lineId: string, tenantId: string): Promise<LineCatalog> {
    const catalog = await this.require(lineId);
    if (catalog.tenantId !== tenantId) {
      throw new Error(`A linha ${lineId} não pertence ao cliente ${tenantId}.`);
    }
    return catalog;
  }

  public invalidate(lineId?: string): void {
    if (lineId) this.cache.delete(lineId);
    else this.cache.clear();
    logger.info(lineId ? `Catálogo da linha ${lineId} invalidado.` : 'Catálogo de todas as linhas invalidado.');
  }

  private async loadStations(lineId: string): Promise<LineStation[]> {
    const result = await db.query<StationRow>(
      `SELECT id, code, name, position, substation, nominal_voltage_kv, headway_seconds, map_x, map_y
       FROM stations
       WHERE line_id = $1
       ORDER BY position ASC`,
      [lineId],
    );
    return result.rows.map(toStation);
  }
}

const toIdentity = (row: LineRow): LineIdentity => ({
  id: row.id,
  tenantId: row.tenant_id,
  tenantName: row.tenant_name,
  code: row.code,
  name: row.name,
});

export const lineCatalogRepository = new PgLineCatalogRepository();
