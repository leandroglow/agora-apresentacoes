(function () {
  "use strict";

  const sections = Array.from(document.querySelectorAll(".scene"));
  const navLinks = Array.from(document.querySelectorAll(".chapter-nav a"));
  const progressBar = document.getElementById("progressBar");
  const currentChapter = document.getElementById("currentChapter");
  const fullscreenButton = document.getElementById("fullscreenButton");
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = lightbox.querySelector("img");
  const lightboxCaption = lightbox.querySelector("figcaption");
  const lightboxClose = lightbox.querySelector(".lightbox-close");  const lightboxViewport = lightbox.querySelector(".lightbox-viewport");
  const zoomLevel = lightbox.querySelector(".zoom-level");
  let activeIndex = 0;
  let lastFocused = null;  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function setActiveSection(index) {
    activeIndex = Math.max(0, Math.min(index, sections.length - 1));
    const activeSection = sections[activeIndex];
    currentChapter.textContent = activeSection.dataset.chapter;
    navLinks.forEach(function (link, linkIndex) {
      const isActive = linkIndex === activeIndex;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function updateProgress() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    const percentage = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    progressBar.style.width = Math.min(100, Math.max(0, percentage)) + "%";
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.42) {
        setActiveSection(sections.indexOf(entry.target));
      }
    });
  }, { threshold: [0.42, 0.62] });

  sections.forEach(function (section) { observer.observe(section); });
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  function goToSection(index) {
    const target = sections[Math.max(0, Math.min(index, sections.length - 1))];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("keydown", function (event) {
    if (lightbox.classList.contains("open")) {
      if (event.key === "Escape") closeLightbox();      else if (event.key === "+" || event.key === "=") changeZoom(.25);
      else if (event.key === "-") changeZoom(-.25);
      else if (event.key === "0") resetZoom();
      return;
    }

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (["PageDown", "ArrowDown", "ArrowRight", " "].includes(event.key)) {
      event.preventDefault();
      goToSection(activeIndex + 1);
    } else if (["PageUp", "ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      goToSection(activeIndex - 1);
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
    } else if (event.key === "Home") {
      event.preventDefault();
      goToSection(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToSection(sections.length - 1);
    }
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }

  fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", function () {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute("aria-label", active ? "Sair da tela cheia" : "Entrar em tela cheia");
    const label = fullscreenButton.querySelector(".fullscreen-label");
    if (label) label.textContent = active ? "Sair" : "Tela cheia";
  });

  function openLightbox(trigger) {
    lastFocused = trigger;
    lightboxImage.src = trigger.dataset.image;
    lightboxImage.alt = trigger.querySelector("img").alt;
    lightboxCaption.textContent = trigger.dataset.caption || "Imagem do projeto";
    lightbox.classList.toggle("is-plan", trigger.dataset.view === "plan");
    resetZoom();
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lightboxImage.src = "";
    lightbox.classList.remove("is-plan");
    resetZoom();
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll(".open-lightbox").forEach(function (trigger) {
    trigger.addEventListener("click", function () { openLightbox(trigger); });
  });
  lightboxClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  function renderZoom() {
    lightboxImage.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + zoom + ")";
    zoomLevel.textContent = Math.round(zoom * 100) + "%";
    lightboxViewport.classList.toggle("zoomed", zoom > 1);
  }

  function changeZoom(delta) {
    zoom = Math.max(1, Math.min(4, zoom + delta));

    renderZoom();
  }

  function resetZoom() {
    zoom = 1;
    panX = 0;
    panY = 0;
    renderZoom();
  }

  lightbox.querySelectorAll("[data-zoom]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.zoom === "in") changeZoom(.25);
      else if (button.dataset.zoom === "out") changeZoom(-.25);
      else resetZoom();
    });
  });

  lightboxViewport.addEventListener("wheel", function (event) {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? .25 : -.25);
  }, { passive: false });

  lightboxViewport.addEventListener("dblclick", function () {
    if (zoom > 1) resetZoom();
    else changeZoom(1);
  });

  lightboxViewport.addEventListener("pointerdown", function (event) {

    dragging = true;
    dragStartX = event.clientX - panX;
    dragStartY = event.clientY - panY;
    lightboxViewport.classList.add("dragging");
    lightboxViewport.setPointerCapture(event.pointerId);
  });

  lightboxViewport.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    panX = event.clientX - dragStartX;
    panY = event.clientY - dragStartY;
    renderZoom();
  });

  function stopDragging() {
    dragging = false;
    lightboxViewport.classList.remove("dragging");
  }

  lightboxViewport.addEventListener("pointerup", stopDragging);
  lightboxViewport.addEventListener("pointercancel", stopDragging);
  document.querySelectorAll("a[href^='#']").forEach(function (link) {
    link.addEventListener("click", function () {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) setActiveSection(sections.indexOf(target));
    });
  });
})();
