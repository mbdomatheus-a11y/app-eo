export type DiaryQuestion = {
  id: string;
  label: string;
  type: "text" | "number" | "select";
  required: boolean;
  max_chars: number;
  options: string[];
};
export type DiaryConfig = {
  prompt: string;
  note_label: string;
  note_required: boolean;
  note_max_chars: number;
  sold: string[];
  no_sale: string[];
  questions: DiaryQuestion[];
};
export type DiaryConfiguration = { version: number; config: DiaryConfig };
export function validateAnswers(
  config: DiaryConfig,
  answers: Record<string, string>,
  note: string,
) {
  if (config.note_required && !note.trim())
    return `Preencha: ${config.note_label}`;
  if (note.length > config.note_max_chars)
    return `O relato permite até ${config.note_max_chars} caracteres.`;
  for (const question of config.questions) {
    const value = answers[question.id] ?? "";
    if (question.required && !value.trim())
      return `Preencha: ${question.label}`;
    if (!value.trim()) continue;
    if (value.length > question.max_chars)
      return `${question.label}: limite de ${question.max_chars} caracteres.`;
    if (question.type === "number" && !/^-?\d+([.,]\d+)?$/.test(value))
      return `Informe um número: ${question.label}`;
    if (question.type === "select" && !question.options.includes(value))
      return `Selecione uma opção: ${question.label}`;
  }
  return "";
}
export const listFromLines = (text: string) => [
  ...new Set(
    text
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];
