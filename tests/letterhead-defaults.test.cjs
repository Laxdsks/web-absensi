const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const {
  chromium,
} = require("/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core");
const BASE = process.env.WA_TEST_URL || "http://127.0.0.1:8012/";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname))
  throw Error("Local letterhead fixtures only");
test(
  "the same editable official letterhead, original logos and live blue links survive edit/delete/reset on both sheets",
  { timeout: 90000 },
  async () => {
    const b = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    try {
      const c = await b.newContext({ viewport: { width: 1450, height: 1000 } });
      await c.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(BASE).origin
          ? r.continue()
          : new URL(r.request().url()).hostname === "www.stkipyapisdompu.ac.id"
            ? r.fulfill({ body: "<title>Institution link test</title>" })
            : r.abort(),
      );
      const p = await c.newPage();
      await p.goto(BASE);
      await p.waitForFunction(() => window.WA);
      await p.evaluate(
        (password) => WA.login("teacher", { username: "M.Fadillah", password }),
        fs.readFileSync("index.php", "utf8").match(/\$pass === '([^']+)'/)[1],
      );
      const ctx = {
          prodi: "Pendidikan Teknologi Informasi",
          semester: "7",
          kelas: "G",
          year: "2038/2039",
          period: "Ganjil",
        },
        course = "Letterhead " + Date.now(),
        url = (page) =>
          BASE +
          page +
          ".php?" +
          new URLSearchParams({ ...ctx, matkul: course });
      fs.mkdirSync("tests/results/letterhead", { recursive: true });
      for (const page of ["absen", "ujian"]) {
        await p.goto(url(page));
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        await p.waitForFunction(() =>
          [
            ...document.querySelectorAll(
              "#logoKiriPreview,#logoKananPreview,.logo-slot img",
            ),
          ].every((i) => i.complete && i.naturalWidth),
        );
        assert.equal(
          await p.locator("[data-edit-key=inst-1]").innerText(),
          "YAYASAN PENDIDIKAN ISLAM",
        );
        assert.equal(
          await p.locator("[data-edit-key=inst-3]").innerText(),
          "(STKIP) YAPIS DOMPU",
        );
        assert(
          (
            await p.locator("[data-edit-key=inst-address]").innerText()
          ).includes("Sorisakolo"),
        );
        assert(
          (
            await p.locator("[data-edit-key=inst-accreditation]").innerText()
          ).includes("554/SK/BAN-PT/Ak/PT/VIII/2023"),
        );
        assert.deepEqual(
          await p
            .locator("#logoKiriPreview,#logoKananPreview,.logo-slot img")
            .evaluateAll((xs) =>
              xs.map((x) => [x.naturalWidth, x.naturalHeight]),
            ),
          [
            [176, 172],
            [180, 166],
          ],
        );
        const links = p.locator(".letterhead-contact a");
        assert.equal(await links.count(), 2);
        assert.equal(
          await links.nth(0).getAttribute("href"),
          "mailto:akademik@stkipyapisdompu.ac.id",
        );
        assert.equal(
          await links.nth(1).getAttribute("href"),
          "https://www.stkipyapisdompu.ac.id",
        );
        assert(
          await links.evaluateAll((xs) =>
            xs.every((a) => getComputedStyle(a).color === "rgb(0, 0, 238)"),
          ),
        );
        const popup = p.waitForEvent("popup");
        await links.nth(1).click();
        const institution = await popup;
        await institution.waitForURL("https://www.stkipyapisdompu.ac.id/");
        await institution.close();
        await p
          .locator(".sheet-header")
          .screenshot({
            path: path.resolve(
              "tests/results/letterhead/" + page + "-default.png",
            ),
          });
        const contact = p.locator("[data-edit-key=inst-contact]");
        await contact.fill(
          "E-mail: sekretariat@example.ac.id | Website: https://example.ac.id/path",
        );
        await contact.blur();
        await p.waitForFunction(
          () =>
            document
              .querySelector(".letterhead-contact a")
              ?.getAttribute("href") === "mailto:sekretariat@example.ac.id",
        );
        await p.evaluate(() => WAFlush());
        await p.evaluate(() => WA.sync());
        await p.reload();
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        assert.equal(
          await p.locator(".letterhead-contact a").last().getAttribute("href"),
          "https://example.ac.id/path",
        );
        if (page === "absen")
          await p.evaluate(() =>
            hapusLogo("logoKiriPreview", "logoKiriIcon", "btnHapusKiri"),
          );
        else await p.locator("#logoLeftSlot .logo-remove").click();
        await p.evaluate(() => WAFlush());
        await p.evaluate(() => WA.sync());
        await p.reload();
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        assert(
          await p.locator("#logoKiriPreview,#logoLeftSlot img").isHidden(),
          "deleted default logo stays deleted",
        );
        await p.locator("[data-letterhead-reset]").click();
        await p.waitForFunction(
          () =>
            document
              .querySelector(".letterhead-contact a")
              ?.getAttribute("href") ===
            "mailto:akademik@stkipyapisdompu.ac.id",
        );
        await p.evaluate(() => WAFlush());
        await p.evaluate(() => WA.sync());
        await p.reload();
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        assert(
          await p.locator("#logoKiriPreview,#logoLeftSlot img").isVisible(),
        );
        assert.equal(
          await p.locator(".letterhead-contact a").first().getAttribute("href"),
          "mailto:akademik@stkipyapisdompu.ac.id",
        );
      }
    } finally {
      await b.close();
    }
  },
);
