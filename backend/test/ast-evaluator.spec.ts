import { HttpException } from '@nestjs/common';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { AstNode } from 'src/modules/dispatch-engine/dispatch-engine.types';

describe('AstEvaluator unit tests', () => {
  let evaluator: AstEvaluator;

  beforeEach(() => {
    evaluator = new AstEvaluator();
  });

  it('treats null and empty object as true', async () => {
    expect((await evaluator.evaluate(null, {})).result).toBe(true);
    expect((await evaluator.evaluate({}, {})).result).toBe(true);
  });

  it('evaluates empty AND as true and empty OR as false', async () => {
    expect((await evaluator.evaluate({ op: 'AND', children: [] }, {})).result).toBe(true);
    expect((await evaluator.evaluate({ op: 'OR', children: [] }, {})).result).toBe(false);
  });

  it('evaluates EQ and NEQ leaves', async () => {
    expect((await evaluator.evaluate({ field: 'need_contract', op: 'EQ', value: '是' }, { need_contract: '是' })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'need_contract', op: 'NEQ', value: '是' }, { need_contract: '否' })).result).toBe(true);
  });

  it('evaluates IN and NOT_IN leaves', async () => {
    expect((await evaluator.evaluate({ field: 'city', op: 'IN', value: ['宁波', '杭州'] }, { city: '宁波' })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'city', op: 'NOT_IN', value: ['上海'] }, { city: '宁波' })).result).toBe(true);
  });

  it('evaluates CONTAINS for strings and arrays', async () => {
    expect((await evaluator.evaluate({ field: 'remark', op: 'CONTAINS', value: '加急' }, { remark: '需要加急办理' })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'tags', op: 'CONTAINS', value: '社保' }, { tags: ['合同', '社保'] })).result).toBe(true);
  });

  it('evaluates numeric comparisons', async () => {
    expect((await evaluator.evaluate({ field: 'age', op: 'GT', value: 18 }, { age: 20 })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'age', op: 'LT', value: 60 }, { age: 20 })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'age', op: 'GTE', value: 20 }, { age: 20 })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'age', op: 'LTE', value: 20 }, { age: 20 })).result).toBe(true);
  });

  it('evaluates date comparisons', async () => {
    expect((await evaluator.evaluate({ field: 'start_date', op: 'GTE', value: '2026-05-01' }, { start_date: '2026-05-11' })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'start_date', op: 'LT', value: '2026-06-01' }, { start_date: '2026-05-11' })).result).toBe(true);
  });

  it('evaluates EXISTS and treats empty non-EXISTS field as false', async () => {
    expect((await evaluator.evaluate({ field: 'mobile', op: 'EXISTS' }, { mobile: '13800000000' })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'mobile', op: 'EXISTS' }, { mobile: '' })).result).toBe(false);
    expect((await evaluator.evaluate({ field: 'mobile', op: 'EQ', value: '13800000000' }, {})).result).toBe(false);
  });

  it('evaluates REGEX with timeout protection', async () => {
    expect((await evaluator.evaluate({ field: 'email', op: 'REGEX', value: '^.+@.+$' }, { email: 'a@example.com' })).result).toBe(true);
    const start = Date.now();
    const result = await evaluator.evaluate({ field: 'x', op: 'REGEX', value: '(a+)+$' }, { x: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab' });
    expect(Date.now() - start).toBeLessThan(500);
    expect(typeof result.result).toBe('boolean');
  }, 1000);

  it('short-circuits AND and OR and records trace', async () => {
    const andResult = await evaluator.evaluate({
      op: 'AND',
      children: [
        { field: 'a', op: 'EQ', value: '1' },
        { field: 'b', op: 'EQ', value: '2' },
      ],
    }, { a: 'x', b: '2' });
    expect(andResult.result).toBe(false);
    expect(andResult.trace.shortCircuited).toBe(true);
    expect(andResult.trace.children).toHaveLength(1);

    const orResult = await evaluator.evaluate({
      op: 'OR',
      children: [
        { field: 'a', op: 'EQ', value: '1' },
        { field: 'b', op: 'EQ', value: '2' },
      ],
    }, { a: '1', b: 'x' });
    expect(orResult.result).toBe(true);
    expect(orResult.trace.shortCircuited).toBe(true);
    expect(orResult.trace.children).toHaveLength(1);
  });

  it('evaluates NOT node', async () => {
    const result = await evaluator.evaluate({ op: 'NOT', child: { field: 'a', op: 'EQ', value: '1' } }, { a: '2' });
    expect(result.result).toBe(true);
    expect(result.trace.op).toBe('NOT');
  });

  it('rejects nesting depth greater than 10', async () => {
    let node: AstNode = { field: 'a', op: 'EQ', value: '1' };
    for (let index = 0; index < 11; index += 1) {
      node = { op: 'NOT', child: node };
    }
    await expect(evaluator.evaluate(node, { a: '1' })).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects more than 256 leaves', async () => {
    const children: AstNode[] = Array.from({ length: 257 }, (_, index) => ({
      field: `f${index}`,
      op: 'EXISTS',
    }));
    await expect(evaluator.evaluate({ op: 'AND', children }, Object.fromEntries(children.map((child, index) => [`f${index}`, 'x'])))).rejects.toBeInstanceOf(HttpException);
  });
});
