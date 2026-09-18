import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../web/portal-business.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

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

/* ---- 批次3：主体切换行为（回归清单 §44 多主体口径） ---- */
function extractFunction(name, isAsync) {
  const signature = (isAsync ? 'async function ' : 'function ') + name + '(';
  const start = source.indexOf(signature);
  assert.ok(start >= 0, 'function is present: ' + name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

test('switching subject reloads the schema, resets the in-progress form and restores that subject draft', async () => {
  const subjectA = 'aaaa1111-1111-4111-8111-111111111111';
  const subjectB = 'bbbb2222-2222-4222-8222-222222222222';
  const select = { value: subjectA, disabled: false };
  const wizard = { value: subjectA, disabled: false };
  const header = { textContent: '' };
  const dashChip = { textContent: '' };
  const locationList = { options: [], replaceChildren(...items) { this.options = items; } };
  const events = [];
  const context = {
    document: {
      getElementById(id) {
        if (id === 'onboarding-subject-select') return select;
        if (id === 'onboarding-wizard-subject') return wizard;
        if (id === 'portal-customer-code') return header;
        if (id === 'dashboard-subject-chip') return dashChip;
        if (id === 'social-location-options') return locationList;
        return null;
      },
    },
    Option: function Option(text, value) { return { text, value }; },
    activePortalSession: { account: { id: 'account-a' }, primarySubjectId: subjectA, subjects: [{ id: subjectA, name: '主体A' }, { id: subjectB, name: '主体B' }] },
    portalSessionGeneration: 7,
    portalLinkToken: () => 'token-a',
    portalSchemas: {},
    portalState: { locations: {}, resignationFiles: [] },
    portalCall: async (path, payload) => {
      events.push(['portalCall', path, payload.subjectId]);
      return { fields: [{ code: 'employee_name', name: '员工姓名', required: true, options: [], type: 'text' }], locations: [] };
    },
    assertPortalSession: () => {},
    isPortalSessionChanged: () => false,
    resetOnboardingForm: () => { events.push(['resetOnboardingForm']); },
    offerPortalDraft: (kind) => { events.push(['offerPortalDraft', kind]); },
    hideDraftRestoreCard: () => {},
    renderResignationAttachments: () => {},
    showToast: (message) => { events.push(['showToast', message]); },
  };
  const code = [extractFunction('portalSubjects', false), extractFunction('currentSubjectId', false), extractFunction('switchPortalSubject', true)].join('\n');
  vm.createContext(context);
  vm.runInContext(code + '\nthis.subjectTools = { switchPortalSubject, currentSubjectId };', context);

  await context.subjectTools.switchPortalSubject('onboarding', subjectB);

  assert.deepEqual(events[0], ['portalCall', '/portal/schema', subjectB]);
  assert.ok(events.some((entry) => entry[0] === 'resetOnboardingForm'), 'in-progress form is reset so the previous subject content cannot leak');
  assert.ok(events.some((entry) => entry[0] === 'offerPortalDraft' && entry[1] === 'onboarding'), 'only the switched subject draft is offered for restore');
  assert.equal(select.value, subjectB);
  assert.equal(wizard.value, subjectB);
  assert.equal(header.textContent, '当前主体：主体B');
  assert.equal(dashChip.textContent, '当前主体：主体B');
  assert.match(events.at(-1)[1], /已切换办理主体：主体B/);
  assert.equal(context.subjectTools.currentSubjectId('onboarding'), subjectB);
  assert.deepEqual(context.portalSchemas.onboarding, [{ code: 'employee_name', name: '员工姓名', required: true, options: [], type: 'text' }]);
});
