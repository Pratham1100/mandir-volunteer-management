
const origin = Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173";

const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return reply({ ok: false }, 405);
  }

  const genericMessage = {
    ok: true,
    message:
      "If an active account matches those details, a password reset email will be sent to its registered email address.",
  };

  try {
    const { identifier } = await req.json();

    if (typeof identifier !== "string" || identifier.trim().length < 3) {
      return reply({
        ok: false,
        message: "Enter your registered ID, mobile or email.",
      }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKeys = JSON.parse(
      Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!
    );
    const secretKeys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS")!
    );

    const publishableKey = publishableKeys.default;
    const secretKey = secretKeys.default;

    const value = identifier.trim();
    let column: string;
    let lookupValue: string;

    if (value.includes("@")) {
      column = "email";
      lookupValue = value.toLowerCase();
    } else if (/^[+\d\s().-]+$/.test(value)) {
      column = "mobile";
      lookupValue = value.replace(/\D/g, "");
    } else {
      column = "volunteer_code";
      lookupValue = value;
    }

    const lookupUrl = new URL(`${url}/rest/v1/volunteers`);
    lookupUrl.searchParams.set("select", "email,is_active");
    lookupUrl.searchParams.set(column, `eq.${lookupValue}`);
    lookupUrl.searchParams.set("limit", "1");

    const lookupResponse = await fetch(lookupUrl, {
      headers: {
        apikey: secretKey,
        Accept: "application/json",
      },
    });

    if (!lookupResponse.ok) {
      console.error("Password reset lookup failed:", lookupResponse.status);
      return reply(genericMessage);
    }

    const rows = await lookupResponse.json();
    const volunteer = rows?.[0];

    if (volunteer?.email && volunteer.is_active) {
      const recoveryUrl = new URL(`${url}/auth/v1/recover`);
recoveryUrl.searchParams.set("redirect_to", `${origin}/reset-password`);

const recoveryResponse = await fetch(recoveryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
        },
        body: JSON.stringify({
          email: volunteer.email,
          redirect_to: `${origin}/reset-password`,
        }),
      });

      if (!recoveryResponse.ok) {
        console.error("Password recovery request failed:", recoveryResponse.status);
      }
    }

    return reply(genericMessage);
  } catch (error) {
    console.error("Password reset function error:", error);
    return reply(genericMessage);
  }
});
