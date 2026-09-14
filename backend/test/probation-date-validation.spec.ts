import { validateProbationDates } from 'src/modules/work-orders/probation-date-validation';

describe('onboarding probation date boundaries without duration inputs', () => {
  it('allows all probation inputs to be absent', () => {
    expect(validateProbationDates({ contract_start_date: '2026-01-01' })).toEqual([]);
  });
  it.each([
    ['2026-01-01', '2027-01-01', '2026-02-01', true],
    ['2026-01-01', '2027-01-01', '2026-02-02', false],
    ['2026-01-01', '2027-01-02', '2026-03-01', true],
    ['2026-01-01', '2029-01-01', '2026-03-02', false],
    ['2026-01-01', '2029-01-02', '2026-07-01', true],
    ['2026-01-01', '2029-01-02', '2026-07-02', false],
    ['2028-01-31', '2029-01-30', '2028-02-29', true],
    ['2026-01-31', '2027-01-30', '2026-02-29', false],
  ])('%s to %s, probation ends %s', (start, end, probationEnd, valid) => {
    expect(validateProbationDates({ contract_start_date: start, contract_end_date: end, probation_end_date: probationEnd }).length === 0).toBe(valid);
  });
  it('requires a real fixed contract end, permits an open-ended contract, and rejects reversed probation dates', () => {
    const data = { contract_start_date: '2026-01-01', probation_end_date: '2026-07-01' };
    expect(validateProbationDates(data)).not.toEqual([]);
    expect(validateProbationDates({ ...data, contract_term_type: '无固定期限' })).toEqual([]);
    expect(validateProbationDates({ ...data, contract_term_type: '无固定期限', probation_start_date: '2026-07-02' })).not.toEqual([]);
  });
});
