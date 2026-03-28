require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors({
  origin: ["https://1kxbe.up.railway.app","https://1kx.up.railway.app","https://tatonka21.github.io","http://localhost:5173","http://localhost:3000"],
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USERNAME || "tatonka21";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const HISTORY_FILE = path.join(__dirname, "history.json");

const SYSTEM_PROMPT = `You are a powerful AI coding agent running in the cloud, accessible via a web interface at https://tatonka21.github.io/web-agent/

IMPORTANT RULES YOU MUST ALWAYS FOLLOW:
- You are a CLOUD agent. You have NO access to Termux, Android, or any local filesystem.
- You can ONLY write code as markdown code blocks in your replies.
- NEVER use TOOL_CALL commands. They do not work in this environment.
- NEVER suggest React Native. Always use plain React for web apps.
- NEVER suggest npm install, npx, or terminal commands to the user.
- The user has a Monaco code editor and Sandpack live preview built into the UI.
- When you write code, the user can click Open in Editor to see it in Monaco and Run Preview to run it live in Sandpack.

HOW TO RESPOND:
- Always write complete, self-contained React components that work in a browser.
- Use only vanilla React with hooks (useState, useEffect, useRef etc).
- For styling use inline styles or plain CSS - no Tailwind, no external CSS frameworks.
- For icons use emoji characters directly in JSX - no icon libraries needed.
- Write the full working code in a single App.js code block whenever possible.
- Always explain what you built after the code block.

You help users build: web apps, games, tools, dashboards, landing pages, calculators, and any browser-based application using React.`;

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) return JSON.parse(fs.readFileSync(HISTORY_FILE,"utf8"));
  } catch(e) {}
  return [];
}

function saveHistory(history) {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history,null,2)); } catch(e) {}
}

let conversationHistory = loadHistory();

async function ghFetch(path, options={}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json", ...(options.headers||{}) }
  });
  if(r.status===204) return {};
  return r.json();
}

app.get("/github/user", async (req,res) => {
  const data = await ghFetch("/user");
  res.json(data);
});

app.get("/github/repos", async (req,res) => {
  const data = await ghFetch(`/users/${GITHUB_USER}/repos?per_page=100&sort=updated`);
  res.json(data);
});

app.get("/github/contents", async (req,res) => {
  const { repo, path: filePath="" } = req.query;
  const data = await ghFetch(`/repos/${GITHUB_USER}/${repo}/contents/${filePath}`);
  res.json(data);
});

app.post("/github/contents", async (req,res) => {
  const { repo, path: filePath, content, sha, message } = req.body;
  const data = await ghFetch(`/repos/${GITHUB_USER}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify({ message: message||`Update ${filePath}`, content, ...(sha?{sha}:{}) })
  });
  res.json(data);
});

app.delete("/github/contents", async (req,res) => {
  const { repo, path: filePath, sha, message } = req.body;
  const data = await ghFetch(`/repos/${GITHUB_USER}/${repo}/contents/${filePath}`, {
    method: "DELETE",
    body: JSON.stringify({ message: message||`Delete ${filePath}`, sha })
  });
  res.json(data);
});

app.post("/github/repos", async (req,res) => {
  const data = await ghFetch("/user/repos", {
    method: "POST",
    body: JSON.stringify(req.body)
  });
  res.json(data);
});

app.get("/", (req,res) => res.json({ status:"Web Agent API is running!", historyLength:conversationHistory.length }));

async function callGemini(history) {
  const payload = {
    system_instruction: { parts:[{text:SYSTEM_PROMPT}] },
    contents: history.map(m=>({ role:m.role==="user"?"user":"model", parts:[{text:m.content}] })),
    generationConfig: { maxOutputTokens:8192, temperature:0.7 }
  };
  const r = await fetch(GEMINI_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  if(!r.ok) throw new Error("Gemini failed");
  const d = await r.json();
  return d.candidates[0].content.parts[0].text;
}

async function callGroq(history) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${GROQ_API_KEY}`},
    body: JSON.stringify({ model:"llama-3.3-70b-versatile", messages:[{role:"system",content:SYSTEM_PROMPT},...history], max_tokens:8192, temperature:0.7 })
  });
  if(!r.ok) throw new Error("Groq failed");
  const d = await r.json();
  return d.choices[0].message.content;
}

app.post("/chat", async (req,res) => {
  const { message } = req.body;
  if(!message) return res.status(400).json({error:"No message"});
  conversationHistory.push({role:"user",content:message});
  if(conversationHistory.length>40) conversationHistory=conversationHistory.slice(-40);
  try {
    let reply;
    try { reply=await callGroq(conversationHistory); console.log("Used Groq"); }
    catch(e) { console.log("Groq failed, trying Gemini..."); reply=await callGemini(conversationHistory); }
    conversationHistory.push({role:"assistant",content:reply});
    saveHistory(conversationHistory);
    res.json({reply});
  } catch(err) { res.status(500).json({error:"Both AI backends failed",details:err.message}); }
});

app.post("/clear", (req,res) => {
  conversationHistory=[];
  saveHistory(conversationHistory);
  res.json({status:"Cleared"});
});

const PORT = process.env.PORT||8080;
app.listen(PORT, ()=>console.log(`Web Agent API running on port ${PORT}`));
