import { DispatchStrategy } from 'src/entities';

export type AstScalar = string | number | boolean | null;
export type AstValue = AstScalar | AstScalar[];

export type AstNode = AndNode | OrNode | NotNode | LeafNode;

export interface AndNode {
  op: 'AND';
  children: AstNode[];
}

export interface OrNode {
  op: 'OR';
  children: AstNode[];
}

export interface NotNode {
  op: 'NOT';
  child: AstNode;
}

export type LeafOp =
  | 'EQ'
  | 'NEQ'
  | 'IN'
  | 'NOT_IN'
  | 'CONTAINS'
  | 'GT'
  | 'LT'
  | 'GTE'
  | 'LTE'
  | 'EXISTS'
  | 'REGEX';

export interface LeafNode {
  field: string;
  op: LeafOp;
  value?: AstValue;
}

export interface AstEvalTrace {
  op: string;
  result: boolean;
  field?: string;
  value?: unknown;
  expected?: unknown;
  reason?: string;
  children?: AstEvalTrace[];
  shortCircuited?: boolean;
}

export interface AstEvaluateResult {
  result: boolean;
  trace: AstEvalTrace;
}

export interface RuleHit {
  ruleId: string;
  ruleName: string;
  targetModule: string;
  priority: number;
  trace: AstEvalTrace;
  deduped: boolean;
}

export interface ChildToCreate {
  moduleCode: string;
  handlerId: string | null;
  visibleFields: string[];
  ruleId: string;
  ruleName: string;
  dispatchStrategy: DispatchStrategy;
}

export interface DispatchEvaluationResult {
  hits: RuleHit[];
  childrenToCreate: ChildToCreate[];
}

export interface HandlerCandidate {
  id: string;
  moduleCode: string;
  handlerId: string;
  weight: number;
  isBackup: boolean;
  isActive: boolean;
  rrCursorVersion: number;
}
