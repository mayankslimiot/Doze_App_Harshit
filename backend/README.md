"# dozemate-backend

## Google Sign-In (mobile)

For **Sign in with Google** on the Android app, set `OAUTH_GOOGLE_CLIENT_ID` to your **Web client ID** (OAuth 2.0 client type "Web application" from Firebase/Google Cloud Console). The app sends a Google idToken to `POST /api/auth/google-idtoken`; the backend verifies it with this client ID and returns the same JWT + user shape as email login." 
