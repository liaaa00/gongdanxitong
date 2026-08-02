const ExcelJS = require('exceljs');

const EXPECTED_ORDER = [
  'customer_name', 'employee_name', 'id_card_type', 'id_card_no', 'mobile',
  'position', 'contract_start_date', 'work_city', 'base_salary', 'social_location',
  'bank_account', 'bank_name',
  'customer_code', 'outsource_type', 'position_type', 'household_type', 'ethnicity',
  'education', 'graduation_school', 'major'
];

const FIELD_NAME_MAP = {
  customer_name: '客户名称', employee_name: '姓名', id_card_type: '证件类型',
  id_card_no: '证件号码', mobile: '移动电话', position: '岗位',
  contract_start_date: '合同开始日期', work_city: '工作城市', base_salary: '基本工资',
  social_location: '参保地', bank_account: '银行借记卡帐号', bank_name: '开户银行信息',
  customer_code: '客户代码', outsource_type: '外包类型'
};

async function verify(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('当前字段配置');
  const headerRow = sheet.getRow(1);
  let errors = 0;

  console.log('验证前20个字段:');
  for (let i = 0; i < 20; i++) {
    const col = i + 2;
    const cell = headerRow.getCell(col);
    const value = cell.value;
    const fill = cell.fill;
    const hasYellow = fill && fill.fgColor && fill.fgColor.argb === 'FFFFFF00';
    const expectedName = FIELD_NAME_MAP[EXPECTED_ORDER[i]];
    const shouldHighlight = i < 12;
    const orderOK = value === expectedName;
    const highlightOK = hasYellow === shouldHighlight;
    const status = (orderOK && highlightOK) ? '✓' : '✗';
    console.log(`${status} ${i + 1}. ${value} ${hasYellow ? '[黄]' : ''} (期望: ${expectedName} ${shouldHighlight ? '[黄]' : ''})`);
    if (!orderOK || !highlightOK) errors++;
  }

  console.log(`\n${errors === 0 ? '✓ 全部正确' : `✗ 发现 ${errors} 个错误`}`);
  process.exit(errors === 0 ? 0 : 1);
}

verify(process.argv[2]).catch(console.error);
