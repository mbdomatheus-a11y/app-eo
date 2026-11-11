import { useCallback, useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
import { storeProvision, storeResetToDefault } from "./store-access";

type Item = {
  perfil_id: string;
  usuario: string;
  email: string;
  loja: string;
  loja_nome: string;
  bloqueada: boolean;
  falhas: number;
  senha_padrao: boolean;
  ultimo_acesso: string | null;
  pedido: { id: number; em: string; origem: string } | null;
};
type Page = {
  resumo: { total: number; bloqueadas: number; senha_padrao: number; pedidos: number; lojas_sem_conta: number };
  itens: Item[];
};
const FILTERS = [
  ["pedidos", "Pedidos de senha"],
  ["bloqueadas", "Bloqueadas"],
  ["senha_padrao", "Ainda na senha padrão"],
  ["todas", "Todas"],
] as const;

export function StoreAccounts() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pedidos");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setData(
        await rpc<Page>("acesso_admin_contas_loja", {
          p_busca: query.trim() || null,
          p_filtro: filter,
          p_limite: 50,
          p_offset: page * 50,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, [filter, query, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await task());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  const provisionAll = () =>
    run(async () => {
      let total = 0;
      const failed: string[] = [];
      for (let i = 0; i < 30; i++) {
        const r = await storeProvision(30);
        total += r.criadas;
        failed.push(...r.falhas);
        setMessage(`Criando contas: ${total} criadas, ${r.restantes} restantes...`);
        if (!r.restantes || (!r.criadas && r.falhas.length)) break;
      }
      return `${total} contas criadas.${failed.length ? ` Falharam: ${failed.join(", ")}.` : ""}`;
    });

  const r = data?.resumo;
  return (
    <section className="panel store-accounts" aria-labelledby="store-accounts-title">
      <h3 id="store-accounts-title">Contas de loja</h3>
      <p>
        Usuário gerNNN@pernambucanas.com.br (ex.: ger006) com a senha padrão combinada. No primeiro acesso a loja troca a senha. Após 3 erros a
        conta bloqueia até você aprovar a redefinição, que volta a senha ao padrão.
      </p>
      {r && (
        <div className="store-accounts-summary" role="list">
          <span role="listitem"><strong>{r.total}</strong> contas</span>
          <span role="listitem"><strong>{r.pedidos}</strong> pedidos</span>
          <span role="listitem"><strong>{r.bloqueadas}</strong> bloqueadas</span>
          <span role="listitem"><strong>{r.senha_padrao}</strong> na senha padrão</span>
          <span role="listitem"><strong>{r.lojas_sem_conta}</strong> lojas sem conta</span>
        </div>
      )}
      {!!r?.lojas_sem_conta && (
        <button className="primary" disabled={busy} onClick={() => void provisionAll()}>
          Criar contas das {r.lojas_sem_conta} lojas sem conta
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="store-accounts-filters" role="group" aria-label="Filtrar contas">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "selected" : ""}
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        Buscar loja ou usuário
        <input
          value={query}
          placeholder="Ex.: 006, Santos, ger100"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <ul className="store-accounts-list">
        {data?.itens.map((x) => (
          <li key={x.perfil_id}>
            <div>
              <strong>{x.usuario}</strong> {x.loja_nome} ({x.loja})
              <small>
                {x.bloqueada ? "Bloqueada" : x.senha_padrao ? "Senha padrão" : "Senha própria"}
                {x.ultimo_acesso ? `, último acesso ${new Date(x.ultimo_acesso).toLocaleString("pt-BR")}` : ", nunca acessou"}
                {x.pedido ? `, pediu redefinição em ${new Date(x.pedido.em).toLocaleString("pt-BR")}` : ""}
              </small>
            </div>
            <div className="store-accounts-actions">
              {x.pedido && (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await storeResetToDefault(x.perfil_id, x.pedido!.id);
                        return `${x.usuario} voltou para a senha padrão e foi desbloqueada.`;
                      })
                    }
                  >
                    Aprovar
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await rpc("acesso_admin_recusar_reset", { p_solicitacao: x.pedido!.id });
                        return "Pedido recusado.";
                      })
                    }
                  >
                    Recusar
                  </button>
                </>
              )}
              {!x.pedido && (x.bloqueada || !x.senha_padrao) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await storeResetToDefault(x.perfil_id);
                      return `${x.usuario} voltou para a senha padrão.`;
                    })
                  }
                >
                  Voltar ao padrão
                </button>
              )}
            </div>
          </li>
        ))}
        {data && !data.itens.length && <li>Nenhuma conta neste filtro.</li>}
      </ul>
      <div className="store-accounts-pager">
        <button disabled={!page} onClick={() => setPage(page - 1)}>Anteriores</button>
        <button disabled={(data?.itens.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Próximas</button>
      </div>
    </section>
  );
}
