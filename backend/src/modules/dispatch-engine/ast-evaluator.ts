import { HttpStatus, Injectable } from '@nestjs/common';
import { businessException } from 'src/common/exceptions/business-exception';
import { safeRegexTest } from 'src/common/utils/regex-timeout';
import {
  AstEvaluateResult,
  AstEvalTrace,
  AstNode,
  AstScalar,
  AstValue,
  LeafNode,
  LeafOp,
} from './dispatch-engine.types';

const LOGICAL_OPS = new Set(['AND', 'OR', 'NOT']);
const LEAF_OPS = new Set<LeafOp>([
  'EQ',
  'NEQ',
  'IN',
  'NOT_IN',
  'CONTAINS',
  'GT',
  'LT',
  'GTE',
  'LTE',
  'EXISTS',
  'REGEX',
]);
const MAX_DEPTH = 10;
const MAX_LEAVES = 256;

interface EvalState {
  leafCount: number;
}

@Injectable()
export class AstEvaluator {
  async evaluate(
    ast: AstNode | Record<string, unknown> | null,
    fields: Record<string, unknown>,
  ): Promise<AstEvaluateResult> {
    if (ast === null || this.isEmptyObject(ast)) {
      return { result: true, trace: { op: 'NOOP', result: true } };
    }

    const normalized = this.normalizeLegacyAst(ast);
    return this.walk(normalized, fields, 0, { leafCount: 0 });
  }

  private async walk(
    node: AstNode,
    fields: Record<string, unknown>,
    depth: number,
    state: EvalState,
  ): Promise<AstEvaluateResult> {
    if (depth > MAX_DEPTH) {
      throw businessException(3003, HttpStatus.BAD_REQUEST, 'AST nesting depth exceeds 10');
    }

    if (this.isAndNode(node)) {
      return this.evalAnd(node.children, fields, depth, state);
    }
    if (this.isOrNode(node)) {
      return this.evalOr(node.children, fields, depth, state);
    }
    if (this.isNotNode(node)) {
      const inner = await this.walk(node.child, fields, depth + 1, state);
      return {
        result: !inner.result,
        trace: { op: 'NOT', result: !inner.result, children: [inner.trace] },
      };
    }
    if (this.isLeafNode(node)) {
      state.leafCount += 1;
      if (state.leafCount > MAX_LEAVES) {
        throw businessException(3003, HttpStatus.BAD_REQUEST, 'AST leaf count exceeds 256');
      }
      return this.evalLeaf(node, fields);
    }

    throw businessException(3003, HttpStatus.BAD_REQUEST, 'Invalid AST node');
  }

  private async evalAnd(
    children: AstNode[],
    fields: Record<string, unknown>,
    depth: number,
    state: EvalState,
  ): Promise<AstEvaluateResult> {
    if (children.length === 0) {
      return { result: true, trace: { op: 'AND', result: true, children: [] } };
    }

    const traces: AstEvalTrace[] = [];
    for (const child of children) {
      const result = await this.walk(child, fields, depth + 1, state);
      traces.push(result.trace);
      if (!result.result) {
        return {
          result: false,
          trace: { op: 'AND', result: false, children: traces, shortCircuited: true },
        };
      }
    }

    return { result: true, trace: { op: 'AND', result: true, children: traces } };
  }

  private async evalOr(
    children: AstNode[],
    fields: Record<string, unknown>,
    depth: number,
    state: EvalState,
  ): Promise<AstEvaluateResult> {
    if (children.length === 0) {
      return { result: false, trace: { op: 'OR', result: false, children: [] } };
    }

    const traces: AstEvalTrace[] = [];
    for (const child of children) {
      const result = await this.walk(child, fields, depth + 1, state);
      traces.push(result.trace);
      if (result.result) {
        return {
          result: true,
          trace: { op: 'OR', result: true, children: traces, shortCircuited: true },
        };
      }
    }

    return { result: false, trace: { op: 'OR', result: false, children: traces } };
  }

  private async evalLeaf(
    leaf: LeafNode,
    fields: Record<string, unknown>,
  ): Promise<AstEvaluateResult> {
    const raw = fields[leaf.field];
    const present = this.isPresent(raw);

    if (leaf.op === 'EXISTS') {
      return this.leafResult(leaf, present, raw);
    }

    if (!present) {
      return this.leafResult(leaf, false, raw, 'empty');
    }

    switch (leaf.op) {
      case 'EQ':
      case 'NEQ': {
        const ok = this.scalarEquals(raw, leaf.value);
        return this.leafResult(leaf, leaf.op === 'EQ' ? ok : !ok, raw);
      }
      case 'IN':
      case 'NOT_IN': {
        const ok = Array.isArray(leaf.value)
          ? leaf.value.some((candidate) => this.scalarEquals(raw, candidate))
          : false;
        return this.leafResult(leaf, leaf.op === 'IN' ? ok : !ok, raw);
      }
      case 'CONTAINS': {
        const expected = this.toDisplayValue(leaf.value);
        const ok = Array.isArray(raw)
          ? raw.some((item) => this.scalarEquals(item, leaf.value))
          : String(raw).includes(expected);
        return this.leafResult(leaf, ok, raw);
      }
      case 'GT':
      case 'LT':
      case 'GTE':
      case 'LTE': {
        const pair = this.toComparablePair(raw, leaf.value);
        if (!pair) {
          return this.leafResult(leaf, false, raw, 'incomparable');
        }
        const [left, right] = pair;
        const ok = this.compare(left, right, leaf.op);
        return this.leafResult(leaf, ok, raw);
      }
      case 'REGEX': {
        const ok = await safeRegexTest(String(raw), this.toDisplayValue(leaf.value), 100);
        return this.leafResult(leaf, ok, raw);
      }
      default:
        return this.leafResult(leaf, false, raw, 'unsupported_op');
    }
  }

  private leafResult(
    leaf: LeafNode,
    result: boolean,
    value: unknown,
    reason?: string,
  ): AstEvaluateResult {
    const trace: AstEvalTrace = {
      op: leaf.op,
      result,
      field: leaf.field,
      value,
      expected: leaf.value,
    };
    if (reason) {
      trace.reason = reason;
    }
    return { result, trace };
  }

  private normalizeLegacyAst(input: AstNode | Record<string, unknown>): AstNode {
    const record = input as Record<string, unknown>;
    if (typeof record.operator === 'string') {
      const operator = record.operator.toUpperCase();
      if (operator === 'AND' || operator === 'OR') {
        const rawChildren = Array.isArray(record.conditions) ? record.conditions : [];
        return {
          op: operator,
          children: rawChildren.map((child) => this.normalizeLegacyAst(child as Record<string, unknown>)),
        };
      }
      const field = typeof record.field === 'string' ? record.field : '';
      return {
        field,
        op: this.normalizeLegacyLeafOp(record.operator),
        value: this.asAstValue(record.value),
      };
    }
    return input as AstNode;
  }

  private normalizeLegacyLeafOp(op: unknown): LeafOp {
    const text = String(op).toUpperCase();
    if (text === 'EQ') return 'EQ';
    if (text === 'NEQ' || text === 'NOT_EQ') return 'NEQ';
    if (text === 'IN') return 'IN';
    if (text === 'NOT_IN') return 'NOT_IN';
    if (text === 'CONTAINS') return 'CONTAINS';
    if (text === 'GT') return 'GT';
    if (text === 'LT') return 'LT';
    if (text === 'GTE') return 'GTE';
    if (text === 'LTE') return 'LTE';
    if (text === 'EXISTS') return 'EXISTS';
    if (text === 'REGEX') return 'REGEX';
    return 'EQ';
  }

  private isAndNode(node: AstNode): node is AstNode & { op: 'AND'; children: AstNode[] } {
    return this.hasOp(node, 'AND') && Array.isArray((node as { children?: unknown }).children);
  }

  private isOrNode(node: AstNode): node is AstNode & { op: 'OR'; children: AstNode[] } {
    return this.hasOp(node, 'OR') && Array.isArray((node as { children?: unknown }).children);
  }

  private isNotNode(node: AstNode): node is AstNode & { op: 'NOT'; child: AstNode } {
    const candidate = node as { op?: unknown; child?: unknown; children?: unknown };
    if (candidate.op !== 'NOT') return false;
    if (candidate.child) return true;
    if (Array.isArray(candidate.children) && candidate.children.length > 0) {
      candidate.child = candidate.children[0];
      return true;
    }
    return false;
  }

  private isLeafNode(node: AstNode): node is LeafNode {
    const candidate = node as { field?: unknown; op?: unknown };
    return (
      typeof candidate.field === 'string' &&
      typeof candidate.op === 'string' &&
      !LOGICAL_OPS.has(candidate.op) &&
      LEAF_OPS.has(candidate.op as LeafOp)
    );
  }

  private hasOp(node: AstNode, op: 'AND' | 'OR'): boolean {
    return (node as { op?: unknown }).op === op;
  }

  private isEmptyObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
  }

  private isPresent(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private scalarEquals(left: unknown, right: unknown): boolean {
    const normalizedLeft = this.normalizeScalar(left);
    const normalizedRight = this.normalizeScalar(right);
    return normalizedLeft === normalizedRight;
  }

  private normalizeScalar(value: unknown): AstScalar {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value;
    return String(value);
  }

  private asAstValue(value: unknown): AstValue | undefined {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeScalar(item));
    }
    if (value === undefined) return undefined;
    return this.normalizeScalar(value);
  }

  private toDisplayValue(value: unknown): string {
    const normalized = this.normalizeScalar(value);
    return normalized === null ? '' : String(normalized);
  }

  private toComparablePair(left: unknown, right: unknown): [number | string, number | string] | null {
    const leftNumber = this.toNumber(left);
    const rightNumber = this.toNumber(right);
    if (leftNumber !== null && rightNumber !== null) {
      return [leftNumber, rightNumber];
    }

    const leftDate = this.toDateKey(left);
    const rightDate = this.toDateKey(right);
    if (leftDate !== null && rightDate !== null) {
      return [leftDate, rightDate];
    }

    return null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
  }

  private toDateKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  }

  private compare(left: number | string, right: number | string, op: LeafOp): boolean {
    if (op === 'GT') return left > right;
    if (op === 'LT') return left < right;
    if (op === 'GTE') return left >= right;
    if (op === 'LTE') return left <= right;
    return false;
  }
}
