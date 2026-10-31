import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

export const C = {
  ink: "#343943", muted: "#747981", lightMuted: "#969aa0", paper: "#FFFFFF", canvas: "#F4F3EF",
  sand: "#E5E1DA", yellow: "#FBF2A3", yellowStrong: "#D6C45C", line: "#E7E5DF", green: "#197B50",
  red: "#B53435", softRed: "#FFF0EE", dark: "#4A4E58", soft: "#F9F8F4",
};

export function Page({ children, contentStyle }: { children: ReactNode; contentStyle?: ViewStyle }) {
  return <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, contentStyle]} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={styles.brand}><Text style={[styles.brandMark, compact && styles.brandMarkSmall]}>eo<Text style={styles.brandDot}>•</Text></Text>{!compact && <Text style={styles.brandName}>EXCELÊNCIA{"\n"}<Text style={styles.brandNameStrong}>OPERACIONAL</Text></Text>}</View>;
}
export function Heading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return <View style={styles.heading}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}<Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View>;
}
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onAction}><Text style={styles.sectionAction}>{action}  ›</Text></Pressable> : null}</View>;
}
export function Button({ title, onPress, secondary = false, disabled = false, icon, danger = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: string; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, danger && styles.buttonTextDanger]}>{icon ? `${icon}  ` : ""}{title}</Text></Pressable>;
}
export function ActionRow({ title, detail, icon = "›", onPress, disabled = false }: { title: string; detail?: string; icon?: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed, disabled && styles.disabled]}><View style={styles.actionIcon}><Text style={styles.actionIconText}>{icon}</Text></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text>{detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}</View><Text style={styles.chevron}>›</Text></Pressable>;
}
export function Field({ label, multiline = false, style, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={C.lightMuted} {...props} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multiline, style]} /></View>;
}
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? "✓  " : "○  "}{label}</Text></Pressable>;
}
export function Badge({ children, warning = false, success = false }: { children: ReactNode; warning?: boolean; success?: boolean }) {
  return <View style={[styles.badge, warning && styles.badgeWarning, success && styles.badgeSuccess]}><Text style={[styles.badgeText, warning && styles.badgeTextWarning, success && styles.badgeTextSuccess]}>{children}</Text></View>;
}
export function Feedback({ error, message, onClose }: { error: string; message: string; onClose: () => void }) {
  const value = error || message;
  if (!value) return null;
  return <Pressable onPress={onClose} style={[styles.feedback, error ? styles.feedbackError : styles.feedbackSuccess]}><Text style={styles.feedbackText}>{error ? "Atenção: " : "✓  "}{value}</Text></Pressable>;
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  topbar: { minHeight: 60, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", backgroundColor: C.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 13 },
  back: { paddingVertical: 10, paddingRight: 5 }, backText: { fontSize: 16, color: C.dark, fontWeight: "600" },
  topText: { flex: 1 }, topEyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: "700" }, topTitle: { color: C.ink, fontSize: 16, fontWeight: "700", marginTop: 2 },
  refresh: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.canvas }, refreshText: { color: C.dark, fontSize: 20 },
  tabbar: { minHeight: 64, paddingBottom: 5, paddingHorizontal: 4, flexDirection: "row", backgroundColor: C.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }, tabGlyph: { color: C.muted, fontSize: 19, fontWeight: "600" }, tabLabel: { color: C.muted, fontSize: 10, fontWeight: "600" }, tabActive: { color: C.dark }, tabCount: { position: "absolute", top: 5, right: 13, minWidth: 16, height: 16, borderRadius: 9, backgroundColor: C.yellow, textAlign: "center", color: C.ink, fontSize: 9, fontWeight: "700" },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 }, brandMark: { color: C.dark, fontSize: 38, lineHeight: 43, fontWeight: "900", letterSpacing: -5 }, brandMarkSmall: { fontSize: 30, lineHeight: 34 }, brandDot: { color: C.yellowStrong, fontSize: 22, letterSpacing: 0 }, brandName: { fontSize: 8, letterSpacing: 1.2, lineHeight: 12, color: C.muted, fontWeight: "500" }, brandNameStrong: { fontWeight: "800", color: C.dark },
  scroll: { flex: 1 }, page: { padding: 20, paddingBottom: 32, gap: 18 },
  heading: { gap: 6, marginBottom: 1 }, eyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" }, title: { color: C.ink, fontSize: 25, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6 }, detail: { color: C.muted, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 17, gap: 12 }, section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: "700" }, sectionAction: { color: C.dark, fontSize: 12, fontWeight: "700" },
  button: { minHeight: 48, paddingHorizontal: 17, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.dark }, buttonSecondary: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, buttonDanger: { backgroundColor: C.softRed }, buttonText: { color: C.paper, fontSize: 14, fontWeight: "700" }, buttonTextSecondary: { color: C.dark }, buttonTextDanger: { color: C.red }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.78 },
  actionRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.yellow }, actionIconText: { color: C.dark, fontSize: 18, fontWeight: "800" }, actionCopy: { flex: 1, gap: 3 }, actionTitle: { color: C.ink, fontSize: 14, fontWeight: "700" }, actionDetail: { color: C.muted, fontSize: 11, lineHeight: 15 }, chevron: { color: C.muted, fontSize: 24, paddingHorizontal: 5 },
  field: { gap: 7 }, label: { color: C.ink, fontSize: 12, fontWeight: "700" }, input: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.paper, color: C.ink, fontSize: 14 }, multiline: { minHeight: 132, paddingTop: 12 },
  choice: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper }, choiceSelected: { borderColor: C.yellowStrong, backgroundColor: "#FFFCE4" }, choiceText: { color: C.muted, fontSize: 12, fontWeight: "600" }, choiceTextSelected: { color: C.dark, fontWeight: "700" },
  badge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: C.sand }, badgeWarning: { backgroundColor: C.yellow }, badgeSuccess: { backgroundColor: "#E2F3E9" }, badgeText: { color: C.dark, fontSize: 10, fontWeight: "700" }, badgeTextWarning: { color: C.dark }, badgeTextSuccess: { color: C.green },
  feedback: { padding: 12, borderRadius: 12 }, feedbackError: { backgroundColor: C.softRed }, feedbackSuccess: { backgroundColor: "#EAF5EE" }, feedbackText: { color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  body: { color: C.ink, fontSize: 14, lineHeight: 22 }, small: { color: C.muted, fontSize: 11, lineHeight: 16 }, strong: { color: C.ink, fontSize: 15, fontWeight: "700" }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
});
