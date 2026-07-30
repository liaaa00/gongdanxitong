import InServiceOrderNew from '@/pages/InServiceOrders/New';
import { IN_SERVICE_ORDER_KINDS } from '@/constants/inService';

export default function RenewalNew() {
  return (
    <InServiceOrderNew
      orderKind={IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL}
      listPath="/renewal"
    />
  );
}
