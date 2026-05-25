"use strict";
const { pool } = require("../helpers/database.helper.js");


const adminController = {};

adminController.renderReferenceAudit = async (req, res) => {
    const token = req.session.token;
    if (!token || token.user_role !== "0") {
        return res.render("404.ejs");
    }
    try {
        const summarySql = `
            SELECT
                COUNT(*)                                                AS total_docs,
                COUNT(*) FILTER (WHERE doc_reference IS NOT NULL
                                  AND TRIM(doc_reference) <> '')        AS docs_with_ref,
                COUNT(*) FILTER (WHERE doc_reference IS NULL
                                  OR TRIM(doc_reference) = '')          AS docs_no_ref
            FROM   documents;
        `;

        const showAll = req.query.show === "all";
        const minCount = 50;

        const groupSql = `
            WITH ref_folder_counts AS (
                SELECT doc_reference,
                       doc_folder,
                       COUNT(*) AS fc,
                       REGEXP_REPLACE(doc_folder, ' - .*$', '') AS project
                FROM   documents
                WHERE  doc_reference IS NOT NULL
                  AND  TRIM(doc_reference) <> ''
                GROUP  BY doc_reference, doc_folder
            ),
            ranked AS (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY doc_reference ORDER BY fc DESC) AS rn
                FROM   ref_folder_counts
            ),
            top3 AS (
                SELECT doc_reference,
                       STRING_AGG(doc_folder, ', ' ORDER BY fc DESC) AS top_folders
                FROM   ranked
                WHERE  rn <= 3
                GROUP  BY doc_reference
            ),
            projects AS (
                SELECT doc_reference,
                       COUNT(DISTINCT project)::int AS distinct_projects
                FROM   ref_folder_counts
                GROUP  BY doc_reference
            )
            SELECT  r.doc_reference,
                    SUM(r.fc)::int            AS doc_count,
                    COUNT(*)::int             AS folder_count,
                    p.distinct_projects,
                    tf.top_folders
            FROM   ref_folder_counts r
            LEFT   JOIN top3     tf USING (doc_reference)
            LEFT   JOIN projects p  USING (doc_reference)
            GROUP  BY r.doc_reference, tf.top_folders, p.distinct_projects
            HAVING SUM(r.fc) >= ${minCount}
              AND  (${showAll ? "TRUE" : "p.distinct_projects > 1"})
            ORDER  BY (CASE WHEN p.distinct_projects > 1 THEN 0 ELSE 1 END),
                      doc_count DESC
            LIMIT  100;
        `;

        const [summaryRes, groupRes] = await Promise.all([
            pool.query(summarySql),
            pool.query(groupSql),
        ]);

        const summary = summaryRes.rows[0];
        const groups = groupRes.rows;
        const sharedDocsTotal = groups.reduce(
            (acc, g) => acc + parseInt(g.doc_count, 10),
            0
        );

        const crossProjectDocs = groups
            .filter((g) => g.distinct_projects > 1)
            .reduce((acc, g) => acc + parseInt(g.doc_count, 10), 0);

        return res.render("admin/reference-audit", {
            token,
            summary,
            groups,
            sharedDocsTotal,
            crossProjectDocs,
            minCount,
            showAll,
        });
    } catch (err) {
        console.error("renderReferenceAudit error:", err);
        return res.status(500).send("Internal Server Error");
    }
};

adminController.renderReferenceAuditDetail = async (req, res) => {
    const token = req.session.token;
    if (!token || token.user_role !== "0") {
        return res.render("404.ejs");
    }
    try {
        const ref = Buffer.from(req.params.ref, "base64").toString("utf-8");
        const page = Math.max(1, parseInt(req.query.page || "1", 10));
        const pageSize = 50;
        const offset = (page - 1) * pageSize;

        const countSql = `
            SELECT  COUNT(*)::int                                  AS total_docs,
                    COUNT(DISTINCT doc_folder)::int                AS folder_count,
                    MIN(doc_uploaded_at)::text                     AS earliest,
                    MAX(doc_uploaded_at)::text                     AS latest
            FROM    documents
            WHERE   doc_reference = $1;
        `;

        const rowsSql = `
            SELECT  d.doc_id, d.doc_number, d.doc_folder, d.doc_source,
                    d.doc_uploaded_at, d.doc_pdf_link, d.doc_subject,
                    EXISTS(
                        SELECT 1
                        FROM   doc_metadata m
                        WHERE  m.dm_id = d.doc_number
                    ) AS has_ocr
            FROM    documents d
            WHERE   d.doc_reference = $1
            ORDER   BY d.doc_id
            LIMIT   $2 OFFSET $3;
        `;

        const [countRes, rowsRes] = await Promise.all([
            pool.query(countSql, [ref]),
            pool.query(rowsSql, [ref, pageSize, offset]),
        ]);

        const stats = countRes.rows[0];
        const docs = rowsRes.rows;
        const totalPages = Math.max(1, Math.ceil(stats.total_docs / pageSize));

        return res.render("admin/reference-audit-detail", {
            token,
            reference: ref,
            referenceEncoded: req.params.ref,
            stats,
            docs,
            page,
            pageSize,
            totalPages,
        });
    } catch (err) {
        console.error("renderReferenceAuditDetail error:", err);
        return res.status(500).send("Internal Server Error");
    }
};

adminController.renderReferenceAuditRefill = async (req, res) => {
    const token = req.session.token;
    if (!token || token.user_role !== "0") {
        return res.render("404.ejs");
    }
    try {
        const ref = Buffer.from(req.params.ref, "base64").toString("utf-8");

        const statsSql = `
            SELECT
              COUNT(*)::int                                                     AS total_docs,
              COUNT(*) FILTER (WHERE m.dm_id IS NOT NULL)::int                   AS with_ocr,
              COUNT(*) FILTER (WHERE m.dm_id IS NULL)::int                       AS without_ocr,
              COUNT(*) FILTER (WHERE d.doc_folder ILIKE 'Haridwar%')::int        AS in_haridwar,
              COUNT(*) FILTER (WHERE d.doc_folder NOT ILIKE 'Haridwar%')::int    AS in_other_projects,
              COUNT(DISTINCT REGEXP_REPLACE(d.doc_folder, ' - .*$', ''))::int    AS distinct_projects
            FROM   documents d
            LEFT   JOIN doc_metadata m ON m.dm_id = d.doc_number
            WHERE  d.doc_reference = $1;
        `;
        const sampleSql = `
            SELECT  d.doc_id, d.doc_number, d.doc_folder, d.doc_uploaded_at
            FROM    documents d
            WHERE   d.doc_reference = $1
            ORDER   BY d.doc_id
            LIMIT   5;
        `;

        const [statsRes, sampleRes] = await Promise.all([
            pool.query(statsSql, [ref]),
            pool.query(sampleSql, [ref]),
        ]);

        const stats = statsRes.rows[0];
        const samples = sampleRes.rows;

        const targetCount = stats.in_other_projects;
        const estimatedSeconds = Math.ceil(targetCount * 1.2);
        const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
        const estimatedCostUsd = ((targetCount * (1500 + 4000)) / 1e6) * 0.15
                               + ((targetCount * 100) / 1e6) * 0.60;

        return res.render("admin/reference-audit-refill", {
            token,
            reference: ref,
            referenceEncoded: req.params.ref,
            stats,
            samples,
            targetCount,
            estimatedMinutes,
            estimatedCostUsd: estimatedCostUsd.toFixed(2),
        });
    } catch (err) {
        console.error("renderReferenceAuditRefill error:", err);
        return res.status(500).send("Internal Server Error");
    }
};

adminController.settings = async (req, res) => {
    const inputs = req.body;
    const token = req.session.token;
    try {
        const query = `
            INSERT INTO admin_settings (setting_name, setting_value) 
            VALUES ($1, $2) 
            ON CONFLICT (setting_name) 
            DO UPDATE SET setting_value = EXCLUDED.setting_value;
        `;

        const values = [Object.keys(inputs)[0], inputs.doc_lock_date]
        await pool.query(query, values);

        return res.json({ status: 1, msg: "Settings Saved" });
    } catch (error) {
        console.log("🚀 ~ adminController.settings= ~ error:", error)
        return res.json({ status: 0, msg: "Internal Server Error" });
    }
}

module.exports = adminController;