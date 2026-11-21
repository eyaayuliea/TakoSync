-- ST-13 / OW-26 c7 / OM-15 (Charter Rev 8 BR-I10, BE-06): an approved entry
-- reversal posts "Entry Reversal" ledger movements; the original stays as is.
--
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it, and 202611220004 references it in constraints.
alter type public.inventory_transaction_type add value if not exists 'entry_reversal';
