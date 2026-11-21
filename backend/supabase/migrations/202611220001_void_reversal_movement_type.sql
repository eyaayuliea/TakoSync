-- ST-07 / OW-26 / OM-15 (Charter Rev 8 BR-S4, BE-06): an approved void puts a
-- sale's consumed ingredients back with "Void Reversal" ledger entries.
--
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it, and 202611220002 references it in constraints.
alter type public.inventory_transaction_type add value if not exists 'void_reversal';
