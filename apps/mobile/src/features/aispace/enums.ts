// AISpace chat enums (feature-local; structure §3 → features/{…, enums}).

// Who authored a chat turn. A closed two-value set → enum (house style).
export enum ChatRole {
  User = "user",
  Agent = "agent",
}
