/**
 * Phase 3 E2E contract skeleton.
 *
 * The out-of-province form is intentionally deferred until the business team
 * provides the CaiNiao template and Zhejiang self-sign field list. Keep this
 * scenario skipped until the frontend switcher, import route and backend
 * import endpoint are present in integration.
 */
describe.skip('out-of-province switcher -> import -> dispatch', () => {
  it('persists the Beilun/out-of-province switch across refresh', async () => {
    // TODO: select 省外派单, reload, assert localStorage-backed scope remains.
  });

  it('imports an out-of-province increase row and dispatches through Sheet5', async () => {
    // TODO: upload the approved Sheet5 import fixture, assert order type,
    // businessScope=out_of_province, and Sheet5 handler assignment.
  });

  it('imports an out-of-province decrease row without leaking Beilun rows', async () => {
    // TODO: assert out-of-province list excludes businessScope=beilun and vice versa.
  });
});
