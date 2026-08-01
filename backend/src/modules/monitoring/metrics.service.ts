import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

export interface HttpRequestMetric {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requestCounter: Counter<'method' | 'route' | 'status_code'>;
  private readonly requestDuration: Histogram<
    'method' | 'route' | 'status_code'
  >;

  constructor() {
    this.registry.setDefaultLabels({ service: 'ticket-backend' });
    collectDefaultMetrics({
      prefix: 'ticket_',
      register: this.registry,
    });

    const labelNames = ['method', 'route', 'status_code'] as const;
    this.requestCounter = new Counter({
      name: 'ticket_http_requests_total',
      help: 'Total number of HTTP requests handled by the backend.',
      labelNames,
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: 'ticket_http_request_duration_seconds',
      help: 'Backend HTTP request duration in seconds.',
      labelNames,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  recordHttpRequest(metric: HttpRequestMetric): void {
    const labels = {
      method: metric.method,
      route: metric.route,
      status_code: String(metric.statusCode),
    };

    this.requestCounter.inc(labels);
    this.requestDuration.observe(labels, metric.durationSeconds);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
