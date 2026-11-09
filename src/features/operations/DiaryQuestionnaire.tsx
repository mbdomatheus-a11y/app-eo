import { useState } from "react";
import { rpc } from "../../services/supabase";
import {
  listFromLines,
  type DiaryConfig,
  type DiaryConfiguration,
} from "./questionnaire";
import { SuccessToast } from "../../components/SuccessToast";
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
        <label key={q.id}>
          {q.label}
          {q.required ? " *" : ""}
          {q.type === "select" ? (
            <select
              value={answers[q.id] ?? ""}
              required={q.required}
              onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
            >
              <option value="">Selecione</option>
              {q.options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input
              value={answers[q.id] ?? ""}
              inputMode={q.type === "number" ? "decimal" : "text"}
              required={q.required}
              maxLength={q.max_chars}
              onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
            />
          )}
        </label>
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
  const [config, setConfig] = useState<DiaryConfig>(() =>
    structuredClone(value.config),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("eo_admin_save_diary_configuration", {
        p_config: config,
        p_expected_version: value.version,
      });
      setMessage(
        "Questionário atualizado. Os registros anteriores foram preservados.",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Configurar diário · versão {value.version}</summary>
      <div className="form">
        <p>
          As mudanças valem para novos registros. Cada resposta preserva a
          versão da pergunta.
        </p>
        <label>
          Pergunta principal
          <input
            maxLength={300}
            value={config.prompt}
            onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
          />
        </label>
        <label>
          Pergunta do relato
          <input
            value={config.note_label}
            maxLength={300}
            onChange={(e) =>
              setConfig({ ...config, note_label: e.target.value })
            }
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={config.note_required}
            onChange={(e) =>
              setConfig({ ...config, note_required: e.target.checked })
            }
          />
          Relato obrigatório
        </label>
        <label>
          Limite de caracteres do relato
          <input
            type="number"
            min={1}
            max={5000}
            value={config.note_max_chars}
            onChange={(e) =>
              setConfig({ ...config, note_max_chars: Number(e.target.value) })
            }
          />
        </label>
        {(["sold", "no_sale"] as const).map((kind) => (
          <label key={kind}>
            Categorias de influência · {kind === "sold" ? "Venda" : "Não venda"}{" "}
            (uma por linha)
            <textarea
              rows={5}
              defaultValue={config[kind].join("\n")}
              onBlur={(e) =>
                setConfig({ ...config, [kind]: listFromLines(e.target.value) })
              }
            />
          </label>
        ))}
        {config.questions.map((q, index) => (
          <fieldset key={q.id}>
            <legend>Pergunta {index + 1}</legend>
            <label>
              Pergunta
              <input
                value={q.label}
                maxLength={300}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    questions: config.questions.map((item, i) =>
                      i === index ? { ...item, label: e.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              Tipo
              <select
                value={q.type}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    questions: config.questions.map((item, i) =>
                      i === index
                        ? { ...item, type: e.target.value as typeof q.type }
                        : item,
                    ),
                  })
                }
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="select">Seleção</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    questions: config.questions.map((item, i) =>
                      i === index
                        ? { ...item, required: e.target.checked }
                        : item,
                    ),
                  })
                }
              />
              Obrigatória
            </label>
            <label>
              Limite de caracteres
              <input
                type="number"
                min={1}
                max={5000}
                value={q.max_chars}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    questions: config.questions.map((item, i) =>
                      i === index
                        ? { ...item, max_chars: Number(e.target.value) }
                        : item,
                    ),
                  })
                }
              />
            </label>
            {q.type === "select" && (
              <label>
                Opções, uma por linha
                <textarea
                  defaultValue={q.options.join("\n")}
                  onBlur={(e) =>
                    setConfig({
                      ...config,
                      questions: config.questions.map((item, i) =>
                        i === index
                          ? { ...item, options: listFromLines(e.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            )}
            <button
              className="secondary"
              onClick={() =>
                setConfig({
                  ...config,
                  questions: config.questions.filter((_, i) => i !== index),
                })
              }
            >
              Remover pergunta
            </button>
          </fieldset>
        ))}
        <button
          className="secondary"
          disabled={config.questions.length >= 15}
          onClick={() =>
            setConfig({
              ...config,
              questions: [
                ...config.questions,
                {
                  id: `q_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
                  label: "",
                  type: "text",
                  required: false,
                  max_chars: 500,
                  options: [],
                },
              ],
            })
          }
        >
          Adicionar pergunta
        </button>
        <p role="alert">{error}</p>
        <SuccessToast message={message} />
        <button className="primary" disabled={busy} onClick={() => void save()}>
          Salvar configuração
        </button>
      </div>
    </details>
  );
}
