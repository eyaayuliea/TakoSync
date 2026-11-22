import React, { useState } from 'react';
import { OwnerTabs } from './shared/ownerComponents';
import SaleVoidRequestsScreen from './SaleVoidRequestsScreen';
import EntryReversalRequestsScreen from './EntryReversalRequestsScreen';

const KINDS = ['Voids', 'Entry Reversals'] as const;
type RequestKind = (typeof KINDS)[number];

/** OM-15 c1: one review section with tabs for Voids and Entry Reversal Requests. */
export default function OwnerRequestsScreen({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<RequestKind>('Voids');
  const switcher = <OwnerTabs items={KINDS} selected={kind} onSelect={(item) => setKind(item as RequestKind)} />;
  return kind === 'Voids'
    ? <SaleVoidRequestsScreen onBack={onBack} switcher={switcher} />
    : <EntryReversalRequestsScreen onBack={onBack} switcher={switcher} />;
}
