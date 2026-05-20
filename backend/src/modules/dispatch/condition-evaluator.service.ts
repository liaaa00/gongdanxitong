import { Injectable } from '@nestjs/common';
import { safeRegexTest } from 'src/common/utils/regex-timeout';
import { AstEvaluateResult, AstEvalTrace, AstLeafOp, AstNode } from './types';

@Injectable()
export class ConditionEvaluatorService {
  async evaluate(
    ast: AstNode | null | Record<string, unknown>,
    fields: Record<string, unknown>,
  ): Promise<AstEvaluateResult> {
    if (ast === null || (typeof ast === 'object' && Object.keys(ast).length === 0)) {
      return {
        result: true,
        trace: {
          node: null,
          result: true,
          reason: 'empty ast treated as true',
        },
      };
    }

    return this.evaluateNode(ast as AstNode, fields);
  }

  private async evaluateNode(
    node: AstNode,
    fields: Record<string, unknown>,
  ): Promise<AstEvaluateResult> {
    if ('children' in node) {
      return this.evaluateGroup(node, fields);
    }

    return this.evaluateLeaf(node.field, node.op, node.value, fields);
  }

  private async evaluateGroup(
    node: Extract<AstNode, { children: AstNode[] }>,
    fields: Record<string, unknown>,
  ): Promise<AstEvaluateResult> {
    if (node.op === 'NOT') {
      const child = node.children[0];
      const childResult = await this.evaluateNode(child, fields);
      return {
        result: !childResult.result,
        trace: {
          node,
          result: !childResult.result,
          children: [childResult.trace],
        },
      };
    }

    const childTraces: AstEvalTrace[] = [];
    if (node.op === 'AND') {
      for (const child of node.children) {
        const childResult = await this.evaluateNode(child, fields);
        childTraces.push(childResult.trace);
        if (!childResult.result) {
          return { result: false, trace: { node, result: false, children: childTraces } };
        }
      }
      return { result: true, trace: { node, result: true, children: childTraces } };
    }

    for (const child of node.children) {
      const childResult = await this.evaluateNode(child, fields);
      childTraces.push(childResult.trace);
      if (childResult.result) {
        return { result: true, trace: { node, result: true, children: childTraces } };
      }
    }

    return { result: false, trace: { node, result: false, children: childTraces } };
  }

  private async evaluateLeaf(
    field: string,
    op: string,
    value: unknown,
    fields: Record<string, unknown>,
  ): Promise<AstEvaluateResult> {
    const current = fields[field];

    if (op === 'EXISTS') {
      const result = current !== undefined && current !== null && current !== '';
      return { result, trace: { node: { field, op, value }, result } };
    }

    if (this.isEmpty(current)) {
      return {
        result: false,
        trace: { node: { field, op: op as AstLeafOp, value }, result: false, reason: 'empty field treated as false' },
      };
    }

    let result = false;

    switch (op) {
      case 'EQ':
        result = current === value;
        break;
      case 'NEQ':
        result = current !== value;
        break;
      case 'IN':
        result = Array.isArray(value) && value.includes(current);
        break;
      case 'NOT_IN':
        result = Array.isArray(value) && !value.includes(current);
        break;
      case 'CONTAINS':
        result = String(current).includes(String(value));
        break;
      case 'GT':
        result = Number(current) > Number(value);
        break;
      case 'LT':
        result = Number(current) < Number(value);
        break;
      case 'GTE':
        result = Number(current) >= Number(value);
        break;
      case 'LTE':
        result = Number(current) <= Number(value);
        break;
      case 'REGEX':
        result = await safeRegexTest(String(current), String(value), 100);
        break;
      default:
        result = false;
    }

    return {
      result,
      trace: { node: { field, op: op as AstLeafOp, value }, result },
    };
  }

  private isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
  }
}
