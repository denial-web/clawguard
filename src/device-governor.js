import { randomUUID } from "node:crypto";

export const deviceClasses = new Set([
  "security-camera",
  "drone",
  "talking-robot-toy",
  "mobile-robot",
  "embedded-iot",
  "industrial-ot"
]);

export const deviceActionClasses = new Set([
  "observe-device",
  "analyze-media-local",
  "draft-plan",
  "recommend-action",
  "record-media",
  "send-external",
  "ptz-control",
  "speak-or-display",
  "move-ground-robot",
  "firmware-update",
  "drone-arm",
  "drone-takeoff",
  "disable-safety",
  "weaponize-or-harm"
]);

export const deviceDataClasses = new Set([
  "public",
  "internal",
  "telemetry",
  "private-space",
  "video-audio",
  "child-data",
  "location",
  "credentials",
  "firmware",
  "safety-critical"
]);

const allowActions = new Set(["observe-device", "analyze-media-local", "draft-plan", "recommend-action"]);
const reviewActions = new Set(["record-media", "ptz-control", "speak-or-display", "move-ground-robot"]);
const dualApprovalActions = new Set(["firmware-update"]);
const blockedActions = new Set(["drone-arm", "drone-takeoff", "disable-safety", "weaponize-or-harm"]);
const sensitiveDataClasses = new Set(["private-space", "video-audio", "child-data", "location", "credentials", "firmware", "safety-critical"]);

export function createDevicePlan(options = {}) {
  const deviceClass = normalizeDeviceClass(options.deviceClass ?? inferDeviceClass(options));
  const action = normalizeDeviceAction(options.action ?? inferDeviceAction(options));
  const dataClass = normalizeDeviceDataClass(options.dataClass ?? inferDeviceDataClass({ deviceClass, action }));
  const actor = options.actor ?? "local-user";
  const checker = options.checker;
  const evidence = normalizeEvidence(options);
  const decision = decideDeviceAction({ deviceClass, action, dataClass, actor, checker });
  const missingEvidence = missingEvidenceFor({ deviceClass, action, dataClass, evidence });
  const requiredActions = requiredActionsFor({ decision, deviceClass, action, dataClass, missingEvidence });

  return {
    schemaVersion: "clawguard.devicePlan.v1",
    id: options.id ?? randomUUID(),
    createdAt: new Date().toISOString(),
    decision,
    reason: reasonFor({ decision, deviceClass, action, dataClass, actor, checker }),
    requiredActions,
    missingEvidence,
    device: {
      class: deviceClass,
      action,
      dataClass,
      environment: options.environment ?? "unknown",
      target: options.target,
      task: options.task
    },
    actor: {
      name: actor,
      role: options.role
    },
    approvalChain: {
      maker: actor,
      checker,
      segregationOfDuties: checker ? checker !== actor : undefined
    },
    evidence,
    policy: {
      preset: options.profile ?? "physical-device-mvp",
      mode: "dry-run",
      nonGoals: [
        "No direct physical device control in the MVP.",
        "No autonomous drone arm, takeoff, offboard control, or safety bypass.",
        "No hidden recording, secret exfiltration, or child-facing behavior without owner controls."
      ]
    }
  };
}

export function deviceDecisionExitCode(decision) {
  if (decision === "block") return 2;
  if (["manual_review", "dual_approval"].includes(decision)) return 1;
  return 0;
}

export function normalizeDeviceClass(deviceClass) {
  const normalized = String(deviceClass ?? "").trim().toLowerCase();

  if (!deviceClasses.has(normalized)) {
    throw new Error(`Invalid device class. Use one of: ${[...deviceClasses].join(", ")}`);
  }

  return normalized;
}

export function normalizeDeviceAction(action) {
  const normalized = String(action ?? "").trim().toLowerCase();

  if (!deviceActionClasses.has(normalized)) {
    throw new Error(`Invalid device action. Use one of: ${[...deviceActionClasses].join(", ")}`);
  }

  return normalized;
}

export function normalizeDeviceDataClass(dataClass) {
  const normalized = String(dataClass ?? "").trim().toLowerCase();

  if (!deviceDataClasses.has(normalized)) {
    throw new Error(`Invalid device data class. Use one of: ${[...deviceDataClasses].join(", ")}`);
  }

  return normalized;
}

function inferDeviceClass(options) {
  const text = [options.task, options.target, options.action].filter(Boolean).join(" ").toLowerCase();

  if (/\b(drone|uav|px4|ardupilot|mavlink|mavsdk|takeoff|geofence)\b/.test(text)) return "drone";
  if (/\b(camera|nvr|rtsp|onvif|frigate|zoneminder|ptz)\b/.test(text)) return "security-camera";
  if (/\b(toy|tts|wake word|wake-word|speaker|child|servo)\b/.test(text)) return "talking-robot-toy";
  if (/\b(ros|turtlebot|robot|navigation|wheel|lidar)\b/.test(text)) return "mobile-robot";
  if (/\b(esp32|stm32|arduino|firmware|gpio|relay|mqtt)\b/.test(text)) return "embedded-iot";
  return "embedded-iot";
}

function inferDeviceAction(options) {
  const text = [options.task, options.target].filter(Boolean).join(" ").toLowerCase();

  if (/\b(disable|bypass|turn off)\b[\s\S]{0,60}\b(geofence|failsafe|remote id|remote-id|watchdog|safety)\b/.test(text)) return "disable-safety";
  if (/\b(weapon|payload|strike|attack|pursue|harm)\b/.test(text)) return "weaponize-or-harm";
  if (/\b(takeoff|take off|offboard|land)\b/.test(text)) return "drone-takeoff";
  if (/\b(arm motors?|arming)\b/.test(text)) return "drone-arm";
  if (/\b(flash|firmware|ota|bootloader)\b/.test(text)) return "firmware-update";
  if (/\b(move|drive|navigate|servo|motor|wheel)\b/.test(text)) return "move-ground-robot";
  if (/\b(record|retention|export clip|save video)\b/.test(text)) return "record-media";
  if (/\b(upload|send|cloud|external)\b/.test(text)) return "send-external";
  if (/\b(ptz|pan|tilt|zoom)\b/.test(text)) return "ptz-control";
  if (/\b(speak|say|display|tts)\b/.test(text)) return "speak-or-display";
  if (/\b(analyze|detect|classify|transcribe)\b/.test(text)) return "analyze-media-local";
  return "draft-plan";
}

function inferDeviceDataClass({ deviceClass, action }) {
  if (deviceClass === "security-camera") return "video-audio";
  if (deviceClass === "talking-robot-toy") return "child-data";
  if (deviceClass === "drone") return "location";
  if (action === "firmware-update") return "firmware";
  return "telemetry";
}

function normalizeEvidence(options) {
  return {
    simulationEvidence: options.simulationEvidence,
    operatorApproval: options.operatorApproval,
    geofence: Boolean(options.geofence),
    failsafe: Boolean(options.failsafe),
    manualOverride: Boolean(options.manualOverride),
    emergencyStop: Boolean(options.emergencyStop),
    remoteId: Boolean(options.remoteId),
    rollbackPlan: options.rollbackPlan,
    privacyReview: options.privacyReview,
    retentionPolicy: options.retentionPolicy
  };
}

function decideDeviceAction({ action, dataClass, actor, checker }) {
  if (checker && checker === actor && (dualApprovalActions.has(action) || sensitiveDataClasses.has(dataClass))) {
    return "block";
  }

  if (blockedActions.has(action)) {
    return "block";
  }

  if (action === "send-external" && sensitiveDataClasses.has(dataClass)) {
    return "dual_approval";
  }

  if (dualApprovalActions.has(action)) {
    return "dual_approval";
  }

  if (reviewActions.has(action)) {
    return "manual_review";
  }

  if (allowActions.has(action)) {
    return "allow";
  }

  return "manual_review";
}

function missingEvidenceFor({ deviceClass, action, dataClass, evidence }) {
  const required = [];

  if (["drone-arm", "drone-takeoff", "move-ground-robot"].includes(action)) {
    required.push(["simulation-evidence", evidence.simulationEvidence, "Simulation evidence is required before real-world movement."]);
    required.push(["manual-override", evidence.manualOverride, "Manual override must be available before movement."]);
    required.push(["emergency-stop", evidence.emergencyStop, "Emergency stop must be tested before movement."]);
    required.push(["operator-approval", evidence.operatorApproval, "A responsible operator must approve physical movement."]);
  }

  if (deviceClass === "drone" || ["drone-arm", "drone-takeoff"].includes(action)) {
    required.push(["geofence", evidence.geofence, "Drone plans require geofence evidence."]);
    required.push(["failsafe", evidence.failsafe, "Drone plans require failsafe evidence."]);
    required.push(["remote-id", evidence.remoteId, "Drone plans should include Remote ID or local compliance evidence where applicable."]);
  }

  if (action === "firmware-update") {
    required.push(["rollback-plan", evidence.rollbackPlan, "Firmware updates require a rollback plan."]);
    required.push(["operator-approval", evidence.operatorApproval, "Firmware updates require authorized operator approval."]);
  }

  if (["record-media", "send-external", "ptz-control"].includes(action) || ["private-space", "video-audio", "child-data"].includes(dataClass)) {
    required.push(["privacy-review", evidence.privacyReview, "Camera, audio, child, or private-space workflows require privacy review."]);
  }

  if (action === "record-media") {
    required.push(["retention-policy", evidence.retentionPolicy, "Recording workflows require a retention policy."]);
  }

  return required
    .filter(([, present]) => !present)
    .map(([id, , recommendation]) => ({ id, recommendation }));
}

function requiredActionsFor({ decision, deviceClass, action, dataClass, missingEvidence }) {
  const actions = [];

  if (["manual_review", "dual_approval", "block"].includes(decision)) actions.push("human-review");
  if (decision === "dual_approval") actions.push("maker-checker-approval");
  if (decision === "block") actions.push("do-not-execute");

  if (missingEvidence.length > 0) actions.push("collect-device-safety-evidence");
  if (deviceClass === "drone") actions.push("verify-aviation-compliance");
  if (["private-space", "video-audio", "child-data"].includes(dataClass)) actions.push("privacy-review");
  if (action === "firmware-update") actions.push("prepare-firmware-rollback");
  if (["drone-arm", "drone-takeoff", "move-ground-robot"].includes(action)) actions.push("simulation-before-actuation");

  return [...new Set(actions)];
}

function reasonFor({ decision, deviceClass, action, dataClass, actor, checker }) {
  if (decision === "block" && checker && checker === actor) {
    return "Sensitive physical-device actions cannot be approved by the same maker/checker.";
  }

  if (action === "disable-safety") {
    return "Disabling geofence, failsafe, Remote ID, watchdog, or safety controls is blocked.";
  }

  if (action === "weaponize-or-harm") {
    return "Weaponized, harmful, or pursuit behavior is blocked.";
  }

  if (["drone-arm", "drone-takeoff"].includes(action)) {
    return "Real drone arm, takeoff, landing, and offboard control are blocked in the physical-device MVP.";
  }

  if (action === "send-external" && sensitiveDataClasses.has(dataClass)) {
    return "Sending sensitive device data outside the local environment requires dual approval.";
  }

  if (action === "firmware-update") {
    return "Firmware updates require dual approval and a rollback plan.";
  }

  if (decision === "manual_review") {
    return "This physical-device action may affect privacy, motion, recording, speech, or device state and needs review.";
  }

  return `Low-risk ${deviceClass} planning or observation is allowed by the physical-device MVP.`;
}
