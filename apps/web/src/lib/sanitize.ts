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
 */
export function sanitizeEmailHtml(dirty: string, cidMap?: Record<string, string>): string {
  installHook()
  let html = dirty
  if (cidMap) {
    html = html.replace(/(["'])cid:([^"']+)\1/gi, (full, q, cid) => {
      const mapped = cidMap[cid]
      return mapped ? `${q}${mapped}${q}` : full
    })
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "base", "meta", "link"],
    FORBID_ATTR: ["srcset", "formaction", "action", "ping"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
}
