import "@fontsource-variable/inter";
import "./style.css";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealElements = document.querySelectorAll<HTMLElement>(".reveal");

if (prefersReducedMotion) {
  revealElements.forEach((el) => el.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
  );

  revealElements.forEach((el) => observer.observe(el));
}

const contactForm = document.querySelector<HTMLFormElement>("#contact-form");
const contactStatus = document.querySelector<HTMLElement>("#contact-status");
let contactTurnstileWidgetId: string | undefined;

async function getTurnstileSiteKey(): Promise<string | undefined> {
  try {
    const response = await fetch("/api/config");
    if (response.ok) {
      const data = (await response.json()) as { turnstileSiteKey?: string | null };
      if (data.turnstileSiteKey) return data.turnstileSiteKey;
    }
  } catch {
    // Vite dev server has no Worker API — fall back to .env
  }

  return import.meta.env.VITE_TURNSTILE_SITE_KEY;
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile."));
    document.body.appendChild(script);
  });
}

if (contactForm && contactStatus) {
  const submitButton = contactForm.querySelector<HTMLButtonElement>(".contact-submit");

  const setStatus = (message: string, type: "idle" | "success" | "error" = "idle") => {
    contactStatus.textContent = message;
    contactStatus.classList.remove("is-success", "is-error");
    if (type === "success") contactStatus.classList.add("is-success");
    if (type === "error") contactStatus.classList.add("is-error");
  };

  void (async () => {
    const turnstileSiteKey = await getTurnstileSiteKey();

    if (!turnstileSiteKey) {
      submitButton?.setAttribute("disabled", "true");
      setStatus("Contact form verification is not configured.", "error");
      return;
    }

    try {
      await loadTurnstileScript();

      const container = document.querySelector("#contact-turnstile");
      if (!container || !window.turnstile) {
        throw new Error("Turnstile container missing.");
      }

      contactTurnstileWidgetId = window.turnstile.render("#contact-turnstile", {
        sitekey: turnstileSiteKey,
        action: "contact",
        theme: "dark",
      });
    } catch {
      submitButton?.setAttribute("disabled", "true");
      setStatus("Unable to load verification. Please refresh the page.", "error");
    }
  })();

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!submitButton) return;

    const turnstileToken =
      contactTurnstileWidgetId !== undefined
        ? window.turnstile?.getResponse(contactTurnstileWidgetId)
        : undefined;

    if (!turnstileToken) {
      setStatus("Please complete the verification.", "error");
      return;
    }

    const formData = new FormData(contactForm);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
      website: String(formData.get("website") ?? ""),
      turnstileToken,
    };

    submitButton.disabled = true;
    setStatus("Sending...");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Unable to send your message.");
      }

      contactForm.reset();
      setStatus("Message sent — I'll get back to you soon.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send your message.";
      setStatus(message, "error");
    } finally {
      submitButton.disabled = false;
      if (contactTurnstileWidgetId !== undefined) {
        window.turnstile?.reset(contactTurnstileWidgetId);
      }
    }
  });
}

// Cursor-following gradient: a spotlight glow trails the pointer with
// smooth easing, and hero blobs get a subtle parallax drift.
const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

if (!prefersReducedMotion && hasFinePointer) {
  const glow = document.createElement("div");
  glow.className = "mouse-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);

  const root = document.documentElement;
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 3;
  let currentX = targetX;
  let currentY = targetY;
  let rafId = 0;

  const render = () => {
    // Ease toward the pointer for a fluid, trailing motion
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;

    root.style.setProperty("--glow-x", `${currentX}px`);
    root.style.setProperty("--glow-y", `${currentY}px`);
    root.style.setProperty("--mx", `${(currentX / window.innerWidth - 0.5) * 2}`);
    root.style.setProperty("--my", `${(currentY / window.innerHeight - 0.5) * 2}`);

    if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
      rafId = requestAnimationFrame(render);
    } else {
      rafId = 0;
    }
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      glow.classList.add("is-active");
      if (!rafId) rafId = requestAnimationFrame(render);
    },
    { passive: true },
  );
}
