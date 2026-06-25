import { describe, expect, it } from 'vitest';
import { getNotificationDisplayContent, getNotificationFieldLabel, getNotificationOperatorName, localizeNotificationInternalKeys } from './index';

describe('notification operator display helpers', () => {
  it('uses real actorName instead of generic 办理人 prefix', () => {
    const item = {
      id: 'n-actor',
      type: 'field_changed',
      biz_type: 'field_changed',
      priority: 'normal' as const,
      title: '字段修改',
      content: '办理人：修改了客户名称',
      entity_type: 'work_order',
      entity_id: 'wo-1',
      link: '/work-orders/wo-1',
      is_read: false,
      created_at: '2026-05-25T00:00:00.000Z',
      actorName: '张三',
    };

    expect(getNotificationOperatorName(item)).toBe('张三');
    expect(getNotificationDisplayContent(item)).toBe('张三：修改了客户名称');
    expect(getNotificationDisplayContent(item)).not.toContain('办理人：');
  });

  it('falls back across operator/user nested fields and ignores generic names', () => {
    expect(getNotificationOperatorName({ content: 'x', operatorName: '办理人', user: { realName: '李四' } } as any)).toBe('李四');
    expect(getNotificationOperatorName({ content: 'x', metadata: { userName: '王五' } } as any)).toBe('王五');
    expect(getNotificationDisplayContent({ content: '办理人：已退回', operatorName: '办理人' } as any)).toBe('已退回');
  });

  it('replaces generic operator words inside content when a real name exists', () => {
    const content = getNotificationDisplayContent({ content: '子工单已由办理人退回', operatorName: '赵六' } as any);

    expect(content).toBe('子工单已由赵六退回');
    expect(content).not.toContain('办理人');
  });

  it('localizes known internal field keys in legacy notification content', () => {
    expect(getNotificationFieldLabel('contract_feedback')).toBe('劳动合同新签反馈');
    expect(localizeNotificationInternalKeys('杨纯 修改了 contract_feedback')).toBe('杨纯 修改了 劳动合同新签反馈');
    expect(getNotificationDisplayContent({ content: '杨纯 修改了 contract_feedback' } as any)).toBe('杨纯 修改了 劳动合同新签反馈');
    expect(getNotificationDisplayContent({ content: '杨纯 修改了 contract_feedback' } as any)).not.toContain('contract_feedback');
  });

  it('builds readable Chinese content from single field payload values', () => {
    const content = getNotificationDisplayContent({
      content: '杨纯 修改了 contract_feedback',
      actorName: '杨纯',
      entity: 'contract',
      action: 'update',
      field: 'contract_feedback',
      oldValue: '待确认',
      newValue: '已完成签订',
    } as any);

    expect(content).toBe('杨纯 修改了【劳动合同新签】：【劳动合同新签反馈】由【待确认】改为【已完成签订】');
    expect(content).not.toContain('contract_feedback');
  });

  it('builds readable Chinese content from changes arrays in payload bags', () => {
    const content = getNotificationDisplayContent({
      content: '办理人：修改了字段',
      metadata: {
        actorName: '杨纯',
        entity: 'dispatched_order',
        action: 'modified',
        changes: [
          { field_code: 'contract_feedback', old_value: '', new_value: '补充合同签订情况' },
        ],
      },
    } as any);

    expect(content).toBe('杨纯 修改了【子工单】：【劳动合同新签反馈】由【空】改为【补充合同签订情况】');
    expect(content).not.toContain('contract_feedback');
  });

  it('prefers backend diff_summary and localizes internal keys inside it', () => {
    const content = getNotificationDisplayContent({
      content: '杨纯 修改了 contract_feedback',
      actorName: '杨纯',
      diff_summary: 'contract_feedback：待确认 → 已完成签订',
    } as any);

    expect(content).toBe('杨纯 修改了：劳动合同新签反馈：待确认 → 已完成签订');
    expect(content).not.toContain('contract_feedback');
  });

  it('builds readable Chinese content from payload.diff object values', () => {
    const content = getNotificationDisplayContent({
      content: '杨纯 修改了 contract_feedback',
      actorName: '杨纯',
      payload: {
        entity: 'contract',
        action: 'modified',
        diff: {
          contract_feedback: { oldValue: '待确认', newValue: '已完成签订' },
        },
      },
    } as any);

    expect(content).toBe('杨纯 修改了【劳动合同新签】：【劳动合同新签反馈】由【待确认】改为【已完成签订】');
    expect(content).not.toContain('contract_feedback');
  });

  it('builds readable Chinese content from backend payload.diff array with before/after values', () => {
    const content = getNotificationDisplayContent({
      content: '杨纯 修改了 contract_feedback',
      actorName: '杨纯',
      payload: {
        entity: 'contract',
        action: 'modified',
        diff: [
          { field: 'contract_feedback', before: '待确认', after: '已完成签订' },
        ],
      },
    } as any);

    expect(content).toBe('杨纯 修改了【劳动合同新签】：【劳动合同新签反馈】由【待确认】改为【已完成签订】');
    expect(content).not.toContain('contract_feedback');
  });

  it('builds readable Chinese content from diff_fields and diffFields arrays', () => {
    const snakeCaseContent = getNotificationDisplayContent({
      content: '杨纯 修改了 contract_feedback',
      actorName: '杨纯',
      entity_type: 'dispatched_order',
      action: 'update',
      diff_fields: [
        { field_code: 'contract_feedback', field_name: 'contract_feedback', old_value: '无', new_value: '已反馈' },
      ],
    } as any);
    const camelCaseContent = getNotificationDisplayContent({
      content: '杨纯 修改了 contract_feedback',
      actorName: '杨纯',
      entity: 'dispatched_order',
      action: 'update',
      diffFields: [
        { fieldCode: 'contract_feedback', oldValue: '无', newValue: '已反馈' },
      ],
    } as any);

    expect(snakeCaseContent).toBe('杨纯 修改了【子工单】：【劳动合同新签反馈】由【无】改为【已反馈】');
    expect(camelCaseContent).toBe('杨纯 修改了【子工单】：【劳动合同新签反馈】由【无】改为【已反馈】');
    expect(snakeCaseContent).not.toContain('contract_feedback');
    expect(camelCaseContent).not.toContain('contract_feedback');
  });

  it('does not expose unknown snake_case keys to notification UI', () => {
    const content = getNotificationDisplayContent({ content: '杨纯 修改了 very_internal_key' } as any);

    expect(content).toBe('杨纯 修改了 相关字段');
    expect(content).not.toContain('very_internal_key');
  });
});
