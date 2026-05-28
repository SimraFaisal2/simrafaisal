// CURSOR GLOW
const glow = document.querySelector(".cursor-glow");
if (glow) {
  document.addEventListener("mousemove", (e) => {
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
  });
}

// TYPING EFFECT
const textArray = [
  "Computer Science Student",
  "AI Enthusiast",
  "Problem Solver",
  "Future Software Engineer",
  "Tech Explorer"
];
let typingIndex = 0;
let charIndex = 0;
let currentText = "";
let currentChar = "";

function typeEffect() {
  if (typingIndex >= textArray.length) {
    typingIndex = 0;
  }
  currentText = textArray[typingIndex];
  charIndex++;
  currentChar = currentText.slice(0, charIndex);
  const typingElement = document.getElementById("typing");
  if (typingElement) typingElement.textContent = currentChar;

  if (currentChar.length === currentText.length) {
    typingIndex++;
    charIndex = 0;
    setTimeout(typeEffect, 1500);
  } else {
    setTimeout(typeEffect, 100);
  }
}
typeEffect();

// ASYNC LIVE CHATBOT CONNECTION ENGINE
async function sendMessage() {
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chatBox");
  if (!input || !chatBox) return;

  const userText = input.value.trim();
  if (userText === "") return;

  // 1. Mount User Message Bubble
  const userMessage = document.createElement("div");
  userMessage.classList.add("user-message");
  userMessage.textContent = userText;
  chatBox.appendChild(userMessage);

  input.value = "";
  chatBox.scrollTop = chatBox.scrollHeight;

  // 2. Mount Thinking Status Loader Bubble
  const botMessage = document.createElement("div");
  botMessage.classList.add("bot-message");
  botMessage.textContent = "Processing tokens... 🤖";
  chatBox.appendChild(botMessage);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    // 3. Dispatch data down pipeline to the same origin API endpoint so deployments and local previews both work.
    const VERCEL_BACKEND_URL = "/api/chat";
    
    const response = await fetch(VERCEL_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }) 
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Server status fault code: ${response.status}`);
    }

    botMessage.textContent = ""; // Clear loader text

    const aiReply = data?.reply || data?.text;

    if (aiReply) {
      // PRE-PROCESS MARKDOWN: Apply transformations cleanly to the whole string first
      let fullParsedHTML = aiReply
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") 
        .replace(/^\s*[\*\-]\s+(.*)$/gm, "<li style='margin-left: 15px; list-style-type: disc; padding-bottom: 4px;'>$1</li>") 
        .replace(/\n/g, "<br>"); 

      // 4. Smooth HTML-aware playback simulation loop using an array of tokens/tags
      let i = 0;
      let currentOutput = "";
      
      const tokens = fullParsedHTML.match(/<[^>]+>|[^<]/g) || [];

      function typeBot() {
        if (i < tokens.length) {
          currentOutput += tokens[i];
          botMessage.innerHTML = currentOutput;
          i++;
          chatBox.scrollTop = chatBox.scrollHeight;
          setTimeout(typeBot, 8); 
        }
      }
      typeBot();
    } else {
      botMessage.textContent = "Error: Invalid processing state returned from model backend.";
    }
  } catch (error) {
    console.error("Fetch Execution Fault:", error);
    botMessage.textContent = error?.message || "Network execution error connecting to backend API.";
  }
}

// ENTER KEY BINDING
const userInputField = document.getElementById("userInput");
if (userInputField) {
  userInputField.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
}

// COUNTERS
const counters = document.querySelectorAll(".counter");
counters.forEach(counter => {
  counter.innerText = "0";
  const updateCounter = () => {
    const target = +counter.getAttribute("data-target");
    const current = +counter.innerText;
    const increment = target / 100;
    if (current < target) {
      counter.innerText = `${Math.ceil(current + increment)}`;
      setTimeout(updateCounter, 20);
    } else {
      counter.innerText = target;
    }
  };
  updateCounter();
});

// DARK MODE
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
  });
}

// PARTICLES
if (typeof tsParticles !== 'undefined') {
  tsParticles.load("particles-js", {
    particles: {
      number: { value: 50 },
      color: { value: "#38bdf8" },
      links: { enable: true, color: "#38bdf8" },
      move: { enable: true, speed: 2 }
    }
  });
}