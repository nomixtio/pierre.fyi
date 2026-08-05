interface ContactPayload {
  name?: string;
  email?: string;
  message?: string;
  website?: string;
  turnstileToken?: string;
}

const CONTACT_ACTION = "contact";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function verifyTurnstile(
  token: string | undefined,
  request: Request,
  env: Env,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return false;

  const expectedHostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048 ||
    expectedHostnames.size === 0
  ) {
    return false;
  }

  const remoteip = request.headers.get("CF-Connecting-IP");
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
  });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body,
    });

    if (!response.ok) return false;

    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };

    return (
      result.success === true &&
      result.action === CONTACT_ACTION &&
      typeof result.hostname === "string" &&
      expectedHostnames.has(result.hostname)
    );
  } catch {
    return false;
  }
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  let payload: ContactPayload;

  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  if (!(await verifyTurnstile(payload.turnstileToken, request, env))) {
    return jsonResponse({ error: "Verification failed. Please try again." }, 403);
  }

  // Honeypot: bots fill hidden fields; pretend success.
  if (payload.website?.trim()) {
    return jsonResponse({ ok: true });
  }

  const name = payload.name?.trim() ?? "";
  const email = payload.email?.trim() ?? "";
  const message = payload.message?.trim() ?? "";

  if (!name || name.length > 120) {
    return jsonResponse({ error: "Please enter a valid name." }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonResponse({ error: "Please enter a valid email address." }, 400);
  }

  if (!message || message.length < 10 || message.length > 5000) {
    return jsonResponse({ error: "Message must be between 10 and 5000 characters." }, 400);
  }

  if (!env.CONTACT_TO_EMAIL) {
    return jsonResponse({ error: "Contact form is not configured yet." }, 503);
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");

  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO_EMAIL,
      from: { email: "contact@pierre.fyi", name: "pierre.fyi contact form" },
      replyTo: { email, name },
      subject: `New message from ${name} via pierre.fyi`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: `
        <h2>New contact form submission</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      `,
    });
  } catch (error) {
    console.error("Failed to send contact email:", error);
    return jsonResponse({ error: "Unable to send your message right now. Please try again later." }, 502);
  }

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/config" && request.method === "GET") {
      return jsonResponse({
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      });
    }

    if (url.pathname === "/api/contact") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      if (request.method === "POST") {
        return handleContact(request, env);
      }

      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
