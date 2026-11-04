/**
 * Shared deterministic HTTP(S) web-link validation.
 *
 * Scheme-less input is accepted only when it is an unambiguous domain-style
 * address: a dotted hostname, optional path/query/fragment, no user info,
 * no host:port, and no protocol-relative prefix. Accepted scheme-less links
 * are normalized by prepending https://. Unicode domain labels are validated
 * as labels and passed through the WHATWG URL parser, which applies IDNA
 * mapping deterministically; the stored URL keeps the parser's spelling.
 */
export const MAX_WEB_LINK_CODE_POINTS = 2048;
const MAX_HOST_LABEL = 63;
const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const HOST_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;
const FORBIDDEN_SURFACE = /[\s\u0000-\u001F\u007F-\u009F\\]/;

function codePointLength(value) {
  return Array.from(value).length;
}

function invalid(reason, message, field = 'link') {
  return { ok: false, field, reason, message };
}

function validateAbsoluteHttp(link) {
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return invalid('link-invalid', 'Link must be an absolute HTTP(S) URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return invalid('link-scheme', 'Link must use http or https.');
  }
  if (!parsed.hostname) return invalid('link-host', 'Link must include a hostname.');
  if (parsed.username || parsed.password) {
    return invalid('link-credentials', 'Link credentials are not allowed.');
  }
  return { ok: true, parsed };
}

function isDomainStyleAddress(input) {
  if (input.startsWith('//')) return false;
  if (input.startsWith('.') || input.endsWith('.')) return false;
  const authority = input.split(/[/?#]/, 1)[0];
  // Credentials and host:port ambiguity are authority-only checks; ':' and '@'
  // are legitimate in path/query/fragment text.
  if (authority.includes('@') || authority.includes(':')) return false;
  if (!authority || authority.includes('..')) return false;
  const labels = authority.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => label.length > 0
    && label.length <= MAX_HOST_LABEL
    && HOST_LABEL.test(label));
}

/**
 * Normalize and validate one optional web-link field.
 * Blank input is optional here; required-field policy stays in caller validation.
 */
export function validateWebLink(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') return invalid('link-invalid', 'Link must be text.');
  const input = value.trim();
  if (codePointLength(input) > MAX_WEB_LINK_CODE_POINTS) {
    return invalid('link-too-long', `Link must be at most ${MAX_WEB_LINK_CODE_POINTS} characters.`);
  }
  if (FORBIDDEN_SURFACE.test(input)) {
    return invalid('link-invalid', 'Link must not contain spaces or control characters.');
  }
  if (input.startsWith('//')) return invalid('link-protocol-relative', 'Protocol-relative links are not allowed.');

  const explicit = SCHEME.exec(input);
  let candidate;
  if (explicit) {
    const scheme = explicit[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return invalid('link-scheme', 'Link must use http or https.');
    }
    const afterScheme = input.slice(explicit[0].length);
    if (!afterScheme.startsWith('//') || afterScheme.startsWith('///') || afterScheme.length <= 2) {
      return invalid('link-invalid', 'Link must be an absolute HTTP(S) URL.');
    }
    candidate = input;
  } else {
    if (!isDomainStyleAddress(input)) {
      return invalid('link-invalid', 'Link must be a domain-style address or an absolute HTTP(S) URL.');
    }
    candidate = `https://${input}`;
  }

  const checked = validateAbsoluteHttp(candidate);
  if (!checked.ok) return checked;
  if (explicit) {
    if (!checked.parsed.href || checked.parsed.href === 'https://' || checked.parsed.href === 'http://') {
      return invalid('link-invalid', 'Link must be an absolute HTTP(S) URL.');
    }
    return codePointLength(checked.parsed.href) > MAX_WEB_LINK_CODE_POINTS
      ? invalid('link-too-long', `Link must be at most ${MAX_WEB_LINK_CODE_POINTS} characters.`)
      : { ok: true, value: checked.parsed.href };
  }

  const normalized = checked.parsed.href;
  if (codePointLength(normalized) > MAX_WEB_LINK_CODE_POINTS) {
    return invalid('link-too-long', `Link must be at most ${MAX_WEB_LINK_CODE_POINTS} characters.`);
  }
  return { ok: true, value: normalized };
}

