import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchModuleCode,
  DispatchStrategy,
  ModuleHandler,
  ModuleHandlerDelegation,
} from 'src/entities';
import { isValidProvince } from 'src/common/constants/provinces';
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
    @Optional()
    @InjectRepository(ModuleHandlerDelegation)
    private readonly delegationRepository?: Repository<ModuleHandlerDelegation>,
  ) {}

  async pick(
    strategy: DispatchStrategy,
    moduleCode: string,
    manager?: EntityManager,
    context?: { province?: string; mappingSource?: 'sheet4' | 'sheet5' },
  ): Promise<string | null> {
    const moduleHandlerRepository = manager?.getRepository(ModuleHandler) ?? this.moduleHandlerRepository;
    const dispatchedOrderRepository = manager?.getRepository(DispatchedOrder) ?? this.dispatchedOrderRepository;
    const delegationRepository = manager?.getRepository(ModuleHandlerDelegation) ?? this.delegationRepository;
    if (!moduleHandlerRepository) {
      throw businessException(1000, 500, 'HandlerPickerService is not ready');
    }

    if (context?.mappingSource) {
      return this.pickProvinceMapping(
        moduleCode,
        { province: context.province, mappingSource: context.mappingSource },
        moduleHandlerRepository,
      );
    }

    if (!dispatchedOrderRepository) {
      throw businessException(1000, 500, 'HandlerPickerService is not ready');
    }

    if (strategy === DispatchStrategy.POOL || strategy === DispatchStrategy.TEAM_CLAIM) {
      return null;
    }

    const candidates = await this.loadEffectiveHandlers(
      moduleCode,
      moduleHandlerRepository,
      delegationRepository,
    );
    if (strategy === DispatchStrategy.FIXED) {
      return this.pickFixed(moduleCode, candidates);
    }
    if (strategy === DispatchStrategy.LOAD_BALANCE) {
      return this.pickLoadBalance(moduleCode, candidates, dispatchedOrderRepository);
    }
    return this.pickRoundRobin(
      moduleCode,
      candidates,
      moduleHandlerRepository,
      delegationRepository,
    );
  }

  private async pickProvinceMapping(
    moduleCode: string,
    context: { province?: string; mappingSource: 'sheet4' | 'sheet5' },
    repository: Repository<ModuleHandler>,
  ): Promise<string | null> {
    const expectedModuleCode = context.mappingSource === 'sheet4'
      ? DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS
      : DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH;
    const province = context.province?.trim();
    if (moduleCode !== expectedModuleCode || !province || !isValidProvince(province)) {
      this.logger.warn({ moduleCode, mappingSource: context.mappingSource, province, reason: 'invalid province mapping context' });
      return null;
    }

    const namespacedModuleCode = `${moduleCode}__${province}`;
    const candidates = (await repository.find({
      where: { moduleCode: namespacedModuleCode, isActive: true },
      relations: { handler: true },
      order: { weight: 'DESC', handlerId: 'ASC' },
    })).filter((candidate) => this.isHandlerActive(candidate) && !candidate.isBackup);
    const handlerId = [...candidates]
      .sort((left, right) => right.weight - left.weight || left.handlerId.localeCompare(right.handlerId))[0]?.handlerId ?? null;
    if (!handlerId) {
      this.logger.warn({ moduleCode: namespacedModuleCode, mappingSource: context.mappingSource, reason: 'no active primary handler configured' });
    }
    return handlerId;
  }

  pickFromCandidates(
    strategy: DispatchStrategy,
    moduleCode: string,
    candidates: HandlerCandidate[],
    loadMap: ReadonlyMap<string, number> = new Map(),
  ): string | null {
    const active = candidates.filter(
      (candidate) => candidate.moduleCode === moduleCode && candidate.isActive && !candidate.isBackup,
    );

    if (strategy === DispatchStrategy.POOL || strategy === DispatchStrategy.TEAM_CLAIM) {
      return null;
    }
    if (strategy === DispatchStrategy.FIXED) {
      return this.pickFixedFromList(active)
        ?? this.pickFixedFromList(candidates.filter((candidate) =>
          candidate.moduleCode === moduleCode && candidate.isActive));
    }
    if (strategy === DispatchStrategy.LOAD_BALANCE) {
      return this.pickLoadBalanceFromList(active, loadMap) ?? null;
    }
    return this.pickRoundRobinFromList(active);
  }

  private pickFixed(moduleCode: string, candidates: ModuleHandler[]): string | null {
    const primary = this.pickFixedFromList(
      this.toHandlerCandidates(candidates.filter((candidate) => !candidate.isBackup)),
    );
    if (primary) return primary;

    const backup = this.pickFixedFromList(
      this.toHandlerCandidates(candidates.filter((candidate) => candidate.isBackup)),
    );
    if (backup) return backup;

    this.logger.warn({ moduleCode, strategy: 'fixed', reason: 'no handler configured' });
    return null;
  }

  private async pickLoadBalance(
    moduleCode: string,
    candidates: ModuleHandler[],
    dispatchedOrderRepository: Repository<DispatchedOrder>,
  ): Promise<string | null> {
    const primaryCandidates = candidates.filter((candidate) => !candidate.isBackup);
    if (primaryCandidates.length === 0) {
      this.logger.warn({ moduleCode, strategy: 'load_balance', reason: 'no handler configured' });
      return null;
    }

    const handlerIds = primaryCandidates.map((candidate) => candidate.handlerId);
    const rows = await dispatchedOrderRepository
      .createQueryBuilder('d')
      .select('d.handler_id', 'handlerId')
      .addSelect('COUNT(d.id)', 'openCount')
      .where('d.handler_id IN (:...handlerIds)', { handlerIds })
      .andWhere('d.status IN (:...statuses)', { statuses: ['pending', 'processing'] })
      .groupBy('d.handler_id')
      .getRawMany<{ handlerId: string; openCount: string }>();
    const openCountMap = new Map(rows.map((row) => [row.handlerId, Number(row.openCount)]));
    const best = this.pickLoadBalanceFromList(
      this.toHandlerCandidates(primaryCandidates),
      openCountMap,
    );
    if (!best) {
      this.logger.warn({ moduleCode, strategy: 'load_balance', reason: 'no candidate after load ranking' });
    }
    return best;
  }

  private async pickRoundRobin(
    moduleCode: string,
    initialCandidates: ModuleHandler[],
    repository: Repository<ModuleHandler>,
    delegationRepository?: Repository<ModuleHandlerDelegation>,
  ): Promise<string | null> {
    let candidates = initialCandidates.filter((candidate) => !candidate.isBackup);
    if (candidates.length === 0) {
      this.logger.warn({ moduleCode, strategy: 'round_robin', reason: 'no handler configured' });
      return null;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const winner = this.pickRoundRobinFromList(this.toHandlerCandidates(candidates));
      if (!winner) return null;

      const target = candidates.find((candidate) => candidate.handlerId === winner);
      if (!target) return winner;
      const currentVersion = target.rrCursorVersion;
      const result = await repository.update(
        { id: target.id, rrCursorVersion: currentVersion },
        { rrCursorVersion: currentVersion + 1 },
      );
      if (result.affected === 1) return winner;

      candidates = (await this.loadEffectiveHandlers(
        moduleCode,
        repository,
        delegationRepository,
      )).filter((candidate) => !candidate.isBackup);
    }

    this.logger.warn({ moduleCode, strategy: 'round_robin', reason: 'rr cursor update retry exhausted' });
    return this.pickFixed(moduleCode, candidates);
  }

  private async loadEffectiveHandlers(
    moduleCode: string,
    repository: Repository<ModuleHandler>,
    delegationRepository?: Repository<ModuleHandlerDelegation>,
  ): Promise<ModuleHandler[]> {
    const configured = await repository.find({
      where: { moduleCode, isActive: true },
      relations: { handler: true },
      order: { handlerId: 'ASC' },
    });
    if (!delegationRepository) {
      return configured.filter((candidate) => this.isHandlerActive(candidate));
    }

    const now = new Date();
    const delegations = await delegationRepository.createQueryBuilder('delegation')
      .leftJoinAndSelect('delegation.delegateHandler', 'delegateHandler')
      .where('delegation.module_code = :moduleCode', { moduleCode })
      .andWhere('delegation.is_active = true')
      .andWhere('delegation.starts_at <= :now', { now })
      .andWhere('delegation.ends_at > :now', { now })
      .getMany();
    const delegationBySource = new Map(delegations.map((item) => [item.sourceHandlerId, item]));
    const effective: ModuleHandler[] = [];

    for (const candidate of configured) {
      const delegation = delegationBySource.get(candidate.handlerId);
      if (!delegation) {
        if (this.isHandlerActive(candidate)) effective.push(candidate);
        continue;
      }
      if (!delegation.delegateHandlerId || delegation.delegateHandler?.isActive === false) {
        continue;
      }
      effective.push(Object.assign(new ModuleHandler(), {
        ...candidate,
        handlerId: delegation.delegateHandlerId,
        handler: delegation.delegateHandler,
      }));
    }

    const deduplicated = new Map<string, ModuleHandler>();
    for (const candidate of effective) {
      const current = deduplicated.get(candidate.handlerId);
      if (!current || candidate.weight > current.weight) {
        deduplicated.set(candidate.handlerId, candidate);
      }
    }
    return Array.from(deduplicated.values());
  }

  private pickFixedFromList(candidates: HandlerCandidate[]): string | null {
    const primary = [...candidates]
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))
      .find((candidate) => !candidate.isBackup);
    if (primary) return primary.handlerId;

    const backup = [...candidates]
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))
      .find((candidate) => candidate.isBackup);
    return backup?.handlerId ?? null;
  }

  private pickLoadBalanceFromList(
    candidates: HandlerCandidate[],
    loadMap: ReadonlyMap<string, number>,
  ): string | null {
    if (candidates.length === 0) return null;
    return [...candidates].sort((left, right) => {
      const leftLoad = loadMap.get(left.handlerId) ?? 0;
      const rightLoad = loadMap.get(right.handlerId) ?? 0;
      return leftLoad - rightLoad
        || right.weight - left.weight
        || left.handlerId.localeCompare(right.handlerId);
    })[0]?.handlerId ?? null;
  }

  private pickRoundRobinFromList(candidates: HandlerCandidate[]): string | null {
    if (candidates.length === 0) return null;
    const ordered = [...candidates].sort((left, right) => left.handlerId.localeCompare(right.handlerId));
    const expanded: HandlerCandidate[] = [];
    for (const candidate of ordered) {
      for (let index = 0; index < Math.max(1, candidate.weight); index += 1) {
        expanded.push(candidate);
      }
    }
    if (expanded.length === 0) return null;

    const totalCursor = ordered.reduce(
      (sum, candidate) => sum + Math.max(0, candidate.rrCursorVersion),
      0,
    );
    return expanded[totalCursor % expanded.length]?.handlerId ?? null;
  }

  private isHandlerActive(candidate: ModuleHandler): boolean {
    return candidate.handler?.isActive !== false;
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
