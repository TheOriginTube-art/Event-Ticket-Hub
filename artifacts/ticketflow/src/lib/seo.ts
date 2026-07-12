import { useEffect } from "react";

export const SITE_NAME = "TicketFlow";
export const DEFAULT_DESCRIPTION =
  "TicketFlow — афиша кино, театра и концертов. Выбирайте места на карте зала и покупайте билеты в пару кликов, без наценок.";
export const DEFAULT_IMAGE = `${import.meta.env.BASE_URL}og-default.jpg`;

export interface SeoOptions {
  /** Page-specific title. Rendered as "{title} — TicketFlow" (or just "TicketFlow" if omitted). */
  title?: string;
  description?: string;
  /** Absolute or relative image URL used for og:image / twitter:image. */
  image?: string;
  /** og:type, e.g. "website" or "event" (og:type doesn't have an official "event" value, but some crawlers still read the rest of the tags). */
  type?: string;
  /** Overrides the canonical URL (defaults to the current location). */
  url?: string;
  /** Set to true to tell crawlers not to index this page (e.g. checkout, admin). */
  noindex?: boolean;
}

function upsertMetaByName(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonicalLink(href: string): void {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function resolveImageUrl(image: string): string {
  try {
    return new URL(image, window.location.origin).toString();
  } catch {
    return image;
  }
}

/**
 * Updates `<title>` and meta tags (description, Open Graph, Twitter Card,
 * canonical) for the current page. Runs client-side only, since TicketFlow is
 * a pure SPA with no server-side rendering -- crawlers that don't execute
 * JavaScript (some chat apps / older link-preview bots) will still only see
 * the static defaults baked into index.html. Search engines and most modern
 * social platforms (which do render JS) will see the per-page tags below.
 */
export function useSeo({ title, description, image, type = "website", url, noindex }: SeoOptions): void {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Афиша кино, театра и концертов`;
    const desc = description || DEFAULT_DESCRIPTION;
    const resolvedImage = resolveImageUrl(image || DEFAULT_IMAGE);
    const resolvedUrl = url || window.location.href;

    document.title = fullTitle;
    upsertMetaByName("description", desc);
    upsertMetaByName("robots", noindex ? "noindex, nofollow" : "index, follow");

    upsertMetaByProperty("og:title", fullTitle);
    upsertMetaByProperty("og:description", desc);
    upsertMetaByProperty("og:type", type);
    upsertMetaByProperty("og:image", resolvedImage);
    upsertMetaByProperty("og:url", resolvedUrl);
    upsertMetaByProperty("og:site_name", SITE_NAME);

    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", fullTitle);
    upsertMetaByName("twitter:description", desc);
    upsertMetaByName("twitter:image", resolvedImage);

    upsertCanonicalLink(resolvedUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, type, url, noindex]);
}
