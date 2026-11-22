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
 * ST-07 c5, c7: whether this sale is voided and how the owner's review stands,
 * and the Void Sale action while it is still allowed (c1, c8).
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
    const request = state.request;
    const review = !request ? ''
      : request.status === 'pending_review' ? ' Owner review: Pending Review.'
      : request.status === 'reviewed' ? ` Owner review: Reviewed${request.decidedAt ? ` on ${approvalDateTime(request.decidedAt)}` : ''}.`
      : ` Owner review: Flagged${request.decisionReason ? `: “${request.decisionReason}”` : ''}.`;
    message = `VOID${request ? ` · ${request.reference}` : ''}. Voided`
      + `${request?.requestedAt ? ` on ${approvalDateTime(request.requestedAt)}` : ''}`
      + `${request?.requestedByName ? ` by ${request.requestedByName}` : ''}. This sale is not counted in sales`
      + ` totals and its ingredients were returned to stock.${review}`;
  } else {
    message = 'This sale has not been voided.';
  }
  return (
    <ApprovalStatusPanel
      title="Void"
      message={message}
      tone={tone}
      actionLabel={availability.allowed ? 'Void Sale' : undefined}
      onAction={availability.allowed ? onRequestVoid : undefined}
      hint={state.kind === 'none' && !availability.allowed ? availability.reason : undefined}
    />
  );
}

/**
 * ST-07 c2–c4: the void form. It shows the sale, requires a reason, and asks
 * for a confirmation before the sale is voided.
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
      title="Void Sale"
      intro="Voiding takes effect right away: the sale is marked VOID, leaves the sales totals, and its ingredients return to stock. The owner reviews every void."
      confirmTitle="Void this sale?"
      confirmIntro="This cannot be undone. The void is saved with your employee account and the time, and is sent to the owner for review."
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
      submitLabel="Void Sale"
      validateReason={validateSaleVoidReason}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
