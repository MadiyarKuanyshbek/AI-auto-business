import { View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { DisplayProfile, InterfaceTheme } from "../core/interfaces";

/** Стандартное оформление: так экраны выглядят до установки интерфейсного файла. */
export const STOCK_PALETTE = { bg: "#0B1018", panel: "#131B27", accent: "#5B8DEF", text: "#E8EEF9", muted: "#5F6F89" };

type Palette = typeof STOCK_PALETTE;

const polar = (cx: number, cy: number, r: number, deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
};

function Gauge({ cx, cy, r, fraction, p, redZone }: { cx: number; cy: number; r: number; fraction: number; p: Palette; redZone?: boolean }) {
  return (
    <G>
      <Path d={arc(cx, cy, r, 135, 405)} stroke={p.muted} strokeOpacity={0.35} strokeWidth={6} fill="none" strokeLinecap="round" />
      <Path d={arc(cx, cy, r, 135, 135 + 270 * fraction)} stroke={p.accent} strokeWidth={6} fill="none" strokeLinecap="round" />
      {redZone ? <Path d={arc(cx, cy, r, 360, 405)} stroke="#FF3B30" strokeWidth={6} fill="none" strokeLinecap="round" /> : null}
    </G>
  );
}

function Analog({ cx, cy, r, value, p, label }: { cx: number; cy: number; r: number; value: number; p: Palette; label: string }) {
  const ticks = Array.from({ length: 11 }, (_, i) => 135 + (270 * i) / 10);
  const tip = polar(cx, cy, r - 6, 135 + 270 * value);
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={p.panel} stroke={p.muted} strokeOpacity={0.5} strokeWidth={2} />
      {ticks.map((a, i) => {
        const a1 = polar(cx, cy, r - 3, a);
        const a2 = polar(cx, cy, r - (i % 5 === 0 ? 11 : 7), a);
        return <Line key={i} x1={a1.x} y1={a1.y} x2={a2.x} y2={a2.y} stroke={p.text} strokeOpacity={0.8} strokeWidth={1.5} />;
      })}
      <Line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={p.accent} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={3.5} fill={p.accent} />
      <SvgText x={cx} y={cy + r * 0.55} fontSize={8} fill={p.muted} textAnchor="middle">
        {label}
      </SvgText>
    </G>
  );
}

/** Цифровая приборная панель в оформлении выбранной темы. */
function DigitalCluster({ x, y, w, h, theme, p }: { x: number; y: number; w: number; h: number; theme: InterfaceTheme | null; p: Palette }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const style = theme?.target === "cluster" ? theme.gauge : "arc";
  const sport = theme?.id === "sport" || theme?.id === "carbon";
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={10} fill={p.bg} stroke={p.muted} strokeOpacity={0.5} strokeWidth={1.5} />
      {theme?.id === "carbon"
        ? Array.from({ length: 12 }, (_, i) => <Line key={i} x1={x + 8 + i * 19} y1={y + 4} x2={x + 8 + i * 19} y2={y + h - 4} stroke="#1F1F26" strokeWidth={6} />)
        : null}
      {style === "arc" ? (
        <G>
          <Gauge cx={x + 52} cy={cy + 4} r={36} fraction={0.55} p={p} />
          <Gauge cx={x + w - 52} cy={cy + 4} r={36} fraction={0.4} p={p} redZone={sport} />
          <SvgText x={cx} y={cy + 8} fontSize={sport ? 34 : 28} fontWeight="bold" fill={p.text} textAnchor="middle">
            86
          </SvgText>
          <SvgText x={cx} y={cy + 24} fontSize={9} fill={p.muted} textAnchor="middle">
            км/ч
          </SvgText>
          {sport ? <Rect x={cx - 30} y={y + 8} width={60} height={6} rx={3} fill={p.accent} /> : null}
        </G>
      ) : null}
      {style === "bar" ? (
        <G>
          {Array.from({ length: 24 }, (_, i) => (
            <Rect key={i} x={x + 14 + i * ((w - 28) / 24)} y={y + 10} width={(w - 28) / 24 - 2} height={10} rx={1.5} fill={i < 14 ? (i < 9 ? "#34D399" : p.accent) : i < 20 ? p.muted : "#FF3B30"} opacity={i < 14 ? 1 : 0.4} />
          ))}
          <SvgText x={cx} y={cy + 14} fontSize={38} fontWeight="bold" fill={p.text} textAnchor="middle">
            86
          </SvgText>
          <SvgText x={x + 28} y={y + h - 12} fontSize={9} fill={p.muted}>
            90°C масло
          </SvgText>
          <SvgText x={x + w - 28} y={y + h - 12} fontSize={9} fill={p.muted} textAnchor="end">
            1.2 бар
          </SvgText>
        </G>
      ) : null}
      {style === "minimal" ? (
        <G>
          <SvgText x={cx} y={cy + 12} fontSize={40} fontWeight="bold" fill={p.text} textAnchor="middle">
            86
          </SvgText>
          <SvgText x={cx} y={cy + 28} fontSize={9} fill={p.muted} textAnchor="middle">
            км/ч · D
          </SvgText>
        </G>
      ) : null}
      {style === "analog" ? (
        <G>
          <Analog cx={x + 58} cy={cy} r={38} value={0.5} p={p} label="км/ч" />
          <Analog cx={x + w - 58} cy={cy} r={38} value={0.32} p={p} label="об/мин" />
          <SvgText x={cx} y={cy + 4} fontSize={11} fill={p.text} textAnchor="middle">
            12.4 л/100
          </SvgText>
          <SvgText x={cx} y={cy + 18} fontSize={8} fill={p.muted} textAnchor="middle">
            бортовой компьютер
          </SvgText>
        </G>
      ) : null}
      {style === "map" ? (
        <G>
          <Gauge cx={x + 26} cy={cy} r={20} fraction={0.5} p={p} />
          <Gauge cx={x + w - 26} cy={cy} r={20} fraction={0.4} p={p} />
          <Rect x={x + 54} y={y + 8} width={w - 108} height={h - 16} rx={6} fill={p.panel} />
          <Path d={`M ${x + 70} ${y + h - 14} L ${x + 100} ${cy + 6} L ${cx} ${cy + 6} L ${cx + 30} ${y + 18} L ${x + w - 70} ${y + 18}`} stroke={p.accent} strokeWidth={3} fill="none" strokeLinejoin="round" />
          <Polygon points={`${cx - 6},${cy + 16} ${cx},${cy + 2} ${cx + 6},${cy + 16}`} fill={p.text} />
          <SvgText x={x + w - 64} y={y + h - 14} fontSize={9} fill={p.text} textAnchor="end">
            поворот через 300 м
          </SvgText>
        </G>
      ) : null}
    </G>
  );
}

function CenterScreen({ x, y, w, h, theme, p }: { x: number; y: number; w: number; h: number; theme: InterfaceTheme | null; p: Palette }) {
  const welcome = theme?.id === "welcome";
  const accent = welcome ? theme!.palette.accent : STOCK_PALETTE.accent;
  const bg = welcome ? theme!.palette.bg : p.bg;
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={8} fill={bg} stroke={p.muted} strokeOpacity={0.5} strokeWidth={1.5} />
      {welcome ? (
        <G>
          <Circle cx={x + w / 2} cy={y + h / 2 - 8} r={Math.min(w, h) * 0.2} stroke={accent} strokeWidth={3} fill="none" />
          <Circle cx={x + w / 2} cy={y + h / 2 - 8} r={Math.min(w, h) * 0.12} fill={accent} fillOpacity={0.5} />
          <SvgText x={x + w / 2} y={y + h - 14} fontSize={10} fill={theme!.palette.text} textAnchor="middle">
            Добро пожаловать
          </SvgText>
        </G>
      ) : (
        <G>
          <Rect x={x + 8} y={y + 8} width={w - 16} height={14} rx={4} fill={accent} fillOpacity={0.9} />
          {Array.from({ length: 6 }, (_, i) => (
            <Rect key={i} x={x + 10 + (i % 3) * ((w - 20) / 3)} y={y + 30 + Math.floor(i / 3) * ((h - 40) / 2)} width={(w - 20) / 3 - 6} height={(h - 40) / 2 - 6} rx={5} fill={p.panel} />
          ))}
        </G>
      )}
    </G>
  );
}

type Props = {
  profile: DisplayProfile;
  /** Выбранная тема; null — стандартное оформление. */
  theme: InterfaceTheme | null;
  title?: string;
};

/** Салон автомобиля с экранами: показывает, как выглядят приборная панель, центральный экран, проекция и подсветка. */
export function CabinPreview({ profile, theme, title }: Props) {
  const clusterTheme = theme?.target === "cluster" ? theme : null;
  const clusterPalette = clusterTheme ? clusterTheme.palette : STOCK_PALETTE;
  const hudTheme = theme?.id === "hud" ? theme : null;
  const ambientColor = theme?.id === "ambient" ? theme.palette.accent : "#3B82F6";
  const centerW = profile.center === "large" ? 250 : profile.center === "small" ? 150 : 0;
  const centerH = profile.center === "large" ? 120 : profile.center === "small" ? 82 : 0;

  return (
    <View style={{ width: "100%", aspectRatio: 800 / 440, borderRadius: 14, overflow: "hidden", backgroundColor: "#0B0F16" }}>
      <Svg width="100%" height="100%" viewBox="0 0 800 440" accessibilityLabel={title ?? "Салон автомобиля"}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1F2B3F" />
            <Stop offset="1" stopColor="#0E1522" />
          </LinearGradient>
          <LinearGradient id="dash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1A212E" />
            <Stop offset="1" stopColor="#0B0F16" />
          </LinearGradient>
        </Defs>
        {/* лобовое стекло и дорога */}
        <Rect x={0} y={0} width={800} height={200} fill="url(#sky)" />
        <Polygon points="330,200 470,200 640,150 160,150" fill="#171E2B" />
        <Line x1={400} y1={200} x2={400} y2={152} stroke="#394559" strokeWidth={2} strokeDasharray="8 8" />
        {/* торпедо */}
        <Path d="M0 190 Q 400 160 800 190 L 800 440 L 0 440 Z" fill="url(#dash)" />
        {profile.ambient ? <Path d="M 30 300 Q 400 268 770 300" stroke={ambientColor} strokeWidth={4} fill="none" strokeOpacity={0.95} /> : null}
        {profile.ambient ? <Path d="M 30 300 Q 400 268 770 300" stroke={ambientColor} strokeWidth={14} fill="none" strokeOpacity={0.18} /> : null}

        {/* проекция на стекло */}
        {profile.hud ? (
          <G>
            <Rect x={150} y={138} width={150} height={44} rx={8} fill={(hudTheme ?? { palette: { accent: "#4ADE80" } }).palette.accent} fillOpacity={0.12} />
            <SvgText x={205} y={170} fontSize={26} fontWeight="bold" fill={(hudTheme ?? { palette: { accent: "#4ADE80" } }).palette.accent} textAnchor="middle">
              86
            </SvgText>
            <SvgText x={252} y={170} fontSize={10} fill={(hudTheme ?? { palette: { accent: "#4ADE80" } }).palette.accent}>
              км/ч
            </SvgText>
            <Polygon points="272,150 282,166 262,166" fill={(hudTheme ?? { palette: { accent: "#4ADE80" } }).palette.accent} />
          </G>
        ) : null}

        {/* приборная панель */}
        {profile.cluster === "digital" ? <DigitalCluster x={95} y={206} w={250} h={92} theme={clusterTheme} p={clusterPalette} /> : null}
        {profile.cluster === "hybrid" ? (
          <G>
            <Rect x={95} y={206} width={250} height={92} rx={10} fill={STOCK_PALETTE.bg} stroke={STOCK_PALETTE.muted} strokeOpacity={0.5} strokeWidth={1.5} />
            <Analog cx={150} cy={252} r={36} value={0.5} p={clusterTheme && ["classic", "eco", "minimal", "night"].includes(clusterTheme.id) ? clusterPalette : STOCK_PALETTE} label="км/ч" />
            <Analog cx={290} cy={252} r={36} value={0.32} p={clusterTheme && ["classic", "eco", "minimal", "night"].includes(clusterTheme.id) ? clusterPalette : STOCK_PALETTE} label="об/мин" />
            <Rect x={188} y={226} width={64} height={52} rx={5} fill={clusterPalette.panel} />
            <SvgText x={220} y={256} fontSize={11} fill={clusterPalette.text} textAnchor="middle">
              12.4 л
            </SvgText>
          </G>
        ) : null}
        {profile.cluster === "analog" ? (
          <G>
            <Rect x={95} y={206} width={250} height={92} rx={10} fill={STOCK_PALETTE.bg} stroke={STOCK_PALETTE.muted} strokeOpacity={0.5} strokeWidth={1.5} />
            <Analog cx={155} cy={252} r={38} value={0.5} p={STOCK_PALETTE} label="км/ч" />
            <Analog cx={285} cy={252} r={38} value={0.32} p={STOCK_PALETTE} label="об/мин" />
          </G>
        ) : null}

        {/* руль */}
        <Circle cx={220} cy={372} r={74} stroke="#05070B" strokeWidth={16} fill="none" />
        <Circle cx={220} cy={372} r={74} stroke="#222B3A" strokeWidth={10} fill="none" />
        <Rect x={150} y={366} width={140} height={14} rx={7} fill="#1A2230" />
        <Circle cx={220} cy={372} r={20} fill="#2B3547" />

        {/* центральный экран / магнитола */}
        {profile.center !== "none" ? (
          <CenterScreen x={430} y={208} w={centerW} h={centerH} theme={theme} p={STOCK_PALETTE} />
        ) : (
          <G>
            <Rect x={440} y={218} width={120} height={36} rx={6} fill="#10151F" stroke="#2A3345" />
            <Circle cx={462} cy={236} r={9} fill="#1A2230" />
            <Circle cx={538} cy={236} r={9} fill="#1A2230" />
          </G>
        )}
        {/* воздуховоды, тоннель */}
        <Rect x={690} y={215} width={60} height={14} rx={7} fill="#0F141D" />
        <Rect x={690} y={240} width={60} height={14} rx={7} fill="#0F141D" />
        <Rect x={470} y={370} width={90} height={50} rx={10} fill="#0D1119" />
        <Circle cx={515} cy={394} r={11} fill="#1A2230" />
        {title ? (
          <SvgText x={20} y={426} fontSize={13} fill="#8FA0BF">
            {title}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}
