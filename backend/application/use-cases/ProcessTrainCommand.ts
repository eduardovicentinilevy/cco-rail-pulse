// backend/application/use-cases/ProcessTrainCommand.ts
import { env } from '../../config/env';
import { withTransaction } from '../../infrastructure/database/postgres';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { operatorRepository } from '../../infrastructure/repositories/pg-operator.repository';
import { AuditLogger } from '../../infrastructure/audit/AuditLogger';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { domainEventBus } from '../events/event-bus';
import type { TrainCommand, TrainSnapshot, TrainStatus } from '../../domain/entities/TrainSession';

export interface ProcessCommandRequest {
  operatorId: string;
  trainId: string;
  /** Nome bruto do comando como o painel o expõe (ex.: EMERGENCY_BRAKE_OVERRIDE) — só para auditoria. */
  rawCommand: string;
  command: TrainCommand;
  /** Bloco/estação de referência informado pelo operador — usado apenas na auditoria. */
  targetBlock?: string;
}

export interface ProcessCommandResult {
  snapshot: TrainSnapshot;
  /** Falso quando o trem já estava no estado que o comando produziria — nada foi reescrito. */
  applied: boolean;
}

const SEVERITY: Record<TrainCommand, 'INFO' | 'WARNING' | 'CRITICAL'> = {
  HALT: 'CRITICAL',
  RESTRICT_SPEED: 'WARNING',
  RELEASE: 'INFO',
};

/** Estado resultante de cada comando — usado só para detectar comando redundante (idempotência). */
const RESULTING_STATUS: Record<TrainCommand, TrainStatus> = {
  HALT: 'EMERGÊNCIA',
  RESTRICT_SPEED: 'ATENÇÃO',
  RELEASE: 'NORMAL',
};

/** Postgres 55P03 (lock_not_available): o `lock_timeout` da transação expirou esperando o FOR UPDATE. */
export const isLockTimeout = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '55P03';

/**
 * Processa um comando operacional sobre uma composição, sob lock pessimista.
 *
 * ## Cenário de risco
 * Dois operadores comandando o MESMO trem ao mesmo tempo (ex.: A libera o T-04
 * enquanto B pede frenagem de emergência) não podem ser processados como leituras e
 * escritas independentes — a segunda operação precisa enxergar o efeito da primeira,
 * nunca sobrescrevê-la com um estado obtido antes dela.
 *
 * ## Por que Postgres (`SELECT ... FOR UPDATE`) e não Redis/Redlock
 * O backend roda como processo único contra um único Postgres — não há múltiplas
 * instâncias da API disputando o mesmo recurso. Redlock existe para coordenar VÁRIOS
 * processos que, de outro modo, não teriam uma fonte de verdade compartilhada; aqui a
 * fonte de verdade É o Postgres, então o lock pessimista no próprio registro:
 *   - é atômico com a leitura e a escrita (mesma transação, sem janela entre
 *     "verificar o lock" e "usar o recurso", que é exatamente a classe de bug que o
 *     Redlock tenta mitigar com múltiplos nós e ainda assim é discutida na literatura);
 *   - não introduz uma nova dependência de infraestrutura (Redis) nem um novo modo de
 *     falha (rede até o Redis, expiração de TTL do lock, relógio dessincronizado entre
 *     nós — problemas reais do Redlock) para resolver um problema que já está resolvido
 *     dentro do banco que este processo já usa como fonte de verdade.
 * Se este backend um dia escalar horizontalmente (múltiplas instâncias da API atrás de
 * um load balancer), a mesma pergunta muda de figura — mas nesse caso o lock pessimista
 * continua correto (é o Postgres, não um processo específico, que arbitra), então a
 * migração para Redlock deixaria de ser sobre corrigir uma corrida e passaria a ser só
 * sobre reduzir contenção — uma otimização, não uma correção de bug.
 *
 * ## Ciclo de vida (cada etapa depende da anterior ter sucesso)
 *   1. Adquirir lock  — `SELECT ... FOR UPDATE` dentro de uma transação. Um segundo
 *      operador comandando o MESMO trem fica bloqueado nesta consulta até o primeiro
 *      liberar o lock (commit ou rollback) — nunca vê um estado parcialmente aplicado.
 *   2. Validar estado — a composição precisa existir; um comando idêntico ao estado
 *      corrente é tratado como no-op (evita ruído de auditoria e de WebSocket num
 *      duplo clique ou num retry do cliente).
 *   3. Persistir o comando na auditoria — na MESMA transação do passo 1: ou os dois
 *      persistem juntos, ou nenhum persiste. Um comando de segurança executado sem
 *      registro na trilha de auditoria é pior do que um comando recusado.
 *   4. Executar — aplica a regra de domínio e grava o novo estado.
 *   5. Liberar o lock — `withTransaction` dá commit ao retornar; a partir daqui o
 *      próximo operador em fila para este trem já pode prosseguir.
 *   6. Emitir — evento de domínio para o barramento, DEPOIS do commit. O lock nunca é
 *      mantido durante I/O de rede (notificar os demais painéis): segurar um lock de
 *      linha enquanto se espera uma operação de rede é o padrão clássico que transforma
 *      contenção saudável em fila indefinida.
 *
 * ## Mitigação de deadlock
 * Esta operação nunca adquire mais de UM lock de linha por transação (sempre o único
 * `trainId` do comando corrente) e nunca chama outro caso de uso que também adquira
 * lock enquanto o seu está aberto. Deadlock exige um CICLO: a transação X precisa
 * deter um recurso que a transação Y quer, e vice-versa — o que pressupõe que alguma
 * transação detenha dois ou mais locks simultâneos. Como o número máximo de locks
 * detidos por esta transação é um, um ciclo é estruturalmente impossível aqui: na
 * pior hipótese, comandos concorrentes para o mesmo trem apenas ENFILEIRAM (o segundo
 * espera o primeiro terminar), o que é fila, não impasse.
 * O risco real de uma trava pessimista não é deadlock — é uma transação lenta ou
 * travada segurando o lock e bloqueando as seguintes indefinidamente (inanição). Por
 * isso a consulta roda sob `lock_timeout` (`TRAIN_COMMAND_LOCK_TIMEOUT_MS`, padrão
 * 4 s): se o lock não for concedido a tempo, o Postgres devolve o erro `55P03`, que
 * vira um `ConflictError` (HTTP 409) — o segundo operador recebe uma recusa rápida e
 * explícita para tentar de novo, em vez de a requisição ficar pendurada.
 */
export class ProcessTrainCommandUseCase {
  public async execute(request: ProcessCommandRequest): Promise<ProcessCommandResult> {
    const { operatorId, trainId, rawCommand, command, targetBlock } = request;
    const auditAction = `EXEC_${rawCommand}`;
    const auditTarget = `TRAIN_${trainId}_BLOCK_${targetBlock ?? '?'}`;

    try {
      const result = await withTransaction(async (client) => {
        // 1. Adquirir lock — com prazo, para não enfileirar operadores indefinidamente
        //    atrás de uma transação travada (ver "Mitigação de deadlock" acima).
        //    `set_config(..., true)` equivale a SET LOCAL, mas aceita parâmetro — sem
        //    interpolar valor nenhum, mesmo que a configuração venha de env em vez de
        //    entrada do operador.
        await client.query(`SELECT set_config('lock_timeout', $1, true)`, [String(env.trainCommandLockTimeoutMs)]);
        const train = await TrainRepository.findByIdWithLock(trainId, client);

        // 2. Validar estado.
        if (!train) {
          throw new NotFoundError(`Composição ${trainId} não encontrada na malha ferroviária.`);
        }
        const applied = train.status !== RESULTING_STATUS[command];

        // 3. Persistir na auditoria — atômico com o passo 4 (mesma transação/client).
        await operatorRepository.logAudit(
          operatorId,
          auditAction,
          auditTarget,
          applied ? 'EXECUTED' : 'NO_OP',
          client,
        );

        // 4. Executar.
        if (applied) {
          train.applyCommand(command);
          await TrainRepository.save(train, client);
        }

        return { snapshot: train.toSnapshot(), applied };
        // 5. Liberar lock: `withTransaction` dá COMMIT ao retornar daqui.
      });

      // 6. Emitir — só depois do commit, e só quando algo de fato mudou.
      AuditLogger.record({ operatorId, action: auditAction, targetResource: auditTarget, severity: SEVERITY[command] });
      if (result.applied) {
        domainEventBus.emit('train:updated', result.snapshot);
        domainEventBus.emit('system:alert', {
          severity: SEVERITY[command],
          message: `Comando ${rawCommand} executado no ${trainId} pelo operador ${operatorId}`,
          timestamp: new Date().toISOString(),
        });
      }

      return result;
    } catch (error) {
      const publicError = isLockTimeout(error)
        ? new ConflictError(
            `Outro operador já está processando um comando para o trem ${trainId}. Tente novamente em instantes.`,
          )
        : error;

      // Best-effort: uma tentativa recusada/falha também é um evento de auditoria válido,
      // mas não pode, por si só, mascarar o erro original caso a própria escrita falhe.
      await operatorRepository.logAudit(operatorId, auditAction, auditTarget, 'FAILED');

      throw publicError;
    }
  }
}

export const processTrainCommandUseCase = new ProcessTrainCommandUseCase();
