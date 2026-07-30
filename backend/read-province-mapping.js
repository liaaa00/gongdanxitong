const ExcelJS = require('exceljs');

async function readSheet4() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('C:/Users/Asus/AppData/Local/Temp/aionui/84c4bab2/在职模块-工单系统配置表（派单+单项业务）(2).xlsx');

  console.log('所有Sheet:', workbook.worksheets.map((ws, idx) => `${idx}: ${ws.name}`));

  // "省份-福保专员映射关系（单项业务）"是索引3
  const sheet = workbook.getWorksheet('省份-福保专员映射关系（单项业务）');
  if (!sheet) {
    console.log('省份-福保专员映射关系（单项业务）不存在');
    return;
  }

  console.log('\n=== 省份-福保专员映射关系（单项业务） ===');
  console.log('Sheet名称:', sheet.name);
  console.log('行数:', sheet.rowCount);

  // 读取前20行
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 20) {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values.push({ col: colNumber, value: cell.value });
      });
      console.log(`Row ${rowNumber}:`, JSON.stringify(values, null, 2));
      rows.push(values);
    }
  });

  // 提取省份→福保专员映射
  console.log('\n=== 提取映射 ===');
  const mapping = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // 跳过表头
    const provinceCell = row.getCell(1);
    const specialistCell = row.getCell(2);

    let province = provinceCell.value;
    let specialist = specialistCell.value;

    // 处理富文本
    if (province && typeof province === 'object' && province.richText) {
      province = province.richText.map(rt => rt.text).join('');
    }
    if (specialist && typeof specialist === 'object' && specialist.richText) {
      specialist = specialist.richText.map(rt => rt.text).join('');
    }

    if (province && specialist) {
      mapping.push({
        province: String(province).trim(),
        specialist: String(specialist).trim()
      });
    }
  });

  console.log(JSON.stringify(mapping, null, 2));
}

readSheet4().catch(console.error);
