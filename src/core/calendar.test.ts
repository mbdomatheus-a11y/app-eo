import { describe, expect, it } from "vitest";
import { calendarFile } from "./calendar";
describe("arquivo de agenda", () => {
  it("exporta horário UTC e duração sem alterar o evento de origem", () => {
    const source = {
      title: "Checklist",
      date: "2026-11-10T12:30:00Z",
      durationMinutes: 30,
    };
    const text = calendarFile(source);
    expect(text).toContain(
      "DTSTART:20261110T123000Z\r\nDTEND:20261110T130000Z",
    );
    expect(source.date).toBe("2026-11-10T12:30:00Z");
  });
  it("escapa conteúdo para impedir criação de campos por quebra de linha", () => {
    const text = calendarFile({
      title: "EO\nBEGIN:VEVENT",
      date: "2026-11-10T12:30:00Z",
      description: "ação; teste, texto",
    });
    expect(text).toContain("SUMMARY:EO\\nBEGIN:VEVENT");
    expect(text).toContain("DESCRIPTION:ação\\; teste\\, texto");
    expect(text.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  });
  it("dobra linhas por bytes preservando caracteres acentuados", () => {
    const text = calendarFile({
      title: "Ação ".repeat(50),
      date: "2026-11-10T12:30:00Z",
    });
    for (const line of text.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(text.replace(/\r\n /g, "")).toContain(
      "SUMMARY:" + "Ação ".repeat(50),
    );
  });
  it("recusa data ou duração inválida", () => {
    expect(() => calendarFile({ title: "EO", date: "invalida" })).toThrow();
    expect(() =>
      calendarFile({ title: "EO", date: new Date(), durationMinutes: -1 }),
    ).toThrow();
  });
});
