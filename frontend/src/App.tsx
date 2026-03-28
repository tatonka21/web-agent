import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { SandpackProvider, SandpackPreview, SandpackLayout } from "@codesandbox/sandpack-react";

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
    files.push({
      name: `file${fileIndex++}.${ext}`,
      content,
      language: lang
    });
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

  const tabStyle = (tab: string) => ({
    padding: "8px 20px",
    background: activeTab === tab ? "#1a6bff" : "#1e1e2e",
    color: activeTab === tab ? "#fff" : "#aaa",
    border: "none",
    cursor: "pointer",
    borderRadius: "6px 6px 0 0",
    fontFamily: "monospace",
    fontSize: "0.85rem"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f0f0f", color: "#f0f0f0", fontFamily: "monospace" }}>
      
      {/* Header */}
      <div style={{ padding: "12px 20px", background: "#1a1a2e", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#00d4ff" }}>🤖 Web Coding Agent</span>
        <button onClick={clearChat} style={{ background: "#333", color: "#aaa", border: "none", padding: "6px 14px", borderRadius: "6px", cursor: "pointer" }}>Clear</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", padding: "8px 12px 0", background: "#0f0f0f", borderBottom: "1px solid #333" }}>
        <button style={tabStyle("chat")} onClick={() => setActiveTab("chat")}>💬 Chat</button>
        <button style={tabStyle("editor")} onClick={() => setActiveTab("editor")}>📝 Editor {allFiles.length > 0 ? `(${allFiles.length})` : ""}</button>
        <button style={tabStyle("preview")} onClick={() => setActiveTab("preview")}>▶️ Preview</button>
      </div>

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", padding: "12px 16px", borderRadius: "12px",
                  lineHeight: "1.6", whiteSpace: "pre-wrap", fontSize: "0.85rem",
                  background: msg.role === "user" ? "#1a6bff" : "#1e1e2e",
                  color: msg.role === "user" ? "#fff" : "#e0e0e0",
                  border: msg.role === "agent" ? "1px solid #333" : "none"
                }}>
                  {msg.text}
                  {msg.role === "agent" && extractCodeBlocks(msg.text).length > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button onClick={() => { setAllFiles(extractCodeBlocks(msg.text)); setSelectedCode(extractCodeBlocks(msg.text)[0]); setActiveTab("editor"); }}
                        style={{ background: "#00d4ff22", color: "#00d4ff", border: "1px solid #00d4ff44", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem" }}>
                        📝 Open in Editor
                      </button>
                      <button onClick={() => { setAllFiles(extractCodeBlocks(msg.text)); setActiveTab("preview"); }}
                        style={{ background: "#00ff8822", color: "#00ff88", border: "1px solid #00ff8844", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem" }}>
                        ▶️ Run Preview
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ background: "#1e1e2e", border: "1px solid #333", padding: "12px 16px", borderRadius: "12px", color: "#00d4ff" }}>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: "16px", borderTop: "1px solid #333", display: "flex", gap: "10px", background: "#1a1a2e" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me to build something... (Enter to send)"
              rows={2}
              style={{ flex: 1, background: "#0f0f0f", color: "#f0f0f0", border: "1px solid #444", borderRadius: "8px", padding: "10px", fontFamily: "monospace", fontSize: "0.9rem", resize: "none" }}
            />
            <button onClick={sendMessage} disabled={loading}
              style={{ background: loading ? "#333" : "#1a6bff", color: "#fff", border: "none", padding: "0 20px", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontWeight: "bold" }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* Editor Tab */}
      {activeTab === "editor" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {allFiles.length > 0 && (
            <div style={{ display: "flex", gap: "4px", padding: "8px 12px", background: "#1a1a2e", overflowX: "auto" }}>
              {allFiles.map((f, i) => (
                <button key={i} onClick={() => setSelectedCode(f)}
                  style={{ padding: "4px 12px", background: selectedCode?.name === f.name ? "#1a6bff" : "#333", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
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
              options={{ fontSize: 14, minimap: { enabled: false }, wordWrap: "on" }}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
              Ask the agent to write some code, then click "Open in Editor"
            </div>
          )}
        </div>
      )}

      {/* Preview Tab */}
      {activeTab === "preview" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          {allFiles.length > 0 ? (
            <SandpackProvider
              template="react"
              files={getSandpackFiles(allFiles)}
              theme="dark"
            >
              <SandpackLayout style={{ height: "100%", border: "none" }}>
                <SandpackPreview style={{ height: "100%" }} showNavigator={false} />
              </SandpackLayout>
            </SandpackProvider>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", height: "100%" }}>
              Ask the agent to write some code, then click "Run Preview"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
