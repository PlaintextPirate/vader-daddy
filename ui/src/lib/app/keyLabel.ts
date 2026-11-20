/** A short name for a KeyboardEvent.code, as shown on a key cap: 'KeyA' → 'A', 'ArrowUp' → '↑', 'ShiftLeft' → 'Left Shift'. */
const NAMES: Record<string, string> = {
  Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Delete', Delete: 'Forward Delete', Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`'
};
const MODS: Record<string, string> = { Shift: 'Shift', Control: 'Control', Alt: 'Option', Meta: 'Command' };

export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (m) return `${m[2]} ${MODS[m[1]]}`;
  return code;  // F1…F20 read fine as they are
}
