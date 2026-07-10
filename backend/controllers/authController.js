const User = require("../models/User");
const SuperAdmin = require("../models/SuperAdmin");
const Organization = require("../models/Organization");
const createError = require("../utils/appError");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const LoginAttempt = require("../models/LoginAttempts");
const geoip = require("geoip-lite");
const useragent = require("useragent");
const Device = require('../models/Device');// <-- add
const { createAdmin } = require("./adminController");
const crypto = require("crypto");
const { sendEmail } = require("../utils/mailer");
const dbg = require("../utils/dlog");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");

// ---- simple debug helpers ----
const DEBUG_AUTH = String(process.env.DEBUG_AUTH || 'true').toLowerCase() === 'true';
const log = (...a) => { if (DEBUG_AUTH) console.log('[AUTH]', ...a); };
const elog = (...a) => console.error('[AUTH:ERR]', ...a);
const mask = (s) => (s ? `${String(s).slice(0, 2)}*** (${String(s).length} chars)` : 'nil');

const gClient = new OAuth2Client({
  clientId: process.env.OAUTH_GOOGLE_CLIENT_ID,
  clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.OAUTH_GOOGLE_REDIRECT_URI,
});

const APP_BASE_URL = ((process.env.APP_BASE_URL || "").trim() || "https://dozemate.com").replace(/\/$/, "");
const IS_LOCAL_APP = /^(https?:\/\/)?(localhost|127\.0\.0\.1)/i.test(APP_BASE_URL);

function generateTempPassword() {
  // 12–16 chars, mixed; avoids +/=
  const raw = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, "");
  // ensure at least one lower/upper/digit/special (quick tweak)
  return (raw.slice(0, 10) + "aA1!").slice(0, 14);
}

function makeIdentifierKey(v) {
  if (!v) return undefined;
  return String(v).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Unique numeric accountId allocator (retry a few times)
async function allocAccountId() {
  for (let i = 0; i < 5; i++) {
    const cand = String(Math.floor(10000 + Math.random() * 90000)); // 5-digit
    const exists = await Account.exists({ accountId: cand });
    if (!exists) return cand;
  }
  // fallback: timestamp-based
  return String(Date.now()).slice(-8);
}
async function nextProfileSuffix(account) {
  const n = (account.userProfiles?.length || 0);      // 0 -> 'a', 1 -> 'b' ...
  return String.fromCharCode(97 + n);
}

// POST /api/auth/register
exports.register = async (req, res, next) => {
  dbg("auth.register:start", {
    email: req.body?.email,
    role: req.body?.role,
    devicesCount: Array.isArray(req.body?.devices) ? req.body.devices.length : 0,
  });

  try {
    const {
      email,
      password,
      name,
      address = "",
      pincode,
      mobile,
      countryCode,
      country,
      city,
      organizationId,
      organizationName,
      role = "user",
      devices = [],             // [{ deviceId }]
      weightProfile = {},       // optional
      grid = {},                // optional
      displayDeviceIds = [],    // optional
      identifier
    } = req.body;

    // 1) Validate required fields
    const missing = [];
    if (!email) missing.push("email");
    if (!name) missing.push("name");
    if (pincode === undefined || pincode === null) missing.push("pincode");
    if (mobile === undefined || mobile === null) missing.push("mobile");

    if (missing.length) {
      dbg("auth.register:missing_fields", { missing });
      return res
        .status(400)
        .json({ status: "fail", message: `Missing: ${missing.join(", ")}` });
    }

    // 2) Validate email format + uniqueness
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ status: "fail", message: "Invalid email format" });
    }

    // 3) Resolve organization (optional)
    let resolvedOrgId = null;
    if (organizationId) {
      resolvedOrgId = organizationId;
      dbg("auth.register:org_by_id", { organizationId });
    } else if (organizationName && organizationName.trim()) {
      const orgName = organizationName.trim();
      let org = await Organization.findOne({ name: orgName });
      if (!org) org = await Organization.create({ name: orgName });
      resolvedOrgId = org._id;
      dbg("auth.register:org_by_name", { organizationName: orgName, resolvedOrgId });
    }

    // [IDENTIFIER] Enforce uniqueness (global OR per‑org — choose one)
    const identifierKey = makeIdentifierKey(identifier);
    if (identifierKey) {
      // (A) Global unique:
      // const dup = await User.exists({ identifierKey });

      // (B) Per‑organization unique (recommended):
      const dup = await User.exists({
        identifierKey,
        ...(resolvedOrgId ? { organizationId: resolvedOrgId } : {}),
      });

      if (dup) {
        return res.status(409).json({ status: "fail", message: "Identifier already in use" });
      }
    }

    // 4) Hash password
    const isTempPassword = !password || !String(password).trim();
    const plainPassword = isTempPassword ? generateTempPassword() : String(password).trim();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);
    dbg("auth.register:password_hashed", { hashLen: hashedPassword.length, isTempPassword });

    // 5) Devices from payload (optional)
    const incomingIds = Array.isArray(devices)
      ? devices
        .map((d) =>
          d && d.deviceId ? String(d.deviceId).trim().toUpperCase() : null
        )
        .filter(Boolean)
      : [];

    dbg("auth.register:devices_incoming", { incomingIdsCount: incomingIds.length });

    let deviceDocs = [];
    if (incomingIds.length) {
      deviceDocs = await Device.find(
        { deviceId: { $in: incomingIds } },
        { _id: 1, deviceId: 1 }
      ).lean();
    }
    const deviceObjectIds = deviceDocs.map((d) => d._id);
    const activeDevice = deviceObjectIds[0] || null;
    dbg("auth.register:devices_found", {
      found: deviceObjectIds.length,
      activeDevice: activeDevice ? String(activeDevice) : null,
    });

    // 6) Auto-promote to admin if more than one device
    const resolvedRole = deviceObjectIds.length > 1 ? "admin" : role;
    dbg("auth.register:role_resolved", { resolvedRole });

    // 7) Build displayedDevices list (only ACTIVE, capped by grid capacity)
    const cap = Number(grid?.x || 0) * Number(grid?.y || 0);
    let displayIds = Array.isArray(displayDeviceIds)
      ? [...new Set(displayDeviceIds.map((s) => String(s).trim().toUpperCase()))]
      : [];
    let displayDocs = [];
    if (displayIds.length) {
      displayDocs = await Device.find(
        { deviceId: { $in: displayIds } },
        { _id: 1, deviceId: 1, status: 1 }
      ).lean();
      displayDocs = displayDocs.filter(
        (d) => String(d.status || "").toLowerCase() === "active"
      );
      if (cap > 0 && displayDocs.length > cap) displayDocs = displayDocs.slice(0, cap);
    }
    dbg("auth.register:display_devices", {
      requested: displayIds.length,
      acceptedActive: displayDocs.length,
      cap,
    });


    // --- BEFORE creating the user (right before step 8) ---
    const acctId = await allocAccountId();
    const accountDoc = await Account.create({
      accountId: acctId,
      primaryEmail: email,
      mobile: String(mobile || ''),
      countryCode: countryCode || undefined,
      address,
      pincode,
      country,
      city,
      organizationId: resolvedOrgId || null,
      userProfiles: [],
      defaultUser: null
    });
    // --- END insert ---

    // 8) Create user
    const newUser = await User.create({
      email,
      password: hashedPassword,
      name,
      address,
      pincode,
      mobile,
      organizationId: resolvedOrgId,
      countryCode,
      country,
      city,
      role: resolvedRole,
      devices: deviceObjectIds,
      activeDevice,
      identifier: identifier || undefined,
      identifierKey: identifierKey || undefined,
      dateOfBirth: weightProfile?.dob || undefined,
      gender: weightProfile?.gender || undefined,
      weight: weightProfile?.weight || undefined,
      height: weightProfile?.height || undefined,
      waist: weightProfile?.waist || undefined,
      createdAt: new Date(),
      grid: grid || undefined,
      displayedDevices: displayDocs.map((d) => d._id),
      passwordMustChange: isTempPassword ? true : false,
      account: accountDoc._id,
      accountId: accountDoc.accountId,
      userId: `${accountDoc.accountId}a`,
      isDefaultProfile: true,
      isVerified: false
    });
    dbg("auth.register:user_created", { userId: String(newUser._id) });

    await Account.updateOne(
      { _id: accountDoc._id },
      { $push: { userProfiles: newUser._id }, $set: { defaultUser: newUser._id } }
    );

    // 9) Reflect assignment on Device docs
    if (deviceObjectIds.length) {
      // Assign devices to this user
      await Device.updateMany(
        { _id: { $in: deviceObjectIds } },
        { $set: { userId: newUser._id, status: "inactive" } }  // mark all as inactive first
      );

      // Mark the first one as active
      if (activeDevice) {
        await Device.updateOne(
          { _id: activeDevice },
          { $set: { status: "active", lastActiveAt: new Date(), profileId: newUser._id } }
        );
      }

      dbg("auth.register:devices_assigned", {
        count: deviceObjectIds.length,
        activeDevice: String(activeDevice),
      });
    }

    // 9.4) Attach members array onto the new account (optional)
    let membersSet = [];
    try {
      const rawIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
      if (rawIds.length) {
        const validIds = rawIds
          .map(id => {
            try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; }
          })
          .filter(Boolean)
          .filter(oid => String(oid) !== String(newUser._id)); // avoid self

        // de-dup and stringify for response
        const uniq = [...new Set(validIds.map(String))];
        membersSet = uniq;

        // persist on the new user
        // NOTE: requires `members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]` in User schema
        await User.updateOne(
          { _id: newUser._id },
          { $set: { members: validIds } },
          { strict: false } // if schema doesn't yet have `members`, this allows setting it
        );

        dbg("auth.register:members_set", {
          provided: rawIds.length,
          valid: validIds.length,
          savedOnUserId: String(newUser._id),
          membersCount: uniq.length
        });
      } else {
        dbg("auth.register:members_set", { provided: 0 });
      }
    } catch (e) {
      elog("auth.register:members_set_error", e?.message || e);
    }


    // 9.5) Optionally link pre-created users to this account's organization
    let linkedMemberIds = [];
    let linkUpdatedCount = 0;

    try {
      const rawIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
      if (rawIds.length) {
        const validIds = rawIds
          .map((id) => {
            try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; }
          })
          .filter(Boolean);

        if (validIds.length) {
          const orgToSet = resolvedOrgId || null; // reuse the resolved org
          linkedMemberIds = validIds.map(String);

          if (orgToSet) {
            const result = await User.updateMany(
              { _id: { $in: validIds } },
              { $set: { organizationId: orgToSet } }
            );
            linkUpdatedCount = result?.modifiedCount ?? result?.nModified ?? 0;
          }
          dbg("auth.register:link_members", {
            provided: rawIds.length,
            valid: validIds.length,
            linkedMemberIds,
            members: membersSet,
            linkUpdatedCount,
            org: orgToSet ? String(orgToSet) : null
          });
        }
      }
    } catch (e) {
      elog("auth.register:link_members_error", e?.message || e);
    }

    // 9.7) If Admin → create subUsers (inactive + send activation)
    if (String(resolvedRole).toLowerCase() === "admin"
      && Array.isArray(req.body.subUsers)
      && req.body.subUsers.length) {
      dbg("auth.register:subUsers:create", { count: req.body.subUsers.length });

      for (const s of req.body.subUsers) {
        try {
          if (!s.email) continue;
          const subPlainPass = generateTempPassword();
          const subHashed = await bcrypt.hash(subPlainPass, 12);

          const subUser = await User.create({
            email: s.email,
            name: [s.firstName, s.lastName].filter(Boolean).join(" "),
            address: s.address || "",
            pincode: s.pincode,
            mobile: s.mobile,
            countryCode: s.countryCode || "+91",
            country: s.country,
            city: s.city,
            role: "user",
            password: subHashed,
            passwordMustChange: true,
            isVerified: false,
            organizationId: newUser.organizationId,
            account: newUser.account,
            accountId: newUser.accountId,
            userId: `${newUser.accountId}m${Date.now().toString(36)}`
          });

          // 🔑 Generate verification link
          const verifyToken = jwt.sign(
            { userId: String(subUser._id) },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
          );
          const apiBase = process.env.API_BASE_URL || APP_BASE_URL;
          const verifyUrl = `${apiBase}/api/auth/verify/${verifyToken}`;

          await sendEmail({
            to: subUser.email,
            subject: "Activate your Dozemate account",
            text: `Hello ${subUser.name},\n\nYour account has been created by an Admin.\nPlease verify & activate using this link: ${verifyUrl}\n\n— Dozemate Team`,
            html: `<p>Hello ${subUser.name},</p>
                   <p>Your account has been created by an Admin.</p>
                   <p><a href="${verifyUrl}">Click here to verify & activate</a></p>
                   <p>— Dozemate Team</p>`
          });

          dbg("auth.register:subUser_created", { email: subUser.email });
        } catch (e) {
          elog("auth.register:subUser_error", e?.message || e);
        }
      }
    }

    // 10) Generate email verification token (24h expiry)
    const verifyToken = jwt.sign(
      { userId: String(newUser._id) },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );


    const apiBase = process.env.API_BASE_URL || APP_BASE_URL;
    const appBase = process.env.APP_BASE_URL || APP_BASE_URL;

    const verifyUrl = `${apiBase}/api/auth/verify/${verifyToken}`;

    dbg("auth.register:verify_token_issued", { userId: String(newUser._id) });    // ---- MAIL: begin

    dbg("auth.register:mail:begin", {
      to: String(newUser.email),
      isTempPassword,
      appBase: process.env.APP_BASE_URL || 'https://dozemate.com',
      hasSendEmailFn: typeof sendEmail === 'function'
    });

    let mailAttempted = false, mailSent = false, mailError = null, mailMeta = null;

    try {
      const appBase = (process.env.APP_BASE_URL || 'https://dozemate.com').replace(/\/+$/, '');


      const subject = "Verify your Dozemate account";
      const lines = [
        `Hi ${newUser.name || 'there'},`,
        "",
        "We are happy to have you on Dozemate - Please click me to verify your account and come onboard",
        verifyUrl,
        "",
        "This link will expire in 24 hours.",
        "",
        "— Dozemate Team"
      ];


      // Guard missing/incorrect mailer export early
      if (typeof sendEmail !== 'function') {
        throw new Error("sendEmail export is not a function (check ../utils/mailer)");
      }

      mailAttempted = true;

      // Race with a timeout so we log even if SMTP stalls
      const result = await Promise.race([
        Promise.resolve(
          sendEmail({
            to: newUser.email,
            subject,
            text: lines.join("\n"),
            html: lines.map(l => {
              if (!l) return '<br/>';
              if (l === verifyUrl) {
                return `<p><a href="${verifyUrl}">We are happy to have you on Dozemate - Please click me to verify your account and come onboard</a></p>`;
              }
              return `<p>${l}</p>`;
            }).join('')
          })
        ).then((r) => (r === false ? 'returned_false' : 'ok')),
        new Promise((_, rej) => setTimeout(() => rej(new Error('MAIL_TIMEOUT_12s')), 12000))
      ]);

      mailSent = (result === 'ok');
      dbg("auth.register:mail_result", { result, mailSent });
    } catch (mailErr) {
      mailError = mailErr?.message || String(mailErr);
      elog("auth.register:mail_error", mailError);
    }
    // ---- MAIL: end instrumentation ----


    return res.status(201).json({
      status: "success",
      message: "User registered. Verification email sent.",
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      },
      mailAttempted,
      mailSent,
      mailError
    });

  } catch (err) {
    dbg("auth.register:error", { message: err?.message });
    next(err);
  }
};

// POST /api/auth/register-simple (Simplified registration for mobile app)
exports.registerSimple = async (req, res, next) => {
  dbg("auth.registerSimple:start", {
    email: req.body?.email,
    role: req.body?.role,
  });

  try {
    const {
      email,
      password,
      name,
      address = "",
      pincode = "",
      mobile = "",
      countryCode = "+91",
      country = "India",
      city = "",
      organizationId,
      organizationName,
      role = "user",
      devices = [],
      weightProfile = {},
      grid = {},
      displayDeviceIds = [],
      identifier
    } = req.body;

    // 1) Validate required fields (only email, name, password)
    const missing = [];
    if (!email) missing.push("email");
    if (!name) missing.push("name");
    if (!password) missing.push("password");

    if (missing.length) {
      dbg("auth.registerSimple:missing_fields", { missing });
      return res
        .status(400)
        .json({ status: "fail", message: `Missing: ${missing.join(", ")}` });
    }

    // 2) Validate email format + uniqueness
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ status: "fail", message: "Invalid email format" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ status: "fail", message: "Email already registered" });
    }

    // 3) Resolve organization (optional)
    let resolvedOrgId = null;
    if (organizationId) {
      resolvedOrgId = organizationId;
      dbg("auth.registerSimple:org_by_id", { organizationId });
    } else if (organizationName && organizationName.trim()) {
      const orgName = organizationName.trim();
      let org = await Organization.findOne({ name: orgName });
      if (!org) org = await Organization.create({ name: orgName });
      resolvedOrgId = org._id;
      dbg("auth.registerSimple:org_by_name", { organizationName: orgName, resolvedOrgId });
    }

    // [IDENTIFIER] Enforce uniqueness (per-organization)
    const identifierKey = makeIdentifierKey(identifier);
    if (identifierKey) {
      const dup = await User.exists({
        identifierKey,
        ...(resolvedOrgId ? { organizationId: resolvedOrgId } : {}),
      });

      if (dup) {
        return res.status(409).json({ status: "fail", message: "Identifier already in use" });
      }
    }

    // 4) Hash password
    const hashedPassword = await bcrypt.hash(String(password).trim(), 12);
    dbg("auth.registerSimple:password_hashed", { hashLen: hashedPassword.length });

    // 5) Devices from payload (optional)
    const incomingIds = Array.isArray(devices)
      ? devices
        .map((d) =>
          d && d.deviceId ? String(d.deviceId).trim().toUpperCase() : null
        )
        .filter(Boolean)
      : [];

    dbg("auth.registerSimple:devices_incoming", { incomingIdsCount: incomingIds.length });

    let deviceDocs = [];
    if (incomingIds.length) {
      deviceDocs = await Device.find(
        { deviceId: { $in: incomingIds } },
        { _id: 1, deviceId: 1 }
      ).lean();
    }
    const deviceObjectIds = deviceDocs.map((d) => d._id);
    const activeDevice = deviceObjectIds[0] || null;
    dbg("auth.registerSimple:devices_found", {
      found: deviceObjectIds.length,
      activeDevice: activeDevice ? String(activeDevice) : null,
    });

    // 6) Auto-promote to admin if more than one device
    const resolvedRole = deviceObjectIds.length > 1 ? "admin" : role;
    dbg("auth.registerSimple:role_resolved", { resolvedRole });

    // 7) Build displayedDevices list (only ACTIVE, capped by grid capacity)
    const cap = Number(grid?.x || 0) * Number(grid?.y || 0);
    let displayIds = Array.isArray(displayDeviceIds)
      ? [...new Set(displayDeviceIds.map((s) => String(s).trim().toUpperCase()))]
      : [];
    let displayDocs = [];
    if (displayIds.length) {
      displayDocs = await Device.find(
        { deviceId: { $in: displayIds } },
        { _id: 1, deviceId: 1, status: 1 }
      ).lean();
      displayDocs = displayDocs.filter(
        (d) => String(d.status || "").toLowerCase() === "active"
      );
      if (cap > 0 && displayDocs.length > cap) displayDocs = displayDocs.slice(0, cap);
    }
    dbg("auth.registerSimple:display_devices", {
      requested: displayIds.length,
      acceptedActive: displayDocs.length,
      cap,
    });

    // 8) Create Account
    const acctId = await allocAccountId();
    const accountDoc = await Account.create({
      accountId: acctId,
      primaryEmail: email,
      mobile: String(mobile || ''),
      countryCode: countryCode || undefined,
      address: address || '',
      pincode: pincode || '',
      country: country || '',
      city: city || '',
      organizationId: resolvedOrgId || null,
      userProfiles: [],
      defaultUser: null
    });

    // 9) Create user
    // Convert pincode and mobile to numbers (required by schema)
    // Use 0 as default since schema requires Number type
    const pincodeNum = (pincode && String(pincode).trim()) ? Number(String(pincode).trim()) : 0;
    const mobileNum = (mobile && String(mobile).trim()) ? Number(String(mobile).trim().replace(/\D/g, '')) : 0;

    const newUser = await User.create({
      email,
      password: hashedPassword,
      name,
      address: address || '',
      pincode: pincodeNum,
      mobile: mobileNum,
      organizationId: resolvedOrgId,
      countryCode: countryCode || undefined,
      country: country || '',
      city: city || '',
      role: resolvedRole,
      devices: deviceObjectIds,
      activeDevice,
      identifier: identifier || undefined,
      identifierKey: identifierKey || undefined,
      dateOfBirth: weightProfile?.dob || undefined,
      gender: weightProfile?.gender || undefined,
      weight: weightProfile?.weight || undefined,
      height: weightProfile?.height || undefined,
      waist: weightProfile?.waist || undefined,
      createdAt: new Date(),
      grid: grid || undefined,
      displayedDevices: displayDocs.map((d) => d._id),
      passwordMustChange: false,
      account: accountDoc._id,
      accountId: accountDoc.accountId,
      userId: `${accountDoc.accountId}a`,
      isDefaultProfile: true,
      isVerified: false
    });
    dbg("auth.registerSimple:user_created", { userId: String(newUser._id) });

    await Account.updateOne(
      { _id: accountDoc._id },
      { $push: { userProfiles: newUser._id }, $set: { defaultUser: newUser._id } }
    );

    // 10) Reflect assignment on Device docs
    if (deviceObjectIds.length) {
      await Device.updateMany(
        { _id: { $in: deviceObjectIds } },
        { $set: { userId: newUser._id, status: "inactive" } }
      );

      if (activeDevice) {
        await Device.updateOne(
          { _id: activeDevice },
          { $set: { status: "active", lastActiveAt: new Date(), profileId: newUser._id } }
        );
      }

      dbg("auth.registerSimple:devices_assigned", {
        count: deviceObjectIds.length,
        activeDevice: String(activeDevice),
      });
    }

    // 11) Generate email verification token (24h expiry)
    const verifyToken = jwt.sign(
      { userId: String(newUser._id) },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const apiBase = process.env.API_BASE_URL || APP_BASE_URL;
    const appBase = process.env.APP_BASE_URL || APP_BASE_URL;
    const verifyUrl = `${apiBase}/api/auth/verify/${verifyToken}`;

    dbg("auth.registerSimple:verify_token_issued", { userId: String(newUser._id) });

    // 12) Send verification email
    let mailAttempted = false, mailSent = false, mailError = null;

    try {
      const appBase = (process.env.APP_BASE_URL || 'https://dozemate.com').replace(/\/+$/, '');
      const subject = "Verify your Dozemate account";
      const lines = [
        `Hi ${newUser.name || 'there'},`,
        "",
        "This link will expire in 24 hours.",
        "",
        "— Dozemate Team"
      ];

      if (typeof sendEmail !== 'function') {
        throw new Error("sendEmail export is not a function (check ../utils/mailer)");
      }

      mailAttempted = true;

      const result = await Promise.race([
        Promise.resolve(
          sendEmail({
            to: newUser.email,
            subject,
            text: [
              `Hi ${newUser.name || 'there'},`,
              "",
              "We are happy to have you on Dozemate - Please click me to verify your account and come onboard",
              verifyUrl,
              "",
              "This link will expire in 24 hours.",
              "",
              "— Dozemate Team"
            ].join("\n"),
            html: [
              `<p>Hi ${newUser.name || 'there'},</p>`,
              `<p><a href="${verifyUrl}">We are happy to have you on Dozemate - Please click me to verify your account and come onboard</a></p>`,
              `<p>This link will expire in 24 hours.</p>`,
              `<p>— Dozemate Team</p>`
            ].join('')
          })
        ).then((r) => (r === false ? 'returned_false' : 'ok')),
        new Promise((_, rej) => setTimeout(() => rej(new Error('MAIL_TIMEOUT_12s')), 12000))
      ]);

      mailSent = (result === 'ok');
      dbg("auth.registerSimple:mail_result", { result, mailSent });
    } catch (mailErr) {
      mailError = mailErr?.message || String(mailErr);
      elog("auth.registerSimple:mail_error", mailError);
    }

    return res.status(201).json({
      status: "success",
      message: "User registered. Verification email sent.",
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      },
      mailAttempted,
      mailSent,
      mailError
    });

  } catch (err) {
    dbg("auth.registerSimple:error", { message: err?.message });
    next(err);
  }
};

// POST /api/auth/login 
exports.login = async (req, res, next) => {
  dbg("auth.login:start", { email: req.body?.email, role: req.body?.role });

  try {
    const { email: emailRaw, password, role } = req.body;
    const accountId =
      req.body?.accountId ??
      req.body?.account_id ??
      req.body?.accountID ??
      req.query?.accountId ??
      req.headers?.["x-account-id"] ??
      null;

    let email = String(emailRaw || "").toLowerCase().trim();

    // LOG: trace raw inputs (mask password length only)
    dbg("auth.login:payload", {
      email: emailRaw,
      role,
      passwordLen: typeof password === 'string' ? password.length : null
    });



    // --- resolve email via accountId (default profile) ---
    if (!email && accountId) {
      const acct = await Account.findOne({ accountId }).select('defaultUser userProfiles');
      if (!acct) {
        dbg("auth.login:fail_no_account", { accountId });
        return res.status(400).json({ status: "fail", message: "Invalid account ID" });
      }
      const defaultUser = await User.findById(acct.defaultUser || acct.userProfiles?.[0]);
      if (!defaultUser) {
        return res.status(400).json({ status: "fail", message: "No user available for this account" });
      }
      email = defaultUser.email;
      dbg("auth.login:resolved_email_from_account", { accountId, email });
    }

    let user = await User.findOne({ email });
    let isSuperAdmin = false;

    const superAdmin = await SuperAdmin.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
    if (superAdmin) {
      // If the password matches the superadmin password, prioritize logging in as superadmin
      const isSuperMatch = await bcrypt.compare(password || "", superAdmin.password || "");
      if (isSuperMatch) {
        user = {
          _id: superAdmin._id,
          email: superAdmin.email,
          password: superAdmin.password,
          role: "superadmin",
          name: "Super Admin",
          isVerified: true,
          passwordMustChange: superAdmin.isFirstLogin
        };
        isSuperAdmin = true;
      }
    }
    dbg("auth.login:user_lookup", { found: !!user, email, isSuperAdmin });

    // capture environment details (for attempts log)
    const ip =
      req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
    const agent = useragent.parse(req.headers["user-agent"] || "");
    const location = geoip.lookup(ip);

    // LOG: environment snapshot
    dbg("auth.login:env", {
      ip,
      ua: req.headers["user-agent"] || "",
      os: agent.os && agent.os.toString ? agent.os.toString() : null,
      browser: agent && agent.toString ? agent.toString() : null,
      geo: location ? {
        country: location.country || null,
        city: location.city || null,
        ll: location.ll || null
      } : null
    });

    const attemptBase = {
      userId: user ? user._id : null,
      email,
      success: false,
      deviceInfo: {
        ip,
        userAgent: req.headers["user-agent"] || "",
        os: agent.os.toString(),
        browser: agent.toString(),
      },
      location: location
        ? {
          latitude: location.ll ? location.ll[0] : null,
          longitude: location.ll ? location.ll[1] : null,
          country: location.country || null,
          city: location.city || null,
        }
        : null,
      attemptedRole: role,
    };

    if (!user) {
      dbg("auth.login:fail_no_user", { email });
      await LoginAttempt.create({ ...attemptBase, failReason: "User not found" });
      // LOG: response about to return
      dbg("auth.login:resp", { status: 400, reason: "User not found" });
      return res.status(400).json({ status: "fail", message: "User not found" });
    }

    // Check verification
    if (!user.isVerified) {
      return res.status(403).json({ status: "fail", message: "Please verify your email before logging in." });
    }

    // Check if organization is suspended or active period has expired
    if (user.account) {
      const account = await Account.findById(user.account).populate('organizationId');
      if (account && account.organizationId) {
        if (account.organizationId.isActive === false) {
          await LoginAttempt.create({ ...attemptBase, failReason: "Organization suspended" });
          return res.status(403).json({ status: "fail", message: "Your organization account has been suspended." });
        }
        if (account.organizationId.activeEndDate && new Date() > new Date(account.organizationId.activeEndDate)) {
          await LoginAttempt.create({ ...attemptBase, failReason: "Organization active period expired" });
          return res.status(403).json({ status: "fail", message: "Your organization's access period is over. Please contact support to renew your subscription." });
        }
      }
    }

    // Strict role check
    if (!user.role) {
      dbg("auth.login:fail_role_missing", { email });
      return res.status(403).json({ status: "fail", message: "Access denied. Missing role in DB." });
    }

    // Password check
    const ok = await bcrypt.compare(password || "", user.password || "");
    dbg("auth.login:password_compare", { ok, email });

    if (!ok) {
      await LoginAttempt.create({ ...attemptBase, failReason: "Invalid password" });
      // LOG: response about to return
      dbg("auth.login:resp", { status: 400, reason: "Invalid credentials" });
      return res.status(400).json({ status: "fail", message: "Invalid credentials" });
    }


    if (user.passwordMustChange) {
      return res.status(200).json({
        status: "success",
        isFirstLogin: true,
        email: user.email,
        message: "First login detected. Password change required."
      });
    }

    // Success — issue token and record attempt
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    // LOG: token issued (never log token content)
    dbg("auth.login:token_issued", { userId: String(user._id) });

    await LoginAttempt.create({ ...attemptBase, success: true });
    dbg("auth.login:success", {
      userId: String(user._id),
      email,
      ip,
      country: attemptBase.location?.country || null,
      city: attemptBase.location?.city || null
    });

    // LOG: response about to return
    dbg("auth.login:resp", { status: 200, message: "User Logged in Successfully" });

    return res.status(200).json({
      status: "success",
      message: "User Logged in Successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        accountId: user.accountId || null
      },
    });
  } catch (error) {
    dbg("auth.login:error", { message: error?.message });
    // LOG: error stack (short)
    elog("auth.login:error_stack", error && error.stack ? error.stack.split('\n')[0] : String(error));
    next(error);
  }
};

// POST /api/auth/change-password  (auth required)
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.userId; // set by your auth middleware
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ status: "fail", message: "New password must be at least 8 characters." });
    }


    const user = await User.findById(userId).select("+password");
    if (!user) return res.status(404).json({ status: "fail", message: "User not found" });

    const ok = await bcrypt.compare(String(currentPassword || ""), user.password);
    if (!ok) return res.status(400).json({ status: "fail", message: "Current password is incorrect" });

    user.password = await bcrypt.hash(String(newPassword), 12);
    user.passwordMustChange = false;
    user.passwordChangedAt = new Date();
    await user.save();

    return res.status(200).json({ status: "success", message: "Password updated" });
  } catch (err) { next(err); }
};
// POST /api/auth/first-login-change-password
exports.firstLoginChangePassword = async (req, res, next) => {
  try {
    const { email, currentPassword, newPassword, confirmPassword } = req.body;

    if (!email || !currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ status: "fail", message: "Please provide all required fields." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ status: "fail", message: "New passwords do not match." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ status: "fail", message: "New password must be at least 8 characters." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail }).select("+password");

    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found." });
    }


    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: "fail", message: "Incorrect current password." });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordMustChange = false;
    user.passwordChangedAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      status: "success",
      message: "Password changed successfully.",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        accountId: user.accountId || null
      }
    });
  } catch (error) {
    next(error);
  }
};
// POST /api/auth/forgot
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    // don't reveal existence
    if (!user) return res.status(200).json({ status: "success", message: "If that email exists, a reset link has been sent." });

    const tokenRaw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");
    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.APP_BASE_URL || 'https://dozemate.com'}/reset-password/${tokenRaw}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset your Dozemate password',
      text: `Click the link to reset your password:\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>Click the link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`
    });

    return res.status(200).json({ status: "success", message: "If that email exists, a reset link has been sent." });
  } catch (err) { next(err); }
};

// POST /api/auth/reset/:token
exports.resetPassword = async (req, res, next) => {
  try {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() }
    }).select("+password");

    if (!user) return res.status(400).json({ status: "fail", message: "Token invalid or expired" });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ status: "fail", message: "New password must be at least 8 characters." });
    }

    user.password = await bcrypt.hash(String(newPassword), 12);
    user.passwordMustChange = false;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();

    return res.status(200).json({ status: "success", message: "Password has been reset." });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-mobile - Request 6-digit reset code (mobile app)
exports.forgotPasswordMobile = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: "fail", message: "Email is required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    // Only send code if email exists in database
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "Email address not found in our system."
      });
    }

    // Generate 6-digit code
    const resetCode = String(Math.floor(100000 + Math.random() * 900000)); // 100000-999999
    const codeExpires = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes

    // Store hashed code in database
    const codeHash = crypto.createHash("sha256").update(resetCode).digest("hex");
    user.passwordResetCode = codeHash;
    user.passwordResetCodeExpires = codeExpires;
    await user.save({ validateBeforeSave: false });

    // Send email with code
    await sendEmail({
      to: user.email,
      subject: 'Your Dozemate Password Reset Code',
      text: `Your password reset code is: ${resetCode}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Code</h2>
          <p>Your password reset code is:</p>
          <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0;">
            ${resetCode}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    });

    dbg("auth.forgotPasswordMobile:code_sent", { email: user.email, expiresAt: codeExpires });

    return res.status(200).json({
      status: "success",
      message: "A reset code has been sent to your email."
    });
  } catch (err) {
    elog("auth.forgotPasswordMobile:error", err?.message || err);
    next(err);
  }
};

// POST /api/auth/verify-reset-code - Verify 6-digit code (mobile app)
exports.verifyResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        status: "fail",
        message: "Email and code are required"
      });
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(String(code).trim())) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid code format. Code must be 6 digits."
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid code or code expired"
      });
    }

    // Check if code exists and hasn't expired
    if (!user.passwordResetCode || !user.passwordResetCodeExpires) {
      return res.status(400).json({
        status: "fail",
        message: "No reset code found. Please request a new code."
      });
    }

    if (user.passwordResetCodeExpires < new Date()) {
      // Clear expired code
      user.passwordResetCode = undefined;
      user.passwordResetCodeExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(400).json({
        status: "fail",
        message: "Code has expired. Please request a new code."
      });
    }

    // Verify code
    const codeHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    if (user.passwordResetCode !== codeHash) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid code"
      });
    }

    // Code is valid - return success (code remains valid for password reset step)
    dbg("auth.verifyResetCode:success", { email: user.email });

    return res.status(200).json({
      status: "success",
      message: "Code verified successfully"
    });
  } catch (err) {
    elog("auth.verifyResetCode:error", err?.message || err);
    next(err);
  }
};

// POST /api/auth/reset-password-mobile - Reset password with verified code (mobile app)
exports.resetPasswordMobile = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        status: "fail",
        message: "Email, code, and new password are required"
      });
    }

    // Validate password length
    if (newPassword.length < 8) {
      return res.status(400).json({
        status: "fail",
        message: "New password must be at least 8 characters."
      });
    }

    // Validate code format
    if (!/^\d{6}$/.test(String(code).trim())) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid code format."
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid code or code expired"
      });
    }

    // Verify code
    if (!user.passwordResetCode || !user.passwordResetCodeExpires) {
      return res.status(400).json({
        status: "fail",
        message: "No reset code found. Please request a new code."
      });
    }

    if (user.passwordResetCodeExpires < new Date()) {
      // Clear expired code
      user.passwordResetCode = undefined;
      user.passwordResetCodeExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(400).json({
        status: "fail",
        message: "Code has expired. Please request a new code."
      });
    }

    const codeHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    if (user.passwordResetCode !== codeHash) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid code"
      });
    }

    // Code verified - reset password
    user.password = await bcrypt.hash(String(newPassword), 12);
    user.passwordMustChange = false;
    user.passwordResetCode = undefined;
    user.passwordResetCodeExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();

    dbg("auth.resetPasswordMobile:success", { email: user.email });

    // Generate JWT token for auto-login
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      status: "success",
      message: "Password has been reset successfully.",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        accountId: user.accountId || null
      }
    });
  } catch (err) {
    elog("auth.resetPasswordMobile:error", err?.message || err);
    next(err);
  }
};

// POST /api/auth/google-idtoken (mobile app: send Google idToken, get JWT + user)
exports.googleIdToken = async (req, res, next) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ status: "fail", message: "Missing or invalid idToken" });
    }

    const audience = process.env.OAUTH_GOOGLE_CLIENT_ID;
    if (!audience) {
      elog("googleIdToken: OAUTH_GOOGLE_CLIENT_ID not set");
      return res.status(500).json({ status: "fail", message: "Server misconfiguration" });
    }

    const ticket = await gClient.verifyIdToken({
      idToken: idToken.trim(),
      audience,
    });
    const p = ticket.getPayload();
    if (!p || !p.email) {
      return res.status(400).json({ status: "fail", message: "Invalid token payload" });
    }

    let user = await User.findOne({
      $or: [
        { email: p.email },
        { "oauth.provider": "google", "oauth.providerId": p.sub },
      ],
    });

    if (!user) {
      const acctId = await allocAccountId();
      const accountDoc = await Account.create({
        accountId: acctId,
        primaryEmail: p.email,
        userProfiles: [],
        defaultUser: null,
      });

      user = await User.create({
        email: p.email,
        name: p.name || p.email.split("@")[0],
        profileImage: p.picture || undefined,
        role: "user",
        oauth: [{ provider: "google", providerId: p.sub, email: p.email }],
        account: accountDoc._id,
        accountId: accountDoc.accountId,
        userId: `${accountDoc.accountId}a`,
        isDefaultProfile: true,
        isVerified: true,
      });

      await Account.updateOne(
        { _id: accountDoc._id },
        { $push: { userProfiles: user._id }, $set: { defaultUser: user._id } }
      );
      log("googleIdToken: created user", { email: user.email, accountId: accountDoc.accountId });
    } else {
      if (!user.oauth || !user.oauth.some((o) => o.provider === "google" && o.providerId === p.sub)) {
        await User.updateOne(
          { _id: user._id },
          { $push: { oauth: { provider: "google", providerId: p.sub, email: p.email } } }
        );
      }
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      status: "success",
      message: "Signed in with Google",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountId: user.accountId || null,
      },
    });
  } catch (err) {
    elog("googleIdToken:error", err?.message || err);
    if (err.message && err.message.includes("Token used too late")) {
      return res.status(400).json({ status: "fail", message: "Session expired. Please sign in again." });
    }
    next(err);
  }
};

// POST /api/auth/apple-idtoken
exports.appleIdToken = async (req, res, next) => {
  try {
    const { identityToken, fullName } = req.body || {};
    if (!identityToken || typeof identityToken !== 'string') {
      return res.status(400).json({ status: "fail", message: "Missing or invalid identityToken" });
    }

    const bundleId = 'com.slimiot.dozemate1';

    // Verify the Apple identity token
    let payload;
    try {
      payload = await appleSignin.verifyIdToken(identityToken, {
        audience: bundleId,
        ignoreExpiration: false,
      });
    } catch (verifyErr) {
      elog("appleIdToken: verification failed", verifyErr?.message || verifyErr);
      return res.status(400).json({ status: "fail", message: "Invalid Apple token" });
    }

    if (!payload || !payload.sub) {
      return res.status(400).json({ status: "fail", message: "Invalid token payload" });
    }

    const appleUserId = payload.sub;
    const appleEmail = payload.email || null;

    // Apple only sends the name on the FIRST sign-in; the client passes it as fullName
    const appleName = fullName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
      : null;

    // Find user by Apple OAuth ID or by email
    let user = await User.findOne({
      $or: [
        { "oauth.provider": "apple", "oauth.providerId": appleUserId },
        ...(appleEmail ? [{ email: appleEmail }] : []),
      ],
    });

    if (!user) {
      // Create new account + user (same pattern as Google)
      const email = appleEmail || `apple_${appleUserId}@privaterelay.appleid.com`;
      const name = appleName || (appleEmail ? appleEmail.split('@')[0] : 'Apple User');

      const acctId = await allocAccountId();
      const accountDoc = await Account.create({
        accountId: acctId,
        primaryEmail: email,
        userProfiles: [],
        defaultUser: null,
      });

      user = await User.create({
        email,
        name,
        role: "user",
        oauth: [{ provider: "apple", providerId: appleUserId, email }],
        account: accountDoc._id,
        accountId: accountDoc.accountId,
        userId: `${accountDoc.accountId}a`,
        isDefaultProfile: true,
        isVerified: true,
      });

      await Account.updateOne(
        { _id: accountDoc._id },
        { $push: { userProfiles: user._id }, $set: { defaultUser: user._id } }
      );
      log("appleIdToken: created user", { email: user.email, accountId: accountDoc.accountId });
    } else {
      // Link Apple OAuth if not already linked
      if (!user.oauth || !user.oauth.some((o) => o.provider === "apple" && o.providerId === appleUserId)) {
        await User.updateOne(
          { _id: user._id },
          { $push: { oauth: { provider: "apple", providerId: appleUserId, email: appleEmail || user.email } } }
        );
      }
      // Update name if we received it and user doesn't have one set properly
      if (appleName && (!user.name || user.name === 'Apple User')) {
        await User.updateOne({ _id: user._id }, { $set: { name: appleName } });
        user.name = appleName;
      }
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      status: "success",
      message: "Signed in with Apple",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountId: user.accountId || null,
      },
    });
  } catch (err) {
    elog("appleIdToken:error", err?.message || err);
    next(err);
  }
};

// GET /api/auth/google
exports.googleAuth = (req, res) => {
  const url = gClient.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    prompt: "consent",
  });
  return res.redirect(url);
};

// GET /api/auth/google/callback
exports.googleCallback = async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ status: "fail", message: "Missing code" });

    // 1) Exchange code
    const { tokens } = await gClient.getToken({ code });
    if (!tokens.id_token) throw new Error("No id_token from Google");

    const ticket = await gClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.OAUTH_GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload(); // {sub, email, name, picture}

    // 2) Find or create user
    let user = await User.findOne({ email: p.email });
    if (!user) {

      // ---- create Account first ----
      const acctId = await allocAccountId();
      const accountDoc = await Account.create({
        accountId: acctId,
        primaryEmail: p.email,
        userProfiles: [],
        defaultUser: null,
      });

      // ---- then create User linked to Account ----
      user = await User.create({
        email: p.email,
        name: p.name,
        profileImage: p.picture,
        role: "user",
        oauth: [{ provider: "google", providerId: p.sub, email: p.email }],
        account: accountDoc._id,
        accountId: accountDoc.accountId,
        userId: `${accountDoc.accountId}a`,
        isDefaultProfile: true,
        isVerified: false
      });

      // link back defaultUser
      await Account.updateOne(
        { _id: accountDoc._id },
        { $push: { userProfiles: user._id }, $set: { defaultUser: user._id } }
      );

      console.info("[google-oauth] Created Account  User", {
        email: user.email,
        accountId: accountDoc.accountId,
        userId: user.userId
      });

    }

    // 3) JWT
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    // 4) Redirect back to frontend

    res.cookie("auth_token", token, {
      httpOnly: false,     // set to true if you want it inaccessible to JS
      secure: !IS_LOCAL_APP,
      sameSite: "lax",
    });
    return res.redirect(`${APP_BASE_URL}/admin/oauth/success`);

  } catch (err) {
    next(err);
  }
};

// GET /api/auth/verify/:token
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    console.log("👉 Full incoming token (length):", token?.length);
    console.log("👉 First 40 chars:", token?.slice(0, 40));
    console.log("👉 Last 40 chars :", token?.slice(-40));

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);   // don’t redeclare with `const`
      console.log("✅ Decoded:", decoded);
    } catch (err) {
      console.error("❌ JWT verify failed:", err.message);
      return res.status(401).send("Unauthorized1: " + err.message);
    }

    const user = await User.findById(new mongoose.Types.ObjectId(decoded.userId));
    console.log("👉 DB User found:", !!user);

    if (!user) {
      return res.status(400).json({ status: "fail", message: "Invalid token (user not found)" });
    }

    if (user.isVerified) {
      console.log("⚠️ Already verified");
      return res.redirect(`${process.env.APP_BASE_URL}/login?verified=1`);
    }

    user.isVerified = true;
    await user.save();
    console.log("✅ User verified and saved");

    return res.redirect(`${process.env.APP_BASE_URL}/login?verified=1`);
  } catch (err) {
    console.error("❌ verifyEmail error:", err.message);
    return res.redirect(`${process.env.APP_BASE_URL}/login?verified=0`);
  }
};
