import { StyleSheet } from 'react-native';

export const reviewStyles = StyleSheet.create({
  card: { backgroundColor: '#FDFDFC', borderWidth: 1, borderColor: '#E3E3E6', borderRadius: 12, padding: 16, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approve: { backgroundColor: '#589144', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8 },
  approveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  reject: { borderWidth: 1, borderColor: '#B9244C', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8 },
  rejectText: { color: '#B9244C', fontSize: 10, fontWeight: '700' },
});
