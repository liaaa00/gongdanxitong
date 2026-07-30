import { ConditionEvaluatorService } from 'src/modules/dispatch/condition-evaluator.service';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { DispatchStrategy } from 'src/entities';
import { HandlerCandidate } from 'src/modules/dispatch-engine/dispatch-engine.types';

describe('ConditionEvaluator unit tests', () => {
  let evaluator: ConditionEvaluatorService;

  beforeEach(() => {
    evaluator = new ConditionEvaluatorService();
  });

  it('treats null AST as always true', async () => {
    const result = await evaluator.evaluate(null, {});
    expect(result.result).toBe(true);
    expect(result.trace.reason).toBe('empty ast treated as true');
  });

  it('treats empty object AST as always true', async () => {
    const result = await evaluator.evaluate({}, {});
    expect(result.result).toBe(true);
  });

  it('evaluates EQ condition — match', async () => {
    const ast = { field: 'need_onboarding_contact', op: 'EQ' as const, value: '是' };
    const result = await evaluator.evaluate(ast, { need_onboarding_contact: '是' });
    expect(result.result).toBe(true);
  });

  it('evaluates EQ condition — no match', async () => {
    const ast = { field: 'need_onboarding_contact', op: 'EQ' as const, value: '是' };
    const result = await evaluator.evaluate(ast, { need_onboarding_contact: '否' });
    expect(result.result).toBe(false);
  });

  it('evaluates AND condition — both true', async () => {
    const ast = {
      op: 'AND' as const,
      children: [
        { field: 'a', op: 'EQ' as const, value: '1' },
        { field: 'b', op: 'EQ' as const, value: '2' },
      ],
    };
    const result = await evaluator.evaluate(ast, { a: '1', b: '2' });
    expect(result.result).toBe(true);
  });

  it('evaluates AND condition — short-circuits on first false', async () => {
    const ast = {
      op: 'AND' as const,
      children: [
        { field: 'a', op: 'EQ' as const, value: '1' },
        { field: 'b', op: 'EQ' as const, value: '2' },
      ],
    };
    const result = await evaluator.evaluate(ast, { a: 'x', b: '2' });
    expect(result.result).toBe(false);
  });

  it('evaluates OR condition — first true wins', async () => {
    const ast = {
      op: 'OR' as const,
      children: [
        { field: 'a', op: 'EQ' as const, value: '1' },
        { field: 'b', op: 'EQ' as const, value: '2' },
      ],
    };
    const result = await evaluator.evaluate(ast, { a: '1', b: 'x' });
    expect(result.result).toBe(true);
  });

  it('evaluates NOT condition', async () => {
    const ast = {
      op: 'NOT' as const,
      children: [{ field: 'a', op: 'EQ' as const, value: '1' }],
    };
    const result = await evaluator.evaluate(ast, { a: '2' });
    expect(result.result).toBe(true);
  });

  it('evaluates IN condition', async () => {
    const ast = { field: 'status', op: 'IN' as const, value: ['a', 'b', 'c'] };
    expect((await evaluator.evaluate(ast, { status: 'b' })).result).toBe(true);
    expect((await evaluator.evaluate(ast, { status: 'd' })).result).toBe(false);
  });

  it('evaluates NOT_IN condition', async () => {
    const ast = { field: 'status', op: 'NOT_IN' as const, value: ['a', 'b'] };
    expect((await evaluator.evaluate(ast, { status: 'c' })).result).toBe(true);
    expect((await evaluator.evaluate(ast, { status: 'a' })).result).toBe(false);
  });

  it('evaluates GT/LT/GTE/LTE conditions', async () => {
    expect((await evaluator.evaluate({ field: 'n', op: 'GT' as const, value: 5 }, { n: 6 })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'n', op: 'GT' as const, value: 5 }, { n: 5 })).result).toBe(false);
    expect((await evaluator.evaluate({ field: 'n', op: 'GTE' as const, value: 5 }, { n: 5 })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'n', op: 'LT' as const, value: 5 }, { n: 4 })).result).toBe(true);
    expect((await evaluator.evaluate({ field: 'n', op: 'LTE' as const, value: 5 }, { n: 5 })).result).toBe(true);
  });

  it('evaluates EXISTS condition', async () => {
    const ast = { field: 'x', op: 'EXISTS' as const };
    expect((await evaluator.evaluate(ast, { x: 'value' })).result).toBe(true);
    expect((await evaluator.evaluate(ast, {})).result).toBe(false);
    expect((await evaluator.evaluate(ast, { x: '' })).result).toBe(false);
  });

  it('returns false for empty field on non-EXISTS operators', async () => {
    const ast = { field: 'x', op: 'EQ' as const, value: 'something' };
    expect((await evaluator.evaluate(ast, {})).result).toBe(false);
    expect((await evaluator.evaluate(ast, { x: null })).result).toBe(false);
    expect((await evaluator.evaluate(ast, { x: '' })).result).toBe(false);
  });

  it('protects REGEX evaluation from ReDoS — returns false on timeout', async () => {
    const ast = { field: 'x', op: 'REGEX' as const, value: '(a+)+$' };
    const start = Date.now();
    const result = await evaluator.evaluate(ast, { x: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(typeof result.result).toBe('boolean');
  }, 1000);
});

describe('HandlerPickerService.pickFromCandidates unit tests', () => {
  let picker: HandlerPickerService;

  beforeEach(() => {
    picker = new HandlerPickerService();
  });

  const makeCandidate = (overrides: Partial<HandlerCandidate>): HandlerCandidate => ({
    id: 'id-1',
    moduleCode: 'mod',
    handlerId: 'h1',
    weight: 1,
    isBackup: false,
    isActive: true,
    rrCursorVersion: 0,
    ...overrides,
  });

  it('fixed picks the primary handler with highest weight', () => {
    const candidates = [
      makeCandidate({ id: 'id-1', handlerId: 'h1', weight: 2 }),
      makeCandidate({ id: 'id-2', handlerId: 'h2', weight: 1 }),
    ];
    expect(picker.pickFromCandidates(DispatchStrategy.FIXED, 'mod', candidates)).toBe('h1');
  });

  it('fixed falls back to backup when no primary', () => {
    const candidates = [
      makeCandidate({ id: 'id-1', handlerId: 'backup1', isBackup: true, weight: 1 }),
    ];
    expect(picker.pickFromCandidates(DispatchStrategy.FIXED, 'mod', candidates)).toBe('backup1');
  });

  it('fixed returns null when no candidates', () => {
    expect(picker.pickFromCandidates(DispatchStrategy.FIXED, 'mod', [])).toBeNull();
  });

  it('skips handlers whose user account is inactive', async () => {
    const moduleHandlerRepository = {
      find: jest.fn(async () => [
        { id: 'id-1', moduleCode: 'mod', handlerId: 'former', weight: 10, isBackup: false, isActive: true, handler: { isActive: false } },
        { id: 'id-2', moduleCode: 'mod', handlerId: 'active', weight: 1, isBackup: false, isActive: true, handler: { isActive: true } },
      ]),
    };
    const repositoryPicker = new HandlerPickerService(moduleHandlerRepository as never, {} as never);

    await expect(repositoryPicker.pick(DispatchStrategy.FIXED, 'mod')).resolves.toBe('active');
  });

  it('pool always returns null', () => {
    const candidates = [makeCandidate({ handlerId: 'h1' })];
    expect(picker.pickFromCandidates(DispatchStrategy.POOL, 'mod', candidates)).toBeNull();
  });

  it('load_balance picks handler with minimum open count', () => {
    const candidates = [
      makeCandidate({ id: 'id-1', handlerId: 'h1' }),
      makeCandidate({ id: 'id-2', handlerId: 'h2' }),
      makeCandidate({ id: 'id-3', handlerId: 'h3' }),
    ];
    const loadMap = new Map([['h1', 5], ['h2', 2], ['h3', 8]]);
    expect(picker.pickFromCandidates(DispatchStrategy.LOAD_BALANCE, 'mod', candidates, loadMap)).toBe('h2');
  });

  it('load_balance treats missing load as 0', () => {
    const candidates = [
      makeCandidate({ id: 'id-1', handlerId: 'h1' }),
      makeCandidate({ id: 'id-2', handlerId: 'h2' }),
    ];
    const loadMap = new Map([['h1', 3]]);
    expect(picker.pickFromCandidates(DispatchStrategy.LOAD_BALANCE, 'mod', candidates, loadMap)).toBe('h2');
  });

  it('round_robin rotates among active handlers using rrCursorVersion', () => {
    const candidates = [
      makeCandidate({ id: 'id-1', handlerId: 'h1', rrCursorVersion: 0 }),
      makeCandidate({ id: 'id-2', handlerId: 'h2', rrCursorVersion: 0 }),
    ];

    expect(picker.pickFromCandidates(DispatchStrategy.ROUND_ROBIN, 'mod', candidates)).toBe('h1');
    candidates[0].rrCursorVersion += 1;
    expect(picker.pickFromCandidates(DispatchStrategy.ROUND_ROBIN, 'mod', candidates)).toBe('h2');
    candidates[1].rrCursorVersion += 1;
    expect(picker.pickFromCandidates(DispatchStrategy.ROUND_ROBIN, 'mod', candidates)).toBe('h1');
  });

  it('round_robin respects weight for distribution', () => {
    const candidates = [
      makeCandidate({ id: 'id-1', handlerId: 'h1', weight: 3, rrCursorVersion: 0 }),
      makeCandidate({ id: 'id-2', handlerId: 'h2', weight: 1, rrCursorVersion: 0 }),
    ];
    const picks: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const picked = picker.pickFromCandidates(DispatchStrategy.ROUND_ROBIN, 'mod', candidates);
      if (picked) {
        picks.push(picked);
        const winner = candidates.find((candidate) => candidate.handlerId === picked);
        if (winner) winner.rrCursorVersion += 1;
      }
    }
    expect(picks).toEqual(['h1', 'h1', 'h1', 'h2']);
  });
});
