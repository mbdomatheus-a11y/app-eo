import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { rawRpc } from "../services/supabase";
import { Button, C, s } from "../ui";

type Contexto = { loja: { id: string; codigo: string; nome: string }; pode_editar: boolean; colaboradores: { chapa: string; nome: string; cargo: string | null; departamento: string | null; jornada_diaria_min: number | null; situacao: string | null }[] };
type Estado = { settings?: { semanaInicio?: unknown; modeloEscala?: unknown; statusEscala?: unknown } };
type Pendente = { estado: Estado; sequencia: number };
type Props = { html: string; contexto: Contexto; estado: unknown; semana: string | null; versao: number | null; rotulo: string; onClose: () => void };
const jsonScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
function segunda(iso: unknown): string | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const data = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== iso) return null;
  data.setUTCDate(data.getUTCDate() - ((data.getUTCDay() + 6) % 7));
  return data.toISOString().slice(0, 10);
}
function ponte(props: Props, key: string) {
  const loja = `${props.contexto.loja.codigo.padStart(4, "0")} - ${props.contexto.loja.nome}`;
  const rows = props.contexto.colaboradores.map((c) => [Number(c.chapa), c.nome, c.cargo ?? "", c.departamento ?? "", c.jornada_diaria_min ?? 440, c.situacao ?? ""]);
  const payload = jsonScript({ html: props.html, loja, storeData: { [loja]: rows }, state: props.estado, key });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>Carregando escala...<script>(function(){
    var d=${payload}, memoria={}, pendente=null, timer=null;
    function enviar(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
    function flush(){clearTimeout(timer);if(pendente){enviar({type:'save',key:pendente.k,value:pendente.v});pendente=null;}}
    window.__eoFlush=function(){if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();document.documentElement.inert=true;setTimeout(function(){flush();enviar({type:'flushed'});},150);};
    window.__eoUnlock=function(){document.documentElement.inert=false;};
    var store={getItem:function(k){return Object.prototype.hasOwnProperty.call(memoria,k)?memoria[k]:null;},setItem:function(k,v){memoria[k]=String(v);pendente={k:k,v:String(v)};clearTimeout(timer);timer=setTimeout(flush,1200);},removeItem:function(k){delete memoria[k];},clear:function(){memoria={};},key:function(i){return Object.keys(memoria)[i]||null;},get length(){return Object.keys(memoria).length;}};
    try {Object.defineProperty(window,'localStorage',{value:store,configurable:true});Object.defineProperty(window,'sessionStorage',{value:store,configurable:true});if(window.localStorage!==store||window.sessionStorage!==store)throw Error('storage');}catch(e){enviar({type:'bridge-error'});return;}
    try{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});}catch(e){}
    window.__EO={storeData:d.storeData,loja:d.loja};if(d.state&&d.key)memoria[d.key]=JSON.stringify(d.state);
    var csp=${jsonScript(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`)};
    var html=d.html.replace(/<head(?:\\s[^>]*)?>/i,function(m){return m+csp;});if(html===d.html){enviar({type:'bridge-error'});return;}
    document.open();document.write(html);document.close();
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush();});
  })();</script></body></html>`;
}
export function ScaleEditor(props: Props) {
  const navigation = useNavigation();
  const web = useRef<WebView>(null);
  const versions = useRef(new Map<string, number | null>(props.semana ? [[props.semana, props.versao]] : []));
  const queue = useRef<Promise<void> | null>(null);
  const pending = useRef(new Map<string, Pendente>());
  const sequence = useRef(0);
  const failed = useRef(false);
  const closing = useRef(false);
  const invalid = useRef(false);
  const flushResolve = useRef<(() => void) | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [status, setStatus] = useState(props.contexto.pode_editar ? "Aguardando alterações." : "Seu acesso permite apenas consulta; alterações não serão gravadas.");
  const key = /var STORAGE_KEY\s*=\s*"([^"]{1,80})"/.exec(props.html)?.[1] ?? "escalaColaboradores.v1";
  const [source] = useState(() => ponte(props, key));
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    navigation.setOptions({ headerBackVisible: false, gestureEnabled: false });
    const unsub = navigation.addListener("beforeRemove", (event) => { event.preventDefault(); closeRef.current(); });
    const back = BackHandler.addEventListener("hardwareBackPress", () => { closeRef.current(); return true; });
    return () => { unsub(); back.remove(); navigation.setOptions({ headerBackVisible: true, gestureEnabled: true }); };
  }, [navigation]);
  function drain() {
    if (queue.current || failed.current || !pending.current.size) return;
    const work = async () => {
      while (!failed.current && pending.current.size) {
        const [semana, item] = pending.current.entries().next().value as [string, Pendente];
        setStatus("Salvando no EO…");
        try {
          if (!versions.current.has(semana)) {
            const existing = await rawRpc<{ versao: number } | null>("escala_obter_semana", { p_loja: props.contexto.loja.id, p_semana: semana });
            if (existing) throw new Error(`Já existe escala para ${semana}. Abra essa semana pela lista.`);
            versions.current.set(semana, null);
          }
          const result = await rawRpc<{ versao: number }>("escala_salvar_semana", { p_loja: props.contexto.loja.id, p_semana: semana, p_modelo: item.estado.settings?.modeloEscala === "5X2" ? "5X2" : "6X1", p_status: item.estado.settings?.statusEscala === "finalizada" ? "finalizada" : "rascunho", p_dados: item.estado, p_versao: versions.current.get(semana) ?? null });
          versions.current.set(semana, result.versao);
          if (pending.current.get(semana)?.sequencia === item.sequencia) pending.current.delete(semana);
          if (!pending.current.size) setStatus(`Salvo no EO · versão ${result.versao}.`);
        } catch (e) {
          failed.current = true;
          setRetryAvailable(true);
          setStatus(e instanceof Error ? `Não foi possível salvar: ${e.message}` : "Não foi possível salvar.");
        }
      }
    };
    const promise = work();
    queue.current = promise;
    void promise.finally(() => {
      if (queue.current !== promise) return;
      queue.current = null;
      if (pending.current.size && !failed.current) drain();
    });
  }
  function retry() {
    if (closing.current || !pending.current.size) return;
    failed.current = false;
    setRetryAvailable(false);
    drain();
  }
  function onMessage(event: WebViewMessageEvent) {
    let message: { type?: unknown; key?: unknown; value?: unknown };
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.type === "flushed") { flushResolve.current?.(); return; }
    if (message.type === "bridge-error") { failed.current = true; setStatus("Não foi possível isolar o editor neste aparelho. Volte sem alterar a escala."); return; }
    if (message.type !== "save" || message.key !== key) return;
    if (typeof message.value !== "string" || message.value.length > 10_000_000) { invalid.current = true; setStatus("Os dados excedem o limite ou são inválidos. Alterações não salvas."); return; }
    let estado: Estado;
    try { estado = JSON.parse(message.value); } catch { invalid.current = true; setStatus("Dados inválidos. Alterações não salvas."); return; }
    if (!estado || typeof estado !== "object" || Array.isArray(estado)) { invalid.current = true; setStatus("Dados inválidos. Alterações não salvas."); return; }
    const semana = segunda(estado.settings?.semanaInicio);
    if (!semana) { invalid.current = true; setStatus("Escolha uma semana válida para salvar o planejamento."); return; }
    invalid.current = false;
    if (!props.contexto.pode_editar) { setStatus("Seu acesso permite apenas consulta; alterações não serão gravadas."); return; }
    pending.current.set(semana, { estado, sequencia: ++sequence.current });
    if (!failed.current) drain();
  }
  async function close() {
    if (closing.current) return;
    closing.current = true;
    setIsClosing(true);
    const flushed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => { if (!settled) { settled = true; flushResolve.current = null; resolve(ok); } };
      flushResolve.current = () => finish(true);
      web.current?.injectJavaScript("window.__eoFlush && window.__eoFlush(); true;");
      setTimeout(() => finish(false), 5000);
    });
    // Cada confirmação de envio chega depois das mensagens de gravação emitidas na ponte.
    while (queue.current) await queue.current;
    closing.current = false;
    if (!flushed || failed.current || invalid.current || pending.current.size) {
      web.current?.injectJavaScript("window.__eoUnlock && window.__eoUnlock(); true;");
      setIsClosing(false);
      setStatus("Não foi possível confirmar o salvamento. As alterações podem ser perdidas.");
      Alert.alert("Alterações não confirmadas", "Você pode continuar nesta tela ou sair e perder as alterações não salvas.", [
        { text: "Continuar na escala", style: "cancel" },
        { text: "Sair sem salvar", style: "destructive", onPress: props.onClose },
      ]);
      return;
    }
    props.onClose();
  }
  closeRef.current = () => { void close(); };
  return <View style={{ flex: 1, backgroundColor: C.canvas }}><View style={{ padding: 12, gap: 8 }}><Button title={isClosing ? "Confirmando salvamento…" : "Salvar e voltar à lista"} secondary disabled={isClosing} onPress={() => void close()} />{retryAvailable && <Button title="Tentar salvar novamente" disabled={isClosing} onPress={retry} />}<Text style={{ color: C.ink, fontWeight: "700" }}>{props.rotulo}</Text><Text accessibilityLiveRegion="polite" style={s.small}>{status}</Text></View><View style={{ flex: 1 }} pointerEvents={isClosing ? "none" : "auto"}><WebView ref={web} source={{ html: source }} originWhitelist={["*"]} onShouldStartLoadWithRequest={(request) => request.url === "about:blank"} onOpenWindow={() => {}} onMessage={onMessage} javaScriptEnabled javaScriptCanOpenWindowsAutomatically={false} domStorageEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} setSupportMultipleWindows={false} mixedContentMode="never" allowsLinkPreview={false} dataDetectorTypes="none" incognito onError={() => { failed.current = true; setStatus("Não foi possível abrir o editor neste aparelho."); }} style={{ flex: 1, backgroundColor: "white" }} /></View></View>;
}
