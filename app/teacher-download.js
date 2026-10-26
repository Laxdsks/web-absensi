/* Verified student release; the rolling asset is updated only after APK checks. */
(() => {
  "use strict";
  if (!document.body.classList.contains("portal-home")) return;
  let url =
      "https://github.com/Laxdsks/web-absensi/releases/download/presen-go-current/Presen-Go.apk",
    appName = "Presen Go";
  const defaultURL = url;
  const guideURL = new URL(
    "app/panduan-mahasiswa.html",
    new URL("../", document.currentScript.src),
  ).href;
  const shareText = () =>
    "Unduh " +
    appName +
    ", aplikasi absensi mahasiswa Android: " +
    url +
    "\nPanduan instalasi dan penggunaan: " +
    guideURL;
  const box = document.createElement("section");
  box.id = "studentAppDownload";
  box.className = "teacher-app-download";
  box.setAttribute("aria-labelledby", "studentAppTitle");
  box.innerHTML =
    '<div><span class="teacher-app-label">APLIKASI MAHASISWA · ANDROID</span><h2 id="studentAppTitle">Unduh & bagikan Presen Go</h2><p>Bagikan aplikasi kepada mahasiswa. Tautan ini selalu menuju APK terbaru yang sudah dirilis.</p></div><div class="teacher-app-actions"><a class="p-primary" data-apk-download>Unduh APK terbaru</a><button type="button" data-app-share>Bagikan tautan</button><a data-app-whatsapp target="_blank" rel="noopener noreferrer">Bagikan ke WhatsApp</a><button type="button" data-app-copy>Salin tautan</button><button type="button" data-app-file>Bagikan file APK</button><button type="button" data-app-guide>Panduan instal & penggunaan</button></div><p><a data-student-guide target="_blank" rel="noopener noreferrer">Buka panduan untuk mahasiswa</a></p><label class="teacher-app-link">Tautan unduhan<input readonly aria-label="Tautan aplikasi mahasiswa"></label><p class="teacher-app-help">Untuk membagikan file, unduh APK dahulu, lalu pilih file tersebut melalui tombol Bagikan file APK. Dukungan berbagi file mengikuti browser perangkat.</p><input type="file" accept=".apk,application/vnd.android.package-archive" data-apk-picker hidden><p role="status" aria-live="polite"></p>';
  (
    document.querySelector(".portal-hero") ||
    document.querySelector(".main-card")
  ).after(box);
  box.querySelector("[data-app-guide]").onclick = () => {
    document.querySelector(".wa-guide-open")?.click();
    const select = document.querySelector(
        ".wa-teacher-guide .wa-guide-panel select",
      ),
      option =
        select &&
        [...select.options].find((o) =>
          o.textContent.includes("Aplikasi mahasiswa:"),
        );
    if (option) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const status = box.querySelector("[role=status]"),
    link = box.querySelector("input[readonly]"),
    picker = box.querySelector("[data-apk-picker]");
  link.value = url;
  box.querySelector("[data-student-guide]").href = guideURL;
  box.querySelector("[data-apk-download]").href = url;
  box.querySelector("[data-app-whatsapp]").href =
    "https://wa.me/?text=" + encodeURIComponent(shareText());
  box.querySelector("[data-app-copy]").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = "Tautan unduhan disalin.";
    } catch (_) {
      link.focus();
      link.select();
      status.textContent = "Pilih Salin pada tautan yang disorot.";
    }
  };
  box.querySelector("[data-app-share]").onclick = async () => {
    if (!navigator.share) {
      box.querySelector("[data-app-copy]").click();
      return;
    }
    try {
      await navigator.share({
        title: appName + " — Absen Mahasiswa",
        text:
          "Aplikasi absensi mahasiswa Android. Panduan instalasi dan penggunaan: " +
          guideURL,
        url,
      });
      status.textContent = "Tautan diserahkan ke aplikasi berbagi.";
    } catch (e) {
      if (e.name !== "AbortError")
        status.textContent =
          "Berbagi belum tersedia. Gunakan Salin tautan atau WhatsApp.";
    }
  };
  box.querySelector("[data-app-file]").onclick = () => {
    if (!navigator.share || !navigator.canShare) {
      status.textContent =
        "Unduh APK, lalu lampirkan file unduhan melalui WhatsApp atau aplikasi pesan Anda.";
      return;
    }
    status.textContent =
      "Pilih file APK " + appName + " yang sudah Anda unduh.";
    picker.click();
  };
  picker.onchange = async () => {
    const file = picker.files?.[0];
    picker.value = "";
    if (!file) return;
    if (!/\.apk$/i.test(file.name)) {
      status.textContent = "Pilih file aplikasi berformat APK.";
      return;
    }
    if (!navigator.canShare({ files: [file] })) {
      status.textContent =
        "Browser ini belum mendukung berbagi APK. Lampirkan file unduhan langsung dari aplikasi pesan Anda.";
      return;
    }
    try {
      await navigator.share({
        title: appName + " — Absen Mahasiswa",
        files: [file],
      });
      status.textContent = "File APK diserahkan ke aplikasi berbagi.";
    } catch (e) {
      if (e.name !== "AbortError")
        status.textContent =
          "File belum dapat dibagikan. Lampirkan APK langsung dari aplikasi pesan Anda.";
    }
  };
  window.PresenStudentDownload = {
    setRelease(release) {
      if (
        !/^https:\/\/github\.com\/Laxdsks\/web-absensi\/releases\/download\/presen-brand-[a-f0-9-]{36}\/Presen-Student\.apk$/.test(
          release.url,
        )
      )
        return;
      url = release.url;
      appName = release.name;
      update();
    },
    reset() {
      url = defaultURL;
      appName = "Presen Go";
      update();
    },
    pending(message) {
      for (const q of ["[data-apk-download]", "[data-app-whatsapp]"]) {
        const a = box.querySelector(q);
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
      }
      for (const q of [
        "[data-app-share]",
        "[data-app-copy]",
        "[data-app-file]",
      ])
        box.querySelector(q).disabled = true;
      box.querySelector("[data-apk-download]").textContent =
        "APK sedang dibuat…";
      link.value = "";
      status.textContent = message;
    },
  };
  function update() {
    box.querySelector("div>p").textContent =
      url === defaultURL
        ? "Bagikan aplikasi kepada mahasiswa. Tautan ini selalu menuju APK terbaru yang sudah dirilis."
        : "Bagikan APK dengan nama dan logo khusus yang sudah selesai dibuat untuk akun Anda.";
    box.querySelector("#studentAppTitle").textContent =
      "Unduh & bagikan " + appName;
    link.value = url;
    box.querySelector("[data-apk-download]").href = url;
    box.querySelector("[data-apk-download]").textContent =
      url === defaultURL ? "Unduh APK terbaru" : "Unduh APK khusus";
    box.querySelector("[data-app-whatsapp]").href =
      "https://wa.me/?text=" + encodeURIComponent(shareText());
    for (const a of box.querySelectorAll("[aria-disabled]"))
      a.removeAttribute("aria-disabled");
    for (const q of ["[data-app-share]", "[data-app-copy]", "[data-app-file]"])
      box.querySelector(q).disabled = false;
    status.textContent = "";
  }
})();
