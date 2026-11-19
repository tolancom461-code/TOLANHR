import {
  type CaptureSourceEvent, type ExistingWorkflowOutcome, type InboxListFilter,
  type SourceInboxStore,
} from './types';
import { isAttendanceMovement, prepareSourceEvent, validateId, validateListFilter, validateOutcome } from './validation';

/** Explicit construction only. Importing this file performs no I/O. */
export function createAttendanceSourceInbox(store: SourceInboxStore) {
  return {
    assertReady: () => store.assertReady(),
    capture: (input: CaptureSourceEvent) => store.insert(prepareSourceEvent(input)),
    get: (id: string) => store.get(validateId(id)),
    list: (filter?: InboxListFilter) => store.list(validateListFilter(filter)),
    async getEligibleForExistingWorkflow(id: string) {
      const event = await store.get(validateId(id));
      // Eligibility is not acceptance. The unchanged QR rules still decide later.
      return event && event.status === 'pending' && event.workerId !== null && isAttendanceMovement(event.eventType)
        ? event : null;
    },
    recordExistingWorkflowOutcome: (outcome: ExistingWorkflowOutcome) =>
      store.recordExistingWorkflowOutcome(validateOutcome(outcome)),
  };
}
