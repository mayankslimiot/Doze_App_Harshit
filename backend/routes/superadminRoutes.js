const express = require("express");
const router = express.Router();
const { 
  login, 
  changePassword,
  provisionOrganization,
  getAllOrganizations,
  updateOrganization,
  suspendOrganization,
  restoreOrganization,
  getTrashedOrganizations,
  deleteOrganizationPermanently,
  getAllDevices,
  getAllUsers,
  deleteAppUser,
  logoUploadMw,
  uploadLogo
} = require("../controllers/superadminController");

router.post("/login", login);
router.post("/change-password", changePassword);
router.post("/organizations", provisionOrganization);
router.post("/organizations/upload-logo", logoUploadMw, uploadLogo);
router.get("/organizations", getAllOrganizations);
router.get("/organizations/trash", getTrashedOrganizations);
router.put("/organizations/:id", updateOrganization);
router.put("/organizations/:id/suspend", suspendOrganization);
router.put("/organizations/:id/restore", restoreOrganization);
router.delete("/organizations/:id", deleteOrganizationPermanently);
router.get("/devices", getAllDevices);
router.get("/users", getAllUsers);
router.delete("/users/:id", deleteAppUser);

module.exports = router;
