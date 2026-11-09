import { useState } from "react";
import { Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Field, s } from "../ui";
import {
  listFromLines,
  type DiaryConfig,
  type DiaryConfiguration,
  type DiaryQuestion,
} from "./questionnaire";
import { SuccessToast } from "./SuccessToast";
export function DiaryQuestions({
  config,
  answers,
  onChange,
}: {
  config: DiaryConfig;
  answers: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  return (
    <>
      {config.questions.map((q) => (
        <View key={q.id} style={{ gap: 8 }}>
          {q.type === "select" ? (
            <>
              <Text style={s.label}>
                {q.label}
                {q.required ? " *" : ""}
              </Text>
              {q.options.map((option) => (
                <Choice
                  key={option}
                  label={option}
                  selected={answers[q.id] === option}
                  onPress={() =>
                    onChange({
                      ...answers,
                      [q.id]: answers[q.id] === option ? "" : option,
                    })
                  }
                />
              ))}
            </>
          ) : (
            <Field
              label={`${q.label}${q.required ? " *" : ""}`}
              value={answers[q.id] ?? ""}
              onChangeText={(value) => onChange({ ...answers, [q.id]: value })}
              maxLength={q.max_chars}
              keyboardType={
                q.type === "number" ? "numbers-and-punctuation" : "default"
              }
            />
          )}
        </View>
      ))}
    </>
  );
}
export function DiaryConfigurationEditor({
  value,
  onSaved,
}: {
  value: DiaryConfiguration;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<DiaryConfig>(() =>
    JSON.parse(JSON.stringify(value.config)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const patch = (index: number, next: Partial<DiaryQuestion>) =>
    setConfig({
      ...config,
      questions: config.questions.map((q, i) =>
        i === index ? { ...q, ...next } : q,
      ),
    });
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("eo_admin_save_diary_configuration", {
        p_config: config,
        p_expected_version: value.version,
      });
      setMessage("Questionário atualizado. Histórico preservado.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Button
        secondary
        title={`Configurar diário · versão ${value.version}`}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Text style={s.small}>
            As mudanças valem para novos registros. Cada resposta preserva a
            versão da pergunta.
          </Text>
          <Field
            label="Pergunta principal"
            value={config.prompt}
            onChangeText={(prompt) => setConfig({ ...config, prompt })}
            maxLength={300}
          />
          <Field
            label="Pergunta do relato"
            value={config.note_label}
            onChangeText={(note_label) => setConfig({ ...config, note_label })}
            maxLength={300}
          />
          <Choice
            label="Relato obrigatório"
            selected={config.note_required}
            onPress={() =>
              setConfig({ ...config, note_required: !config.note_required })
            }
          />
          <Field
            label="Limite de caracteres do relato (1 a 5000)"
            value={String(config.note_max_chars)}
            keyboardType="number-pad"
            onChangeText={(v) =>
              setConfig({ ...config, note_max_chars: Number(v) })
            }
          />
          {(["sold", "no_sale"] as const).map((kind) => (
            <Field
              key={kind}
              label={`Categorias de influência · ${kind === "sold" ? "Venda" : "Não venda"}, uma por linha`}
              multiline
              defaultValue={config[kind].join("\n")}
              onEndEditing={(e) =>
                setConfig({
                  ...config,
                  [kind]: listFromLines(e.nativeEvent.text),
                })
              }
            />
          ))}
          {config.questions.map((q, index) => (
            <View
              key={q.id}
              style={{
                gap: 9,
                borderTopWidth: 1,
                borderColor: "#ddd",
                paddingTop: 14,
              }}
            >
              <Text style={s.strong}>Pergunta {index + 1}</Text>
              <Field
                label="Pergunta"
                value={q.label}
                maxLength={300}
                onChangeText={(label) => patch(index, { label })}
              />
              {(["text", "number", "select"] as const).map((type) => (
                <Choice
                  key={type}
                  label={
                    { text: "Texto", number: "Número", select: "Seleção" }[type]
                  }
                  selected={q.type === type}
                  onPress={() => patch(index, { type })}
                />
              ))}
              <Choice
                label="Obrigatória"
                selected={q.required}
                onPress={() => patch(index, { required: !q.required })}
              />
              <Field
                label="Limite de caracteres (1 a 5000)"
                value={String(q.max_chars)}
                keyboardType="number-pad"
                onChangeText={(v) => patch(index, { max_chars: Number(v) })}
              />
              {q.type === "select" && (
                <Field
                  label="Opções, uma por linha"
                  multiline
                  defaultValue={q.options.join("\n")}
                  onEndEditing={(e) =>
                    patch(index, { options: listFromLines(e.nativeEvent.text) })
                  }
                />
              )}
              <Button
                secondary
                title="Remover pergunta"
                onPress={() =>
                  setConfig({
                    ...config,
                    questions: config.questions.filter((_, i) => i !== index),
                  })
                }
              />
            </View>
          ))}
          <Button
            secondary
            title="Adicionar pergunta"
            disabled={config.questions.length >= 15}
            onPress={() =>
              setConfig({
                ...config,
                questions: [
                  ...config.questions,
                  {
                    id: `q_${Crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
                    label: "",
                    type: "text",
                    required: false,
                    max_chars: 500,
                    options: [],
                  },
                ],
              })
            }
          />
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
          <SuccessToast message={message} />
          <Button
            title="Salvar configuração"
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
    </Card>
  );
}
