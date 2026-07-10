const express = require("express");
const authController = require("../controllers/authController");


const router = express.Router();

// Register
router.post("/register", authController.register);

// Register Simple (for mobile app - simplified registration)
router.post("/register-simple", authController.registerSimple);

// Login
router.post("/login", authController.login);
router.post("/first-login-change-password", authController.firstLoginChangePassword);

// Email verification
router.get("/verify/:token", authController.verifyEmail);

// OAuth2 (Google)
router.post("/google-idtoken", authController.googleIdToken);
router.get("/google", authController.googleAuth);
router.get("/google/callback", authController.googleCallback);

// OAuth2 (Apple)
router.post("/apple-idtoken", authController.appleIdToken);

// Password reset (web - email link)
router.post("/forgot", authController.forgotPassword);
router.post("/reset/:token", authController.resetPassword);

// Password reset (mobile - 6-digit code)
router.post("/forgot-mobile", authController.forgotPasswordMobile);
router.post("/verify-reset-code", authController.verifyResetCode);
router.post("/reset-password-mobile", authController.resetPasswordMobile);

module.exports = router;
