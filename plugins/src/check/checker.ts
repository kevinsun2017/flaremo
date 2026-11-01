export type CheckSeverity = "error" | "warning";

export type CheckIssue = {
  severity: CheckSeverity;
  code: string;
  message: string;
  where?: string;
};

export class Checker {
  readonly issues: CheckIssue[] = [];

  error(code: string, message: string, where?: string): void {
    this.issues.push({ severity: "error", code, message, where });
  }

  warn(code: string, message: string, where?: string): void {
    this.issues.push({ severity: "warning", code, message, where });
  }

  /** Resolve a package-relative path against the directory of `fromFile`. */
  resolveFrom(fromFile: string, reference: string): string | null {
    const segments = fromFile.split("/").slice(0, -1);
    for (const part of reference.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (segments.length === 0) return null;
        segments.pop();
        continue;
      }
      segments.push(part);
    }
    return segments.join("/");
  }
}
