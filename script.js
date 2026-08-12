// ============================================================
// 1. HERO TYPING EFFECT (rotating roles)
// ============================================================
const textArray = [
  "Applied CS & AI @ Sapienza",
  "AI engineer in training",
  "Builder of assistive tech",
  "Problem solver at heart",
  "Future satellite-systems nerd"
];

let typingIndex = 0;
let charIndex = 0;
let deleting = false;
const typingEl = document.getElementById("typing");

function typeEffect() {
  if (!typingEl) return;
  const currentText = textArray[typingIndex];

  if (!deleting) {
    charIndex++;
    typingEl.textContent = currentText.slice(0, charIndex);
    if (charIndex === currentText.length) {
      deleting = true;
      setTimeout(typeEffect, 1800);
      return;
    }
    setTimeout(typeEffect, 70);
  } else {
    charIndex--;
    typingEl.textContent = currentText.slice(0, charIndex);
    if (charIndex === 0) {
      deleting = false;
      typingIndex = (typingIndex + 1) % textArray.length;
      setTimeout(typeEffect, 400);
      return;
    }
    setTimeout(typeEffect, 35);
  }
}

// ============================================================
// 2. MOBILE NAV TOGGLE
// ============================================================
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });

  // Close the drawer when a link is clicked
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// ============================================================
// 3. SCROLLSPY — highlight the section you're viewing
// ============================================================
const sectionIds = ["intro", "about", "experience", "certs", "focus", "projects", "ai", "contact"];

function setActiveLink(id) {
  document.querySelectorAll(".nav-links > a, .sidebar-nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + id);
  });
}

function onScroll() {
  const scrollPos = window.scrollY + 120;
  let current = "intro";
  for (const id of sectionIds) {
    const el = document.getElementById(id);
    if (el && el.offsetTop <= scrollPos) current = id;
  }
  setActiveLink(current);
}

// ============================================================
// 4. FADE-IN ON SCROLL
// ============================================================
function setupFadeIns() {
  const targets = document.querySelectorAll(
    "#about, #experience, #certs, #focus, #projects, #ai, #contact, .project-card, .experience-item, .timeline-item, .focus-card, .cert-card"
  );
  targets.forEach((t) => t.classList.add("fade-in"));

  if (!("IntersectionObserver" in window)) {
    targets.forEach((t) => t.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  targets.forEach((t) => observer.observe(t));
}

// ============================================================
// 5. LIVE CHATBOT ENGINE (Gemini via /api/chat)
// ============================================================
async function sendMessage() {
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chatBox");
  if (!input || !chatBox) return;

  const userText = input.value.trim();
  if (userText === "") return;

  // Render the user's message
  const userMessage = document.createElement("div");
  userMessage.classList.add("user-message");
  userMessage.textContent = userText;
  chatBox.appendChild(userMessage);

  input.value = "";
  chatBox.scrollTop = chatBox.scrollHeight;

  // Render the "thinking" bubble
  const botMessage = document.createElement("div");
  botMessage.classList.add("bot-message");
  botMessage.textContent = "Processing tokens... 🤖";
  chatBox.appendChild(botMessage);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Server error: ${response.status}`);
    }

    const aiReply = data?.reply || data?.text;
    if (!aiReply) {
      botMessage.textContent = "Error: no reply returned from the model backend.";
      return;
    }

    // Light markdown: bold, bullets, line breaks
    const fullParsedHTML = aiReply
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/^\s*[\*\-]\s+(.*)$/gm, "<li style='margin-left: 18px; padding-bottom: 4px;'>$1</li>")
      .replace(/\n/g, "<br>");

    // Stream the reply in, token by token
    botMessage.textContent = "";
    const tokens = fullParsedHTML.match(/<[^>]+>|[^<]/g) || [];
    let i = 0;
    let currentOutput = "";

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
  } catch (error) {
    console.error("Chat error:", error);
    botMessage.textContent = error?.message || "Network error connecting to the backend API.";
  }
}

// Enter key sends the message
const userInputField = document.getElementById("userInput");
if (userInputField) {
  userInputField.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
}

// ============================================================
// 6. MOUSE-TRACKING SPOTLIGHT GLOW (Leonardo.ai-style)
//    Follows the cursor across cards via --mx / --my CSS vars
// ============================================================
function setupSpotlight() {
  const cards = document.querySelectorAll(".project-card, .focus-card, .timeline-item");
  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
      card.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
    });
  });
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  setupFadeIns();
  setupSpotlight();
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
