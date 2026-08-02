import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MetricsService } from 'src/modules/monitoring/metrics.service';

describe('Monitoring', () => {
  it('exports default process metrics and labeled HTTP metrics', async () => {
    const service = new MetricsService();

    service.recordHttpRequest({
      method: 'GET',
      route: '/api/health',
      statusCode: 200,
      durationSeconds: 0.025,
    });

    const metrics = await service.metrics();
    expect(service.contentType).toContain('text/plain');
    expect(metrics).toContain('ticket_process_cpu_seconds_total');
    expect(metrics).toContain(
      'ticket_http_requests_total{method="GET",route="/api/health",status_code="200",service="ticket-backend"} 1',
    );
    expect(metrics).toContain('ticket_http_request_duration_seconds_bucket');
  });

  it('wires Prometheus and Grafana into Docker Compose', () => {
    const root = join(process.cwd(), '..');
    const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
    const prometheus = readFileSync(
      join(root, 'monitoring', 'prometheus', 'prometheus.yml'),
      'utf8',
    );
    const alerts = readFileSync(
      join(root, 'monitoring', 'prometheus', 'alerts.yml'),
      'utf8',
    );
    const rootNginx = readFileSync(
      join(root, 'nginx', 'nginx.conf'),
      'utf8',
    );
    const frontendNginx = readFileSync(
      join(root, 'frontend', 'nginx.conf'),
      'utf8',
    );
    const dashboard = JSON.parse(
      readFileSync(
        join(root, 'monitoring', 'grafana', 'dashboards', 'ticket-system.json'),
        'utf8',
      ),
    ) as { uid?: string; panels?: unknown[] };

    expect(compose).toContain('prometheus:');
    expect(compose).toContain('grafana:');
    expect(compose).toContain('./monitoring/prometheus/prometheus.yml');
    expect(prometheus).toContain('metrics_path: /api/metrics');
    expect(prometheus).toContain('targets: ["backend:3000"]');
    expect(alerts).toContain('alert: TicketBackendUnavailable');
    expect(alerts).toContain('alert: TicketBackendHighErrorRate');
    expect(rootNginx).toContain('location = /api/metrics');
    expect(frontendNginx).toContain('location = /api/metrics');
    expect(dashboard.uid).toBe('ticket-system-overview');
    expect(dashboard.panels?.length).toBeGreaterThanOrEqual(6);
  });
});
