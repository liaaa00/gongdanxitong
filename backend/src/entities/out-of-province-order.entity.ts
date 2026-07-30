import { ViewColumn, ViewEntity } from 'typeorm';
import { BusinessScope, OrderType } from './enums';

@ViewEntity({ name: 'out_of_province_orders' })
export class OutOfProvinceOrder {
  @ViewColumn({ name: 'work_order_id' })
  workOrderId!: string;

  @ViewColumn({ name: 'order_type' })
  orderType!: OrderType.OUT_OF_PROVINCE_INCREASE | OrderType.OUT_OF_PROVINCE_DECREASE;

  @ViewColumn({ name: 'business_scope' })
  businessScope!: BusinessScope.OUT_OF_PROVINCE;

  @ViewColumn()
  province!: string | null;

  @ViewColumn({ name: 'created_at' })
  createdAt!: Date;

  @ViewColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
