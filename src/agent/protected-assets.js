import path from "node:path";
import { relativeToWorkspace } from "./paths.js";

export const protectedAssetTypes = new Set(["database", "system", "customer_data", "secret", "backup", "custom"]);
export const protectedAssetDecisions = new Set(["approval_required", "block"]);
export const protectedAssetOperations = new Set(["read", "write", "execute", "cleanup"]);

export const defaultProtectedAssetPatterns = [
  ".env*",
  "secrets/**",
  "credentials/**",
  "data/**",
  "database/**",
  "db/**",
  "backup/**",
  "backups/**",
  "*.db",
  "*.sqlite",
  "*.sqlite3",
  "*.sql",
  "*.dump",
  "*.bak"
];

export function inspectProtectedPath(workspace, target, operation, protectedAssetsConfig = {}) {
  const config = normalizeProtectedAssetsConfig(protectedAssetsConfig);
  if (!config.enabled || !protectedAssetOperations.has(operation)) {
    return {
      protected: false,
      operation,
      matches: [],
      decision: "allow",
      risk: "low"
    };
  }

  const relativePath = normalizeRelativePath(relativeToWorkspace(workspace, target));
  const matches = [];

  if (config.defaultPatterns) {
    for (const pattern of defaultProtectedAssetPatterns) {
      if (matchesPattern(relativePath, pattern)) {
        matches.push({
          id: `default:${pattern}`,
          type: inferTypeForPattern(pattern),
          path: pattern,
          operations: [...protectedAssetOperations],
          decision: "approval_required",
          reason: `Matched default protected asset pattern ${pattern}.`
        });
      }
    }
  }

  for (const asset of config.assets) {
    if (!asset.operations.includes(operation)) {
      continue;
    }

    if (matchesPattern(relativePath, asset.path)) {
      matches.push(asset);
    }
  }

  if (matches.length === 0) {
    return {
      protected: false,
      operation,
      path: relativePath,
      matches,
      decision: "allow",
      risk: "low"
    };
  }

  const hasBlock = matches.some((match) => match.decision === "block");
  const risk = matches.some((match) => ["database", "system", "customer_data", "secret"].includes(match.type)) ? "critical" : "high";

  return {
    protected: true,
    operation,
    path: relativePath,
    matches,
    decision: hasBlock ? "block" : "approval_required",
    risk,
    reason: protectedAssetReason(matches, operation)
  };
}

export function inspectProtectedShellArgv(argv, protectedAssetsConfig = {}) {
  const config = normalizeProtectedAssetsConfig(protectedAssetsConfig);
  if (!config.enabled) {
    return {
      protected: false,
      decision: "allow",
      risk: "low",
      reason: null,
      matches: []
    };
  }

  const commandName = path.basename(argv[0] ?? "").toLowerCase();
  const normalized = argv.join(" ").toLowerCase();
  const matches = [];

  if (matchesDatabaseDestructiveCommand(commandName, normalized)) {
    matches.push({
      id: "command:database-destructive",
      type: "database",
      decision: "approval_required",
      reason: "Database destructive command detected."
    });
  }

  if (matchesSystemDestructiveCommand(commandName, argv)) {
    matches.push({
      id: "command:system-destructive",
      type: "system",
      decision: "approval_required",
      reason: "System or remote data deletion command detected."
    });
  }

  if (matchesInlineInterpreterDeletion(commandName, argv)) {
    matches.push({
      id: "command:inline-delete",
      type: "system",
      decision: "block",
      reason: "Inline interpreter deletion/drop command detected."
    });
  }

  if (matches.length === 0) {
    return {
      protected: false,
      decision: "allow",
      risk: "low",
      reason: null,
      matches
    };
  }

  const hasBlock = matches.some((match) => match.decision === "block");
  return {
    protected: true,
    decision: hasBlock ? "block" : "approval_required",
    risk: "critical",
    reason: matches.map((match) => match.reason).join(" "),
    matches
  };
}

export function normalizeProtectedAssetsConfig(value = {}) {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: config.enabled !== false,
    defaultPatterns: config.defaultPatterns !== false,
    assets: Array.isArray(config.assets) ? config.assets.map(normalizeProtectedAsset).filter(Boolean) : []
  };
}

export function normalizeProtectedAsset(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    return null;
  }

  const id = nonEmptyString(asset.id) ?? `asset:${nonEmptyString(asset.path) ?? "unknown"}`;
  const type = protectedAssetTypes.has(asset.type) ? asset.type : "custom";
  const assetPath = nonEmptyString(asset.path);
  if (!assetPath) {
    return null;
  }

  const operations = Array.isArray(asset.operations)
    ? asset.operations.filter((operation) => protectedAssetOperations.has(operation))
    : [...protectedAssetOperations];

  return {
    id,
    type,
    path: normalizeRelativePath(assetPath),
    operations: operations.length > 0 ? [...new Set(operations)] : [...protectedAssetOperations],
    decision: protectedAssetDecisions.has(asset.decision) ? asset.decision : "approval_required",
    reason: nonEmptyString(asset.reason) ?? "Protected asset configured by workspace policy."
  };
}

function matchesDatabaseDestructiveCommand(commandName, normalized) {
  if (/\b(drop\s+database|drop\s+schema|truncate\s+(table\s+)?|delete\s+from)\b/.test(normalized)) {
    return true;
  }

  if (/\b(db:drop|migrate\s+reset|supabase\s+db\s+reset)\b/.test(normalized)) {
    return true;
  }

  return ["psql", "mysql", "mariadb", "sqlite3", "supabase"].includes(commandName)
    && /\b(drop|truncate|delete\s+from|reset)\b/.test(normalized);
}

function matchesSystemDestructiveCommand(commandName, argv) {
  const args = argv.map((item) => item.toLowerCase());
  if (commandName === "kubectl" && args.includes("delete")) {
    return true;
  }

  if (commandName === "aws" && args[1] === "s3" && args[2] === "rm") {
    return true;
  }

  if (commandName === "gsutil" && args.includes("rm")) {
    return true;
  }

  if (commandName === "rclone" && ["delete", "purge", "rmdirs"].includes(args[1])) {
    return true;
  }

  return false;
}

function matchesInlineInterpreterDeletion(commandName, argv) {
  const inlineFlags = new Set(["-e", "-c"]);
  if (!["node", "python", "python3", "ruby", "perl"].includes(commandName)) {
    return false;
  }

  const inlineScripts = [];
  for (let index = 1; index < argv.length; index += 1) {
    if (inlineFlags.has(argv[index]) && typeof argv[index + 1] === "string") {
      inlineScripts.push(argv[index + 1]);
    }
  }

  return inlineScripts.some((script) => /\b(drop\s+database|drop\s+schema|truncate|delete\s+from|rm\s+-|unlink|rmdir|rmSync|fs\.rm|fs\.unlink|fs\.rmdir)\b/i.test(script));
}

function protectedAssetReason(matches, operation) {
  const labels = matches.map((match) => `${match.id} (${match.type})`).join(", ");
  return `Protected asset ${operation} matched: ${labels}`;
}

function matchesPattern(relativePath, pattern) {
  const normalizedPattern = normalizeRelativePath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }

  if (normalizedPattern.includes("*")) {
    const matcher = globToRegExp(normalizedPattern);
    if (matcher.test(relativePath)) {
      return true;
    }
    if (!normalizedPattern.includes("/")) {
      return matcher.test(relativePath.split("/").at(-1) ?? "");
    }
    return false;
  }

  return relativePath === normalizedPattern || relativePath.startsWith(`${normalizedPattern}/`);
}

function globToRegExp(pattern) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${escaped}$`);
}

function inferTypeForPattern(pattern) {
  if (pattern.includes("env") || pattern.includes("secret") || pattern.includes("credential")) {
    return "secret";
  }

  if (pattern.includes("backup") || pattern.endsWith(".bak") || pattern.endsWith(".dump")) {
    return "backup";
  }

  if (pattern.includes("data") || pattern.includes("database") || pattern.includes("db") || /\.(db|sqlite3?|sql)$/.test(pattern)) {
    return "database";
  }

  return "custom";
}

function normalizeRelativePath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function nonEmptyString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
