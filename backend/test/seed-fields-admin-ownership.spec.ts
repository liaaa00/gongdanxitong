import { FieldConfig, FieldType } from 'src/entities';
import { seedFields } from 'src/database/seeds/seed-fields';

describe('seedFields runtime configuration ownership', () => {
  it('does not overwrite administrator-managed fields while still creating missing defaults', async () => {
    const existingBaseSalary = Object.assign(new FieldConfig(), {
      id: 'base-salary-id',
      fieldCode: 'base_salary',
      fieldName: '管理员工资字段',
      fieldType: FieldType.TEXT,
      isRequired: true,
      defaultRequired: true,
      helpText: '管理员自定义提示',
      isActive: true,
    });
    const repository = {
      findOne: jest.fn(async ({ where }: { where: { fieldCode: string } }) => (
        where.fieldCode === 'base_salary' ? existingBaseSalary : null
      )),
      create: jest.fn((value: Partial<FieldConfig>) => Object.assign(new FieldConfig(), value)),
      save: jest.fn(async (value: FieldConfig) => value),
    };
    const dataSource = {
      getRepository: jest.fn(() => repository),
      query: jest.fn(async (sql: string) => (
        sql.includes('information_schema.columns') ? [{ column_name: 'collection_group' }] : []
      )),
    };

    await seedFields(dataSource as never);

    expect(repository.save).not.toHaveBeenCalledWith(existingBaseSalary);
    expect(existingBaseSalary).toMatchObject({
      fieldName: '管理员工资字段',
      fieldType: FieldType.TEXT,
      helpText: '管理员自定义提示',
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      fieldCode: 'probation_salary',
      fieldType: FieldType.TEXT,
    }));
  });
});
