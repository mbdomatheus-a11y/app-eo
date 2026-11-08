import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '../../services/supabase';
import './contact-refresh.css';

type Request = { required: boolean; phone: string | null; requested_at: string | null };
type GateProps = { onComplete?: () => void; onSignOut?: () => void };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export function ContactRefreshAdmin() {
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function send() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await rpc<{ requested: number; total: number }>('eo_admin_request_contact_update', { p_only_missing: onlyMissing });
      setMessage(`${result.requested} nova(s) solicitação(ões), entre ${result.total} usuário(s) ativo(s) do público selecionado. Solicitações pendentes não são duplicadas.`);
      setConfirm(false);
      window.dispatchEvent(new Event('eo-contact-refresh'));
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <section className="contact-refresh"><h3>Atualização de telefones</h3><p>Solicite o contato declarado pelos usuários. A solicitação aparece no aplicativo, sem enviar SMS ou verificar a titularidade do número.</p>
    <fieldset disabled={busy}><legend>Público em todas as lojas</legend>
      <label><input type="radio" name="contact-audience" checked={onlyMissing} onChange={() => { setOnlyMissing(true); setConfirm(false); }} />Somente usuários ativos sem telefone cadastrado no aplicativo</label>
      <label><input type="radio" name="contact-audience" checked={!onlyMissing} onChange={() => { setOnlyMissing(false); setConfirm(false); }} />Todos os usuários ativos</label>
    </fieldset>
    {confirm ? <div className="contact-confirm"><p>Confirmar solicitação para {onlyMissing ? 'usuários ativos sem telefone' : 'todos os usuários ativos'}? Cada destinatário deverá salvar seu telefone para continuar usando o aplicativo.</p><button disabled={busy} onClick={() => void send()}>{busy ? 'Solicitando…' : 'Confirmar solicitação'}</button><button disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button></div> : <button onClick={() => setConfirm(true)}>Solicitar atualização</button>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}

export function ContactUpdateGate({ onComplete, onSignOut }: GateProps) {
  const [request, setRequest] = useState<Request | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const requiredRef = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    try {
      const result = await rpc<Request>('eo_my_contact_request');
      if (!mounted.current) return;
      setRequest(result); setError('');
      if (!requiredRef.current) setPhone(result.phone ?? '');
      requiredRef.current = result.required;
    } catch (error) { if (mounted.current) setError(errorMessage(error)); }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void load();
    const focus = () => { void load(); };
    window.addEventListener('focus', focus);
    window.addEventListener('eo-contact-refresh', focus);
    const visibility = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 300000);
    return () => { mounted.current = false; window.removeEventListener('focus', focus); window.removeEventListener('eo-contact-refresh', focus); document.removeEventListener('visibilitychange', visibility); window.clearInterval(timer); };
  }, [load]);
  const visible = request === null || request.required;
  useEffect(() => { if (visible && !dialog.current?.open) dialog.current?.showModal(); else if (!visible) dialog.current?.close(); }, [visible]);
  async function save() {
    setBusy(true); setError('');
    try {
      await rpc('eo_save_my_phone', { p_phone: phone });
      setRequest({ required: false, phone, requested_at: null }); requiredRef.current = false; onComplete?.();
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <dialog className="contact-gate" ref={dialog} aria-labelledby="contact-update-title" onCancel={(event) => event.preventDefault()}>
    <h2 id="contact-update-title">Atualize seu telefone</h2>
    {loading ? <p role="status">Consultando seu cadastro…</p> : request ? <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <p>A administração solicitou a atualização do seu contato. Salve seu telefone para continuar. Este é um contato declarado por você, sem verificação por SMS.</p>
      <label htmlFor="contact-phone">Telefone com DDD</label><input id="contact-phone" autoFocus type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={40} required disabled={busy} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 99999-9999" />
      <button disabled={busy}>{busy ? 'Salvando…' : 'Salvar e continuar'}</button>
    </form> : <button disabled={loading} onClick={() => void load()}>Tentar novamente</button>}
    {error && <p role="alert">{error}</p>}{onSignOut && <button className="contact-signout" onClick={onSignOut}>Sair da conta</button>}
  </dialog>;
}
