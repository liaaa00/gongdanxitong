import { QueryRunner } from 'typeorm';
import { RestoreSupplementaryFundInOnboardingTemplate20260828002000 } from 'src/database/migrations/20260828002000-RestoreSupplementaryFundInOnboardingTemplate';

describe('restore supplementary fund ratio onboarding template migration', () => {
  it('restores the field and places it after fund ratio idempotently', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue([]) } as unknown as QueryRunner;
    const migration = new RestoreSupplementaryFundInOnboardingTemplate20260828002000();

    await migration.up(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string).join('\n');
    expect(statements).toContain("is_included_in_template = true");
    expect(statements).toContain("field_code = 'supplementary_fund_ratio'");
    expect(statements).toContain("field_code = 'fund_ratio'");
    expect(statements).toContain('display_order + 1');
    expect(statements).toContain('ON CONFLICT (order_type, field_code, business_scope)');
    expect(statements).toContain('IS NOT DISTINCT FROM');
  });

  it('rolls back only the universal-template inclusion', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue([]) } as unknown as QueryRunner;
    const migration = new RestoreSupplementaryFundInOnboardingTemplate20260828002000();

    await migration.down(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string).join('\n');
    expect(statements).toContain('is_active = false');
    expect(statements).toContain('is_included_in_template = false');
  });
});
