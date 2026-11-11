import { env } from "../env";
import { logger } from "./logger";

/** Sends transactional email through Resend (free tier). Logs instead when no key is configured. */
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.info({ to, subject, text }, "mail (dev — RESEND_API_KEY not set)");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, html, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) logger.error({ status: res.status, body: await res.text() }, "resend failed");
}

const layout = (title: string, body: string, cta?: { href: string; label: string }) => `<!doctype html>
<html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1a17">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:520px;background:#fff;border:1px solid #e6e3dc;border-radius:14px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:600;font-size:15px">${env.APP_NAME}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:#4a4740">${body}</div>
${cta ? `<p style="margin:28px 0 8px"><a href="${cta.href}" style="display:inline-block;background:#e5582b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${cta.label}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#8a857c;word-break:break-all">Or paste this link into your browser:<br>${cta.href}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;

export const mailTemplates = {
  verify: (url: string) => ({
    subject: `Confirm your email for ${env.APP_NAME}`,
    html: layout("Confirm your email", "Click the button below to confirm this address. The link expires in 24 hours.", {
      href: url,
      label: "Confirm email",
    }),
    text: `Confirm your email: ${url} (expires in 24 hours)`,
  }),
  reset: (url: string) => ({
    subject: `Reset your ${env.APP_NAME} password`,
    html: layout(
      "Reset your password",
      "We got a request to reset your password. The link expires in 1 hour. If you didn't ask for this, you can ignore this email.",
      { href: url, label: "Choose a new password" },
    ),
    text: `Reset your password: ${url} (expires in 1 hour)`,
  }),
};
