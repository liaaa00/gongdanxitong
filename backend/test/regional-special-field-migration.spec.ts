import { RemoveSupplementaryFundFromUniversalTemplate20260817001000 } from 'src/database/migrations/20260817001000-RemoveSupplementaryFundFromUniversalTemplate';
import { AddRegionalSpecialFundField20260817004000 } from 'src/database/migrations/20260817004000-AddRegionalSpecialFundField';
import { ExtendRegionalSpecialFundContexts20260817005000 } from 'src/database/migrations/20260817005000-ExtendRegionalSpecialFundContexts';

describe('regional special fields', () => {
  it('removes supplementary fund from the universal template without disabling the system field', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new RemoveSupplementaryFundFromUniversalTemplate20260817001000().up({ query } as never);

    expect(statements.join('\n')).toContain('is_included_in_template = false');
    expect(statements.join('\n')).toContain('is_active = true');
    expect(statements.join('\n')).toContain('UPDATE import_template_fields');
  });
  it('extends the regional field to renewal without hard-coding a city in the help text', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new ExtendRegionalSpecialFundContexts20260817005000().up({ query } as never);

    const sql = statements.join('\n');
    expect(sql).toContain('["onboarding","renewal","resignation"]');
    expect(sql).toContain('仅选择配置了补充公积金的劳动合同主体时显示并可选');
    expect(sql).not.toContain('上海劳动合同主体');
  });

  it('keeps the field optional and adds it to both social insurance modules', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new AddRegionalSpecialFundField20260817004000().up({ query } as never);

    const sql = statements.join('\n');
    expect(sql).toContain('is_included_in_template = false');
    expect(sql).toContain('supplementary_fund_ratio');
    expect(sql).toContain('social_insurance');
    expect(sql).toContain('resignation_social_insurance');
    expect(sql).toContain('ON CONFLICT (role_id, field_code, scenario, business_scope)');
  });
});
