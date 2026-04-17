import { Client } from "ldapts";

import type { SessionUser } from "src/lib/auth-session";

type SearchEntry = Record<string, unknown> & { dn?: string };

const DEFAULT_SEARCH_FILTER =
  "(|(uid={{login}})(mail={{login}})(sAMAccountName={{login}})(userPrincipalName={{login}}))";

function envValue(key: string): string | null {
  const value = process.env[key]?.trim();
  return value ? value : null;
}

function requireEnv(key: string): string {
  const value = envValue(key);
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

function parseBoolean(value: string | null, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function escapeFilterValue(value: string): string {
  return value.replace(/[\0()*\\]/g, (char) => {
    switch (char) {
      case "\\":
        return "\\5c";
      case "*":
        return "\\2a";
      case "(":
        return "\\28";
      case ")":
        return "\\29";
      case "\0":
        return "\\00";
      default:
        return char;
    }
  });
}

function buildSearchFilter(login: string): string {
  const template = envValue("LDAP_USER_SEARCH_FILTER") || DEFAULT_SEARCH_FILTER;
  return template.replace(/{{login}}/g, escapeFilterValue(login));
}

function attributeValues(entry: SearchEntry, attribute: string): string[] {
  const value = entry[attribute];
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (value == null) {
    return [];
  }
  return [String(value)];
}

function firstAttribute(entry: SearchEntry, names: string[]): string | null {
  for (const name of names) {
    const [first] = attributeValues(entry, name);
    if (first) {
      return first;
    }
  }
  return null;
}

function normalizeGroups(entry: SearchEntry): string[] {
  const attribute = envValue("LDAP_GROUP_ATTRIBUTE") || "memberOf";
  return attributeValues(entry, attribute);
}

function normalizeAllowedGroups(): string[] {
  const raw = envValue("LDAP_ALLOWED_GROUPS");
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAllowedGroup(groups: string[], allowed: string[]): boolean {
  if (allowed.length === 0) {
    return true;
  }
  const normalizedGroups = groups.map((group) => group.trim().toLowerCase());
  return normalizedGroups.some((group) => {
    const shortName = group.startsWith("cn=") ? group.split(",")[0].slice(3) : group;
    return allowed.includes(group) || allowed.includes(shortName);
  });
}

function buildClient(): Client {
  const url = requireEnv("LDAP_URL");
  const clientOptions: ConstructorParameters<typeof Client>[0] = {
    url,
    timeout: Number(envValue("LDAP_TIMEOUT_MS") || "10000"),
    connectTimeout: Number(envValue("LDAP_CONNECT_TIMEOUT_MS") || "10000"),
  };
  if (url.toLowerCase().startsWith("ldaps://")) {
    clientOptions.tlsOptions = {
      rejectUnauthorized: !parseBoolean(envValue("LDAP_INSECURE_SKIP_VERIFY")),
    };
  }
  return new Client(clientOptions);
}

async function searchForUser(
  client: Client,
  login: string
): Promise<{ dn: string; entry: SearchEntry }> {
  const searchBase = requireEnv("LDAP_USER_SEARCH_BASE");
  const filter = buildSearchFilter(login);
  const attributes = [
    envValue("LDAP_USERNAME_ATTRIBUTE") || "sAMAccountName",
    envValue("LDAP_EMAIL_ATTRIBUTE") || "mail",
    envValue("LDAP_DISPLAY_NAME_ATTRIBUTE") || "displayName",
    envValue("LDAP_GROUP_ATTRIBUTE") || "memberOf",
    "cn",
    "displayName",
    "mail",
    "uid",
    "sAMAccountName",
    "userPrincipalName",
    "memberOf",
  ];

  const { searchEntries } = await client.search(searchBase, {
    scope: "sub",
    filter,
    sizeLimit: 2,
    attributes: Array.from(new Set(attributes)),
  });

  if (searchEntries.length === 0) {
    throw new Error("Invalid username or password");
  }
  if (searchEntries.length > 1) {
    throw new Error("LDAP search returned multiple users");
  }
  const entry = searchEntries[0] as SearchEntry;
  const dn = entry.dn ? String(entry.dn) : "";
  if (!dn) {
    throw new Error("LDAP search did not return a user DN");
  }
  return { dn, entry };
}

function buildUserFromEntry(entry: SearchEntry, dn: string, login: string): SessionUser {
  const username =
    firstAttribute(entry, [
      envValue("LDAP_USERNAME_ATTRIBUTE") || "sAMAccountName",
      "uid",
      "userPrincipalName",
      "cn",
    ]) || login;
  const name =
    firstAttribute(entry, [
      envValue("LDAP_DISPLAY_NAME_ATTRIBUTE") || "displayName",
      "cn",
      "name",
    ]) || username;
  const email =
    firstAttribute(entry, [envValue("LDAP_EMAIL_ATTRIBUTE") || "mail", "userPrincipalName"]) ||
    undefined;
  const groups = normalizeGroups(entry);
  return {
    sub: `ldap:${dn}`,
    username,
    name,
    email,
    groups,
  };
}

export async function authenticateWithLdap(
  login: string,
  password: string
): Promise<SessionUser> {
  const trimmedLogin = login.trim();
  const trimmedPassword = password.trim();
  if (!trimmedLogin || !trimmedPassword) {
    throw new Error("Username and password are required");
  }

  const client = buildClient();
  try {
    const serviceBindDn = envValue("LDAP_BIND_DN");
    const serviceBindPassword = envValue("LDAP_BIND_PASSWORD");
    if (serviceBindDn && serviceBindPassword) {
      await client.bind(serviceBindDn, serviceBindPassword);
    }

    const { dn, entry } = await searchForUser(client, trimmedLogin);
    await client.bind(dn, trimmedPassword);

    const user = buildUserFromEntry(entry, dn, trimmedLogin);
    const allowedGroups = normalizeAllowedGroups();
    if (!matchesAllowedGroup(user.groups, allowedGroups)) {
      throw new Error("User is not a member of an allowed LDAP group");
    }
    return user;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
