export interface ListIssuesArgs {
  teamId?: string;
  first?: number;
}

export interface IssueCreateArgs {
  title: string;
  description?: string;
  teamId: string;
  assigneeId?: string;
  priority?: number;
}

// Type guards
export function isValidListIssuesArgs(args: any): args is ListIssuesArgs {
  return (
    typeof args === "object" && 
    args !== null &&
    (!("teamId" in args) || typeof args.teamId === "string") &&
    (!("first" in args) || typeof args.first === "number")
  );
}

export function isValidIssueCreateArgs(args: any): args is IssueCreateArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "title" in args &&
    typeof args.title === "string" &&
    "teamId" in args &&
    typeof args.teamId === "string"
  );
}