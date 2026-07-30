import { Repository } from 'typeorm';
import {
  DispatchStrategy,
  ModuleHandler,
  OrderType,
} from 'src/entities';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';

const SHEET4 = 'in_service_single_business';
const SHEET5 = 'out_of_province_dispatch';

function namespaced(moduleCode: string, province: string): string {
  return `${moduleCode}__${province}`;
}

function handler(overrides: Partial<ModuleHandler>): ModuleHandler {
  return Object.assign(new ModuleHandler(), {
    id: overrides.id ?? `row-${overrides.handlerId ?? 'handler'}`,
    moduleCode: overrides.moduleCode ?? SHEET5,
    handlerId: overrides.handlerId ?? 'handler',
    weight: overrides.weight ?? 100,
    isBackup: overrides.isBackup ?? false,
    isActive: overrides.isActive ?? true,
    rrCursorVersion: overrides.rrCursorVersion ?? 0,
    handler: overrides.handler ?? ({ isActive: true } as never),
  });
}

function makePicker(rows: ModuleHandler[]): HandlerPickerService {
  const repository = {
    find: jest.fn(async (options: { where: { moduleCode: string; isActive: boolean } }) =>
      rows.filter((row) => row.moduleCode === options.where.moduleCode && row.isActive === options.where.isActive)),
  } as unknown as Repository<ModuleHandler>;
  return new HandlerPickerService(repository, {} as never, undefined);
}

describe('phase 3 out-of-province Sheet5 dispatch contract', () => {
  it.each([OrderType.OUT_OF_PROVINCE_INCREASE, OrderType.OUT_OF_PROVINCE_DECREASE])(
    'routes %s through the Sheet5 province key',
    async (orderType) => {
      expect(orderType).toMatch(/^out_of_province_(increase|decrease)$/);
      const picker = makePicker([
        handler({
          moduleCode: namespaced(SHEET5, '广东'),
          handlerId: 'sheet5-guangdong',
        }),
      ]);

      await expect(picker.pick(
        DispatchStrategy.FIXED,
        SHEET5,
        undefined,
        { province: '广东', mappingSource: 'sheet5' },
      )).resolves.toBe('sheet5-guangdong');
    },
  );

  it('uses the first configured Fujian primary as default and never promotes backup', async () => {
    const picker = makePicker([
      handler({
        id: 'fujian-primary',
        moduleCode: namespaced(SHEET5, '福建'),
        handlerId: 'fujian-primary',
        weight: 100,
        isBackup: false,
      }),
      handler({
        id: 'fujian-backup',
        moduleCode: namespaced(SHEET5, '福建'),
        handlerId: 'fujian-backup',
        weight: 1,
        isBackup: true,
      }),
    ]);

    const context = { province: '福建', mappingSource: 'sheet5' as const };
    await expect(picker.pick(DispatchStrategy.FIXED, SHEET5, undefined, context))
      .resolves.toBe('fujian-primary');
    await expect(picker.pick(DispatchStrategy.FIXED, SHEET5, undefined, context))
      .resolves.toBe('fujian-primary');
  });

  it('keeps Sheet4 and Sheet5 mappings isolated for the same province', async () => {
    const picker = makePicker([
      handler({
        moduleCode: namespaced(SHEET4, '福建'),
        handlerId: 'sheet4-fujian',
      }),
      handler({
        moduleCode: namespaced(SHEET5, '福建'),
        handlerId: 'sheet5-fujian',
      }),
    ]);

    await expect(picker.pick(
      DispatchStrategy.FIXED,
      SHEET5,
      undefined,
      { province: '福建', mappingSource: 'sheet5' },
    )).resolves.toBe('sheet5-fujian');
    await expect(picker.pick(
      DispatchStrategy.FIXED,
      SHEET4,
      undefined,
      { province: '福建', mappingSource: 'sheet4' },
    )).resolves.toBe('sheet4-fujian');
  });

  it('does not fall back to Sheet5 when a Sheet4 mapping is missing', async () => {
    const picker = makePicker([
      handler({
        moduleCode: namespaced(SHEET5, '浙江'),
        handlerId: 'sheet5-zhejiang',
      }),
    ]);

    await expect(picker.pick(
      DispatchStrategy.FIXED,
      SHEET4,
      undefined,
      { province: '浙江', mappingSource: 'sheet4' },
    )).resolves.toBeNull();
  });

  it('does not promote the backup when the Sheet5 primary is inactive', async () => {
    const picker = makePicker([
      handler({
        moduleCode: namespaced(SHEET5, '福建'),
        handlerId: 'inactive-primary',
        isActive: false,
      }),
      handler({
        moduleCode: namespaced(SHEET5, '福建'),
        handlerId: 'fujian-backup',
        isBackup: true,
        weight: 1,
      }),
    ]);

    await expect(picker.pick(
      DispatchStrategy.FIXED,
      SHEET5,
      undefined,
      { province: '福建', mappingSource: 'sheet5' },
    )).resolves.toBeNull();
  });
});
