const express = require("express");
const { requirePrivyUserId } = require("../middleware/privyUserId");
const ctrl = require("../controllers/issueController");
const wpCtrl = require("../controllers/workProposalController");

const router = express.Router();

router.get("/api/issues", ctrl.getIssues);
router.get("/api/issues/my-activity", requirePrivyUserId, ctrl.getMyIssueActivity);
router.get("/api/issues/:issueId/work-proposals", requirePrivyUserId, wpCtrl.getIssueWorkProposals);
router.post("/api/issues/:issueId/work-proposals", requirePrivyUserId, wpCtrl.postIssueWorkProposal);
router.get("/api/issues/:issueId/voting-state", ctrl.getVotingState);
router.post("/api/issues/:issueId/votes", requirePrivyUserId, ctrl.postProposalVote);
router.post("/api/issues/:issueId/milestone-proof", requirePrivyUserId, ctrl.upload.single("image"), ctrl.postMilestoneProof);
router.post("/api/issues/:issueId/advance-milestone", requirePrivyUserId, ctrl.postAdvanceMilestone);
router.get("/api/issues/:issueId", ctrl.getIssue);
router.post("/api/issues", requirePrivyUserId, ctrl.upload.single("image"), ctrl.postIssue);
router.post("/api/issues/:issueId/donate", requirePrivyUserId, ctrl.postDonate);
router.post("/api/issues/:issueId/chat/token", requirePrivyUserId, ctrl.postChatToken);
router.get("/api/issues/:issueId/chat/messages", requirePrivyUserId, ctrl.getChatMessages);
router.post("/api/issues/:issueId/chat/messages", requirePrivyUserId, ctrl.postChatMessage);
router.post("/api/issues/:issueId/initiate", requirePrivyUserId, ctrl.postInitiate);
router.post("/api/issues/:issueId/follow", requirePrivyUserId, ctrl.postFollow);
router.post("/api/issues/:issueId/unfollow", requirePrivyUserId, ctrl.postUnfollow);
router.get("/api/issues/:issueId/following", requirePrivyUserId, ctrl.getFollowing);
router.patch("/api/issues/:issueId", requirePrivyUserId, ctrl.patchIssueTarget);
router.patch("/api/issues/:issueId/phase", requirePrivyUserId, ctrl.patchIssuePhase);

module.exports = { issueRoutes: router };
