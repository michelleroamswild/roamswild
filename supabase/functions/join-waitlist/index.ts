import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sendConfirmationEmail(email: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping confirmation email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoamsWild <hello@roamswild.com>",
        to: [email],
        subject: "You're on the RoamsWild waitlist!",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the Waitlist - RoamsWild</title>
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
<body style="margin: 0; padding: 0; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #e9e5d4;">
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
                You're on the list!
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #5c5b4a;">
                Thanks for signing up for early access to RoamsWild. We're building the ultimate road trip planning tool for adventurers who love dispersed camping, scenic routes, and getting off the beaten path.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #5c5b4a;">
                We're letting people in gradually to make sure everything runs smoothly. When it's your turn, you'll receive an email with your personal invite code.
              </p>

              <hr style="border: none; border-top: 1px solid #e9e5d4; margin: 24px 0;">

              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #5c5b4a;">
                See you on the trails soon!
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
    }
  } catch (err) {
    console.error("Failed to send confirmation email:", err);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Use RPC to bypass PostgREST schema cache issue
    const { data, error } = await supabase.rpc("add_to_waitlist", {
      p_email: email.toLowerCase().trim()
    });

    if (error) {
      console.error("RPC error:", error);
      throw error;
    }

    // Check if the function returned an error (duplicate)
    if (data?.error === "already_exists") {
      return new Response(
        JSON.stringify({ error: "You're already on the waitlist!" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send confirmation email (don't await - fire and forget)
    sendConfirmationEmail(email.toLowerCase().trim());

    return new Response(
      JSON.stringify({ success: true, message: "You've been added to the waitlist!" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Waitlist error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
