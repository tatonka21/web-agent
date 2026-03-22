import { useState, useRef, useEffect } from "react";

const BACKEND_URL = "https://1k.up.railway.app";

interface Message {
  role: "user" | "agent";
  text: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", text: "Hey! I am your AI coding agent. What are we building today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
      setMessages(prev => [...prev, { role: "agent", text: data.reply || data.error }]);
    } catch {
      setMessages(prev => [...prev, { role: "agent", text: "Error reaching backend. Is it running?" }]);
    }
    setLoading(false);
  }

  async function clearChat() {
    await fetch(`${BACKEND_URL}/clear`, { method: "POST" });
    setMessages([{ role: "agent", text: "Chat cleared! What are we building?" }]);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#0f0f0f", color:"#f0f0f0", fontFamily:"monospace" }}>
      <div style={{ padding:"16px 20px", background:"#1a1a2e", borderBottom:"1px solid #333", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:"1.2rem", fontWeight:"bold", color:"#00d4ff" }}>Web Coding Agent</span>
        <button onClick={clearChat} style={{ background:"#333", color:"#aaa", border:"none", padding:"6px 14px", borderRadius:"6px", cursor:"pointer" }}>Clear</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column", gap:"12px" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:"flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth:"75%", padding:"12px 16px", borderRadius:"12px", lineHeight:"1.6", whiteSpace:"pre-wrap", fontSize:"0.9rem",
              background: msg.role === "user" ? "#1a6bff" : "#1e1e2e",
              color: msg.role === "user" ? "#fff" : "#e0e0e0",
              border: msg.role === "agent" ? "1px solid #333" : "none"
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:"#1e1e2e", border:"1px solid #333", padding:"12px 16px", borderRadius:"12px", color:"#00d4ff" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding:"16px", borderTop:"1px solid #333", display:"flex", gap:"10px", background:"#1a1a2e" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask me to build something... (Enter to send)"
          rows={2}
          style={{ flex:1, background:"#0f0f0f", color:"#f0f0f0", border:"1px solid #444", borderRadius:"8px", padding:"10px", fontFamily:"monospace", fontSize:"0.9rem", resize:"none" }}
        />
        <button onClick={sendMessage} disabled={loading} style={{ background: loading ? "#333" : "#1a6bff", color:"#fff", border:"none", padding:"0 20px", borderRadius:"8px", cursor: loading ? "not-allowed" : "pointer", fontWeight:"bold" }}>
          Send
        </button>
      </div>
    </div>
  );
}
