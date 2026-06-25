import Ajv, { ValidateFunction } from 'ajv';
import { BadRequestException, Injectable } from '@nestjs/common';
import { dispatchAstSchema } from './schemas/dispatch-ast.schema';
import { AstNode } from './types';

const MAX_LEAF_COUNT = 256;
const MAX_REGEX_LENGTH = 512;

@Injectable()
export class AstValidator {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  private readonly validator: ValidateFunction<AstNode> =
    this.ajv.compile<AstNode>(dispatchAstSchema);

  validate(ast: AstNode | null | Record<string, unknown>): void {
    if (ast === null) {
      return;
    }

    if (typeof ast === 'object' && Object.keys(ast).length === 0) {
      return;
    }

    const passed = this.validator(ast as AstNode);
    if (passed) {
      this.validateDepth(ast as AstNode, 0);
      this.validateLeafCount(ast as AstNode);
      return;
    }

    const errors = (this.validator.errors ?? []).map((item) => item.message).join('; ');
    throw new BadRequestException(`AST schema 校验失败: ${errors}`);
  }

  private validateDepth(node: AstNode, depth: number): void {
    if (depth > 10) {
      throw new BadRequestException('AST 嵌套层级不能超过 10 层');
    }

    if ('children' in node) {
      node.children.forEach((child) => this.validateDepth(child, depth + 1));
    }
  }

  private validateLeafCount(node: AstNode): void {
    const count = this.countLeaves(node);
    if (count > MAX_LEAF_COUNT) {
      throw new BadRequestException(`AST 叶子节点数不能超过 ${MAX_LEAF_COUNT}，当前: ${count}`);
    }
  }

  private countLeaves(node: AstNode): number {
    if ('children' in node) {
      return node.children.reduce((sum, child) => sum + this.countLeaves(child), 0);
    }

    if (node.op === 'REGEX') {
      const pattern = String(node.value ?? '');
      if (pattern.length > MAX_REGEX_LENGTH) {
        throw new BadRequestException(`REGEX pattern 长度不能超过 ${MAX_REGEX_LENGTH} 字符`);
      }
    }

    return 1;
  }
}
