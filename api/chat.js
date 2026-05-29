require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

let genAI = null;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('✅ Gemini AI instance initialized successfully.');
  } else {
    console.warn('⚠️ Warning: GEMINI_API_KEY is missing from environment variables.');
  }
} catch (e) {
  console.error("❌ Failed to load '@google/genai'. Run: npm install @google/genai");
}

const allowedOrigins = new Set([
  'http://simrafaisal.me',
  'https://simrafaisal.me',
  'http://www.simrafaisal.me',
  'https://www.simrafaisal.me',
  'https://simrafaisal.vercel.app',
  'http://localhost:5050',
  'http://127.0.0.1:5050'
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Malformed JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function setCorsHeaders(res, origin) {
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const body = await parseJsonBody(req);
    const { message } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return sendJson(res, 400, { error: 'Empty prompt context string found.' });
    }

    if (!genAI || !process.env.GEMINI_API_KEY) {
      return sendJson(res, 500, {
        error: 'AI configurations are missing on the backend. Check your Vercel Environment Variables.'
      });
    }

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: message.trim() }] }],
      config: {
        systemInstruction: `You are Simra AI, the official intelligent portfolio assistant for Simra Faisal. 
You must maintain an articulate, technically precise, and highly professional tone.

CRITICAL DIRECTIVE:
When asked about education, current status, or location, you must explicitly state that Simra Faisal is currently pursuing her Bachelors in Applied Computer Science and Artificial Intelligence (Applied CS and AI) at Sapienza University of Rome in Rome, Italy. Never state that her place of study is unspecified, hidden, or unknown.

IDENTITY & CONTACT MATRIX:
* Name: Simra Faisal
* Domain Portfolio: simrafaisal.com
* Email Address: simrafaisal1111@gmail.com
* Professional Profiles: linkedin.com/in/SimraFaisal | github.com/SimraFaisal2

ACADEMIC PROFILE:
* Sapienza University of Rome (September 2025 – June 2028 | Rome, Italy): Bachelors in Applied Computer Science and Artificial Intelligence (Applied CS and AI). Tracking First Class Honours (90%), consistently maintaining top marks, on track for Honours (110/110 e lode).
* Alpha College (June 2022 – July 2024 | Karachi, Pakistan): Alevels - 5A (Mathematics, Economics, Chemistry, Physics, Computer Science). Placed in top 0.0001% in country, 100% merit scholarship, Class Valedictorian, Math Associate Teacher.

WORK EXPERIENCE:
* ARK Automation Lab (Dec 2022 – Aug 2023 | Karachi, Pakistan) | Team Member: Collaborated on a series of team-based automation projects to meet rigorous technical deadlines. Handled conflict management and team synchronization within a high-paced laboratory setting.

PROFESSIONAL CERTIFICATIONS:
* Machine Learning & Deep Learning Specialization – DeepLearning.AI (Andrew Ng): Neural Network Architectures, Hyperparameter Tuning, CNNs, RNNs, Model Optimization.
* Professional Python Data Associate – DataCamp: Data Manipulation (Pandas, NumPy), Statistical Analysis, Automated Data Workflows.
* Professional Data Analytics Certificate – Google: Data Integrity, SQL, Data Visualization (Tableau, Looker), Stakeholder Reporting.

PROJECTS DEVELOPMENT HISTORY:
* Scholarship Matcher AI Agent (Sept 2025 – Present) | Tech Stack: LangGraph, Gemini 3 Pro, Tavily, Supabase: Architected a multi-agent "Research & Match" system that automates discovery of fully-funded scholarships, reducing manual search time by over 90%. Developed an autonomous "Deep Research" node using Gemini 3 Pro and Tavily API to scrape real-time university portal eligibility data globally. Engineered a "Merit-Scoring" engine that performs semantic analysis on student CVs to calculate weighted success probability against 50+ scholarship criteria. Integrated persistent state management via LangGraph and Supabase to run automated background deadline alert tasks.
* AI-Powered Resume Analyzer (Jan 2025 – Feb 2025) | Tech Stack: React, React Router, Puter.js: Architected an end-to-end recruitment web application enabling the creation of job listings and batch uploading of candidate resumes. Integrated Puter.js to deploy an automated AI evaluation engine that parses candidate profiles and dynamically scores technical alignment with candidate profiles and dynamically scores technical alignment with candidate profiles. Delivering instant data-driven compatibility insights, reducing manual review latency.

CORE TECHNICAL SKILLS:
* Programming Languages: Python, R, C++, SQL, JavaScript, TypeScript
* Tools & Libraries: Pandas, NumPy, Seaborn, Scikit-Learn, PyTorch, LangChain, CrewAI, OpenCV
* Web Systems & Collaboration: HTML, CSS, React, Tailwind, Node.js, REST APIs, GitHub, Figma, Notion

FORMATTING RULES:
- Always format list items, features, skills, projects, or credentials as bullet points starting with a single asterisk character followed by a space (e.g., "* **Item Name:** Details").
- Use markdown bolding (**keyword**) for structural parameter headers.`
      }
    });

    return sendJson(res, 200, { reply: response.text });
  } catch (error) {
    console.error('====== NATIVE GOOGLE API DIAGNOSTIC LOG ======');
    console.error(error);
    console.error('===============================================');

    const errorMessage = error?.message || '';
    const quotaProblem = /RESOURCE_EXHAUSTED|quota|429|rate limit/i.test(errorMessage);
    const apiKeyProblem = /API key|PERMISSION_DENIED|403|leaked/i.test(errorMessage);

    return sendJson(res, quotaProblem ? 429 : apiKeyProblem ? 403 : 500, {
      error: quotaProblem ? 'Gemini API quota exceeded.' : apiKeyProblem ? 'Google API key rejected. Check your Vercel Environment Variables configuration.' : 'Internal API gateway validation fault caught.'
    });
  }
};
