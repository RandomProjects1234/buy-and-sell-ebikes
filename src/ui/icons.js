// Inline SVG icon set. Everything uses currentColor so icons inherit the
// surrounding text colour (tier colours, disabled states, hover, etc).

const wrap = (body, size = 24) =>
  `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const SLOT_ICONS = {
  frame: wrap('<path d="M4 18 L9 7 L17 7 L20 18 Z"/><path d="M9 7 L20 18"/>'),
  motor: wrap('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  battery: wrap('<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M21 10v4"/><path d="M10 9l-2.5 4H11l-2 3"/>'),
  wheels: wrap('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>'),
  brakes: wrap('<circle cx="11" cy="12" r="7"/><circle cx="11" cy="12" r="2.5"/><path d="M18 8h3v8h-3"/>'),
  controller: wrap('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
};

export const ICONS = {
  crate: wrap('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  wrench: wrap('<path d="M15 3a5 5 0 0 0-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 1 0 15 3z"/>'),
  garage: wrap('<path d="M3 10l9-6 9 6v10H3z"/><circle cx="8.5" cy="16" r="2"/><circle cx="15.5" cy="16" r="2"/><path d="M8.5 16h7"/>'),
  staff: wrap('<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  farm: wrap('<path d="M3 21V10l6 4V10l6 4V6l6 4v11z"/><path d="M8 21v-4M14 21v-4"/>'),
  upgrade: wrap('<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>'),
  wheelie: wrap('<path d="M4 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M19 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M8 14l5-7 4 6"/>'),
  ipo: wrap('<path d="M4 19h16"/><path d="M6 16V9M11 16V5M16 16v-4"/>'),
  money: wrap('<circle cx="12" cy="12" r="9"/><path d="M15 9a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2A3 3 0 0 1 9 15"/><path d="M12 6v12"/>'),
  bolt: wrap('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  lock: wrap('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  sell: wrap('<path d="M3 11l8-8 10 1 1 10-8 8z"/><circle cx="15" cy="9" r="1.6"/>'),
  star: wrap('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  mute: wrap('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  sound: wrap('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  book: wrap('<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h7M8 11h7M8 15h5"/>'),
};

export function slotIcon(slot) { return SLOT_ICONS[slot] || ICONS.gear; }
export function icon(name) { return ICONS[name] || ICONS.gear; }
