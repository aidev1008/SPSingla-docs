let router = require("express").Router();
let adminController = require("../controllers/admin.controller");
let authMiddleware = require("../middlewares/auth.middleware.js");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/settings", upload.none(), adminController.settings);

router.get(
    "/reference-audit",
    authMiddleware.checkLoginStatus,
    adminController.renderReferenceAudit
);
router.get(
    "/reference-audit/:ref/refill",
    authMiddleware.checkLoginStatus,
    adminController.renderReferenceAuditRefill
);
router.get(
    "/reference-audit/:ref",
    authMiddleware.checkLoginStatus,
    adminController.renderReferenceAuditDetail
);

module.exports = router;