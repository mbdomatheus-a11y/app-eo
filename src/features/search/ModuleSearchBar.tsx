// Barra de busca fixa no topo do portal: digitar o nome de um módulo abre o módulo.
// Recebe só a navegação já filtrada pelos módulos liberados para a conta e para a empresa.
import { useId, useState } from "react";
import { Search } from "lucide-react";
import { buscarModulos } from "../../core/module-search";

type Item = { id: string; label: string };

export function ModuleSearchBar<T extends Item>({ itens, abrir }: { itens: T[]; abrir: (item: T) => void }) {
  const [consulta, setConsulta] = useState("");
  const [ativo, setAtivo] = useState(0);
  const listaId = useId();
  const resultados = buscarModulos(consulta, itens);
  const escolher = (item: T | undefined) => {
    if (!item) return;
    setConsulta("");
    setAtivo(0);
    abrir(item);
  };
  return (
    <div className="module-search" role="search">
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={consulta}
        placeholder="Buscar módulo"
        aria-label="Buscar módulo"
        aria-controls={listaId}
        aria-expanded={!!consulta.trim()}
        autoComplete="off"
        onChange={(e) => {
          setConsulta(e.target.value);
          setAtivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((v) => Math.min(v + 1, Math.max(resultados.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((v) => Math.max(v - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(resultados[ativo]);
          } else if (e.key === "Escape") setConsulta("");
        }}
      />
      {consulta.trim() && (
        <ul className="module-search-results" id={listaId} role="listbox">
          {resultados.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === ativo}>
              <button type="button" className={i === ativo ? "active" : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(item)}>
                {item.label}
              </button>
            </li>
          ))}
          {!resultados.length && <li className="module-search-empty">Nenhum módulo encontrado.</li>}
        </ul>
      )}
    </div>
  );
}
