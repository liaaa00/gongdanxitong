export const PROVINCES_27 = [
  '广东', '安徽', '黑龙江', '重庆', '湖北', '江西', '云南', '吉林', '江苏',
  '山西', '山东', '北京', '陕西', '辽宁', '天津', '福建', '上海', '湖南',
  '河南', '河北', '贵州', '四川', '广西', '甘肃', '新疆', '宁夏', '海南',
] as const;

export type Province = typeof PROVINCES_27[number];

export const PROVINCE_SET = new Set<string>(PROVINCES_27);

export function isValidProvince(value: string): value is Province {
  return PROVINCE_SET.has(value);
}
