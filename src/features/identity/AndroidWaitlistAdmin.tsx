import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
import "./android-waitlist.css";

type Entry = {
  id: string;
  name: string;
  chapa: string;
  email: string;
  created_at: string;
  status: "pending";
};

type WaitlistPage = {
  items: Entry[];
  total: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 30;

export function AndroidWaitlistAdmin() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<WaitlistPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void rpc<WaitlistPage>("eo_admin_android_waitlist", {
        p_search: search.trim(),
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      }).then((data) => {
        if (active) setResult(data);
      }).catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a lista.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, search, page, revision]);

  return (
    <details className="panel android-waitlist-admin" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Solicitações para testar no Android</summary>
      {open && (
        <div className="android-waitlist-content">
          <p>Inclua o e-mail da conta Google em uma lista de testadores própria do EO. Depois, a pessoa abre o convite pelo Google Play usando a mesma conta.</p>
          <p><a href="https://play.google.com/console/u/0/developers/8960154356839047529/app/4972840947538514394/tracks/4700203061802526697?tab=testers" target="_blank" rel="noopener noreferrer">Abrir testadores no Play Console</a></p>
          <div className="android-waitlist-toolbar">
            <label>
              Buscar nome, chapa ou e-mail
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                placeholder="Digite para filtrar"
                autoComplete="off"
              />
            </label>
            <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>
              Atualizar lista
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="small muted" role="status">
            {loading ? "Carregando cadastros..." : `${result?.total ?? 0} cadastro(s) encontrado(s)`}
          </p>
          <ul className="android-waitlist-list">
            {result?.items.map((entry) => (
              <li key={entry.id}>
                <div><strong>{entry.name}</strong><span>Chapa {entry.chapa}</span></div>
                <div><a href={`mailto:${entry.email}`}>{entry.email}</a><small>Recebido em {new Date(entry.created_at).toLocaleString("pt-BR")}</small></div>
              </li>
            ))}
            {!loading && result && !result.items.length && <li>Nenhum cadastro neste filtro.</li>}
          </ul>
          <div className="store-accounts-pager">
            <button type="button" disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>Anteriores</button>
            <span>Página {page + 1}</span>
            <button type="button" disabled={loading || (page + 1) * PAGE_SIZE >= (result?.total ?? 0)} onClick={() => setPage((value) => value + 1)}>Próximas</button>
          </div>
        </div>
      )}
    </details>
  );
}
