import Svg, { Polyline } from "react-native-svg";
import { colors } from "./kit";

/** Маленький график изменения значения: последние точки слева направо. */
export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={colors.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
