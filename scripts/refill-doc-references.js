#!/usr/bin/env node
/*
  scripts/refill-doc-references.js

  Re-extracts `documents.doc_reference` for docs that currently have a known-bad or
  blank value. Uses cached OCR from `doc_metadata.dm_ocr_content` + a relaxed
  gpt-4o-mini prompt (see app/helpers/openai.refill.helper.js).

  Flags:
    --target=BAD_REF     process docs whose doc_reference equals BAD_REFERENCE (default)
    --target=BLANK       process docs whose doc_reference is NULL or empty
    --target=CUSTOM      use the WHERE clause in the CUSTOM_WHERE env var
    --dry-run            extract + log, do NOT update the DB
    --limit=N            process at most N docs
    --start-after=ID     resume after a given doc_id
    --sleep-ms=N         milliseconds between OpenAI calls (default 200)
*/

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../app/helpers/database.helper.js");
const { processOpenAIRefill } = require("../app/helpers/openai.refill.helper.js");

const BAD_REFERENCE = "IRCON/1039/HRBP(CRSP)/1/2022/1039/1471";

const args = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith("--"))
        .map((a) => {
            const [k, v = "true"] = a.replace(/^--/, "").split("=");
            return [k, v];
        })
);

const TARGET = (args.target || "BAD_REF").toUpperCase();
const DRY_RUN = args["dry-run"] === "true";
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const START_AFTER = args["start-after"] ? parseInt(args["start-after"], 10) : null;
const SLEEP_MS = args["sleep-ms"] ? parseInt(args["sleep-ms"], 10) : 200;

const LOG_PATH = path.join(__dirname, "refill-references-log.csv");

function buildSelectionSql() {
    let where;
    if (TARGET === "BAD_REF") {
        where = `d.doc_reference = $1`;
    } else if (TARGET === "BLANK") {
        where = `(d.doc_reference IS NULL OR TRIM(d.doc_reference) = '')`;
    } else if (TARGET === "CUSTOM") {
        if (!process.env.CUSTOM_WHERE) {
            throw new Error("--target=CUSTOM requires CUSTOM_WHERE env var");
        }
        where = process.env.CUSTOM_WHERE;
    } else {
        throw new Error(`Unknown --target=${TARGET}`);
    }

    const startClause = START_AFTER ? `AND d.doc_id > ${START_AFTER}` : "";
    const limitClause = LIMIT ? `LIMIT ${LIMIT}` : "";

    return `
        SELECT d.doc_id, d.doc_number, d.doc_reference AS old_ref, m.dm_ocr_content
        FROM   documents d
        JOIN   doc_metadata m ON m.dm_id = d.doc_number
        WHERE  ${where}
          ${startClause}
          AND LENGTH(COALESCE(m.dm_ocr_content,'')) > 50
        ORDER  BY d.doc_id
        ${limitClause}
    `;
}

function csvEscape(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function appendLog(row) {
    const line = [
        new Date().toISOString(),
        row.doc_id,
        row.doc_number,
        row.old_ref,
        row.new_ref,
        row.status,
        row.error,
    ]
        .map(csvEscape)
        .join(",");
    fs.appendFileSync(LOG_PATH, line + "\n");
}

function ensureLogHeader() {
    if (!fs.existsSync(LOG_PATH)) {
        fs.writeFileSync(
            LOG_PATH,
            "timestamp,doc_id,doc_number,old_ref,new_ref,status,error\n"
        );
    }
}

function normalizeReferences(rawReferences, ownDocNumber) {
    if (!rawReferences || typeof rawReferences !== "string") return "";
    const ownStripped = (ownDocNumber || "").replace(/\s+/g, "").toLowerCase();
    const parts = rawReferences
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+/g, ""))
        .filter((s) => s.toLowerCase() !== ownStripped);
    return [...new Set(parts)].join(",");
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    ensureLogHeader();

    const params = TARGET === "BAD_REF" ? [BAD_REFERENCE] : [];
    const sql = buildSelectionSql();

    console.log(`Target: ${TARGET}`);
    console.log(`Dry run: ${DRY_RUN}`);
    console.log(`Limit: ${LIMIT ?? "none"}`);
    console.log(`Start after: ${START_AFTER ?? "none"}`);
    console.log(`Sleep between calls: ${SLEEP_MS} ms`);
    console.log(`Log file: ${LOG_PATH}\n`);

    const { rows } = await pool.query(sql, params);
    console.log(`Selected ${rows.length} docs to process.\n`);

    let processed = 0;
    let updated = 0;
    let noRef = 0;
    let failed = 0;
    let flagged = 0;
    const startTime = Date.now();

    for (const doc of rows) {
        processed++;
        try {
            const aiResp = await processOpenAIRefill(doc.dm_ocr_content, doc.doc_number);
            if (!aiResp || !aiResp.choices || !aiResp.choices[0]) {
                flagged++;
                appendLog({
                    doc_id: doc.doc_id,
                    doc_number: doc.doc_number,
                    old_ref: doc.old_ref,
                    new_ref: "",
                    status: "flagged",
                    error: "no AI response",
                });
                continue;
            }

            let parsed;
            try {
                parsed = JSON.parse(aiResp.choices[0].message.content);
            } catch (e) {
                flagged++;
                appendLog({
                    doc_id: doc.doc_id,
                    doc_number: doc.doc_number,
                    old_ref: doc.old_ref,
                    new_ref: "",
                    status: "flagged",
                    error: "json parse failed",
                });
                continue;
            }

            const newRef = normalizeReferences(parsed.references, doc.doc_number);

            if (!newRef) {
                noRef++;
                appendLog({
                    doc_id: doc.doc_id,
                    doc_number: doc.doc_number,
                    old_ref: doc.old_ref,
                    new_ref: "",
                    status: "no_reference_found",
                    error: "",
                });
                continue;
            }

            if (!DRY_RUN) {
                await pool.query(
                    `UPDATE documents SET doc_reference = $1 WHERE doc_id = $2`,
                    [newRef, doc.doc_id]
                );
            }

            updated++;
            appendLog({
                doc_id: doc.doc_id,
                doc_number: doc.doc_number,
                old_ref: doc.old_ref,
                new_ref: newRef,
                status: DRY_RUN ? "would_update" : "updated",
                error: "",
            });
        } catch (err) {
            failed++;
            appendLog({
                doc_id: doc.doc_id,
                doc_number: doc.doc_number,
                old_ref: doc.old_ref,
                new_ref: "",
                status: "failed",
                error: err.message,
            });
        }

        if (processed % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = (processed / (Date.now() - startTime) * 1000).toFixed(2);
            console.log(
                `[${processed}/${rows.length}] updated=${updated} no_ref=${noRef} flagged=${flagged} failed=${failed}  (${elapsed}s, ${rate}/s)`
            );
        }

        if (SLEEP_MS > 0) await sleep(SLEEP_MS);
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log("\n--- Summary ---");
    console.log(`Processed:           ${processed}`);
    console.log(`Updated:             ${updated}${DRY_RUN ? " (dry-run, not written)" : ""}`);
    console.log(`No reference found:  ${noRef}`);
    console.log(`Flagged:             ${flagged}`);
    console.log(`Failed:              ${failed}`);
    console.log(`Elapsed:             ${elapsedSec}s`);
    console.log(`Log:                 ${LOG_PATH}`);

    await pool.end();
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
