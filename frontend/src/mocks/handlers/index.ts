import { authHandlers } from './auth';
import { workOrderHandlers } from './workOrders';
import { dispatchedOrderHandlers } from './dispatchedOrders';
import { dashboardHandlers } from './dashboard';
import { adminHandlers } from './admin';
import { importHandlers } from './import';
import { notificationHandlers } from './notifications';
import { supplementHandlers } from './supplementLogs';
import { uploadHandlers } from './upload';
import { aiHandlers } from './ai';
import { newBusinessHandlers } from './newBusiness';

export const handlers = [
  ...authHandlers,
  ...workOrderHandlers,
  ...dispatchedOrderHandlers,
  ...dashboardHandlers,
  ...adminHandlers,
  ...importHandlers,
  ...notificationHandlers,
  ...supplementHandlers,
  ...uploadHandlers,
  ...aiHandlers,
  ...newBusinessHandlers,
];
