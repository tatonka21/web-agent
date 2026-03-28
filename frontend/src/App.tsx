import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { SandpackProvider, SandpackPreview, SandpackLayout } from "@codesandbox/sandpack-react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const BACKEND_URL = "https://1kxbe.up.railway.app";

interface Message {
  role: "user" | "agent";
  text: string;
}

interface CodeFile {
  name: string;
  content: string;
  language: string;
}

function extractCodeBlocks(text: string): CodeFile[] {
  const files: CodeFile[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  let fileIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || "javascript";
    const content = match[2];
    const extensions: Record<string, string> = {
      typescript: "tsx", tsx: "tsx", javascript: "jsx",
      jsx: "jsx", css: "css", html: "html", json: "json"
    };
    const ext = extensions[lang] || "js";
    files.push({ name: `file${fileIndex++}.${ext}`, content, language: lang });
  }
  return files;
}

function getSandpackFiles(files: CodeFile[]) {
  const result: Record<string, { code: string }> = {};
  if (files.length === 0) {
    result["/App.js"] = { code: `export default function App() { return <h1>No code yet</h1>; }` };
  } else {
    files.forEach((f, i) => {
      const name = i === 0 ? "/App.js" : `/${f.name}`;
      result[name] = { code: f.content };
    });
  }
  return result;
}

function parseMessageParts(text: string) {
  const parts: { type: "text" | "code"; content: string; language?: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", content: match[2], language: match[1] || "javascript" });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }
  return parts;
}

async function downloadZip(files: CodeFile[]) {
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f.content));
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "agent-project.zip");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ position: "absolute", top: "8px", right: "8px", background: copied ? "#00ff88" : "#333", color: copied ? "#000" : "#fff", border: "none", borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "0.75rem" }}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function MessageBubble({ msg, onOpenEditor, onOpenPreview }: {
  msg: Message;
  onOpenEditor: (files: CodeFile[]) => void;
  onOpenPreview: (files: CodeFile[]) => void;
}) {
  const parts = parseMessageParts(msg.text);
  const codeFiles = extractCodeBlocks(msg.text);

  return (
    <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: "8px", alignItems: "flex-start" }}>
      {msg.role === "agent" && (
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#1a6bff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0, marginTop: "4px" }}>🤖</div>
      )}
      <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: "6px" }}>
        {parts.map((part, i) => (
          part.type === "text" ? (
            part.content.trim() && (
              <div key={i} style={{
                padding: "12px 16px", borderRadius: "12px", lineHeight: "1.7",
                whiteSpace: "pre-wrap", fontSize: "0.88rem",
                background: msg.role === "user" ? "#1a6bff" : "#1e1e2e",
                color: msg.role === "user" ? "#fff" : "#e0e0e0",
                border: msg.role === "agent" ? "1px solid #2a2a3e" : "none"
              }}>
                {part.content.trim()}
              </div>
            )
          ) : (
            <div key={i} style={{ position: "relative", borderRadius: "8px", overflow: "hidden", border: "1px solid #2a2a3e" }}>
              <div style={{ background: "#0d1117", padding: "6px 12px", fontSize: "0.75rem", color: "#888", borderBottom: "1px solid #2a2a3e", display: "flex", justifyContent: "space-between" }}>
                <span>{part.language}</span>
              </div>
              <CopyButton text={part.content} />
              <SyntaxHighlighter
                language={part.language}
                style={atomOneDark}
                customStyle={{ margin: 0, padding: "16px", fontSize: "0.82rem", maxHeight: "320px", overflowY: "auto" }}
              >
                {part.content}
              </SyntaxHighlighter>
            </div>
          )
        ))}
        {msg.role === "agent" && codeFiles.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
            <button onClick={() => onOpenEditor(codeFiles)}
              style={{ background: "#00d4ff22", color: "#00d4ff", border: "1px solid #00d4ff44", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem" }}>
              📝 Open in Editor
            </button>
            <button onClick={() => onOpenPreview(codeFiles)}
              style={{ background: "#00ff8822", color: "#00ff88", border: "1px solid #00ff8844", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem" }}>
              ▶️ Run Preview
            </button>
            <button onClick={() => downloadZip(codeFiles)}
              style={{ background: "#ff880022", color: "#ff8800", border: "1px solid #ff880044", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem" }}>
              📦 Download ZIP
            </button>
          </div>
        )}
      </div>
      {msg.role === "user" && (
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0, marginTop: "4px" }}>👤</div>
      )}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", text: "Hey! I am your AI coding agent. What are we building today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "editor" | "preview">("chat");
  const [selectedCode, setSelectedCode] = useState<CodeFile | null>(null);
  const [allFiles, setAllFiles] = useState<CodeFile[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      const reply = data.reply || data.error;
      setMessages(prev => [...prev, { role: "agent", text: reply }]);
      const extracted = extractCodeBlocks(reply);
      if (extracted.length > 0) {
        setAllFiles(extracted);
        setSelectedCode(extracted[0]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "agent", text: "Error reaching backend. Is it running?" }]);
    }
    setLoading(false);
  }

  async function clearChat() {
    await fetch(`${BACKEND_URL}/clear`, { method: "POST" });
    setMessages([{ role: "agent", text: "Chat cleared! What are we building?" }]);
    setAllFiles([]);
    setSelectedCode(null);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleOpenEditor(files: CodeFile[]) {
    setAllFiles(files);
    setSelectedCode(files[0]);
    setActiveTab("editor");
  }

  function handleOpenPreview(files: CodeFile[]) {
    setAllFiles(files);
    setActiveTab("preview");
  }

  const tabStyle = (tab: string) => ({
    padding: "8px 18px",
    background: activeTab === tab ? "#1a6bff" : "transparent",
    color: activeTab === tab ? "#fff" : "#888",
    border: "none",
    cursor: "pointer",
    borderRadius: "6px",
    fontFamily: "monospace",
    fontSize: "0.85rem"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0f", color: "#f0f0f0", fontFamily: "monospace" }}>
      <div style={{ padding: "12px 20px", background: "#0d0d1a", borderBottom: "1px solid #1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.3rem" }}>🤖</span>
          <span style={{ fontSize: "1rem", fontWeight: "bold", color: "#00d4ff" }}>Web Coding Agent</span>
          <span style={{ fontSize: "0.7rem", color: "#444", background: "#1a1a2e", padding: "2px 8px", borderRadius: "10px" }}>powered by Groq + Gemini</span>
        </div>
        <button onClick={clearChat} style={{ background: "#1a1a2e", color: "#888", border: "1px solid #2a2a3e", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" }}>
          🗑 Clear
        </button>
      </div>
      <div style={{ display: "flex", gap: "4px", padding: "8px 12px", background: "#0d0d1a", borderBottom: "1px solid #1a1a2e" }}>
        <button style={tabStyle("chat")} onClick={() => setActiveTab("chat")}>💬 Chat</button>
        <button style={tabStyle("editor")} onClick={() => setActiveTab("editor")}>📝 Editor {allFiles.length > 0 ? `(${allFiles.length})` : ""}</button>
        <button style={tabStyle("preview")} onClick={() => setActiveTab("preview")}>▶️ Preview</button>
        {allFiles.length > 0 && (
          <button onClick={() => downloadZip(allFiles)}
            style={{ marginLeft: "auto", background: "#ff880022", color: "#ff8800", border: "1px solid #ff880044", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" }}>
            📦 Download ZIP
          </button>
        )}
      </div>
      {activeTab === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} onOpenEditor={handleOpenEditor} onOpenPreview={handleOpenPreview} />
            ))}
            {loading && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#1a6bff", display: "flex", alignItems: "center", justifyContent: "center" }}>🤖</div>
                <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", padding: "12px 16px", borderRadius: "12px", color: "#00d4ff", fontSize: "0.88rem" }}>✨ Thinking...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: "16px", borderTop: "1px solid #1a1a2e", display: "flex", gap: "10px", background: "#0d0d1a" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me to build something... (Enter to send, Shift+Enter for new line)"
              rows={2}
              style={{ flex: 1, background: "#0a0a0f", color: "#f0f0f0", border: "1px solid #2a2a3e", borderRadius: "8px", padding: "10px 14px", fontFamily: "monospace", fontSize: "0.9rem", resize: "none", outline: "none" }}
            />
            <button onClick={sendMessage} disabled={loading}
              style={{ background: loading ? "#1a1a2e" : "#1a6bff", color: loading ? "#555" : "#fff", border: "none", padding: "0 20px", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "0.9rem" }}>
              Send
            </button>
          </div>
        </div>
      )}
      {activeTab === "editor" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {allFiles.length > 0 && (
            <div style={{ display: "flex", gap: "4px", padding: "8px 12px", background: "#0d0d1a", borderBottom: "1px solid #1a1a2e", overflowX: "auto" }}>
              {allFiles.map((f, i) => (
                <button key={i} onClick={() => setSelectedCode(f)}
                  style={{ padding: "4px 14px", background: selectedCode?.name === f.name ? "#1a6bff" : "#1a1a2e", color: selectedCode?.name === f.name ? "#fff" : "#888", border: "1px solid #2a2a3e", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
          {selectedCode ? (
            <Editor
              height="100%"
              language={selectedCode.language}
              value={selectedCode.content}
              theme="vs-dark"
              onChange={(val) => {
                if (val !== undefined && selectedCode) {
                  setSelectedCode({ ...selectedCode, content: val });
                  setAllFiles(prev => prev.map(f => f.name === selectedCode.name ? { ...f, content: val } : f));
                }
              }}
              options={{ fontSize: 14, minimap: { enabled: false }, wordWrap: "on", scrollBeyondLastLine: false }}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#444", gap: "12px" }}>
              <span style={{ fontSize: "3rem" }}>📝</span>
              <span>Ask the agent to write some code, then click "Open in Editor"</span>
            </div>
          )}
        </div>
      )}
      {activeTab === "preview" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          {allFiles.length > 0 ? (
            <SandpackProvider template="react" files={getSandpackFiles(allFiles)} theme="dark">
              <SandpackLayout style={{ height: "100%", border: "none" }}>
                <SandpackPreview style={{ height: "100%" }} showNavigator={false} />
              </SandpackLayout>
            </SandpackProvider>
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#444", gap: "12px" }}>
              <span style={{ fontSize: "3rem" }}>▶️</span>
              <span>Ask the agent to write some code, then click "Run Preview"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
