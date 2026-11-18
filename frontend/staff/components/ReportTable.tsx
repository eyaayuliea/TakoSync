import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { staffColors, staffSpacing, staffTypography } from '../theme/staffTokens';

export type ReportColumn = { key: string; label: string; flex?: number; numberOfLines?: number };

export default function ReportTable({ columns, rows }: { columns: ReportColumn[]; rows: Array<Record<string, string | number | null | undefined>> }) {
  return <View style={styles.table}><View style={styles.header}>{columns.map((column) => <Text key={column.key} style={[styles.headerText, { flex: column.flex ?? 1 }]} numberOfLines={1}>{column.label}</Text>)}</View>{rows.map((row, index) => <View key={`${index}-${String(row[columns[0]?.key ?? ''])}`} style={styles.row}>{columns.map((column) => <Text key={column.key} style={[styles.cell, { flex: column.flex ?? 1 }]} numberOfLines={column.numberOfLines ?? 2} accessibilityLabel={`${column.label}: ${String(row[column.key] ?? '')}`}>{String(row[column.key] ?? '—')}</Text>)}</View>)}</View>;
}

export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  table: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: staffColors.divider, borderRadius: 12, backgroundColor: staffColors.surface },
  header: { flexDirection: 'row', gap: staffSpacing.sm, padding: staffSpacing.md, backgroundColor: staffColors.background },
  headerText: { ...staffTypography.label, color: staffColors.navy },
  row: { flexDirection: 'row', gap: staffSpacing.sm, padding: staffSpacing.md, borderTopWidth: 1, borderTopColor: staffColors.divider },
  cell: { ...staffTypography.detail, color: staffColors.text },
  section: { gap: staffSpacing.md },
  sectionTitle: { ...staffTypography.title, color: staffColors.navy },
});

