import { describe, expect, it } from 'vitest';
import { createDefaultWorkflowDefinition, createWorkflow, getWorkflow, publishWorkflow, updateWorkflow } from './workflows';

describe('workflow configuration service mock contract', () => {
  it('persists definition_json including field bindings and publishes workflow', async () => {
    const created = await createWorkflow({
      name: '测试流程',
      order_type: 'onboarding',
      definition_json: createDefaultWorkflowDefinition(),
    });

    const nextDefinition = {
      nodes: [
        {
          id: 'start',
          type: 'start' as const,
          label: '开始',
          position: { x: 0, y: 0 },
          form_schema: { visible_fields: ['employee_name'], editable_fields: [], action_buttons: ['submit'] },
        },
        {
          id: 'data_entry',
          type: 'process' as const,
          label: '数据录入',
          module_code: 'data_entry',
          assignee_role: 'data_entry_leader',
          position: { x: 200, y: 0 },
          form_schema: { visible_fields: ['employee_name', 'id_card_no'], editable_fields: ['employee_name'], action_buttons: ['complete', 'return'] },
        },
        {
          id: 'end',
          type: 'end' as const,
          label: '结束',
          position: { x: 400, y: 0 },
          form_schema: { visible_fields: [], editable_fields: [], action_buttons: [] },
        },
      ],
      edges: [
        { id: 'start-data_entry', source: 'start', target: 'data_entry', condition: '提交后派发' },
        { id: 'data_entry-end', source: 'data_entry', target: 'end', condition: '办理完成' },
      ],
    };

    await updateWorkflow(created.id, { definition_json: nextDefinition });
    const saved = await getWorkflow(created.id);
    expect(saved.definition_json.nodes[1].form_schema?.visible_fields).toContain('id_card_no');
    expect(saved.definition_json.edges[1].condition).toBe('办理完成');

    const published = await publishWorkflow(created.id, saved.definition_json);
    expect(published.status).toBe('published');
    expect(published.definition_json.nodes).toHaveLength(3);
  });
});
