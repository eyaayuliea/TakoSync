import React from 'react';
import {
  ENTRY_REVERSAL_REASON_MAX_LENGTH,
  entryReversalTypeLabel,
  validateEntryReversalReason,
  type EntryReversalAvailability,
  type EntryReversalState,
  type EntryReversalType,
} from '../services/entryReversals';
import { ApprovalStatusPanel, ReasonRequestModal, approvalDateTime } from './OwnerApprovalRequest';

export type EntryReversalEntry = {
  type: EntryReversalType;
  reference: string;
  itemName: string;
  quantityLabel: string;
};

/** ST-13 c5, c7, c8: what happened to this entry's reversal, and the action when allowed (c1, c6, c9). */
export function EntryReversalStatusPanel({
  state,
  availability,
  onRequestReversal,
}: {
  state: EntryReversalState;
  availability: EntryReversalAvailability;
  onRequestReversal: () => void;
}) {
  let message: string;
  let tone: 'error' | 'warning' | 'neutral' = 'neutral';
  if (state.kind === 'reversed') {
    tone = 'error';
    message = `Reversed${state.request.decidedAt ? ` on ${approvalDateTime(state.request.decidedAt)}` : ''}`
      + `${state.request.decidedByName ? ` by ${state.request.decidedByName}` : ''}. A reversing Entry Reversal`
      + ' transaction was posted; this original entry stays in the history.';
  } else if (state.kind === 'pending') {
    tone = 'warning';
    message = `Reversal request ${state.request.reference} is Pending (sent ${approvalDateTime(state.request.requestedAt)}).`
      + ' The entry is unchanged until the owner decides.';
  } else if (state.kind === 'rejected') {
    message = `The owner rejected reversal request ${state.request.reference}`
      + `${state.request.decisionReason ? `: “${state.request.decisionReason}”` : ''}. The entry stays unchanged.`;
  } else {
    message = 'No reversal has been requested for this entry.';
  }
  return (
    <ApprovalStatusPanel
      title="Reversal"
      message={message}
      tone={tone}
      actionLabel={availability.allowed ? 'Request Reversal' : undefined}
      onAction={availability.allowed ? onRequestReversal : undefined}
      hint={!availability.allowed && (state.kind === 'none' || state.kind === 'rejected') ? availability.reason : undefined}
    />
  );
}

/** ST-13 c2–c4: the reversal request form. */
export function EntryReversalRequestModal({
  visible,
  entry,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  entry: EntryReversalEntry | null;
  onClose: () => void;
  onSubmit: (reason: string, clientRequestId: string) => Promise<void>;
}) {
  if (!entry) return null;
  const batter = entry.type === 'batter_preparation';
  return (
    <ReasonRequestModal
      visible={visible}
      title="Request Reversal"
      intro={batter
        ? 'The owner reviews every reversal. If approved, the raw ingredients come back and the five prepared bottles are removed. The batch stays in the history.'
        : 'The owner reviews every reversal. If approved, a reversing entry is posted and this entry stays in the history.'}
      confirmTitle="Send this reversal request?"
      confirmIntro="The owner will be asked to approve or reject it. You cannot edit the request after sending it."
      heading={`${entryReversalTypeLabel(entry.type)} · ${entry.reference}`}
      lines={[
        { id: 'type', label: 'Entry type', value: entryReversalTypeLabel(entry.type) },
        { id: 'item', label: 'Item', value: entry.itemName },
        { id: 'quantity', label: 'Quantity', value: entry.quantityLabel },
      ]}
      reasonPlaceholder="e.g. Entered 5 kg instead of 2 kg"
      reasonAccessibilityLabel="Reason for the reversal, required"
      maxLength={ENTRY_REVERSAL_REASON_MAX_LENGTH}
      submitLabel="Send Request"
      validateReason={validateEntryReversalReason}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
