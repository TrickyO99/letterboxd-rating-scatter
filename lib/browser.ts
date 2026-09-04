import { chromium as playwrightChromium, type Browser, type BrowserContext } from "playwright-core";

// Next.js dev-mode hot reload re-evaluates modules on every edit, which would
// otherwise leak a new browser process each time. Stashing the singleton on
// globalThis survives module reloads within the same server process. On
// Vercel it also lets a warm serverless function instance reuse the browser
// across requests instead of relaunching it every time.
declare global {
  // eslint-disable-next-line no-var
  var __lbBrowser: Promise<Browser> | undefined;
  // eslint-disable-next-line no-var
  var __lbContext: Promise<BrowserContext> | undefined;
}

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    // Vercel's serverless functions have no display and can't bundle a full
    // ~300MB local Chromium install, so use the Lambda-optimized build.
    const { default: chromium } = await import("@sparticuz/chromium");
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // Local dev: the full browser installed via `npx playwright install
  // chromium`. Headful (not headless) — found empirically to be
  // noticeably more reliable at passing Cloudflare's JS challenge. In
  // Docker there's no display to be headful with, so DOCKER=1 (set in
  // homeserver/docker-compose.yml) forces headless there instead.
  return playwrightChromium.launch({
    headless: Boolean(process.env.DOCKER),
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

function getBrowser(): Promise<Browser> {
  if (!globalThis.__lbBrowser) {
    globalThis.__lbBrowser = launchBrowser();
  }
  return globalThis.__lbBrowser;
}

// Cloudflare's bot detection checks for common automation tells
// (navigator.webdriver, missing window.chrome, empty plugins/mimeTypes).
// Patch them out so the page looks like a normal Chrome tab.
const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
`;

export function getContext(): Promise<BrowserContext> {
  if (!globalThis.__lbContext) {
    globalThis.__lbContext = getBrowser().then(async (browser) => {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 900 },
        locale: "en-US",
      });
      await context.addInitScript(STEALTH_INIT_SCRIPT);
      return context;
    });
  }
  return globalThis.__lbContext;
}
