require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
app.use(cors({
  origin: [
    "https://1kxbe.up.railway.app",
    "https://1kx.up.railway.app",
    "https://tatonka21.github.io",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const HISTORY_FILE = path.join(__dirname, "history.json");

const SYSTEM_PROMPT = `You are a powerful autonomous AI coding agent running on a local machine via a web interface. You help users build TypeScript, React, React Native, and web apps autonomously.

You have access to the following TOOLS. When you need to use a tool, respond with a JSON block in this exact format inside your message:

TOOL_CALL:{"tool":"write-file","path":"/data/data/com.termux/files/home/projects/myapp/App.tsx","content":"...file content here..."}
TOOL_CALL:{"tool":"read-file","path":"/data/data/com.termux/files/home/projects/myapp/package.json"}
TOOL_CALL:{"tool":"execute","command":"cd /data/data/com.termux/files/home/projects/myapp && npm install"}
TOOL_CALL:{"tool":"list-dir","path":"/data/data/com.termux/files/home/projects"}

Available tools:
- write-file: Write content to a file (creates directories automatically)
- read-file: Read the contents of a file
- execute: Run a shell/terminal command
- list-dir: List files in a directory

Rules:
- Always write files to /data/data/com.termux/files/home/projects/ unless told otherwise
- When building an app, always start by creating the folder structure, then write each file
- After writing files, always run npm install if needed
- Explain what you are doing at each step
- When writing code always wrap explanations in text and use TOOL_CALL for actual file operations
- Be concise but thorough`;

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.log("Could not load history:", e.message);
  }
  return [];
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.log("Could not save history:", e.message);
  }
}

let conversationHistory = loadHistory();

app.get("/", (req, res) => {
  res.json({ status: "Web Agent API is running!", historyLength: conversationHistory.length });
});

async function callGemini(history) {
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: history.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    })),
    generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
  };
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Gemini failed");
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function callGroq(history) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      max_tokens: 8192,
      temperature: 0.7
    })
  });
  if (!response.ok) throw new Error("Groq failed");
  const data = await response.json();
  return data.choices[0].message.content;
}

function executeCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, output: stderr || error.message });
      } else {
        resolve({ success: true, output: stdout || "Command completed successfully" });
      }
    });
  });
}

async function processToolCalls(reply) {
  const results = [];
  const toolCallStart = "TOOL_CALL:";
  let searchFrom = 0;

  while (true) {
    const startIdx = reply.indexOf(toolCallStart, searchFrom);
    if (startIdx === -1) break;

    const jsonStart = startIdx + toolCallStart.length;
    let braceCount = 0;
    let jsonEnd = -1;
    let inString = false;
    let escape = false;

    for (let i = jsonStart; i < reply.length; i++) {
      const ch = reply[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = !inString;
      if (!inString) {
        if (ch === "{") braceCount++;
        if (ch === "}") {
          braceCount--;
          if (braceCount === 0) { jsonEnd = i + 1; break; }
        }
      }
    }

    if (jsonEnd === -1) { searchFrom = jsonStart; break; }

    const jsonStr = reply.slice(jsonStart, jsonEnd);
    searchFrom = jsonEnd;

    try {
      const toolCall = JSON.parse(jsonStr);
      let result;

      if (toolCall.tool === "write-file") {
        const dirPath = path.dirname(toolCall.path);
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(toolCall.path, toolCall.content, "utf8");
        result = `✅ File written: ${toolCall.path}`;
      } else if (toolCall.tool === "read-file") {
        if (fs.existsSync(toolCall.path)) {
          const content = fs.readFileSync(toolCall.path, "utf8");
          result = `📄 File content of ${toolCall.path}:\n${content}`;
        } else {
          result = `❌ File not found: ${toolCall.path}`;
        }
      } else if (toolCall.tool === "execute") {
        const execResult = await executeCommand(toolCall.command);
        result = execResult.success
          ? `✅ Command output:\n${execResult.output}`
          : `❌ Command failed:\n${execResult.output}`;
      } else if (toolCall.tool === "list-dir") {
        if (fs.existsSync(toolCall.path)) {
          const items = fs.readdirSync(toolCall.path);
          result = `📁 Contents of ${toolCall.path}:\n${items.join("\n")}`;
        } else {
          result = `❌ Directory not found: ${toolCall.path}`;
        }
      }

      results.push(result);
    } catch (e) {
      results.push(`❌ Tool call error: ${e.message}`);
    }
  }

  return results;
}

app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided" });

  conversationHistory.push({ role: "user", content: message });
  if (conversationHistory.length > 40) conversationHistory = conversationHistory.slice(-40);

  try {
    let reply;
    try {
      reply = await callGroq(conversationHistory);
      console.log("Used Groq");
    } catch (e) {
      console.log("Groq failed, falling back to Gemini...");
      reply = await callGemini(conversationHistory);
      console.log("Used Gemini");
    }

    const toolResults = await processToolCalls(reply);

    let finalReply = reply;
    if (toolResults.length > 0) {
      finalReply += "\n\n---\n**Tool Results:**\n" + toolResults.join("\n");
    }

    conversationHistory.push({ role: "assistant", content: finalReply });
    saveHistory(conversationHistory);

    res.json({ reply: finalReply });
  } catch (err) {
    res.status(500).json({ error: "Both AI backends failed", details: err.message });
  }
});

app.post("/clear", (req, res) => {
  conversationHistory = [];
  saveHistory(conversationHistory);
  res.json({ status: "History cleared" });
});

app.post("/execute", async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "No command provided" });
  const result = await executeCommand(command);
  res.json(result);
});

app.post("/write-file", (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: "Missing filePath or content" });
  try {
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    res.json({ success: true, message: `File written: ${filePath}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/read-file", (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: "No filePath provided" });
  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ success: true, content });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/list-dir", (req, res) => {
  const { dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: "No dirPath provided" });
  try {
    const items = fs.readdirSync(dirPath);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Web Agent API running on port ${PORT}`);
});
