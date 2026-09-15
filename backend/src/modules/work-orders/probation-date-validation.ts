export function validateProbationDates(data: Record<string, unknown>): Array<{ fieldCode: string; reason: string }> {
  const errors: Array<{ fieldCode: string; reason: string }> = [];
  if (!data.probation_end_date) return errors;
  const parse = (value: unknown): Date | null => {
    const text = String(value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : null;
  };
  const addMonths = (date: Date, months: number) => {
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(date.getUTCDate(), last));
    return result;
  };
  const end = parse(data.probation_end_date);
  const start = parse(data.contract_start_date);
  const contractEnd = parse(data.contract_end_date);
  const probationStart = parse(data.probation_start_date);
  const fail = (reason: string) => errors.push({ fieldCode: 'probation_end_date', reason });
  if (!end) fail('试用期结束日期格式应为年-月-日');
  else if (!start) fail('填写试用期结束日期前必须先填写合同开始日期');
  else if (data.contract_term_type !== '无固定期限' && !contractEnd) fail('填写试用期结束日期前必须填写有效合同终止日期');
  else {
    if (probationStart && probationStart < start) errors.push({ fieldCode: 'probation_start_date', reason: '试用期开始日期不能早于合同开始日期' });
    if (end < start || (probationStart && end < probationStart)) fail('试用期结束日期不能早于合同开始日期或试用期开始日期');
    if (contractEnd && end > contractEnd) fail('试用期结束日期不能晚于合同结束日期');
    // The last contract day is inclusive: Aug 21 through Aug 20 is a full year.
    const exclusiveContractEnd = contractEnd ? new Date(contractEnd.getTime() + 86400000) : null;
    const months = data.contract_term_type === '无固定期限' ? 6 : exclusiveContractEnd! < addMonths(start, 12) ? 1 : exclusiveContractEnd! < addMonths(start, 36) ? 2 : 6;
    if (end > addMonths(start, months)) fail(`当前劳动合同期限下试用期结束日期不能超过合同开始后${months}个月`);
  }
  return errors;
}
