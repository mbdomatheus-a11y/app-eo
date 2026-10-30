import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, Building2, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, ClipboardCheck, Clock3, FileImage, Grid2X2, Home, LayoutDashboard, Megaphone, Mic, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, Users, X, type LucideIcon } from 'lucide-react';
import { acknowledge, canPublish, canReadNotice, canTarget, hasAcknowledged, people, roleLabels, tasks, visibleTasks, type DemoState, type Notice } from './core/domain';
import { loadDemo, saveDemo } from './services/demo-store';

type Page = 'home' | 'comunicados' | 'rotina' | 'modulos' | 'admin';
const modules: { id: string; title: string; description: string; icon: LucideIcon; status: string }[] = [
  { id: 'comunicados', title: 'Comunicados', description: 'Todo mundo na mesma direção.', icon: Megaphone, status: 'Disponível na prévia' },
  { id: 'checklist', title: 'Checklist', description: 'Cada detalhe faz a diferença.', icon: ClipboardCheck, status: 'Rotina demonstrativa' },
  { id: 'cartazes', title: 'Cartazeamento', description: 'A campanha certa em cada espaço.', icon: FileImage, status: 'Próxima integração' },
  { id: 'escala', title: 'Escala da equipe', description: 'Pessoas e horários em sintonia.', icon: CalendarDays, status: 'Próxima integração' },
  { id: 'evidencias', title: 'Fotos e evidências', description: 'A operação vista de perto.', icon: Upload, status: 'Em planejamento' },
  { id: 'diario', title: 'Diário de vendas', description: 'Sua voz, os aprendizados do dia.', icon: Mic, status: 'Integração com IA futura' },
];

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Fechar" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>;
}

export default function App() {
  const [state, setState] = useState<DemoState>(loadDemo);
  const [personId, setPersonId] = useState('ana');
  const [page, setPage] = useState<Page>('home');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'todos' | 'pendentes' | 'confirmados'>('todos');
  const [opened, setOpened] = useState<Notice | null>(null);
  const [compose, setCompose] = useState(false);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [adminTab, setAdminTab] = useState<'identidade' | 'acessos' | 'auditoria'>('identidade');
  const person = people.find(p => p.id === personId)!;
  const notices = state.notices.filter(n => canReadNotice(person, n));
  const pending = notices.filter(n => !hasAcknowledged(state.receipts, person, n));
  const myTasks = visibleTasks(person, tasks);
  const remaining = myTasks.filter(t => !state.completed.includes(t.id));
  const done = myTasks.length - remaining.length;
  const selectedModule = modules.find(m => m.id === moduleId);
  const isLeader = person.role === 'diretor' || person.role === 'admin';
  const visibleModules = modules.filter(m => !state.disabledModules.includes(m.id));
  const cleanQuery = query.trim().toLocaleLowerCase('pt-BR');
  const matching = notices.filter(n => `${n.title} ${n.category} ${n.body}`.toLocaleLowerCase('pt-BR').includes(cleanQuery));
  const filtered = matching.filter(n => filter === 'todos' || hasAcknowledged(state.receipts, person, n) === (filter === 'confirmados'));
  const title = { home: 'Visão geral', comunicados: 'Comunicados', rotina: 'Minha rotina', modulos: 'Aplicativos', admin: 'Administração' }[page];

  useEffect(() => { setStorageError(!saveDemo(state)); }, [state]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); } }, [toast]);

  function event(action: string, detail: string) {
    return { id: crypto.randomUUID(), actor: person.name, action, detail, at: new Date().toISOString() };
  }
  function navigate(next: Page) { if (next === 'admin' && person.role !== 'admin') return; setPage(next); setQuery(''); }
  function confirmNotice(notice: Notice) {
    if (!canReadNotice(person, notice) || hasAcknowledged(state.receipts, person, notice)) return;
    const log = event('Ciência confirmada', `${notice.title} · versão ${notice.version}`);
    setState(s => ({ ...s, receipts: acknowledge(s.receipts, person, notice, log.at), events: [log, ...s.events] }));
    setToast('Sua confirmação foi registrada nesta prévia.');
  }
  function toggleTask(id: string) {
    if (!myTasks.some(t => t.id === id)) return;
    const task = myTasks.find(t => t.id === id)!;
    const completed = state.completed.includes(id);
    const log = event(completed ? 'Tarefa reaberta' : 'Tarefa concluída', task.title);
    setState(s => ({ ...s, completed: completed ? s.completed.filter(t => t !== id) : [...s.completed, id], events: [log, ...s.events] }));
  }
  function openModule(id: string) {
    if (state.disabledModules.includes(id)) return;
    if (id === 'comunicados') navigate('comunicados');
    else if (id === 'checklist') navigate('rotina');
    else setModuleId(id);
  }
  function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const stores = data.get('target') === 'all' ? person.stores : [String(data.get('target'))];
    if (!canTarget(person, stores)) return;
    const notice: Notice = { id: crypto.randomUUID(), version: 1, title: String(data.get('title')).trim(), body: String(data.get('body')).trim(), category: 'Operações', stores, urgent: data.get('urgent') === 'on', date: new Date().toISOString() };
    if (!notice.title || !notice.body) return;
    const log = event('Comunicado criado na prévia', notice.title);
    setState(s => ({ ...s, notices: [notice, ...s.notices], events: [log, ...s.events] }));
    setCompose(false); setToast('Comunicado criado apenas neste navegador.');
  }
  async function changeLogo(file?: File) {
    if (!file || person.role !== 'admin') return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 500_000) { setToast('Escolha PNG, JPG ou WebP com até 500 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const image = new Image();
      image.onload = () => { const log = event('Identidade atualizada', 'Logo da prévia'); setState(s => ({ ...s, logo: result, events: [log, ...s.events] })); setToast('Logo atualizado nesta prévia.'); };
      image.onerror = () => setToast('Não foi possível ler essa imagem.');
      image.src = result;
    };
    reader.onerror = () => setToast('Não foi possível abrir o arquivo.');
    reader.readAsDataURL(file);
  }
  function NoticeCard({ notice }: { notice: Notice }) {
    const read = hasAcknowledged(state.receipts, person, notice);
    return <button className="notice-card" onClick={() => setOpened(notice)}>
      <div className="notice-top"><span className={`badge ${notice.urgent && !read ? 'yellow' : ''}`}>{notice.category}</span><span className="small muted">{new Date(notice.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span></div>
      <h3>{notice.title}</h3><p>{notice.body.split('\n')[0]}</p>
      <div className="notice-bottom"><span className={read ? 'success' : ''}>{read ? <CheckCheck size={15} /> : <Clock3 size={15} />}{read ? 'Ciência confirmada' : 'Sua confirmação é importante'}</span><ArrowRight size={18} /></div>
    </button>;
  }
  function TaskList({ all = false }: { all?: boolean }) {
    return <div className="task-list">{(all ? myTasks : myTasks.slice(0, 3)).map(task => <div className={`task-row ${state.completed.includes(task.id) ? 'done' : ''}`} key={task.id}>
      <button className="task-check" aria-label={`${state.completed.includes(task.id) ? 'Reabrir' : 'Concluir'}: ${task.title}`} aria-pressed={state.completed.includes(task.id)} onClick={() => toggleTask(task.id)}>{state.completed.includes(task.id) && <Check size={15} />}</button>
      <div><strong>{task.title}</strong><span>{task.area}{isLeader ? ` · Loja ${task.store}` : ''}</span></div><time>{task.time}</time>
    </div>)}</div>;
  }

  return <div className="app-shell">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('home'); }}>{state.logo ? <img src={state.logo} alt="Logo da empresa" /> : <span className="brand-mark">eo<span>•</span></span>}<span className="brand-copy">OPERAÇÃO<br /><b>CONECTADA</b></span></a>
      <div className="workspace"><span className="workspace-icon"><Building2 size={20} /></span><div><b>Espaço das lojas</b><span>Excelência no dia a dia</span></div></div>
      <p className="nav-label">SEU ESPAÇO</p>
      <nav aria-label="Navegação principal">{([
        ['home', Home, 'Visão geral'], ['comunicados', Megaphone, 'Comunicados'], ['rotina', ClipboardCheck, 'Minha rotina'], ['modulos', Grid2X2, 'Aplicativos'],
      ] as [Page, LucideIcon, string][]).map(([id, Icon, label]) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{id === 'comunicados' && pending.length > 0 && <b className="nav-count">{pending.length}</b>}</button>)}</nav>
      {person.role === 'admin' && <><p className="nav-label">GESTÃO</p><button className={`nav-item ${page === 'admin' ? 'active' : ''}`} onClick={() => navigate('admin')}><Settings2 size={19} /><span>Administração</span></button></>}
      <div className="sidebar-bottom"><div className="connection-card"><span className="connection-symbol"><Sparkles size={22} /></span><h3>Mais conexão.<br />Melhor operação.</h3><p>Um espaço para simplificar<br />o dia de quem faz acontecer.</p></div><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={19} /><span>Sobre esta prévia</span></button><span className="sidebar-version">App EO · versão 0.1</span></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Meu espaço <ChevronRight size={14} /><b>{title}</b></div><div className="top-actions"><button className="notification-button" aria-label={`Ver ${pending.length} comunicados pendentes`} onClick={() => { navigate('comunicados'); setFilter('pendentes'); }}><Bell size={20} />{pending.length > 0 && <span />}</button><div className="top-divider" /><span className="avatar">{person.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div className="top-person"><b>{person.name}</b><span>{roleLabels[person.role]}</span></div></div></header>
      <div className="demo-bar"><span><span className="demo-dot" />Prévia local <span className="demo-description">· Dados fictícios, sem envios reais</span></span><label>Experimentar como <select aria-label="Perfil da demonstração" value={personId} onChange={e => { setPersonId(e.target.value); setPage('home'); setOpened(null); setCompose(false); setQuery(''); }}>{people.map(p => <option key={p.id} value={p.id}>{roleLabels[p.role]}</option>)}</select></label></div>
      {storageError && <div role="alert" className="storage-alert">O navegador não conseguiu salvar a prévia. Alterações serão perdidas ao fechar.</div>}
      <main id="conteudo">
        <div className="page-heading"><div><div className="eyebrow"><span />{person.label}</div><h1>{page === 'home' ? `Olá, ${person.name.split(' ')[0]}. Vamos fazer acontecer?` : title}</h1><p>{page === 'home' ? 'O que importa para o seu dia, em um só lugar.' : page === 'comunicados' ? 'Informação que conecta. Confirmação que dá visibilidade.' : page === 'rotina' ? 'Pequenos cuidados que fazem uma grande diferença.' : page === 'modulos' ? 'As ferramentas da sua operação, cada vez mais próximas.' : 'Organize o espaço e acompanhe a atividade da prévia.'}</p></div>{page === 'comunicados' && canPublish(person) ? <button className="primary" onClick={() => setCompose(true)}><Plus size={18} />Novo comunicado</button> : <div className="date-chip"><CalendarDays size={16} />{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>}</div>

        {page === 'home' && <>
          <section className="hero"><div className="hero-copy"><span className="hero-kicker"><span /> NOSSA OPERAÇÃO, MAIS PERTO</span><h2>Grandes resultados.<br /><span>Uma equipe conectada.</span></h2><p>Informação clara, prioridades organizadas e mais tempo<br className="desktop-br" /> para cuidar de quem entra na nossa loja.</p><button className="dark-button" onClick={() => navigate('rotina')}>Organizar meu dia <ArrowRight size={17} /></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-dot dot-one" /><div className="hero-dot dot-two" /><div className="floating-card card-back"><Building2 size={28} /><span>Juntos em cada loja</span></div><div className="floating-card card-front"><div className="floating-icon"><Check size={24} /></div><b>Conexão que<br />vira ação.</b><div className="mini-avatars"><span>A</span><span>L</span><span>C</span><small>Seu time, mais perto</small></div></div></div></section>
          <section className="stats" aria-label="Resumo do seu espaço">{[
            { label: 'Comunicados para confirmar', value: pending.length, text: pending.length ? 'Fique por dentro das orientações' : 'Tudo lido e confirmado', icon: Megaphone, page: 'comunicados' as Page },
            { label: 'Tarefas da sua rotina', value: remaining.length, text: `${done} de ${myTasks.length} concluídas na prévia`, icon: ClipboardCheck, page: 'rotina' as Page },
            { label: isLeader ? 'Lojas na sua abrangência' : 'Seu espaço de trabalho', value: isLeader ? person.stores.length : '001', text: isLeader ? 'Visão integrada da operação' : 'Centro · Regional São Paulo', icon: Building2, page: 'modulos' as Page },
          ].map(stat => <button key={stat.label} className="stat" onClick={() => navigate(stat.page)}><div className="stat-top"><span>{stat.label}</span><stat.icon size={20} /></div><strong>{stat.value}</strong><span className="stat-foot">{stat.text}<ArrowRight size={15} /></span></button>)}</section>
          <div className="section-heading"><div><h2>Seu trabalho, mais simples</h2><p>Acesse as ferramentas da sua rotina.</p></div><button className="text-button" onClick={() => navigate('modulos')}>Ver aplicativos <ArrowRight size={16} /></button></div>
          <section className="module-grid home-modules">{visibleModules.slice(0, 4).map(m => <button className="module-card" key={m.id} onClick={() => openModule(m.id)}><span className={`module-icon ${m.id === 'comunicados' ? 'yellow-icon' : ''}`}><m.icon size={24} /></span><h3>{m.title}</h3><p>{m.description}</p><span className="module-status">{m.status}<ArrowRight size={15} /></span></button>)}</section>
          <div className="home-bottom"><section><div className="section-heading"><h2>Fique por dentro <span className="count-pill">{notices.length}</span></h2><button className="text-button" onClick={() => navigate('comunicados')}>Ver todos <ArrowRight size={16} /></button></div><div className="notice-grid">{notices.slice(0, 2).map(n => <NoticeCard key={n.id} notice={n} />)}</div></section><section className="routine-panel"><div className="section-heading"><h2>Sua rotina</h2><span className="small muted">{done}/{myTasks.length}</span></div><div className="progress"><span style={{ width: `${myTasks.length ? done / myTasks.length * 100 : 0}%` }} /></div><TaskList /><button className="text-button routine-link" onClick={() => navigate('rotina')}>Acompanhar minha rotina <ArrowRight size={16} /></button></section></div>
        </>}

        {page === 'comunicados' && <><div className="toolbar"><div className="tabs">{(['todos', 'pendentes', 'confirmados'] as const).map(f => <button className={filter === f ? 'selected' : ''} key={f} onClick={() => setFilter(f)}>{({ todos: 'Todos', pendentes: 'Para confirmar', confirmados: 'Confirmados' })[f]}</button>)}</div><label className="search"><Search size={18} /><input placeholder="Buscar comunicado" aria-label="Buscar comunicado" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="notice-grid full-notices">{filtered.map(n => <NoticeCard key={n.id} notice={n} />)}</div>{filtered.length === 0 && <div className="empty"><CheckCheck size={36} /><h2>{query ? 'Nenhum resultado encontrado' : 'Tudo certo por aqui'}</h2><p>{query ? 'Tente outra palavra na busca.' : 'Não há comunicados neste filtro.'}</p></div>}</>}
        {page === 'rotina' && <section className="panel"><div className="section-heading"><div><h2>Rotina demonstrativa</h2><p>{done} de {myTasks.length} tarefas concluídas · As marcações ficam neste navegador.</p></div><ClipboardCheck size={26} /></div><TaskList all /><div className="info-strip">O módulo completo de checklist será integrado depois. Aqui você pode experimentar a conclusão e a reabertura de tarefas.</div></section>}
        {page === 'modulos' && <section className="module-grid all-modules">{visibleModules.map(m => <button className="module-card" key={m.id} onClick={() => openModule(m.id)}><span className="module-icon"><m.icon size={26} /></span><h3>{m.title}</h3><p>{m.description}</p><span className="module-status">{m.status}<ArrowRight size={16} /></span></button>)}</section>}
        {page === 'admin' && person.role === 'admin' && <><div className="tabs admin-tabs">{(['identidade', 'acessos', 'auditoria'] as const).map(t => <button key={t} className={adminTab === t ? 'selected' : ''} onClick={() => setAdminTab(t)}>{({ identidade: 'Identidade e módulos', acessos: 'Perfis e abrangência', auditoria: 'Atividade da prévia' })[t]}</button>)}</div>
          {adminTab === 'identidade' && <div className="admin-grid"><section className="panel"><h2>Uma identidade, todas as lojas</h2><p>Adicione o logo para visualizar a marca neste espaço.</p><div className="logo-preview">{state.logo ? <img src={state.logo} alt="Logo configurado" /> : <span className="brand-mark">eo<span>•</span></span>}</div><label className="primary upload-label"><Upload size={18} />Escolher logo<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Escolher logo" onChange={e => { void changeLogo(e.target.files?.[0]); e.target.value = ''; }} /></label><p className="small muted">PNG, JPG ou WebP · até 500 KB · salvo só neste navegador</p>{state.logo && <button className="text-button" onClick={() => { const log = event('Identidade atualizada', 'Logo removido'); setState(s => ({ ...s, logo: '', events: [log, ...s.events] })); }}>Remover logo</button>}<div className="swatches">{['#4A4E58', '#FBF2A3', '#DDDAD5', '#FEFEFE'].map(color => <div key={color}><span style={{ background: color }} /><small>{color}</small></div>)}</div></section><section className="panel"><h2>Catálogo de aplicativos</h2><p>Escolha quais integrações futuras aparecem na prévia.</p>{modules.map(m => <div className="module-setting" key={m.id}><div><strong>{m.title}</strong><span>{m.status}</span></div>{['comunicados', 'checklist'].includes(m.id) ? <span className="badge">Núcleo</span> : <button className={`switch ${!state.disabledModules.includes(m.id) ? 'on' : ''}`} role="switch" aria-label={`Exibir ${m.title}`} aria-checked={!state.disabledModules.includes(m.id)} onClick={() => { const disabled = state.disabledModules.includes(m.id); const log = event('Catálogo alterado', `${m.title}: ${disabled ? 'visível' : 'oculto'}`); setState(s => ({ ...s, disabledModules: disabled ? s.disabledModules.filter(id => id !== m.id) : [...s.disabledModules, m.id], events: [log, ...s.events] })); }}><span /></button>}</div>)}</section></div>}
          {adminTab === 'acessos' && <section className="panel"><h2>Perfis da demonstração</h2><p>Identidades fictícias para validar as experiências. Não são contas de acesso reais.</p><div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Abrangência</th></tr></thead><tbody>{people.map(p => <tr key={p.id}><td>{p.name}</td><td><span className="badge">{roleLabels[p.role]}</span></td><td>{p.label}</td></tr>)}</tbody></table></div><div className="info-strip"><ShieldCheck size={20} />O login individual e a validação das permissões no servidor serão implementados antes de usar dados reais. A integração corporativa ficará preparada para uma próxima fase.</div></section>}
          {adminTab === 'auditoria' && <section className="panel"><h2>Atividade da prévia</h2><p>Histórico local para avaliar a experiência. Ainda não é uma trilha de auditoria protegida.</p>{state.events.length === 0 ? <div className="empty"><Clock3 size={30} /><h3>Nenhuma atividade registrada</h3><p>Confirme um comunicado ou conclua uma tarefa para experimentar.</p></div> : <div className="table-wrap"><table><thead><tr><th>Quando</th><th>Pessoa</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>{state.events.map(log => <tr key={log.id}><td>{new Date(log.at).toLocaleString('pt-BR')}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.detail}</td></tr>)}</tbody></table></div>}</section>}
        </>}
        <footer><span>Feito para quem faz a operação acontecer.</span><span>EO · Operação conectada</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Navegação móvel">{([['home', Home, 'Início'], ['comunicados', Megaphone, 'Avisos'], ['rotina', ClipboardCheck, 'Rotina'], ['modulos', Grid2X2, 'Apps'], ...(person.role === 'admin' ? [['admin', Settings2, 'Admin']] : [])] as [Page, LucideIcon, string][]).map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    {opened && <Modal title="Comunicado" close={() => setOpened(null)}><div className="notice-top"><span className="badge yellow">{opened.category}</span><span className="small muted">Versão {opened.version}</span></div><h2 className="notice-title">{opened.title}</h2><p className="notice-body">{opened.body}</p><div className="info-strip">Sua confirmação de ciência se refere a esta versão do comunicado.</div><button className={`primary wide ${hasAcknowledged(state.receipts, person, opened) ? 'confirmed' : ''}`} disabled={hasAcknowledged(state.receipts, person, opened)} onClick={() => confirmNotice(opened)}><CheckCheck size={18} />{hasAcknowledged(state.receipts, person, opened) ? 'Ciência confirmada' : 'Li e estou ciente'}</button></Modal>}
    {compose && canPublish(person) && <Modal title="Novo comunicado" close={() => setCompose(false)}><form onSubmit={publish} className="form"><label>Título<input name="title" required maxLength={120} placeholder="Qual é a orientação para o time?" /></label><label>Mensagem<textarea name="body" required maxLength={5000} rows={6} placeholder="Escreva as orientações de forma clara e objetiva." /></label><label>Público<select name="target"><option value="all">Todas as lojas da minha abrangência</option>{person.stores.map(s => <option value={s} key={s}>Loja {s}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" name="urgent" />Destacar este comunicado</label><p className="small muted">Esta ação cria uma mensagem fictícia neste navegador. Não envia notificações reais.</p><button className="primary" type="submit"><Plus size={18} />Criar na prévia</button></form></Modal>}
    {selectedModule && <Modal title={selectedModule.title} close={() => setModuleId(null)}><span className="module-icon large"><selectedModule.icon size={30} /></span><h2>Um próximo passo para a sua operação</h2><p className="modal-description">{selectedModule.id === 'diario' ? 'O gerente poderá gravar um áudio, receber a transcrição e revisar o resumo do dia antes de enviá-lo. O serviço de IA ainda será conectado.' : selectedModule.id === 'evidencias' ? 'Solicitações de fotos e vídeos terão responsável, prazo e acompanhamento por loja. O armazenamento privado será conectado na implementação deste módulo.' : selectedModule.id === 'cartazes' ? 'Campanhas e materiais de cartazeamento serão integrados aqui, com visualização no celular e preparação para impressão pelo portal web.' : 'A escala da equipe terá uma experiência de consulta no celular e ferramentas de planejamento pelo portal web.'}</p><div className="info-strip">{selectedModule.status}. Esta tela apresenta o módulo planejado; o sistema ainda não está integrado.</div><button className="primary wide" onClick={() => setModuleId(null)}>Entendi <Check size={18} /></button></Modal>}
    {help && <Modal title="Sobre esta prévia" close={() => setHelp(false)}><p className="modal-description">Este é o primeiro espaço navegável do App EO. Você pode trocar de perfil, confirmar comunicados, marcar tarefas e, como administrador, experimentar o logo e o catálogo de módulos.</p><div className="info-strip">Os dados são fictícios e ficam neste navegador. Não há autenticação, servidor de dados ou envio real. Use apenas conteúdo de demonstração.</div><p>Login, integrações, auditoria protegida e aplicativos nativos fazem parte das próximas etapas documentadas.</p></Modal>}
    {toast && <div className="toast" role="status"><Check size={18} />{toast}<button aria-label="Dispensar mensagem" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}
