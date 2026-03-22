const express = require("express");
const cors = require("cors");


const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are a powerful AI coding agent accessible via a web interface. You help users build TypeScript, React, React Native, and web apps. You can write code, explain concepts, debug errors, and guide projects step by step. When writing code always wrap it in proper markdown code blocks with the language specified. Be concise but thorough. Always explain what you are doing and why.`;

let conversationHistory = [];

app.get("/", (req, res) => {
  res.json({ status: "Web Agent API is running!" });
});

app.post("/chat", async (req, res) => {
  const { message, clearHistory } = req.body;
  if (clearHistory) {
    conversationHistory = [];
    return res.json({ reply: "Conversation cleared!" });
  }
  if (!message) {
    return res.status(400).json({ error: "No message provided" });
  }
  conversationHistory.push({ role: "user", parts: [{ text: message }] });
  if (conversationHistory.length > 20) {
    conversationHistory = conversationHistory.slice(-20);
  }
  try {
    const payload = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: conversationHistory,
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
    };
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: "Gemini API error", details: errText });
    }
    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;
    conversationHistory.push({ role: "model", parts: [{ text: reply }] });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.post("/clear", (req, res) => {
  conversationHistory = [];
  res.json({ status: "History cleared" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Web Agent API running on port ${PORT}`);
});
