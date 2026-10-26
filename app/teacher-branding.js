/* Account-scoped APK editor; the server queues a signed Android build. */
(() => {
  "use strict";
  if (!document.body.classList.contains("portal-home") || !window.WA) return;
  let owner = "",
    state = null,
    dialog = null,
    image = null,
    source = "",
    drag = null,
    fetching = false,
    lastRead = 0,
    dirty = false,
    readWait = Promise.resolve(),
    finishRead = () => {};
  const box = document.getElementById("studentAppDownload");
  if (!box) return;
  const launch = document.createElement("button");
  launch.type = "button";
  launch.textContent = "Atur nama & logo APK";
  launch.dataset.brandEditor = "";
  box.querySelector(".teacher-app-actions").prepend(launch);
  const progress = document.createElement("p");
  progress.className = "teacher-brand-progress";
  progress.setAttribute("role", "status");
  box.append(progress);
  function jobText() {
    if (state && !state.builderAvailable)
      return "Pembuat APK belum tersambung. Pengaturan akan tersedia setelah layanan selesai disiapkan.";
    const j = state?.job;
    if (!j)
      return "Atur nama dan logo, lalu buat APK khusus untuk dibagikan kepada mahasiswa.";
    return j.state === "ready"
      ? "APK khusus siap diunduh dan dibagikan."
      : j.state === "queued"
        ? "APK sedang antre untuk dibuat. Anda boleh menutup jendela ini; hasil akan tersimpan."
        : j.state === "building"
          ? "APK sedang dibuat dan ditandatangani. Proses ini dapat memerlukan beberapa menit."
          : j.error ||
            "Pembuatan APK belum berhasil. Pengaturan tetap tersimpan.";
  }
  function renderStatus() {
    progress.textContent = jobText();
    if (state?.job?.state === "ready")
      window.PresenStudentDownload?.setRelease({
        url: state.job.url,
        name: state.config.name,
      });
    else if (["queued", "building"].includes(state?.job?.state))
      window.PresenStudentDownload?.pending(jobText());
    else if (state?.job?.state === "failed")
      window.PresenStudentDownload?.reset();
    if (!dialog) return;
    dialog.querySelector("[data-brand-status]").textContent = jobText();
    dialog.querySelector("[data-brand-save]").disabled =
      ["queued", "building"].includes(state?.job?.state) ||
      !state?.builderAvailable;
    const link = dialog.querySelector("[data-brand-download]");
    link.hidden = state?.job?.state !== "ready";
    if (!link.hidden) link.href = state.job.url;
    dialog.querySelector("[data-brand-share]").hidden = link.hidden;
  }
  function clearAccount() {
    state = null;
    lastRead = 0;
    image = null;
    source = "";
    dirty = false;
    drag = null;
    dialog?.close();
    dialog?.remove();
    dialog = null;
    window.PresenStudentDownload?.reset();
    progress.textContent = "";
  }
  async function read(force = false, full = false) {
    const s = await WA.get(),
      id = s.profile?.role === "teacher" ? s.profile.account.id : null;
    if (owner !== (id || "")) {
      clearAccount();
      owner = id || "";
      force = true;
    }
    if (!id) return;
    if (fetching) {
      if (full) {
        await readWait;
        return read(true, true);
      }
      return;
    }
    if (!navigator.onLine || document.hidden) return;
    if (!force && Date.now() - lastRead < 10000) return;
    fetching = true;
    readWait = new Promise((resolve) => (finishRead = resolve));
    try {
      const response = await WA.api(full ? "brand-read" : "brand-status");
      if ((await WA.get()).profile?.account?.id !== id) return;
      const remote = response.branding;
      if (!full && state?.revision === remote.revision && state?.config?.source)
        remote.config = state.config;
      state = remote;
      lastRead = Date.now();
      renderStatus();
    } catch (error) {
      if (owner === id) progress.textContent = error.message;
    } finally {
      fetching = false;
      finishRead();
      if (owner && owner !== id) void read(true);
    }
  }
  function draw() {
    if (!dialog) return;
    const c = dialog.querySelector("canvas"),
      g = c.getContext("2d"),
      shape = dialog.querySelector("[name=brandShape]").value,
      scale = +dialog.querySelector("[name=brandScale]").value,
      x = +dialog.querySelector("[name=brandX]").value,
      y = +dialog.querySelector("[name=brandY]").value;
    g.clearRect(0, 0, 512, 512);
    g.save();
    g.beginPath();
    if (shape === "circle") g.arc(256, 256, 254, 0, Math.PI * 2);
    else if (shape === "round") {
      if (g.roundRect) g.roundRect(2, 2, 508, 508, 100);
      else {
        g.moveTo(102, 2);
        g.lineTo(410, 2);
        g.quadraticCurveTo(510, 2, 510, 102);
        g.lineTo(510, 410);
        g.quadraticCurveTo(510, 510, 410, 510);
        g.lineTo(102, 510);
        g.quadraticCurveTo(2, 510, 2, 410);
        g.lineTo(2, 102);
        g.quadraticCurveTo(2, 2, 102, 2);
      }
    } else g.rect(0, 0, 512, 512);
    g.clip();
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 512, 512);
    if (image) {
      const factor =
          Math.min(512 / image.naturalWidth, 512 / image.naturalHeight) * scale,
        w = image.naturalWidth * factor,
        h = image.naturalHeight * factor;
      g.drawImage(image, (512 - w) / 2 + x, (512 - h) / 2 + y, w, h);
    }
    g.restore();
    dialog.querySelector("[data-brand-preview-name]").textContent =
      dialog.querySelector("[name=brandName]").value || "Nama aplikasi";
    dialog.querySelector("[data-brand-size]").textContent =
      Math.round(scale * 100) + "%";
  }
  async function decode(src) {
    const next = new Image();
    next.src = src;
    await next.decode();
    return next;
  }
  function controls(config) {
    dialog.querySelector("[name=brandName]").value =
      config?.name || "Presen Go";
    dialog.querySelector("[name=brandShape]").value = config?.shape || "round";
    dialog.querySelector("[name=brandScale]").value = config?.scale || 1;
    dialog.querySelector("[name=brandX]").value = config?.x || 0;
    dialog.querySelector("[name=brandY]").value = config?.y || 0;
  }
  function create() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "teacher-brand-dialog";
    dialog.setAttribute("aria-labelledby", "brandEditorTitle");
    dialog.innerHTML =
      '<form method="dialog" class="teacher-brand-heading"><div><span class="teacher-app-label">APLIKASI MAHASISWA</span><h2 id="brandEditorTitle">Nama & logo APK</h2></div><button aria-label="Tutup pengaturan APK" value="close">×</button></form><div class="teacher-brand-body"><p>Pengaturan melekat pada APK yang dibuat. Logo pemasangan dan logo di dalam aplikasi ikut berubah.</p><label>Nama aplikasi<input name="brandName" maxlength="40" autocomplete="off"></label><label>Pilih logo<input type="file" accept="image/png,image/jpeg,image/webp" data-brand-file></label><div class="teacher-brand-preview"><canvas width="512" height="512" aria-label="Pratinjau dan potong logo; geser gambar untuk mengatur posisi"></canvas><strong data-brand-preview-name></strong></div><p class="teacher-brand-hint">Geser gambar dengan jari atau mouse untuk memotongnya. Bentuk luar ikon juga mengikuti peluncur Android.</p><label>Bentuk logo<select name="brandShape"><option value="round">Persegi membulat</option><option value="circle">Lingkaran</option><option value="square">Persegi</option></select></label><label>Ukuran logo <output data-brand-size>100%</output><input type="range" name="brandScale" min="0.5" max="3" step="0.01" value="1"></label><label>Posisi mendatar<input name="brandX" type="range" min="-512" max="512" value="0"></label><label>Posisi tegak<input name="brandY" type="range" min="-512" max="512" value="0"></label><button type="button" data-brand-center>Pusatkan gambar</button><p>APK khusus akun ini dipasang terpisah dari Presen Go. Pembaruan APK khusus berikutnya memakai identitas yang sama, sehingga data akun tetap tersimpan. Maksimal 5 pembuatan APK per hari.</p><p role="status" aria-live="polite" data-brand-status></p></div><div class="teacher-brand-footer"><button type="button" data-brand-save>Simpan & buat APK</button><a data-brand-download hidden>Unduh APK khusus</a><button type="button" data-brand-share hidden>Bagikan</button></div>';
    document.body.append(dialog);
    dialog.querySelectorAll("input:not([type=file]),select").forEach((el) =>
      el.addEventListener("input", () => {
        dirty = true;
        draw();
      }),
    );
    dialog.querySelector("[data-brand-center]").onclick = () => {
      for (const n of ["brandX", "brandY"])
        dialog.querySelector("[name=" + n + "]").value = "0";
      dialog.querySelector("[name=brandScale]").value = "1";
      dirty = true;
      draw();
    };
    const c = dialog.querySelector("canvas");
    c.addEventListener("pointerdown", (e) => {
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        baseX: +dialog.querySelector("[name=brandX]").value,
        baseY: +dialog.querySelector("[name=brandY]").value,
      };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const k = 512 / c.getBoundingClientRect().width;
      dialog.querySelector("[name=brandX]").value = Math.max(
        -512,
        Math.min(512, drag.baseX + (e.clientX - drag.x) * k),
      );
      dialog.querySelector("[name=brandY]").value = Math.max(
        -512,
        Math.min(512, drag.baseY + (e.clientY - drag.y) * k),
      );
      dirty = true;
      draw();
    });
    for (const e of ["pointerup", "pointercancel"])
      c.addEventListener(e, () => (drag = null));
    dialog.querySelector("[data-brand-file]").onchange = async (e) => {
      const target = dialog,
        account = owner;
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const status = dialog.querySelector("[data-brand-status]");
      try {
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 12000000
        )
          throw Error("Pilih PNG/JPG/WebP maksimal 12 MB.");
        const url = URL.createObjectURL(file);
        let incoming;
        try {
          incoming = await decode(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (incoming.naturalWidth * incoming.naturalHeight > 24000000)
          throw Error("Gunakan gambar maksimal 24 megapiksel.");
        const normalized = document.createElement("canvas"),
          factor = Math.min(
            1,
            1024 / Math.max(incoming.naturalWidth, incoming.naturalHeight),
          );
        normalized.width = Math.round(incoming.naturalWidth * factor);
        normalized.height = Math.round(incoming.naturalHeight * factor);
        normalized
          .getContext("2d")
          .drawImage(incoming, 0, 0, normalized.width, normalized.height);
        let normalizedSource = normalized.toDataURL("image/png");
        if (normalizedSource.length > 1400000)
          normalizedSource = normalized.toDataURL("image/webp", 0.9);
        if (normalizedSource.length > 1400000)
          throw Error(
            "Gambar masih terlalu besar. Pilih gambar lebih sederhana.",
          );
        const decoded = await decode(normalizedSource);
        if (dialog !== target || owner !== account) return;
        source = normalizedSource;
        image = decoded;
        dialog.querySelector("[data-brand-center]").click();
        status.textContent =
          "Logo dimuat. Atur potongan dan ukurannya, lalu simpan.";
      } catch (error) {
        status.textContent = error.message;
      }
    };
    dialog.querySelector("[data-brand-save]").onclick = async () => {
      const button = dialog.querySelector("[data-brand-save]"),
        status = dialog.querySelector("[data-brand-status]");
      button.disabled = true;
      try {
        const name = dialog.querySelector("[name=brandName]").value.trim();
        if (
          name.length < 2 ||
          name.length > 40 ||
          /[<>\u0000-\u001f]/.test(name)
        )
          throw Error("Isi nama aplikasi 2–40 karakter.");
        if (!image || !source)
          throw Error("Pilih logo aplikasi terlebih dahulu.");
        const id = (await WA.get()).profile?.account?.id;
        if (id !== owner) throw Error("Akun berubah. Buka pengaturan kembali.");
        const result = await WA.api("brand-save", {
          baseRevision: state?.revision || 0,
          config: {
            name,
            source,
            icon: c.toDataURL("image/png"),
            shape: dialog.querySelector("[name=brandShape]").value,
            scale: +dialog.querySelector("[name=brandScale]").value,
            x: +dialog.querySelector("[name=brandX]").value,
            y: +dialog.querySelector("[name=brandY]").value,
          },
        });
        if (owner !== id || (await WA.get()).profile?.account?.id !== id)
          return;
        state = result.branding;
        dirty = false;
        renderStatus();
      } catch (error) {
        status.textContent = error.message;
        button.disabled = false;
      }
    };
    dialog.querySelector("[data-brand-share]").onclick = () =>
      box.querySelector("[data-app-share]").click();
    dialog.querySelector("[data-brand-download]").onclick = () => {
      if (dirty) {
        dialog.querySelector("[data-brand-status]").textContent =
          "Unduhan ini menggunakan versi terakhir yang selesai dibuat. Simpan perubahan untuk membuat APK baru.";
      }
    };
  }
  launch.onclick = async () => {
    const account = (await WA.get()).profile?.account?.id;
    if (!account) return;
    await read(true, true);
    if (owner !== account || (await WA.get()).profile?.account?.id !== account)
      return;
    create();
    const target = dialog;
    controls(state?.config);
    let selectedSource = state?.config?.source || "",
      selectedImage = null;
    try {
      if (!selectedSource) {
        const fallback = new Image();
        fallback.src = new URL("app/icon-512.png", WA.ROOT);
        await fallback.decode();
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 512;
        c.getContext("2d").drawImage(fallback, 0, 0, 512, 512);
        selectedSource = c.toDataURL("image/png");
      }
      selectedImage = await decode(selectedSource);
    } catch (_) {}
    if (dialog !== target || owner !== account) return;
    source = selectedSource;
    image = selectedImage;
    dirty = false;
    draw();
    renderStatus();
    dialog.showModal();
  };
  WA.on(() => void read());
  window.addEventListener("online", () => void read(true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void read(true);
  });
  setInterval(() => {
    if (["queued", "building"].includes(state?.job?.state)) void read(true);
  }, 15000);
  void read(true);
})();
