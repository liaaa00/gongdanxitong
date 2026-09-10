/** Only the gateway's allowlisted metadata outbox is synchronized to the intranet. */
export async function collectMonitorOnce({ gatewayUrl, backendUrl, token, fetchImpl = fetch, signal }) {
  const headers = { 'Content-Type': 'application/json', 'X-Connector-Token': token };
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
  const response = await fetchImpl(gatewayUrl + '/agent/monitor/events', { headers, signal: requestSignal });
  if (!response.ok) throw new Error('monitor gateway unavailable');
  const batch = await response.json();
  if (!Array.isArray(batch.events)) throw new Error('invalid monitor metadata');
  const stored = await fetchImpl(backendUrl + '/api/customer-portal-monitor/collect', {
    method: 'POST', headers, signal: requestSignal,
    body: JSON.stringify({ journalId: batch.journalId, events: batch.events, connectorConnected: batch.connectorConnected === true }),
  });
  if (!stored.ok) throw new Error('monitor collection rejected');
  // Never remove an event until the intranet transaction has committed.
  if (batch.events.length) {
    const ack = await fetchImpl(gatewayUrl + '/agent/monitor/ack', {
      method: 'POST', headers, signal: requestSignal,
      body: JSON.stringify({ journalId: batch.journalId, through: batch.events.at(-1).sequence }),
    });
    if (!ack.ok) throw new Error('monitor acknowledgement failed');
  }
  return batch.events.length;
}

export async function runMonitorCollector(options) {
  while (!options.signal.aborted) {
    try { if (await collectMonitorOnce(options) === 200) continue; }
    catch { /* The durable outbox remains queued; an expired heartbeat displays disconnected. */ }
    if (options.signal.aborted) break;
    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); options.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, options.intervalMs || 5000);
      options.signal.addEventListener('abort', done, { once: true });
    });
  }
}
