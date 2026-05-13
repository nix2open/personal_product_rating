import type { Env } from "./types";

export async function sendMagicLinkEmail(
  env: Env,
  to: string,
  link: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return { ok: false, error: "email_not_configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [to],
      subject: "Your sign-in link",
      html: `<p>Click to sign in:</p><p><a href="${link}">${link}</a></p>`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t.slice(0, 200) };
  }
  return { ok: true };
}
