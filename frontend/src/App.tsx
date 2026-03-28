import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { SandpackProvider, SandpackPreview, SandpackLayout } from "@codesandbox/sandpack-react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const BACKEND_URL = "https://1kxbe.up.railway.app";
const GITHUB_TOKEN = "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";
const GITHUB_USER = "tatonka21";

// ── GitHub API helpers ──────────────────────────────────────────────
async function ghGet(path: string) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }
  });
  return r.json();
}

async function ghPut(path: string, body: object) {
  const r = await fetch(`https://api.github.com${path}`, {
    method: "PUT",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function ghDelete(path: string, body: object) {
  const r = await fetch(`https://api.github.com${path}`, {
    method: "DELETE",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.ok;
}

async function listFiles(repo: string, folder = "") {
  const path = folder ? `/repos/${GITHUB_USER}/${repo}/contents/${folder}` : `/repos/${GITHUB_USER}/${repo}/contents`;
  const data = await ghGet(path);
  return Array.isArray(data) ? data : [];
}

async function readFile(repo: string, filePath: string): Promise<string> {
  const data = await ghGet(`/repos/${GITHUB_USER}/${repo}/contents/${filePath}`);
  if (data.content) return atob(data.content.replace(/\n/g, ""));
  return "";
}

async function writeFile(repo: string, filePath: string, content: string, sha?: string) {
  return ghPut(`/repos/${GITHUB_USER}/${repo}/contents/${filePath}`, {
    message: `Update ${filePath}`,
    content: btoa(unescape(encodeURIComponent(content))),
    ...(sha ? { sha } : {})
  });
}

async function deleteFile(repo: string, filePath: string, sha: string) {
  return ghDelete(`/repos/${GITHUB_USER}/${repo}/contents/${filePath}`, {
    message: `Delete ${filePath}`,
    sha
  });
}

async function listRepos() {
  const data = await ghGet(`/users/${GITHUB_USER}/repos?per_page=100&sort=updated`);
  return Array.isArray(data) ? data : [];
}

// ── Types ───────────────────────────────────────────────────────────
type Page = "chat" | "notes" | "knowledge" | "projects";
type ChatTab = "chat" | "editor" | "preview";

interface Message { role: "user" | "agent"; text: string; }
interface CodeFile { name: string; content: string; language: string; }
interface GHFile { name: string; path: string; sha: string; type: string; size: number; }

// ── Code helpers ────────────────────────────────────────────────────
function extractCodeBlocks(text: string): CodeFile[] {
  const files: CodeFile[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match; let i = 0;
  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || "javascript";
    const ext: Record<string,string> = { typescript:"tsx", tsx:"tsx", javascript:"jsx", jsx:"jsx", css:"css", html:"html", json:"json" };
    files.push({ name: `file${i++}.${ext[lang]||"js"}`, content: match[2], language: lang });
  }
  return files;
}

function getSandpackFiles(files: CodeFile[]) {
  const result: Record<string,{code:string}> = {};
  if (!files.length) { result["/App.js"] = { code: `export default function App(){return <h1>No code yet</h1>}` }; return result; }
  files.forEach((f,i) => { result[i===0?"/App.js":`/${f.name}`] = { code: f.content }; });
  return result;
}

function parseMessageParts(text: string) {
  const parts: {type:"text"|"code"; content:string; language?:string}[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let last = 0; let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type:"text", content: text.slice(last, match.index) });
    parts.push({ type:"code", content: match[2], language: match[1]||"javascript" });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type:"text", content: text.slice(last) });
  return parts;
}

async function downloadZip(files: CodeFile[]) {
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f.content));
  saveAs(await zip.generateAsync({type:"blob"}), "agent-project.zip");
}

// ── Shared styles ───────────────────────────────────────────────────
const S = {
  page: { flex:1, display:"flex", flexDirection:"column" as const, overflow:"hidden", background:"#0a0a0f" },
  panel: { flex:1, overflowY:"auto" as const, padding:"16px", display:"flex", flexDirection:"column" as const, gap:"12px" },
  card: { background:"#1e1e2e", border:"1px solid #2a2a3e", borderRadius:"10px", padding:"14px" },
  input: { background:"#0a0a0f", color:"#f0f0f0", border:"1px solid #2a2a3e", borderRadius:"8px", padding:"10px", fontFamily:"monospace", fontSize:"0.88rem", width:"100%", boxSizing:"border-box" as const },
  btn: (color="#1a6bff") => ({ background:color, color:"#fff", border:"none", borderRadius:"6px", padding:"8px 16px", cursor:"pointer", fontFamily:"monospace", fontSize:"0.82rem" }),
  btnSm: (color="#333") => ({ background:color, color:"#ccc", border:"1px solid #3a3a4e", borderRadius:"5px", padding:"4px 10px", cursor:"pointer", fontSize:"0.75rem" }),
  label: { color:"#888", fontSize:"0.78rem", marginBottom:"4px" },
};

// ── Copy Button ─────────────────────────────────────────────────────
function CopyBtn({text}:{text:string}) {
  const [c,setC] = useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text);setC(true);setTimeout(()=>setC(false),2000)}}
    style={{position:"absolute",top:"8px",right:"8px",background:c?"#00ff88":"#333",color:c?"#000":"#fff",border:"none",borderRadius:"4px",padding:"3px 10px",cursor:"pointer",fontSize:"0.75rem"}}>{c?"✓":"Copy"}</button>;
}

// ── Message Bubble ──────────────────────────────────────────────────
function MsgBubble({msg,onEditor,onPreview}:{msg:Message;onEditor:(f:CodeFile[])=>void;onPreview:(f:CodeFile[])=>void}) {
  const parts = parseMessageParts(msg.text);
  const codeFiles = extractCodeBlocks(msg.text);
  return (
    <div style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:"8px",alignItems:"flex-start"}}>
      {msg.role==="agent"&&<div style={{width:"30px",height:"30px",borderRadius:"50%",background:"#1a6bff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"2px"}}>🤖</div>}
      <div style={{maxWidth:"82%",display:"flex",flexDirection:"column",gap:"6px"}}>
        {parts.map((p,i)=>p.type==="text"?p.content.trim()&&(
          <div key={i} style={{padding:"10px 14px",borderRadius:"10px",lineHeight:"1.65",whiteSpace:"pre-wrap",fontSize:"0.86rem",
            background:msg.role==="user"?"#1a6bff":"#1e1e2e",color:msg.role==="user"?"#fff":"#e0e0e0",
            border:msg.role==="agent"?"1px solid #2a2a3e":"none"}}>{p.content.trim()}</div>
        ):(
          <div key={i} style={{position:"relative",borderRadius:"8px",overflow:"hidden",border:"1px solid #2a2a3e"}}>
            <div style={{background:"#0d1117",padding:"5px 12px",fontSize:"0.72rem",color:"#888",borderBottom:"1px solid #2a2a3e"}}>{p.language}</div>
            <CopyBtn text={p.content}/>
            <SyntaxHighlighter language={p.language} style={atomOneDark} customStyle={{margin:0,padding:"14px",fontSize:"0.8rem",maxHeight:"280px",overflowY:"auto"}}>{p.content}</SyntaxHighlighter>
          </div>
        ))}
        {msg.role==="agent"&&codeFiles.length>0&&(
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginTop:"2px"}}>
            <button onClick={()=>onEditor(codeFiles)} style={{...S.btnSm("#00d4ff22"),color:"#00d4ff",border:"1px solid #00d4ff44"}}>📝 Editor</button>
            <button onClick={()=>onPreview(codeFiles)} style={{...S.btnSm("#00ff8822"),color:"#00ff88",border:"1px solid #00ff8844"}}>▶️ Preview</button>
            <button onClick={()=>downloadZip(codeFiles)} style={{...S.btnSm("#ff880022"),color:"#ff8800",border:"1px solid #ff880044"}}>📦 ZIP</button>
          </div>
        )}
      </div>
      {msg.role==="user"&&<div style={{width:"30px",height:"30px",borderRadius:"50%",background:"#333",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"2px"}}>👤</div>}
    </div>
  );
}

// ── Chat Input ──────────────────────────────────────────────────────
function ChatInput({onSend,loading,placeholder="Ask me to build something..."}:{onSend:(m:string)=>void;loading:boolean;placeholder?:string}) {
  const [v,setV] = useState("");
  function send(){if(!v.trim()||loading)return;onSend(v.trim());setV("");}
  return (
    <div style={{padding:"12px",borderTop:"1px solid #1a1a2e",display:"flex",gap:"8px",background:"#0d0d1a"}}>
      <textarea value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
        placeholder={placeholder} rows={2}
        style={{...S.input,resize:"none",outline:"none"}}/>
      <button onClick={send} disabled={loading} style={{...S.btn(loading?"#1a1a2e":"#1a6bff"),padding:"0 18px",opacity:loading?.6:1}}>Send</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE: CHAT
// ══════════════════════════════════════════════════════════════════
function ChatPage() {
  const [messages,setMessages] = useState<Message[]>([{role:"agent",text:"Hey! I am your AI coding agent. What are we building today?"}]);
  const [loading,setLoading] = useState(false);
  const [tab,setTab] = useState<ChatTab>("chat");
  const [selectedCode,setSelectedCode] = useState<CodeFile|null>(null);
  const [allFiles,setAllFiles] = useState<CodeFile[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages]);

  async function send(msg:string) {
    setMessages(p=>[...p,{role:"user",text:msg}]);
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg})});
      const d = await r.json();
      const reply = d.reply||d.error;
      setMessages(p=>[...p,{role:"agent",text:reply}]);
      const extracted = extractCodeBlocks(reply);
      if(extracted.length){setAllFiles(extracted);setSelectedCode(extracted[0]);}
    } catch { setMessages(p=>[...p,{role:"agent",text:"Error reaching backend."}]); }
    setLoading(false);
  }

  async function clear() {
    await fetch(`${BACKEND_URL}/clear`,{method:"POST"});
    setMessages([{role:"agent",text:"Cleared! What are we building?"}]);
    setAllFiles([]);setSelectedCode(null);
  }

  const tabBtn = (t:ChatTab,label:string) => (
    <button onClick={()=>setTab(t)} style={{...S.btnSm(tab===t?"#1a6bff":"transparent"),color:tab===t?"#fff":"#888",border:"none",padding:"7px 16px"}}>{label}</button>
  );

  return (
    <div style={S.page}>
      <div style={{display:"flex",gap:"4px",padding:"8px 12px",background:"#0d0d1a",borderBottom:"1px solid #1a1a2e",alignItems:"center"}}>
        {tabBtn("chat","💬 Chat")}
        {tabBtn("editor",`📝 Editor${allFiles.length?` (${allFiles.length})`:""}`)}
        {tabBtn("preview","▶️ Preview")}
        {allFiles.length>0&&<button onClick={()=>downloadZip(allFiles)} style={{...S.btnSm("#ff880022"),color:"#ff8800",border:"1px solid #ff880044",marginLeft:"auto"}}>📦 ZIP</button>}
        <button onClick={clear} style={{...S.btnSm(),marginLeft:allFiles.length?"4px":"auto"}}>🗑 Clear</button>
      </div>

      {tab==="chat"&&(
        <>
          <div style={S.panel}>
            {messages.map((m,i)=><MsgBubble key={i} msg={m} onEditor={f=>{setAllFiles(f);setSelectedCode(f[0]);setTab("editor")}} onPreview={f=>{setAllFiles(f);setTab("preview")}}/>)}
            {loading&&<div style={{display:"flex",gap:"8px",alignItems:"center"}}><div style={{width:"30px",height:"30px",borderRadius:"50%",background:"#1a6bff",display:"flex",alignItems:"center",justifyContent:"center"}}>🤖</div><div style={{...S.card,color:"#00d4ff",padding:"10px 14px"}}>✨ Thinking...</div></div>}
            <div ref={bottomRef}/>
          </div>
          <ChatInput onSend={send} loading={loading}/>
        </>
      )}

      {tab==="editor"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {allFiles.length>0&&<div style={{display:"flex",gap:"4px",padding:"8px 12px",background:"#0d0d1a",borderBottom:"1px solid #1a1a2e",overflowX:"auto"}}>
            {allFiles.map((f,i)=><button key={i} onClick={()=>setSelectedCode(f)} style={{...S.btnSm(selectedCode?.name===f.name?"#1a6bff":"#1a1a2e"),color:selectedCode?.name===f.name?"#fff":"#888",whiteSpace:"nowrap"}}>{f.name}</button>)}
          </div>}
          {selectedCode?<Editor height="100%" language={selectedCode.language} value={selectedCode.content} theme="vs-dark"
            onChange={v=>{if(v!==undefined&&selectedCode){setSelectedCode({...selectedCode,content:v});setAllFiles(p=>p.map(f=>f.name===selectedCode.name?{...f,content:v}:f));}}}
            options={{fontSize:14,minimap:{enabled:false},wordWrap:"on",scrollBeyondLastLine:false}}/>
          :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#444"}}>Ask the agent to write code, then click 📝 Editor</div>}
        </div>
      )}

      {tab==="preview"&&(
        <div style={{flex:1,overflow:"hidden"}}>
          {allFiles.length>0?<SandpackProvider template="react" files={getSandpackFiles(allFiles)} theme="dark"><SandpackLayout style={{height:"100%",border:"none"}}><SandpackPreview style={{height:"100%"}} showNavigator={false}/></SandpackLayout></SandpackProvider>
          :<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#444"}}>Ask the agent to write code, then click ▶️ Preview</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE: NOTES
// ══════════════════════════════════════════════════════════════════
function NotesPage() {
  const REPO = "agent-notes";
  const [files,setFiles] = useState<GHFile[]>([]);
  const [selected,setSelected] = useState<GHFile|null>(null);
  const [content,setContent] = useState("");
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [newName,setNewName] = useState("");
  const [aiLoading,setAiLoading] = useState(false);
  const [status,setStatus] = useState("");

  useEffect(()=>{loadFiles();},[]);

  async function loadFiles() {
    setLoading(true);
    const data = await listFiles(REPO);
    setFiles(data.filter((f:GHFile)=>f.name.endsWith(".md")));
    setLoading(false);
  }

  async function openFile(f:GHFile) {
    setSelected(f);
    setLoading(true);
    const text = await readFile(REPO, f.path);
    setContent(text);
    setLoading(false);
  }

  async function save() {
    if(!selected)return;
    setSaving(true);
    await writeFile(REPO, selected.path, content, selected.sha);
    setStatus("✅ Saved!");
    await loadFiles();
    setSaving(false);
    setTimeout(()=>setStatus(""),2000);
  }

  async function createNote() {
    if(!newName.trim())return;
    const name = newName.trim().endsWith(".md")?newName.trim():`${newName.trim()}.md`;
    await writeFile(REPO, name, `# ${newName.trim()}\n\n`);
    setNewName("");
    await loadFiles();
  }

  async function deleteNote() {
    if(!selected)return;
    if(!confirm(`Delete ${selected.name}?`))return;
    await deleteFile(REPO, selected.path, selected.sha);
    setSelected(null);setContent("");
    await loadFiles();
  }

  async function aiAssist(instruction:string) {
    if(!content&&!instruction)return;
    setAiLoading(true);
    const prompt = `You are helping with a note/document. Here is the current content:\n\n${content}\n\nInstruction: ${instruction}\n\nRespond with ONLY the updated full document content, no explanation, no markdown code blocks, just the raw text.`;
    const r = await fetch(`${BACKEND_URL}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:prompt})});
    const d = await r.json();
    setContent(d.reply||content);
    setAiLoading(false);
  }

  return (
    <div style={{...S.page,flexDirection:"row"}}>
      {/* Sidebar */}
      <div style={{width:"220px",borderRight:"1px solid #1a1a2e",display:"flex",flexDirection:"column",background:"#0d0d1a"}}>
        <div style={{padding:"12px",borderBottom:"1px solid #1a1a2e"}}>
          <div style={S.label}>📝 Notes</div>
          <div style={{display:"flex",gap:"6px",marginTop:"6px"}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createNote()}
              placeholder="New note..." style={{...S.input,padding:"6px 8px",fontSize:"0.78rem"}}/>
            <button onClick={createNote} style={S.btn()}>+</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {loading&&!files.length&&<div style={{color:"#555",fontSize:"0.8rem",padding:"8px"}}>Loading...</div>}
          {files.map(f=>(
            <div key={f.sha} onClick={()=>openFile(f)}
              style={{padding:"8px 10px",borderRadius:"6px",cursor:"pointer",fontSize:"0.82rem",marginBottom:"2px",
                background:selected?.sha===f.sha?"#1a2a4a":"transparent",color:selected?.sha===f.sha?"#00d4ff":"#ccc",
                border:selected?.sha===f.sha?"1px solid #1a6bff33":"1px solid transparent"}}>
              📄 {f.name.replace(".md","")}
            </div>
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selected?(
          <>
            <div style={{padding:"10px 16px",borderBottom:"1px solid #1a1a2e",display:"flex",gap:"8px",alignItems:"center",background:"#0d0d1a"}}>
              <span style={{color:"#00d4ff",fontSize:"0.9rem",fontWeight:"bold"}}>{selected.name}</span>
              <button onClick={save} disabled={saving} style={S.btn()}>{saving?"Saving...":"💾 Save"}</button>
              <button onClick={deleteNote} style={S.btn("#aa3333")}>🗑 Delete</button>
              {status&&<span style={{color:"#00ff88",fontSize:"0.8rem"}}>{status}</span>}
            </div>
            <textarea value={content} onChange={e=>setContent(e.target.value)}
              style={{flex:1,background:"#0a0a0f",color:"#e0e0e0",border:"none",padding:"20px",fontFamily:"monospace",fontSize:"0.9rem",resize:"none",outline:"none",lineHeight:"1.7"}}/>
            <div style={{padding:"10px 12px",borderTop:"1px solid #1a1a2e",background:"#0d0d1a"}}>
              <div style={{...S.label,marginBottom:"6px"}}>🤖 AI Assistant — tell it what to do with this note:</div>
              <ChatInput onSend={aiAssist} loading={aiLoading} placeholder="e.g. finish this note, fix grammar, expand the second paragraph..."/>
            </div>
          </>
        ):(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#444",gap:"12px"}}>
            <span style={{fontSize:"3rem"}}>📝</span>
            <span>Select a note or create a new one</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE: KNOWLEDGE BASE
// ══════════════════════════════════════════════════════════════════
function KnowledgePage() {
  const REPO = "agent-knowledge";
  interface KBEntry { id:string; title:string; category:string; content:string; tags:string[]; created:string; }
  const [entries,setEntries] = useState<KBEntry[]>([]);
  const [selected,setSelected] = useState<KBEntry|null>(null);
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [search,setSearch] = useState("");
  const [newTitle,setNewTitle] = useState("");
  const [newCat,setNewCat] = useState("General");
  const [aiLoading,setAiLoading] = useState(false);
  const [fileSha,setFileSha] = useState<string|undefined>();

  useEffect(()=>{loadKB();},[]);

  async function loadKB() {
    setLoading(true);
    try {
      const files = await listFiles(REPO);
      const kbFile = files.find((f:GHFile)=>f.name==="knowledge.json");
      if(kbFile){
        const text = await readFile(REPO,"knowledge.json");
        setEntries(JSON.parse(text));
        setFileSha(kbFile.sha);
      }
    } catch{}
    setLoading(false);
  }

  async function saveKB(updated:KBEntry[]) {
    setSaving(true);
    const result = await writeFile(REPO,"knowledge.json",JSON.stringify(updated,null,2),fileSha);
    if(result?.content?.sha) setFileSha(result.content.sha);
    setEntries(updated);
    setSaving(false);
  }

  async function createEntry() {
    if(!newTitle.trim())return;
    const entry:KBEntry = { id:Date.now().toString(), title:newTitle.trim(), category:newCat, content:"", tags:[], created:new Date().toISOString() };
    await saveKB([...entries,entry]);
    setSelected(entry);setNewTitle("");
  }

  async function updateSelected() {
    if(!selected)return;
    const updated = entries.map(e=>e.id===selected.id?selected:e);
    await saveKB(updated);
  }

  async function deleteEntry() {
    if(!selected)return;
    if(!confirm(`Delete "${selected.title}"?`))return;
    await saveKB(entries.filter(e=>e.id!==selected.id));
    setSelected(null);
  }

  async function aiEnrich(instruction:string) {
    if(!selected)return;
    setAiLoading(true);
    const prompt = `You are enriching a knowledge base entry.\nTitle: ${selected.title}\nCategory: ${selected.category}\nCurrent content: ${selected.content}\n\nInstruction: ${instruction}\n\nRespond with ONLY the updated content text, no explanation, no code blocks.`;
    const r = await fetch(`${BACKEND_URL}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:prompt})});
    const d = await r.json();
    setSelected({...selected,content:d.reply||selected.content});
    setAiLoading(false);
  }

  const filtered = entries.filter(e=>e.title.toLowerCase().includes(search.toLowerCase())||e.category.toLowerCase().includes(search.toLowerCase()));
  const cats = [...new Set(entries.map(e=>e.category))];

  return (
    <div style={{...S.page,flexDirection:"row"}}>
      <div style={{width:"240px",borderRight:"1px solid #1a1a2e",display:"flex",flexDirection:"column",background:"#0d0d1a"}}>
        <div style={{padding:"12px",borderBottom:"1px solid #1a1a2e"}}>
          <div style={S.label}>🧠 Knowledge Base</div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{...S.input,padding:"6px 8px",fontSize:"0.78rem",marginTop:"6px"}}/>
          <div style={{display:"flex",gap:"4px",marginTop:"8px"}}>
            <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createEntry()} placeholder="New entry..." style={{...S.input,padding:"6px 8px",fontSize:"0.78rem"}}/>
            <button onClick={createEntry} style={S.btn()}>+</button>
          </div>
          <select value={newCat} onChange={e=>setNewCat(e.target.value)} style={{...S.input,padding:"5px 8px",fontSize:"0.78rem",marginTop:"6px"}}>
            {["General","Technology","Code","Research","Ideas","Reference"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {loading&&<div style={{color:"#555",fontSize:"0.8rem",padding:"8px"}}>Loading...</div>}
          {cats.map(cat=>(
            <div key={cat}>
              <div style={{color:"#555",fontSize:"0.72rem",padding:"6px 8px 2px",textTransform:"uppercase",letterSpacing:"1px"}}>{cat}</div>
              {filtered.filter(e=>e.category===cat).map(e=>(
                <div key={e.id} onClick={()=>setSelected(e)}
                  style={{padding:"7px 10px",borderRadius:"6px",cursor:"pointer",fontSize:"0.82rem",marginBottom:"2px",
                    background:selected?.id===e.id?"#1a2a4a":"transparent",color:selected?.id===e.id?"#00d4ff":"#ccc",
                    border:selected?.id===e.id?"1px solid #1a6bff33":"1px solid transparent"}}>
                  🔷 {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selected?(
          <>
            <div style={{padding:"10px 16px",borderBottom:"1px solid #1a1a2e",display:"flex",gap:"8px",alignItems:"center",background:"#0d0d1a",flexWrap:"wrap"}}>
              <input value={selected.title} onChange={e=>setSelected({...selected,title:e.target.value})} style={{...S.input,width:"200px",padding:"5px 8px"}}/>
              <select value={selected.category} onChange={e=>setSelected({...selected,category:e.target.value})} style={{...S.input,width:"130px",padding:"5px 8px"}}>
                {["General","Technology","Code","Research","Ideas","Reference"].map(c=><option key={c}>{c}</option>)}
              </select>
              <input value={selected.tags.join(",")} onChange={e=>setSelected({...selected,tags:e.target.value.split(",").map(t=>t.trim())})} placeholder="tags,comma,separated" style={{...S.input,width:"160px",padding:"5px 8px"}}/>
              <button onClick={updateSelected} disabled={saving} style={S.btn()}>{saving?"Saving...":"💾 Save"}</button>
              <button onClick={deleteEntry} style={S.btn("#aa3333")}>🗑</button>
            </div>
            <textarea value={selected.content} onChange={e=>setSelected({...selected,content:e.target.value})}
              placeholder="Write your knowledge base entry here..."
              style={{flex:1,background:"#0a0a0f",color:"#e0e0e0",border:"none",padding:"20px",fontFamily:"monospace",fontSize:"0.9rem",resize:"none",outline:"none",lineHeight:"1.7"}}/>
            <div style={{padding:"10px 12px",borderTop:"1px solid #1a1a2e",background:"#0d0d1a"}}>
              <div style={{...S.label,marginBottom:"6px"}}>🤖 AI — enrich this entry:</div>
              <ChatInput onSend={aiEnrich} loading={aiLoading} placeholder="e.g. expand this, add examples, summarize..."/>
            </div>
          </>
        ):(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#444",gap:"12px"}}>
            <span style={{fontSize:"3rem"}}>🧠</span>
            <span>Select an entry or create a new one</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE: PROJECTS
// ══════════════════════════════════════════════════════════════════
function ProjectsPage() {
  interface Repo { id:number; name:string; description:string; html_url:string; homepage:string; updated_at:string; language:string; stargazers_count:number; }
  const [repos,setRepos] = useState<Repo[]>([]);
  const [loading,setLoading] = useState(false);
  const [selected,setSelected] = useState<Repo|null>(null);
  const [files,setFiles] = useState<GHFile[]>([]);
  const [fileContent,setFileContent] = useState("");
  const [selectedFile,setSelectedFile] = useState<GHFile|null>(null);
  const [aiLoading,setAiLoading] = useState(false);
  const [search,setSearch] = useState("");

  useEffect(()=>{loadRepos();},[]);

  async function loadRepos() {
    setLoading(true);
    const data = await listRepos();
    setRepos(data);
    setLoading(false);
  }

  async function openRepo(repo:Repo) {
    setSelected(repo);setFiles([]);setSelectedFile(null);setFileContent("");
    const data = await listFiles(repo.name);
    setFiles(data);
  }

  async function openFile(f:GHFile) {
    if(f.type!=="file")return;
    setSelectedFile(f);
    const text = await readFile(selected!.name,f.path);
    setFileContent(text);
  }

  async function aiAssist(instruction:string) {
    if(!selected)return;
    setAiLoading(true);
    const context = selectedFile?`\n\nCurrently viewing file: ${selectedFile.name}\n\`\`\`\n${fileContent}\n\`\`\``:"";
    const prompt = `You are helping with the GitHub project: ${selected.name}\nDescription: ${selected.description||"No description"}${context}\n\nInstruction: ${instruction}`;
    const r = await fetch(`${BACKEND_URL}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:prompt})});
    const d = await r.json();
    setAiLoading(false);
    return d.reply;
  }

  const [aiReply,setAiReply] = useState("");
  async function handleAiSend(msg:string){
    const reply = await aiAssist(msg);
    setAiReply(reply||"");
  }

  const filtered = repos.filter(r=>r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{...S.page,flexDirection:"row"}}>
      {/* Repo list */}
      <div style={{width:"240px",borderRight:"1px solid #1a1a2e",display:"flex",flexDirection:"column",background:"#0d0d1a"}}>
        <div style={{padding:"12px",borderBottom:"1px solid #1a1a2e"}}>
          <div style={S.label}>🗂 Projects / Repos</div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search repos..." style={{...S.input,padding:"6px 8px",fontSize:"0.78rem",marginTop:"6px"}}/>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {loading&&<div style={{color:"#555",fontSize:"0.8rem",padding:"8px"}}>Loading repos...</div>}
          {filtered.map(r=>(
            <div key={r.id} onClick={()=>openRepo(r)}
              style={{padding:"8px 10px",borderRadius:"6px",cursor:"pointer",marginBottom:"4px",
                background:selected?.id===r.id?"#1a2a4a":"transparent",
                border:selected?.id===r.id?"1px solid #1a6bff33":"1px solid transparent"}}>
              <div style={{color:selected?.id===r.id?"#00d4ff":"#ccc",fontSize:"0.82rem",fontWeight:"bold"}}>📦 {r.name}</div>
              {r.description&&<div style={{color:"#666",fontSize:"0.72rem",marginTop:"2px"}}>{r.description.slice(0,50)}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* File tree + content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selected?(
          <>
            <div style={{padding:"10px 16px",borderBottom:"1px solid #1a1a2e",display:"flex",gap:"10px",alignItems:"center",background:"#0d0d1a",flexWrap:"wrap"}}>
              <span style={{color:"#00d4ff",fontWeight:"bold"}}>📦 {selected.name}</span>
              {selected.description&&<span style={{color:"#666",fontSize:"0.8rem"}}>{selected.description}</span>}
              <a href={selected.html_url} target="_blank" rel="noreferrer" style={{color:"#888",fontSize:"0.78rem",marginLeft:"auto"}}>GitHub ↗</a>
              {selected.homepage&&<a href={selected.homepage} target="_blank" rel="noreferrer" style={{color:"#00ff88",fontSize:"0.78rem"}}>Live ↗</a>}
            </div>
            <div style={{flex:1,display:"flex",overflow:"hidden"}}>
              {/* File tree */}
              <div style={{width:"180px",borderRight:"1px solid #1a1a2e",overflowY:"auto",padding:"8px",background:"#0d0d1a"}}>
                {files.map(f=>(
                  <div key={f.sha} onClick={()=>openFile(f)}
                    style={{padding:"5px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"0.78rem",marginBottom:"2px",
                      background:selectedFile?.sha===f.sha?"#1a2a4a":"transparent",
                      color:selectedFile?.sha===f.sha?"#00d4ff":f.type==="dir"?"#888":"#bbb"}}>
                    {f.type==="dir"?"📁":"📄"} {f.name}
                  </div>
                ))}
              </div>
              {/* File content + AI */}
              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                {selectedFile?(
                  <Editor height="60%" language="javascript" value={fileContent} theme="vs-dark" options={{fontSize:13,minimap:{enabled:false},wordWrap:"on",readOnly:true}}/>
                ):(
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#444",fontSize:"0.85rem"}}>Select a file to view</div>
                )}
                <div style={{borderTop:"1px solid #1a1a2e",padding:"10px 12px",background:"#0d0d1a"}}>
                  <div style={{...S.label,marginBottom:"6px"}}>🤖 Ask AI about this project:</div>
                  {aiReply&&<div style={{...S.card,fontSize:"0.82rem",color:"#e0e0e0",marginBottom:"8px",maxHeight:"120px",overflowY:"auto",whiteSpace:"pre-wrap"}}>{aiReply}</div>}
                  <ChatInput onSend={handleAiSend} loading={aiLoading} placeholder="Ask about this repo, request changes, explain code..."/>
                </div>
              </div>
            </div>
          </>
        ):(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#444",gap:"12px"}}>
            <span style={{fontSize:"3rem"}}>🗂</span>
            <span>Select a project to explore</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════
export default function App() {
  const [page,setPage] = useState<Page>("chat");

  const navBtn = (p:Page,label:string) => (
    <button onClick={()=>setPage(p)} style={{
      padding:"10px 16px",background:page===p?"#1a6bff":"transparent",
      color:page===p?"#fff":"#666",border:"none",cursor:"pointer",
      fontFamily:"monospace",fontSize:"0.82rem",borderBottom:page===p?"2px solid #1a6bff":"2px solid transparent",
      transition:"all 0.15s"
    }}>{label}</button>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0a0a0f",color:"#f0f0f0",fontFamily:"monospace"}}>
      {/* Top nav */}
      <div style={{padding:"0 12px",background:"#0d0d1a",borderBottom:"1px solid #1a1a2e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px",padding:"10px 0"}}>
          <span style={{fontSize:"1.1rem"}}>🤖</span>
          <span style={{color:"#00d4ff",fontWeight:"bold",fontSize:"0.95rem"}}>Agent Workspace</span>
        </div>
        <div style={{display:"flex"}}>
          {navBtn("chat","💬 Build")}
          {navBtn("notes","📝 Notes")}
          {navBtn("knowledge","🧠 Knowledge")}
          {navBtn("projects","🗂 Projects")}
        </div>
      </div>

      {/* Page content */}
      {page==="chat"&&<ChatPage/>}
      {page==="notes"&&<NotesPage/>}
      {page==="knowledge"&&<KnowledgePage/>}
      {page==="projects"&&<ProjectsPage/>}
    </div>
  );
}
