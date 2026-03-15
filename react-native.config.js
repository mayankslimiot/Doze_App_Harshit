module.exports = {
  dependencies: {
    // Android autolinking disabled to avoid "Cannot resolve symbol ReactNativeFirebaseAppPackage" in Android Studio.
    // iOS autolinking MUST stay enabled — the Expo plugin generates `import FirebaseCore` in AppDelegate.swift.
    '@react-native-firebase/app': {
      platforms: {
        android: null,
      },
    },
    '@react-native-firebase/messaging': {
      platforms: {
        android: null,
      },
    },
  },
};
