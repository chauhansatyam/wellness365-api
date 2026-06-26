const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const products = require("./products.json");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = "gemini-2.5-flash";

// Build product context string injected into every system prompt
const buildProductContext = () => {
  return products
    .map(
      (p) =>
        `- ${p.name} (${p.category}, ₹${p.price}): ${p.tagline}. Helps with: ${p.concerns.join(", ")}. Benefits: ${p.benefits} Variants: ${p.variants.join(", ")}. URL: ${p.url}`
    )
    .join("\n");
};

const SYSTEM_PROMPT = `You are an Ayurvedic Wellness Advisor for Kerala Ayurveda — a premium D2C Ayurvedic brand. Your role is to listen carefully to a customer's health concern and recommend 1–2 products from our catalogue that genuinely match their need.

Guidelines:
- Ask at most ONE follow-up question before recommending. If the concern is clear, recommend immediately.
- Be warm, knowledgeable, and specific — explain *why* each product suits their concern using Ayurvedic reasoning.
- Only recommend products from the catalogue below. Never invent products.
- When recommending, always include the product name, a one-line reason, and the price.
- Keep responses concise — 3–5 sentences max per recommendation.
- If the concern is outside the scope of our products, gently acknowledge it and suggest consulting an Ayurvedic practitioner.
- Use a calm, reassuring tone. Avoid medical diagnoses.

Our Product Catalogue:
${buildProductContext()}

Response format when recommending:
- Brief empathetic acknowledgement (1 sentence)
- Product recommendation(s) with name, why it helps, price
- One practical usage tip
- End with a soft invitation to ask more`;

app.get("/health", (req, res) => {
  res.json({ status: "ok", products: products.length });
});

app.post("/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    // Convert messages to Gemini format
    // Gemini uses "user" and "model" roles (not "assistant")
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = ai.chats.create({
      model: MODEL_NAME,
      history,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const result = await chat.sendMessage({ message: lastMessage });
    const reply = result.text;

    // Extract product recommendations from the reply
    const recommendedProducts = products.filter((p) =>
      reply.toLowerCase().includes(p.name.toLowerCase())
    );

    res.json({
      reply,
      recommendedProducts: recommendedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        url: p.url,
        tagline: p.tagline,
      })),
    });
  } catch (err) {
    console.error("Gemini API error:", err.message);
    res.status(500).json({
      error: "Could not reach the wellness advisor. Please try again.",
    });
  }
});

app.get("/products", (req, res) => {
  res.json(products);
});

app.listen(PORT, () => {
  console.log(`Wellness 365 API running on port ${PORT}`);
  console.log(`${products.length} products loaded`);
});