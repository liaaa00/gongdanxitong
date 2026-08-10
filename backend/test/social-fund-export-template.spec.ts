import { BusinessScope, DispatchedOrder, ExportTemplate } from 'src/entities';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';

function makeService() {
  const templateRepository = {
    findOne: jest.fn(async () => ({
      id: 'legacy-template',
      templateName: '旧社保模板',
      moduleCode: 'social_insurance',
      fieldList: [{ fieldCode: 'employee_name', alias: '旧姓名', order: 1 }],
      isShared: true,
    })),
    create: jest.fn((input) => input),
  };
  const service = new ExportTemplatesService(
    templateRepository as never,
    {} as never,
    {} as never,
    { find: jest.fn(async () => []) } as never,
    { find: jest.fn(async () => []) } as never,
    {} as never,
  );
  return { service, templateRepository };
}

function makeOrder(moduleCode: string, extraData: Record<string, unknown>): DispatchedOrder {
  return {
    id: 'dispatched-1',
    moduleCode,
    visibleFields: [],
    handlerId: null,
    handler: null,
    status: 'pending',
    dispatchedAt: new Date('2026-08-09T00:00:00.000Z'),
    acceptedAt: null,
    completedAt: null,
    parentOrder: {
      id: 'work-order-1',
      orderNo: 'WO-1',
      employeeName: '张三',
      employeeIdCard: '330206199001011234',
      createdBy: 'creator-1',
      creator: { realName: '发起人A' },
      extraData,
    },
  } as unknown as DispatchedOrder;
}

describe('福保社保公积金固定导出模板', () => {
  it('uses the exact 35 increase columns before any database shared template', async () => {
    const { service, templateRepository } = makeService();
    const template = await (service as any).resolveDefaultTemplate(
      'social_insurance',
      ['employee_name'],
      null,
      BusinessScope.BEILUN,
    ) as ExportTemplate;
    const result = (service as any).buildResult(template, [
      makeOrder('social_insurance', {
        paymentInstitution: '历史参保单位',
        socialLocation: '宁波',
        customerName: '测试客户',
        startMonth: '2026-08',
        socialBase: 12000,
        housingFundBase: 12000,
        fundRatio: '单位12%+个人12%',
      }),
    ], new Map());

    expect(templateRepository.findOne).not.toHaveBeenCalled();
    expect(template.templateName).toBe('社保公积金增员导出表');
    expect(result.columns.map((column: { title: string }) => column.title)).toHaveLength(35);
    expect(result.columns.map((column: { title: string }) => column.title)).toEqual([
      '姓名', '身份证号', '参保单位', '参保地', '客户名称', '缴纳地', '社保起缴月',
      '社保缴费工资', '公积金起缴月', '公积金缴费工资', '公积金比例', '移动电话',
      '社保是否办结', '医保是否办结', '公积金是否办结', '社保公积金办理备注',
      '备注', '特殊备注', '岗位', '岗位类型', '婚姻状况', '户籍性质', '现住地址',
      '户籍地址', '人员类型', '合同期限形式', '合同开始日期', '合同终止日期',
      '学历', '毕业院校', '专业', '毕业时间', '开户银行信息', '银行借记卡帐号', '发起人',
    ]);
    expect(result.rows[0]).toMatchObject({
      姓名: '张三',
      身份证号: '330206199001011234',
      参保单位: '历史参保单位',
      参保地: '宁波',
      缴纳地: '宁波',
      社保起缴月: '2026-08',
      公积金起缴月: '2026-08',
      发起人: '发起人A',
    });
  });

  it('uses the exact 15 decrease columns and falls back to historical stop month', async () => {
    const { service, templateRepository } = makeService();
    const template = await (service as any).resolveDefaultTemplate(
      'resignation_social_insurance',
      ['employee_name'],
      null,
      BusinessScope.BEILUN,
    ) as ExportTemplate;
    const result = (service as any).buildResult(template, [
      makeOrder('resignation_social_insurance', {
        paymentInstitution: '历史参保单位',
        socialLocation: '宁波',
        customerName: '测试客户',
        socialStopMonth: '2026-08',
        resignationReason: '个人发展',
        lastWorkDate: '2026-08-08',
      }),
    ], new Map());

    expect(templateRepository.findOne).not.toHaveBeenCalled();
    expect(template.templateName).toBe('社保公积金减员导出表');
    expect(result.columns.map((column: { title: string }) => column.title)).toEqual([
      '姓名', '身份证号', '参保单位', '缴纳地', '客户名称', '社保停缴月',
      '公积金停缴月', '离职原因', '最后工作日', '社保是否办结', '医保是否办结',
      '公积金是否办结', '社保公积金办理备注', '备注', '发起人',
    ]);
    expect(result.rows[0]).toMatchObject({
      参保单位: '历史参保单位',
      缴纳地: '宁波',
      社保停缴月: '2026-08',
      公积金停缴月: '2026-08',
      离职原因: '个人发展',
      最后工作日: '2026-08-08',
    });
  });
});
