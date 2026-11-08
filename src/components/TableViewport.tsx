import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TableViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, max: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setScroll({ left: node.scrollLeft, max: Math.max(0, node.scrollWidth - node.clientWidth) });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); node.removeEventListener("scroll", update); };
  }, [children]);
  return <div className="data-viewport">
    {scroll.max > 1 && <div className="table-navigation"><span>Mais colunas</span><button type="button" aria-label="Rolar tabela para a esquerda" disabled={scroll.left < 1} onClick={() => ref.current?.scrollBy({ left: -320 })}><ChevronLeft size={18} /></button><input type="range" min="0" max={scroll.max} value={scroll.left} aria-label="Posição horizontal da tabela" onChange={(event) => { if (ref.current) ref.current.scrollLeft = Number(event.target.value); }} /><button type="button" aria-label="Rolar tabela para a direita" disabled={scroll.left >= scroll.max - 1} onClick={() => ref.current?.scrollBy({ left: 320 })}><ChevronRight size={18} /></button></div>}
    <div className="table-wrap" ref={ref} tabIndex={0} role="region" aria-label="Tabela de dados, com rolagem horizontal e vertical">{children}</div>
  </div>;
}
