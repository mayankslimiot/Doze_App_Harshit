import { BlurView } from 'expo-blur';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const { width } = Dimensions.get('window');

export interface AlertButton {
  text: string;
  onPress: () => void;
  style?: 'default' | 'primary';
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: AlertButton[];
  onClose?: () => void;
  isLight?: boolean;
}

const CustomAlert: React.FC<CustomAlertProps> = ({ visible, title, message, buttons, onClose, isLight }) => {
  // Default single OK button if no buttons provided
  const alertButtons = buttons || [
    {
      text: 'OK',
      onPress: () => {
        if (onClose) onClose();
      },
      style: 'primary' as const
    }
  ];

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      {/* Full screen blur overlay */}
      <BlurView intensity={1000} tint={isLight ? 'light' : 'dark'} style={styles.fullScreenBlur}>
        {/* Additional dark overlay for better contrast */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.darkOverlay}>
            {/* Modal container - prevent dismiss when clicking inside */}
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContainer, isLight && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
                <Text style={[styles.modalTitle, isLight && { color: '#111111' }]}>{title}</Text>
                <Text style={[styles.modalMessage, isLight && { color: '#666666' }]}>{message}</Text>
                
                {/* Buttons container */}
                <View style={alertButtons.length > 1 ? styles.buttonsRow : styles.buttonsSingle}>
                  {alertButtons.map((button, index) => {
                    const isPrimary = button.style === 'primary' || alertButtons.length === 1;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.modalButton,
                          alertButtons.length > 1 && styles.modalButtonHalf,
                          isPrimary ? styles.modalButtonPrimary : styles.modalButtonSecondary,
                          isPrimary && isLight && { backgroundColor: '#0061A4' },
                          !isPrimary && isLight && { backgroundColor: '#F0F2F5', borderColor: 'rgba(0,0,0,0.06)' },
                          index > 0 && alertButtons.length > 1 && { marginLeft: 10 }
                        ]}
                        onPress={button.onPress}
                      >
                        <Text style={[
                          styles.modalButtonText,
                          isPrimary ? styles.modalButtonTextPrimary : styles.modalButtonTextSecondary,
                          isPrimary && isLight && { color: '#FFFFFF' },
                          !isPrimary && isLight && { color: '#666666' }
                        ]}>
                          {button.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreenBlur: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  darkOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: width * 0.85,
    maxWidth: 400,
    backgroundColor: '#070a2aff',
    borderRadius: 25,
    padding: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  buttonsSingle: {
    width: '100%',
  },
  buttonsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalButtonHalf: {
    flex: 1,
  },
  modalButtonPrimary: {
    backgroundColor: '#FFFFFF',
  },
  modalButtonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtonTextPrimary: {
    color: '#1D244D',
  },
  modalButtonTextSecondary: {
    color: '#FFFFFF',
  },
});

export default CustomAlert;