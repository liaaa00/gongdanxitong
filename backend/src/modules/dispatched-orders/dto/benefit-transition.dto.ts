import { IsIn, IsObject, IsOptional } from 'class-validator';

export const BENEFIT_STAGE_CODES = [
  'submitted',
  'under_review',
  'returned',
  'pending_stamp',
  'stamped',
  'materials_received',
  'offline_filing',
  'stage_feedback',
] as const;

export type BenefitStageCode = typeof BENEFIT_STAGE_CODES[number];

export class BenefitTransitionDto {
  @IsIn(BENEFIT_STAGE_CODES)
  nextStage!: BenefitStageCode;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
