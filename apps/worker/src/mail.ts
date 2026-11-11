import { Queue } from "bullmq";
import { QUEUES } from "@smm/shared";
import { connection, logger } from "./lib";

/**
 * Transactional email (Resend free tier). API and worker both enqueue; only the worker sends,
 * so a slow mail provider never slows down a web request.
 */
export interface EmailJob {
  to: string;
  subject: string;
  title: string;
  lines: string[];
  cta?: { label: string; path: string };
}

const APP = () => process.env.APP_NAME ?? "Panel";
const WEB = () => process.env.WEB_URL ?? "http://localhost:3000";

export const emailQueue = new Queue<EmailJob>(QUEUES.emails, {
  connection,
  defaultJobOptions: { attempts: 4, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 500, removeOnFail: 1000 },
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(job: EmailJob) {
  const href = job.cta ? `${WEB()}${job.cta.path}` : null;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1a17">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:520px;background:#fff;border:1px solid #e6e3dc;border-radius:14px"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:600;font-size:15px">${esc(APP())}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(job.title)}</h1>
${job.lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#45423b">${esc(l)}</p>`).join("")}
${href ? `<p style="margin:24px 0 0"><a href="${esc(href)}" style="display:inline-block;background:#c4461c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${esc(job.cta!.label)}</a></p>` : ""}
<p style="margin:28px 0 0;font-size:12px;color:#6b675f">You can change which emails you get in Account → Notifications.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [job.title, "", ...job.lines, ...(href ? ["", `${job.cta!.label}: ${href}`] : [])].join("\n");
  return { html, text };
}

export async function sendEmail(job: EmailJob) {
  const key = process.env.RESEND_API_KEY;
  const { html, text } = render(job);
  if (!key) {
    logger.info({ to: job.to, subject: job.subject }, "email (dev — RESEND_API_KEY not set)");
    return { skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? `${APP()} <no-reply@example.com>`, to: job.to, subject: job.subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429 || res.status >= 500) throw new Error(`resend ${res.status}`); // retry later
  if (!res.ok) logger.error({ status: res.status, body: await res.text() }, "resend rejected email");
  return { sent: res.ok };
}
