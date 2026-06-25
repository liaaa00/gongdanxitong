import { http } from 'msw';
import { ok } from '../utils';

const RENEWAL_FIELDS = [
  { field_code: 'renewal_reason', field_name: '续签原因', field_type: 'DROPDOWN', required: true, order_type: 'renewal', dropdown_options: '到期续签,调岗续签,其他' },
  { field_code: 'prev_contract_no', field_name: '上一份合同编号', field_type: 'TEXT', required: true, order_type: 'renewal' },
  { field_code: 'prev_contract_end_date', field_name: '上一份合同到期日', field_type: 'DATE', required: true, order_type: 'renewal' },
  { field_code: 'renewal_term_type', field_name: '续签期限形式', field_type: 'DROPDOWN', required: true, order_type: 'renewal', dropdown_options: '固定,无固定,任务期限' },
  { field_code: 'renewal_term', field_name: '续签期限', field_type: 'TEXT', required: true, order_type: 'renewal' },
  { field_code: 'renewal_start_date', field_name: '续签合同起始日', field_type: 'DATE', required: true, order_type: 'renewal' },
  { field_code: 'renewal_end_date', field_name: '续签合同终止日', field_type: 'DATE', required: false, order_type: 'renewal' },
  { field_code: 'renewal_work_city', field_name: '工作城市', field_type: 'TEXT', required: true, order_type: 'renewal' },
  { field_code: 'renewal_base_salary', field_name: '续签基本工资', field_type: 'NUMBER', required: true, order_type: 'renewal' },
];

const RESIGNATION_FIELDS = [
  { field_code: 'resignation_type', field_name: '离职类型', field_type: 'DROPDOWN', required: true, order_type: 'resignation', dropdown_options: '协商一致,主动辞职,公司辞退,合同到期,其他' },
  { field_code: 'resignation_reason', field_name: '离职原因', field_type: 'TEXT', required: true, order_type: 'resignation' },
  { field_code: 'last_work_date', field_name: '最后工作日', field_type: 'DATE', required: true, order_type: 'resignation' },
  { field_code: 'contract_terminate_date', field_name: '合同解除日', field_type: 'DATE', required: true, order_type: 'resignation' },
  { field_code: 'handover_person', field_name: '工作交接人', field_type: 'TEXT', required: false, order_type: 'resignation' },
  { field_code: 'need_resignation_cert', field_name: '是否需要开具离职证明', field_type: 'DROPDOWN', required: true, order_type: 'resignation', dropdown_options: '是,否' },
  { field_code: 'cert_delivery_address', field_name: '送达地址', field_type: 'TEXT', required: false, order_type: 'resignation' },
];

const BENEFIT_FIELDS = [
  { field_code: 'benefit_type', field_name: '待遇申报类型', field_type: 'DROPDOWN', required: true, order_type: 'benefit', dropdown_options: '工伤认定,工伤待遇,生育津贴,失业金领取,医疗报销,其他' },
  { field_code: 'benefit_region', field_name: '申报地', field_type: 'TEXT', required: true, order_type: 'benefit' },
  { field_code: 'benefit_start_date', field_name: '事件起始日', field_type: 'DATE', required: true, order_type: 'benefit' },
  { field_code: 'benefit_claim_amount', field_name: '申报金额', field_type: 'NUMBER', required: false, order_type: 'benefit' },
  { field_code: 'benefit_bank_name', field_name: '收款开户行', field_type: 'TEXT', required: false, order_type: 'benefit' },
  { field_code: 'benefit_contact_person', field_name: '联系人', field_type: 'TEXT', required: true, order_type: 'benefit' },
  { field_code: 'benefit_contact_phone', field_name: '联系电话', field_type: 'PHONE', required: true, order_type: 'benefit' },
  { field_code: 'benefit_materials_required', field_name: '所需材料清单', field_type: 'TEXT', required: true, order_type: 'benefit' },
];

const ALL_FIELDS = [...RENEWAL_FIELDS, ...RESIGNATION_FIELDS, ...BENEFIT_FIELDS];

export const newBusinessHandlers = [
  http.get('/api/fields', async ({ request }) => {
    const url = new URL(request.url);
    const orderType = url.searchParams.get('order_type') || '';
    let list = ALL_FIELDS;
    if (orderType === 'renewal') list = RENEWAL_FIELDS;
    if (orderType === 'resignation') list = RESIGNATION_FIELDS;
    if (orderType === 'benefit') list = BENEFIT_FIELDS;
    return ok({ list, total: list.length });
  }),
];
