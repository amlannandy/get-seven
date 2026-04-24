import { AnimatePresence } from "framer-motion";
import type { Card } from "@flip7/shared";
import CardComponent from "./CardComponent";

interface Props {
  cards: Card[];
  size?: "sm" | "md" | "lg";
  dimmed?: boolean;
  /** Optional prefix for stable layoutIds */
  idPrefix?: string;
}

export default function CardRow({
  cards,
  size = "md",
  dimmed = false,
  idPrefix = "",
}: Props) {
  if (cards.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <AnimatePresence>
        {cards.map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            size={size}
            dimmed={dimmed}
            layoutId={idPrefix ? `${idPrefix}-${card.id}` : undefined}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
