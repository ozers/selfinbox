import DOMPurify from "dompurify"

let hookInstalled = false

function installHook() {
  if (hookInstalled) return
  hookInstalled = true

  // Force every <a> to open in a new tab and strip Referer + window.opener.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank")
      node.setAttribute("rel", "noopener noreferrer nofollow")
    }
    // Remove any data:* image src that isn't an actual image MIME — blocks
    // polyglot tricks like data:text/html.
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || ""
      if (src.startsWith("data:") && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(src)) {
        node.removeAttribute("src")
      }
    }
  })
}

/**
 * Sanitize untrusted email HTML before rendering. Strips scripts, event
 * handlers, dangerous URL schemes, and forces all links to open safely.
 *
 * If `cidMap` is provided, every `<img src="cid:xxx">` reference whose CID
 * is present in the map is rewritten to the mapped URL (typically a blob:
 * URL we built from the inline-image attachment bytes). References without
 * a mapping are stripped so the email doesn't try to phone home to an
 * upstream the user never approved.
 *
 * CID rewriting is done AFTER sanitization, on a parsed DOM tree, so we
 * never inject the mapped URL into a raw HTML string where attribute
 * quoting could be subverted by a malicious cidMap entry.
 */
export function sanitizeEmailHtml(dirty: string, cidMap?: Record<string, string>): string {
  installHook()

  // First pass: full sanitization, allowing `cid:` URIs through so we can
  // identify them in the parsed DOM afterwards.
  const cleanFragment = DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "base", "meta", "link"],
    FORBID_ATTR: ["srcset", "formaction", "action", "ping"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment

  if (cidMap) {
    // Walk the sanitized DOM and rewrite cid: references via setAttribute.
    // The browser handles attribute quoting; nothing the cidMap can contain
    // breaks out of the attribute context. References without a mapping
    // are removed so the message can't reach a remote tracker via the
    // referenced inline-image fallback URL.
    const imgs = cleanFragment.querySelectorAll("img[src]")
    imgs.forEach((img) => {
      const src = img.getAttribute("src") || ""
      if (!src.toLowerCase().startsWith("cid:")) return
      const cid = src.slice(4)
      const mapped = cidMap[cid]
      if (mapped) {
        img.setAttribute("src", mapped)
      } else {
        img.removeAttribute("src")
      }
    })
  }

  // Re-serialize the fragment back to an HTML string for React's
  // dangerouslySetInnerHTML consumer. Use a temporary container so we
  // capture all top-level nodes (text + elements).
  const wrapper = document.createElement("div")
  wrapper.appendChild(cleanFragment)
  return wrapper.innerHTML
}
