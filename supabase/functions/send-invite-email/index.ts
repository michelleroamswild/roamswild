import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, inviteCode } = await req.json();

    if (!email || !inviteCode) {
      return new Response(
        JSON.stringify({ error: "Email and invite code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signupUrl = "https://roamswild.com/signup";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoamsWild <hello@roamswild.com>",
        to: [email],
        subject: "Your RoamsWild invite is here!",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited - RoamsWild</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #e9e5d4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e9e5d4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(63, 62, 44, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3f3e2c; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #e9e5d4; letter-spacing: -0.5px;">
                RoamsWild
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #a5c94a; font-weight: 500;">
                Your adventure awaits
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #3f3e2c;">
                You're in!
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #5c5b4a;">
                Great news! You've been approved for early access to RoamsWild. Use the invite code below to create your account and start planning your next adventure.
              </p>

              <!-- Invite Code Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 24px 0;">
                <tr>
                  <td style="background-color: #f5f4ed; border-radius: 12px; padding: 24px; text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #7a7968; text-transform: uppercase; letter-spacing: 1px;">
                      Your Invite Code
                    </p>
                    <p style="margin: 0; font-size: 32px; font-weight: 700; color: #3f3e2c; letter-spacing: 2px;">
                      ${inviteCode}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="border-radius: 8px; background-color: #a5c94a;">
                    <a href="${signupUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #3f3e2c; text-decoration: none;">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border: none; border-top: 1px solid #e9e5d4; margin: 24px 0;">

              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #5c5b4a;">
                See you on the trails!
              </p>
              <p style="margin: 8px 0 0 0; font-size: 16px; font-weight: 500; color: #3f3e2c;">
                — The RoamsWild Team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f4ed; padding: 24px 40px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 500; color: #3f3e2c;">
                RoamsWild
              </p>
              <p style="margin: 0; font-size: 12px; color: #7a7968;">
                Discover your next adventure
              </p>
            </td>
          </tr>
        </table>

        <!-- Unsubscribe footer -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 520px; margin: 16px auto 0 auto;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #7a7968;">
                You received this email because you signed up for the RoamsWild waitlist.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Resend error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Invite email sent!" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Send invite error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
