import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestPost = vi.hoisted(() => vi.fn());
const requestPut = vi.hoisted(() => vi.fn());

vi.mock('./request', () => ({
  default: {
    post: requestPost,
    put: requestPut,
  },
}));

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: <T>(value: T) => Promise.resolve(value),
}));

describe('field service request contract', () => {
  beforeEach(() => {
    requestPost.mockReset();
    requestPut.mockReset();
  });

  it('keeps fieldCode on create requests', async () => {
    requestPost.mockResolvedValueOnce({ id: 'field-1' });
    const { createField } = await import('./fields');

    await createField({
      field_code: 'custom_salary',
      field_name: '自定义工资',
      field_type: 'text',
      is_required: false,
    });

    expect(requestPost).toHaveBeenCalledWith('/admin/fields', expect.objectContaining({
      fieldCode: 'custom_salary',
      fieldName: '自定义工资',
      fieldType: 'text',
    }));
  });

  it('never sends the immutable fieldCode on update requests', async () => {
    requestPut.mockResolvedValueOnce({ id: 'field-1' });
    const { updateField } = await import('./fields');

    await updateField('field-1', {
      field_code: 'base_salary',
      field_name: '基本工资',
      field_type: 'text',
      is_required: true,
    });

    expect(requestPut).toHaveBeenCalledWith('/admin/fields/field-1', expect.objectContaining({
      fieldName: '基本工资',
      fieldType: 'text',
      isRequired: true,
    }));
    expect(requestPut.mock.calls[0][1]).not.toHaveProperty('fieldCode');
  });
});
