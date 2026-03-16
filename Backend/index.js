const express = require('express');
const cors = require('cors');
const FormData = require('form-data');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const OCR_SPACE_KEY = process.env.OCR_SPACE_KEY; // set in .env or hosting env vars
const GROQ_KEY = process.env.GROQ_KEY;

app.post('/api/scan-medicine', async (req, res) => {
  try {
    const imageBase64 = req.body.imageBase64; // frontend sends base64 image

    // Step 1: OCR.space
    const form = new FormData();
    form.append('file', Buffer.from(imageBase64, 'base64'), 'strip.jpg');
    form.append('apikey', OCR_SPACE_KEY);
    form.append('language', 'eng');
    form.append('OCREngine', 2);

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form
    });
    const ocrData = await ocrRes.json();
    const ocrText = ocrData.ParsedResults?.[0]?.ParsedText || '';

    if (!ocrText.trim()) {
      return res.json({ error: 'No text detected in image' });
    }

    // Step 2: Groq AI extraction
    const prompt = `Extract from this medicine strip OCR text ONLY these fields in JSON:
{
  "medicine_name": "BRAND name only (Dolo 650, not Paracetamol)",
  "manufacturer": "company name (Cipla Ltd)",
  "mfg_date": "MM/YYYY or MM/YY format",
  "exp_date": "MM/YYYY or MM/YY format"
}

OCR text: ${ocrText}

Return ONLY valid JSON, no explanations.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200
      })
    });

    const groqData = await groqRes.json();
    const result = JSON.parse(groqData.choices[0].message.content.replace(/```json|```/g, '').trim());

    res.json({
      success: true,
      data: result,
      rawOcr: ocrText
    });

  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = app;
