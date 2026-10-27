const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  JSZip = require("jszip"),
  ExcelJS = require("exceljs");
const {
  chromium,
} = require("/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core");
const BASE = process.env.WA_TEST_URL || "http://127.0.0.1:8012/";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname))
  throw Error("Local export fixtures only");
test(
  "six native Office exports embed logos, preserve text and borders, constrain page widths and retain editable cells",
  { timeout: 120000 },
  async () => {
    const b = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    try {
      const c = await b.newContext({ acceptDownloads: true }),
        p = await c.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await c.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(BASE).origin
          ? r.continue()
          : r.abort(),
      );
      await p.goto(BASE);
      await p.waitForFunction(() => window.WA);
      await p.evaluate(
        (password) => WA.login("teacher", { username: "M.Fadillah", password }),
        fs.readFileSync("index.php", "utf8").match(/\$pass === '([^']+)'/)[1],
      );
      const ctx = {
          prodi: "Pendidikan Teknologi Informasi",
          semester: "6",
          kelas: "F",
          year: "2037/2038",
          period: "Genap",
        },
        course = "Office Export " + Date.now(),
        nim = "000123456789";
      await p.evaluate(
        async ({ ctx, nim }) => {
          await WA.deleteStudents(
            ctx,
            (await WA.get()).snapshot.roster.filter((r) => WA.sameCtx(r, ctx)),
          );
          await WA.sync();
          for (let n = 0; n < 35; n++)
            await WA.queue({
              type: "student-upsert",
              ctx,
              nim: n ? nim + n : nim,
              nama: "MAHASISWA EKSPOR " + n + " NAMA LENGKAP",
              jk: "L",
            });
          for (let i = 0; i < 10; i++) {
            await WA.sync();
            if (!(await WA.get()).outbox.length) break;
          }
        },
        { ctx, nim },
      );
      const out = path.resolve("tests/results/office-export");
      fs.mkdirSync(out, { recursive: true });
      const fixtures = [];
      let attendanceNumberWidth = 0;
      for (const page of ["absen", "ujian"]) {
        await p.goto(
          BASE +
            page +
            ".php?" +
            new URLSearchParams({ ...ctx, matkul: course }),
        );
        await p.waitForFunction(
          () => document.documentElement.dataset.teacherPageState === "ready",
        );
        if (page === "ujian") {
          await p.reload();
          await p.waitForFunction(() => document.documentElement.dataset.teacherPageState === "ready");
          assert(await p.locator('#examTableBlock tbody tr:not(.page-preview-only)>td:first-child').evaluateAll(cells => cells.every(c => getComputedStyle(c).textAlign === 'center')), 'rehydrated exam numbering stays centered');
        }
        assert.equal(
          await p.locator('script[src*="vendor/office/"]').count(),
          0,
          "large Office libraries stay out of startup",
        );
        await p.evaluate(() => {
          const src = (w, h, color) => {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const g = c.getContext("2d");
            g.fillStyle = color;
            g.fillRect(0, 0, w, h);
            return c.toDataURL();
          };
          const left = document.querySelector(
              "#logoKiriPreview,#logoLeftSlot img",
            ),
            right = document.querySelector(
              "#logoKananPreview,#logoRightSlot img",
            );
          for (const [img, w, h, color] of [
            [left, 80, 120, "#0077cc"],
            [right, 160, 80, "#00aa66"],
          ]) {
            img.src = src(w, h, color);
            img.hidden = false;
            img.style.display = "block";
          }
          const slot = document.querySelector(".signature-space");
          const sign = document.createElement("img");
          sign.src = src(160, 50, "#111111");
          sign.className = "sheet-signature-image";
          sign.hidden = false;
          slot.append(sign);
          if (window.WASetMeetingDate)
            for (let n = 1; n <= 8; n++)
              WASetMeetingDate({ slot: n, day: "2026-10-26" });
          const att = document.querySelector(".attendance-cell");
          if (att) {
            att.value = ".";
            att.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const input = document.querySelector("#fontSizeSelect,#examFontSize");
          input.value = "7.5";
          WAFitSheetText();
        });
        await p.waitForTimeout(100);
        if (page === "absen") attendanceNumberWidth = await p.locator('#tabelAbsen tbody tr:first-child td:first-child').evaluate(el => el.getBoundingClientRect().width);
        if (page === "ujian") {
          for (const media of ["screen", "print"]) {
            await p.emulateMedia({ media });
            await p.evaluate(() => WAFitSheetText());
            const numbering = await p.locator('#examTableBlock tbody tr:not(.page-preview-only)').evaluateAll(rows => rows.map(row => ({center: getComputedStyle(row.cells[0]).textAlign === 'center', width: row.cells[0].getBoundingClientRect().width, table: row.closest('table').getBoundingClientRect().width})));
            assert.equal(numbering.length, 35);
            assert(numbering.every(n => n.center && n.width < n.table * .055 && n.width <= attendanceNumberWidth + 4), 'exam numbers remain centered and compact like attendance in ' + media);
          }
          await p.emulateMedia({ media: "screen" });

        }
        for (const recap of page === "absen" ? [false, true] : [false]) {
          if (recap) {
            await p.setViewportSize({ width: 393, height: 852 });
            await p.evaluate(() => bukaRekapNilai());
            await p.waitForFunction(() =>
              document.querySelector("#tbodyRekapNilai tr .score-input"),
            );
            await p.evaluate(() => {
              const fields = document.querySelectorAll(
                "#tbodyRekapNilai tr:first-child .score-input",
              );
              [4, 5, 25, 80, 90].forEach(
                (x, i) => (fields[i].value = String(x)),
              );
              hitungSkorBaris(fields[0]);
            });
          }
          for (const kind of ["word", "excel"]) {
            const d = p.waitForEvent("download");
            const result = await p.evaluate(
              async ({ kind, recap }) => {
                const name = document.getElementById("examTableBlock")
                  ? kind === "word"
                    ? "eksporWordUjian"
                    : "eksporExcelUjian"
                  : (kind === "word" ? "exportWord" : "exportExcel") +
                    (recap ? "Rekap" : "");
                const result = await window[name]();
                return result
                  ? { name: result.name, size: result.blob.size }
                  : null;
              },
              { kind, recap },
            );
            assert(result, "export should finish");
            const download = await d,
              file = path.join(
                out,
                (recap ? "recap" : page) +
                  (kind === "word" ? ".docx" : ".xlsx"),
              );
            await download.saveAs(file);
            const bytes = fs.readFileSync(file);
            assert.equal(
              bytes.subarray(0, 2).toString(),
              "PK",
              "real OOXML package",
            );
            const zip = await JSZip.loadAsync(bytes),
              media = Object.keys(zip.files).filter((x) =>
                /^(word|xl)\/media\/[^/]+$/.test(x),
              );
            assert(
              media.length >= (recap ? 2 : 3),
              "logos and signature embedded",
            );
            const relationships = await zip
              .file(
                kind === "word"
                  ? "word/_rels/document.xml.rels"
                  : "xl/_rels/workbook.xml.rels",
              )
              .async("string");
            assert(
              ![...relationships.matchAll(/<Relationship\b[^>]*>/g)].some(
                (m) =>
                  m[0].includes('/image"') &&
                  m[0].includes('TargetMode="External"'),
              ),
              "all images are embedded",
            );
            if (kind === "word") {
              const xml = await zip.file("word/document.xml").async("string");
              assert(xml.includes(nim), "leading-zero NIM retained");
              assert(xml.includes("MAHASISWA EKSPOR 34 NAMA LENGKAP"));
              assert(xml.includes("KET") || recap);
              assert(xml.includes("STKIP"));
              assert(
                relationships.includes("mailto:akademik@stkipyapisdompu.ac.id"),
              );
              assert(
                relationships.includes("https://www.stkipyapisdompu.ac.id"),
              );
              assert(
                xml.includes('w:lineRule="atLeast"'),
                "body text uses normal line spacing",
              );
              assert(xml.includes('w:lineRule="atLeast"'));
              assert(xml.includes('w:val="double"'));
              if (page === "ujian") {
                const table = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map(m => m[0]).find(t => t.includes('NIM') && t.includes(nim));
                const rows = [...table.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].slice(1);
                assert.equal(rows.length, 35);
                assert(rows.every(row => row[0].match(/<w:tc\b[\s\S]*?<\/w:tc>/)?.[0].includes('w:val="center"')), 'Word numbering is centered');
                const cols = [...table.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(m => +m[1]);
                assert(cols[0] / cols.reduce((a,b) => a+b,0) < .055, 'Word number column stays compact');
              }
              if (page === "absen" && !recap) {
                assert(xml.includes("•"));
                assert(xml.includes("Tanggal pertemuan: 26/10/26"));
              }
              const pageWidth = +xml.match(/<w:pgSz[^>]*w:w="(\d+)"/)[1],
                margin = +xml.match(/<w:pgMar[^>]*w:left="(\d+)"/)[1];
              for (const grid of xml.matchAll(
                /<w:tblGrid>(.*?)<\/w:tblGrid>/g,
              )) {
                const width = [...grid[1].matchAll(/w:w="(\d+)"/g)].reduce(
                  (n, m) => n + +m[1],
                  0,
                );
                assert(
                  width <= pageWidth - 2 * margin,
                  "table fits paper content width",
                );
              }
              assert(xml.includes('w:val="single"'));
              fixtures.push({ file, pageWidth, margin, media: media.length });
            } else {
              const wb = new ExcelJS.Workbook();
              await wb.xlsx.load(bytes);
              const ws = wb.worksheets[0];
              assert.equal(ws.pageSetup.fitToWidth, 1);
              assert.equal(ws.pageSetup.fitToHeight, 1);
              assert.equal(
                ws.pageSetup.orientation,
                recap ? "landscape" : "portrait",
              );
              const values = [];
              ws.eachRow((row) =>
                row.eachCell((cell) => values.push(cell.text)),
              );
              assert(values.some((v) => v.includes(nim)));
              if (page === "ujian") {
                let checked = 0;
                ws.eachRow(row => { let student = false; row.eachCell(cell => { if (cell.text.startsWith(nim)) student = true; }); if (student) { assert.equal(row.getCell(1).alignment.horizontal, 'center'); checked++; } });
                assert.equal(checked, 35, 'Excel numbering is centered for every student');
              }
              assert(
                values.some((v) =>
                  v.includes("MAHASISWA EKSPOR 34 NAMA LENGKAP"),
                ),
              );
              assert(ws.getImages().length >= 2);
              if (!recap) {
                const signature = ws.getImages().at(-1),
                  row = ws.getRow(signature.range.tl.nativeRow + 1),
                  labels = [];
                row.eachCell((cell) => labels.push(cell.text));
                assert(
                  labels.every((text) => !text.trim()),
                  "signature image occupies an empty row, separate from headings and names",
                );
              }
              let borders = 0;
              ws.eachRow((row) =>
                row.eachCell((cell) => {
                  if (cell.border?.bottom?.style === "thin") borders++;
                }),
              );
              assert(borders > 100);
              assert(ws.pageSetup.printArea);
              if (page === "absen" && !recap)
                assert(
                  values.some((v) =>
                    v.replaceAll("\n", "").includes("26/10/26"),
                  ),
                );
              fixtures.push({
                file,
                media: media.length,
                borders,
                images: ws.getImages().length,
              });
            }
          }
        }
      }
      assert.deepEqual(errors, []);
      fs.writeFileSync(
        path.join(out, "report.json"),
        JSON.stringify(fixtures, null, 2),
      );
    } finally {
      await b.close();
    }
  },
);
