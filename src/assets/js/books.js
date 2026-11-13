/**
 * The Books page. Every book's card is already in the page, in the list at
 * its foot; this shows a card beside its cover instead: on hover or focus
 * as a glance, on click or tap to keep it open. It also filters the main
 * shelf by status. Without this script the list at the foot is the page.
 */
(() => {
  "use strict";

  const buttons = [...document.querySelectorAll("[data-book]")];
  if (!buttons.length || !document.querySelector("[data-book-cards]")) return;

  const pop = document.createElement("div");
  pop.className = "book-pop";
  pop.id = "book-pop";
  pop.hidden = true;
  pop.tabIndex = -1;
  pop.setAttribute("role", "dialog");
  document.body.append(pop);
  for (const b of buttons) b.setAttribute("aria-controls", pop.id);

  const narrow = window.matchMedia("(max-width: 34rem)");
  const GAP = 14;
  const EDGE = 8;
  let current = null;                // the cover whose card is showing
  let pinned = false;                // opened on purpose, not merely passed over
  let timer = 0;
  let returning = false;             // focus is being handed back to a cover

  // Beside the cover: to its right if there is room, else its left, else
  // below it. On a phone the stylesheet docks the card to the screen's foot.
  const place = () => {
    if (!current) return;
    if (narrow.matches) {
      pop.style.left = pop.style.top = "";
      return;
    }
    const r = current.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left = r.right + GAP;
    let top = r.top;
    if (left + w > vw - EDGE) left = r.left - GAP - w;
    if (left < EDGE) {
      left = Math.max(EDGE, Math.min(vw - EDGE - w, r.left));
      top = r.bottom + GAP;
    } else if (top + h > vh - EDGE) {
      top = Math.max(EDGE, vh - EDGE - h);
    }
    pop.style.left = `${Math.round(left + window.scrollX)}px`;
    pop.style.top = `${Math.round(top + window.scrollY)}px`;
  };

  const show = (button, pin) => {
    clearTimeout(timer);
    const card = document.getElementById(button.dataset.book);
    if (!card) return;
    if (current !== button) {
      current?.setAttribute("aria-expanded", "false");
      const close = document.createElement("button");
      close.type = "button";
      close.className = "book-pop__close";
      close.textContent = "Close";
      close.addEventListener("click", () => hide(true));
      pop.replaceChildren(close, ...card.cloneNode(true).childNodes);
      pop.setAttribute("aria-label", card.querySelector(".bookcard__title")?.textContent.trim() || "Book");
      pop.scrollTop = 0;
    }
    current = button;
    pinned = pin;
    button.setAttribute("aria-expanded", "true");
    pop.classList.toggle("is-pinned", pin);
    pop.hidden = false;
    place();
    if (pin) pop.focus({ preventScroll: true });
  };

  const hide = (refocus = false) => {
    clearTimeout(timer);
    if (!current) return;
    const button = current;
    current = null;
    pinned = false;
    pop.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (refocus) {
      // Handing focus back must not open the card again as a glance.
      returning = true;
      button.focus({ preventScroll: true });
      returning = false;
    }
  };

  const later = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  for (const button of buttons) {
    button.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && !pinned) later(() => show(button, false), 90);
    });
    button.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && !pinned) later(() => hide(), 160);
    });
    button.addEventListener("focus", () => {
      if (!pinned && !returning && button.matches(":focus-visible")) show(button, false);
    });
    button.addEventListener("blur", () => {
      if (!pinned) later(() => hide(), 0);
    });
    button.addEventListener("click", () => {
      if (current === button && pinned) hide(true);
      else show(button, true);
    });
  }

  // The card stays while the pointer is on it, so its links can be reached.
  pop.addEventListener("pointerenter", () => clearTimeout(timer));
  pop.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !pinned) later(() => hide(), 160);
  });
  pop.addEventListener("focusout", (e) => {
    if (pinned && e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== current) hide();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) {
      e.stopPropagation();
      hide(pinned || document.activeElement === current);
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (pinned && !pop.contains(e.target) && !e.target.closest?.("[data-book]")) hide();
  });
  window.addEventListener("resize", place);
  narrow.addEventListener?.("change", place);

  // --- the main shelf, by status ---------------------------------------
  const filter = document.querySelector("[data-book-filter]");
  const shelf = document.querySelector("[data-book-shelf]");
  const none = document.querySelector("[data-book-none]");
  if (filter && shelf && filter.querySelectorAll("button").length > 2) {
    filter.hidden = false;
    filter.addEventListener("click", (e) => {
      const chosen = e.target.closest("button[data-show]");
      if (!chosen) return;
      hide();
      let shown = 0;
      for (const b of filter.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === chosen));
      for (const li of shelf.children) {
        li.hidden = chosen.dataset.show !== "all" && li.dataset.status !== chosen.dataset.show;
        if (!li.hidden) shown++;
      }
      if (none) none.hidden = shown > 0;
    });
  }

  window.__books = {
    get open() { return current ? current.dataset.book : null; },
    get pinned() { return pinned; },
  };
})();
