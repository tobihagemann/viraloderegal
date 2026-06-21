import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../env.js';

// The single place SMTP is touched. The transport connects lazily on first send, so constructing it at
// module load never blocks boot on a reachable mail server.
let transport: Transporter | null = null;

function getTransport(): Transporter {
  transport ??=
    env.MAIL_TRANSPORT === 'json'
      ? createTransport({ jsonTransport: true })
      : createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        });
  return transport;
}

async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  await getTransport().sendMail({ from: env.SMTP_FROM, to, subject, html });
}

// better-auth's sendInvitationEmail hook passes the invitation `id` (no raw token); the accept link carries
// that same id to the SPA's accept-invite route, which posts it back to the app-owned accept endpoint.
export async function sendInvitationEmail(data: { id: string; email: string; organization: { name: string } }): Promise<void> {
  const acceptUrl = `${env.BETTER_AUTH_URL}/admin/accept-invite/${data.id}`;
  await sendMail({
    to: data.email,
    subject: 'Einladung zum Adminbereich von Viral oder Egal',
    html: `<p>Du wurdest eingeladen, dem Adminbereich von „${data.organization.name}“ beizutreten.</p>
<p>Öffne den folgenden Link, um ein Passwort festzulegen und beizutreten:</p>
<p><a href="${acceptUrl}">${acceptUrl}</a></p>
<p>Der Link ist 24 Stunden gültig.</p>`,
  });
}
