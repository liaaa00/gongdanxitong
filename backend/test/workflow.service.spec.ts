import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessScope, InServiceOrderStatus, OrderType } from 'src/entities';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { WorkflowController } from 'src/modules/workflows/workflow.controller';
import { WorkflowDefinition, WorkflowDefinitionStatus } from 'src/modules/workflows/workflow.entity';
import { WorkflowService } from 'src/modules/workflows/workflow.service';

function createRepositoryMock(rows: WorkflowDefinition[] = []) {
  return {
    findAndCount: jest.fn(async () => [rows, rows.length]),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
    create: jest.fn((input: Partial<WorkflowDefinition>) => input as WorkflowDefinition),
    save: jest.fn(async (input: WorkflowDefinition) => ({ ...input, id: input.id ?? 'workflow-1' })),
    update: jest.fn(async () => ({ affected: 1 })),
    remove: jest.fn(async (input: WorkflowDefinition) => input),
  };
}

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return Object.assign(new WorkflowDefinition(), {
    id: 'workflow-1',
    name: 'Onboarding default flow',
    orderType: OrderType.ONBOARDING,
    flowKey: null,
    businessScope: BusinessScope.BEILUN,
    description: null,
    definitionJson: { nodes: [], edges: [] },
    publishedDefinitionJson: null,
    version: 0,
    publishedAt: null,
    status: WorkflowDefinitionStatus.DRAFT,
    createdBy: 'admin-1',
    createdAt: new Date('2026-05-20T00:00:00.000Z'),
    updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    ...overrides,
  });
}

describe('WorkflowService', () => {
  it('lists workflow definitions with pagination metadata', async () => {
    const rows = [makeWorkflow()];
    const repo = createRepositoryMock(rows);
    const service = new WorkflowService(repo as never);

    const result = await service.list({ page: 1, pageSize: 20, order_type: OrderType.ONBOARDING });

    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 0 }));
    expect(result).toEqual({ items: rows, total: 1, page: 1, pageSize: 20 });
  });

  it('creates draft workflow definitions with object definition_json', async () => {
    const repo = createRepositoryMock();
    const service = new WorkflowService(repo as never);

    const result = await service.create(
      { name: 'Flow', order_type: OrderType.ONBOARDING, definition_json: { nodes: [] } },
      { sub: 'admin-1', username: 'admin', roles: ['admin'] } as never,
    );

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      orderType: OrderType.ONBOARDING,
      definitionJson: { nodes: [] },
      status: WorkflowDefinitionStatus.DRAFT,
      createdBy: 'admin-1',
    }));
    expect(result.id).toBe('workflow-1');
  });

  it('updates editable workflow fields', async () => {
    const existing = makeWorkflow();
    const repo = createRepositoryMock([existing]);
    const service = new WorkflowService(repo as never);

    await service.update('workflow-1', { description: 'updated', definitionJson: { nodes: [{ id: 'n1' }] } });

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      description: 'updated',
      definitionJson: { nodes: [{ id: 'n1' }] },
    }));
  });

  it('publishes workflow definitions after validating definition_json', async () => {
    const existing = makeWorkflow({
      definitionJson: {
        nodes: [
          { id: 'start', type: 'start', label: '开始' },
          { id: 'end', type: 'end', label: '结束' },
        ],
        edges: [{ id: 'edge-1', source: 'start', target: 'end' }],
      },
    });
    const repo = createRepositoryMock([existing]);
    const service = new WorkflowService(repo as never);

    await service.publish('workflow-1', {});

    expect(repo.update).toHaveBeenCalledWith(
      { orderType: OrderType.ONBOARDING, businessScope: BusinessScope.BEILUN, status: WorkflowDefinitionStatus.PUBLISHED },
      { status: WorkflowDefinitionStatus.DRAFT },
    );
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: WorkflowDefinitionStatus.PUBLISHED,
      version: 1,
      publishedDefinitionJson: existing.definitionJson,
    }));
    expect(existing.publishedDefinitionJson).not.toBe(existing.definitionJson);
  });

  it('publishes a flow-key draft as the next isolated snapshot version', async () => {
    const editingDefinition = {
      nodes: [
        { id: 'start', type: 'start', label: '开始' },
        { id: 'end', type: 'end', label: '结束' },
      ],
      edges: [{ id: 'edge-1', source: 'start', target: 'end' }],
      status_transitions: {
        [InServiceOrderStatus.DISPATCHED]: [InServiceOrderStatus.ACCEPTED],
      },
    };
    const previousSnapshot = { ...editingDefinition, status_transitions: {} };
    const existing = makeWorkflow({
      orderType: null,
      flowKey: 'certificate',
      definitionJson: editingDefinition,
      publishedDefinitionJson: previousSnapshot,
      version: 1,
      status: WorkflowDefinitionStatus.PUBLISHED,
    });
    const repo = createRepositoryMock([existing]);
    const service = new WorkflowService(repo as never);

    await service.publish('workflow-1', {});

    expect(repo.update).not.toHaveBeenCalled();
    expect(existing.version).toBe(2);
    expect(existing.publishedDefinitionJson).toEqual(editingDefinition);
    expect(existing.publishedDefinitionJson).not.toBe(editingDefinition);
    expect(existing.publishedDefinitionJson).not.toBe(previousSnapshot);
  });

  it('rejects non-object definition_json payloads', async () => {
    const repo = createRepositoryMock();
    const service = new WorkflowService(repo as never);

    await expect(service.create(
      { name: 'Flow', orderType: OrderType.ONBOARDING, definitionJson: [] as never },
      { sub: 'admin-1' } as never,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks workflow controller routes as admin only', () => {
    const reflector = new Reflector();

    expect(reflector.get<string[]>(ROLES_KEY, WorkflowController)).toEqual(['admin']);
  });
});
