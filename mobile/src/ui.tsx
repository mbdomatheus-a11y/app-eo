import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

export const C = {
  ink: "#282B31", muted: "#737780", lightMuted: "#969AA2", paper: "#FEFEFE", canvas: "#F6F5F1",
  sand: "#DDDAD5", yellow: "#FBF2A3", yellowStrong: "#D6C45C", line: "#E4E1DB", green: "#197B50",
  red: "#B53435", softRed: "#FFF0EE", dark: "#4A4E58", soft: "#F9F8F4", darkCard: "#373B43",
};

export function Page({ children, contentStyle }: { children: ReactNode; contentStyle?: ViewStyle }) {
  return <ScrollView style={s.scroll} contentContainerStyle={[s.page, contentStyle]} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={s.brand}><Text style={[s.brandMark, compact && s.brandMarkSmall]}>eo<Text style={s.brandDot}>•</Text></Text>{!compact && <Text style={s.brandName}>EXCELÊNCIA{"\n"}<Text style={s.brandNameStrong}>OPERACIONAL</Text></Text>}</View>;
}
export function Heading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return <View style={s.heading}>{eyebrow ? <Text style={s.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}<Text style={s.title}>{title}</Text>{detail ? <Text style={s.detail}>{detail}</Text> : null}</View>;
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onAction}><Text style={s.sectionAction}>{action}  ›</Text></Pressable> : null}</View>;
}
export function Button({ title, onPress, secondary = false, disabled = false, icon, danger = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: string; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, secondary && s.buttonSecondary, danger && s.buttonDanger, disabled && s.disabled, pressed && !disabled && s.pressed]}>{icon ? <View style={s.buttonContent}><AppIcon name={icon} size={17} color={secondary ? C.dark : C.paper} /><Text style={[s.buttonText, secondary && s.buttonTextSecondary, danger && s.buttonTextDanger]}>{title}</Text></View> : <Text style={[s.buttonText, secondary && s.buttonTextSecondary, danger && s.buttonTextDanger]}>{title}</Text>}</Pressable>;
}
export function ActionRow({ title, detail, icon = "›", onPress, disabled = false }: { title: string; detail?: string; icon?: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [s.actionRow, pressed && s.pressed, disabled && s.disabled]}><View style={s.actionIcon}><AppIcon name={icon} size={20} color={C.dark} /></View><View style={s.actionCopy}><Text style={s.actionTitle}>{title}</Text>{detail ? <Text style={s.actionDetail}>{detail}</Text> : null}</View><SymbolView name={{ ios: "chevron.right", android: "chevron_right" }} size={16} tintColor={C.lightMuted} /></Pressable>;
}
const androidIcons: Record<string, string> = {
  "bell.fill": "notifications_active", "square.grid.2x2.fill": "apps", plus: "add", "house.fill": "home",
  "person.2.fill": "group", "checkmark.shield.fill": "verified_user", "person.crop.circle.fill": "account_circle",
  "lock.fill": "lock", "questionmark.circle.fill": "help_outline",
  "doc.text.fill": "description", "list.bullet.rectangle.fill": "view_list", "checklist": "checklist",
  "photo.fill": "photo_camera", "camera.fill": "photo_camera", "mic.fill": "mic", "waveform": "graphic_eq",
  "paintbrush.fill": "brush", "person.3.fill": "groups", "chevron.right": "chevron_right",
};
export function AppIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const nativeNames = new Set(Object.keys(androidIcons));
  if (nativeNames.has(name)) {
    const symbolName = name as SymbolViewProps["name"] & string;
    return <SymbolView name={{ ios: symbolName, android: androidIcons[name] } as SymbolViewProps["name"]} size={size} tintColor={color} />;
  }
  return <Text style={{ color, fontSize: size + 1, fontWeight: "800", lineHeight: size + 4 }}>{name}</Text>;
}
export function Field({ label, multiline = false, style, ...props }: TextInputProps & { label: string }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor={C.lightMuted} {...props} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[s.input, multiline && s.multiline, style]} /></View>;
}
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.choice, selected && s.choiceSelected]}><Text style={[s.choiceText, selected && s.choiceTextSelected]}>{selected ? "✓  " : "○  "}{label}</Text></Pressable>;
}
export function Badge({ children, warning = false, success = false }: { children: ReactNode; warning?: boolean; success?: boolean }) {
  return <View style={[s.badge, warning && s.badgeWarning, success && s.badgeSuccess]}><Text style={[s.badgeText, warning && s.badgeTextWarning, success && s.badgeTextSuccess]}>{children}</Text></View>;
}
export function Feedback({ error, message, onClose }: { error: string; message: string; onClose: () => void }) {
  const value = error || message;
  if (!value) return null;
  return <Pressable onPress={onClose} style={[s.feedback, error ? s.feedbackError : s.feedbackSuccess]}><Text style={s.feedbackText}>{error ? "Atenção: " : "✓  "}{value}</Text></Pressable>;
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  topbar: { minHeight: 66, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", backgroundColor: C.canvas, gap: 12 },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, backText: { fontSize: 25, lineHeight: 27, color: C.dark, fontWeight: "500" },
  topText: { flex: 1 }, topEyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" }, topTitle: { color: C.ink, fontSize: 18, fontWeight: "800", marginTop: 3 },
  refresh: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, refreshText: { color: C.dark, fontSize: 22 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 }, brandMark: { color: C.dark, fontSize: 38, lineHeight: 43, fontWeight: "900", letterSpacing: -5 }, brandMarkSmall: { fontSize: 30, lineHeight: 34 }, brandDot: { color: C.yellowStrong, fontSize: 22, letterSpacing: 0 }, brandName: { fontSize: 8, letterSpacing: 1.2, lineHeight: 12, color: C.muted, fontWeight: "500" }, brandNameStrong: { fontWeight: "800", color: C.dark },
  scroll: { flex: 1 }, page: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30, gap: 17 },
  heading: { gap: 6, marginBottom: 1 }, eyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" }, title: { color: C.ink, fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6 }, detail: { color: C.muted, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 17, gap: 12 }, section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: "800" }, sectionAction: { color: C.dark, fontSize: 12, fontWeight: "800" },
  homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, homeGreeting: { color: C.ink, fontSize: 25, lineHeight: 31, fontWeight: "800", letterSpacing: -0.5 }, homeStore: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, homeAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: C.yellow, borderWidth: 1, borderColor: "#EEE5B2" },
  homeHero: { minHeight: 196, padding: 21, borderRadius: 24, backgroundColor: C.darkCard, justifyContent: "space-between", overflow: "hidden" }, homeHeroEyebrow: { color: C.yellow, fontSize: 10, letterSpacing: 1.2, fontWeight: "800" }, homeHeroTitle: { color: C.paper, fontSize: 27, lineHeight: 33, fontWeight: "800", letterSpacing: -0.5 }, homeHeroDetail: { color: "#E5E5E4", fontSize: 13, lineHeight: 19 }, homeHeroMeta: { color: C.yellow, fontSize: 11, fontWeight: "700" }, metricCard: { flex: 1, minHeight: 112, justifyContent: "space-between" }, metricValue: { color: C.ink, fontSize: 28, fontWeight: "800" },
  moduleCard: { minHeight: 148, flex: 1, padding: 15, borderRadius: 19, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, justifyContent: "space-between" }, moduleIcon: { width: 41, height: 41, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.yellow }, moduleTitle: { color: C.ink, fontSize: 14, lineHeight: 18, fontWeight: "800" }, moduleDetail: { color: C.muted, fontSize: 10, lineHeight: 14 },
  button: { minHeight: 50, paddingHorizontal: 17, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.dark }, buttonSecondary: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, buttonDanger: { backgroundColor: C.softRed }, buttonText: { color: C.paper, fontSize: 14, fontWeight: "700" }, buttonTextSecondary: { color: C.dark }, buttonTextDanger: { color: C.red }, buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.78 },
  actionRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, actionIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.yellow }, actionIconText: { color: C.dark, fontSize: 18, fontWeight: "800" }, actionCopy: { flex: 1, gap: 3 }, actionTitle: { color: C.ink, fontSize: 14, fontWeight: "800" }, actionDetail: { color: C.muted, fontSize: 11, lineHeight: 15 }, chevron: { color: C.muted, fontSize: 24, paddingHorizontal: 5 },
  field: { gap: 7 }, label: { color: C.ink, fontSize: 12, fontWeight: "700" }, input: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.paper, color: C.ink, fontSize: 14 }, multiline: { minHeight: 132, paddingTop: 12 },
  choice: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper }, choiceSelected: { borderColor: C.yellowStrong, backgroundColor: "#FFFCE4" }, choiceText: { color: C.muted, fontSize: 12, fontWeight: "600" }, choiceTextSelected: { color: C.dark, fontWeight: "700" },
  badge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: C.sand }, badgeWarning: { backgroundColor: C.yellow }, badgeSuccess: { backgroundColor: "#E2F3E9" }, badgeText: { color: C.dark, fontSize: 10, fontWeight: "700" }, badgeTextWarning: { color: C.dark }, badgeTextSuccess: { color: C.green },
  feedback: { padding: 12, borderRadius: 12 }, feedbackError: { backgroundColor: C.softRed }, feedbackSuccess: { backgroundColor: "#EAF5EE" }, feedbackText: { color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  body: { color: C.ink, fontSize: 14, lineHeight: 22 }, small: { color: C.muted, fontSize: 11, lineHeight: 16 }, strong: { color: C.ink, fontSize: 15, fontWeight: "700" }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
});
