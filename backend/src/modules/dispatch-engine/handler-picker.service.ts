import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DispatchedOrder, DispatchStrategy, ModuleHandler } from 'src/entities';
import { businessException } from 'src/common/exceptions/business-exception';
import { HandlerCandidate } from './dispatch-engine.types';

@Injectable()
export class HandlerPickerService {
  private readonly logger = new Logger(HandlerPickerService.name);

  constructor(
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository?: Repository<ModuleHandler>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository?: Repository<DispatchedOrder>,
  ) {}

  async pick(
    strategy: DispatchStrategy,
    moduleCode: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const moduleHandlerRepository = manager?.getRepository(ModuleHandler) ?? this.moduleHandlerRepository;
    const dispatchedOrderRepository = manager?.getRepository(DispatchedOrder) ?? this.dispatchedOrderRepository;
    if (!moduleHandlerRepository || !dispatchedOrderRepository) {
      throw businessException(1000, 500, 'HandlerPickerService is not ready');
    }

    if (strategy === DispatchStrategy.POOL || strategy === DispatchStrategy.TEAM_CLAIM) {
      return null;
    }

    if (strategy === DispatchStrategy.FIXED) {
      return this.pickFixed(moduleCode, moduleHandlerRepository);
    }

    if (strategy === DispatchStrategy.LOAD_BALANCE) {
      return this.pickLoadBalance(moduleCode, moduleHandlerRepository, dispatchedOrderRepository);
    }

    return this.pickRoundRobin(moduleCode, moduleHandlerRepository);
  }

  pickFromCandidates(
    strategy: DispatchStrategy,
    moduleCode: string,
    candidates: HandlerCandidate[],
    loadMap: ReadonlyMap<string, number> = new Map(),
  ): string | null {
    const active = candidates.filter(
      (candidate) =>
        candidate.moduleCode === moduleCode && candidate.isActive && !candidate.isBackup,
    );

    if (strategy === DispatchStrategy.POOL || strategy === DispatchStrategy.TEAM_CLAIM) {
      return null;
    }

    if (strategy === DispatchStrategy.FIXED) {
      return this.pickFixedFromList(active) ?? this.pickFixedFromList(candidates.filter((candidate) => candidate.moduleCode === moduleCode && candidate.isActive));
    }

    if (strategy === DispatchStrategy.LOAD_BALANCE) {
      return this.pickLoadBalanceFromList(active, loadMap) ?? null;
    }

    return this.pickRoundRobinFromList(active);
  }

  private async pickFixed(
    moduleCode: string,
    repository: Repository<ModuleHandler>,
  ): Promise<string | null> {
    const candidates = await repository.find({
      where: { moduleCode, isActive: true },
      relations: { handler: true },
    });

    const primary = this.pickFixedFromList(this.toHandlerCandidates(candidates.filter((candidate) => !candidate.isBackup)));
    if (primary) {
      return primary;
    }

    const backup = this.pickFixedFromList(this.toHandlerCandidates(candidates.filter((candidate) => candidate.isBackup)));
    if (backup) {
      return backup;
    }

    this.logger.warn({ moduleCode, strategy: 'fixed', reason: 'no handler configured' });
    return null;
  }

  private async pickLoadBalance(
    moduleCode: string,
    moduleHandlerRepository: Repository<ModuleHandler>,
    dispatchedOrderRepository: Repository<DispatchedOrder>,
  ): Promise<string | null> {
    const rows = await dispatchedOrderRepository
      .createQueryBuilder('d')
      .select('mh.handler_id', 'handlerId')
      .addSelect('COUNT(d.id)', 'openCount')
      .innerJoin(
        ModuleHandler,
        'mh',
        'mh.handler_id = d.handler_id AND mh.module_code = :moduleCode AND mh.is_active = true AND mh.is_backup = false',
        { moduleCode },
      )
      .where('d.status IN (:...statuses)', { statuses: ['pending', 'processing'] })
      .groupBy('mh.handler_id')
      .orderBy('COUNT(d.id)', 'ASC')
      .addOrderBy('mh.handler_id', 'ASC')
      .getRawMany<{ handlerId: string; openCount: string }>();

    const candidates = await moduleHandlerRepository.find({
      where: { moduleCode, isActive: true, isBackup: false },
      relations: { handler: true },
    });
    if (candidates.length === 0) {
      this.logger.warn({ moduleCode, strategy: 'load_balance', reason: 'no handler configured' });
      return null;
    }

    const openCountMap = new Map<string, number>();
    for (const row of rows) {
      openCountMap.set(row.handlerId, Number(row.openCount));
    }

    const best = this.pickLoadBalanceFromList(this.toHandlerCandidates(candidates), openCountMap);

    if (!best) {
      this.logger.warn({ moduleCode, strategy: 'load_balance', reason: 'no candidate after load ranking' });
    }
    return best;
  }

  private async pickRoundRobin(
    moduleCode: string,
    repository: Repository<ModuleHandler>,
  ): Promise<string | null> {
    const candidates = await repository.find({
      where: { moduleCode, isActive: true, isBackup: false },
      relations: { handler: true },
      order: { handlerId: 'ASC' },
    });

    if (candidates.length === 0) {
      this.logger.warn({ moduleCode, strategy: 'round_robin', reason: 'no handler configured' });
      return null;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidateList = this.toHandlerCandidates(candidates);
      const winner = this.pickRoundRobinFromList(candidateList);
      if (!winner) {
        return null;
      }

      const target = candidates.find((candidate) => candidate.handlerId === winner);
      if (!target) {
        return winner;
      }

      const currentVersion = target.rrCursorVersion;
      const result = await repository.update(
        { id: target.id, rrCursorVersion: currentVersion },
        { rrCursorVersion: currentVersion + 1 },
      );
      if (result.affected === 1) {
        return winner;
      }

      const refreshed = await repository.find({
        where: { moduleCode, isActive: true, isBackup: false },
        relations: { handler: true },
        order: { handlerId: 'ASC' },
      });
      candidates.splice(0, candidates.length, ...refreshed);
    }

    this.logger.warn({ moduleCode, strategy: 'round_robin', reason: 'rr cursor update retry exhausted' });
    return this.pickFixed(moduleCode, repository);
  }

  private pickFixedFromList(candidates: HandlerCandidate[]): string | null {
    const primary = [...candidates]
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))
      .find((candidate) => !candidate.isBackup);
    if (primary) {
      return primary.handlerId;
    }
    const backup = [...candidates]
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))
      .find((candidate) => candidate.isBackup);
    return backup?.handlerId ?? null;
  }

  private pickLoadBalanceFromList(
    candidates: HandlerCandidate[],
    loadMap: ReadonlyMap<string, number>,
  ): string | null {
    if (candidates.length === 0) {
      return null;
    }

    const ranked = [...candidates].sort((left, right) => {
      const leftLoad = loadMap.get(left.handlerId) ?? 0;
      const rightLoad = loadMap.get(right.handlerId) ?? 0;
      return leftLoad - rightLoad || right.weight - left.weight || left.handlerId.localeCompare(right.handlerId);
    });
    return ranked[0]?.handlerId ?? null;
  }

  private pickRoundRobinFromList(candidates: HandlerCandidate[]): string | null {
    if (candidates.length === 0) {
      return null;
    }

    const ordered = [...candidates].sort((left, right) => left.handlerId.localeCompare(right.handlerId));
    const expanded: HandlerCandidate[] = [];
    for (const candidate of ordered) {
      const repeat = Math.max(1, candidate.weight);
      for (let index = 0; index < repeat; index += 1) {
        expanded.push(candidate);
      }
    }

    if (expanded.length === 0) {
      return null;
    }

    const totalCursor = ordered.reduce((sum, candidate) => sum + Math.max(0, candidate.rrCursorVersion), 0);
    const index = totalCursor % expanded.length;
    return expanded[index]?.handlerId ?? null;
  }

  private toHandlerCandidates(candidates: ModuleHandler[]): HandlerCandidate[] {
    return candidates.map((candidate) => ({
      id: candidate.id,
      moduleCode: candidate.moduleCode,
      handlerId: candidate.handlerId,
      weight: candidate.weight,
      isBackup: candidate.isBackup,
      isActive: candidate.isActive,
      rrCursorVersion: candidate.rrCursorVersion,
    }));
  }
}
