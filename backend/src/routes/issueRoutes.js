const express = require("express");
const { requirePrivyUserId } = require("../middleware/privyUserId");
const ctrl = require("../controllers/issueController");

const router = express.Router();

router.get("/api/issues", ctrl.getIssues);
router.post("/api/issues", requirePrivyUserId, ctrl.upload.single("image"), ctrl.postIssue);
router.post("/api/issues/:issueId/initiate", requirePrivyUserId, ctrl.postInitiate);
router.post("/api/issues/:issueId/follow", requirePrivyUserId, ctrl.postFollow);
router.post("/api/issues/:issueId/unfollow", requirePrivyUserId, ctrl.postUnfollow);
router.get("/api/issues/:issueId/following", requirePrivyUserId, ctrl.getFollowing);
router.patch("/api/issues/:issueId", requirePrivyUserId, ctrl.patchIssueTarget);
router.patch("/api/issues/:issueId/phase", requirePrivyUserId, ctrl.patchIssuePhase);

module.exports = { issueRoutes: router };
