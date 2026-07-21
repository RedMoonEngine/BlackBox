// Set de iconos vectoriales (sin emojis). Sirven para el DOM (svg) y para canvas 2D (Path2D).
// viewBox 0 0 24 24, monocromo (currentColor / color pasado).

export const PATHS = {
  heart: "M12 21C12 21 3 14.6 3 8.6 3 5.6 5.2 4 7.2 4 9 4 10.7 5 12 7 13.3 5 15 4 16.8 4 18.8 4 21 5.6 21 8.6 21 14.6 12 21 12 21Z",
  chip: "M12 2A10 10 0 1012 22 10 10 0 0012 2ZM12 4.4A7.6 7.6 0 114.4 12 7.6 7.6 0 0112 4.4ZM12 8A4 4 0 108 12 4 4 0 0012 8ZM11 0.6H13V3.5H11ZM11 20.5H13V23.4H11ZM0.6 11H3.5V13H0.6ZM20.5 11H23.4V13H20.5Z",
  skull: "M12 2C7 2 4 5.5 4 10c0 2.5 1.2 4.2 2.6 5.3V19a2 2 0 002 2h.9v-2.5h1.5V21h2v-2.5h1.5V21h.9a2 2 0 002-2v-3.7C18.8 14.2 20 12.5 20 10c0-4.5-3-8-8-8Zm-3 8a1.7 1.7 0 110 3.4A1.7 1.7 0 019 10Zm6 0a1.7 1.7 0 110 3.4A1.7 1.7 0 0115 10Z",
  star: "M12 2l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.8 5.9 20.5l1.3-6.8-5-4.7 6.8-.8Z",
  bell: "M12 2a2 2 0 00-2 2v.4C7.7 5.2 6 7.4 6 10v4l-2 2v1h16v-1l-2-2v-4c0-2.6-1.7-4.8-4-5.6V4a2 2 0 00-2-2ZM10 20a2 2 0 004 0Z",
  cherry: "M7 14a4 4 0 100 8 4 4 0 000-8Zm9 1a4 4 0 100 8 4 4 0 000-8ZM10 3l2 2c-3 1.5-4.5 4.5-5 9H5c.5-5 2.5-8.5 5-11Z",
  seven: "M5 4h14v3.5L12 20H8l7-12.5H5Z",
  box: "M12 2l9 5v10l-9 5-9-5V7l9-5Zm0 2.3L5.5 8 12 11.7 18.5 8 12 4.3ZM5 9.4v6.9l6 3.3v-6.9Zm14 0l-6 3.3v6.9l6-3.3Z",
  eye: "M12 5C6.5 5 2.4 9.3 1 12c1.4 2.7 5.5 7 11 7s9.6-4.3 11-7c-1.4-2.7-5.5-7-11-7Zm0 3a4 4 0 110 8 4 4 0 010-8Zm0 2a2 2 0 100 4 2 2 0 000-4Z",
  bomb: "M14.5 2.5l1.8-1.8 1.4 1.4-1.8 1.8 1 1 1.8-1.8L20.1 4.5l-1.8 1.8.7.7-1.6 1.6A7 7 0 1112.6 6l1.6-1.6ZM10 9a5 5 0 100 10 5 5 0 000-10Z",
  dynamite: "M4 8h4v13H4Zm6 0h4v13h-4Zm6 0h4v13h-4ZM3 8h18v2H3ZM12 8V5a2 2 0 012-2h4V1h-4a4 4 0 00-4 4v3Z",
  candle: "M11 2c1.2 1.6-.8 2.6 0 4.4h2c.8-1.8-1.2-2.8 0-4.4ZM9 7.5h6V11H9Zm-1 4h8l-1 9.5H9Z",
  whisky: "M6.5 4h11l-1 8.5a4.5 4.5 0 01-9 0Zm1.2 4l.5 4.2a2.5 2.5 0 005 0L13.7 8ZM8 19.5h8V21.5H8Z",
  key: "M14 2a6 6 0 00-5.8 7.6L2 15.8V22h6.2v-2h2v-2h2v-1.6l.2-.2A6 6 0 1014 2Zm2.5 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3Z",
  dice: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2Zm3 3.5a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Zm8 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Zm-4 3.9a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Zm-4 3.9a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Zm8 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Z",
  syringe: "M14 2.5l7.5 7.5-2 2-1.3-1.3-2.5 2.5 1 1-1.6 1.6-1-1-3.4 3.4 1 1L8.6 20.4l-1-1-2.6 2.6L3.5 20.5l2.6-2.6-1-1L6.6 15.4l1 1 3.4-3.4-1-1 1.6-1.6 1 1 2.5-2.5-1.3-1.3 2-2Z",
  phone: "M17.2 15.3l-2.6-.5c-.3-.1-.6 0-.9.2l-1.1 1.1a11 11 0 01-4.9-4.9l1.1-1.1c.2-.2.3-.6.2-.9L8.5 6.6c-.1-.4-.5-.8-1-.8H5.4c-.6 0-1.2.5-1.1 1.2C4.9 14 10 19.1 17 19.7c.7.1 1.2-.5 1.2-1.1v-2.1c0-.5-.4-.9-.9-1Z",
  moneybag: "M9.5 2h5l-1.2 3.2h-2.6ZM8.5 6h7c2 2 4.5 5 4.5 9.2A5.8 5.8 0 0114.2 21H9.8A5.8 5.8 0 014 15.2C4 11 6.5 8 8.5 6Zm3 3.5v.9c-1.3.2-2.2 1-2.2 2.1 0 1.2 1 1.8 2.4 2 .9.2 1.2.4 1.2.8s-.4.6-1.1.6c-.9 0-1.4-.3-1.5-.9H8.5c.1 1.1.9 1.9 2 2.1v1h2v-1c1.4-.2 2.3-1 2.3-2.2 0-1.1-.8-1.8-2.4-2.1-.9-.2-1.2-.4-1.2-.7 0-.4.4-.6 1-.6.8 0 1.2.3 1.3.8h1.8c-.1-1-.9-1.8-2-2v-.9Z",
  flashlight: "M3 8.5l6.5-3 11.5 5.6-1.7 3.6-3.6-1.8-8.5 4.1-3.7-1.8Zm11 1.8a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Z",
  magnet: "M5 4h4v8a3 3 0 006 0V4h4v8a7 7 0 01-14 0ZM5 15h4v3.5H5Zm10 0h4v3.5h-4Z",
  joker: "M6 2h9l3 3v17H6Zm3.5 4L12 9.2 8.5 12h2l1.5-2 1.5 2h2L12 9.2 14.5 6h-2L12 8l-1.5-2Z",
  film: "M4 4h16v16H4Zm2 2v2h2V6Zm4 0v2h4V6Zm6 0v2h2V6ZM6 16v2h2v-2Zm4 0v2h4v-2Zm6 0v2h2v-2ZM8 10h8v4H8Z",
  cart: "M2.5 4h2.6l.6 2.5H21l-2 8H7.6l.3 1.5H19v2H6.3L3.6 6H2.5ZM6.1 8.5l1 4.5h10.3l1.1-4.5ZM9 19a1.6 1.6 0 100 3.2A1.6 1.6 0 009 19Zm8 0a1.6 1.6 0 100 3.2A1.6 1.6 0 0017 19Z",
  revolver: "M2 10.5h9.5l2-2.5h3.2l1 1.7H21v3h-2.3l-1 1.7h-3.2l-1.2-1.5H7l-2 2.6H3V13H2Zm11.5-.5a2 2 0 100 4 2 2 0 000-4Z",
  slot: "M5 3h14v18H5Zm2 3v7h10V6Zm2 1h1.4v5H9Zm3 0h1.4v5H12Zm3 0h1.4v5H15ZM7 15h10v1.6H7Zm12-6h2.5v4H19Z",
  tooth: "M7 2C5 2 3.7 3.7 3.7 5.8c0 3 1 4.7 1 8.2 0 3 1 6 2.3 6s1.2-3.2 2-5.2h2c.8 2 .7 5.2 2 5.2s2.3-3 2.3-6c0-3.5 1-5.2 1-8.2C18.6 3.7 17.3 2 15.3 2c-1.8 0-2.5 1-3.3 1S8.8 2 7 2Z",
  horns: "M3 5c1 4 3.5 8 9 8s8-4 9-8c-.5 6-4 11-9 11S3.5 11 3 5Zm5 6a1.6 1.6 0 100 3.2A1.6 1.6 0 008 11Zm8 0a1.6 1.6 0 100 3.2A1.6 1.6 0 0016 11Z",
  hand: "M8.5 12.5V5a1.4 1.4 0 012.8 0v6h1V4a1.4 1.4 0 012.8 0v7h1V6a1.4 1.4 0 012.8 0v9.5a6 6 0 01-6 6h-1.6a5 5 0 01-3.9-1.9l-3-3.8 1.6-1.4Z",
  mask: "M4 6.5C4 5.1 5.2 4 6.8 4c2.8 0 3.6 1.6 5.2 1.6S15.4 4 18.2 4C19.8 4 21 5.1 21 6.5c0 3.4-1.3 6.6-3.4 8.7-1 1-2.1 1.8-2.9 1.8-.9 0-1.2-.8-2.7-.8s-1.8.8-2.7.8c-.8 0-1.9-.8-2.9-1.8C5.3 13.1 4 9.9 4 6.5Zm4.2 3a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Zm7.6 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2Z",
  check: "M9.2 16.4L4.8 12l-1.6 1.6 6 6L21.4 7.4 19.8 5.8Z",
  warning: "M12 2l10.5 18.5H1.5Zm-1 6.5h2v6h-2Zm0 8h2v2.2h-2Z",
  spinner: "M12 2a10 10 0 100 20A10 10 0 0012 2Zm0 3a7 7 0 017 7h-3a4 4 0 00-4-4Z",
  question: "M12 2A10 10 0 1012 22 10 10 0 0012 2Zm-1 15h2v2h-2Zm3.6-6.8c0 2.1-2 2.3-2.4 3.3-.1.3-.1.6-.1 1.3h-2c0-1 0-1.6.3-2.2.4-.8 2.2-1.2 2.2-2.4 0-.7-.6-1.2-1.5-1.2s-1.5.6-1.5 1.5h-2C8.4 7.4 10 6 12 6s3.6 1.3 3.6 3.2Z",
  dot: "M12 8a4 4 0 100 8 4 4 0 000-8Z",
};

// Iconos con "agujeros" (fill evenodd): ojos, chip, dado...
const EVENODD = new Set(["chip", "eye", "skull", "dice", "horns", "mask"]);

// mapear el emoji que manda el server -> nombre de icono
export const EMOJI_ICON = {
  "❤": "heart", "♥": "heart", "🪙": "chip", "🎰": "seven", "🍒": "cherry",
  "🔔": "bell", "⭐": "star", "💀": "skull", "📦": "box", "👁": "eye",
  "💣": "bomb", "🧨": "dynamite", "🕯️": "candle", "🕯": "candle", "🥃": "whisky",
  "🔑": "key", "🎲": "dice", "💉": "syringe", "☎️": "phone", "☎": "phone",
  "👝": "moneybag", "🔦": "flashlight", "🧲": "magnet", "🃏": "joker", "📼": "film",
  "🛒": "cart", "🔫": "revolver", "🦷": "tooth", "😈": "horns", "🤞": "hand",
  "🎭": "mask", "💥": "bomb", "💰": "moneybag", "🖐": "hand", "⚠": "warning",
  "☠": "skull", "🔴": "dot", "🕹": "slot",
};

export const ACT_ICON = { OBJETOS: "box", SLOTS: "slot", ROULETTE: "revolver", EVENT: "film", MARKET: "cart" };

export function iconName(emoji) { return EMOJI_ICON[emoji] || null; }

// --- DOM ---
export function svg(name, cls) {
  const p = PATHS[name] || PATHS.question;
  const fr = EVENODD.has(name) ? ' fill-rule="evenodd"' : "";
  return `<svg class="ic ${cls || ""}" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="${p}"${fr}/></svg>`;
}
export function iconEmoji(emoji, cls) { const n = EMOJI_ICON[emoji]; return n ? svg(n, cls) : ""; }

// --- canvas 2D ---
export function drawIcon(ctx, name, cx, cy, size, color) {
  const p = PATHS[name]; if (!p) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color || "#fff";
  ctx.fill(new Path2D(p), EVENODD.has(name) ? "evenodd" : "nonzero");
  ctx.restore();
}

// quitar cualquier emoji de un texto del server (y normalizar símbolos comunes)
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu;
export function clean(text) {
  if (!text) return text;
  return String(text)
    .replace(/❤/g, " vida").replace(/[🎰🪙]/g, " fichas")
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
}
