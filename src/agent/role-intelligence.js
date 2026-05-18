import { promises as fs } from "node:fs";
import path from "node:path";
import { evaluateAsflcDecision } from "./asflc.js";

const rolePacksRoot = new URL("../../role-packs/", import.meta.url);

export const roleArtifactOrder = [
  "domain_frame",
  "purpose_and_risk",
  "role_vocabulary",
  "cadence_map",
  "decision_authority",
  "feedback_loop",
  "constraints"
];

export async function listRolePacks() {
  const packPaths = await findJsonFiles(rolePacksRoot);
  const packs = [];

  for (const packPath of packPaths) {
    const pack = await readRolePack(packPath);
    packs.push(summarizeRolePack(pack, packPath));
  }

  return packs.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadRolePack(roleId) {
  const normalizedId = normalizeRoleId(roleId);
  const packPaths = await findJsonFiles(rolePacksRoot);

  for (const packPath of packPaths) {
    const pack = await readRolePack(packPath);
    if (pack.id === normalizedId) {
      return {
        pack,
        path: packPath
      };
    }
  }

  throw new Error(`Unknown role pack: ${roleId}`);
}

export async function showRolePackCommand(options) {
  const { pack, path: packPath } = await loadRolePack(options.roleId);
  const artifacts = buildRoleArtifacts(pack);

  return {
    schemaVersion: "clawguard.roleShow.v1",
    pack: summarizeRolePack(pack, packPath),
    artifacts,
    actions: evaluateRoleActions(pack),
    validationQuestions: pack.validationQuestions ?? [],
    sources: pack.sources ?? []
  };
}

export async function runRoleCadenceCommand(options) {
  const { pack, path: packPath } = await loadRolePack(options.roleId);
  const cadenceKey = normalizeCadence(options.cadence ?? "daily");
  const cadenceTasks = pack.cadence?.[cadenceKey];

  if (!Array.isArray(cadenceTasks)) {
    throw new Error(`Role pack ${pack.id} does not define cadence: ${cadenceKey}`);
  }

  const actions = new Map(evaluateRoleActions(pack).map((action) => [action.id, action]));
  const tasks = cadenceTasks.map((task) => {
    const taskActions = (task.actionIds ?? []).map((id) => actions.get(id)).filter(Boolean);
    const route = strongestRoute(taskActions.map((action) => action.route));

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      cadence: cadenceKey,
      actionIds: task.actionIds ?? [],
      route,
      actions: taskActions,
      requiredAuthority: routeAuthority(route),
      verificationNeeded: taskActions.some((action) => action.verificationNeeded)
    };
  });

  return {
    schemaVersion: "clawguard.roleRun.v1",
    pack: summarizeRolePack(pack, packPath),
    cadence: cadenceKey,
    artifactsReady: roleArtifactOrder.every((id) => Boolean(pack.artifacts?.[id])),
    hardRule: "No task inventory is produced before decision_authority exists.",
    tasks,
    blockedActions: uniqueActionsById(tasks.flatMap((task) => task.actions.filter((action) => action.route === "BLOCK"))),
    approvalRequiredActions: uniqueActionsById(tasks.flatMap((task) => task.actions.filter((action) => action.route === "APPROVAL_REQUIRED"))),
    validationQuestions: pack.validationQuestions ?? [],
    sources: pack.sources ?? []
  };
}

export function evaluateRoleAction(pack, actionId) {
  const action = (pack.actions ?? []).find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error(`Unknown role action in ${pack.id}: ${actionId}`);
  }

  const decision = evaluateAsflcDecision({
    task: action.title,
    chains: action.asflcChains ?? [],
    route: action.route,
    riskFlags: action.riskFlags ?? []
  });

  return {
    id: action.id,
    title: action.title,
    description: action.description,
    route: decision.route,
    routeReason: decision.routeReason,
    riskFlags: decision.riskFlags,
    verificationNeeded: decision.verificationNeeded,
    approvalRequired: decision.approvalRequired,
    confidence: decision.confidence,
    asflc: {
      chosenAction: decision.chosenAction,
      breakdown: decision.breakdown,
      chains: decision.chains
    }
  };
}

export function evaluateRoleActions(pack) {
  return (pack.actions ?? []).map((action) => evaluateRoleAction(pack, action.id));
}

export function buildRoleArtifacts(pack) {
  return roleArtifactOrder.map((id) => {
    const artifact = pack.artifacts?.[id];
    return {
      id,
      fidelity: artifact?.fidelity ?? "assumed",
      content: artifact?.content ?? null
    };
  });
}

function summarizeRolePack(pack, packPath) {
  return {
    id: pack.id,
    title: pack.title,
    industry: pack.industry,
    role: pack.role,
    description: pack.description,
    artifactCount: roleArtifactOrder.filter((id) => Boolean(pack.artifacts?.[id])).length,
    actionCount: Array.isArray(pack.actions) ? pack.actions.length : 0,
    path: packPath
  };
}

async function readRolePack(packPath) {
  const text = await fs.readFile(packPath, "utf8");
  const pack = JSON.parse(text);
  validateRolePack(pack, packPath);
  return pack;
}

export function validateRolePack(pack, packPath = "role pack") {
  if (pack?.schemaVersion !== "clawguard.rolePack.v1") {
    throw new Error(`Invalid role pack schema in ${packPath}`);
  }

  for (const field of ["id", "title", "industry", "role"]) {
    if (!pack[field] || typeof pack[field] !== "string") {
      throw new Error(`Role pack ${packPath} is missing ${field}.`);
    }
  }

  if (!pack.artifacts || typeof pack.artifacts !== "object") {
    throw new Error(`Role pack ${packPath} must include artifacts.`);
  }

  const missingArtifact = roleArtifactOrder.find((id) => !pack.artifacts[id]);
  if (missingArtifact) {
    throw new Error(`Role pack ${packPath} is missing artifact ${missingArtifact}.`);
  }

  if (!Array.isArray(pack.actions)) {
    throw new Error(`Role pack ${packPath} must include actions array.`);
  }

  const actionIds = new Set();
  for (const action of pack.actions) {
    if (!action?.id || typeof action.id !== "string") {
      throw new Error(`Role pack ${packPath} includes an action without id.`);
    }

    if (actionIds.has(action.id)) {
      throw new Error(`Role pack ${packPath} includes duplicate action id: ${action.id}`);
    }
    actionIds.add(action.id);

    if (!Array.isArray(action.asflcChains) || action.asflcChains.length === 0) {
      throw new Error(`Role pack ${packPath} action ${action.id} must include asflcChains.`);
    }
  }

  for (const [cadence, tasks] of Object.entries(pack.cadence ?? {})) {
    if (!Array.isArray(tasks)) {
      throw new Error(`Role pack ${packPath} cadence ${cadence} must be an array.`);
    }

    for (const task of tasks) {
      for (const actionId of task.actionIds ?? []) {
        if (!actionIds.has(actionId)) {
          throw new Error(`Role pack ${packPath} task ${task.id} references unknown action: ${actionId}`);
        }
      }
    }
  }
}

async function findJsonFiles(rootUrl) {
  const rootPath = rootUrl.pathname;
  const files = [];

  await walk(rootPath, files);
  return files.filter((file) => file.endsWith(".json")).sort();
}

async function walk(directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

function normalizeRoleId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCadence(value) {
  const normalized = String(value ?? "daily").trim().toLowerCase();
  if (normalized === "event" || normalized === "event-driven") {
    return "eventDriven";
  }

  return normalized;
}

function strongestRoute(routes) {
  const order = ["LOCAL", "VERIFY_FIRST", "APPROVAL_REQUIRED", "ESCALATE", "BLOCK"];
  return routes.reduce((strongest, route) => (order.indexOf(route) > order.indexOf(strongest) ? route : strongest), "LOCAL");
}

function routeAuthority(route) {
  if (route === "BLOCK") {
    return "forbidden";
  }

  if (route === "ESCALATE") {
    return "owner_or_specialist";
  }

  if (route === "APPROVAL_REQUIRED") {
    return "manager_approval";
  }

  if (route === "VERIFY_FIRST") {
    return "verify_before_action";
  }

  return "role_can_prepare_locally";
}

function uniqueActionsById(actions) {
  const seen = new Set();
  const unique = [];

  for (const action of actions) {
    if (seen.has(action.id)) {
      continue;
    }

    seen.add(action.id);
    unique.push(action);
  }

  return unique;
}
