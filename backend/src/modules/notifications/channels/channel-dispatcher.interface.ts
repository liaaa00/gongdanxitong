import { EntityManager } from 'typeorm';
import { Notification } from 'src/entities';

export type NotificationChannelType = 'in_app' | 'email' | 'sms';

export interface NotificationDispatchContext {
  templateCode: string;
  bizType: string;
  recipients: string[];
  title: string;
  content: string;
  link: string | null;
  payload: Record<string, unknown> | null;
  channels: NotificationChannelType[];
  manager?: EntityManager;
}

export interface NotificationChannelDispatcher {
  readonly channel: NotificationChannelType;
  dispatch(context: NotificationDispatchContext): Promise<Notification[]>;
}
