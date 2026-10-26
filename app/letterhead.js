/* Preserve editable contact text while restoring live, safe hyperlinks after hydration. */
(() => {
  "use strict";
  const header = document.querySelector(".wa-letterhead");
  if (!header) return;
  let active = false;
  const wired = new WeakSet();
  function href(value) {
    return value.includes("@") && !/^https?:/i.test(value)
      ? "mailto:" + value
      : value
          .replace(/^http:\/\//i, "https://")
          .replace(/^(?!https?:\/\/)/i, "https://");
  }
  function wire(a) {
    if (!wired.has(a)) {
      wired.add(a);
      a.addEventListener("click", (e) => e.stopPropagation());
    }
  }
  function links() {
    if (active) return;
    const line = header.querySelector('[data-edit-key="inst-contact"]');
    if (
      !line ||
      document.activeElement === line ||
      line.contains(document.activeElement)
    )
      return;
    const value = line.textContent,
      pattern =
        /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/[^\s|]+|www\.[^\s|]+)/gi;
    const found = [...value.matchAll(pattern)],
      existing = [...line.querySelectorAll("a")];
    existing.forEach(wire);
    if (
      existing.length === found.length &&
      existing.every(
        (a, i) =>
          a.textContent === found[i][0] &&
          a.getAttribute("href") === href(found[i][0]),
      )
    )
      return;
    const parts = [];
    let last = 0;
    for (const m of value.matchAll(pattern)) {
      parts.push(document.createTextNode(value.slice(last, m.index)));
      const a = document.createElement("a");
      a.textContent = m[0];
      const email = m[0].includes("@") && !/^https?:/i.test(m[0]);
      a.href = email
        ? "mailto:" + m[0]
        : m[0]
            .replace(/^http:\/\//i, "https://")
            .replace(/^(?!https?:\/\/)/i, "https://");
      a.contentEditable = "false";
      if (!email) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      wire(a);
      parts.push(a);
      last = m.index + m[0].length;
    }
    parts.push(document.createTextNode(value.slice(last)));
    const desired = document.createElement("span");
    desired.append(...parts);
    if (line.innerHTML === desired.innerHTML) return;
    active = true;
    line.replaceChildren(...desired.childNodes);
    active = false;
  }
  function defaults() {
    window.simpanStateUndo?.();
    for (const field of header.querySelectorAll("[data-default-text]"))
      field.textContent = field.dataset.defaultText;
    for (const image of document.querySelectorAll(
      "#logoKiriPreview,#logoKananPreview,.logo-slot img",
    )) {
      const value = image.dataset.defaultSrc;
      if (!value) continue;
      image.src = value;
      image.hidden = false;
      image.style.display = "block";
      const box = image.closest(".logo-box,.logo-slot");
      box?.classList.add(box.matches(".logo-box") ? "has-image" : "has-logo");
      const icon = box?.querySelector("i");
      if (icon) {
        icon.hidden = true;
        icon.style.display = "none";
      }
      const remove =
        box?.parentElement.querySelector(".btn-hapus-logo") ||
        box?.querySelector(".logo-remove");
      if (remove) {
        remove.hidden = false;
        remove.style.display = "inline-block";
      }
      if (box?.matches(".logo-slot")) window.saveLogo?.(box.id, value);
    }
    links();
    window.saveEdits?.();
    header.dispatchEvent(new Event("input", { bubbles: true }));
    document.dispatchEvent(new Event("sheet-logo-changed"));
    window.WAFitSheetText?.();
    window.simpanStateUndo?.();
  }
  for (const button of document.querySelectorAll("[data-letterhead-reset]"))
    button.addEventListener("click", defaults);
  header.addEventListener("focusout", () => queueMicrotask(links));
  new MutationObserver(() => {
    if (!active) links();
  }).observe(header, { childList: true, subtree: true, characterData: true });
  links();
  function upgradeContent(content, page, owner) {
    if (owner !== "admin_01" || Number(content?.letterheadLogoVersion) >= 1)
      return content;
    const ids =
        page === "absen"
          ? ["logoKiriPreview", "logoKananPreview"]
          : ["logoLeftSlot", "logoRightSlot"],
      logos = {
        ...content.logos,
        [ids[0]]: "letterhead:left",
        [ids[1]]: "letterhead:right",
      };
    const text = { ...content.text },
      key = (id) => '[data-edit-key="' + id + '"]';
    if (
      String(text[key("inst-1")] || "").trim() === "STKIP YAPIS DOMPU" &&
      String(text[key("inst-3")] || "").trim() === "YAYASAN PENDIDIKAN ISLAM"
    ) {
      for (const id of ["inst-1", "inst-2", "inst-3"])
        text[key(id)] =
          header.querySelector(key(id))?.dataset.defaultText || text[key(id)];
      if (
        text[key("inst-contact")] ===
        "Email: akademik@stkipyapisdompu.ac.id | Website: www.stkipyapisdompu.ac.id"
      )
        text[key("inst-contact")] = header.querySelector(
          key("inst-contact"),
        ).dataset.defaultText;
      if (
        text[key("inst-address")] ===
        "Jln. STKIP Yapis Dompu No. 1, Desa Sori Sakolo - Dompu, NTB"
      )
        text[key("inst-address")] = header.querySelector(
          key("inst-address"),
        ).dataset.defaultText;
    }
    return { ...content, logos, text, letterheadLogoVersion: 1 };
  }
  function resolveLogo(value) {
    const side =
      value === "letterhead:left"
        ? "left"
        : value === "letterhead:right"
          ? "right"
          : null;
    if (!side) return value;
    return (
      document.querySelector(
        side === "left"
          ? "#logoKiriPreview,#logoLeftSlot img"
          : "#logoKananPreview,#logoRightSlot img",
      )?.dataset.defaultSrc || null
    );
  }
  window.PresenLetterhead = {
    restore: defaults,
    links,
    upgradeContent,
    resolveLogo,
  };
})();
