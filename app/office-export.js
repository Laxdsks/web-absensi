/* Native Office files. Libraries are loaded only after an export is requested. */
(() => {
  "use strict";
  if (!document.getElementById("paperSheet")) return;
  const root = new URL("../", document.currentScript?.src || location.href),
    loads = new Map(),
    canvas = document.createElement("canvas"),
    measure = canvas.getContext("2d");
  const skip =
    ".p-screen-only,.page-preview-only,.wa-print-grid,.wa-presence-ink,.sheet-signature-controls,button,input[type=file],.btn-hapus-logo,svg,i.fa-solid,i.fa-regular,i.fa-brands";
  function library(kind) {
    const name = kind === "word" ? "docx" : "ExcelJS",
      file = kind === "word" ? "docx-9.5.1.js" : "exceljs-4.4.0.js";
    if (window[name]) return Promise.resolve(window[name]);
    if (!loads.has(name))
      loads.set(
        name,
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = new URL("app/vendor/office/" + file, root);
          s.onload = () => {
            if (window[name]) resolve(window[name]);
            else {
              loads.delete(name);
              s.remove();
              reject(Error("Pustaka ekspor tidak tersedia"));
            }
          };
          s.onerror = () => {
            s.remove();
            loads.delete(name);
            reject(
              Error(
                "Pustaka ekspor belum dimuat. Periksa koneksi lalu coba lagi.",
              ),
            );
          };
          document.head.append(s);
        }),
      );
    return loads.get(name);
  }
  function color(value) {
    const m = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m
      ? m
          .slice(1)
          .map((n) => (+n).toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase()
      : /^[#][0-9a-f]{6}$/i.test(value)
        ? value.slice(1)
        : "111111";
  }
  function font(el) {
    const s = getComputedStyle(el);
    return {
      size: Math.max(4, parseFloat(s.fontSize) * 0.75 || 8),
      bold: +s.fontWeight >= 600,
      italics: s.fontStyle === "italic",
      underline: s.textDecorationLine.includes("underline"),
      color: color(s.color),
      font: /times/i.test(s.fontFamily) ? "Times New Roman" : "Arial",
    };
  }
  function lines(el) {
    const result = [[]];
    function walk(node) {
      if (node.nodeType === 3) {
        const t = node.textContent.replace(/[\t\r\n]+/g, " ");
        if (t)
          result.at(-1).push({
            text: t,
            ...font(node.parentElement),
            ...(node.parentElement.closest("a[href]")
              ? { href: node.parentElement.closest("a[href]").href }
              : {}),
          });
        return;
      }
      if (node.nodeType !== 1 || node.matches(skip) || node.hidden) return;
      if (node.matches("input,textarea,select")) {
        result.at(-1).push({
          text:
            node.value === "." && node.matches(".attendance-cell")
              ? "•"
              : node.value,
          ...font(node),
        });
        return;
      }
      if (node.tagName === "BR") {
        result.push([]);
        return;
      }
      const block = node !== el && /^(DIV|P)$/.test(node.tagName);
      if (block && result.at(-1).length) result.push([]);
      node.childNodes.forEach(walk);
      if (block && result.at(-1).length) result.push([]);
    }
    walk(el);
    while (result.length > 1 && !result.at(-1).length) result.pop();
    return result.map((r) => ({
      runs: r,
      align: getComputedStyle(el).textAlign === "center" ? "center" : "left",
    }));
  }
  function plain(value, size = 8, bold = false, align = "left") {
    return {
      runs: [
        {
          text: String(value || ""),
          size,
          bold,
          color: "111111",
          font: "Arial",
        },
      ],
      align,
    };
  }
  function textOf(cell) {
    return cell.paragraphs
      .map((p) => p.runs.map((r) => r.text).join(""))
      .join("\n");
  }
  function wrappedLines(value, width) {
    let count = 0;
    for (const part of value.split("\n")) {
      let current = "",
        n = 1;
      for (const word of part.split(/\s+/)) {
        const next = (current ? current + " " : "") + word;
        if (measure.measureText(next).width > width && current) {
          n++;
          current = word;
        } else current = next;
        if (measure.measureText(current).width > width) {
          const pieces = Math.ceil(measure.measureText(current).width / width);
          n += pieces - 1;
          current = "";
        }
      }
      count += n;
    }
    return count;
  }
  function pageSettings(recap) {
    const exam = !!document.getElementById("examTableBlock"),
      size = document.getElementById("paperSize")?.value || "a4",
      orient = recap
        ? "landscape"
        : document.getElementById("paperOrientation")?.value || "portrait";
    let [w, h] = {
      a4: [11906, 16838],
      folio: [12240, 18720],
      letter: [12240, 15840],
    }[size] || [11906, 16838];
    if (orient === "landscape") [w, h] = [h, w];
    const margin = recap
      ? 567
      : exam
        ? 680
        : { wide: 1417, narrow: 340, normal: 454 }[
            document.getElementById("marginTemplate")?.value
          ] || 454;
    return {
      w,
      h,
      margin,
      width: w - 2 * margin,
      orientation: orient,
      paperSize: size === "letter" ? 1 : size === "folio" ? 14 : 9,
    };
  }
  async function picture(el, maxW = 72, maxH = 72) {
    if (
      !el ||
      !el.getAttribute("src") ||
      el.hidden ||
      getComputedStyle(el).display === "none"
    )
      return null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = el.src;
    await new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth) return resolve();
      img.onload = resolve;
      img.onerror = () =>
        reject(
          Error(
            "Logo atau tanda tangan gagal dibaca. Muat ulang gambarnya sebelum ekspor.",
          ),
        );
    });
    const scale = Math.min(
        maxW / img.naturalWidth,
        maxH / img.naturalHeight,
        1,
      ),
      width = Math.max(1, img.naturalWidth * scale),
      height = Math.max(1, img.naturalHeight * scale),
      c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(width * 4));
    c.height = Math.max(1, Math.ceil(height * 4));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const uri = c.toDataURL("image/png");
    return {
      uri,
      width,
      height,
      data: Uint8Array.from(atob(uri.split(",")[1]), (x) => x.charCodeAt(0)),
    };
  }
  function tableModel(table, page, recap = false) {
    const occupied = [],
      rows = [],
      widths = [],
      box = table.getBoundingClientRect();
    let count = 0;
    for (const tr of table.rows) {
      if (tr.matches(".page-preview-only")) continue;
      const row = [],
        y = rows.length;
      occupied[y] ||= [];
      let x = 0;
      for (const el of tr.cells) {
        while (occupied[y][x]) x++;
        const cs = el.colSpan || 1,
          rs = el.rowSpan || 1;
        for (let yy = y; yy < y + rs; yy++) {
          occupied[yy] ||= [];
          for (let xx = x; xx < x + cs; xx++) occupied[yy][xx] = true;
        }
        if (cs === 1)
          widths[x] = el.getBoundingClientRect().width / Math.max(1, box.width);
        const paragraphs = lines(el),
          date = el.matches(".date-entry");
        row.push({
          x,
          cs,
          rs,
          paragraphs,
          date,
          header: tr.parentElement.tagName === "THEAD",
          border: true,
          align:
            el.querySelector(".name-input,.name-value") ||
            el.classList.contains("name")
              ? "left"
              : getComputedStyle(el).textAlign === "left"
                ? "left"
                : "center",
        });
        x += cs;
      }
      count = Math.max(count, x);
      rows.push(row);
    }
    let proportions = recap
      ? [3, 18, 12, 4, 5, 4, 4, 4, 6, 7, 7, 5, 5, 6, 5, 5]
      : widths;
    if (proportions.length !== count || proportions.some((n) => !n))
      proportions = Array(count).fill(1);
    const total = proportions.reduce((a, b) => a + b, 0);
    const twips = proportions.map((n) => Math.floor((n / total) * page.width));
    twips[twips.length - 1] += page.width - twips.reduce((a, b) => a + b, 0);
    for (const row of rows)
      for (const cell of row) {
        const width =
          twips.slice(cell.x, cell.x + cell.cs).reduce((a, b) => a + b, 0) /
            20 -
          3;
        for (const p of cell.paragraphs) {
          p.align = cell.align;
          for (const run of p.runs) {
            if (recap) run.size = Math.min(6.5, run.size);
            if (cell.date) continue;
            measure.font = `${run.bold ? "bold " : ""}${run.size}pt ${run.font}`;
            if (!cell.header) {
              const needed = measure.measureText(run.text).width * 0.75;
              if (needed > width * 0.9)
                run.size = Math.max(4, (run.size * width * 0.9) / needed);
            }
          }
        }
      }
    return { type: "table", widths: twips, rows };
  }
  function layoutTable(cells, widths) {
    return {
      type: "table",
      widths,
      rows: [cells.map((c, x) => ({ x, cs: 1, rs: 1, border: false, ...c }))],
    };
  }
  async function model(recap) {
    window.WAFitSheetText?.();
    const paper = document.getElementById("paperSheet"),
      exam = !!document.getElementById("examTableBlock"),
      page = pageSettings(recap),
      blocks = [],
      header = paper.querySelector(".header-text,#examInstitution");
    const hlines = [...header.children]
      .flatMap((el) =>
        lines(el).map((p) => ({
          ...p,
          align: "center",
          runs: p.runs.map((r) => ({
            ...r,
            ...(recap ? { size: Math.min(r.size, 9) } : {}),
          })),
        })),
      )
      .filter((p) => p.runs.some((r) => r.text.trim()));
    const left = await picture(
        paper.querySelector("#logoKiriPreview,#logoLeftSlot img"),
      ),
      right = await picture(
        paper.querySelector("#logoKananPreview,#logoRightSlot img"),
      );
    blocks.push({
      ...layoutTable(
        [
          { paragraphs: [], images: left ? [left] : [], align: "center" },
          { paragraphs: hlines, align: "center" },
          { paragraphs: [], images: right ? [right] : [], align: "center" },
        ],
        [
          Math.floor(page.width * 0.14),
          page.width - 2 * Math.floor(page.width * 0.14),
          Math.floor(page.width * 0.14),
        ],
      ),
      letterhead: true,
    });
    blocks.push({ type: "paragraph", ...plain("", 2), rule: "double" });
    const title = recap
      ? "REKAP NILAI"
      : exam
        ? paper.querySelector(".sheet-title")?.textContent.trim()
        : "LEMBAR ABSEN";
    const titleParagraph = plain(title, 11, true, "center");
    const titleNode = exam ? paper.querySelector(".sheet-title") : null;
    if (titleNode) titleParagraph.runs[0] = { text: title, ...font(titleNode) };
    blocks.push({ type: "paragraph", ...titleParagraph, title: true });
    const metaColumns = [
      paper.querySelector("#metaLeftBox,#examMetaLeft"),
      paper.querySelector("#metaRightBox,#examMetaRight"),
    ];
    const widths = [];
    for (const col of metaColumns) {
      const bounds = col.getBoundingClientRect(),
        label = col.querySelector(".meta-label").getBoundingClientRect(),
        colon = col
          .querySelector(".meta-row")
          .children[1].getBoundingClientRect();
      const half = Math.floor(page.width / 2),
        lw = Math.max(
          Math.round(half * 0.15),
          Math.min(
            Math.round(half * 0.5),
            Math.round((half * label.width) / Math.max(1, bounds.width)),
          ),
        ),
        cw = Math.max(
          100,
          Math.round((half * colon.width) / Math.max(1, bounds.width)),
        );
      widths.push(lw, cw, half - lw - cw);
    }
    widths[5] += page.width - widths.reduce((a, b) => a + b, 0);
    const metaRows = [],
      count = Math.max(
        ...metaColumns.map((c) => c.querySelectorAll(".meta-row").length),
      );
    for (let row = 0; row < count; row++) {
      const cells = [];
      metaColumns.forEach((col, side) => {
        const item = col.querySelectorAll(".meta-row")[row];
        for (let n = 0; n < 3; n++) {
          const el = item?.children[n];
          cells.push({
            x: side * 3 + n,
            cs: 1,
            rs: 1,
            border: false,
            paragraphs: el
              ? lines(el).map((p) => ({
                  ...p,
                  align: n === 1 ? "center" : "left",
                }))
              : [plain("")],
            align: n === 1 ? "center" : "left",
          });
        }
      });
      metaRows.push(cells);
    }
    blocks.push({ type: "table", widths, rows: metaRows, metadata: true });
    blocks.push(
      tableModel(
        document.querySelector(
          recap
            ? "#tabelRekapNilai"
            : exam
              ? "#examTableBlock table"
              : "#tabelAbsen",
        ),
        page,
        recap,
      ),
    );
    if (recap) {
      blocks.push({
        type: "paragraph",
        ...plain(
          document
            .querySelector(".composition-summary")
            ?.textContent.replace(/\s+/g, " ")
            .trim(),
          8,
        ),
      });
      blocks.push({
        type: "paragraph",
        ...plain(
          "Keterangan: • = hadir; A = alpa; S = sakit; I = izin. Bertanya = 2 poin/kali; kontribusi aktif = 3 poin/kali; diskusi individu = maksimal 25 poin.",
          8,
        ),
      });
    }
    if (exam) {
      const scale = paper.querySelector(".grading-scale table");
      if (scale) {
        const smaller = { ...page, width: Math.floor(page.width * 0.46) },
          t = tableModel(scale, smaller);
        t.right = true;
        blocks.push(t);
      }
    }
    const signatures = [];
    for (const box of recap ? [] : paper.querySelectorAll(".signature-box")) {
      const paragraphs = [],
        images = [];
      for (const child of box.children) {
        if (child.matches(skip)) continue;
        if (child.matches(".signature-space")) {
          const image = await picture(
            child.querySelector(".sheet-signature-image:not([hidden])"),
            190,
            64,
          );
          if (image) images.push(image);
          paragraphs.push({
            runs: [],
            space: Math.max(
              24,
              Math.min(
                72,
                parseFloat(getComputedStyle(child).height) * 0.75 || 54,
              ),
            ),
          });
        } else if (child.classList.contains("signature-details")) {
          const name = child.querySelector(".signature-name"),
            identity = child.querySelector(".signature-identity");
          const width = Math.max(
            25,
            Math.min(
              page.width / 40 - 8,
              parseFloat(getComputedStyle(child).width) * 0.75 || 90,
            ),
          );
          const nameLines = lines(name);
          if (!nameLines[0].runs.length)
            nameLines[0].runs = [
              { text: "", size: 8, font: font(child).font, color: "111111" },
            ];
          paragraphs.push(
            ...nameLines.map((p) => ({
              ...p,
              ruleWidth: width,
              runs: p.runs.map((r) => ({ ...r, size: Math.min(8, r.size) })),
            })),
            ...lines(identity).map((p) => ({
              ...p,
              runs: p.runs.map((r) => ({ ...r, size: Math.min(8, r.size) })),
            })),
          );
        } else
          paragraphs.push(
            ...lines(child).map((p) => ({
              ...p,
              runs: p.runs.map((r) => ({ ...r, size: Math.min(8, r.size) })),
            })),
          );
      }
      signatures.push({ paragraphs, images, signature: true, align: "left" });
    }
    if (signatures.length)
      blocks.push(
        layoutTable(signatures, [
          Math.floor(page.width / 2),
          page.width - Math.floor(page.width / 2),
        ]),
      );
    return { page, blocks, title };
  }
  function imageBytes(uri) {
    return Uint8Array.from(atob(uri.split(",")[1]), (x) => x.charCodeAt(0));
  }
  function dateImage(cell, width, height) {
    const c = document.createElement("canvas"),
      scale = 4;
    c.width = Math.ceil(width * scale);
    c.height = Math.ceil(height * scale);
    const g = c.getContext("2d"),
      r = cell.paragraphs[0]?.runs[0] || { size: 6 },
      value = textOf(cell);
    g.scale(scale, scale);
    g.translate(width / 2, height / 2);
    g.rotate(-Math.PI / 4);
    const max = Math.min(
      r.size || 6,
      Math.max(4, ((width + height) / Math.max(1, value.length)) * 0.85),
    );
    g.font = `${r.italics ? "italic " : ""}${r.bold ? "bold " : ""}${max / 0.75}px ${r.font || "Arial"}`;
    g.fillStyle = "#" + (r.color || "111111");
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(value, 0, 0, (width + height) * 0.68);
    return {
      data: imageBytes(c.toDataURL("image/png")),
      width,
      height,
      alt: "Tanggal pertemuan: " + value,
    };
  }
  async function word(m, D) {
    const none = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" },
      line = { style: D.BorderStyle.SINGLE, size: 4, color: "111111" };
    function paragraph(p, width = m.page.width) {
      return new D.Paragraph({
        alignment: p.align || "left",
        run: {
          size: Math.round(Math.max(2, ...p.runs.map((r) => r.size || 8)) * 2),
          font: p.runs[0]?.font || "Arial",
          snapToGrid: false,
        },
        spacing: {
          before: p.title ? 80 : 0,
          after: p.title ? 60 : p.ruleWidth ? 40 : 0,
          line: p.space
            ? Math.round(p.space * 20)
            : Math.ceil(Math.max(2, ...p.runs.map((r) => r.size || 8)) * 24),
          lineRule: p.space ? D.LineRuleType.EXACT : D.LineRuleType.AT_LEAST,
        },
        ...(p.ruleWidth
          ? {
              indent: {
                right: Math.max(0, width - Math.ceil(p.ruleWidth * 20)),
              },
            }
          : {}),
        ...(p.rule || p.ruleWidth
          ? {
              border: {
                bottom:
                  p.rule === "double"
                    ? {
                        style: D.BorderStyle.DOUBLE,
                        size: 12,
                        color: "111111",
                        space: 2,
                      }
                    : line,
              },
            }
          : {}),
        children: p.runs.map((r) => {
          const run = new D.TextRun({
            ...r,
            snapToGrid: false,
            size: Math.round(r.size * 2),
            underline: r.underline || r.href ? {} : undefined,
          });
          return r.href && /^(https?:|mailto:)/i.test(r.href)
            ? new D.ExternalHyperlink({ link: r.href, children: [run] })
            : run;
        }),
      });
    }
    function image(p) {
      return new D.ImageRun({
        type: "png",
        data: p.data,
        altText: {
          title: p.alt || "Gambar lembar",
          description: p.alt || "Logo atau tanda tangan",
          name: p.alt || "Gambar",
        },
        transformation: { width: p.width, height: p.height },
      });
    }
    const children = [];
    for (const block of m.blocks) {
      if (block.type === "paragraph") {
        children.push(paragraph(block));
        continue;
      }
      const rows = block.rows.map(
        (row) =>
          new D.TableRow({
            tableHeader: row[0]?.header || false,
            cantSplit: true,
            children: row.map((cell) => {
              const width = block.widths
                  .slice(cell.x, cell.x + cell.cs)
                  .reduce((a, b) => a + b, 0),
                borders = Object.fromEntries(
                  ["top", "bottom", "left", "right"].map((s) => [
                    s,
                    cell.border ? line : none,
                  ]),
                );
              let children = cell.paragraphs.map((p) => paragraph(p, width));
              if (cell.date && textOf(cell)) {
                const pic = dateImage(cell, Math.max(10, width / 15 - 2), 26);
                children = [
                  new D.Paragraph({
                    alignment: "center",
                    spacing: { before: 0, after: 0 },
                    children: [image(pic)],
                  }),
                ];
              }
              if (cell.images?.length) {
                const imgs = cell.images.map((p) => ({
                  ...p,
                  width: Math.min(p.width, width / 15 - 4),
                  height: p.height * Math.min(1, (width / 15 - 4) / p.width),
                }));
                const para = new D.Paragraph({
                  alignment: cell.align || "center",
                  spacing: { before: 0, after: 0 },
                  children: imgs.map(image),
                });
                if (cell.signature) {
                  const index = cell.paragraphs.findIndex((p) => p.space);
                  if (index >= 0) children.splice(index, 1, para);
                  else children.push(para);
                } else children.unshift(para);
              }
              return new D.TableCell({
                width: { size: width, type: D.WidthType.DXA },
                columnSpan: cell.cs,
                rowSpan: cell.rs,
                borders,
                margins: {
                  top: m.title === "REKAP NILAI" ? 10 : 20,
                  bottom: m.title === "REKAP NILAI" ? 10 : 20,
                  left: 25,
                  right: 25,
                },
                verticalAlign: D.VerticalAlign.CENTER,
                children: children.length
                  ? children
                  : [new D.Paragraph({ spacing: { after: 0 }, children: [] })],
              });
            }),
          }),
      );
      children.push(
        new D.Table({
          width: {
            size: block.widths.reduce((a, b) => a + b, 0),
            type: D.WidthType.DXA,
          },
          columnWidths: block.widths,
          layout: D.TableLayoutType.FIXED,
          alignment: block.right ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT,
          rows,
          borders: {
            top: none,
            bottom: none,
            left: none,
            right: none,
            insideHorizontal: none,
            insideVertical: none,
          },
        }),
      );
      children.push(
        new D.Paragraph({
          spacing: {
            before: 0,
            after: 0,
            line: 40,
            lineRule: D.LineRuleType.EXACT,
          },
          children: [],
        }),
      );
    }
    return D.Packer.toBlob(
      new D.Document({
        creator: "Presen Go",
        title: m.title,
        styles: {
          default: {
            document: {
              run: { font: "Arial", size: 16 },
              paragraph: { spacing: { before: 0, after: 0 } },
            },
          },
        },
        sections: [
          {
            properties: {
              grid: { type: D.DocumentGridType.DEFAULT, linePitch: 0 },
              page: {
                size: { width: m.page.w, height: m.page.h },
                margin: {
                  top: m.page.margin,
                  bottom: m.page.margin,
                  left: m.page.margin,
                  right: m.page.margin,
                },
              },
            },
            children,
          },
        ],
      }),
    );
  }
  function excelBlocks(blocks) {
    return blocks.map((block) => {
      if (!block.letterhead) return block;
      const [left, middle, right] = block.rows[0],
        paragraphs = middle.paragraphs.length ? middle.paragraphs : [plain("")],
        count = paragraphs.length,
        w = block.widths;
      const rows = paragraphs.map((p, index) => {
        const row = [];
        if (!index) row.push({ ...left, x: 0, rs: count });
        const linked = p.runs.filter((r) => r.href);
        if (linked.length > 1) {
          const parts = [[], []];
          let side = 0;
          for (const run of p.runs) {
            const pipe = side === 0 ? run.text.indexOf("|") : -1;
            if (pipe >= 0) {
              if (pipe)
                parts[0].push({ ...run, text: run.text.slice(0, pipe) });
              side = 1;
              if (pipe + 1 < run.text.length)
                parts[1].push({ ...run, text: run.text.slice(pipe + 1) });
            } else parts[side].push(run);
          }
          if (!parts[1].length) {
            parts[0] = p.runs.slice(0, p.runs.indexOf(linked[1]));
            parts[1] = p.runs.slice(p.runs.indexOf(linked[1]));
          }
          for (let i = 0; i < 2; i++)
            row.push({
              ...middle,
              x: i + 1,
              cs: 1,
              paragraphs: [{ ...p, runs: parts[i] }],
            });
        } else row.push({ ...middle, x: 1, cs: 2, paragraphs: [p] });
        if (!index) row.push({ ...right, x: 3, rs: count });
        return row;
      });
      return {
        ...block,
        widths: [w[0], Math.floor(w[1] / 2), w[1] - Math.floor(w[1] / 2), w[2]],
        rows,
      };
    });
  }
  async function excel(m, E) {
    const book = new E.Workbook();
    book.creator = "Presen Go";
    const ws = book.addWorksheet(m.title.slice(0, 31), {
      pageSetup: {
        paperSize: m.page.paperSize,
        orientation: m.page.orientation,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: m.page.margin / 1440,
          right: m.page.margin / 1440,
          top: m.page.margin / 1440,
          bottom: m.page.margin / 1440,
          header: 0,
          footer: 0,
        },
      },
      views: [{ showGridLines: false }],
    });
    const blocks = excelBlocks(m.blocks),
      main = blocks.find(
        (t) =>
          t.type === "table" &&
          !t.metadata &&
          !t.letterhead &&
          t.rows.length > 1,
      ),
      total = m.page.width;
    const boundaries = new Set([0, total]);
    for (const block of blocks) {
      if (block.type !== "table") continue;
      let x = block.right ? total - block.widths.reduce((a, b) => a + b, 0) : 0;
      boundaries.add(x);
      for (const width of block.widths) {
        x += width;
        boundaries.add(x);
      }
    }
    const bounds = [...boundaries]
        .sort((a, b) => a - b)
        .filter((x, i, all) => !i || x - all[i - 1] >= 15),
      n = bounds.length - 1,
      base = bounds.slice(1).map((x, i) => x - bounds[i]);
    ws.columns = base.map((w) => ({
      width: w / 15 <= 12 ? w / 180 : (w / 15 - 5) / 7,
    }));
    let rowIndex = 1;
    function nearest(value) {
      let best = 0;
      bounds.forEach((b, i) => {
        if (Math.abs(b - value) < Math.abs(bounds[best] - value)) best = i;
      });
      return best;
    }
    function setFont(run) {
      return {
        name: run.font || "Arial",
        size: run.size || 8,
        bold: !!run.bold,
        italic: !!run.italics,
        underline: run.underline || false,
        color: { argb: "FF" + (run.color || "111111") },
      };
    }
    for (const block of blocks) {
      if (block.type === "paragraph") {
        ws.mergeCells(rowIndex, 1, rowIndex, n);
        const cell = ws.getCell(rowIndex, 1);
        cell.value = block.runs.map((r) => r.text).join("");
        cell.font = setFont(block.runs[0] || {});
        cell.alignment = {
          horizontal: block.align || "left",
          vertical: "middle",
          wrapText: true,
        };
        ws.getRow(rowIndex).height = block.runs.length
          ? Math.max(6, ...block.runs.map((r) => r.size || 8)) * 1.6
          : 4;
        if (block.rule)
          cell.border = {
            bottom: { style: "thin", color: { argb: "FF111111" } },
          };
        rowIndex++;
        continue;
      }
      const start = rowIndex,
        blockTotal = block.widths.reduce((a, b) => a + b, 0),
        offset = block.right ? total - blockTotal : 0;
      for (let r = 0; r < block.rows.length; r++) {
        let height = m.page.orientation === "landscape" ? 10 : 13;
        for (const item of block.rows[r]) {
          const left =
              block.widths.slice(0, item.x).reduce((a, b) => a + b, 0) + offset,
            right =
              left +
              block.widths
                .slice(item.x, item.x + item.cs)
                .reduce((a, b) => a + b, 0),
            c1 = nearest(left) + 1,
            c2 = Math.max(c1, Math.min(n, nearest(right))),
            r1 = start + r,
            r2 = r1 + item.rs - 1;
          if (c1 !== c2 || r1 !== r2) ws.mergeCells(r1, c1, r2, c2);
          const cell = ws.getCell(r1, c1),
            value = textOf(item),
            runs = item.paragraphs.flatMap((p, i) => [
              ...(i ? [{ text: "\n", size: 8 }] : []),
              ...p.runs.map((r) =>
                p.ruleWidth ? { ...r, underline: true } : r,
              ),
            ]);
          cell.value = {
            richText: runs.map((run) => ({
              text: run.text,
              font: setFont(run),
            })),
          };
          cell.numFmt = "@";
          cell.font = setFont(runs[0] || {});
          const hrefs = [
            ...new Set(runs.filter((r) => r.href).map((r) => r.href)),
          ];
          if (hrefs.length === 1) {
            cell.value = { text: value, hyperlink: hrefs[0] };
            cell.font = {
              ...setFont(runs.find((r) => r.href)),
              underline: true,
            };
          }
          cell.alignment = {
            horizontal: item.align || "left",
            vertical: "middle",
            wrapText: !block.metadata || item.x % 3 === 2,
            shrinkToFit: !item.header,
          };
          if (item.date && value) {
            cell.value = value.replaceAll("/", "/\n");
            cell.font = {
              ...setFont(runs[0] || {}),
              size: Math.min(6, runs[0]?.size || 6),
            };
            cell.note = "Tanggal pertemuan: " + value;
          }
          if (item.border) {
            const edge = { style: "thin", color: { argb: "FF111111" } };
            cell.border = { top: edge, bottom: edge, left: edge, right: edge };
          }
          const size = Math.max(6, ...runs.map((x) => x.size || 8)),
            width = (right - left) / 15;
          measure.font = `${size}pt Arial`;
          const approx = Math.max(
            item.paragraphs.length,
            wrappedLines(value, Math.max(10, width - 8)),
          );
          height = Math.max(
            height,
            Math.min(120, (item.date ? 3 : approx) * size * 1.15 + 2),
            item.date ? 25 : 0,
          );
          if (item.paragraphs.some((p) => p.space))
            height = Math.max(
              height,
              item.paragraphs.reduce((s, p) => s + (p.space || size * 1.3), 0),
            );
          for (const pic of item.images || []) {
            const id = book.addImage({ buffer: pic.data, extension: "png" }),
              areaWidth = (bounds[c2] - bounds[c1 - 1]) / 15,
              factor = Math.min(1, (areaWidth - 8) / pic.width);
            ws.addImage(id, {
              tl: {
                nativeCol: c1 - 1,
                nativeColOff: 4 * 9525,
                nativeRow: r1 - 1,
                nativeRowOff: Math.round(
                  (item.signature
                    ? Math.max(
                        16,
                        item.paragraphs
                          .slice(
                            0,
                            item.paragraphs.findIndex((p) => p.space),
                          )
                          .reduce(
                            (sum, p) =>
                              sum +
                              Math.max(6, ...p.runs.map((r) => r.size || 8)) *
                                1.3,
                            0,
                          ),
                      ) + 3
                    : 3) * 12700,
                ),
              },
              ext: { width: pic.width * factor, height: pic.height * factor },
              editAs: "oneCell",
            });
            height = Math.max(
              height,
              (pic.height * factor * 0.75) / Math.max(1, item.rs) +
                (item.signature ? size * 5 : 6),
            );
          }
        }
        ws.getRow(start + r).height = height;
      }
      rowIndex += block.rows.length + 1;
    }
    ws.pageSetup.fitToHeight = main.rows.length <= 45 ? 1 : 0;
    ws.pageSetup.printArea = `A1:${ws.getColumn(n).letter}${rowIndex - 1}`;
    return new Blob([await book.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  let busy = false;
  async function exportFile(kind, recap = false) {
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll("[onclick]")].filter((b) =>
        /exportWord|exportExcel|eksporWord|eksporExcel/.test(
          b.getAttribute("onclick"),
        ),
      ),
      previous = buttons.map((b) => b.disabled);
    buttons.forEach((b) => (b.disabled = true));
    try {
      const lib = await library(kind),
        m = await model(recap),
        blob = kind === "word" ? await word(m, lib) : await excel(m, lib),
        ctx = new URLSearchParams(location.search),
        name =
          m.title.replace(/[^a-z0-9]+/gi, "_") +
          "_Kelas_" +
          (ctx.get("kelas") || "A") +
          "_Semester_" +
          (ctx.get("semester") || "1") +
          (kind === "word" ? ".docx" : ".xlsx");
      const link = document.createElement("a"),
        url = URL.createObjectURL(blob);
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { name, blob };
    } catch (error) {
      console.error("Office export failed", error);
      alert("Ekspor belum berhasil: " + error.message);
      return null;
    } finally {
      buttons.forEach((b, i) => (b.disabled = previous[i]));
      busy = false;
    }
  }
  window.PresenOffice = { exportFile };
  window.exportWord = () => exportFile("word");
  window.exportExcel = () => exportFile("excel");
  window.exportWordRekap = () => exportFile("word", true);
  window.exportExcelRekap = () => exportFile("excel", true);
  window.eksporWordUjian = () => exportFile("word");
  window.eksporExcelUjian = () => exportFile("excel");
})();
