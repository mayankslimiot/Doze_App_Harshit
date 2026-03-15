/**
 * Google Sign-In configuration
 * 
 * webClientId: Web client ID (OAuth 2.0 type "Web application") from Firebase Console.
 *              Used for Android and backend token verification.
 *              Package: com.slimiot.dozemate1 (from app.json / android/app/build.gradle)
 * 
 * iosClientId: iOS client ID from GoogleService-Info.plist (CLIENT_ID key).
 *              Required for iOS Google Sign-In.
 *              Bundle ID: com.slimiot.dozemate1 (from app.json)
 */
export const GOOGLE_WEB_CLIENT_ID =
  '1034636618673-54oca3ie06ok9q4jbbvkf1ogf13b4kp3.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  '1034636618673-pip5kkij8nen5cnnc60s7p3bgrclndne.apps.googleusercontent.com';
