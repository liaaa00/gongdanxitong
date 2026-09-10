import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8');

function loadIsolationHelpers() {
  const start = source.indexOf('class PortalSessionChangedError');
  const end = source.indexOf('\n\nasync function portalCall');
  assert.ok(start >= 0 && end > start);
  const code = source.slice(start, end) + '\nthis.helpers = { PortalSessionChangedError, isPortalSessionChanged, assertPortalSession, clearPortalClientState };';
  const removed = [];
  const context = {
    portalSessionGeneration: 3,
    activePortalSession: { account: { id: 'account-a' } },
    portalLinkToken: () => 'token-a',
    portalState: {
      onboardingFiles: [{ file: { name: 'a.pdf' } }], resignationFiles: [{ file: { name: 'r.pdf' } }],
      onboardingAttachmentIds: ['a'], importPreview: { ok: true }, importMapping: { A: 'x' },
      importFileId: 'f', importRequestId: 'r', resignationImportFileId: 'rf',
      standardTemplateDownloads: { onboarding: true, resignation: true }, salaryAttachmentInvalid: true,
      salaryMode: 'changed', salaryChannel: 'attachment', modalAction: 'changed', progressFilter: 'done',
      submittingOnboarding: true,
    },
    document: {
      querySelectorAll(selector) {
        if (selector === 'input[type="file"]') return [{ value: 'a' }, { value: 'b' }];
        if (selector === 'form') return [{ resetCalled: 0, reset() { this.resetCalled += 1; } }];
        return [];
      },
      getElementById(id) {
        if (['progress-rows', 'dashboard-recent'].includes(id)) return { replaceChildrenCalled: 0, replaceChildren() { this.replaceChildrenCalled += 1; } };
        return null;
      },
    },
    onboardingRendered: false,
    resignationRendered: false,
    pendingPortalRequests: new Map(),
    portalSchemas: { onboarding: {}, resignation: {} },
    sessionStorage: {},
  };
  context.renderOnboardingAttachments = () => { context.onboardingRendered = true; };
  context.renderResignationAttachments = () => { context.resignationRendered = true; };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, helpers: context.helpers };
}

test('logout cleanup removes every customer-bound client artifact', () => {
  const { context, helpers } = loadIsolationHelpers();
  context.pendingPortalRequests.set('onboarding', { requestId: 'old' });
  helpers.clearPortalClientState();
  assert.equal(context.portalState.onboardingFiles.length, 0);
  assert.equal(context.portalState.resignationFiles.length, 0);
  assert.equal(context.portalState.onboardingAttachmentIds.length, 0);
  assert.equal(context.portalState.importPreview, null);
  assert.equal(Object.keys(context.portalState.importMapping).length, 0);
  assert.equal(context.portalState.importFileId, null);
  assert.equal(context.portalState.importRequestId, null);
  assert.equal(context.portalState.resignationImportFileId, null);
  assert.equal(context.portalState.standardTemplateDownloads.onboarding, false);
  assert.equal(context.portalState.standardTemplateDownloads.resignation, false);
  assert.equal(context.portalState.salaryMode, null);
  assert.equal(context.portalState.salaryChannel, null);
  assert.equal(context.pendingPortalRequests.size, 0);
  assert.equal(context.onboardingRendered, true);
  assert.equal(context.resignationRendered, true);
});

test('session guard rejects stale account, token, or generation responses', () => {
  const { context, helpers } = loadIsolationHelpers();
  assert.doesNotThrow(() => helpers.assertPortalSession(3, 'account-a', 'token-a'));
  for (const stale of [
    [2, 'account-a', 'token-a'],
    [3, 'account-b', 'token-a'],
    [3, 'account-a', 'token-b'],
  ]) {
    assert.throws(() => helpers.assertPortalSession(...stale), (error) => error.code === 'PORTAL_SESSION_CHANGED');
  }
});

test('all customer data flows guard asynchronous work before and after gateway calls', () => {
  assert.match(source, /const callGeneration = portalSessionGeneration/);
  assert.match(source, /assertPortalSession\(callGeneration, callAccountId, callToken\);/);
  for (const functionName of ['downloadStandardTemplate', 'submitOnboarding', 'submitResignation', 'submitSalary', 'runPortalImport', 'refreshPortalProgress']) {
    const body = source.slice(source.indexOf(`async function ${functionName}`), source.indexOf('\n}\n', source.indexOf(`async function ${functionName}`)) + 3);
    assert.match(body, /assertPortalSession/);
  }
  assert.match(source, /portalState\.onboardingFiles = \[\];/);
  assert.match(source, /portalState\.resignationFiles = \[\];/);
  assert.match(source, /sessionStorage\.removeItem\(PORTAL_SESSION_KEY\);clearPortalClientState\(\)/);
});
