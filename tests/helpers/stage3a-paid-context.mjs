import { createInternalPolicyContext } from '../../src/engine/hypertree/edition/index.js';
export const PAID_TEST_CONTEXT = createInternalPolicyContext({ edition: 'paid' });
export function paidTestContext(maxNodes = null) { return createInternalPolicyContext({ edition: 'paid', maxNodes }); }
