import InServiceOrderList from '@/pages/InServiceOrders';
import { IN_SERVICE_ORDER_KINDS } from '@/constants/inService';

export default function RenewalList() {
  return (
    <InServiceOrderList
      orderKind={IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL}
      createPath="/renewal/new"
    />
  );
}
