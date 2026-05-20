import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchRule, DispatchStrategy } from 'src/entities';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import { AstEvalTrace } from './types';

export interface DispatchHit {
  ruleId: string;
  ruleName: string;
  priority: number;
  targetModule: string;
  dispatchStrategy: string;
  handlerId: string | null;
  astTrace: AstEvalTrace;
  deduped: boolean;
}

export interface DispatchTarget {
  moduleCode: string;
  handlerId: string | null;
  ruleId: string;
  ruleName: string;
}

export interface DispatchEvaluateResult {
  matchedRules: DispatchHit[];
  targetModules: string[];
  childrenToCreate: DispatchTarget[];
  astTrace: Record<string, AstEvalTrace>;
}

@Injectable()
export class DispatchEngineService {
  constructor(
    @InjectRepository(DispatchRule)
    private readonly dispatchRuleRepository: Repository<DispatchRule>,
    private readonly evaluator: ConditionEvaluatorService,
    private readonly handlerPicker: HandlerPickerService,
  ) {}

  async evaluate(input: {
    orderType: string;
    fields: Record<string, unknown>;
    ruleIds?: string[];
  }): Promise<DispatchEvaluateResult> {
    const qb = this.dispatchRuleRepository
      .createQueryBuilder('rule')
      .where('rule.orderType = :orderType', { orderType: input.orderType })
      .andWhere('rule.isActive = :isActive', { isActive: true })
      .orderBy('rule.priority', 'ASC')
      .addOrderBy('rule.createdAt', 'ASC');

    if (input.ruleIds && input.ruleIds.length > 0) {
      qb.andWhere('rule.id IN (:...ruleIds)', { ruleIds: input.ruleIds });
    }

    const rules = await qb.getMany();
    const allHits: DispatchHit[] = [];
    const byModule = new Map<string, DispatchHit[]>();

    for (const rule of rules) {
      const evaluated = await this.evaluator.evaluate(rule.triggerConditions, input.fields);
      if (!evaluated.result) {
        continue;
      }

      const hit: DispatchHit = {
        ruleId: rule.id,
        ruleName: rule.ruleName,
        priority: rule.priority,
        targetModule: rule.targetModule,
        dispatchStrategy: rule.dispatchStrategy,
        handlerId: null,
        astTrace: evaluated.trace,
        deduped: false,
      };

      allHits.push(hit);
      const existing = byModule.get(rule.targetModule) ?? [];
      existing.push(hit);
      byModule.set(rule.targetModule, existing);
    }

    const winners: DispatchHit[] = [];
    for (const hits of byModule.values()) {
      hits.sort((a, b) => a.priority - b.priority);
      winners.push(hits[0]);
      for (let i = 1; i < hits.length; i += 1) {
        hits[i].deduped = true;
      }
    }
    winners.sort((a, b) => a.priority - b.priority);

    const childrenToCreate: DispatchTarget[] = [];
    for (const winner of winners) {
      const handlerId = await this.handlerPicker.pick(
        winner.dispatchStrategy as never,
        winner.targetModule,
      );
      winner.handlerId = handlerId;
      childrenToCreate.push({
        moduleCode: winner.targetModule,
        handlerId,
        ruleId: winner.ruleId,
        ruleName: winner.ruleName,
      });
    }

    const astTrace: Record<string, AstEvalTrace> = {};
    allHits.forEach((hit) => {
      astTrace[hit.ruleId] = hit.astTrace;
    });

    return {
      matchedRules: allHits,
      targetModules: winners.map((item) => item.targetModule),
      childrenToCreate,
      astTrace,
    };
  }
}
