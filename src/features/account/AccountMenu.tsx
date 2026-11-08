import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, LogOut, Palette, RotateCcw, Trash2, UserRound, X } from 'lucide-react';
import './account-menu.css';

type Preferences = { font: 'system' | 'sans'; text: 'standard' | 'large'; accent: 'yellow' | 'blue' | 'green'; photo: string | null };
type AccountMenuProps = { person: { id: string; name: string; role: string }; onSignOut: () => void; disabled?: boolean };
const defaults: Preferences = { font: 'system', text: 'standard', accent: 'yellow', photo: null };
const storageKey = (id: string) => `app-eo:account:${id}`;

function readPreferences(id: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(id)) ?? 'null');
    if (!value || typeof value !== 'object') return { ...defaults };
    return {
      font: value.font === 'sans' ? 'sans' : 'system',
      text: value.text === 'large' ? 'large' : 'standard',
      accent: value.accent === 'blue' || value.accent === 'green' ? value.accent : 'yellow',
      photo: typeof value.photo === 'string' && /^data:image\/(jpeg|webp);base64,/.test(value.photo) && value.photo.length < 1_000_000 ? value.photo : null,
    };
  } catch { return { ...defaults }; }
}

async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter até 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error('Não foi possível preparar a imagem.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    const webp = canvas.toDataURL('image/webp', 0.82);
    if (webp.startsWith('data:image/webp;')) return webp;
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 256, 256);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export function AccountMenu({ person, onSignOut, disabled = false }: AccountMenuProps) {
  const [saved, setSaved] = useState(() => ({ owner: person.id, preferences: readPreferences(person.id) }));
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'account' | 'appearance'>('account');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const owner = useRef(person.id);
  owner.current = person.id;
  const alive = useRef(true);
  const menuId = useId();
  const titleId = useId();
  const preferences = saved.owner === person.id ? saved.preferences : defaults;
  const latestPreferences = useRef(preferences);
  latestPreferences.current = preferences;
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR') || 'EO';

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setSaved({ owner: person.id, preferences: readPreferences(person.id) });
    setOpen(false);
    setMessage('');
    setUploading(false);
    dialog.current?.close();
  }, [person.id]);

  useEffect(() => {
    const dataset = document.documentElement.dataset;
    dataset.eoFont = preferences.font;
    dataset.eoText = preferences.text;
    dataset.eoAccent = preferences.accent;
    return () => { delete dataset.eoFont; delete dataset.eoText; delete dataset.eoAccent; };
  }, [person.id, preferences.font, preferences.text, preferences.accent]);

  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', keyboard);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', keyboard); };
  }, [open]);

  function update(next: Preferences) {
    try {
      localStorage.setItem(storageKey(person.id), JSON.stringify(next));
      setSaved({ owner: person.id, preferences: next });
      setMessage('Preferências salvas neste navegador.');
    } catch {
      setMessage('Não foi possível salvar. Libere espaço ou permita o armazenamento do navegador e tente novamente.');
    }
  }

  function showPanel(next: 'account' | 'appearance') {
    setSection(next);
    setOpen(false);
    setMessage('');
    dialog.current?.showModal();
  }

  async function changePhoto(file: File | undefined) {
    if (!file || uploading) return;
    const uploadOwner = person.id;
    setUploading(true);
    setMessage('Preparando foto…');
    try {
      const photo = await preparePhoto(file);
      if (alive.current && owner.current === uploadOwner) update({ ...latestPreferences.current, photo });
    } catch (error) {
      if (alive.current && owner.current === uploadOwner) setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a imagem.');
    } finally {
      if (alive.current && owner.current === uploadOwner) setUploading(false);
    }
  }

  const avatar = (large = false) => <span className={`eo-account-avatar${large ? ' eo-account-avatar-large' : ''}`} aria-hidden="true">
    {preferences.photo ? <img src={preferences.photo} alt="" /> : initials}
  </span>;

  return <div className="eo-account" ref={root}>
    <button ref={trigger} type="button" className="eo-account-trigger" aria-label={`Conta de ${person.name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} onClick={() => setOpen(!open)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
    }}>
      {avatar()}<span className="eo-account-trigger-name">{person.name}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={menuId} className="eo-account-menu" role="menu" aria-label="Sua conta" onKeyDown={event => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      let next: number | undefined;
      if (event.key === 'ArrowDown') next = (index + 1) % items.length;
      if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
      if (event.key === 'Tab') setOpen(false);
    }}>
      <div className="eo-account-menu-heading"><strong>{person.name}</strong><span>Sua conta no EO</span></div>
      <button type="button" role="menuitem" onClick={() => showPanel('account')}><UserRound size={19} aria-hidden="true" />Minha conta</button>
      <button type="button" role="menuitem" onClick={() => showPanel('appearance')}><Palette size={19} aria-hidden="true" />Aparência</button>
      <button type="button" role="menuitem" className="eo-account-signout" disabled={disabled} onClick={() => { setOpen(false); onSignOut(); }}><LogOut size={19} aria-hidden="true" />Sair</button>
    </div>}
    <dialog ref={dialog} className="eo-account-dialog" aria-labelledby={titleId} onClose={() => trigger.current?.focus()} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
      }
    }}>
      <div className="eo-account-dialog-header"><div><span className="eo-account-eyebrow">SEU ESPAÇO</span><h2 id={titleId}>{section === 'account' ? 'Minha conta' : 'Aparência'}</h2></div><button type="button" className="eo-account-close" aria-label="Fechar preferências" onClick={() => dialog.current?.close()}><X size={21} /></button></div>
      <div className="eo-account-tabs" aria-label="Seções da conta">
        <button type="button" aria-pressed={section === 'account'} onClick={() => { setSection('account'); setMessage(''); }}><UserRound size={17} aria-hidden="true" />Minha conta</button>
        <button type="button" aria-pressed={section === 'appearance'} onClick={() => { setSection('appearance'); setMessage(''); }}><Palette size={17} aria-hidden="true" />Aparência</button>
      </div>
      {section === 'account' ? <div className="eo-account-panel">
        <div className="eo-account-profile">{avatar(true)}<div><h3>{person.name}</h3><p>Conta pessoal</p></div></div>
        <p className="eo-account-hint">Use uma foto para reconhecer sua conta com facilidade.</p>
        <div className="eo-account-photo-actions">
          <input ref={upload} className="eo-account-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar foto de perfil" tabIndex={-1} onChange={event => { void changePhoto(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" className="eo-account-primary" disabled={uploading} onClick={() => upload.current?.click()}><Camera size={18} aria-hidden="true" />{uploading ? 'Preparando…' : 'Escolher foto'}</button>
          {preferences.photo && <button type="button" className="eo-account-secondary" disabled={uploading} onClick={() => update({ ...preferences, photo: null })}><Trash2 size={17} aria-hidden="true" />Remover foto</button>}
        </div><p className="eo-account-hint eo-account-file-hint">JPG, PNG ou WebP. Até 5 MB.</p>
      </div> : <div className="eo-account-panel">
        <fieldset className="eo-account-fieldset"><legend>Fonte</legend><div className="eo-account-options">
          {([{ value: 'system', label: 'Sistema', detail: 'Fonte do seu dispositivo' }, { value: 'sans', label: 'Arial', detail: 'Clássica e familiar' }] as const).map(option => <label className="eo-account-option" key={option.value}><input type="radio" name={`${menuId}-font`} checked={preferences.font === option.value} onChange={() => update({ ...preferences, font: option.value })} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}
        </div></fieldset>
        <fieldset className="eo-account-fieldset"><legend>Tamanho do texto</legend><div className="eo-account-options">
          {([{ value: 'standard', label: 'Padrão' }, { value: 'large', label: 'Ampliado' }] as const).map(option => <label className="eo-account-option" key={option.value}><input type="radio" name={`${menuId}-text`} checked={preferences.text === option.value} onChange={() => update({ ...preferences, text: option.value })} /><span><strong>{option.label}</strong></span></label>)}
        </div></fieldset>
        <fieldset className="eo-account-fieldset"><legend>Cor de destaque</legend><div className="eo-account-colors">
          {([{ value: 'yellow', label: 'Amarelo' }, { value: 'blue', label: 'Azul' }, { value: 'green', label: 'Verde' }] as const).map(option => <label className="eo-account-color-option" key={option.value}><input type="radio" name={`${menuId}-accent`} checked={preferences.accent === option.value} onChange={() => update({ ...preferences, accent: option.value })} /><span className={`eo-account-swatch eo-account-swatch-${option.value}`} aria-hidden="true">{preferences.accent === option.value && <Check size={18} />}</span><span>{option.label}</span></label>)}
        </div></fieldset>
        <button type="button" className="eo-account-secondary eo-account-reset" onClick={() => update({ ...defaults, photo: preferences.photo })}><RotateCcw size={17} aria-hidden="true" />Restaurar aparência padrão</button>
      </div>}
      <div className="eo-account-dialog-footer"><p>Foto e aparência salvas neste navegador</p><p className="eo-account-status" role="status" aria-live="polite">{message}</p></div>
    </dialog>
  </div>;
}
