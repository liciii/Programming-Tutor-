import nodemailer from 'nodemailer';

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file.');
  }
  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    // print the full SMTP conversation to server console so you can see
    // exactly what Gmail accepts or rejects
    logger: true,
    debug: true,
  });
}

export function sendPasswordResetEmail(to, token) {
  return new Promise((resolve, reject) => {
    let transporter;
    try {
      transporter = createTransport();
    } catch (err) {
      return reject(err);
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;

    transporter.sendMail(
      {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: 'Reset your CodeTutor AI password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1117;color:#e2e8f0;border-radius:12px">
            <h2 style="margin:0 0 8px;font-size:22px">Reset your password</h2>
            <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
              We received a request to reset the password for your CodeTutor AI account.
            </p>
            <a href="${resetUrl}" style="display:inline-block;padding:11px 22px;background:#4f8ef7;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px">
              Reset password
            </a>
            <p style="color:#64748b;margin:24px 0 0;font-size:12px">
              This link expires in 1 hour. If you didn't request a password reset you can safely ignore this email.
            </p>
          </div>
        `,
      },
      (err, info) => {
        transporter.close();
        if (err) {
          console.error('sendMail error:', err.message);
          reject(err);
        } else {
          resolve(info);
        }
      },
    );
  });
}
