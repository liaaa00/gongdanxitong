import { FieldConfig, FieldType, OrderType } from 'src/entities';
import { FieldsService } from 'src/modules/admin/fields/fields.service';

function qbMock(rows: FieldConfig[]) {
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(async () => [rows, rows.length]),
  };
  return qb;
}

describe('FieldsService', () => {
  it('returns collection_group for onboarding field list responses', async () => {
    const row = Object.assign(new FieldConfig(), {
      id: 'field-1',
      fieldCode: 'employee_name',
      fieldName: '姓名',
      fieldType: FieldType.TEXT,
      isRequired: true,
      defaultRequired: true,
      collectionGroup: '基本信息',
      orderType: OrderType.ONBOARDING,
      businessContext: [OrderType.ONBOARDING],
      displayOrder: 1,
      isActive: true,
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    const qb = qbMock([row]);
    const fieldRepo = { createQueryBuilder: jest.fn(() => qb) };
    const service = new FieldsService(
      { transaction: jest.fn() } as never,
      fieldRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.list({ page: 1, pageSize: 20, orderType: OrderType.ONBOARDING });

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(field.orderType = :orderType OR field.businessContext @> :businessContext)',
      { orderType: OrderType.ONBOARDING, businessContext: JSON.stringify([OrderType.ONBOARDING]) },
    );
    expect(result.list[0]).toMatchObject({ fieldCode: 'employee_name', collectionGroup: '基本信息', collection_group: '基本信息' });
  });
});
