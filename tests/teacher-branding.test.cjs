const { PNG } = require("pngjs");
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
const {
  chromium,
} = require("/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core");
const BASE = process.env.WA_TEST_URL || "http://127.0.0.1:8012/";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname))
  throw Error("Local branding fixtures only");
test(
  "phone crop/name settings persist across devices, only the owner sees jobs, and verified results replace all sharing links",
  { timeout: 90000 },
  async () => {
    const php = "/workspace/cloud-web-absensi/bin/php",
      dir = "/workspace/work/122-test-project";
    execFileSync(php, [
      "-d",
      "mysqli.default_socket=/workspace/cloud-web-absensi/database/mysql.sock",
      "-r",
      `chdir('${dir}');require 'app_core.php';require 'app_branding.php';wa_brand_schema();wa_query('DELETE FROM wa_brand_jobs WHERE owner_id=?',['admin_01']);wa_query('DELETE FROM wa_meta WHERE k IN (?,?)',[wa_brand_key('admin_01'),wa_brand_key('admin_01','brandkey:')]);`,
    ]);
    const key = fs
      .readFileSync(dir + "/.wa_brand_worker.php", "utf8")
      .match(/'([a-f0-9]{64})'/)[1];
    const browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    try {
      const device = async () => {
        const c = await browser.newContext({
          viewport: { width: 393, height: 852 },
          hasTouch: true,
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
          (password) =>
            WA.login("teacher", { username: "M.Fadillah", password }),
          fs.readFileSync("index.php", "utf8").match(/\$pass === '([^']+)'/)[1],
        );
        await p.reload();
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        return p;
      };
      const p = await device();
      await p.locator("[data-brand-editor]").click();
      await p.locator(".teacher-brand-dialog").waitFor();
      await p.locator("[name=brandName]").fill('Absen Kampus & "Uji"');
      const artwork = new PNG({ width: 160, height: 80 });
      for (let n = 0; n < artwork.data.length; n += 4) {
        artwork.data[n] = 12;
        artwork.data[n + 1] = 150;
        artwork.data[n + 2] = 80;
        artwork.data[n + 3] = 255;
      }
      await p
        .locator("[data-brand-file]")
        .setInputFiles({
          name: "campus-logo.png",
          mimeType: "image/png",
          buffer: PNG.sync.write(artwork),
        });
      await p.waitForFunction(() =>
        document
          .querySelector("[data-brand-status]")
          .textContent.includes("Logo dimuat"),
      );
      await p.locator("[name=brandShape]").selectOption("circle");
      await p.locator("[name=brandScale]").fill("1.3");
      const c = p.locator(".teacher-brand-preview canvas");
      await c.scrollIntoViewIfNeeded();
      const r = await c.boundingBox();
      await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await p.mouse.down();
      await p.mouse.move(r.x + r.width / 2 + 20, r.y + r.height / 2 - 10);
      await p.mouse.up();
      assert(+(await p.locator("[name=brandX]").inputValue()) > 0);
      const footer = await p.locator(".teacher-brand-footer").boundingBox();
      assert(
        footer.x >= 0 && footer.y + footer.height <= 852,
        "save/share controls fit the phone viewport",
      );
      await p.locator("[data-brand-save]").click();
      await p.waitForFunction(() =>
        document
          .querySelector("[data-brand-status]")
          .textContent.includes("antre"),
      );
      const state = await p.evaluate(() => WA.api("brand-read"));
      assert.equal(state.branding.config.name, 'Absen Kampus & "Uji"');
      assert.equal(state.branding.config.shape, "circle");
      assert.equal(state.branding.config.scale, 1.3);
      const cropped = PNG.sync.read(
        Buffer.from(state.branding.config.icon.split(",")[1], "base64"),
      );
      assert.deepEqual(
        [
          ...cropped.data.subarray(
            (256 * 512 + 256) * 4,
            (256 * 512 + 256) * 4 + 4,
          ),
        ],
        [12, 150, 80, 255],
      );
      assert.equal(
        cropped.data[3],
        0,
        "circle crop is baked into the PNG transparency",
      );
      const shots = require("node:path").resolve("tests/results/branding");
      fs.mkdirSync(shots, { recursive: true });
      await p
        .locator(".teacher-brand-dialog")
        .screenshot({ path: shots + "/phone-editor.png" });
      assert(!JSON.stringify(state).includes("lease_hash"));
      assert(!JSON.stringify(state).includes("signingEnvelope"));
      assert(!JSON.stringify(state).includes(key));
      assert.equal(
        await p.locator("[data-apk-download]").getAttribute("href"),
        null,
        "do not share the wrong APK while the custom one is queued",
      );
      const worker = async (operation, extra = {}, valid = true) => {
        const body = JSON.stringify({
            action: "brand-worker",
            operation,
            ...extra,
          }),
          at = String(Math.floor(Date.now() / 1000)),
          signature = crypto
            .createHmac("sha256", valid ? key : "wrong")
            .update(at + "." + body)
            .digest("hex");
        const response = await p.request.post(BASE + "app_api.php", {
          data: body,
          headers: {
            "Content-Type": "application/json",
            "X-App-Request": "1",
            "X-Brand-Time": at,
            "X-Brand-Signature": signature,
          },
        });
        return response.json();
      };
      assert.equal((await worker("claim", {}, false)).status, "error");
      const job = (await worker("claim")).job;
      assert.equal(job.id, state.branding.job.id);
      assert.equal(
        (await worker("claim")).job,
        null,
        "a leased job cannot be claimed twice",
      );
      const fail = await p.evaluate(async (config) => {
        try {
          await WA.api("brand-save", { baseRevision: 1, config });
          return false;
        } catch (e) {
          return e.message;
        }
      }, state.branding.config);
      assert.match(fail, /masih diproses/);
      await worker("key", {
        id: job.id,
        lease: job.lease,
        envelope: Buffer.from("encrypted-key-fixture").toString("base64"),
      });
      const read = await p.evaluate(() => WA.api("brand-read"));
      assert(!JSON.stringify(read).includes("encrypted-key-fixture"));
      const publicKey = crypto
        .generateKeyPairSync("ec", { namedCurve: "prime256v1" })
        .publicKey.export({ type: "spki", format: "der" })
        .toString("base64url");
      const token = execFileSync(
        php,
        [
          "-d",
          "mysqli.default_socket=/workspace/cloud-web-absensi/database/mysql.sock",
          "-r",
          `chdir('${dir}');require 'app_core.php';$x=wa_issue_device('dosen_01','teacher',$argv[1]);echo $x['token'];`,
          publicKey,
        ],
        { encoding: "utf8" },
      );
      const other = await p.request.post(BASE + "app_api.php", {
        data: { action: "brand-read" },
        headers: { "X-App-Request": "1", Authorization: "Bearer " + token },
      });
      const isolated = await other.json();
      assert.equal(
        isolated.branding.config,
        null,
        "another teacher cannot read this account logo or build job",
      );
      const url =
        "https://github.com/Laxdsks/web-absensi/releases/download/presen-brand-" +
        job.id +
        "/Presen-Student.apk";
      assert.equal(
        (
          await worker("complete", {
            id: job.id,
            lease: job.lease,
            url,
            sha256: "a".repeat(64),
            certificate: "b".repeat(64),
          })
        ).status,
        "success",
      );
      await p.locator(".teacher-brand-heading button").click();
      await p.locator("[data-brand-editor]").click();
      await p.waitForFunction(
        () =>
          !!document
            .querySelector("[data-brand-download]")
            .getAttribute("href"),
      );
      assert.equal(
        await p.locator("[data-brand-download]").getAttribute("href"),
        url,
      );
      assert.equal(
        await p.locator("[data-apk-download]").getAttribute("href"),
        url,
      );
      assert(
        (await p.locator("[data-app-whatsapp]").getAttribute("href")).includes(
          encodeURIComponent(url),
        ),
      );
      assert(
        (await p.locator("#studentAppTitle").innerText()).includes(
          'Absen Kampus & "Uji"',
        ),
      );
      const second = await device();
      await second.locator("[data-brand-editor]").click();
      await second.locator(".teacher-brand-dialog").waitFor();
      assert.equal(
        await second.locator("[name=brandName]").inputValue(),
        'Absen Kampus & "Uji"',
      );
      assert.equal(
        await second.locator("[name=brandShape]").inputValue(),
        "circle",
      );
      assert.equal(
        await second.locator("[name=brandScale]").inputValue(),
        "1.3",
      );
      assert.equal(
        await second.locator("[data-apk-download]").getAttribute("href"),
        url,
      );
      await second.context().setOffline(true);
      await second.evaluate(() => WA.change((s) => ({ ...s, profile: null })));
      await second.waitForFunction(
        () => !document.querySelector(".teacher-brand-dialog"),
      );
      assert.equal(
        await second.locator("#studentAppTitle").innerText(),
        "Unduh & bagikan Presen Go",
        "account data clears immediately even offline",
      );
    } finally {
      await browser.close();
    }
  },
);
