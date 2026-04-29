const nodemailer = require("nodemailer");

const isEmailConfigured = () =>
  Boolean(
    (process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS) ||
      (process.env.EMAIL_USER && process.env.EMAIL_PASS)
  );

const createTransporter = () => {
  if (!isEmailConfigured()) {
    throw new Error(
      "La configuration email est incomplete. Renseignez SMTP_* ou EMAIL_USER / EMAIL_PASS."
    );
  }

  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const getDefaultFromAddress = () =>
  process.env.REPORT_EMAIL_FROM ||
  process.env.SMTP_USER ||
  process.env.EMAIL_USER ||
  "no-reply@comdis.local";

const sendReportEmail = async (htmlContent) => {
  const transporter = createTransporter();

  return transporter.sendMail({
    from: getDefaultFromAddress(),
    to: process.env.EMAIL_USER || process.env.SMTP_USER,
    subject: "Rapport journalier - Point de Vente Est",
    html: htmlContent,
  });
};

module.exports = {
  isEmailConfigured,
  sendReportEmail,
};
