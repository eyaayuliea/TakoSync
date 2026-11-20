import React, { createContext, useContext } from 'react';
import { Modal, View, type ModalProps } from 'react-native';

export const SessionDisplayContext = createContext({
  locked: false,
  recordActivity: () => {},
});

export default function SessionProtectedModal({ children, visible = true, ...props }: ModalProps) {
  const { locked, recordActivity } = useContext(SessionDisplayContext);
  if (locked) return null;
  return (
    <Modal {...props} visible={visible}>
      <View style={{ flex: 1 }} onTouchStart={recordActivity}>
        {children}
      </View>
    </Modal>
  );
}
