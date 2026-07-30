export type AstLogicalOp = 'AND' | 'OR' | 'NOT';
export type AstLeafOp =
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

export interface AstLeafNode {
  field: string;
  op: AstLeafOp;
  value?: unknown;
}

export interface AstGroupNode {
  op: AstLogicalOp;
  children: AstNode[];
}

export type AstNode = AstLeafNode | AstGroupNode;

export interface AstEvalTrace {
  node: AstNode | null;
  result: boolean;
  reason?: string;
  children?: AstEvalTrace[];
}

export interface AstEvaluateResult {
  result: boolean;
  trace: AstEvalTrace;
}
