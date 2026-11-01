import { apiRequest } from "./client";
import type { AppInfo, BootstrapStatus, RegistrationStatus } from "./types";

export async function getAppInfo() {
  return apiRequest<AppInfo>("/api/app/health");
}

export async function getBootstrapStatus() {
  return apiRequest<BootstrapStatus>(
    "/api/auth/flaremo/bootstrap/status",
    {},
    {
      authRequired: false,
    },
  );
}

export async function getRegistrationStatus() {
  return apiRequest<RegistrationStatus>(
    "/api/auth/flaremo/register/status",
    {},
    { authRequired: false },
  );
}

export async function registerAccount(
  input: {
    name: string;
    email: string;
    password: string;
  },
  captcha?: { ticket: string; randstr: string },
) {
  return apiRequest<{ ok: true }>(
    "/api/auth/flaremo/register",
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: captcha
        ? {
            "x-flaremo-captcha-ticket": captcha.ticket,
            "x-flaremo-captcha-randstr": captcha.randstr,
          }
        : undefined,
    },
    { authRequired: false },
  );
}

export async function verifyEmail(token: string) {
  return apiRequest<{ ok: true }>(
    `/api/auth/flaremo/verify-email?token=${encodeURIComponent(token)}`,
    {},
    { authRequired: false },
  );
}

export async function resendVerificationEmail(email: string) {
  return apiRequest<{ ok: true }>(
    "/api/auth/flaremo/resend-verification",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
    { authRequired: false },
  );
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ ok: true }>(
    "/api/auth/flaremo/forgot-password",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
    { authRequired: false },
  );
}

export async function verifyEmailChange(token: string) {
  return apiRequest<{ ok: true }>(
    `/api/auth/flaremo/verify-email-change?token=${encodeURIComponent(token)}`,
    {},
    { authRequired: false },
  );
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}) {
  return apiRequest<{ status: boolean }>(
    "/api/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify({
        newPassword: input.newPassword,
        token: input.token,
      }),
    },
    { authRequired: false },
  );
}

export async function recoverOwner(input: {
  newPassword: string;
  recoverySecret: string;
}) {
  return apiRequest<{ ok: true }>(
    "/api/auth/flaremo/recover",
    {
      method: "POST",
      headers: {
        "x-flaremo-recovery-secret": input.recoverySecret,
      },
      body: JSON.stringify({ new_password: input.newPassword }),
    },
    { authRequired: false },
  );
}

export async function bootstrapOwner(input: {
  name: string;
  email: string;
  password: string;
  bootstrapSecret: string;
}) {
  return apiRequest<{ ok: true }>(
    "/api/auth/flaremo/bootstrap",
    {
      method: "POST",
      headers: {
        "x-flaremo-bootstrap-secret": input.bootstrapSecret,
      },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        password: input.password,
      }),
    },
    { authRequired: false },
  );
}
