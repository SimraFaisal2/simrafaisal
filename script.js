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
  currentChar = currentText.slice(0, ++charIndex);
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
    // 3. Dispatch data down pipeline to port 5050
    const response = await fetch("http://localhost:5050/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }) 
    });

    if (!response.ok) {
      throw new Error(`Server status fault code: ${response.status}`);
    }

    const data = await response.json();
    botMessage.textContent = ""; // Clear loader text

    const aiReply = data.reply || data.text;

    if (aiReply) {
      // 4. Smooth HTML-aware character playback simulation loop
      let i = 0;
      let currentBuiltHTML = "";
      
      function typeBot() {
        if (i < aiReply.length) {
          currentBuiltHTML += aiReply.charAt(i);
          
          // Phase A: Parse Markdown bold structures first (**text** -> <strong>)
          let formattedHTML = currentBuiltHTML.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
          
          // Phase B: Transform structural bullet indicators into true bullet items
          // This strips away raw literal asterisks (* content) or hyphens (- content) cleanly
          formattedHTML = formattedHTML.replace(/^\s*[\*\-]\s+(.*)$/gm, "<li style='margin-left: 15px; list-style-type: disc; padding-bottom: 4px;'>$1</li>");
          
          // Phase C: Map generic text breaks into true line break elements
          formattedHTML = formattedHTML.replace(/\n/g, "<br>");

          // Phase D: Commit clean parsed buffer markup down to the view layer
          botMessage.innerHTML = formattedHTML;
          
          i++;
          setTimeout(typeBot, 5);
          chatBox.scrollTop = chatBox.scrollHeight;
        }
      }
      typeBot();
    } else {
      botMessage.textContent = "Error: Invalid processing state returned from model backend.";
    }
  } catch (error) {
    console.error("Fetch Execution Fault:", error);
    const errorMessage = error && error.message ? error.message : "network error";
    botMessage.textContent = `Server unreachable on port 5050: ${errorMessage}. Start server.js and refresh.`;
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