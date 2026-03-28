import { Resend } from 'resend';
// Sender address — must be a verified domain in your Resend account.
const FROM = 'Nakiros <invitation@nakiros.com>';
export async function sendInvitationEmail(apiKey, opts) {
    const { to, orgName, invitedBy } = opts;
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
        from: FROM,
        to: [to],
        subject: `${invitedBy} invited you to join ${orgName} on Nakiros`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: 'DM Sans', 'Segoe UI Variable', 'Segoe UI', 'Helvetica Neue', 'Noto Sans', sans-serif; font-size: 16px; line-height: 1.6; color: #333333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px;">
            <tr>
              <td align="center" style="padding: 40px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="padding-bottom: 28px;">
                      <img src="https://nakiros.com/logo.png" alt="Nakiros" style="width: 40px; height: auto;">
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom: 12px;">
                      <h1 style="color: #333333; font-size: 24px; font-weight: 700; margin: 0;">You're invited to join ${orgName}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <p style="margin: 0; color: #666666; font-size: 15px;">
                        <strong style="color: #333333;">${invitedBy}</strong> has invited you to collaborate on <strong style="color: #333333;">${orgName}</strong> in Nakiros — the AI-powered workspace for engineering teams.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <a href="https://nakiros.com" style="display: inline-block; padding: 12px 24px; background-color: #0d9e9e; color: #ffffff; border: 1px solid #0d9e9e; border-radius: 10px; text-decoration: none; font-family: inherit; font-size: 16px; font-weight: 600; line-height: 1.25; text-align: center;">
                        Get started with Nakiros
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <p style="margin: 0; color: #999999; font-size: 13px;">
                        Open the Nakiros desktop app and sign in with this email address — you'll automatically join <strong style="color: #666666;">${orgName}</strong>.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top: 24px; border-top: 1px solid #f0f0f0;">
                      <p style="margin: 0; color: #bbbbbb; font-size: 12px;">
                        Don't have an account yet? Download the app at <a href="https://nakiros.com" style="color: #0d9e9e; text-decoration: none;">nakiros.com</a>.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`,
    });
    if (error) {
        // Non-fatal — invitation is already stored in DB
        console.error('[email] Resend error:', error);
    }
}
