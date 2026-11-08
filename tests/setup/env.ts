// Test defaults. CI provides DATABASE_URL; everything else is safe to fake here.
process.env.APP_URL ??= "http://localhost:3000";
process.env.OTP_PEPPER ??= "test-otp-pepper-test-otp-pepper-0123456789";
process.env.SESSION_SECRET ??= "test-session-secret-test-session-secret-0123";
process.env.MAIL_TRANSPORT = "memory";
