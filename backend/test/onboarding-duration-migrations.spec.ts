import { RemoveOnboardingDurationInputs20260914200000 } from 'src/database/migrations/20260914200000-RemoveOnboardingDurationInputs';
import { UseEnteredProbationEndInContractExports20260914210000 } from 'src/database/migrations/20260914210000-UseEnteredProbationEndInContractExports';

describe('onboarding duration input migrations', () => {
  it('deactivates only onboarding input template rows without touching orders or global definitions', async () => {
    const query = jest.fn();
    await new RemoveOnboardingDurationInputs20260914200000().up({ query } as never);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("order_type = 'onboarding'");
    expect(query.mock.calls[0][0]).toContain("('contract_term', 'probation_months')");
    expect(query.mock.calls[0][0]).not.toMatch(/DELETE|work_orders|field_configs/);
  });
  it('recognizes both persisted snake-case and seed camel-case export columns, replacing only the shipped formula', async () => {
    const query = jest.fn();
    await new UseEnteredProbationEndInContractExports20260914210000().up({ query } as never);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("COALESCE(item->>'fieldCode', item->>'field_code')");
    expect(sql).toContain("module_code = 'contract'");
    expect(sql).toContain('ORDER BY ordinal');
    expect(sql).toContain("THEN item - 'formula' ELSE item END");
    expect(parameters).toEqual(['IFERROR(EDATE({probation_start_date},VALUE({probation_months}))-1,"")']);
  });
});
