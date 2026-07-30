export const PROVINCES_27 = [
  '广东',
  '浙江',
  '江苏',
  '上海',
  '北京',
  '天津',
  '重庆',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广西',
  '海南',
  '四川',
  '贵州',
  '云南',
  '陕西',
  '甘肃',
  '青海',
  '河北',
  '山西',
  '辽宁',
  '吉林',
  '黑龙江',
] as const;

export type OutOfProvinceProvince = typeof PROVINCES_27[number];

export const OUT_OF_PROVINCE_ORDER_TYPE = {
  INCREASE: 'out_of_province_increase',
  DECREASE: 'out_of_province_decrease',
} as const;

export const OUT_OF_PROVINCE_ORDER_TYPE_OPTIONS = [
  { label: '省外增员', value: OUT_OF_PROVINCE_ORDER_TYPE.INCREASE },
  { label: '省外减员', value: OUT_OF_PROVINCE_ORDER_TYPE.DECREASE },
] as const;

export type OutOfProvinceOrderType = typeof OUT_OF_PROVINCE_ORDER_TYPE[keyof typeof OUT_OF_PROVINCE_ORDER_TYPE];
