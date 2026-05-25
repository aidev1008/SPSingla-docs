#!/usr/bin/env node
/*
  Minimal preview server for the new Reference Audit UI.
  Bypasses queue.js / canvas / BullMQ — only loads what the admin pages need.
  Auto-injects a fake admin session (user_role = "0") so you can browse without logging in.

  Usage:
    set DB_USER=postgres, DB_HOST=localhost, DB_PORT=5432, DB_USERNAME="SP - Local",
        DB_PASSWORD=YOUR_NEW_PASSWORD, DB_SSL=false in env
    node scripts/preview-admin-ui.js
  Then open: http://localhost:3010/admin/reference-audit
*/

require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const port = process.env.PREVIEW_PORT || 3010;

app.use(express.static(path.join(__dirname, "..")));
app.set("views", [path.join(__dirname, "..", "app/views/")]);
app.set("view engine", "ejs");

app.use(
    session({
        secret: "previewSecret",
        cookie: { maxAge: 24 * 60 * 60 * 1000 },
        saveUninitialized: true,
        resave: false,
    })
);

app.use((req, res, next) => {
    if (!req.session.token) {
        req.session.token = {
            user_id: 0,
            user_name: "Preview Admin",
            user_email: "preview@local",
            user_role: "0",
            bank_guarantee_status: true,
            fdr_status: true,
        };
    }
    next();
});

const adminRouter = require("../app/routes/admin.router.js");
app.use("/admin", adminRouter);

app.get("/", (req, res) => {
    res.redirect("/admin/reference-audit");
});

app.listen(port, () => {
    console.log(`\nPreview server running:`);
    console.log(`  → http://localhost:${port}/admin/reference-audit`);
    console.log(`  (auto-logged-in as fake admin)\n`);
});
