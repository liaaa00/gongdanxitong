import { GoneException } from '@nestjs/common';
import { OrderType } from 'src/entities';

export function assertNotLegacyProvinceWrite(orderType: OrderType): void {
  if (orderType === OrderType.OUT_OF_PROVINCE_INCREASE
    || orderType === OrderType.OUT_OF_PROVINCE_DECREASE) {
    throw new GoneException('省外增减员已使用独立工单，请从省外增减员页面办理；历史主工单仍可查询。');
  }
}
