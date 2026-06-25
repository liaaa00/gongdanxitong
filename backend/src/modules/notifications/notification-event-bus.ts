import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface NotificationStreamPayload {
  id: string;
  userId: string;
  bizType: string;
  title: string;
  content: string;
  link: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

@Injectable()
export class NotificationEventBus {
  private readonly subjects = new Map<string, Subject<NotificationStreamPayload>>();

  subscribe(userId: string): Observable<NotificationStreamPayload> {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<NotificationStreamPayload>();
      this.subjects.set(userId, subject);
    }
    return subject.asObservable();
  }

  publish(payload: NotificationStreamPayload): void {
    this.subjects.get(payload.userId)?.next(payload);
  }
}
