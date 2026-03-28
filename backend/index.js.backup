const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: ["https://1kx.up.railway.app", "http://localhost:5173"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are a powerful AI coding agent accessible via a web interface. You help users build TypeScript, React, React Native, and web apps. You can write code, explain concepts, debug errors, and guide projects step by step. When writing code always wrap it in proper markdown code blocks with the language specified. Be concise but thorough. Always explain what you are doing and why.`;

let conversationHistory = [];

app.get("/", (req, res) => {
  res.json({ status: "Web Agent API is running!" });
});

async function callGemini(history) {
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: history.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
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

app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided" });

  conversationHistory.push({ role: "user", content: message });
  if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

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
    conversationHistory.push({ role: "assistant", content: reply });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Both AI backends failed", details: err.message });
  }
});

app.post("/clear", (req, res) => {
  conversationHistory = [];
  res.json({ status: "History cleared" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Web Agent API running on port ${PORT}`);
});
