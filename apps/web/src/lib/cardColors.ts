import type { Card, ModifierKind, ActionKind } from '@flip7/shared';

/** Background color for a card face based on its value/type */
export function getCardColor(card: Card): string {
  if (card.type === 'number') {
    const v = card.value;
    if (v === 0) return '#94a3b8';
    if (v <= 3) return '#4ade80';
    if (v <= 6) return '#facc15';
    if (v === 7) return '#f97316';
    if (v <= 10) return '#f87171';
    return '#c084fc';
  }
  if (card.type === 'modifier') {
    return '#818cf8';
  }
  // action
  const actionColors: Record<ActionKind, string> = {
    freeze: '#67e8f9',
    flip_three: '#fb923c',
    second_chance: '#86efac',
  };
  return actionColors[card.action];
}

/** Text color — dark for light cards, white for dark */
export function getCardTextColor(card: Card): string {
  if (card.type === 'number') {
    const v = card.value;
    // yellow and mint-ish cards need dark text
    if (v >= 4 && v <= 6) return '#1a1a1a';
    if (v === 0) return '#1a1a1a';
  }
  if (card.type === 'action' && card.action === 'second_chance') return '#1a1a1a';
  if (card.type === 'action' && card.action === 'freeze') return '#1a1a1a';
  return '#ffffff';
}

/** Short display label for a card */
export function getCardLabel(card: Card): string {
  if (card.type === 'number') return String(card.value);
  if (card.type === 'modifier') {
    const labels: Record<ModifierKind, string> = {
      plus2: '+2',
      plus4: '+4',
      plus6: '+6',
      plus8: '+8',
      plus10: '+10',
      times2: '×2',
    };
    return labels[card.modifier];
  }
  const actionLabels: Record<ActionKind, string> = {
    freeze: '❄',
    flip_three: '🔥',
    second_chance: '✦',
  };
  return actionLabels[card.action];
}

/** Full readable name for a card — used in toasts/narration */
export function getCardName(card: Card): string {
  if (card.type === 'number') return `${card.value}`;
  if (card.type === 'modifier') {
    const names: Record<ModifierKind, string> = {
      plus2: '+2 Bonus',
      plus4: '+4 Bonus',
      plus6: '+6 Bonus',
      plus8: '+8 Bonus',
      plus10: '+10 Bonus',
      times2: '×2 Multiplier',
    };
    return names[card.modifier];
  }
  const actionNames: Record<ActionKind, string> = {
    freeze: 'Freeze',
    flip_three: 'Flip Three',
    second_chance: 'Second Chance',
  };
  return actionNames[card.action];
}
