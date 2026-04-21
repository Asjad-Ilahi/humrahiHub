const express = require("express");
const { requirePrivyUserId } = require("../middleware/privyUserId");
const { requireAdminToken } = require("../middleware/adminToken");
const volCtrl = require("../controllers/volunteerController");
const wpCtrl = require("../controllers/workProposalController");

const router = express.Router();

router.get("/api/volunteers/me", requirePrivyUserId, volCtrl.getMe);
router.get("/api/volunteers/my-work", requirePrivyUserId, volCtrl.getMyWork);
router.post(
  "/api/volunteers/apply",
  requirePrivyUserId,
  volCtrl.volunteerUpload.single("id_document"),
  volCtrl.postApply
);

router.get("/api/admin/volunteer-applications", requireAdminToken, volCtrl.adminListApplications);
router.patch("/api/admin/volunteer-applications/:id", requireAdminToken, volCtrl.adminReviewApplication);

router.get("/api/admin/work-proposals", requireAdminToken, wpCtrl.adminListWorkProposals);
router.patch("/api/admin/work-proposals/:id", requireAdminToken, wpCtrl.adminReviewWorkProposal);

module.exports = { volunteerRoutes: router };
