const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process"),
  JSZip = require("jszip");
const {
  chromium,
} = require("/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core");
const BASE = process.env.WA_TEST_URL || "http://127.0.0.1:8012/";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname))
  throw Error("Local migration fixtures only");
const php = "/workspace/cloud-web-absensi/bin/php",
  dir = "/workspace/work/122-test-project";
function run(code, args = []) {
  return execFileSync(
    php,
    [
      "-d",
      "mysqli.default_socket=/workspace/cloud-web-absensi/database/mysql.sock",
      "-r",
      "chdir('" + dir + "');require 'app_core.php';" + code,
      ...args,
    ],
    { encoding: "utf8" },
  );
}
test(
  "stored blank and legacy logos upgrade without a reset button, legacy browser preferences cannot override them, and future custom/delete choices persist",
  { timeout: 120000 },
  async () => {
    const b = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    try {
      const c = await b.newContext({
        acceptDownloads: true,
        viewport: { width: 1400, height: 1000 },
      });
      await c.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(BASE).origin
          ? r.continue()
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
          semester: "8",
          kelas: "E",
          year: "2039/2040",
          period: "Genap",
          owner: "admin_01",
        },
        course = "Stored logos " + Date.now(),
        url = (page) =>
          BASE +
          page +
          ".php?" +
          new URLSearchParams({ ...ctx, matkul: course });
      await p.goto(url("ujian"));
      await p.waitForFunction(
        () => document.documentElement.dataset.teacherPageState === "ready",
      );
      const storage = await p.evaluate(() => storageKey),
        oldImage =
          "data:image/png;base64," +
          fs.readFileSync("app/icon-192.png").toString("base64");
      const legacy = {
        logos: { logoLeftSlot: oldImage, logoRightSlot: oldImage },
        text: {
          "inst-1": "STKIP YAPIS DOMPU",
          "inst-2": "SEKOLAH TINGGI KEGURUAN DAN ILMU PENDIDIKAN",
          "inst-3": "YAYASAN PENDIDIKAN ISLAM",
        },
        blankCourseVersion: 1,
        blankExamFieldsVersion: 2,
      };
      for (const kind of ["attendance-sheet", "exam-sheet"]) {
        const raw = {
          logos:
            kind === "attendance-sheet"
              ? { logoKiriPreview: null, logoKananPreview: null }
              : { logoLeftSlot: null, logoRightSlot: oldImage },
          text: {
            '[data-edit-key="inst-1"]': "STKIP YAPIS DOMPU",
            '[data-edit-key="inst-2"]':
              "SEKOLAH TINGGI KEGURUAN DAN ILMU PENDIDIKAN",
            '[data-edit-key="inst-3"]': "YAYASAN PENDIDIKAN ISLAM",
          },
          storage:
            kind === "exam-sheet" ? { [storage]: JSON.stringify(legacy) } : {},
          ket: { KEEP: "Izin" },
          sentinel: "PRESERVE OTHER CONTENT",
        };
        run(
          "$d=json_decode($argv[1],true);$GLOBALS['wa_request_owner']='admin_01';wa_query('INSERT INTO wa_documents(scope,kind,ctx,matkul,content,revision,updated_at,owner_id) VALUES(?,?,?,?,?,7,?,?) ON DUPLICATE KEY UPDATE content=VALUES(content),revision=7',[wa_scope($d['ctx'],$d['course']),$d['kind'],wa_json(wa_ctx($d['ctx'])),$d['course'],wa_json($d['raw']),wa_now(),'admin_01']);",
          [JSON.stringify({ ctx, course, kind, raw })],
        );
      }
      await p.evaluate(() => WA.sync());
      const snapshot = await p.evaluate(() => WA.api("snapshot"));
      for (const kind of ["attendance-sheet", "exam-sheet"]) {
        const doc = snapshot.snapshot.documents.find(
          (d) => d.kind === kind && d.matkul === course,
        );
        assert.equal(doc.content.letterheadLogoVersion, 1);
        assert.equal(
          doc.revision,
          7,
          "read upgrade does not create revision conflicts",
        );
        assert.equal(doc.content.sentinel, "PRESERVE OTHER CONTENT");
        assert.equal(doc.content.ket.KEEP, "Izin");
      }
      const stored = JSON.parse(
        run(
          "$d=json_decode($argv[1],true);$GLOBALS['wa_request_owner']='admin_01';echo wa_json(wa_one('SELECT content,revision FROM wa_documents WHERE scope=? AND kind=?',[wa_scope($d['ctx'],$d['course']),'attendance-sheet']));",
          [JSON.stringify({ ctx, course })],
        ),
      );
      assert.equal(
        JSON.parse(stored.content).logos.logoKiriPreview,
        null,
        "snapshot reads do not rewrite stored records",
      );
      assert.equal(stored.revision, 7);
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
          ].every(
            (i) =>
              !i.hidden &&
              getComputedStyle(i).display !== "none" &&
              i.naturalWidth,
          ),
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
        assert.equal(
          await p.locator("[data-edit-key=inst-1]").innerText(),
          "YAYASAN PENDIDIKAN ISLAM",
        );
        assert.equal(
          await p.locator("[data-edit-key=inst-3]").innerText(),
          "(STKIP) YAPIS DOMPU",
        );
        const check = await p.evaluate(() => ({
          offline: PresenLetterhead.upgradeContent(
            { logos: { logoKiriPreview: null } },
            "absen",
            "admin_01",
          ),
          later: PresenLetterhead.upgradeContent(
            { letterheadLogoVersion: 1, logos: { logoKiriPreview: null } },
            "absen",
            "admin_01",
          ),
          other: PresenLetterhead.upgradeContent(
            { logos: { logoKiriPreview: null } },
            "absen",
            "dosen_01",
          ),
        }));
        assert.equal(check.offline.logos.logoKiriPreview, "letterhead:left");
        assert.equal(check.later.logos.logoKiriPreview, null);
        assert.equal(check.other.logos.logoKiriPreview, null);
        const download = p.waitForEvent("download");
        await p.evaluate(() => PresenOffice.exportFile("word"));
        const file = await download;
        const zip = await JSZip.loadAsync(fs.readFileSync(await file.path()));
        assert.equal(
          Object.keys(zip.files).filter((n) => /^word\/media\/[^/]+$/.test(n))
            .length,
          2,
          "both official logos enter Word",
        );
        const input =
          page === "absen"
            ? "#logoLeftWrapper input[type=file]"
            : "#logoLeftSlot input[type=file]";
        await p
          .locator(input)
          .setInputFiles({
            name: "custom.png",
            mimeType: "image/png",
            buffer: fs.readFileSync("app/icon-192.png"),
          });
        await p.waitForFunction(
          () =>
            document.querySelector("#logoKiriPreview,#logoLeftSlot img")
              .naturalWidth === 192,
        );
        await p.evaluate(() => WAFlush());
        await p.evaluate(() => WA.sync());
        await p.reload();
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        await p.waitForFunction(
          () =>
            document.querySelector("#logoKiriPreview,#logoLeftSlot img")
              .naturalWidth === 192,
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
          "a later deliberate deletion is respected",
        );
      }
    } finally {
      await b.close();
    }
  },
);
