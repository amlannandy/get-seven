import { motion } from "framer-motion";
import type { Card } from "@flip7/shared";
import {
  getCardColor,
  getCardTextColor,
  getCardLabel,
} from "../../lib/cardColors";

interface Props {
  card: Card;
  size?: "sm" | "md" | "lg";
  /** framer-motion layoutId for animated card movement */
  layoutId?: string;
  dimmed?: boolean;
}

const sizes = {
  sm: "w-8 h-11 text-sm",
  md: "w-10 h-14 text-base",
  lg: "w-12 h-16 text-lg",
};

export default function CardComponent({
  card,
  size = "md",
  layoutId,
  dimmed = false,
}: Props) {
  const bg = getCardColor(card);
  const color = getCardTextColor(card);
  const label = getCardLabel(card);

  return (
    <motion.div
      layoutId={layoutId}
      className={`
        ${sizes[size]}
        relative flex items-center justify-center
        rounded-lg select-none flex-shrink-0
        ${dimmed ? "opacity-40" : ""}
      `}
      style={{
        backgroundColor: bg,
        color,
        boxShadow: `0 0 0 2px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)`,
        fontFamily: "var(--font-fredoka)",
        fontWeight: 700,
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: dimmed ? 0.4 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {label}
    </motion.div>
  );
}
