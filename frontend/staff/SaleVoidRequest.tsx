import React from 'react';
import {
  SALE_VOID_REASON_MAX_LENGTH,
  validateSaleVoidReason,
  type SaleVoidAvailability,
  type SaleVoidState,
} from '../services/saleVoids';
import { ApprovalStatusPanel, ReasonRequestModal, approvalDateTime } from './OwnerApprovalRequest';

function money(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type SaleVoidRequestSale = {
  transactionReference: string;
  totalAmount: number;
  lines: Array<{ id: string; name: string; variantLabel: string | null; quantity: number; subtotal: number }>;
};

/**
 * ST-07 c5, c7, c9: what happened to this sale's void, and the Request Void
 * action when it is still allowed (c1, c6).
 */
export function SaleVoidStatusPanel({
  state,
  availability,
  onRequestVoid,
}: {
  state: SaleVoidState;
  availability: SaleVoidAvailability;
  onRequestVoid: () => void;
}) {
  let message: string;
  let tone: 'error' | 'warning' | 'neutral' = 'neutral';
  if (state.kind === 'voided') {
    tone = 'error';
    message = `Voided${state.request?.decidedAt ? ` on ${approvalDateTime(state.request.decidedAt)}` : ''}`
      + `${state.request?.decidedByName ? ` by ${state.request.decidedByName}` : ''}. This sale is not counted in sales`
      + ' totals and its ingredients were returned to stock.';
  } else if (state.kind === 'pending') {
    tone = 'warning';
    message = `Void request ${state.request.reference} is Pending (sent ${approvalDateTime(state.request.requestedAt)}).`
      + ' The sale still counts in the totals until the owner decides.';
  } else if (state.kind === 'rejected') {
    message = `The owner rejected void request ${state.request.reference}`
      + `${state.request.decisionReason ? `: “${state.request.decisionReason}”` : ''}. The sale stays Completed.`;
  } else {
    message = 'No void has been requested for this sale.';
  }
  const showHint = !availability.allowed && (state.kind === 'none' || state.kind === 'rejected');
  return (
    <ApprovalStatusPanel
      title="Void"
      message={message}
      tone={tone}
      actionLabel={availability.allowed ? 'Request Void' : undefined}
      onAction={availability.allowed ? onRequestVoid : undefined}
      hint={showHint && !availability.allowed ? availability.reason : undefined}
    />
  );
}

/**
 * ST-07 c2–c4: the void request form. It shows the sale, requires a reason,
 * and asks for a confirmation before saving.
 */
export function SaleVoidRequestModal({
  visible,
  sale,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  sale: SaleVoidRequestSale | null;
  onClose: () => void;
  onSubmit: (reason: string, clientRequestId: string) => Promise<void>;
}) {
  if (!sale) return null;
  return (
    <ReasonRequestModal
      visible={visible}
      title="Request Void"
      intro="The owner reviews every void. The sale stays recorded and counted until it is approved."
      confirmTitle="Send this void request?"
      confirmIntro="The owner will be asked to approve or reject it. You cannot edit the request after sending it."
      heading={sale.transactionReference}
      lines={sale.lines.map((line) => ({
        id: line.id,
        label: `${line.quantity} × ${line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ''}`,
        value: money(line.subtotal),
      }))}
      totalLine={{ id: 'total', label: 'Total', value: money(sale.totalAmount) }}
      reasonPlaceholder="e.g. Wrong flavor entered"
      reasonAccessibilityLabel="Reason for the void, required"
      maxLength={SALE_VOID_REASON_MAX_LENGTH}
      submitLabel="Send Request"
      validateReason={validateSaleVoidReason}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
