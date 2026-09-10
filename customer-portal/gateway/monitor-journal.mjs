import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MONITORED_ACTIONS = new Set([
  'onboarding.create_draft', 'resignation.create_draft', 'salary.submit',
  'onboarding.import_confirm', 'resignation.import_confirm', 'portal.progress',
]);
const STAGES = new Set(['gateway_received', 'connector_received', 'backend_responded', 'portal_responded', 'failed', 'timeout']);
const FAILURES = new Set(['CONNECTOR_OFFLINE', 'CONNECTOR_TIMEOUT', 'RELAY_FAILED', 'BACKEND_REJECTED', 'GATEWAY_RESTARTED', 'CLIENT_DISCONNECTED']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A durable outbox of allowlisted tracking metadata. No business body is accepted. */
export class MonitorJournal {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'events.jsonl');
    this.events = [];
    this.openRequests = new Map();
    this.nextSequence = 1;
    this.journalId = randomUUID();
    let hasHeader = false;
    if (existsSync(this.path)) {
      const bytes = readFileSync(this.path);
      const end = bytes.lastIndexOf(10) + 1;
      // A torn final append was never fsynced/acknowledged. Keep all complete lines.
      if (end < bytes.length) truncateSync(this.path, end);
      for (const line of bytes.subarray(0, end).toString('utf8').split('\n').filter(Boolean)) {
        const record = JSON.parse(line);
        if (record.kind === 'header') {
          if (!UUID.test(record.journalId) || !Number.isSafeInteger(record.nextSequence) || record.nextSequence < 1) throw new Error('invalid monitor journal header');
          this.journalId = record.journalId; this.nextSequence = record.nextSequence; hasHeader = true;
        }
        else if (record.kind === 'ack') this.events = this.events.filter((event) => event.sequence > record.through);
        else if (record.kind === 'event') {
          this.events.push(record.event);
          // ACK only removes an event from the delivery outbox. Replay request
          // state independently so a crash before compaction cannot erase an
          // acknowledged request whose browser response is still outstanding.
          this.track(record.event);
          this.nextSequence = Math.max(this.nextSequence, record.event.sequence + 1);
        } else throw new Error('invalid monitor journal');
      }
    }
    if (!hasHeader) {
      if (this.events.length) throw new Error('monitor journal header missing');
      this.append({ kind: 'header', journalId: this.journalId, nextSequence: 1 });
    }
    this.events.sort((left, right) => left.sequence - right.sequence);
    // A restarted process cannot prove the old socket delivered its response.
    for (const event of [...this.openRequests.values()]) this.record({ ...event, stage: 'timeout', failureCode: 'GATEWAY_RESTARTED' });
  }

  append(record) {
    appendFileSync(this.path, JSON.stringify(record) + '\n', { mode: 0o600 });
    const descriptor = openSync(this.path, 'r+');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  }

  track(event) {
    if (['portal_responded', 'failed', 'timeout'].includes(event.stage)) this.openRequests.delete(event.traceId);
    else this.openRequests.set(event.traceId, event);
  }

  record(input) {
    if (!UUID.test(input.traceId) || !MONITORED_ACTIONS.has(input.action) || !STAGES.has(input.stage) || !/^[a-f0-9]{64}$/.test(input.requestKey)) throw new Error('invalid tracking metadata');
    const event = {
      id: randomUUID(), sequence: this.nextSequence++, traceId: input.traceId,
      requestKey: input.requestKey, action: input.action, stage: input.stage,
      businessType: ['onboarding', 'resignation', 'salary'].includes(input.businessType) ? input.businessType : null,
      at: new Date().toISOString(),
      failureCode: FAILURES.has(input.failureCode) ? input.failureCode : null,
    };
    this.append({ kind: 'event', event });
    this.events.push(event);
    this.track(event);
    return event;
  }

  batch(limit = 200) { return { journalId: this.journalId, events: this.events.slice(0, limit) }; }

  acknowledge(journalId, through) {
    if (journalId !== this.journalId || !Number.isInteger(through) || through < 0 || through >= this.nextSequence) throw new Error('invalid monitor acknowledgement');
    this.append({ kind: 'ack', through });
    this.events = this.events.filter((event) => event.sequence > through);
    // Open requests survive ACK compaction so restart recovery still marks them.
    const pending = [...this.openRequests.values()].filter((event) => event.sequence <= through);
    const retained = [...pending, ...this.events].sort((left, right) => left.sequence - right.sequence);
    const records = [{ kind: 'header', journalId: this.journalId, nextSequence: this.nextSequence }, ...retained.map((event) => ({ kind: 'event', event }))];
    const temporary = this.path + '.next';
    writeFileSync(temporary, records.map((record) => JSON.stringify(record)).join('\n') + '\n', { mode: 0o600 });
    const descriptor = openSync(temporary, 'r+');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    renameSync(temporary, this.path);
  }
}
