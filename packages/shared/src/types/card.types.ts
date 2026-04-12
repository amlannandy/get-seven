export type CardType = 'number' | 'modifier' | 'action';

export interface NumberCard {
  id: string; // e.g. "num_7_3" (number 7, 3rd copy)
  type: 'number';
  value: number; // 0–12
}

export type ModifierKind =
  | 'plus2'
  | 'plus4'
  | 'plus6'
  | 'plus8'
  | 'plus10'
  | 'times2';

export interface ModifierCard {
  id: string;
  type: 'modifier';
  modifier: ModifierKind;
}

export type ActionKind = 'freeze' | 'flip_three' | 'second_chance';

export interface ActionCard {
  id: string;
  type: 'action';
  action: ActionKind;
}

export type Card = NumberCard | ModifierCard | ActionCard;

/** Map from ModifierKind to its flat bonus value (times2 is handled separately) */
export const MODIFIER_VALUES: Record<ModifierKind, number> = {
  plus2: 2,
  plus4: 4,
  plus6: 6,
  plus8: 8,
  plus10: 10,
  times2: 0, // not additive
};
